import subprocess
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


def git_paths(*arguments: str) -> set[str]:
    result = subprocess.run(
        ["git", "-C", str(REPOSITORY_ROOT), *arguments, "-z"],
        check=True,
        capture_output=True,
    )
    output = result.stdout.decode("utf-8", errors="surrogateescape")
    return {path for path in output.split("\0") if path}


def is_python_runtime_artifact(path: str) -> bool:
    normalized = "/" + path.replace("\\", "/")
    return (
        "/__pycache__/" in normalized
        or normalized.endswith(".pyc")
        or normalized.endswith(".pyo")
    )


def test_repository_does_not_track_python_runtime_artifacts() -> None:
    tracked = git_paths("ls-files")
    proposed_deletions = git_paths("diff", "--name-only", "--diff-filter=D")
    offenders = sorted(
        path
        for path in tracked
        if is_python_runtime_artifact(path) and path not in proposed_deletions
    )

    assert not offenders, "tracked Python runtime artifacts: " + ", ".join(offenders)
