"""Content-free generation validation and repair diagnostics."""

import json
import logging
import os
import re
from dataclasses import dataclass, field

from app.generation.models import (
    DiagnosticMarkerCategory,
    DiagnosticOutputField,
    ValidationIssue,
    ValidationIssueLocation,
)

DIAGNOSTICS_ENV = "AI_GENERATION_DIAGNOSTICS"
diagnostic_logger = logging.getLogger("app.generation.diagnostics")
_STABLE_CODE = re.compile(r"^[A-Z][A-Z0-9_]{0,79}$")

_OPTION_CODES = {
    "OPTION_IDS_INVALID",
    "DUPLICATE_OPTION",
    "OPTION_TOO_LONG",
    "FORBIDDEN_OPTION",
}
_QUESTION_CODES = {
    "QUESTION_TOO_LONG",
    "DUPLICATE_WITHIN_BATCH",
    "DUPLICATE_STYLE_EXAMPLE",
    "DATE_EVIDENCE_WARNING",
    "PROPER_NAME_EVIDENCE_WARNING",
}
_EXPLANATION_CODES = {"EXPLANATION_TOO_LONG"}
_ANSWER_CODES = {"ANSWER_FAILURE", "CORRECT_ANSWER_INVALID"}
_SOURCE_CODES = {"DUPLICATE_SOURCE_ID", "UNKNOWN_SOURCE_ID", "SOURCE_FAILURE"}


def diagnostics_enabled() -> bool:
    """Return whether content-free diagnostics are explicitly enabled."""

    return os.getenv(DIAGNOSTICS_ENV, "").strip().casefold() in {
        "1",
        "true",
        "yes",
        "on",
    }


def stable_output_error_code(value: str) -> str:
    """Allow only stable symbolic provider/parser codes into repair diagnostics."""

    normalized = value.strip()
    return normalized if _STABLE_CODE.fullmatch(normalized) else "STRUCTURED_OUTPUT_FAILURE"


def _fallback_location(issue: ValidationIssue) -> ValidationIssueLocation:
    if issue.code in _OPTION_CODES:
        output_field = DiagnosticOutputField.OPTION
    elif issue.code in _QUESTION_CODES:
        output_field = DiagnosticOutputField.QUESTION
    elif issue.code in _EXPLANATION_CODES:
        output_field = DiagnosticOutputField.EXPLANATION
    elif issue.code in _ANSWER_CODES:
        output_field = DiagnosticOutputField.ANSWER
    elif issue.code in _SOURCE_CODES:
        output_field = DiagnosticOutputField.SOURCE
    elif (
        issue.code in {"COUNT_MISMATCH", "STRUCTURED_OUTPUT_FAILURE"}
        or "JSON" in issue.code
        or "SCHEMA" in issue.code
    ):
        output_field = DiagnosticOutputField.ROOT
    else:
        output_field = DiagnosticOutputField.UNKNOWN
    return ValidationIssueLocation(
        output_field=output_field,
        marker_category=DiagnosticMarkerCategory.UNKNOWN,
    )


def issue_locations(issue: ValidationIssue) -> list[ValidationIssueLocation]:
    """Return stable locations without inspecting or copying generated content."""

    return issue.diagnostic_locations or [_fallback_location(issue)]


def _ordered_unique(values: list[str]) -> list[str]:
    return list(dict.fromkeys(values))


@dataclass
class GenerationDiagnosticRecorder:
    """Accumulates a redacted decision record for one logical request."""

    request_id: str
    enabled: bool = field(default_factory=diagnostics_enabled)
    initial_validation_issue_count: int = 0
    repair_eligible_issue_count: int = 0
    repair_triggered: bool = False
    repair_trigger_codes: list[str] = field(default_factory=list)
    repair_trigger_fields: list[str] = field(default_factory=list)
    repair_provider_called: bool = False
    final_validation_issue_count: int = 0
    final_valid: bool = False
    _decision_emitted: bool = False

    def record_initial(self, issues: list[ValidationIssue]) -> None:
        self.initial_validation_issue_count = len(issues)

    def record_repair_trigger(
        self,
        issues: list[ValidationIssue],
        *,
        attempt_number: int,
        repair_attempt_number: int,
    ) -> None:
        eligible = [issue for issue in issues if issue.severity == "ERROR"]
        self.repair_eligible_issue_count = len(eligible)
        self.repair_triggered = bool(eligible)
        self.repair_trigger_codes = _ordered_unique([issue.code for issue in eligible])
        fields: list[str] = []
        if not self.enabled:
            return
        for issue in eligible:
            for location in issue_locations(issue):
                fields.append(location.output_field.value)
                record = {
                    "requestId": self.request_id,
                    "attemptNumber": attempt_number,
                    "repairAttemptNumber": repair_attempt_number,
                    "issueCode": issue.code,
                    "issueSeverity": issue.severity,
                    "outputField": location.output_field.value,
                    "questionIndex": issue.question_index,
                    "optionIndex": location.option_index,
                    "markerCategory": location.marker_category.value,
                }
                diagnostic_logger.info(
                    "event=generation.repair_trace payload=%s",
                    json.dumps(record, separators=(",", ":"), sort_keys=True),
                )
        self.repair_trigger_fields = _ordered_unique(fields)

    def record_repair_provider_call(self) -> None:
        self.repair_provider_called = True

    def record_final(self, issues: list[ValidationIssue], *, valid: bool) -> None:
        self.final_validation_issue_count = len(issues)
        self.final_valid = valid

    def emit_decision(self) -> None:
        if not self.enabled or self._decision_emitted:
            return
        record = {
            "requestId": self.request_id,
            "initialValidationIssueCount": self.initial_validation_issue_count,
            "repairEligibleIssueCount": self.repair_eligible_issue_count,
            "repairTriggered": self.repair_triggered,
            "repairTriggerCodes": self.repair_trigger_codes,
            "repairTriggerFields": self.repair_trigger_fields,
            "repairProviderCalled": self.repair_provider_called,
            "finalValidationIssueCount": self.final_validation_issue_count,
            "finalValid": self.final_valid,
        }
        diagnostic_logger.info(
            "event=generation.repair_decision payload=%s",
            json.dumps(record, separators=(",", ":"), sort_keys=True),
        )
        self._decision_emitted = True
