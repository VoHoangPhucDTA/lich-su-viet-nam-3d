#!/usr/bin/env python3
"""Local manual review tool for Stage 5 image-event mapping decisions.

This tool is intentionally local-only. It does not publish assets, import data,
or mutate the real approved mapping config.
"""

from __future__ import annotations

import argparse
import html
import json
import mimetypes
import re
import sys
import webbrowser
from dataclasses import dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse


STATUS_APPROVED = "approved"
STATUS_DEFERRED = "deferred"
STATUS_NO_SUITABLE = "no_suitable_event"
STATUS_SKIPPED = "skipped"

DEFAULT_OUTPUT_DIR = Path("crawData/stage5_media_enrich/output")
DEFAULT_CANDIDATES = DEFAULT_OUTPUT_DIR / "image_event_candidates.jsonl"
DEFAULT_APPROVED = Path("crawData/stage5_media_enrich/config/approved_event_image_mappings.json")
DEFAULT_CORE_EVENTS = Path("crawData/stage4b_curate_tree/output/phase2/core_events.jsonl")
DEFAULT_DECISIONS = DEFAULT_OUTPUT_DIR / "manual_review_decisions.json"
DEFAULT_EXPORT = DEFAULT_OUTPUT_DIR / "proposed_approved_mappings.json"


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def slash(path: str | Path) -> str:
    return str(path).replace("\\", "/")


def decode_url_component(value: str) -> str:
    decoded = value
    for _ in range(3):
        next_value = unquote(decoded)
        if next_value == decoded:
            return decoded
        decoded = next_value
    return decoded


def load_json(path: Path, default: Any | None = None) -> Any:
    if not path.exists():
        if default is not None:
            return default
        raise FileNotFoundError(path)
    return json.loads(path.read_text(encoding="utf-8"))


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_no, line in enumerate(handle, start=1):
            stripped = line.strip()
            if not stripped:
                continue
            value = json.loads(stripped)
            if not isinstance(value, dict):
                raise ValueError(f"Expected object at {path}:{line_no}")
            records.append(value)
    return records


def atomic_write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    temp.replace(path)


def tokenize(value: Any) -> set[str]:
    text = str(value or "").casefold()
    return {
        token
        for token in re.findall(r"[\wÀ-ỹ]+", text, flags=re.UNICODE)
        if len(token) >= 3
    }


def years_from_text(text: str) -> set[int]:
    years: set[int] = set()
    for match in re.finditer(r"(?<!\d)(\d{3,4})(?!\d)", text or ""):
        try:
            year = int(match.group(1))
        except ValueError:
            continue
        if year != 0:
            years.add(year)
    return years


def event_years(event: dict[str, Any]) -> set[int]:
    chronology = event.get("chronology") or {}
    years = years_from_text(str(chronology.get("displayDate") or ""))
    for boundary in ("start", "end"):
        year = (chronology.get(boundary) or {}).get("year")
        if isinstance(year, int) and year != 0:
            years.add(year)
    return years


def text_blob_for_event(event: dict[str, Any]) -> str:
    titles = event.get("titles") or {}
    summary = event.get("summary") or {}
    textbook = event.get("textbookContent") or {}
    facts = textbook.get("keyFacts") or []
    locations = (event.get("mapData") or {}).get("historicalLocations") or []
    return " ".join(
        str(part or "")
        for part in [
            event.get("id"),
            event.get("slug"),
            titles.get("primary"),
            titles.get("short"),
            " ".join(titles.get("alternatives") or []),
            summary.get("homepageTitle"),
            summary.get("homepageSummary"),
            summary.get("cardSummary"),
            textbook.get("canonicalSummary"),
            textbook.get("detailedNarrative"),
            " ".join(str(fact) for fact in facts),
            " ".join(str(location) for location in locations),
        ]
    )


@dataclass(frozen=True)
class RankedSuggestion:
    event_id: str
    title: str
    display_date: str | None
    score: int
    reason: str
    origin: str


class ManualReviewState:
    def __init__(
        self,
        *,
        repo_root: Path,
        candidates_path: Path = DEFAULT_CANDIDATES,
        approved_path: Path = DEFAULT_APPROVED,
        core_events_path: Path = DEFAULT_CORE_EVENTS,
        decisions_path: Path = DEFAULT_DECISIONS,
        export_path: Path = DEFAULT_EXPORT,
    ) -> None:
        self.repo_root = repo_root.resolve()
        self.candidates_path = self._resolve(candidates_path)
        self.approved_path = self._resolve(approved_path)
        self.core_events_path = self._resolve(core_events_path)
        self.decisions_path = self._resolve(decisions_path)
        self.export_path = self._resolve(export_path)
        self.image_root = self.repo_root / "crawData/stage1_crawl/images"
        self.candidates = load_jsonl(self.candidates_path)
        self.events = load_jsonl(self.core_events_path)
        self.event_by_id = {str(event.get("id")): event for event in self.events if event.get("id")}
        self.approved = load_json(self.approved_path, {"version": 1, "mappings": []})
        self.decisions = self._load_decisions()
        self._validate_sources()

    def _resolve(self, path: Path) -> Path:
        return path if path.is_absolute() else (self.repo_root / path)

    def _load_decisions(self) -> dict[str, Any]:
        data = load_json(self.decisions_path, {"version": 1, "decisions": {}, "history": []})
        if not isinstance(data, dict):
            raise ValueError(f"Decision file is not an object: {self.decisions_path}")
        data.setdefault("version", 1)
        data.setdefault("decisions", {})
        data.setdefault("history", [])
        return data

    def _save_decisions(self) -> None:
        atomic_write_json(self.decisions_path, self.decisions)

    def _validate_sources(self) -> None:
        for candidate in self.candidates:
            source = candidate.get("sourceImage")
            if not source:
                continue
            path = self._source_path(candidate)
            try:
                path.resolve().relative_to(self.repo_root)
            except ValueError as exc:
                raise ValueError(f"Image source escapes repository root: {source}") from exc

    def _source_path(self, candidate: dict[str, Any]) -> Path:
        source = Path(str(candidate.get("sourceImage") or ""))
        return source if source.is_absolute() else self.repo_root / source

    def approved_source_images(self) -> set[str]:
        return {
            slash(mapping.get("sourceImage") or "")
            for mapping in self.approved.get("mappings", [])
            if mapping.get("status") == STATUS_APPROVED
        }

    def approved_hashes(self) -> set[str]:
        approved_sources = self.approved_source_images()
        return {
            str(candidate.get("contentHash"))
            for candidate in self.candidates
            if slash(candidate.get("sourceImage") or "") in approved_sources and candidate.get("contentHash")
        }

    def reviewed_hashes(self) -> set[str]:
        by_id = {str(candidate.get("imageId")): candidate for candidate in self.candidates}
        hashes: set[str] = set()
        for image_id, decision in self.decisions.get("decisions", {}).items():
            if decision.get("status") == STATUS_SKIPPED:
                continue
            content_hash = by_id.get(str(image_id), {}).get("contentHash")
            if content_hash:
                hashes.add(str(content_hash))
        return hashes

    def is_excluded(self, candidate: dict[str, Any], seen_hashes: set[str] | None = None) -> bool:
        if candidate.get("mappingStatus") == "invalid":
            return True
        source = slash(candidate.get("sourceImage") or "")
        content_hash = str(candidate.get("contentHash") or "")
        if source in self.approved_source_images() or (content_hash and content_hash in self.approved_hashes()):
            return True
        decision = self.decisions.get("decisions", {}).get(str(candidate.get("imageId")))
        if decision and decision.get("status") != STATUS_SKIPPED:
            return True
        if content_hash and content_hash in self.reviewed_hashes():
            return True
        if seen_hashes is not None and content_hash:
            if content_hash in seen_hashes:
                return True
            seen_hashes.add(content_hash)
        return False

    def review_queue(self) -> list[dict[str, Any]]:
        seen_hashes: set[str] = set()
        remaining = [
            candidate
            for candidate in self.candidates
            if not self.is_excluded(candidate, seen_hashes)
        ]
        return sorted(
            remaining,
            key=lambda item: (
                1
                if self.decisions.get("decisions", {})
                .get(str(item.get("imageId")), {})
                .get("status")
                == STATUS_SKIPPED
                else 0,
                int(item.get("grade") or 0),
                str(item.get("lessonId") or ""),
                int(item.get("imageOrder") or item.get("imageIndex") or 0),
                str(item.get("imageId") or ""),
            ),
        )

    def progress(self) -> dict[str, int]:
        decisions = self.decisions.get("decisions", {})
        approved = sum(1 for value in decisions.values() if value.get("status") == STATUS_APPROVED)
        deferred = sum(1 for value in decisions.values() if value.get("status") == STATUS_DEFERRED)
        no_suitable = sum(1 for value in decisions.values() if value.get("status") == STATUS_NO_SUITABLE)
        reviewed = approved + deferred + no_suitable
        remaining = len(self.review_queue())
        return {
            "total": reviewed + remaining,
            "reviewed": reviewed,
            "approved": approved,
            "deferred": deferred,
            "noSuitableEvent": no_suitable,
            "remaining": remaining,
        }

    def _events_for_lesson(self, lesson_id: str) -> list[dict[str, Any]]:
        matches: list[dict[str, Any]] = []
        for event in self.events:
            refs = ((event.get("textbookContent") or {}).get("textbookRefs") or [])
            if any(str((ref or {}).get("lessonId") or "") == lesson_id for ref in refs if isinstance(ref, dict)):
                matches.append(event)
        return matches

    def _score_suggestion(
        self,
        *,
        event: dict[str, Any],
        candidate: dict[str, Any],
        candidate_ids: set[str],
        image_tokens: set[str],
        query_tokens: set[str],
        image_years: set[int],
        lesson_id: str,
        origin: str,
    ) -> RankedSuggestion | None:
        event_id = str(event.get("id") or "")
        event_text = text_blob_for_event(event)
        event_tokens = tokenize(event_text)
        overlap = image_tokens & event_tokens
        refs = ((event.get("textbookContent") or {}).get("textbookRefs") or [])
        same_lesson = any(str((ref or {}).get("lessonId") or "") == lesson_id for ref in refs if isinstance(ref, dict))
        score = 0
        reasons: list[str] = [origin]
        contradiction = False

        if event_id in candidate_ids:
            score += 100
            reasons.append("existing candidate")
        if same_lesson:
            score += 40
            reasons.append("same lesson evidence")
        if overlap:
            token_score = min(30, len(overlap) * 3)
            score += token_score
            reasons.append(f"caption/title/context token match: {', '.join(sorted(overlap)[:5])}")
        if query_tokens:
            query_overlap = query_tokens & event_tokens
            if query_overlap:
                score += min(80, len(query_overlap) * 25)
                reasons.append(f"search match: {', '.join(sorted(query_overlap)[:5])}")
        if (event.get("eventLevel") or "") == "atomic":
            score += 10
            reasons.append("specific event")
        else:
            score -= 3
            reasons.append("less specific collection")

        related_years = event_years(event)
        if image_years and related_years:
            if image_years & related_years:
                score += 12
                reasons.append("chronology match")
            else:
                nearest = min(abs(a - b) for a in image_years for b in related_years)
                if nearest > 20:
                    score -= 80
                    contradiction = True
                    reasons.append("date contradiction excluded")
                else:
                    score += 3
                    reasons.append("nearby chronology")

        # Keep the review list useful: never pad with strong contradictions,
        # and require at least one positive signal for expanded-search filler.
        if contradiction:
            return None
        if origin == "EXPANDED SEARCH" and score <= 10 and not query_tokens:
            return None

        title = ((event.get("titles") or {}).get("primary") or event_id).strip()
        display_date = (event.get("chronology") or {}).get("displayDate")
        return RankedSuggestion(
            event_id=event_id,
            title=title,
            display_date=display_date,
            score=score,
            reason="; ".join(reasons),
            origin=origin,
        )

    def rank_suggestions(self, candidate: dict[str, Any], *, query: str = "", limit: int = 5) -> list[RankedSuggestion]:
        candidate_ids = [str(item.get("eventId")) for item in candidate.get("candidateEvents") or [] if item.get("eventId")]
        image_text = " ".join(
            str(part or "")
            for part in [
                candidate.get("caption"),
                candidate.get("alt"),
                candidate.get("lessonTitle"),
                query,
            ]
        )
        image_tokens = tokenize(image_text)
        query_tokens = tokenize(query)
        image_years = years_from_text(image_text)
        lesson_id = "" if candidate.get("mappingStatus") == "unresolved" else str(candidate.get("lessonId") or "")
        candidate_id_set = set(candidate_ids)
        stages: list[tuple[str, list[dict[str, Any]]]]
        if query or candidate.get("mappingStatus") == "unresolved":
            stages = [("EXPANDED SEARCH", self.events)]
        else:
            stages = [
                ("ORIGINAL CANDIDATE", [self.event_by_id[event_id] for event_id in candidate_ids if event_id in self.event_by_id]),
                ("SAME LESSON", self._events_for_lesson(lesson_id)),
                ("EXPANDED SEARCH", self.events),
            ]

        selected: dict[str, RankedSuggestion] = {}
        for origin, events in stages:
            ranked_stage: list[RankedSuggestion] = []
            for event in events:
                event_id = str(event.get("id") or "")
                if not event_id or event_id in selected:
                    continue
                suggestion = self._score_suggestion(
                    event=event,
                    candidate=candidate,
                    candidate_ids=candidate_id_set,
                    image_tokens=image_tokens,
                    query_tokens=query_tokens,
                    image_years=image_years,
                    lesson_id=lesson_id,
                    origin=origin,
                )
                if suggestion is not None:
                    ranked_stage.append(suggestion)
            ranked_stage.sort(key=lambda item: (-item.score, item.event_id))
            for suggestion in ranked_stage:
                selected[suggestion.event_id] = suggestion
                if len(selected) >= limit:
                    return list(selected.values())[:limit]

        return list(selected.values())[:limit]

    def current_payload(self) -> dict[str, Any]:
        queue = self.review_queue()
        current = queue[0] if queue else None
        suggestions = self.rank_suggestions(current) if current else []
        return {
            "progress": self.progress(),
            "current": current,
            "suggestions": [suggestion.__dict__ for suggestion in suggestions],
        }

    def search(self, image_id: str, query: str) -> list[dict[str, Any]]:
        candidate = self._candidate_by_id(image_id)
        return [suggestion.__dict__ for suggestion in self.rank_suggestions(candidate, query=query, limit=10)]

    def _candidate_by_id(self, image_id: str) -> dict[str, Any]:
        image_id = decode_url_component(image_id)
        for candidate in self.candidates:
            if str(candidate.get("imageId")) == image_id:
                return candidate
        raise KeyError(image_id)

    def decide(self, image_id: str, status: str, event_id: str | None = None, note: str = "") -> dict[str, Any]:
        candidate = self._candidate_by_id(image_id)
        if status == STATUS_APPROVED:
            if not event_id or event_id not in self.event_by_id:
                raise ValueError("Approved decisions require a valid eventId")
        elif status not in {STATUS_DEFERRED, STATUS_NO_SUITABLE, STATUS_SKIPPED}:
            raise ValueError(f"Unsupported decision status: {status}")

        previous = self.decisions["decisions"].get(image_id)
        decision = {
            "imageId": image_id,
            "sourceImage": slash(candidate.get("sourceImage") or ""),
            "contentHash": candidate.get("contentHash"),
            "lessonId": str(candidate.get("lessonId") or ""),
            "grade": candidate.get("grade"),
            "status": status,
            "eventId": event_id,
            "note": note.strip(),
        }
        self.decisions["decisions"][image_id] = decision
        self.decisions["history"].append({"imageId": image_id, "previous": previous})
        self._save_decisions()
        return decision

    def undo(self) -> dict[str, Any]:
        history = self.decisions.get("history") or []
        if not history:
            raise ValueError("No decision to undo")
        entry = history.pop()
        image_id = entry["imageId"]
        previous = entry.get("previous")
        if previous is None:
            self.decisions["decisions"].pop(image_id, None)
        else:
            self.decisions["decisions"][image_id] = previous
        self._save_decisions()
        return {"undoneImageId": image_id}

    def export_proposed(self) -> dict[str, Any]:
        mappings: list[dict[str, Any]] = []
        for image_id, decision in sorted(self.decisions.get("decisions", {}).items()):
            if decision.get("status") != STATUS_APPROVED:
                continue
            candidate = self._candidate_by_id(image_id)
            event_id = decision.get("eventId")
            mappings.append(
                {
                    "sourceImage": slash(candidate.get("sourceImage") or ""),
                    "lessonId": str(candidate.get("lessonId") or ""),
                    "altText": str(candidate.get("alt") or ""),
                    "status": STATUS_APPROVED,
                    "targets": [
                        {
                            "eventId": event_id,
                            "isThumbnail": True,
                            "sortOrder": 1,
                            "reviewNote": decision.get("note")
                            or f"Manual review approved {image_id} for {event_id}.",
                        }
                    ],
                }
            )
        mappings.sort(key=lambda item: (str(item.get("sourceImage")), str(item["targets"][0].get("eventId"))))
        payload = {"version": 1, "mappings": mappings}
        atomic_write_json(self.export_path, payload)
        return {"exportPath": slash(self.export_path.relative_to(self.repo_root)), "mappingCount": len(mappings)}

    def image_path_for(self, image_id: str) -> Path:
        candidate = self._candidate_by_id(image_id)
        path = self._source_path(candidate).resolve()
        path.relative_to(self.image_root.resolve())
        if not path.is_file():
            raise FileNotFoundError(f"Image file not found: {candidate.get('sourceImage')}")
        return path


INDEX_HTML = """<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <title>Stage5 manual image review</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #f7f7f5; color: #20201d; }
    header { display: flex; gap: 16px; align-items: center; padding: 12px 18px; border-bottom: 1px solid #ddd; background: #fff; position: sticky; top: 0; }
    main { display: grid; grid-template-columns: minmax(420px, 1.2fr) minmax(360px, .8fr); gap: 18px; padding: 18px; }
    img { max-width: 100%; max-height: 72vh; object-fit: contain; background: #fff; border: 1px solid #ddd; }
    .panel { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 14px; }
    .muted { color: #666; }
    .suggestion { border-top: 1px solid #eee; padding: 10px 0; }
    button { margin: 4px 4px 4px 0; padding: 7px 10px; cursor: pointer; }
    input { width: 70%; padding: 7px; }
    kbd { background: #eee; border: 1px solid #ccc; padding: 1px 5px; border-radius: 4px; }
  </style>
</head>
<body>
  <header>
    <strong>Stage5 manual review</strong>
    <span id="progress" class="muted"></span>
    <button onclick="exportMappings()">Export proposed mappings</button>
    <button onclick="undo()">Undo</button>
  </header>
  <main>
    <section class="panel">
      <div id="image"></div>
      <h2 id="caption"></h2>
      <p id="context" class="muted"></p>
    </section>
    <section class="panel">
      <h3>Suggestions</h3>
      <div id="suggestions"></div>
      <p>
        <button onclick="approveSingle()">A approve single/top</button>
        <button onclick="decide('deferred')">D defer</button>
        <button onclick="decide('no_suitable_event')">N no suitable event</button>
        <button onclick="decide('skipped')">S skip</button>
      </p>
      <p>
        <input id="searchBox" placeholder="Search all events">
        <button onclick="search()">Search</button>
      </p>
      <pre id="message"></pre>
    </section>
  </main>
  <script>
    let state = null;
    async function api(path, options) {
      const response = await fetch(path, options);
      const text = await response.text();
      const body = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(body.error || response.statusText);
      return body;
    }
    function setMessage(value) { document.getElementById('message').textContent = value || ''; }
    async function load() {
      state = await api('/api/state');
      const p = state.progress;
      document.getElementById('progress').textContent =
        `total ${p.total} | reviewed ${p.reviewed} | approved ${p.approved} | deferred ${p.deferred} | no suitable ${p.noSuitableEvent} | remaining ${p.remaining}`;
      const item = state.current;
      if (!item) {
        document.getElementById('image').innerHTML = '<p>Review queue complete.</p>';
        document.getElementById('caption').textContent = '';
        document.getElementById('context').textContent = '';
        document.getElementById('suggestions').innerHTML = '';
        return;
      }
      document.getElementById('image').innerHTML = `<img src="/image/${encodeURIComponent(item.imageId)}" alt="">`;
      document.getElementById('caption').textContent = item.caption || item.alt || '(no caption)';
      document.getElementById('context').textContent =
        `grade ${item.grade} | lesson ${item.lessonId} | ${item.lessonTitle || ''} | status ${item.mappingStatus}`;
      renderSuggestions(state.suggestions);
    }
    function renderSuggestions(items) {
      const host = document.getElementById('suggestions');
      host.innerHTML = '';
      items.slice(0, 5).forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'suggestion';
        div.innerHTML = `<button onclick="choose(${index})">${index + 1}</button>
          <strong>${item.title}</strong><br><span class="muted">${item.event_id} | ${item.display_date || ''} | score ${item.score}</span>
          <br><span><kbd>${item.origin}</kbd></span>
          <p>${item.reason}</p>`;
        host.appendChild(div);
      });
    }
    async function choose(index) {
      const suggestion = state.suggestions[index];
      if (!suggestion) return;
      await api('/api/decision', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({imageId: state.current.imageId, status: 'approved', eventId: suggestion.event_id, note: suggestion.reason})
      });
      await load();
    }
    async function approveSingle() { await choose(0); }
    async function decide(status) {
      await api('/api/decision', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({imageId: state.current.imageId, status})
      });
      await load();
    }
    async function undo() { setMessage(JSON.stringify(await api('/api/undo', {method: 'POST'}), null, 2)); await load(); }
    async function exportMappings() { setMessage(JSON.stringify(await api('/api/export', {method: 'POST'}), null, 2)); }
    async function search() {
      const query = encodeURIComponent(document.getElementById('searchBox').value || '');
      state.suggestions = await api(`/api/search?imageId=${encodeURIComponent(state.current.imageId)}&q=${query}`);
      renderSuggestions(state.suggestions);
    }
    window.addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase();
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
      if (/^[1-5]$/.test(key)) choose(Number(key) - 1);
      if (key === 'a') approveSingle();
      if (key === 'd') decide('deferred');
      if (key === 'n') decide('no_suitable_event');
      if (key === 's') decide('skipped');
      if (key === 'u') undo();
    });
    load().catch(error => setMessage(error.stack || String(error)));
  </script>
</body>
</html>
"""


class ReviewHandler(BaseHTTPRequestHandler):
    state: ManualReviewState

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/":
                self._send_bytes(INDEX_HTML.encode("utf-8"), "text/html; charset=utf-8")
            elif parsed.path == "/api/state":
                self._send_json(self.state.current_payload())
            elif parsed.path == "/api/search":
                params = parse_qs(parsed.query)
                self._send_json(self.state.search(params.get("imageId", [""])[0], params.get("q", [""])[0]))
            elif parsed.path.startswith("/image/"):
                image_id = decode_url_component(parsed.path.removeprefix("/image/"))
                path = self.state.image_path_for(image_id)
                mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
                self._send_bytes(path.read_bytes(), mime)
            else:
                self.send_error(HTTPStatus.NOT_FOUND)
        except Exception as exc:  # pragma: no cover - server safety path
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)

    def do_POST(self) -> None:  # noqa: N802
        try:
            if self.path == "/api/decision":
                payload = self._read_json()
                self._send_json(
                    self.state.decide(
                        str(payload.get("imageId") or ""),
                        str(payload.get("status") or ""),
                        payload.get("eventId"),
                        str(payload.get("note") or ""),
                    )
                )
            elif self.path == "/api/undo":
                self._send_json(self.state.undo())
            elif self.path == "/api/export":
                self._send_json(self.state.export_proposed())
            else:
                self.send_error(HTTPStatus.NOT_FOUND)
        except Exception as exc:  # pragma: no cover - server safety path
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)

    def _read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("content-length") or "0")
        if length <= 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def _send_json(self, payload: Any, status: HTTPStatus = HTTPStatus.OK) -> None:
        self._send_bytes(
            json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8"),
            "application/json; charset=utf-8",
            status,
        )

    def _send_bytes(self, payload: bytes, content_type: str, status: HTTPStatus = HTTPStatus.OK) -> None:
        self.send_response(status)
        self.send_header("content-type", content_type)
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the local Stage5 manual image review browser.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--repo-root", type=Path, default=Path.cwd())
    parser.add_argument("--candidates", type=Path, default=DEFAULT_CANDIDATES)
    parser.add_argument("--approved", type=Path, default=DEFAULT_APPROVED)
    parser.add_argument("--core-events", type=Path, default=DEFAULT_CORE_EVENTS)
    parser.add_argument("--decisions", type=Path, default=DEFAULT_DECISIONS)
    parser.add_argument("--export", type=Path, default=DEFAULT_EXPORT)
    parser.add_argument("--open", action="store_true", help="Open the local review URL in the default browser.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    state = ManualReviewState(
        repo_root=args.repo_root,
        candidates_path=args.candidates,
        approved_path=args.approved,
        core_events_path=args.core_events,
        decisions_path=args.decisions,
        export_path=args.export,
    )
    ReviewHandler.state = state
    server = ThreadingHTTPServer((args.host, args.port), ReviewHandler)
    url = f"http://{args.host}:{args.port}/"
    print(f"Stage5 manual review tool: {url}")
    print("Decisions:", slash(state.decisions_path.relative_to(state.repo_root)))
    print("Export:", slash(state.export_path.relative_to(state.repo_root)))
    if args.open:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
