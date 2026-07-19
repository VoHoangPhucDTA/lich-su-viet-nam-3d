#!/usr/bin/env python3
"""Validate downloaded/reviewed external media before Stage5 integration."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any
import urllib.parse

ALLOWED_RELATIONS = {"direct", "strong_contextual"}


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def normalize_decisions(value: Any) -> dict[str, Any]:
    if isinstance(value, dict) and isinstance(value.get("decisions"), dict):
        return value["decisions"]
    return value if isinstance(value, dict) else {}


def trusted_url(url: str, domains: list[str]) -> bool:
    try:
        host = (urllib.parse.urlparse(url).hostname or "").lower().strip(".")
    except Exception:
        return False
    return any(host == domain.lower() or host.endswith("." + domain.lower()) for domain in domains)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", required=True)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--decisions", default="")
    parser.add_argument("--media-root", required=True)
    parser.add_argument("--require-all-reviewed", action="store_true")
    args = parser.parse_args()

    plan = load_json(Path(args.plan))
    manifest = load_json(Path(args.manifest))
    decisions = normalize_decisions(load_json(Path(args.decisions))) if args.decisions else {}
    root = Path(args.media_root).resolve()

    expected_ids = {row["eventId"] for row in plan.get("events") or []}
    rows = {row["eventId"]: row for row in manifest.get("events") or [] if row.get("eventId")}
    errors: list[str] = []
    warnings: list[str] = []
    all_hashes: dict[str, list[str]] = {}

    missing_records = expected_ids - set(rows)
    extra_records = set(rows) - expected_ids
    if missing_records: errors.append(f"manifest missing {len(missing_records)} event records")
    if extra_records: errors.append(f"manifest has {len(extra_records)} unexpected event records")

    ready = approved = 0
    for event_id in sorted(expected_ids):
        row = rows.get(event_id)
        if row is None: continue
        images = row.get("images") or []
        if row.get("status") == "ready_for_review": ready += 1
        if len(images) != 2:
            warnings.append(f"{event_id}: expected 2 downloaded images, got {len(images)}")
        event_hashes: set[str] = set()
        for image in images:
            digest = str(image.get("sha256") or "")
            source_image = str(image.get("sourceImage") or "")
            if not digest or len(digest) != 64: errors.append(f"{event_id}: invalid sha256")
            if digest in event_hashes: errors.append(f"{event_id}: duplicate physical image within event")
            event_hashes.add(digest)
            all_hashes.setdefault(digest, []).append(event_id)
            local = (root.parent / source_image).resolve()
            try: local.relative_to(root.parent)
            except Exception: errors.append(f"{event_id}: sourceImage escapes media package")
            if not local.is_file(): errors.append(f"{event_id}: missing local image {source_image}")
            elif sha256_file(local) != digest: errors.append(f"{event_id}: file hash mismatch {source_image}")
            if not image.get("sourcePageUrl"): errors.append(f"{event_id}: missing sourcePageUrl")
            if not image.get("downloadUrl"): errors.append(f"{event_id}: missing downloadUrl")
            if not image.get("license"): warnings.append(f"{event_id}: missing explicit license metadata")
            if image.get("relationType") not in ALLOWED_RELATIONS: warnings.append(f"{event_id}: relationType is not direct/strong_contextual")

        if decisions:
            decision = decisions.get(event_id) or {}
            status = decision.get("status")
            if status == "approved":
                approved += 1
                if len(images) != 2: errors.append(f"{event_id}: approved without exactly 2 images")
                dimgs = decision.get("images") or []
                if len(dimgs) != 2 or not all(isinstance(x, dict) and bool(x.get("approved")) for x in dimgs):
                    errors.append(f"{event_id}: event approved but both slots are not approved")
                else:
                    for slot_index, decision_image in enumerate(dimgs):
                        image = images[slot_index] if slot_index < len(images) else {}
                        url = str(
                            decision_image.get("historicalVerificationUrl")
                            or image.get("historicalVerificationUrl")
                            or ""
                        ).strip()
                        domains = [str(x) for x in (image.get("preferredVerificationDomains") or []) if x]
                        if not url:
                            errors.append(f"{event_id}: approved slot {slot_index + 1} missing historical verification URL")
                        elif domains and not trusted_url(url, domains):
                            errors.append(
                                f"{event_id}: approved slot {slot_index + 1} verification URL outside trusted domains: {url}"
                            )
                        relation = str(decision_image.get("relationType") or image.get("relationType") or "")
                        if relation not in ALLOWED_RELATIONS:
                            errors.append(f"{event_id}: approved slot {slot_index + 1} invalid relationType {relation!r}")
            elif args.require_all_reviewed and status not in {"needs_replacement", "no_suitable"}:
                errors.append(f"{event_id}: missing final review decision")

    report = {
        "expectedEvents": len(expected_ids),
        "manifestEvents": len(rows),
        "readyForReview": ready,
        "approvedEvents": approved,
        "imageAssignments": sum(len(row.get("images") or []) for row in rows.values()),
        "uniquePhysicalImages": len(all_hashes),
        "sharedPhysicalImages": sum(1 for events in all_hashes.values() if len(set(events)) > 1),
        "warnings": sorted(warnings),
        "errors": sorted(errors),
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if errors else 0

if __name__ == "__main__":
    raise SystemExit(main())
