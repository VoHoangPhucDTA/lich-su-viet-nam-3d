#!/usr/bin/env python3
"""Discover authoritative historical verification pages for missing events.

The event plan already assigns preferred trusted domains by historical period.
This networked helper queries DuckDuckGo's HTML endpoint with site: filters,
keeps only links on those trusted domains, and writes a manifest used by the
image downloader/reviewer. It does not download or publish images.

The helper is intentionally best-effort. Any event without a trusted result is
left unresolved and must receive a manual source override before approval.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

USER_AGENT = "Stage5HistoricalSourceDiscovery/1.0 (educational research)"
DDG_HTML = "https://html.duckduckgo.com/html/"


class ResultParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.results: list[dict[str, str]] = []
        self._href = ""
        self._text: list[str] = []
        self._capture = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != "a":
            return
        values = {k: v or "" for k, v in attrs}
        classes = values.get("class", "")
        if "result__a" in classes:
            self._capture = True
            self._href = values.get("href", "")
            self._text = []

    def handle_data(self, data: str) -> None:
        if self._capture:
            self._text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self._capture:
            self.results.append({"href": self._href, "title": html.unescape("".join(self._text)).strip()})
            self._capture = False
            self._href = ""
            self._text = []


def trusted_host(url: str, domains: list[str]) -> bool:
    try:
        host = (urllib.parse.urlparse(url).hostname or "").lower().strip(".")
    except Exception:
        return False
    return any(host == domain.lower() or host.endswith("." + domain.lower()) for domain in domains)


def unwrap_ddg_url(url: str) -> str:
    parsed = urllib.parse.urlparse(url)
    params = urllib.parse.parse_qs(parsed.query)
    if "uddg" in params and params["uddg"]:
        return urllib.parse.unquote(params["uddg"][0])
    if url.startswith("//"):
        return "https:" + url
    return url


def search(query: str, timeout: int) -> list[dict[str, str]]:
    data = urllib.parse.urlencode({"q": query}).encode("utf-8")
    request = urllib.request.Request(
        DDG_HTML,
        data=data,
        headers={"User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:  # nosec - fixed search endpoint
        body = response.read().decode("utf-8", errors="replace")
    parser = ResultParser()
    parser.feed(body)
    return parser.results


def event_queries(event: dict[str, Any], domain: str) -> list[str]:
    title = str(event.get("title") or "").strip()
    date = str(event.get("displayDate") or "").strip()
    short = str(event.get("shortTitle") or "").strip()
    queries = [f'"{title}" site:{domain}', f'{title} {date} site:{domain}']
    if short and short != title:
        queries.append(f'"{short}" site:{domain}')
    return queries


def main() -> int:
    parser = argparse.ArgumentParser(description="Find trusted historical verification pages for missing Stage5 events.")
    parser.add_argument("--plan", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--event-id", action="append", default=[])
    parser.add_argument("--max-events", type=int, default=0)
    parser.add_argument("--timeout", type=int, default=35)
    parser.add_argument("--sleep", type=float, default=0.4)
    parser.add_argument("--max-sources-per-event", type=int, default=2)
    args = parser.parse_args()

    plan = json.loads(Path(args.plan).read_text(encoding="utf-8"))
    requested = set(args.event_id)
    events = [row for row in (plan.get("events") or []) if not requested or row.get("eventId") in requested]
    if args.max_events:
        events = events[: args.max_events]

    output_events: dict[str, Any] = {}
    unresolved: list[str] = []
    for index, event in enumerate(events, start=1):
        event_id = str(event.get("eventId") or "")
        domains = [str(x) for x in (event.get("preferredVerificationDomains") or []) if x]
        found: list[dict[str, str]] = []
        seen: set[str] = set()
        print(f"[{index}/{len(events)}] {event_id}")
        for domain in domains:
            if len(found) >= args.max_sources_per_event:
                break
            for query in event_queries(event, domain):
                try:
                    results = search(query, args.timeout)
                except Exception as exc:
                    print(f"WARN {event_id} search failed for {domain}: {exc}", file=sys.stderr)
                    time.sleep(args.sleep)
                    continue
                for row in results:
                    url = unwrap_ddg_url(row.get("href") or "")
                    if not url or url in seen or not trusted_host(url, domains):
                        continue
                    seen.add(url)
                    found.append(
                        {
                            "url": url,
                            "title": row.get("title") or "",
                            "domain": urllib.parse.urlparse(url).hostname or domain,
                            "query": query,
                            "discoveryBackend": "duckduckgo_html_site_search",
                        }
                    )
                    if len(found) >= args.max_sources_per_event:
                        break
                time.sleep(args.sleep)
                if len(found) >= args.max_sources_per_event:
                    break
        output_events[event_id] = {
            "eventId": event_id,
            "title": event.get("title") or event_id,
            "preferredVerificationDomains": domains,
            "sources": found,
            "status": "ready" if found else "unresolved",
        }
        if not found:
            unresolved.append(event_id)

    payload = {
        "version": 1,
        "eventCount": len(output_events),
        "ready": len(output_events) - len(unresolved),
        "unresolvedCount": len(unresolved),
        "events": output_events,
        "unresolvedEventIds": unresolved,
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: payload[k] for k in ["eventCount", "ready", "unresolvedCount"]}, ensure_ascii=False))
    return 0 if not unresolved else 2


if __name__ == "__main__":
    raise SystemExit(main())
