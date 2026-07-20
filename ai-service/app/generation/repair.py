"""Bounded repair prompt construction."""

import json

from app.generation.models import PROMPT_VERSION, ValidationIssue
from app.retrieval.models import FactContext


def build_repair_prompt(
    original_prompt: str,
    raw_output: str,
    issues: list[ValidationIssue],
    context: FactContext,
) -> str:
    safe_output = raw_output[:12000]
    return (
        f"PROMPT VERSION: {PROMPT_VERSION}-repair\n\n"
        "REPAIR RULES\n"
        "Chỉ sửa các lỗi được liệt kê. Không thêm fact ngoài FACT CONTEXT. "
        "Trả structured JSON và không Markdown.\n\n"
        "VALIDATION ERRORS\n"
        f"{json.dumps([item.model_dump(by_alias=True) for item in issues], ensure_ascii=False)}\n\n"
        "INVALID OUTPUT (SANITIZED)\n"
        f"{safe_output}\n\n"
        "FACT CONTEXT\n"
        f"{context.text}\n\n"
        "ORIGINAL REQUEST RULES\n"
        f"{original_prompt[:6000]}"
    )
