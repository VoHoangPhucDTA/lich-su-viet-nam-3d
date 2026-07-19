#!/usr/bin/env python3
"""Acquire two reviewable web images for each missing Stage5 event.

Primary asset source: Wikimedia Commons / Wikipedia page images, because the
file metadata exposes a reusable license and provenance. Historical relevance
must still be reviewed; the tool records every query and source page.

The script is networked and intentionally separate from the existing Stage5
candidate pipeline. It writes:
- assets/<sha256>.<ext>                     canonical deduplicated bytes
- by_event/<eventId>/image_01.<ext>        hardlink/copy for human review
- by_event/<eventId>/image_02.<ext>
- by_event/<eventId>/sources.json
- external_event_image_manifest.json
- unresolved_events.json

It never mutates approved mappings or publishes to frontend/public.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import mimetypes
import os
import re
import shutil
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Iterable

try:
    from PIL import Image
except Exception:  # Pillow is optional until actual download verification.
    Image = None  # type: ignore

USER_AGENT = "Stage5HistoricalMediaAcquirer/1.0 (educational research; contact local project owner)"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
VIWIKI_API = "https://vi.wikipedia.org/w/api.php"
ENWIKI_API = "https://en.wikipedia.org/w/api.php"

ALLOWED_MIMES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_LICENSE_MARKERS = (
    "public domain", "cc0", "cc by", "cc-by", "cc by-sa", "cc-by-sa",
    "attribution", "attribution-sharealike",
)
DISALLOWED_LICENSE_MARKERS = (
    "noncommercial", "no derivatives", "fair use", "copyrighted", "all rights reserved",
)
GENERIC_BAD_WORDS = {
    "logo", "icon", "symbol", "coat of arms", "seal", "emblem", "blank map",
    "location map", "map template", "flag map", "wikidata", "commons-logo",
}


def fold(text: str) -> str:
    text = unicodedata.normalize("NFD", html.unescape(text).lower())
    return "".join(ch for ch in text if unicodedata.category(ch) != "Mn")


def words(text: str) -> set[str]:
    stop = {
        "cua", "cho", "voi", "trong", "den", "tai", "nam", "viet", "vietnam", "thoi",
        "giai", "doan", "duoc", "su", "mot", "cac", "the", "ky", "nha", "va", "tu",
        "from", "the", "of", "and", "in", "at", "to", "a", "an",
    }
    return {w for w in re.findall(r"[a-z0-9]+", fold(text)) if len(w) >= 3 and w not in stop}


def json_get(url: str, params: dict[str, Any], timeout: int) -> dict[str, Any]:
    query = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    request = urllib.request.Request(f"{url}?{query}", headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:  # nosec - trusted fixed APIs
        return json.loads(response.read().decode("utf-8"))


def download_bytes(url: str, timeout: int) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:  # nosec - reviewed URL from Commons API
        data = response.read()
    if not data:
        raise ValueError("empty download")
    return data


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def clean_html(value: Any) -> str:
    text = re.sub(r"<[^>]+>", " ", str(value or ""))
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def ext_from(mime: str, url: str) -> str:
    path_ext = Path(urllib.parse.urlparse(url).path).suffix.lower()
    if path_ext in {".jpg", ".jpeg", ".png", ".webp"}:
        return ".jpg" if path_ext == ".jpeg" else path_ext
    return {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}.get(
        mime, mimetypes.guess_extension(mime) or ".img"
    )


def relation_type_for_title(title: str, event: dict[str, Any]) -> str:
    title_tokens = words(title)
    event_tokens = words(event["title"])
    overlap = len(title_tokens & event_tokens)
    if event_tokens and overlap / max(1, len(event_tokens)) >= 0.6:
        return "direct"
    return "strong_contextual"


@dataclass
class Candidate:
    file_title: str
    page_url: str
    download_url: str
    mime: str
    width: int
    height: int
    license_short: str
    license_url: str
    artist: str
    credit: str
    description: str
    source_backend: str
    query: str
    score: float
    relation_type: str
    original_source: str = ""
    historical_verification_url: str = ""
    needs_review: bool = True


def license_allowed(metadata: dict[str, Any]) -> bool:
    fields = " ".join(
        clean_html(metadata.get(key, {}).get("value"))
        for key in ["LicenseShortName", "UsageTerms", "License", "LicenseUrl"]
        if isinstance(metadata.get(key), dict)
    ).lower()
    if any(marker in fields for marker in DISALLOWED_LICENSE_MARKERS):
        return False
    return any(marker in fields for marker in ALLOWED_LICENSE_MARKERS)


def metadata_value(metadata: dict[str, Any], key: str) -> str:
    value = metadata.get(key)
    if not isinstance(value, dict):
        return ""
    return clean_html(value.get("value"))


def first_url(text: str) -> str:
    match = re.search(r"https?://[^\s<>'\"]+", html.unescape(text or ""))
    return match.group(0).rstrip(".,);]") if match else ""


def trusted_url(url: str, domains: Iterable[str]) -> bool:
    try:
        host = (urllib.parse.urlparse(url).hostname or "").lower().strip(".")
    except Exception:
        return False
    return any(host == str(domain).lower() or host.endswith("." + str(domain).lower()) for domain in domains)


def load_verification_manifest(path: Path | None) -> dict[str, Any]:
    if not path or not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    events = data.get("events", data) if isinstance(data, dict) else {}
    return events if isinstance(events, dict) else {}


def score_candidate(event: dict[str, Any], file_title: str, description: str, query: str, backend: str) -> float:
    event_tokens = words(
        " ".join(
            [
                str(event.get("title") or ""),
                str(event.get("shortTitle") or ""),
                str(event.get("displayDate") or ""),
                " ".join(event.get("historicalLocations") or []),
                str(event.get("canonicalSummary") or ""),
                " ".join(str(x) for x in (event.get("keyFacts") or [])[:3]),
            ]
        )
    )
    candidate_text = f"{file_title} {description}"
    candidate_tokens = words(candidate_text)
    overlap = event_tokens & candidate_tokens
    score = len(overlap) * 5.0
    title_fold = fold(file_title)
    event_fold = fold(str(event.get("title") or ""))
    if event_fold and event_fold in title_fold:
        score += 60
    if backend == "wikipedia_page":
        score += 25
    if fold(query) in title_fold:
        score += 10
    if any(bad in title_fold for bad in GENERIC_BAD_WORDS):
        score -= 35
    if "map" in title_fold or "ban do" in title_fold or "luoc do" in title_fold:
        if any(k in fold(event["title"]) for k in ["chien dich", "xam luoc", "tien cong", "bien gioi", "chu quyen"]):
            score += 8
        else:
            score -= 8
    return score


def commons_candidates_for_titles(
    event: dict[str, Any], file_titles: Iterable[str], query: str, backend: str, timeout: int
) -> list[Candidate]:
    titles = [title for title in file_titles if title.startswith("File:")]
    results: list[Candidate] = []
    for offset in range(0, len(titles), 50):
        batch = titles[offset : offset + 50]
        data = json_get(
            COMMONS_API,
            {
                "action": "query",
                "format": "json",
                "formatversion": 2,
                "prop": "imageinfo",
                "titles": "|".join(batch),
                "iiprop": "url|size|mime|extmetadata",
                "iiurlwidth": 1600,
            },
            timeout,
        )
        for page in data.get("query", {}).get("pages", []):
            info_list = page.get("imageinfo") or []
            if not info_list:
                continue
            info = info_list[0]
            mime = str(info.get("mime") or "")
            width = int(info.get("width") or 0)
            height = int(info.get("height") or 0)
            metadata = info.get("extmetadata") or {}
            if mime not in ALLOWED_MIMES or width < 600 or height < 300:
                continue
            if not license_allowed(metadata):
                continue
            download_url = str(info.get("thumburl") or info.get("url") or "")
            if not download_url:
                continue
            page_title = str(page.get("title") or "")
            description = " ".join(
                filter(
                    None,
                    [
                        metadata_value(metadata, "ImageDescription"),
                        metadata_value(metadata, "ObjectName"),
                        metadata_value(metadata, "Categories"),
                    ],
                )
            )
            score = score_candidate(event, page_title, description, query, backend)
            if score < 5:
                continue
            results.append(
                Candidate(
                    file_title=page_title,
                    page_url=f"https://commons.wikimedia.org/wiki/{urllib.parse.quote(page_title.replace(' ', '_'))}",
                    download_url=download_url,
                    mime=mime,
                    width=width,
                    height=height,
                    license_short=metadata_value(metadata, "LicenseShortName") or metadata_value(metadata, "UsageTerms"),
                    license_url=metadata_value(metadata, "LicenseUrl"),
                    artist=metadata_value(metadata, "Artist"),
                    credit=metadata_value(metadata, "Credit"),
                    description=description,
                    source_backend=backend,
                    query=query,
                    score=score,
                    relation_type=relation_type_for_title(page_title, event),
                    original_source=metadata_value(metadata, "Source"),
                    historical_verification_url=(
                        first_url(metadata_value(metadata, "Source"))
                        if trusted_url(first_url(metadata_value(metadata, "Source")), event.get("preferredVerificationDomains") or [])
                        else ""
                    ),
                )
            )
    return results


def wikipedia_page_candidates(event: dict[str, Any], query: str, timeout: int) -> list[Candidate]:
    all_results: list[Candidate] = []
    for api in (VIWIKI_API, ENWIKI_API):
        search = json_get(
            api,
            {
                "action": "query",
                "format": "json",
                "formatversion": 2,
                "list": "search",
                "srsearch": query,
                "srlimit": 3,
                "srnamespace": 0,
            },
            timeout,
        )
        titles = [row.get("title") for row in search.get("query", {}).get("search", []) if row.get("title")]
        if not titles:
            continue
        pages = json_get(
            api,
            {
                "action": "query",
                "format": "json",
                "formatversion": 2,
                "prop": "images",
                "titles": "|".join(str(x) for x in titles),
                "imlimit": "max",
            },
            timeout,
        )
        file_titles: list[str] = []
        for page in pages.get("query", {}).get("pages", []):
            file_titles.extend(str(image.get("title")) for image in (page.get("images") or []) if image.get("title"))
        all_results.extend(commons_candidates_for_titles(event, file_titles, query, "wikipedia_page", timeout))
        if all_results:
            break
    return all_results


def commons_search_candidates(event: dict[str, Any], query: str, timeout: int) -> list[Candidate]:
    data = json_get(
        COMMONS_API,
        {
            "action": "query",
            "format": "json",
            "formatversion": 2,
            "generator": "search",
            "gsrsearch": query,
            "gsrnamespace": 6,
            "gsrlimit": 30,
            "prop": "imageinfo",
            "iiprop": "url|size|mime|extmetadata",
            "iiurlwidth": 1600,
        },
        timeout,
    )
    file_titles = [str(page.get("title")) for page in data.get("query", {}).get("pages", []) if page.get("title")]
    return commons_candidates_for_titles(event, file_titles, query, "commons_search", timeout)


def load_overrides(path: Path | None) -> dict[str, Any]:
    if not path or not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    return data.get("events", data) if isinstance(data, dict) else {}


def link_or_copy(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() or destination.is_symlink():
        destination.unlink()
    try:
        os.link(source, destination)
    except OSError:
        shutil.copy2(source, destination)


def verify_image_file(path: Path) -> tuple[int, int]:
    if Image is None:
        return 0, 0
    with Image.open(path) as image:
        image.verify()
    with Image.open(path) as image:
        return image.size


def acquire_event(
    event: dict[str, Any],
    root: Path,
    timeout: int,
    sleep_seconds: float,
    overrides: dict[str, Any],
    verifications: dict[str, Any],
) -> dict[str, Any]:
    event_id = event["eventId"]
    folder = root / "by_event" / event_id
    folder.mkdir(parents=True, exist_ok=True)

    verification_row = verifications.get(event_id) if isinstance(verifications, dict) else None
    discovered_verification_urls = [
        str(row.get("url") or "")
        for row in ((verification_row or {}).get("sources") or [])
        if isinstance(row, dict) and row.get("url")
    ]

    candidates: list[Candidate] = []
    manual = overrides.get(event_id) if isinstance(overrides, dict) else None
    if isinstance(manual, dict):
        for item in manual.get("images") or []:
            if not isinstance(item, dict):
                continue
            url = str(item.get("downloadUrl") or "")
            page_url = str(item.get("sourcePageUrl") or url)
            if not url:
                continue
            candidates.append(
                Candidate(
                    file_title=str(item.get("title") or event["title"]),
                    page_url=page_url,
                    download_url=url,
                    mime=str(item.get("mime") or "image/jpeg"),
                    width=int(item.get("width") or 9999),
                    height=int(item.get("height") or 9999),
                    license_short=str(item.get("license") or "MANUAL_REVIEW_REQUIRED"),
                    license_url=str(item.get("licenseUrl") or ""),
                    artist=str(item.get("artist") or ""),
                    credit=str(item.get("credit") or ""),
                    description=str(item.get("description") or ""),
                    source_backend="manual_override",
                    query="manual_override",
                    score=999,
                    relation_type=str(item.get("relationType") or "direct"),
                    original_source=str(item.get("originalSource") or page_url),
                    historical_verification_url=str(
                        item.get("historicalVerificationUrl")
                        or item.get("verificationSourceUrl")
                        or (page_url if trusted_url(page_url, event.get("preferredVerificationDomains") or []) else "")
                    ),
                    needs_review=True,
                )
            )

    for query in event.get("queries") or []:
        if len(candidates) >= 16:
            break
        try:
            candidates.extend(wikipedia_page_candidates(event, query, timeout))
        except Exception as exc:
            print(f"WARN {event_id} wikipedia query failed: {query}: {exc}", file=sys.stderr)
        time.sleep(sleep_seconds)
        if len(candidates) < 10:
            try:
                candidates.extend(commons_search_candidates(event, query, timeout))
            except Exception as exc:
                print(f"WARN {event_id} commons query failed: {query}: {exc}", file=sys.stderr)
            time.sleep(sleep_seconds)

    unique: dict[str, Candidate] = {}
    for candidate in sorted(candidates, key=lambda x: (-x.score, x.file_title)):
        unique.setdefault(candidate.download_url, candidate)

    selected: list[dict[str, Any]] = []
    seen_hashes: set[str] = set()
    for candidate in unique.values():
        if len(selected) >= 2:
            break
        try:
            data = download_bytes(candidate.download_url, timeout)
            digest = sha256_bytes(data)
            if digest in seen_hashes:
                continue
            seen_hashes.add(digest)
            extension = ext_from(candidate.mime, candidate.download_url)
            asset = root / "assets" / f"{digest}{extension}"
            asset.parent.mkdir(parents=True, exist_ok=True)
            if not asset.exists():
                asset.write_bytes(data)
            verified_width, verified_height = verify_image_file(asset)
            slot = len(selected) + 1
            event_path = folder / f"image_{slot:02d}{extension}"
            link_or_copy(asset, event_path)
            historical_verification_url = candidate.historical_verification_url
            if not historical_verification_url and discovered_verification_urls:
                historical_verification_url = discovered_verification_urls[min(slot - 1, len(discovered_verification_urls) - 1)]
            selected.append(
                {
                    "slot": slot,
                    "role": "thumbnail" if slot == 1 else "gallery",
                    "isThumbnail": slot == 1,
                    "sortOrder": 1 if slot == 1 else 2,
                    "sourceImage": str(event_path.relative_to(root.parent)).replace("\\", "/"),
                    "canonicalAsset": str(asset.relative_to(root.parent)).replace("\\", "/"),
                    "sha256": digest,
                    "extension": extension,
                    "downloadUrl": candidate.download_url,
                    "sourcePageUrl": candidate.page_url,
                    "originalSource": candidate.original_source,
                    "historicalVerificationUrl": historical_verification_url,
                    "historicalVerificationStatus": "trusted_domain_found" if historical_verification_url else "missing",
                    "sourceBackend": candidate.source_backend,
                    "query": candidate.query,
                    "fileTitle": candidate.file_title,
                    "description": candidate.description,
                    "license": candidate.license_short,
                    "licenseUrl": candidate.license_url,
                    "artist": candidate.artist,
                    "credit": candidate.credit,
                    "apiWidth": candidate.width,
                    "apiHeight": candidate.height,
                    "verifiedWidth": verified_width,
                    "verifiedHeight": verified_height,
                    "relevanceScore": candidate.score,
                    "relationType": candidate.relation_type,
                    "reviewStatus": "pending",
                    "needsManualHistoricalCheck": True,
                    "preferredVerificationDomains": event.get("preferredVerificationDomains") or [],
                }
            )
        except Exception as exc:
            print(f"WARN {event_id} failed candidate {candidate.download_url}: {exc}", file=sys.stderr)

    status = (
        "ready_for_review"
        if len(selected) == 2 and all(str(image.get("historicalVerificationUrl") or "") for image in selected)
        else "needs_verification" if len(selected) == 2 else "unresolved"
    )
    result = {
        "eventId": event_id,
        "title": event["title"],
        "displayDate": event.get("displayDate") or "",
        "sourceFamily": event.get("sourceFamily"),
        "status": status,
        "images": selected,
        "requiredImages": 2,
    }
    (folder / "sources.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Download two reviewable historical-image candidates per missing event.")
    parser.add_argument("--plan", required=True)
    parser.add_argument("--output-root", required=True)
    parser.add_argument("--overrides", default="")
    parser.add_argument("--verification-manifest", default="")
    parser.add_argument("--event-id", action="append", default=[])
    parser.add_argument("--max-events", type=int, default=0)
    parser.add_argument("--timeout", type=int, default=40)
    parser.add_argument("--sleep", type=float, default=0.15)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    plan = json.loads(Path(args.plan).read_text(encoding="utf-8"))
    root = Path(args.output_root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    overrides = load_overrides(Path(args.overrides).resolve() if args.overrides else None)
    verifications = load_verification_manifest(
        Path(args.verification_manifest).resolve() if args.verification_manifest else None
    )
    requested = set(args.event_id)
    events = [event for event in plan.get("events") or [] if not requested or event["eventId"] in requested]
    if args.max_events:
        events = events[: args.max_events]

    results: list[dict[str, Any]] = []
    for index, event in enumerate(events, start=1):
        print(f"[{index}/{len(events)}] {event['eventId']} — {event['title']}")
        results.append(acquire_event(event, root, args.timeout, args.sleep, overrides, verifications))

    manifest = {
        "version": 1,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "eventCount": len(results),
        "readyForReview": sum(1 for row in results if row["status"] == "ready_for_review"),
        "unresolved": sum(1 for row in results if row["status"] != "ready_for_review"),
        "imageAssignments": sum(len(row["images"]) for row in results),
        "events": results,
    }
    (root / "external_event_image_manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    unresolved = [row for row in results if row["status"] != "ready_for_review"]
    (root / "unresolved_events.json").write_text(
        json.dumps({"version": 1, "events": unresolved}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps({k: manifest[k] for k in ["eventCount", "readyForReview", "unresolved", "imageAssignments"]}, ensure_ascii=False))
    return 0 if not unresolved else 2


if __name__ == "__main__":
    raise SystemExit(main())
