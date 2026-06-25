"""Unit tests cho v3.1 parsing functions.

Chạy: pytest tests/test_parse.py -v
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Patch environment trước khi import module
os.environ.setdefault("GEMINI_API_KEYS", "dummy-key-for-testing")

# Patch _validate_clients để không thực sự gọi API khi import
import unittest.mock as mock

with mock.patch("google.genai.Client"):
    import parse_exam_word as pw


# ---------------------------------------------------------------------------
# Test parse_normalized_answers
# ---------------------------------------------------------------------------

def test_parse_normalized_answers_full():
    """24 MCQ + 16 T/F entries parse đúng key schema."""
    text = """[[DANH_SACH_DAP_AN]]

# PHAN_I_MCQ
1=A
2=B
3=C
4=D
5=A
6=B
7=C
8=D
9=A
10=B
11=C
12=D
13=A
14=B
15=C
16=D
17=A
18=B
19=C
20=D
21=A
22=B
23=C
24=D

# PHAN_II_TRUE_FALSE
25a=D
25b=S
25c=D
25d=S
26a=S
26b=D
26c=S
26d=D
27a=D
27b=D
27c=S
27d=S
28a=S
28b=S
28c=D
28d=D"""

    result = pw.parse_normalized_answers(text)

    # MCQ checks
    assert result["1"] == {"answer": "A"}, f"Câu 1: {result.get('1')}"
    assert result["24"] == {"answer": "D"}, f"Câu 24: {result.get('24')}"
    assert len([k for k in result if not k.startswith("tf_")]) == 24

    # T/F key mapping: 25→tf_1, 26→tf_2, 27→tf_3, 28→tf_4
    assert result["tf_1_a"] == {"isTrue": True},  f"tf_1_a: {result.get('tf_1_a')}"
    assert result["tf_1_b"] == {"isTrue": False}, f"tf_1_b: {result.get('tf_1_b')}"
    assert result["tf_4_c"] == {"isTrue": True},  f"tf_4_c: {result.get('tf_4_c')}"
    assert result["tf_4_d"] == {"isTrue": True},  f"tf_4_d: {result.get('tf_4_d')}"
    assert len([k for k in result if k.startswith("tf_")]) == 16


def test_parse_normalized_answers_question_mark():
    """? value → None (câu LLM không xác định được)."""
    text = "1=A\n2=?\n3=C"
    result = pw.parse_normalized_answers(text)
    assert result["2"]["answer"] is None


def test_parse_normalized_answers_tf_local_numbering():
    """Câu Đ/S đánh số 1-4 (không cộng 24) → section_pos = 1-4."""
    text = "1a=D\n1b=S\n2c=D"
    result = pw.parse_normalized_answers(text)
    # 1 < 25 → section_pos = 1
    assert "tf_1_a" in result
    assert result["tf_1_a"]["isTrue"] is True
    assert "tf_1_b" in result
    assert result["tf_1_b"]["isTrue"] is False


# ---------------------------------------------------------------------------
# Test parse_normalized_explanations — anti-hallucination
# ---------------------------------------------------------------------------

def test_parse_explanations_anti_halluc_reject():
    """Content bị LLM đổi nội dung → REJECT từ anti-halluc.
    
    Fallback regex sẽ lấy content gốc từ original_block (đây là hành vi đúng).
    Điều quan trọng: nội dung bịa đặt của LLM KHÔNG xuất hiện trong result.
    """
    original = "Câu 1. Chọn A. Năm 1996 Việt Nam đẩy mạnh công nghiệp hóa hiện đại hóa."
    # LLM đã sửa năm 1996 → 1986 và thay đổi toàn bộ nội dung
    marked = (
        "<<<Q1|MCQ|A>>>Câu 1. Chọn B. Năm 1986 Việt Nam tiến hành đổi mới "
        "hoàn toàn khác hẳn nội dung gốc không thể match được.<<<END>>>"
    )
    result = pw.parse_normalized_explanations(marked, original)
    # Nội dung bịa đặt của LLM KHÔNG được xuất hiện
    if "1" in result:
        expl = result["1"].get("explanation", "")
        assert "1986" not in expl, f"Nội dung bịa đặt LLM (1986) không được xuất hiện: {expl}"
        assert "hoàn toàn khác hẳn" not in expl, f"Nội dung bịa đặt LLM không được xuất hiện: {expl}"


def test_parse_explanations_valid_passthrough():
    """Content giữ nguyên văn → PASS, explanation được lấy đúng."""
    original = "Câu 1. Chọn A. Từ Đại hội VIII năm 1996, Việt Nam đẩy mạnh CNH-HĐH."
    marked = (
        "<<<Q1|MCQ|A>>>Câu 1. Chọn A. Từ Đại hội VIII năm 1996, "
        "Việt Nam đẩy mạnh CNH-HĐH.<<<END>>>"
    )
    result = pw.parse_normalized_explanations(marked, original)
    assert "1" in result, "Kỳ vọng có trong result nhưng bị REJECT"
    assert "Đại hội VIII" in result["1"]["explanation"]
    assert result["1"]["answer"] == "A"


def test_parse_explanations_missing_end():
    """LLM quên <<<END>>> ở câu 1 → regex dừng ở <<<Q2, không nuốt câu 2."""
    original = "Câu 1. Lời giải câu một. Câu 2. Lời giải câu hai."
    # Câu 1 KHÔNG có <<<END>>>, regex phải dừng ở <<<Q2
    marked = (
        "<<<Q1|MCQ|A>>>Câu 1. Lời giải câu một. "
        "<<<Q2|MCQ|B>>>Câu 2. Lời giải câu hai.<<<END>>>"
    )
    result = pw.parse_normalized_explanations(marked, original)

    assert "1" in result, "Câu 1 phải được parse dù thiếu <<<END>>>"
    assert "2" in result, "Câu 2 phải được parse"

    expl_1 = result["1"]["explanation"]
    assert "Lời giải câu hai" not in expl_1, (
        f"Câu 1 không được nuốt nội dung câu 2. Got: {expl_1}"
    )


def test_parse_explanations_tf_marker():
    """Câu Đ/S với marker TF → key tf_{section_pos}_{sub}."""
    original = "Ý a câu 25. Nhận xét đúng về kinh tế Việt Nam."
    marked = (
        "<<<Q25|TF|a|D>>>Ý a câu 25. Nhận xét đúng về kinh tế Việt Nam.<<<END>>>"
    )
    result = pw.parse_normalized_explanations(marked, original)
    # 25 → section_pos = 25 - 24 = 1
    assert "tf_1_a" in result, f"Kỳ vọng tf_1_a, result keys: {list(result.keys())}"
    assert result["tf_1_a"]["isTrue"] is True
    assert "kinh tế" in result["tf_1_a"]["explanation"]


def test_parse_explanations_strip_code_fence():
    """Pre-process phải xóa markdown code fence khỏi LLM output."""
    original = "Câu 1. Lời giải một."
    marked = "```\n<<<Q1|MCQ|A>>>Câu 1. Lời giải một.<<<END>>>\n```"
    result = pw.parse_normalized_explanations(marked, original)
    assert "1" in result, "Code fence phải được strip trước khi parse"


# ---------------------------------------------------------------------------
# Test build_answer_dict — source of truth priority
# ---------------------------------------------------------------------------

def test_build_answer_dict_khoi2_wins():
    """Khi Khối 2 (bảng đáp án) và Khối 3 (lời giải) có đáp án khác nhau → Khối 2 thắng."""
    # Normalize text chuẩn: câu 1=A (Khối 2)
    norm_answers = "1=A\n"
    # Lời giải có marker: câu 1 = B (LLM ghi sai trong lời giải)
    # Nhưng phần explanation gốc khớp nên pass anti-halluc
    original_expl = "Câu 1. Chọn A vì lý do x."
    marked_expl = "<<<Q1|MCQ|B>>>Câu 1. Chọn A vì lý do x.<<<END>>>"

    result = pw.build_answer_dict(
        norm_answers,
        marked_expl,
        original_explanation_block=original_expl,
        exam_id="test",
    )

    assert result["1"]["answer"] == "A", (
        f"Khối 2 phải thắng (A), nhưng got: {result['1']['answer']}"
    )
    assert "lý do x" in result["1"]["explanation"]


# ---------------------------------------------------------------------------
# Test verify_structural_integrity — L1
# ---------------------------------------------------------------------------

def _make_mcq(order: int, exam_id: str = "exam") -> dict:
    return {
        "id": f"{exam_id}-q{str(order).zfill(2)}",
        "questionType": "mcq",
        "orderInExam": order,
        "correctOptionId": "A",
        "options": [{"id": "A"}, {"id": "B"}, {"id": "C"}, {"id": "D"}],
        "questionText": "",
    }


def _make_tf(order: int, exam_id: str = "exam") -> dict:
    return {
        "id": f"{exam_id}-q{str(order).zfill(2)}",
        "questionType": "true_false",
        "orderInExam": order,
        "statements": [
            {"id": "a", "isTrue": True},
            {"id": "b", "isTrue": False},
            {"id": "c", "isTrue": True},
            {"id": "d", "isTrue": False},
        ],
        "questionText": "",
    }


def _make_full_exam(mcq_orders=None, tf_orders=None, exam_id="exam") -> dict:
    if mcq_orders is None:
        mcq_orders = list(range(1, 25))
    if tf_orders is None:
        tf_orders = [25, 26, 27, 28]
    return {
        "sections": [
            {
                "sectionType": "mcq",
                "questions": [_make_mcq(o, exam_id) for o in mcq_orders],
            },
            {
                "sectionType": "true_false",
                "questions": [_make_tf(o, exam_id) for o in tf_orders],
            },
        ]
    }


def test_verify_structural_all_pass():
    """File đúng chuẩn → L1 all_passed=True."""
    v1 = pw.verify_structural_integrity(_make_full_exam())
    assert v1["all_passed"], f"Kỳ vọng all_passed nhưng failed: {[c for c in v1['checks'] if not c['passed']]}"


def test_verify_catches_duplicate_id():
    """ID q04 trùng giữa MCQ và T/F → L1 FAIL, duplicates chứa ID đó."""
    full_exam = {
        "sections": [
            {"sectionType": "mcq", "questions": [_make_mcq(4)]},
            # T/F dùng orderInExam=4 (bug cũ) → ID cũng là exam-q04
            {"sectionType": "true_false", "questions": [
                {**_make_tf(28), "id": "exam-q04", "orderInExam": 4}
            ]},
        ]
    }
    v1 = pw.verify_structural_integrity(full_exam)
    assert not v1["all_passed"]
    dup_check = next(c for c in v1["checks"] if "duplicate" in c["name"].lower())
    assert "exam-q04" in dup_check["duplicates"]


def test_verify_catches_tf_wrong_order():
    """T/F có orderInExam=4 (< 25) → CHECK 4 phải FAIL."""
    full_exam = {
        "sections": [
            {"sectionType": "true_false", "questions": [
                {**_make_tf(28), "orderInExam": 4}
            ]},
        ]
    }
    v1 = pw.verify_structural_integrity(full_exam)
    wrong_order_check = next(c for c in v1["checks"] if ">= 25" in c["name"])
    assert not wrong_order_check["passed"]


# ---------------------------------------------------------------------------
# Test verify_cross_source_mapping — L2
# ---------------------------------------------------------------------------

def test_verify_catches_mcq_answer_mismatch():
    """JSON correctOptionId=A nhưng lời giải 'Câu 1. Chọn B.' → L2 conflict."""
    full_exam = {
        "sections": [{
            "sectionType": "mcq",
            "questions": [{
                "id": "exam-q01",
                "questionType": "mcq",
                "orderInExam": 1,
                "correctOptionId": "A",
                "questionText": "...",
            }]
        }]
    }
    original_expl = "Câu 1. Chọn B. Vì đây là đáp án đúng..."
    v2 = pw.verify_cross_source_mapping(full_exam, original_expl)
    assert v2["n_mcq_conflicts"] == 1
    assert not v2["all_passed"]


def test_verify_tf_correct_mapping_no_conflict():
    """T/F q25 + lời giải dùng số local (Câu 1) → L2 KHÔNG có conflict nếu đáp án khớp."""
    full_exam = {
        "sections": [{
            "sectionType": "true_false",
            "questions": [{
                "id": "exam-q25",
                "questionType": "true_false",
                "orderInExam": 25,
                "questionText": "Đoạn dẫn câu 25...",
                "statements": [
                    {"id": "a", "isTrue": False},
                    {"id": "b", "isTrue": True},
                    {"id": "c", "isTrue": False},
                    {"id": "d", "isTrue": True},
                ],
            }]
        }]
    }
    # Lời giải dùng số local "Câu 1" (1 ↔ 25)
    original_expl = (
        "Câu 1\n"
        "a) Sai. Lý do a.\n"
        "b) Đúng. Lý do b.\n"
        "c) Sai. Lý do c.\n"
        "d) Đúng. Lý do d.\n"
    )
    v2 = pw.verify_cross_source_mapping(full_exam, original_expl)
    assert v2["n_tf_conflicts"] == 0, (
        f"Mapping đúng không được có conflict. Got: {v2['conflicts']}"
    )


def test_verify_catches_shifting_pattern():
    """Mô phỏng shifting error: 8+ T/F entries mismatch → shifting_pattern_detected=True."""
    # 4 câu T/F, mỗi câu 4 statements → 16 entries; tất cả mismatch
    tf_questions = []
    for order in [25, 26, 27, 28]:
        tf_questions.append({
            "id": f"exam-q{order}",
            "questionType": "true_false",
            "orderInExam": order,
            "questionText": "",
            "statements": [
                {"id": "a", "isTrue": True},
                {"id": "b", "isTrue": True},
                {"id": "c", "isTrue": True},
                {"id": "d", "isTrue": True},
            ],
        })
    full_exam = {"sections": [{"sectionType": "true_false", "questions": tf_questions}]}

    # Lời giải: tất cả đều là Sai (ngược với JSON)
    lines = []
    for local in [1, 2, 3, 4]:
        lines.append(f"Câu {local}\na) Sai\nb) Sai\nc) Sai\nd) Sai")
    original_expl = "\n".join(lines)

    v2 = pw.verify_cross_source_mapping(full_exam, original_expl)
    assert v2["shifting_pattern_detected"], (
        f"Phải phát hiện shifting pattern. n_tf_conflicts={v2['n_tf_conflicts']}"
    )


# ---------------------------------------------------------------------------
# merge_and_validate — T/F duplicate label fix
# ---------------------------------------------------------------------------

def _base_tf_llm_q(order=25, stmts=None):
    if stmts is None:
        stmts = [{"id": "a", "text": "..."}, {"id": "b", "text": "..."}]
    return {
        "questionNumber": order,
        "questionType": "true_false",
        "questionText": "Đoạn dẫn...",
        "statements": stmts,
        "topic": "Test",
        "cognitiveLevel": "comprehension",
        "hasImage": False,
    }


def test_merge_strips_duplicate_tf_label():
    """T/F: content đã có 'a)' → merge KHÔNG được prepend thêm 'a)' → no 'a) a)'."""
    answer_dict = {
        "tf_1_a": {"isTrue": True,  "explanation": "a) Đúng. Lý do là..."},
        "tf_1_b": {"isTrue": False, "explanation": "b) Sai. Lý do là..."},
    }
    llm_questions = [_base_tf_llm_q(25)]
    result = pw.merge_and_validate(llm_questions, answer_dict, {"examId": "test", "sourceDetail": "Test"})
    tf_q = next(q for s in result["sections"] for q in s["questions"] if q["questionType"] == "true_false")
    expl = tf_q["explanation"]
    assert "a) a)" not in expl, f"Duplicate 'a) a)' xuất hiện: {expl[:80]}"
    assert "b) b)" not in expl, f"Duplicate 'b) b)' xuất hiện: {expl[:80]}"
    assert "a) Đúng" in expl, f"Label 'a) Đúng' phải có mặt: {expl[:80]}"
    assert "b) Sai"  in expl, f"Label 'b) Sai' phải có mặt: {expl[:80]}"


def test_merge_adds_label_if_missing():
    """T/F: content KHÔNG có label → merge tự thêm label 'a)'."""
    answer_dict = {
        "tf_1_a": {"isTrue": True, "explanation": "Đúng vì lý do quan trọng..."},
    }
    llm_questions = [_base_tf_llm_q(25, stmts=[{"id": "a", "text": "..."}])]
    result = pw.merge_and_validate(llm_questions, answer_dict, {"examId": "test", "sourceDetail": "Test"})
    tf_q = next(q for s in result["sections"] for q in s["questions"] if q["questionType"] == "true_false")
    expl = tf_q["explanation"]
    assert expl.startswith("a) Đúng"), f"Phải bắt đầu bằng 'a) Đúng': {expl[:40]}"


# ---------------------------------------------------------------------------
# Fix 1A: Artifact strip
# ---------------------------------------------------------------------------

def test_parse_strips_leaked_gt_artifact():
    """LLM leak '>' ở đầu content → phải được strip, explanation bắt đầu bằng 'Câu 1'."""
    original = "Câu 1. Đáp án A. Lý do là..."
    marked = "[[Q1|MCQ|A]]>\nCâu 1. Đáp án A. Lý do là...[[END]]"
    result = pw.parse_normalized_explanations(marked, original)
    assert "1" in result, "Câu 1 phải parse được"
    expl = result["1"]["explanation"]
    assert not expl.startswith(">"), f"Content không được bắt đầu bằng '>': {expl[:30]}"
    assert not expl.startswith("\n"), f"Content không được bắt đầu bằng newline: {repr(expl[:10])}"
    assert expl.startswith("Câu 1"), f"Content phải bắt đầu bằng 'Câu 1': {expl[:30]}"


def test_parse_strips_duplicate_tf_label():
    """T/F: 'a) >' + newline + 'a) Đúng...' → duplicate label phải được strip."""
    original = "a) Đúng. Lý do..."
    marked = "[[Q25|TF|a|D]]a) >\na) Đúng. Lý do...[[END]]"
    result = pw.parse_normalized_explanations(marked, original)
    assert "tf_1_a" in result, "tf_1_a phải parse được"
    content = result["tf_1_a"]["explanation"]
    assert content.count("a)") <= 1, f"Duplicate 'a)' không được xuất hiện: {content[:50]}"


def test_parse_new_bracket_marker_format():
    """New format [[Q1|MCQ|A]]...[[END]] phải parse đúng."""
    original = "Câu 1. Chọn A. Đây là lý do."
    marked = "[[Q1|MCQ|A]]Câu 1. Chọn A. Đây là lý do.[[END]]"
    result = pw.parse_normalized_explanations(marked, original)
    assert "1" in result
    assert result["1"]["answer"] == "A"
    assert "lý do" in result["1"]["explanation"]


def test_parse_backward_compat_old_marker():
    """Format cũ <<<Q1|MCQ|A>>>...<<<END>>> vẫn parse được (backward compat)."""
    original = "Câu 1. Chọn B. Lý do cũ."
    marked = "<<<Q1|MCQ|B>>>Câu 1. Chọn B. Lý do cũ.<<<END>>>"
    result = pw.parse_normalized_explanations(marked, original)
    assert "1" in result
    assert result["1"]["answer"] == "B"


# ---------------------------------------------------------------------------
# Fix 2: L3 citation strip
# ---------------------------------------------------------------------------

def test_l3_ignores_citation_years():
    """L3 không flag câu có năm chỉ trong metadata trích dẫn nguồn."""
    full_exam = {
        "sections": [{
            "sectionType": "mcq",
            "questions": [{
                "id": "test-q01",
                "orderInExam": 1,
                "questionType": "mcq",
                "questionText": (
                    "Đặc điểm của Liên hợp quốc trong thế kỷ XX... "
                    "(Trần Nam Tiến, Lịch sử thế giới, NXB Giáo dục, 2008, tr.23)"
                ),
                "explanation": "Liên hợp quốc là tổ chức đa phương lớn nhất thế giới.",
            }]
        }]
    }
    v3 = pw.verify_content_integrity(full_exam)
    assert v3["n_suspicious"] == 0, (
        f"2008 chỉ trong metadata, không nên flag. Got: {v3['suspicious']}"
    )


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
