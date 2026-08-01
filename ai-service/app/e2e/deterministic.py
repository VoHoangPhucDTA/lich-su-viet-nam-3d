"""Small deterministic RAG contract for quota-free end-to-end tests only."""

import json
import re
from collections.abc import Callable

from app.core.deadline import OperationDeadline
from app.generation.parser import parse_generation_json
from app.generation.schemas import GeneratedQuestionBatch
from app.provenance.models import (
    ProvenanceValidationRequest,
    ProvenanceValidationResponse,
    SourceValidationResult,
)
from app.retrieval.context_builder import build_fact_context
from app.retrieval.models import (
    RetrievalFilters,
    RetrievalMetadata,
    RetrievalRequest,
    RetrievalResponse,
    RetrievalResult,
)

E2E_CHUNK_ID = "e2e-history-chunk-001"
E2E_CHUNK_HASH = "8e1b5c708cd4e8b91dc73d5d63d5a76f61aa526ac55a242dbad60a945a1f6771"
E2E_CORPUS_SHA256 = "669e8e7d86c80dc1f54012b171fa61ea8353cb1eaab59ade6b95665bb519c95d"
E2E_COLLECTION = "history_rag_e2e_fixture_v1"
E2E_EMBEDDING_MODEL = "deterministic-e2e-embedding-v1"
E2E_EMBEDDING_DIMENSION = 8


def _result() -> RetrievalResult:
    return RetrievalResult(
        rank=1,
        chunk_id=E2E_CHUNK_ID,
        document_id="e2e-document-001",
        grade=12,
        lesson_number=6,
        lesson_title="Cách mạng tháng Tám năm 1945",
        section_title="Kết quả",
        section_path="Bài 6 > Kết quả",
        page_start=42,
        page_end=42,
        content_types="knowledge",
        text="Tháng Tám năm 1945, nhân dân Việt Nam giành chính quyền trên phạm vi cả nước.",
        distance=0.0,
        chunk_hash=E2E_CHUNK_HASH,
    )


class DeterministicRetrievalService:
    def retrieve(self, request: RetrievalRequest) -> RetrievalResponse:
        result = _result()
        context = build_fact_context([result], max_chars=2000, max_chunks=1)
        return RetrievalResponse(
            query=request.query,
            filters=RetrievalFilters(
                grade=request.grade,
                lesson_number=request.lesson_number,
                document_id=request.document_id,
            ),
            top_k=request.top_k or 1,
            candidate_count=1,
            result_count=1,
            results=[result],
            fact_context=context,
            metadata=RetrievalMetadata(
                embedding_model=E2E_EMBEDDING_MODEL,
                embedding_dimension=E2E_EMBEDDING_DIMENSION,
                corpus_sha256=E2E_CORPUS_SHA256,
                query_formatter_version="deterministic-e2e-query-v1",
                collection_name=E2E_COLLECTION,
                distance_metric="cosine",
            ),
        )

    def close(self) -> None:
        return None


class DeterministicGenerationProvider:
    model = "deterministic-e2e-generation-v1"

    def generate_structured(
        self,
        prompt: str,
        *,
        deadline: OperationDeadline | None = None,
        timeout_seconds: float | None = None,
        is_cancelled: Callable[[], bool] | None = None,
        stage: str = "generation",
        minimum_timeout_seconds: float = 0.001,
    ) -> GeneratedQuestionBatch:
        if deadline is not None:
            deadline.checkpoint(stage, is_cancelled)
        source_match = re.search(r"chunkId=([^\]\s]+)", prompt)
        source_id = source_match.group(1) if source_match else E2E_CHUNK_ID
        request_section = prompt.rsplit("GENERATION REQUEST", 1)[-1]
        numeric_fields = re.findall(r":\s*(\d+)", request_section)
        count = int(numeric_fields[0]) if numeric_fields else 1
        difficulty_match = re.search(r"\b(EASY|MEDIUM|HARD)\b", request_section)
        difficulty = difficulty_match.group(1) if difficulty_match else "MEDIUM"
        questions: list[dict[str, object]] = []
        stems = [
            "Theo tư liệu, kết quả nào diễn ra trong tháng Tám năm 1945?",
            "Tư liệu xác định phạm vi giành chính quyền của nhân dân Việt Nam như thế nào?",
            "Nội dung lịch sử được nêu trực tiếp trong nguồn là gì?",
            "Sự kiện trong nguồn phản ánh thắng lợi nào của nhân dân Việt Nam?",
            "Thông tin cốt lõi của đoạn tư liệu về năm 1945 là gì?",
        ]
        for index in range(count):
            variant = index + 1
            questions.append(
                {
                    "question": stems[index % len(stems)]
                    + (f" Mẫu {index + 1}." if index >= len(stems) else ""),
                    "options": [
                        {
                            "id": "A",
                            "text": (
                                "Nhân dân Việt Nam giành chính quyền trên phạm vi "
                                f"cả nước (dữ kiện {variant})"
                            ),
                        },
                        {"id": "B", "text": f"Việt Nam gia nhập ASEAN (phương án nhiễu {variant})"},
                        {"id": "C", "text": f"Công cuộc Đổi mới bắt đầu (phương án nhiễu {variant})"},
                        {"id": "D", "text": f"Hiệp định Giơ-ne-vơ được ký kết (phương án nhiễu {variant})"},
                    ],
                    "correctOptionId": "A",
                    "explanation": (
                        "Tư liệu nêu rõ nhân dân Việt Nam đã giành chính quyền "
                        "trên phạm vi cả nước."
                    ),
                    "difficulty": difficulty,
                    "sourceChunkIds": [source_id],
                }
            )
        # Exercise the same strict JSON parser/schema used for provider output.
        return parse_generation_json(json.dumps({"questions": questions}, ensure_ascii=False))

    def close(self) -> None:
        return None


def validate_deterministic_provenance(
    request: ProvenanceValidationRequest,
) -> ProvenanceValidationResponse:
    corpus_matches = request.corpus_sha256 == E2E_CORPUS_SHA256
    collection_matches = request.collection_name == E2E_COLLECTION
    embedding_matches = (
        request.embedding_model == E2E_EMBEDDING_MODEL
        and request.embedding_dimension == E2E_EMBEDDING_DIMENSION
    )
    errors: list[str] = []
    if not corpus_matches:
        errors.append("CORPUS_MISMATCH")
    if not collection_matches:
        errors.append("COLLECTION_MISMATCH")
    if not embedding_matches:
        errors.append("EMBEDDING_CONTRACT_MISMATCH")
    results: list[SourceValidationResult] = []
    for source in request.sources:
        exists = source.chunk_id == E2E_CHUNK_ID
        hash_matches = exists and source.chunk_hash == E2E_CHUNK_HASH
        if not exists:
            errors.append("SOURCE_MISSING")
        elif not hash_matches:
            errors.append("SOURCE_CHANGED")
        results.append(
            SourceValidationResult(
                chunk_id=source.chunk_id,
                chunk_hash=E2E_CHUNK_HASH if exists else None,
                exists=exists,
                hash_matches=hash_matches,
                pending_review=False,
                document_id="e2e-document-001" if exists else None,
                grade=12 if exists else None,
                lesson_number=6 if exists else None,
                lesson_title="Cách mạng tháng Tám năm 1945" if exists else None,
                section_title="Kết quả" if exists else None,
                page_start=42 if exists else None,
                page_end=42 if exists else None,
            )
        )
    return ProvenanceValidationResponse(
        valid=not errors,
        corpus_matches=corpus_matches,
        collection_matches=collection_matches,
        embedding_contract_matches=embedding_matches,
        sources=results,
        errors=sorted(set(errors)),
    )
