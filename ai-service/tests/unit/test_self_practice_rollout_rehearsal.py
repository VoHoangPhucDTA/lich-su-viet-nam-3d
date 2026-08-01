import hashlib
import json
from pathlib import Path

import pytest

from scripts import rehearse_self_practice_rollout as rehearsal


def test_offline_rehearsal_covers_activation_failure_rollback_and_redaction() -> None:
    report = rehearsal.build_report()

    assert report["status"] == rehearsal.STATUS_PASS
    assert all(report["checks"].values())
    assert report["liveSmoke"] == "LIVE_SMOKE_NOT_RUN"
    assert report["concurrency"] == {
        "currentRequests": 16,
        "candidateRequests": 16,
        "modelClassIsolation": True,
        "deadlineIsolation": True,
        "repairTraceIsolation": True,
        "currentPoolCloseCount": 1,
        "candidatePoolCloseCount": 1,
        "retrievalCloseCount": 1,
        "shutdownIdempotent": True,
    }
    assert all(item["noFallback"] for item in report["failures"])
    assert report["rollback"]["before"] == "CANDIDATE"
    assert report["rollback"]["after"] == "CURRENT"
    assert report["redaction"]["pass"] is True


def test_rehearsal_artifacts_are_content_free_and_checksummed(tmp_path: Path) -> None:
    output = tmp_path / "run-1"
    report = rehearsal.build_report()

    rehearsal.write_artifacts(output, report)

    expected = {
        "manifest.json",
        "scenario-results.json",
        "routing-matrix.csv",
        "lifecycle-summary.json",
        "rollback-summary.json",
        "redaction-summary.json",
        "checksums.sha256",
    }
    assert {path.name for path in output.iterdir()} == expected
    combined = "\n".join(
        path.read_text(encoding="utf-8")
        for path in output.iterdir()
        if path.suffix in {".json", ".csv"}
    )
    assert "synthetic-subject" not in combined
    assert "rehearsal-model" not in combined
    checksum_rows = (output / "checksums.sha256").read_text(encoding="utf-8").splitlines()
    assert len(checksum_rows) == 6
    for row in checksum_rows:
        digest, name = row.split("  ", maxsplit=1)
        assert digest == hashlib.sha256((output / name).read_bytes()).hexdigest()


def test_rehearsal_cli_writes_pass_manifest_and_rejects_unsafe_run_id(
    tmp_path: Path, capsys
) -> None:
    assert rehearsal.main(["--output-root", str(tmp_path), "--run-id", "safe-run"]) == 0
    assert capsys.readouterr().out.strip() == rehearsal.STATUS_PASS
    manifest = json.loads((tmp_path / "safe-run" / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["providerCalls"] == 0
    assert manifest["productionChanged"] is False

    with pytest.raises(SystemExit, match="run-id must contain"):
        rehearsal.main(["--output-root", str(tmp_path), "--run-id", "../unsafe"])
