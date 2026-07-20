"""Validate that the externally provisioned canonical History RAG package exists."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

EXPECTED_WORKBOOK = "001751243f659c449c6622ff7b417ad74fc12cf2f72dcf59305fad11bca6ee4c"
EXPECTED_PACKAGE = "25fea8369332b6585cab9d81ca60e9dbae6b6ffcd7cc350600a6e4878246a529"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--package-dir", type=Path, required=True)
    args = parser.parse_args()
    manifest_path = args.package_dir / "manifest.json"
    if not manifest_path.is_file():
        raise SystemExit(
            f"History RAG artifact is required but missing: {manifest_path}. "
            "Provision the audited external package; synthetic data is not accepted."
        )
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("workbookSha256") != EXPECTED_WORKBOOK:
        raise SystemExit("History RAG workbook identity mismatch")
    if manifest.get("packageSha256") != EXPECTED_PACKAGE:
        raise SystemExit("History RAG package identity mismatch")
    for name, expected in manifest.get("files", {}).items():
        path = args.package_dir / name
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise SystemExit(f"History RAG file checksum mismatch: {name}")
    print(f"History RAG package validated: version={manifest.get('packageVersion')} files={len(manifest.get('files', {}))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
