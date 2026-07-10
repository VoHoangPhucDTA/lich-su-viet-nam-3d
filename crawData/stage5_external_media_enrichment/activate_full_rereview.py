#!/usr/bin/env python3
"""Safely activate the completed full Stage5 re-review as the approved base config.

The completed re-review supersedes the old 4-item approved config. This command is
DRY-RUN by default: it copies the reviewed mapping to a preview, validates that
preview with the repository's own validate_approved_mappings.py, and only replaces
the live approved config when --apply is supplied.

It intentionally does not rebuild the reviewed mapping from manual decisions:
the final reviewed artifact already contains the one-thumbnail-per-event and
gallery sort-order arbitration needed by the current validator.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def atomic_copy(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    tmp = destination.with_name(destination.name + ".tmp")
    completed = False
    try:
        shutil.copy2(source, tmp)
        os.replace(tmp, destination)
        completed = True
    finally:
        if not completed and tmp.exists():
            tmp.unlink()


def mapping_stats(payload: dict[str, Any]) -> dict[str, int]:
    mappings = payload.get("mappings") or []
    targets = [target for mapping in mappings for target in (mapping.get("targets") or [])]
    return {
        "approvedImages": len(mappings),
        "relationships": len(targets),
        "targetEvents": len({str(target.get("eventId")) for target in targets if target.get("eventId")}),
        "thumbnails": sum(1 for target in targets if target.get("isThumbnail") is True),
        "galleryRelationships": sum(1 for target in targets if target.get("isThumbnail") is not True),
    }


def main() -> int:
    script = Path(__file__).resolve()
    parser = argparse.ArgumentParser(description="Dry-run/activate the completed full Stage5 re-review mapping.")
    parser.add_argument("--reviewed-mappings", required=True)
    parser.add_argument("--approved-mappings", required=True)
    parser.add_argument("--candidates", required=True)
    parser.add_argument("--core-events", required=True)
    parser.add_argument("--validator", required=True, help="Path to validate_approved_mappings.py")
    parser.add_argument("--preview-output", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    reviewed = Path(args.reviewed_mappings).resolve()
    approved = Path(args.approved_mappings).resolve()
    candidates = Path(args.candidates).resolve()
    core_events = Path(args.core_events).resolve()
    validator = Path(args.validator).resolve()
    preview = Path(args.preview_output).resolve()

    for path, label in [
        (reviewed, "reviewed mappings"),
        (candidates, "candidates"),
        (core_events, "core events"),
        (validator, "validator"),
    ]:
        if not path.is_file():
            raise SystemExit(f"Missing {label}: {path}")

    payload = load_json(reviewed)
    if not isinstance(payload, dict) or payload.get("version") != 1 or not isinstance(payload.get("mappings"), list):
        raise SystemExit("Reviewed mapping artifact is not a valid version-1 approved mapping file.")

    atomic_copy(reviewed, preview)
    cmd = [
        sys.executable,
        "-X",
        "utf8",
        str(validator),
        "--approved-mappings",
        str(preview),
        "--candidates",
        str(candidates),
        "--core-events",
        str(core_events),
    ]
    validation = subprocess.run(cmd, text=True, encoding="utf-8", capture_output=True)
    if validation.stdout:
        print(validation.stdout.rstrip())
    if validation.stderr:
        print(validation.stderr.rstrip(), file=sys.stderr)
    if validation.returncode != 0:
        print(json.dumps({"apply": False, "validated": False, "preview": str(preview)}, ensure_ascii=False))
        return validation.returncode

    result: dict[str, Any] = {
        "apply": bool(args.apply),
        "validated": True,
        "preview": str(preview),
        **mapping_stats(payload),
    }

    if args.apply:
        approved.parent.mkdir(parents=True, exist_ok=True)
        if approved.exists():
            stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            backup = approved.with_name(f"{approved.stem}.pre_full_rereview_{stamp}{approved.suffix}")
            shutil.copy2(approved, backup)
            result["backup"] = str(backup)
        atomic_copy(preview, approved)
        result["approvedMappings"] = str(approved)

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
