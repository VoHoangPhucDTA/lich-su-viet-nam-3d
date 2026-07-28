import hashlib
import json
from pathlib import Path

import pytest

import app.evaluation.retrieval_experiment as experiment
from app.config import Settings
from app.corpus.models import CorpusChunk
from app.retrieval.models import (
    BenchmarkRecord,
    RetrievalFilters,
    RetrievalResult,
    SourceEvidence,
)


def chunk(
    chunk_id: str,
    *,
    grade: int = 10,
    lesson: int = 1,
    text: str = "Cầu Long Biên được xây dựng năm 1898",
    pending: bool = False,
    eligible: bool = True,
) -> CorpusChunk:
    return CorpusChunk(
        chunkId=chunk_id,
        documentId=f"doc-{chunk_id}",
        grade=grade,
        book="SGK",
        subject="Lịch sử",
        lessonNumber=lesson,
        lessonTitle="Bài học",
        titleMayBeTruncated=False,
        sourcePageId=f"page-{chunk_id}",
        sourceFile="book.md",
        sourceMarkdown="source",
        sectionPath=["Bài học"],
        sectionTitle="Cầu Long Biên",
        pageStart=1,
        pageEnd=1,
        contentTypes=["knowledge"],
        text=text,
        markdown=text,
        embeddingTitle="Cầu Long Biên",
        embeddingText=text,
        sourceBlockIds=[f"block-{chunk_id}"],
        wordCount=8,
        charCount=len(text),
        containsPendingReview=pending,
        reviewIssueIds=["pending"] if pending else [],
        ragEligible=eligible,
        sourceMarkdownSha256="a" * 64,
        chunkHash="b" * 64,
        chunkingVersion="structure-v2",
    )


def record() -> BenchmarkRecord:
    return BenchmarkRecord(
        queryId="q1",
        query="Cầu Long Biên năm 1898",
        category="DATE_EVENT",
        grade=10,
        lessonNumber=1,
        filters=RetrievalFilters(grade=10, lessonNumber=1),
        expectedChunkIds=["c1"],
        expectedDocumentIds=["doc-c1"],
        expectedSectionKeywords=["Cầu Long Biên"],
        sourceEvidence=SourceEvidence(chunkIds=["c1"], note="canonical"),
    )


def make_preflight(settings: Settings) -> experiment.Preflight:
    chunks = [chunk("c1"), chunk("c2", text="Một nội dung khác")]
    return experiment.Preflight(
        settings=settings,
        benchmark=[record()],
        chunks=chunks,
        eligible_chunks=chunks,
        pending_excluded_count=0,
        manifest={"corpusSha256": "a" * 64},
        benchmark_sha256="b" * 64,
        held_out_status="NOT_PROVIDED",
        held_out_sha256=None,
        held_out_benchmark=[],
        configuration={"topK": [1, 3, 5]},
        expected_collection_metadata={},
    )


def test_bm25_tokenization_ranking_filter_and_tie_breaking() -> None:
    index = experiment.BM25Index(
        [
            chunk("c2", text="Một nội dung khác"),
            chunk("c1", text="CẦU Long Biên — năm 1898"),
            chunk("c3", grade=11, text="Cầu Long Biên lớp khác"),
        ]
    )
    assert experiment.tokenize_whitespace("CẦU Long-Biên") == ["cầu", "long", "biên"]
    assert [item.chunkId for item in index.search("1898", grade=10, lesson_number=1, top_k=2)] == ["c1", "c2"]
    assert [
        item.chunkId for item in index.search("không tồn tại", grade=None, lesson_number=None, top_k=3)
    ] == ["c1", "c2", "c3"]
    assert index.corpus_count == 3


def test_bm25_edge_cases_unicode_filters_and_eligibility() -> None:
    index = experiment.BM25Index(
        [
            chunk("c1", text="Cách mạng tháng Tám thắng lợi"),
            chunk("c2", grade=11, lesson=2, text="Cách mạng công nghiệp"),
            chunk("c3", text="Cách mạng tháng Tám", pending=True),
            chunk("c4", text="Cách mạng tháng Tám", eligible=False),
        ]
    )
    assert index.corpus_count == 2
    assert experiment.tokenize_whitespace("\uff23ÁCH  MẠNG") == ["cách", "mạng"]
    assert [item.chunkId for item in index.search("cách cách mạng", grade=10, lesson_number=1, top_k=5)] == [
        "c1"
    ]
    assert {item.chunkId for item in index.search("cách mạng", grade=None, lesson_number=None, top_k=5)} == {
        "c1",
        "c2",
    }
    assert [item.chunkId for item in index.search("", grade=None, lesson_number=None, top_k=2)] == [
        "c1",
        "c2",
    ]
    assert [item.chunkId for item in index.search("không-có", grade=None, lesson_number=None, top_k=2)] == [
        "c1",
        "c2",
    ]


def test_run_experiment_shares_one_live_embedding_across_dense_strata(tmp_path: Path, monkeypatch) -> None:
    settings = Settings(_env_file=None, gemini_embedding_dimension=3)
    monkeypatch.setattr(experiment, "run_preflight", lambda *_args, **_kwargs: make_preflight(settings))
    calls: list[str] = []

    class Provider:
        def embed_query(self, query: str):
            calls.append(query)
            return [1.0, 0.0, 0.0]

    class Service:
        provider = Provider()

        def retrieve(self, request, *, query_vector, evaluation_trace):
            result = RetrievalResult(
                rank=1,
                chunkId="c1",
                documentId="doc-c1",
                grade=10,
                lessonNumber=1,
                lessonTitle="Bài học",
                sectionTitle="Cầu Long Biên",
                sectionPath="Bài học",
                contentTypes="knowledge",
                text="Cầu Long Biên được xây dựng năm 1898",
                distance=0.1,
                chunkHash="b" * 64,
            )
            evaluation_trace.embedding_contract_matched = True
            evaluation_trace.collection_metadata_matched = True
            evaluation_trace.collection_distance_metric_matched = True
            return type("Response", (), {"results": [result]})()

        def close(self):
            return None

    result = experiment.run_experiment(
        settings,
        output_root=tmp_path,
        benchmark_path=tmp_path / "benchmark.jsonl",
        held_out_path=tmp_path / "held-out.jsonl",
        allow_provider_call=True,
        no_cache=True,
        service_factory=lambda _settings: Service(),
    )
    assert result["status"] == "COMPLETED"
    assert calls == ["Cầu Long Biên năm 1898"]
    output = Path(result["outputDirectory"])
    aggregate = json.loads((output / "aggregate-report.json").read_text(encoding="utf-8"))
    assert aggregate["cacheHits"] == 0
    assert aggregate["cacheMisses"] == 1
    assert aggregate["cacheProvenance"] == "VALID_LIVE_RUN"
    assert aggregate["queryEmbeddingSharedAcrossDenseStrata"] is True
    rows = [
        json.loads(line)
        for line in (output / "per-query-results.jsonl").read_text(encoding="utf-8").splitlines()
    ]
    assert {row["method"] for row in rows} == set(experiment.EXPERIMENT_METHODS)
    assert all(row["queryEmbeddingLatencyMs"] is None for row in rows if row["method"].startswith("BM25"))
    assert len(aggregate["pairedComparison"]) == 28
    checksums = (output / "checksums.sha256").read_text(encoding="utf-8").splitlines()
    for line in checksums:
        digest, filename = line.split("  ")
        assert digest == hashlib.sha256((output / filename).read_bytes()).hexdigest()


def test_run_requires_no_cache_for_provider_call() -> None:
    with pytest.raises(experiment.ExperimentPreflightError, match="no-cache"):
        experiment.run_experiment(
            Settings(_env_file=None),
            output_root=Path("."),
            benchmark_path=Path("missing"),
            held_out_path=Path("missing-held-out"),
            allow_provider_call=True,
            no_cache=False,
        )


def test_provider_is_blocked_without_explicit_flag_and_run_ids_do_not_overwrite(
    tmp_path: Path, monkeypatch
) -> None:
    settings = Settings(_env_file=None, gemini_embedding_dimension=3)
    monkeypatch.setattr(experiment, "run_preflight", lambda *_args, **_kwargs: make_preflight(settings))
    factory_calls = 0

    def forbidden_factory(_settings):
        nonlocal factory_calls
        factory_calls += 1
        raise AssertionError("provider service must not be created")

    kwargs = dict(
        output_root=tmp_path,
        benchmark_path=tmp_path / "benchmark.jsonl",
        held_out_path=tmp_path / "held-out.jsonl",
        allow_provider_call=False,
        no_cache=False,
        service_factory=forbidden_factory,
    )
    first = experiment.run_experiment(settings, **kwargs)
    second = experiment.run_experiment(settings, **kwargs)
    assert first["status"] == "PREFLIGHT_ONLY_PROVIDER_CALL_NOT_ALLOWED"
    assert factory_calls == 0
    assert first["preflight"]["plannedProviderCalls"] == 1
    assert first["outputDirectory"] != second["outputDirectory"]


def test_failed_provider_case_is_preserved(tmp_path: Path, monkeypatch) -> None:
    settings = Settings(_env_file=None, gemini_embedding_dimension=3)
    monkeypatch.setattr(experiment, "run_preflight", lambda *_args, **_kwargs: make_preflight(settings))

    class Provider:
        def embed_query(self, _query: str):
            raise TimeoutError("fixture timeout")

    class Service:
        provider = Provider()

        def close(self):
            return None

    result = experiment.run_experiment(
        settings,
        output_root=tmp_path,
        benchmark_path=tmp_path / "benchmark.jsonl",
        held_out_path=tmp_path / "held-out.jsonl",
        allow_provider_call=True,
        no_cache=True,
        service_factory=lambda _settings: Service(),
    )
    assert result["status"] == "COMPLETED_WITH_ERRORS"
    rows = [
        json.loads(line)
        for line in (Path(result["outputDirectory"]) / "per-query-results.jsonl")
        .read_text(encoding="utf-8")
        .splitlines()
    ]
    assert len(rows) == 4
    assert all(row["error"] == "TimeoutError" for row in rows if row["method"].startswith("DENSE"))
    assert all(row["error"] is None for row in rows if row["method"].startswith("BM25"))


def test_cache_gate_and_paired_bootstrap_are_deterministic() -> None:
    assert (
        experiment.validate_live_cache_provenance(cache_hits=1, cache_misses=0, distinct_queries=1)
        == "INVALID_LIVE_RUN"
    )
    assert (
        experiment.validate_live_cache_provenance(cache_hits=0, cache_misses=1, distinct_queries=1)
        == "VALID_LIVE_RUN"
    )
    first = experiment.paired_bootstrap_ci([1.0, 0.0, -1.0], iterations=250, seed=1406)
    second = experiment.paired_bootstrap_ci([1.0, 0.0, -1.0], iterations=250, seed=1406)
    assert first == second
    assert first["N"] == 3


def test_development_and_held_out_populations_remain_separate() -> None:
    development = record()
    held_out = experiment.ExperimentRecord(
        query_id="heldout:h1",
        query="Một truy vấn độc lập",
        category="EXTERNAL",
        grade=10,
        lesson_number=1,
        expected_chunk_ids=["c1"],
        expected_document_ids=["doc-c1"],
        expected_section_keywords=[],
    )
    rows = []
    for method in experiment.EXPERIMENT_METHODS:
        rows.append(
            experiment._result_row(
                development,
                method,
                [chunk("c1")],
                latency={"total": 1.0},
            )
        )
        rows.append(
            experiment._result_row(
                held_out,
                method,
                [chunk("c1")],
                benchmark_role="HELD_OUT_EXTERNAL",
                latency={"total": 1.0},
            )
        )
    development_rows = [row for row in rows if row["benchmarkRole"] == "DEVELOPMENT_AUTHORED"]
    held_out_rows = [row for row in rows if row["benchmarkRole"] == "HELD_OUT_EXTERNAL"]
    for row in rows:
        row["eligiblePoolSizeBeforeTopK"] = 1
        row["effectivePoolSizeAfterFilters"] = 1
        row["sectionKeywordCoverageAtK"] = None
    assert experiment._method_report([development], development_rows, "DENSE_FILTER_ON")["attempted"] == 1
    comparison = experiment._paired_comparison([held_out], held_out_rows, bootstrap=True)
    assert len(comparison) == 28
    assert all(item["commonN"] == 1 for item in comparison)
    assert all(item["pairedBootstrap95"]["N"] == 1 for item in comparison)
