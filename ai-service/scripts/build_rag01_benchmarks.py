"""Build the fixed, evaluation-only RAG-01 benchmark assets.

The old 36 retrieval and 12 generation fixtures remain immutable.  This
builder derives a versioned 60/27 package from those fixtures plus the new
cases below, and refuses to write an asset when a cited corpus chunk is not
present in the canonical corpus.
"""

from __future__ import annotations

# Long curated prose and textbook punctuation are data, not executable style.
# Keep them readable in the generated JSON while documenting the intentional
# lint exceptions for this fixture source.
# ruff: noqa: E501, RUF001
import argparse
import hashlib
import json
import sys
import unicodedata
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
AI_SERVICE = ROOT / "ai-service"
if str(AI_SERVICE) not in sys.path:
    sys.path.insert(0, str(AI_SERVICE))

from app.corpus.identity import canonical_jsonl_sha256  # noqa: E402

CORPUS = AI_SERVICE / "data" / "corpus" / "sgk_chunks.jsonl"
OLD_RETRIEVAL = AI_SERVICE / "data" / "evaluation" / "retrieval_benchmark.jsonl"
OLD_GENERATION = AI_SERVICE / "data" / "evaluation" / "generation_benchmark.jsonl"
OUT = AI_SERVICE / "data" / "evaluation" / "rag01"


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows),
        encoding="utf-8",
    )


def retrieval_type(category: str) -> str:
    return {
        "DATE_EVENT": "year_date",
        "NAMED_ENTITY": "person_event",
        "SIGNIFICANCE": "consequence",
        "EXACT_SECTION": "direct_fact",
        "PARAPHRASE": "paraphrase",
        "AMBIGUOUS_WITH_FILTER": "near_neighbor",
        "CAUSE": "cause",
        "COMPARISON": "multi_keyword",
    }.get(category, "direct_fact")


def old_retrieval_rows(corpus: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for old in read_jsonl(OLD_RETRIEVAL):
        ids = old["expectedChunkIds"]
        for chunk_id in ids:
            if chunk_id not in corpus:
                raise ValueError(f"old retrieval case cites missing chunk: {chunk_id}")
        rows.append(
            {
                "benchmarkVersion": "rag01-retrieval-60-v1",
                "caseId": old["queryId"].replace("ls", "ret-"),
                "query": old["query"],
                "grade": old["grade"],
                "topic": old.get("expectedSectionKeywords", ["legacy"])[0],
                "queryType": retrieval_type(old["category"]),
                "difficulty": "UNCLASSIFIED",
                "difficultyRubric": "LEGACY_CASE_NOT_RECURATED",
                "lessonNumber": old["lessonNumber"],
                "filters": old.get("filters", {}),
                "expectedRelevantChunkIds": ids,
                "expectedDocumentIds": old["expectedDocumentIds"],
                "sourceProvenance": old.get("sourceEvidence", {}),
                "isInsufficientControl": False,
                "legacySourceCase": old["queryId"],
            }
        )
    return rows


def extra_retrieval_rows() -> list[dict[str, Any]]:
    def row(
        case_id: str,
        query: str,
        grade: int,
        lesson: int | None,
        topic: str,
        query_type: str,
        difficulty: str,
        chunks: list[str],
        *,
        insufficient: bool = False,
    ) -> dict[str, Any]:
        return {
            "benchmarkVersion": "rag01-retrieval-60-v1",
            "caseId": case_id,
            "query": query,
            "grade": grade,
            "topic": topic,
            "queryType": query_type,
            "difficulty": difficulty,
            "lessonNumber": lesson,
            "filters": {"grade": grade, **({"lessonNumber": lesson} if lesson else {})},
            "expectedRelevantChunkIds": [] if insufficient else chunks,
            "expectedDocumentIds": []
            if insufficient
            else sorted({chunk.rsplit("-c", 1)[0] for chunk in chunks}),
            "sourceProvenance": {"chunkIds": chunks, "note": "RAG-01 fixed corpus-backed case"},
            "isInsufficientControl": insufficient,
            "controlScoring": ("UNSCORABLE_WITH_CURRENT_RETRIEVER" if insufficient else None),
        }

    return [
        row(
            "ret-037",
            "Khái niệm dân tộc trong tiếng Việt hiện nay được sử dụng theo mấy nghĩa?",
            10,
            13,
            "dân tộc",
            "direct_fact",
            "easy",
            ["kntt-ls10-bai13-12162-c0002-dc73135c"],
        ),
        row(
            "ret-038",
            "Khối đại đoàn kết dân tộc ở Việt Nam hình thành từ thời kì nào?",
            10,
            14,
            "đại đoàn kết",
            "year_date",
            "medium",
            ["kntt-ls10-bai14-12169-c0002-605e3ca7"],
        ),
        row(
            "ret-039",
            "Những điều kiện tự nhiên nào vừa thuận lợi vừa gây khó khăn cho cư dân Hy Lạp cổ đại?",
            10,
            6,
            "Hy Lạp – La Mã",
            "cross_sentence",
            "hard",
            ["kntt-ls10-bai06-12141-c0002-ac61d138", "kntt-ls10-bai06-12141-c0003-126b8051"],
        ),
        row(
            "ret-040",
            "Cách mạng công nghiệp lần thứ nhất bắt đầu ở đâu và vào khoảng thời gian nào?",
            10,
            7,
            "cách mạng công nghiệp",
            "year_date",
            "easy",
            ["kntt-ls10-bai07-12143-c0002-cc59851c"],
        ),
        row(
            "ret-041",
            "Dân số các dân tộc ở Việt Nam hiện nay được chia thành những nhóm nào?",
            10,
            13,
            "dân số dân tộc",
            "multi_keyword",
            "medium",
            ["kntt-ls10-bai13-12162-c0003-74f28ea3"],
        ),
        row(
            "ret-042",
            "Vì sao cư dân Việt Nam cổ đại cần liên kết để trị thủy và chống ngoại xâm?",
            10,
            14,
            "liên kết cộng đồng",
            "cause",
            "hard",
            ["kntt-ls10-bai14-12169-c0002-605e3ca7", "kntt-ls10-bai14-12169-c0003-e9dfa0fc"],
        ),
        row(
            "ret-043",
            "Tàu hỏa Hà Nội – Thành phố Hồ Chí Minh năm 2021 đi khoảng bao lâu?",
            10,
            7,
            "đường sắt",
            "year_date",
            "easy",
            ["kntt-ls10-bai07-12143-c0001-ece4f58c"],
        ),
        row(
            "ret-044",
            "Người Maya xây dựng kim tự tháp nào ở Trung Mỹ?",
            10,
            None,
            "ngoài phạm vi corpus",
            "insufficient_control",
            "UNCLASSIFIED",
            [],
            insufficient=True,
        ),
        row(
            "ret-045",
            "Lê Thánh Tông lên ngôi năm nào?",
            11,
            13,
            "Lê Thánh Tông",
            "year_date",
            "easy",
            ["kntt-ls11-bai13-12390-c0002-dfa004e0"],
        ),
        row(
            "ret-046",
            "Vì sao triều Lê sơ cần cải cách bộ máy hành chính?",
            11,
            13,
            "cải cách hành chính",
            "cause",
            "hard",
            ["kntt-ls11-bai13-12390-c0002-dfa004e0"],
        ),
        row(
            "ret-047",
            "Nhà Nguyễn được thành lập vào năm nào?",
            11,
            14,
            "nhà Nguyễn",
            "year_date",
            "medium",
            ["kntt-ls11-bai14-12393-c0002-37a66004"],
        ),
        row(
            "ret-048",
            "Cải cách Minh Mạng hướng tới việc tổ chức nhà nước như thế nào?",
            11,
            14,
            "cải cách Minh Mạng",
            "consequence",
            "medium",
            ["kntt-ls11-bai14-12393-c0002-37a66004"],
        ),
        row(
            "ret-049",
            "Phong trào công nhân Li-ông chuyển từ khẩu hiệu kinh tế sang khẩu hiệu chính trị vào những năm nào?",
            11,
            3,
            "Li-ông",
            "year_date",
            "hard",
            ["kntt-ls11-bai03-12337-c0002-19e2a32e"],
        ),
        row(
            "ret-050",
            "Chiến thắng Bạch Đằng năm 938 do ai chỉ huy?",
            11,
            7,
            "Bạch Đằng",
            "person_event",
            "easy",
            ["kntt-ls11-bai07-12370-c0004-567f989c"],
        ),
        row(
            "ret-051",
            "Ban đầu phương Tây xâm nhập Đông Nam Á thông qua những hoạt động nào?",
            11,
            5,
            "Đông Nam Á",
            "multi_keyword",
            "easy",
            ["kntt-ls11-bai05-12339-c0002-b9000010"],
        ),
        row(
            "ret-052",
            "Bài học về chiến thắng Bạch Đằng năm 938 gồm thời gian, người chỉ huy và trận quyết chiến nào?",
            11,
            7,
            "bảng kháng chiến",
            "multi_keyword",
            "hard",
            ["kntt-ls11-bai07-12370-c0004-567f989c"],
        ),
        row(
            "ret-053",
            "Những cuộc họp Potsdam năm 1945 diễn ra trong khoảng thời gian nào?",
            12,
            6,
            "Potsdam",
            "year_date",
            "medium",
            ["kntt-ls12-bai06-12952-c0002-1eca050f"],
        ),
        row(
            "ret-054",
            "Sau tháng 4 năm 1975, Việt Nam phải tiếp tục đấu tranh bảo vệ Tổ quốc trong bối cảnh nào?",
            12,
            9,
            "bảo vệ Tổ quốc",
            "direct_fact",
            "hard",
            ["kntt-ls12-bai09-12957-c0002-ba4255e0"],
        ),
        row(
            "ret-055",
            "Giai đoạn đầu của công cuộc Đổi mới được xác định từ năm nào đến năm nào?",
            12,
            10,
            "Đổi mới",
            "year_date",
            "easy",
            ["kntt-ls12-bai10-12958-c0002-dc755288"],
        ),
        row(
            "ret-056",
            "Những lĩnh vực nào đạt thành tựu trong công cuộc Đổi mới?",
            12,
            11,
            "thành tựu Đổi mới",
            "multi_keyword",
            "medium",
            ["kntt-ls12-bai11-12960-c0002-e1d5cc18"],
        ),
        row(
            "ret-057",
            "Từ năm 1950, hoạt động đối ngoại của Việt Nam nhằm tranh thủ điều gì?",
            12,
            13,
            "đối ngoại",
            "cause",
            "easy",
            ["kntt-ls12-bai13-12964-c0002-897b5d01"],
        ),
        row(
            "ret-058",
            "Nam Đàn gắn với những nhân vật và sự kiện lịch sử nào?",
            12,
            15,
            "Nam Đàn",
            "person_event",
            "hard",
            ["kntt-ls12-bai15-12966-c0002-db782ef3"],
        ),
        row(
            "ret-059",
            "Nghị quyết UNESCO năm 1987 gắn với mốc kỉ niệm nào vào năm 1990?",
            12,
            16,
            "UNESCO và Hồ Chí Minh",
            "year_date",
            "medium",
            ["kntt-ls12-bai16-12967-c0001-783fe5d5"],
        ),
        row(
            "ret-060",
            "Nghị quyết 24C/18.6.5 được UNESCO thông qua ở đâu và vào năm nào?",
            12,
            17,
            "UNESCO",
            "place",
            "hard",
            ["kntt-ls12-bai17-12968-c0002-041e298a"],
        ),
    ]


def _gold(
    case_id: str,
    grade: int,
    content_group: str,
    difficulty: str,
    query: str,
    evaluation_intent: str,
    target_mode: str,
    facts: list[dict[str, Any]],
    *,
    accepted_answers: list[str] | None = None,
    accepted_answer_sets: list[list[str]] | None = None,
    topic: str | None = None,
    rationale: str,
    human_review_rubric: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "caseId": case_id,
        "evaluationIntent": evaluation_intent,
        "query": query,
        "topic": topic or query,
        "grade": grade,
        "difficulty": difficulty,
        "contentGroup": content_group,
        "targetMode": target_mode,
        "acceptedAnswers": accepted_answers or [],
        "acceptedAnswerSets": accepted_answer_sets or [],
        "criticalFacts": facts,
        "goldRationale": rationale,
        "humanReviewRubric": human_review_rubric or [],
    }


GENERATION_GOLD_SPECS: list[dict[str, Any]] = [
    _gold(
        "rag01-gen-001",
        10,
        "facts",
        "EASY",
        "Cầu Long Biên được xây dựng trong khoảng thời gian nào?",
        "interval_fact_generation",
        "EXACT_SET",
        [
            {"value": "1898", "type": "year", "autoScorable": True},
            {"value": "1902", "type": "year", "autoScorable": True},
        ],
        accepted_answer_sets=[["1898", "1902"]],
        rationale="The question asks for both endpoints of an explicitly stated construction interval.",
    ),
    _gold(
        "rag01-gen-002",
        10,
        "facts",
        "MEDIUM",
        "Cách mạng công nghiệp lần thứ nhất bắt đầu ở đâu?",
        "direct_fact_generation",
        "EXACT_SINGLE",
        [{"value": "Anh", "type": "named_entity", "autoScorable": True}],
        accepted_answers=["Anh"],
        rationale="A single country is the deterministic answer to the location question.",
    ),
    _gold(
        "rag01-gen-003",
        10,
        "facts",
        "HARD",
        "Khái niệm dân tộc được sử dụng theo những nghĩa nào?",
        "multi_value_fact_generation",
        "EXACT_SET",
        [
            {"value": "dân tộc", "type": "text_fact", "autoScorable": True},
            {"value": "quốc gia", "type": "text_fact", "autoScorable": True},
        ],
        accepted_answer_sets=[["dân tộc", "quốc gia"]],
        rationale="The benchmark explicitly requires both textbook meanings, not one arbitrary meaning.",
    ),
    _gold(
        "rag01-gen-004",
        10,
        "causes",
        "EASY",
        "Vì sao Địa Trung Hải thuận lợi cho giao lưu của Hy Lạp – La Mã?",
        "causal_explanation_generation",
        "HUMAN_REVIEW",
        [
            {"value": "Địa Trung Hải", "type": "named_entity", "autoScorable": True},
            {"value": "hải cảng", "type": "text_fact", "autoScorable": False},
        ],
        rationale="A causal explanation must connect geography and maritime exchange; keyword presence is not a sufficient answer.",
        human_review_rubric=[
            "Does the explanation answer why?",
            "Are both geographic mechanisms used accurately?",
            "Is the causal relation pedagogically clear?",
        ],
    ),
    _gold(
        "rag01-gen-005",
        10,
        "causes",
        "MEDIUM",
        "Vì sao khối đại đoàn kết dân tộc hình thành sớm?",
        "causal_explanation_generation",
        "HUMAN_REVIEW",
        [
            {"value": "trị thủy", "type": "text_fact", "autoScorable": False},
            {"value": "ngoại xâm", "type": "text_fact", "autoScorable": False},
        ],
        rationale="The requested output is an explanation of an early historical formation, not a list of source tokens.",
        human_review_rubric=[
            "Does the response explain the historical mechanism?",
            "Are the two pressures used without overclaiming?",
        ],
    ),
    _gold(
        "rag01-gen-006",
        10,
        "causes",
        "HARD",
        "Điều kiện tự nhiên ảnh hưởng thế nào đến Hy Lạp – La Mã cổ đại?",
        "causal_explanation_generation",
        "HUMAN_REVIEW",
        [
            {"value": "núi", "type": "text_fact", "autoScorable": False},
            {"value": "biển", "type": "text_fact", "autoScorable": False},
        ],
        rationale="The wording asks for effects and requires a semantic comparison of natural conditions.",
        human_review_rubric=[
            "Are mountain and maritime effects distinguished?",
            "Is the answer historically coherent?",
        ],
    ),
    _gold(
        "rag01-gen-007",
        10,
        "synthesis",
        "EASY",
        "Dân số các dân tộc ở Việt Nam được chia thành những nhóm nào?",
        "multi_value_fact_generation",
        "EXACT_SET",
        [
            {"value": "đa số", "type": "text_fact", "autoScorable": True},
            {"value": "thiểu số", "type": "text_fact", "autoScorable": True},
        ],
        accepted_answer_sets=[["đa số", "thiểu số"]],
        rationale="The two groups jointly answer the plural classification request.",
    ),
    _gold(
        "rag01-gen-008",
        10,
        "synthesis",
        "MEDIUM",
        "Nêu một minh chứng về di sản lịch sử của Hà Nội.",
        "bounded_example_generation",
        "FACT_CONSTRAINED",
        [{"value": "Cầu Long Biên", "type": "named_entity", "autoScorable": True}],
        rationale="Any supported example may satisfy the topic, so the evaluator checks the critical example/source facts and sends semantic answer quality to review.",
        human_review_rubric=[
            "Is the selected example a historical heritage item of Hanoi?",
            "Does the explanation support its significance?",
        ],
    ),
    _gold(
        "rag01-gen-009",
        10,
        "synthesis",
        "HARD",
        "So sánh vai trò của thủ công nghiệp và nông nghiệp ở Hy Lạp – La Mã.",
        "comparative_synthesis_generation",
        "HUMAN_REVIEW",
        [
            {"value": "thủ công nghiệp", "type": "text_fact", "autoScorable": False},
            {"value": "nông nghiệp", "type": "text_fact", "autoScorable": False},
        ],
        rationale="A comparison cannot be reduced to one accepted answer string.",
        human_review_rubric=[
            "Are both sectors compared?",
            "Are similarities/differences accurate and useful for learners?",
        ],
    ),
    _gold(
        "rag01-gen-010",
        11,
        "facts",
        "EASY",
        "Ngày phá ngục Ba-xti là ngày nào?",
        "direct_date_generation",
        "EXACT_SINGLE",
        [{"value": "14-7-1789", "type": "date", "autoScorable": True}],
        accepted_answers=["14-7-1789"],
        rationale="The source states one exact date.",
    ),
    _gold(
        "rag01-gen-011",
        11,
        "facts",
        "MEDIUM",
        "Lê Thánh Tông lên ngôi năm nào?",
        "direct_year_generation",
        "EXACT_SINGLE",
        [{"value": "1460", "type": "year", "autoScorable": True}],
        accepted_answers=["1460"],
        rationale="The source states one accession year.",
    ),
    _gold(
        "rag01-gen-012",
        11,
        "facts",
        "HARD",
        "Nhà Nguyễn được thành lập vào năm nào?",
        "direct_year_generation",
        "EXACT_SINGLE",
        [{"value": "1802", "type": "year", "autoScorable": True}],
        accepted_answers=["1802"],
        rationale="The source states one founding year.",
    ),
    _gold(
        "rag01-gen-013",
        11,
        "causes",
        "EASY",
        "Ban đầu phương Tây xâm nhập Đông Nam Á bằng cách nào?",
        "historical_process_generation",
        "HUMAN_REVIEW",
        [
            {"value": "buôn bán", "type": "text_fact", "autoScorable": False},
            {"value": "truyền giáo", "type": "text_fact", "autoScorable": False},
        ],
        rationale="The process answer needs semantic ordering/context, not token equality.",
        human_review_rubric=[
            "Does the response describe the initial mechanisms?",
            "Does it avoid treating a keyword as a complete explanation?",
        ],
    ),
    _gold(
        "rag01-gen-014",
        11,
        "causes",
        "MEDIUM",
        "Vì sao cần cải cách bộ máy hành chính thời Lê sơ?",
        "causal_explanation_generation",
        "HUMAN_REVIEW",
        [{"value": "hành chính", "type": "text_fact", "autoScorable": False}],
        rationale="The word 'hành chính' names the topic but is not itself the causal answer.",
        human_review_rubric=[
            "Does the explanation identify the historical need for reform?",
            "Is the administrative context accurate?",
        ],
    ),
    _gold(
        "rag01-gen-015",
        11,
        "causes",
        "HARD",
        "Phong trào công nhân Li-ông thay đổi khẩu hiệu phản ánh điều gì?",
        "interpretive_reflection_generation",
        "HUMAN_REVIEW",
        [
            {"value": "1831", "type": "year", "autoScorable": True},
            {"value": "1834", "type": "year", "autoScorable": True},
        ],
        rationale="The years are evidence for a change from economic to political goals; neither year is the semantic answer to 'phản ánh điều gì?'.",
        human_review_rubric=[
            "Does the response interpret the change in slogans?",
            "Does it use 1831/1834 as evidence rather than as the answer?",
        ],
    ),
    _gold(
        "rag01-gen-016",
        11,
        "synthesis",
        "EASY",
        "Ai chỉ huy chiến thắng Bạch Đằng năm 938?",
        "direct_person_with_year_guard",
        "EXACT_SINGLE",
        [
            {"value": "Ngô Quyền", "type": "named_entity", "autoScorable": True},
            {"value": "938", "type": "year", "autoScorable": True},
        ],
        accepted_answers=["Ngô Quyền"],
        rationale="The deterministic marked answer is the commander; 938 is an independent critical year guard.",
    ),
    _gold(
        "rag01-gen-017",
        11,
        "synthesis",
        "MEDIUM",
        "Cải cách Minh Mạng hướng tới mục tiêu nào?",
        "goal_explanation_generation",
        "HUMAN_REVIEW",
        [{"value": "phân quyền", "type": "text_fact", "autoScorable": False}],
        rationale="The source describes overcoming decentralization and strengthening central authority; a single source word cannot prove the generated goal statement.",
        human_review_rubric=[
            "Does the answer state the goal rather than repeat 'phân quyền'?",
            "Does it connect the reform to central authority?",
        ],
    ),
    _gold(
        "rag01-gen-018",
        11,
        "synthesis",
        "HARD",
        "Lập bảng ba cuộc kháng chiến chống Nam Hán và Tống theo năm, người chỉ huy, trận quyết chiến.",
        "multi_row_synthesis_generation",
        "HUMAN_REVIEW",
        [
            {"value": "938", "type": "year", "autoScorable": True},
            {"value": "981", "type": "year", "autoScorable": True},
            {"value": "1075-1077", "type": "year_range", "autoScorable": True},
        ],
        rationale="A table requires three rows and multiple fields; 938 is only one datum and cannot be an answer target.",
        human_review_rubric=[
            "Are all three campaigns represented?",
            "Are years, commanders and decisive battles aligned?",
        ],
    ),
    _gold(
        "rag01-gen-019",
        12,
        "facts",
        "EASY",
        "Liên hợp quốc có bao nhiêu quốc gia thành viên theo tư liệu năm 2022?",
        "direct_count_generation",
        "EXACT_SINGLE",
        [{"value": "193", "type": "count", "autoScorable": True}],
        accepted_answers=["193"],
        rationale="The source gives one member count, explicitly scoped to 2022.",
    ),
    _gold(
        "rag01-gen-020",
        12,
        "facts",
        "MEDIUM",
        "Hội nghị Ianta diễn ra vào năm nào?",
        "direct_year_generation",
        "EXACT_SINGLE",
        [{"value": "1945", "type": "year", "autoScorable": True}],
        accepted_answers=["1945"],
        rationale="The source gives one conference year.",
    ),
    _gold(
        "rag01-gen-021",
        12,
        "facts",
        "HARD",
        "Nghị quyết UNESCO 24C/18.6.5 ghi nhận mốc kỉ niệm nào?",
        "multi_value_date_generation",
        "EXACT_SINGLE",
        [
            {"value": "1990", "type": "year", "autoScorable": True},
            {"value": "24C/18.6.5", "type": "identifier", "autoScorable": True},
        ],
        accepted_answers=["1990"],
        rationale="The task asks which commemorative milestone the resolution recorded. The source distinguishes 1987 as the adoption/session year and 1990 as the 100-year commemorative milestone; only 1990 is the semantic answer.",
    ),
    _gold(
        "rag01-gen-022",
        12,
        "causes",
        "EASY",
        "Vì sao Việt Nam đẩy mạnh hoạt động đối ngoại từ năm 1950?",
        "causal_explanation_generation",
        "HUMAN_REVIEW",
        [
            {"value": "1950", "type": "year", "autoScorable": True},
            {"value": "ủng hộ quốc tế", "type": "text_fact", "autoScorable": False},
        ],
        rationale="1950 is the time condition; the causal answer concerns seeking international support and diplomatic conditions.",
        human_review_rubric=[
            "Does the answer explain the reason for intensified diplomacy?",
            "Is 1950 treated as context rather than the answer?",
        ],
    ),
    _gold(
        "rag01-gen-023",
        12,
        "causes",
        "MEDIUM",
        "Công cuộc Đổi mới giai đoạn 1986–1995 đạt những thành tựu nào?",
        "achievement_summary_generation",
        "FACT_CONSTRAINED",
        [
            {
                "value": "xoá bỏ cơ chế quản lí kinh tế tập trung quan liêu, bao cấp",
                "type": "text_fact",
                "autoScorable": False,
            },
            {"value": "Ba chương trình kinh tế lớn", "type": "text_fact", "autoScorable": False},
        ],
        rationale="The answer must describe achievements/content from the 1986–1995 source passage; the years are temporal scope, not answer labels.",
        human_review_rubric=[
            "Does the response name actual achievements/content?",
            "Does it avoid treating 1986 as an achievement?",
            "Are claims supported by the selected source chunk?",
        ],
    ),
    _gold(
        "rag01-gen-024",
        12,
        "causes",
        "HARD",
        "Sau năm 1975, nhiệm vụ bảo vệ Tổ quốc có ý nghĩa gì?",
        "significance_explanation_generation",
        "HUMAN_REVIEW",
        [{"value": "bảo vệ Tổ quốc", "type": "text_fact", "autoScorable": False}],
        rationale="The question asks for significance and historical reasoning, not the phrase 'bảo vệ' alone.",
        human_review_rubric=[
            "Does the answer explain why independence/unification enabled the task?",
            "Is the significance historically grounded?",
        ],
    ),
    _gold(
        "rag01-gen-025",
        12,
        "synthesis",
        "EASY",
        "Nam Đàn gắn với những nhân vật lịch sử nào?",
        "multi_entity_generation",
        "EXACT_SET",
        [
            {"value": "Mai Thúc Loan", "type": "named_entity", "autoScorable": True},
            {"value": "Lê Lợi", "type": "named_entity", "autoScorable": True},
            {"value": "Nguyễn Huệ", "type": "named_entity", "autoScorable": True},
            {"value": "Vương Thúc Mậu", "type": "named_entity", "autoScorable": True},
        ],
        accepted_answer_sets=[["Mai Thúc Loan", "Lê Lợi", "Nguyễn Huệ", "Vương Thúc Mậu"]],
        rationale="The explicit set covers the four historical figures named in the selected source; one first entity is insufficient for the plural target.",
    ),
    _gold(
        "rag01-gen-026",
        12,
        "synthesis",
        "MEDIUM",
        "Nêu một thành tựu hạ tầng của công cuộc Đổi mới.",
        "bounded_example_generation",
        "FACT_CONSTRAINED",
        [
            {"value": "500 kV", "type": "measurement", "autoScorable": True},
            {"value": "1992", "type": "year", "autoScorable": True},
        ],
        rationale="The benchmark records a supported infrastructure example and its construction-year evidence; semantic usefulness remains reviewable.",
        human_review_rubric=[
            "Is the 500 kV Bắc–Nam line a valid infrastructure achievement?",
            "Does the explanation use the 1992–1993 evidence correctly?",
        ],
    ),
    _gold(
        "rag01-gen-027",
        12,
        "synthesis",
        "HARD",
        "Nghị quyết UNESCO về Hồ Chí Minh được thông qua ở đâu và có ý nghĩa gì?",
        "place_and_significance_generation",
        "HUMAN_REVIEW",
        [
            {"value": "Pa-ri", "type": "named_entity", "autoScorable": True},
            {"value": "24C/18.6.5", "type": "identifier", "autoScorable": True},
        ],
        rationale="The output must combine place, resolution and significance; a keyword cannot establish the requested meaning.",
        human_review_rubric=[
            "Is Pa-ri identified as the place?",
            "Is the significance explained without unsupported praise?",
        ],
    ),
]


def _normalized(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value.casefold())
    return "".join(char for char in decomposed if not unicodedata.combining(char))


FACT_TYPES = {"year", "date", "year_range", "count", "identifier", "measurement", "named_entity", "text_fact"}


def _build_fact(
    spec: dict[str, Any], source_ids: list[str], corpus: dict[str, dict[str, Any]], case_query: str
) -> dict[str, Any]:
    token = str(spec["value"])
    fact_type = str(spec["type"])
    if fact_type not in FACT_TYPES:
        raise ValueError(f"unsupported curated fact type {fact_type!r} for {case_query!r}")
    evidence: list[dict[str, Any]] = []
    normalized_token = _normalized(token)
    for chunk_id in source_ids:
        text = str(corpus[chunk_id].get("text", ""))
        normalized_text = _normalized(text)
        offset = normalized_text.find(normalized_token)
        if offset >= 0:
            evidence.append(
                {
                    "chunkId": chunk_id,
                    "match": token,
                    "normalizedMatch": normalized_token,
                    "offset": offset,
                    "snippet": normalized_text[max(0, offset - 80) : offset + len(normalized_token) + 80],
                    "sourceTextSha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
                }
            )
    if not evidence:
        raise ValueError(f"gold fact {token!r} for {case_query!r} is not evidenced by its source chunks")
    auto_scorable = bool(spec["autoScorable"])
    return {
        "type": fact_type,
        "subject": case_query,
        "relation": "critical_fact",
        "value": token,
        "acceptedValues": [token],
        "sourceChunkIds": source_ids,
        "autoScorable": auto_scorable,
        "humanReviewRequired": not auto_scorable,
        "evidence": evidence,
        "claim": token,
        "requiredTokens": [token],
        "curated": True,
    }


def generation_rows(corpus: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    source_ids = {
        (10, "facts", "EASY"): ["kntt-ls10-bai01-12122-c0001-7e3dcde4"],
        (10, "facts", "MEDIUM"): ["kntt-ls10-bai07-12143-c0002-cc59851c"],
        (10, "facts", "HARD"): ["kntt-ls10-bai13-12162-c0002-dc73135c"],
        (10, "causes", "EASY"): ["kntt-ls10-bai06-12141-c0002-ac61d138"],
        (10, "causes", "MEDIUM"): ["kntt-ls10-bai14-12169-c0002-605e3ca7"],
        (10, "causes", "HARD"): [
            "kntt-ls10-bai06-12141-c0002-ac61d138",
            "kntt-ls10-bai06-12141-c0003-126b8051",
        ],
        (10, "synthesis", "EASY"): ["kntt-ls10-bai13-12162-c0003-74f28ea3"],
        (10, "synthesis", "MEDIUM"): ["kntt-ls10-bai01-12122-c0001-7e3dcde4"],
        (10, "synthesis", "HARD"): ["kntt-ls10-bai06-12141-c0002-ac61d138"],
        (11, "facts", "EASY"): ["kntt-ls11-bai01-12335-c0001-9a647d0a"],
        (11, "facts", "MEDIUM"): ["kntt-ls11-bai13-12390-c0002-dfa004e0"],
        (11, "facts", "HARD"): ["kntt-ls11-bai14-12393-c0002-37a66004"],
        (11, "causes", "EASY"): ["kntt-ls11-bai05-12339-c0002-b9000010"],
        (11, "causes", "MEDIUM"): ["kntt-ls11-bai13-12390-c0002-dfa004e0"],
        (11, "causes", "HARD"): ["kntt-ls11-bai03-12337-c0002-19e2a32e"],
        (11, "synthesis", "EASY"): ["kntt-ls11-bai07-12370-c0004-567f989c"],
        (11, "synthesis", "MEDIUM"): ["kntt-ls11-bai14-12393-c0002-37a66004"],
        (11, "synthesis", "HARD"): ["kntt-ls11-bai07-12370-c0004-567f989c"],
        (12, "facts", "EASY"): ["kntt-ls12-bai01-12945-c0001-f1123afd"],
        (12, "facts", "MEDIUM"): ["kntt-ls12-bai02-12948-c0001-dbe913da"],
        (12, "facts", "HARD"): ["kntt-ls12-bai17-12968-c0002-041e298a"],
        (12, "causes", "EASY"): ["kntt-ls12-bai13-12964-c0002-897b5d01"],
        (12, "causes", "MEDIUM"): ["kntt-ls12-bai10-12958-c0001-59e93220"],
        (12, "causes", "HARD"): ["kntt-ls12-bai09-12957-c0002-ba4255e0"],
        (12, "synthesis", "EASY"): ["kntt-ls12-bai15-12966-c0002-db782ef3"],
        (12, "synthesis", "MEDIUM"): ["kntt-ls12-bai11-12960-c0002-e1d5cc18"],
        (12, "synthesis", "HARD"): ["kntt-ls12-bai17-12968-c0002-041e298a"],
    }
    rows = []
    for spec in GENERATION_GOLD_SPECS:
        case_id = spec["caseId"]
        grade = spec["grade"]
        group = spec["contentGroup"]
        difficulty = spec["difficulty"]
        query = spec["query"]
        ids = source_ids[(grade, group, difficulty)]
        missing = [chunk_id for chunk_id in ids if chunk_id not in corpus]
        if missing:
            raise ValueError(f"generation case cites missing chunk(s): {missing}")
        facts = [_build_fact(fact, ids, corpus, query) for fact in spec["criticalFacts"]]
        first_source = corpus[ids[0]]
        rows.append(
            {
                "benchmarkVersion": "rag01-generation-27-v2",
                "caseId": case_id,
                "grade": grade,
                "contentGroup": group,
                "difficulty": difficulty,
                "query": query,
                "topic": spec["topic"],
                "evaluationIntent": spec["evaluationIntent"],
                "lessonNumber": first_source.get("lessonNumber"),
                "count": 1,
                "topK": 5,
                "modelConfig": {
                    "temperature": 0.3,
                    "maxOutputTokens": 8192,
                    "maxRetries": 3,
                    "repairAttempts": 1,
                },
                "sourceChunkIds": ids,
                "sourceDocumentIds": sorted({corpus[chunk_id].get("documentId", "") for chunk_id in ids}),
                "target": {
                    "subject": query,
                    "targetMode": spec["targetMode"],
                    "acceptedAnswers": spec["acceptedAnswers"],
                    "acceptedAnswerSets": spec["acceptedAnswerSets"],
                    "autoScorable": spec["targetMode"] in {"EXACT_SINGLE", "EXACT_SET"},
                    "humanReviewRequired": spec["targetMode"] in {"FACT_CONSTRAINED", "HUMAN_REVIEW"},
                },
                "criticalFacts": facts,
                "goldFacts": facts,
                "forbiddenClaims": [],
                "goldRationale": spec["goldRationale"],
                "humanReviewRubric": spec["humanReviewRubric"],
                "goldSpecVersion": "rag01-v2-explicit-curated",
                "goldCurated": True,
                "sourceProvenance": {
                    "chunkIds": ids,
                    "note": "Canonical corpus source; explicit gold spec plus evidence locators/hashes are evaluation-only.",
                    "evidenceCount": sum(len(fact["evidence"]) for fact in facts),
                },
            }
        )
    return rows


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, default=OUT)
    args = parser.parse_args()
    corpus_rows = read_jsonl(CORPUS)
    corpus = {row["chunkId"]: row for row in corpus_rows}
    retrieval = old_retrieval_rows(corpus) + extra_retrieval_rows()
    generation = generation_rows(corpus)
    if len(retrieval) != 60:
        raise ValueError(f"retrieval benchmark must contain 60 cases, got {len(retrieval)}")
    if len(generation) != 27:
        raise ValueError(f"generation benchmark must contain 27 cases, got {len(generation)}")
    if len({row["caseId"] for row in retrieval}) != 60 or len({row["caseId"] for row in generation}) != 27:
        raise ValueError("benchmark case IDs must be unique")
    retrieval_path = args.output_dir / "retrieval_60_v1.jsonl"
    generation_path = args.output_dir / "generation_27_v1.jsonl"
    write_jsonl(retrieval_path, retrieval)
    write_jsonl(generation_path, generation)
    manifest = {
        "benchmarkVersion": "rag01-v2-explicit-curated",
        "canonicalCorpus": str(CORPUS.relative_to(ROOT)).replace("\\", "/"),
        "canonicalCorpusSha256": canonical_jsonl_sha256(CORPUS),
        "legacyRetrievalCasesPreserved": len(read_jsonl(OLD_RETRIEVAL)),
        "legacyGenerationCasesPreserved": len(read_jsonl(OLD_GENERATION)),
        "retrievalCases": len(retrieval),
        "generationCases": len(generation),
        "retrievalByGrade": {
            str(grade): sum(row["grade"] == grade for row in retrieval) for grade in (10, 11, 12)
        },
        "generationByGrade": {
            str(grade): sum(row["grade"] == grade for row in generation) for grade in (10, 11, 12)
        },
        "generationByDifficulty": {
            difficulty: sum(row["difficulty"] == difficulty for row in generation)
            for difficulty in ("EASY", "MEDIUM", "HARD")
        },
        "generationByContentGroup": {
            group: sum(row["contentGroup"] == group for row in generation)
            for group in ("facts", "causes", "synthesis")
        },
        "generationTargetModes": {
            target_mode: sum(row["target"]["targetMode"] == target_mode for row in generation)
            for target_mode in ("EXACT_SINGLE", "EXACT_SET", "FACT_CONSTRAINED", "HUMAN_REVIEW")
        },
        "goldSpecVersion": "rag01-v2-explicit-curated",
        "curatedGoldCaseCount": sum(row["goldCurated"] for row in generation),
        "providerCalls": 0,
        "status": "OFFLINE_DATASET_BUILD_ONLY",
    }
    (args.output_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(json.dumps(manifest, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
