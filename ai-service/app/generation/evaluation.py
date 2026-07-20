"""Generation evaluation cache identity and metric helpers."""

import hashlib
import json
import os
from pathlib import Path
from statistics import mean, median
from typing import Any

from pydantic import ValidationError

from app.generation.models import GenerationRequest, GenerationResponse, PROMPT_VERSION, SCHEMA_VERSION
from app.retrieval.models import RetrievalResponse


class GenerationCache:
    def __init__(self, root: Path) -> None:
        self.root = root

    @staticmethod
    def identity(request: GenerationRequest, retrieval: RetrievalResponse, *, model: str, temperature: float) -> str:
        request_value = request.model_dump(by_alias=True, mode="json")
        style_hash = hashlib.sha256(json.dumps(request_value.get("styleExamples", []), ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
        payload = {
            "requestHash": hashlib.sha256(json.dumps(request_value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest(),
            "sources": [{"chunkId": item.chunk_id, "chunkHash": item.chunk_hash} for item in retrieval.results],
            "model": model,
            "promptVersion": PROMPT_VERSION,
            "schemaVersion": SCHEMA_VERSION,
            "temperature": temperature,
            "styleHash": style_hash,
        }
        return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()

    def get(self, key: str) -> GenerationResponse | None:
        path = self.root / f"{key}.json"
        if not path.is_file():
            return None
        try:
            return GenerationResponse.model_validate_json(path.read_text(encoding="utf-8"))
        except (OSError, ValidationError):
            return None

    def set(self, key: str, response: GenerationResponse) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        path = self.root / f"{key}.json"
        temporary = path.with_name(f".{path.name}.tmp")
        with temporary.open("w", encoding="utf-8", newline="\n") as output:
            output.write(response.model_dump_json(by_alias=True, indent=2))
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)


def latency_metrics(values: list[float]) -> dict[str, float]:
    ordered = sorted(values)
    if not ordered:
        return {"averageLatencyMs": 0.0, "p50LatencyMs": 0.0, "p95LatencyMs": 0.0}
    p95_index = max(0, int((len(ordered) * 0.95 + 0.999999)) - 1)
    return {
        "averageLatencyMs": round(mean(ordered), 3),
        "p50LatencyMs": round(median(ordered), 3),
        "p95LatencyMs": round(ordered[p95_index], 3),
    }


def render_generation_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Generation Evaluation — Engineering Baseline", "",
        "This automated report does not claim 100% factual accuracy or groundedness.", "",
        f"- Status: `{report['status']}`", f"- Cases: {report['caseCount']}",
        f"- Manual review required: {len(report['manualReviewRequired'])}", "",
        "## Configuration", "",
    ]
    lines.extend(f"- {key}: `{value}`" for key, value in report["configuration"].items())
    lines.extend(["", "## Distribution", ""])
    lines.extend(f"- {key}: {value}" for key, value in report["distribution"].items())
    lines.extend(["", "## Metrics", ""])
    lines.extend(f"- {key}: {value}" for key, value in report["metrics"].items())
    for title, key in (("Validation failures", "validationFailures"), ("Repair cases", "repairCases"), ("Partial or insufficient cases", "partialOrInsufficientCases"), ("Duplicate cases", "duplicateCases"), ("Quota incidents", "quotaIncidents")):
        lines.extend(["", f"## {title}", ""])
        values = report[key]
        if values:
            lines.extend(f"- `{value}`" for value in values)
        else:
            lines.append("- None")
    lines.extend(["", "## Limitations", "", "- Ground truth and automated heuristics require human review.", "- Source-ID validity does not prove semantic factual correctness.", "- Style fixtures are synthetic and sanitized, not production MySQL data.", ""])
    return "\n".join(lines)
