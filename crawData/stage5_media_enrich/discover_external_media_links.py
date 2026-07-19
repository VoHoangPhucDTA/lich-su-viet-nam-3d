#!/usr/bin/env python3
"""Discover metadata-only external image leads for Stage5 missing events.

This tool deliberately does not download image binaries. It may read HTML,
search result pages, official verification pages, and Wikimedia/MediaWiki JSON
metadata. The output is a manual download queue plus per-event instructions for
the reviewer.
"""
from __future__ import annotations

import argparse
import csv
import html
import json
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any


USER_AGENT = "Stage5ExternalMediaLinkDiscovery/1.0 (metadata only; no binary image download)"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
VIWIKI_API = "https://vi.wikipedia.org/w/api.php"
ENWIKI_API = "https://en.wikipedia.org/w/api.php"
DDG_HTML = "https://html.duckduckgo.com/html/"

ALLOWED_LICENSE_MARKERS = (
    "public domain",
    "cc0",
    "cc by",
    "cc-by",
    "cc by-sa",
    "cc-by-sa",
    "creative commons attribution",
    "creative commons attribution-share alike",
)
DISALLOWED_LICENSE_MARKERS = ("noncommercial", "non-commercial", " no derivatives", "nd", "fair use", "all rights reserved")
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}
BAD_SUBJECT_TERMS = {
    "logo",
    "flag",
    "icon",
    "map locator",
    "blank map",
    "coat of arms",
    "emblem",
}
MOJIBAKE_MARKERS = ("Ã", "Â", "á»", "Ä", "Æ")


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def write_csv(path: Path, rows: list[dict[str, Any]], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({field: scalar(row.get(field)) for field in fields})


def scalar(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (list, dict)):
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    return str(value)


def fold(text: str) -> str:
    text = unicodedata.normalize("NFD", (text or "").lower())
    return "".join(ch for ch in text if unicodedata.category(ch) != "Mn")


def tokens(text: str) -> set[str]:
    stop = {
        "and", "the", "with", "from", "into", "viet", "nam", "vietnam", "vietnamese",
        "cua", "voi", "cac", "mot", "cho", "den", "the", "ky", "khi", "sau", "truoc",
        "thoi", "giai", "doan", "lich", "su", "nam", "hinh", "anh", "tu", "lieu",
    }
    return {tok for tok in re.findall(r"[a-z0-9]+", fold(text)) if len(tok) >= 3 and tok not in stop}


def has_mojibake(value: Any) -> bool:
    if isinstance(value, str):
        return any(marker in value for marker in MOJIBAKE_MARKERS)
    if isinstance(value, list):
        return any(has_mojibake(item) for item in value)
    if isinstance(value, dict):
        return any(has_mojibake(item) for item in value.values())
    return False


def host_of(url: str) -> str:
    try:
        return (urllib.parse.urlparse(url).hostname or "").lower().strip(".")
    except Exception:
        return ""


def trusted_url(url: str, domains: list[str]) -> bool:
    host = host_of(url)
    return bool(host) and any(host == domain.lower() or host.endswith("." + domain.lower()) for domain in domains)


def extension_from_url(url: str) -> str:
    path = urllib.parse.urlparse(url).path
    suffix = Path(urllib.parse.unquote(path)).suffix.lower().lstrip(".")
    if suffix == "jpe":
        suffix = "jpg"
    return suffix if suffix in ALLOWED_EXTENSIONS else ""


def request_url(url: str, *, data: bytes | None = None, timeout: float = 15.0, limit: int = 512_000) -> tuple[bytes, str, str]:
    req = urllib.request.Request(url, data=data, headers={
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/json;q=0.9,*/*;q=0.1",
    })
    with urllib.request.urlopen(req, timeout=timeout) as response:
        content_type = response.headers.get("Content-Type", "")
        final_url = response.geturl()
        body = response.read(limit + 1)
    if len(body) > limit:
        body = body[:limit]
    return body, content_type, final_url


def fetch_json(url: str, params: dict[str, Any], timeout: float = 20.0) -> dict[str, Any]:
    query = urllib.parse.urlencode(params)
    body, content_type, _ = request_url(f"{url}?{query}", timeout=timeout, limit=1_500_000)
    if "json" not in content_type.lower() and not body.lstrip().startswith(b"{"):
        raise RuntimeError(f"Expected JSON from {url}, got {content_type!r}")
    return json.loads(body.decode("utf-8", errors="replace"))


@dataclass(frozen=True)
class VerificationSource:
    url: str
    title: str
    provider: str
    domain: str
    reason: str


@dataclass(frozen=True)
class ImageCandidate:
    image_title: str
    asset_page_url: str
    asset_file_url: str
    preview_url: str
    source_domain: str
    author: str
    license: str
    license_url: str
    required_attribution: str
    extension: str
    relation_type: str
    confidence: str
    reason: str
    provider: str


def normalize_commons_page(title: str) -> str:
    if not title.startswith("File:"):
        title = "File:" + title
    return "https://commons.wikimedia.org/wiki/" + urllib.parse.quote(title.replace(" ", "_"), safe="/:_")


def ddg_result_links(query: str, timeout: float = 18.0) -> list[dict[str, str]]:
    data = urllib.parse.urlencode({"q": query}).encode("utf-8")
    body, _, _ = request_url(DDG_HTML, data=data, timeout=timeout)
    text = body.decode("utf-8", errors="replace")
    rows: list[dict[str, str]] = []
    for match in re.finditer(r'<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>', text, re.I | re.S):
        href = html.unescape(match.group(1))
        title = re.sub(r"<[^>]+>", "", match.group(2))
        title = html.unescape(re.sub(r"\s+", " ", title)).strip()
        parsed = urllib.parse.urlparse(href)
        if parsed.netloc.endswith("duckduckgo.com"):
            params = urllib.parse.parse_qs(parsed.query)
            if params.get("uddg"):
                href = params["uddg"][0]
        rows.append({"url": href, "title": title})
    return rows


def discover_historical_sources(event: dict[str, Any], provider_errors: list[dict[str, str]]) -> list[VerificationSource]:
    domains = [str(domain).lower() for domain in event.get("preferredVerificationDomains") or []]
    queries = [str(q) for q in event.get("queries") or [event.get("title", "")]]
    seen: set[str] = set()
    sources: list[VerificationSource] = []
    for query in queries[:3]:
        for domain in domains[:4]:
            search_query = f"{query} site:{domain}"
            try:
                links = ddg_result_links(search_query)
            except Exception as exc:
                provider_errors.append({
                    "provider": "existing_search_provider",
                    "query": search_query,
                    "error": str(exc),
                })
                return sources
            for link in links:
                url = link["url"]
                if url in seen or not trusted_url(url, domains):
                    continue
                seen.add(url)
                sources.append(VerificationSource(
                    url=url,
                    title=link.get("title") or url,
                    provider="existing_search_provider",
                    domain=host_of(url),
                    reason=f"Trusted-domain search result for {search_query!r}",
                ))
                if len(sources) >= 4:
                    return sources
            time.sleep(0.25)
    return sources


def mediawiki_search_pages(query: str, api: str) -> list[str]:
    data = fetch_json(api, {
        "action": "query",
        "format": "json",
        "list": "search",
        "srsearch": query,
        "srlimit": 3,
        "utf8": 1,
    })
    return [row["title"] for row in data.get("query", {}).get("search", []) if row.get("title")]


def mediawiki_page_images(page_title: str, api: str) -> list[str]:
    data = fetch_json(api, {
        "action": "query",
        "format": "json",
        "prop": "images",
        "titles": page_title,
        "imlimit": 20,
        "utf8": 1,
    })
    titles: list[str] = []
    for page in data.get("query", {}).get("pages", {}).values():
        for image in page.get("images", []) or []:
            title = image.get("title", "")
            if title.startswith("File:") and not re.search(r"\.(svg|ogg|pdf|djvu)$", title, re.I):
                titles.append(title)
    return titles


def commons_file_metadata(file_titles: list[str]) -> list[dict[str, Any]]:
    if not file_titles:
        return []
    rows: list[dict[str, Any]] = []
    for offset in range(0, len(file_titles), 25):
        data = fetch_json(COMMONS_API, {
            "action": "query",
            "format": "json",
            "prop": "imageinfo",
            "titles": "|".join(file_titles[offset:offset + 25]),
            "iiprop": "url|mime|extmetadata",
            "iiurlwidth": 420,
            "utf8": 1,
        })
        for page in data.get("query", {}).get("pages", {}).values():
            info = (page.get("imageinfo") or [{}])[0]
            if info:
                info["title"] = page.get("title", "")
                rows.append(info)
    return rows


def metadata_value(extmetadata: dict[str, Any], key: str) -> str:
    value = extmetadata.get(key, {})
    if isinstance(value, dict):
        value = value.get("value", "")
    if not isinstance(value, str):
        value = str(value or "")
    return re.sub(r"<[^>]+>", "", html.unescape(value)).strip()


def allowed_license(name: str) -> bool:
    folded = fold(name)
    if any(marker in folded for marker in DISALLOWED_LICENSE_MARKERS):
        return False
    return any(marker in folded for marker in ALLOWED_LICENSE_MARKERS)


def relation_score(event: dict[str, Any], meta_text: str) -> tuple[float, str, str]:
    event_terms = tokens(" ".join([
        str(event.get("title") or ""),
        str(event.get("shortTitle") or ""),
        str(event.get("canonicalSummary") or ""),
        " ".join(str(x) for x in event.get("historicalLocations") or []),
    ]))
    image_terms = tokens(meta_text)
    if not event_terms or not image_terms:
        return 0.0, "strong_contextual", "No useful lexical evidence in metadata."
    overlap = event_terms & image_terms
    ratio = len(overlap) / max(1, min(len(event_terms), 12))
    folded_meta = fold(meta_text)
    if any(term in folded_meta for term in BAD_SUBJECT_TERMS):
        ratio -= 0.5
    if ratio >= 0.45:
        return ratio, "direct", "Commons metadata/title overlaps the event title/context."
    if ratio >= 0.18:
        return ratio, "strong_contextual", "Commons metadata overlaps the event context and requires reviewer confirmation."
    return ratio, "strong_contextual", "Weak metadata overlap; excluded unless no better candidates exist."


def discover_wikimedia_candidates(event: dict[str, Any], provider_errors: list[dict[str, str]]) -> list[ImageCandidate]:
    page_titles: list[str] = []
    for query in [str(q) for q in event.get("queries") or [event.get("title", "")]][:2]:
        for api_name, api in (("viwiki", VIWIKI_API), ("enwiki", ENWIKI_API)):
            try:
                page_titles.extend(mediawiki_search_pages(query, api))
            except Exception as exc:
                provider_errors.append({"provider": "mediawiki_provider", "api": api_name, "query": query, "error": str(exc)})
        time.sleep(0.2)
    image_titles: list[str] = []
    for page_title in list(dict.fromkeys(page_titles))[:4]:
        for api_name, api in (("viwiki", VIWIKI_API), ("enwiki", ENWIKI_API)):
            try:
                image_titles.extend(mediawiki_page_images(page_title, api))
            except Exception as exc:
                provider_errors.append({"provider": "mediawiki_provider", "api": api_name, "page": page_title, "error": str(exc)})
        time.sleep(0.15)
    candidates: list[ImageCandidate] = []
    seen: set[str] = set()
    try:
        metadata_rows = commons_file_metadata(list(dict.fromkeys(image_titles))[:40])
    except Exception as exc:
        provider_errors.append({"provider": "wikimedia_metadata_provider", "error": str(exc)})
        return candidates
    for info in metadata_rows:
        title = str(info.get("title") or "")
        url = str(info.get("url") or "")
        thumb = str(info.get("thumburl") or "")
        mime = str(info.get("mime") or "")
        if not title or not url or title in seen:
            continue
        seen.add(title)
        ext = extension_from_url(url)
        if mime and not mime.startswith("image/"):
            continue
        extmeta = info.get("extmetadata") or {}
        license_name = metadata_value(extmeta, "LicenseShortName") or metadata_value(extmeta, "UsageTerms")
        if not allowed_license(license_name):
            continue
        description = " ".join([
            title,
            metadata_value(extmeta, "ObjectName"),
            metadata_value(extmeta, "ImageDescription"),
            metadata_value(extmeta, "Categories"),
        ])
        score, relation_type, reason = relation_score(event, description)
        if score < 0.18:
            continue
        candidates.append(ImageCandidate(
            image_title=title,
            asset_page_url=normalize_commons_page(title),
            asset_file_url=url,
            preview_url=thumb or url,
            source_domain="commons.wikimedia.org",
            author=metadata_value(extmeta, "Artist"),
            license=license_name,
            license_url=metadata_value(extmeta, "LicenseUrl"),
            required_attribution=metadata_value(extmeta, "Attribution") or metadata_value(extmeta, "Credit"),
            extension=ext or "determine-after-download",
            relation_type=relation_type,
            confidence="medium" if score >= 0.25 else "low",
            reason=reason,
            provider="wikimedia_metadata_provider",
        ))
    return candidates


def load_overrides(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"version": 1, "events": {}}
    value = load_json(path)
    if not isinstance(value, dict):
        raise ValueError(f"Override file must be an object: {path}")
    value.setdefault("events", {})
    return value


def override_sources_and_candidates(event: dict[str, Any], overrides: dict[str, Any]) -> tuple[list[VerificationSource], list[ImageCandidate], list[str]]:
    event_id = str(event.get("eventId"))
    row = (overrides.get("events") or {}).get(event_id) or {}
    errors: list[str] = []
    sources: list[VerificationSource] = []
    domains = [str(domain).lower() for domain in event.get("preferredVerificationDomains") or []]
    for source in row.get("historicalVerificationSources") or []:
        url = str(source.get("url") or "")
        if not trusted_url(url, domains):
            errors.append(f"{event_id}: override verification URL not trusted: {url}")
            continue
        sources.append(VerificationSource(
            url=url,
            title=str(source.get("title") or url),
            provider="curated_override_provider",
            domain=host_of(url),
            reason=str(source.get("reason") or "Manual trusted-source override."),
        ))
    candidates: list[ImageCandidate] = []
    for candidate in row.get("imageCandidates") or []:
        license_name = str(candidate.get("license") or "")
        url = str(candidate.get("assetFileUrl") or "")
        page = str(candidate.get("assetPageUrl") or candidate.get("sourcePageUrl") or "")
        if not allowed_license(license_name):
            errors.append(f"{event_id}: override image license is not reusable: {license_name}")
            continue
        candidates.append(ImageCandidate(
            image_title=str(candidate.get("imageTitle") or page or url),
            asset_page_url=page,
            asset_file_url=url,
            preview_url=str(candidate.get("previewUrl") or ""),
            source_domain=host_of(page or url),
            author=str(candidate.get("author") or ""),
            license=license_name,
            license_url=str(candidate.get("licenseUrl") or ""),
            required_attribution=str(candidate.get("requiredAttribution") or ""),
            extension=str(candidate.get("extension") or extension_from_url(url) or "determine-after-download"),
            relation_type=str(candidate.get("relationType") or "strong_contextual"),
            confidence=str(candidate.get("confidence") or "manual"),
            reason=str(candidate.get("reason") or "Manual image candidate override."),
            provider="curated_override_provider",
        ))
    return sources, candidates, errors


def choose_candidates(candidates: list[ImageCandidate], sources: list[VerificationSource], required: int) -> list[ImageCandidate]:
    if not sources:
        return []
    seen_pages: set[str] = set()
    unique: list[ImageCandidate] = []
    for candidate in candidates:
        key = candidate.asset_page_url or candidate.asset_file_url
        if key in seen_pages:
            continue
        seen_pages.add(key)
        if candidate.relation_type not in {"direct", "strong_contextual"}:
            continue
        if candidate.confidence == "low":
            continue
        unique.append(candidate)
    unique.sort(key=lambda item: (
        0 if item.provider == "curated_override_provider" else 1,
        0 if item.relation_type == "direct" else 1,
        item.image_title,
    ))
    return unique[:required]


def queue_rows_for_event(event: dict[str, Any], selected: list[ImageCandidate], sources: list[VerificationSource]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    verification = sources[0] if sources else None
    for index, slot in enumerate(event.get("slots") or [], start=1):
        candidate = selected[index - 1] if index <= len(selected) else None
        ext = candidate.extension if candidate else "determine-after-download"
        suggested = f"image_{index:02d}.{ext}" if ext != "determine-after-download" else f"image_{index:02d}.<determine-after-download>"
        rows.append({
            "eventIndex": event.get("_eventIndex"),
            "eventId": event.get("eventId"),
            "title": event.get("title"),
            "chronology": event.get("displayDate"),
            "slot": index,
            "role": slot.get("role"),
            "suggestedFilename": suggested,
            "relationType": candidate.relation_type if candidate else "",
            "confidence": candidate.confidence if candidate else "",
            "imageTitle": candidate.image_title if candidate else "",
            "assetPageUrl": candidate.asset_page_url if candidate else "",
            "assetFileUrl": candidate.asset_file_url if candidate else "",
            "previewUrl": candidate.preview_url if candidate else "",
            "sourceDomain": candidate.source_domain if candidate else "",
            "author": candidate.author if candidate else "",
            "license": candidate.license if candidate else "",
            "licenseUrl": candidate.license_url if candidate else "",
            "requiredAttribution": candidate.required_attribution if candidate else "",
            "historicalVerificationUrl": verification.url if verification else "",
            "historicalReason": verification.reason if verification else "",
            "downloadStatus": "pending_manual_download" if candidate else "unresolved_no_download_link",
            "reviewerNotes": candidate.reason if candidate else "No sufficiently verified reusable image candidate found.",
        })
    return rows


def ensure_event_folder(root: Path, event: dict[str, Any], rows: list[dict[str, Any]], sources: list[VerificationSource], status: str) -> None:
    event_dir = root / "by_event" / str(event["eventId"])
    event_dir.mkdir(parents=True, exist_ok=True)
    event_meta = {
        "eventId": event.get("eventId"),
        "title": event.get("title"),
        "displayDate": event.get("displayDate"),
        "sourceFamily": event.get("sourceFamily"),
        "requiredImages": event.get("requiredImages", 2),
        "status": status,
    }
    write_json(event_dir / "event.json", event_meta)
    write_json(event_dir / "sources.json", {
        "eventId": event.get("eventId"),
        "status": status,
        "historicalVerificationSources": [source.__dict__ for source in sources],
        "manualDownloadQueue": rows,
        "expected": [row["suggestedFilename"] for row in rows],
    })
    lines = [
        f"# Manual download instructions for {event.get('eventId')}",
        "",
        "Do not use automated download tools in this repository phase.",
        "Open each asset page in a browser, verify the license/provenance, then save the file manually into this folder.",
        "",
    ]
    for row in rows:
        lines.extend([
            f"## Slot {row['slot']} - {row['role']}",
            f"- Save as: `{row['suggestedFilename']}`",
            f"- Asset page: {row['assetPageUrl'] or 'UNRESOLVED'}",
            f"- Asset file URL for manual browser download: {row['assetFileUrl'] or 'UNRESOLVED'}",
            f"- License: {row['license'] or 'UNRESOLVED'}",
            f"- Historical verification: {row['historicalVerificationUrl'] or 'UNRESOLVED'}",
            f"- Relation: {row['relationType'] or 'UNRESOLVED'}",
            f"- Notes: {row['reviewerNotes']}",
            "",
        ])
    (event_dir / "DOWNLOAD_INSTRUCTIONS.md").write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def build_worklist_row(event: dict[str, Any], status: str, sources: list[VerificationSource], selected: list[ImageCandidate], errors: list[dict[str, str]]) -> dict[str, Any]:
    return {
        "eventIndex": event.get("_eventIndex"),
        "eventId": event.get("eventId"),
        "title": event.get("title"),
        "chronology": event.get("displayDate"),
        "summary": event.get("canonicalSummary"),
        "locations": event.get("historicalLocations") or [],
        "people": event.get("people") or [],
        "likelyImageSubjects": event.get("queries") or [],
        "recommendedTrustedDomains": event.get("preferredVerificationDomains") or [],
        "suggestedSearchQueries": event.get("queries") or [],
        "discoveryStatus": status,
        "historicalVerificationSources": [source.__dict__ for source in sources],
        "imageCandidate1": selected[0].__dict__ if len(selected) >= 1 else None,
        "imageCandidate2": selected[1].__dict__ if len(selected) >= 2 else None,
        "unresolvedReason": "" if len(selected) >= int(event.get("requiredImages") or 2) else "Needs manual trusted-source/image search.",
        "providerErrors": errors,
        "mojibakeSuspected": has_mojibake(event),
    }


def run_network_diagnostics(output_path: Path | None) -> dict[str, Any]:
    checks: list[dict[str, Any]] = []

    def record(name: str, func: Any) -> None:
        try:
            value = func()
            checks.append({"name": name, "status": "ok", "detail": value})
        except Exception as exc:
            checks.append({"name": name, "status": "error", "detail": str(exc)})

    record("direct_official_html_baotanglichsu", lambda: {
        "url": "https://baotanglichsu.vn/",
        "contentType": request_url("https://baotanglichsu.vn/", timeout=15, limit=4096)[1],
    })
    record("commons_api", lambda: {
        "siteName": fetch_json(COMMONS_API, {"action": "query", "format": "json", "meta": "siteinfo", "siprop": "general"}).get("query", {}).get("general", {}).get("sitename"),
    })
    record("viwiki_api", lambda: {
        "pages": mediawiki_search_pages("Việt Nam thời dựng nước", VIWIKI_API)[:3],
    })
    record("direct_historical_source_html", lambda: {
        "url": "https://hochiminh.vn/",
        "contentType": request_url("https://hochiminh.vn/", timeout=15, limit=4096)[1],
    })
    record("existing_search_provider_ddg_html", lambda: {
        "resultCount": len(ddg_result_links("Việt Nam thời dựng nước site:baotanglichsu.vn", timeout=15)),
    })
    report = {"version": 1, "checks": checks}
    if output_path:
        write_json(output_path, report)
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", type=Path, default=Path("crawData/stage5_media_enrich/output/event_source_plan.json"))
    parser.add_argument("--media-root", type=Path, default=Path("crawData/stage5_media_enrich/external_event_images"))
    parser.add_argument("--overrides", type=Path, default=Path("crawData/stage5_media_enrich/config/external_source_overrides.json"))
    parser.add_argument("--output-worklist-json", type=Path, default=Path("crawData/stage5_media_enrich/output/external_source_discovery_worklist.json"))
    parser.add_argument("--output-worklist-csv", type=Path, default=Path("crawData/stage5_media_enrich/output/external_source_discovery_worklist.csv"))
    parser.add_argument("--queue-json", type=Path, default=Path("crawData/stage5_media_enrich/output/manual_image_download_queue.json"))
    parser.add_argument("--queue-csv", type=Path, default=Path("crawData/stage5_media_enrich/output/manual_image_download_queue.csv"))
    parser.add_argument("--guide", type=Path, default=Path("crawData/stage5_media_enrich/output/MANUAL_DOWNLOAD_GUIDE.md"))
    parser.add_argument("--authoritative-sources-json", type=Path, default=Path("crawData/stage5_media_enrich/output/authoritative_verification_sources.json"))
    parser.add_argument("--report", type=Path, default=Path("crawData/stage5_media_enrich/output/external_source_discovery_pilot_report.json"))
    parser.add_argument("--diagnostics-output", type=Path, default=Path("crawData/stage5_media_enrich/output/external_source_network_diagnostics.json"))
    parser.add_argument("--start-index", type=int, default=0)
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--event-id", action="append", default=[])
    parser.add_argument("--diagnose-network", action="store_true")
    parser.add_argument("--skip-network", action="store_true")
    args = parser.parse_args()

    if args.diagnose_network:
        report = run_network_diagnostics(args.diagnostics_output)
        ok = sum(1 for row in report["checks"] if row["status"] == "ok")
        print(f"network diagnostics: {ok}/{len(report['checks'])} checks ok")

    plan = load_json(args.plan)
    events = list(plan.get("events") or [])
    for index, event in enumerate(events, start=1):
        event["_eventIndex"] = index
    selected_ids = set(args.event_id)
    if selected_ids:
        pilot = [event for event in events if event.get("eventId") in selected_ids]
    else:
        pilot = events[args.start_index:args.start_index + args.limit]
    pilot_ids = {event.get("eventId") for event in pilot}
    overrides = load_overrides(args.overrides)

    worklist: list[dict[str, Any]] = []
    queue_rows: list[dict[str, Any]] = []
    report_rows: list[dict[str, Any]] = []
    provider_errors: list[dict[str, str]] = []
    override_errors: list[str] = []

    for event in events:
        if event.get("eventId") not in pilot_ids:
            worklist.append(build_worklist_row(event, "not_attempted", [], [], []))
            continue
        event_errors: list[dict[str, str]] = []
        override_sources, override_candidates, errors = override_sources_and_candidates(event, overrides)
        override_errors.extend(errors)
        sources = list(override_sources)
        candidates = list(override_candidates)
        if not args.skip_network:
            sources.extend(source for source in discover_historical_sources(event, event_errors) if source.url not in {row.url for row in sources})
            candidates.extend(discover_wikimedia_candidates(event, event_errors))
        provider_errors.extend(event_errors)
        selected = choose_candidates(candidates, sources, int(event.get("requiredImages") or 2))
        status = "ready_for_manual_download" if len(selected) >= int(event.get("requiredImages") or 2) else "needs_manual_source_search"
        rows = queue_rows_for_event(event, selected, sources)
        queue_rows.extend(rows)
        ensure_event_folder(args.media_root, event, rows, sources, status)
        worklist.append(build_worklist_row(event, status, sources, selected, event_errors))
        report_rows.append({
            "eventId": event.get("eventId"),
            "title": event.get("title"),
            "status": status,
            "verificationSourceCount": len(sources),
            "selectedCandidateCount": len(selected),
            "candidateCountBeforeSelection": len(candidates),
            "providerErrorCount": len(event_errors),
        })

    worklist.sort(key=lambda row: int(row["eventIndex"]))
    queue_rows.sort(key=lambda row: (int(row["eventIndex"]), int(row["slot"])))
    write_json(args.output_worklist_json, {"version": 1, "events": worklist})
    write_csv(args.output_worklist_csv, worklist, [
        "eventIndex", "eventId", "title", "chronology", "summary", "locations", "people",
        "likelyImageSubjects", "recommendedTrustedDomains", "suggestedSearchQueries", "discoveryStatus",
        "historicalVerificationSources", "imageCandidate1", "imageCandidate2", "unresolvedReason",
        "mojibakeSuspected",
    ])
    write_json(args.queue_json, {"version": 1, "rows": queue_rows})
    write_csv(args.queue_csv, queue_rows, [
        "eventIndex", "eventId", "title", "chronology", "slot", "role", "suggestedFilename",
        "relationType", "confidence", "imageTitle", "assetPageUrl", "assetFileUrl", "previewUrl",
        "sourceDomain", "author", "license", "licenseUrl", "requiredAttribution",
        "historicalVerificationUrl", "historicalReason", "downloadStatus", "reviewerNotes",
    ])

    guide_lines = [
        "# Manual external image download guide",
        "",
        "No image binaries were downloaded by this tool.",
        "Open each asset page/file URL manually in a browser, verify source/license/relevance, and save into the event folder using the suggested filename.",
        "",
        "After manual downloads, run:",
        "",
        "```powershell",
        "python -X utf8 crawData/stage5_media_enrich/ingest_manual_external_images.py --limit 5",
        "```",
        "",
    ]
    for event in pilot:
        event_rows = [row for row in queue_rows if row["eventId"] == event["eventId"]]
        guide_lines.append(f"## {event['_eventIndex']}. {event['eventId']} - {event.get('title')}")
        for row in event_rows:
            guide_lines.append(f"- Slot {row['slot']}: save `{row['suggestedFilename']}`; asset page: {row['assetPageUrl'] or 'UNRESOLVED'}")
        guide_lines.append("")
    args.guide.parent.mkdir(parents=True, exist_ok=True)
    args.guide.write_text("\n".join(guide_lines).rstrip() + "\n", encoding="utf-8")

    authoritative_events = [
        {
            "eventId": row["eventId"],
            "title": row["title"],
            "status": row["discoveryStatus"],
            "historicalVerificationSources": row["historicalVerificationSources"],
            "sourceCount": len(row["historicalVerificationSources"]),
        }
        for row in worklist
        if row["discoveryStatus"] != "not_attempted" or row["historicalVerificationSources"]
    ]
    write_json(args.authoritative_sources_json, {
        "version": 1,
        "source": "discover_external_media_links",
        "events": authoritative_events,
        "verifiedSourceCount": sum(row["sourceCount"] for row in authoritative_events),
        "binaryDownloads": 0,
    })

    ready = sum(1 for row in report_rows if row["selectedCandidateCount"] >= 2)
    one = sum(1 for row in report_rows if row["selectedCandidateCount"] == 1)
    zero = sum(1 for row in report_rows if row["selectedCandidateCount"] == 0)
    report = {
        "version": 1,
        "binaryDownloads": 0,
        "pilotEventCount": len(pilot),
        "eventsWithTwoGoodCandidates": ready,
        "eventsWithOneGoodCandidate": one,
        "eventsWithZeroGoodCandidates": zero,
        "totalQueueRows": len(queue_rows),
        "totalSelectedImageCandidates": sum(int(row["selectedCandidateCount"]) for row in report_rows),
        "providerErrors": provider_errors,
        "overrideErrors": override_errors,
        "events": report_rows,
    }
    write_json(args.report, report)
    if override_errors:
        for error in override_errors:
            print(error, file=sys.stderr)
        return 2
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
