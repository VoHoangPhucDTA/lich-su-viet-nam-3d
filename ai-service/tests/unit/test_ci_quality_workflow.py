from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
WORKFLOW_PATH = REPOSITORY_ROOT / ".github" / "workflows" / "ai-service-ci.yml"
REQUIREMENTS_PATH = REPOSITORY_ROOT / "ai-service" / "requirements-dev.txt"


def workflow_text() -> str:
    return WORKFLOW_PATH.read_text(encoding="utf-8")


def test_ai_ci_enforces_lint_typecheck_and_full_pytest() -> None:
    workflow = workflow_text()

    assert "with: {fetch-depth: 2}" in workflow
    assert "git diff --check HEAD^" in workflow
    assert "python -m ruff check ." in workflow
    assert "python -m mypy app scripts --show-error-codes" in workflow
    assert "python -m pytest --cov=app --cov=scripts" in workflow
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
