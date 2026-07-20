"""Conservative tracked-file secret scan for CI; never prints matched values."""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PATTERNS = {
    "google-api-key": re.compile(rb"AIza[0-9A-Za-z_-]{30,}"),
    "private-key": re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "github-token": re.compile(rb"gh[oprsu]_[0-9A-Za-z]{30,}"),
}
ALLOW = {"scripts/ci/secret_scan.py"}


def main() -> int:
    tracked = subprocess.check_output(
        ["git", "ls-files", "-z"], cwd=ROOT
    ).split(b"\0")
    findings: list[tuple[str, str]] = []
    for raw_name in tracked:
        if not raw_name:
            continue
        name = raw_name.decode("utf-8", errors="surrogateescape").replace("\\", "/")
        if name in ALLOW:
            continue
        path = ROOT / name
        try:
            content = path.read_bytes()
        except OSError:
            continue
        for kind, pattern in PATTERNS.items():
            if pattern.search(content):
                findings.append((name, kind))
    for name, kind in findings:
        print(f"potential secret: file={name} type={kind} value=<redacted>")
    print(f"secret scan: files={len(tracked)} findings={len(findings)}")
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
