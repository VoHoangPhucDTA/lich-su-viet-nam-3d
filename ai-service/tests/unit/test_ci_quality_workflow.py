import shlex
from pathlib import Path

import yaml

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
WORKFLOW_PATH = REPOSITORY_ROOT / ".github" / "workflows" / "ai-service-ci.yml"
REQUIREMENTS_PATH = REPOSITORY_ROOT / "ai-service" / "requirements-dev.txt"


def workflow_text() -> str:
    return WORKFLOW_PATH.read_text(encoding="utf-8")


def workflow_document() -> dict:
    return yaml.safe_load(workflow_text())


def workflow_steps() -> list[dict]:
    document = workflow_document()
    return [
        step
        for job in document["jobs"].values()
        for step in job.get("steps", [])
        if isinstance(step, dict)
    ]


def test_ai_ci_enforces_lint_typecheck_and_full_pytest() -> None:
    workflow = workflow_text()

    assert "with: {fetch-depth: 2}" in workflow
    assert "git diff --check HEAD^" in workflow
    assert "python -m ruff check ." in workflow
    assert "python -m mypy app scripts --show-error-codes" in workflow
    assert "python -m pytest --cov=app --cov=scripts" in workflow
    assert "python -m compileall -q app scripts" in workflow
    assert "tests/unit tests/integration/test_deterministic_e2e_provider.py" not in workflow
    assert "continue-on-error" not in workflow


def test_ai_ci_enforces_separate_app_and_combined_coverage_floors() -> None:
    workflow = workflow_text()

    assert "python -m coverage report --include='app/*' --fail-under=89" in workflow
    assert (
        "python -m coverage report --include='app/*,scripts/*' --fail-under=82"
        in workflow
    )
    assert "--cov-report=term-missing" in workflow


def test_ai_ci_does_not_upload_coverage_or_runtime_artifacts() -> None:
    workflow = workflow_text()

    assert "path: artifacts/e2e/*.xml" in workflow
    assert "--cov-report=xml" not in workflow
    assert "--cov-report=json" not in workflow
    assert "path: ai-service/.coverage" not in workflow
    assert "path: ai-service/storage" not in workflow
    assert "GEMINI_API_KEY" not in workflow


def test_ai_quality_tool_versions_are_directly_pinned() -> None:
    requirements = REQUIREMENTS_PATH.read_text(encoding="utf-8").splitlines()

    assert "pytest==8.4.2" in requirements
    assert "coverage==7.15.2" in requirements
    assert "pytest-cov==6.0.0" in requirements
    assert "ruff==0.9.6" in requirements
    assert "mypy==1.15.0" in requirements


def test_ai_ci_has_no_stale_scoped_frontend_lint_or_missing_literal_source_path() -> None:
    workflow = workflow_text()

    assert "AiQuizPage.tsx" not in workflow
    for step in workflow_steps():
        command = step.get("run")
        if not isinstance(command, str):
            continue
        working_directory = REPOSITORY_ROOT / step.get("working-directory", "")
        for token in shlex.split(command):
            normalized = token.strip("'\"")
            if (
                "/" in normalized
                and "*" not in normalized
                and Path(normalized).suffix in {".py", ".ts", ".tsx"}
            ):
                assert (working_directory / normalized).is_file(), (
                    f"workflow source path does not exist: {normalized}"
                )


def test_ai_ci_quality_gates_do_not_mask_failures() -> None:
    quality_markers = (
        "ruff check",
        "mypy app scripts",
        "pytest --cov=app --cov=scripts",
        "coverage report",
        "compileall",
    )

    for step in workflow_steps():
        command = step.get("run", "")
        if not any(marker in command for marker in quality_markers):
            continue
        assert step.get("continue-on-error") is not True
        assert step.get("if") != "always()"
        assert "|| true" not in command
