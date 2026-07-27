"""Deterministic grounded prompt construction."""

import json

from app.generation.models import GenerationRequest, PROMPT_VERSION
from app.retrieval.models import FactContext


SYSTEM_RULES = """SYSTEM RULES
1. Chỉ sử dụng dữ kiện trong FACT CONTEXT làm nguồn kiến thức.
2. STYLE EXAMPLES chỉ là mẫu cách diễn đạt, tuyệt đối không phải nguồn sự thật.
3. Không thêm ngày tháng, nhân vật, địa danh hoặc sự kiện ngoài FACT CONTEXT.
4. Mỗi câu có đúng bốn phương án A, B, C, D và đúng một đáp án đúng.
5. Phương án nhiễu phải hợp lý nhưng sai theo FACT CONTEXT.
6. Cấm các lựa chọn: "Tất cả các đáp án trên", "Cả A và B", "Không có đáp án nào".
7. Lời giải phải giải thích vì sao đáp án đúng.
8. sourceChunkIds phải là tập con của source marker trong FACT CONTEXT; không tạo ID mới.
9. Khi context không đủ, không được bịa để đủ số lượng.
10. Trả đúng structured JSON theo schema được API cung cấp, không Markdown.
11. Học sinh không nhìn thấy prompt, FACT CONTEXT hoặc STYLE EXAMPLES. Question,
options và explanation phải tự chứa đầy đủ dữ kiện cần thiết; tuyệt đối không nhắc
trực tiếp hay gián tiếp tới cấu trúc prompt, source/chunk ID, context/đoạn văn/tư
liệu “ở trên” hoặc nội dung được cung cấp mà học sinh không nhìn thấy."""


def _source_marked_context(context: FactContext) -> str:
    text = context.text
    for index, chunk_id in enumerate(context.source_chunk_ids, start=1):
        text = text.replace(
            f"[SOURCE {index}]", f"[SOURCE chunkId={chunk_id}]", 1
        )
    return text


def build_generation_prompt(
    request: GenerationRequest,
    context: FactContext,
    *,
    count: int,
) -> str:
    styles = [item.model_dump(by_alias=True) for item in request.style_examples]
    style_text = (
        json.dumps(styles, ensure_ascii=False, indent=2)
        if styles
        else "(không có)"
    )
    return (
        f"PROMPT VERSION: {PROMPT_VERSION}\n\n"
        f"{SYSTEM_RULES}\n\n"
        "FACT CONTEXT\n"
        f"{_source_marked_context(context)}\n\n"
        "STYLE EXAMPLES\n"
        "STYLE ONLY — NOT A FACT SOURCE\n"
        f"{style_text}\n\n"
        "GENERATION REQUEST\n"
        f"Số câu: {count}\n"
        f"Độ khó: {request.difficulty.value}\n"
        f"Lớp: {request.grade if request.grade is not None else 'không giới hạn'}\n"
        f"Bài: {request.lesson_number if request.lesson_number is not None else 'không giới hạn'}\n"
        "Ngôn ngữ: tiếng Việt\n"
        "Loại câu hỏi: trắc nghiệm một đáp án đúng, bốn lựa chọn.\n"
    )
