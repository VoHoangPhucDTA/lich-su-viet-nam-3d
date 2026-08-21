"""Platform-stable identity for canonical line-oriented text assets."""

import hashlib
from pathlib import Path


def canonical_jsonl_sha256(path: Path) -> str:
    """Hash JSONL bytes after normalizing only physical line endings to LF."""
    normalized = path.read_bytes().replace(b"\r\n", b"\n").replace(b"\r", b"\n")
    return hashlib.sha256(normalized).hexdigest()
