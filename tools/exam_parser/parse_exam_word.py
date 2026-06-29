"""
parse_exam_word.py – ETL Pipeline: Word (.docx) → LLM (Gemini 2.0 Flash) → JSON

Pipeline 4 bước:
  Bước 1: python-docx đọc toàn bộ text → cắt 3 khối bằng anchor [[BẢNG ĐÁP ÁN]] + [[LỜI GIẢI CHI TIẾT]]
  Bước 2: Gọi Gemini parse câu hỏi từ Khối 1 + gán topic/cognitiveLevel
  Bước 3: Parse bảng đáp án (Khối 2) + lời giải (Khối 3) → dict tổng hợp
  Bước 4: Merge đáp án vào câu hỏi LLM + validate + xuất JSON

Usage:
  python parse_exam_word.py input/de_thi.docx --year 2025 --source "Bộ GDĐT" --exam-code 301
  python parse_exam_word.py input/  # parse tất cả .docx trong thư mục
"""

import argparse
import json
import os
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph
from docx.oxml.ns import qn
from dotenv import load_dotenv
from google import genai
from google.genai import types
from lxml import etree

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
load_dotenv()

# Hỗ trợ nhiều API key: GEMINI_API_KEYS=key1,key2,key3 (ngăn cách bằng dấu phẩy)
# Fallback: GEMINI_API_KEY (key đơn, tương thích ngược)
_keys_raw = os.getenv("GEMINI_API_KEYS") or os.getenv("GEMINI_API_KEY") or ""
GEMINI_API_KEYS: list[str] = [k.strip() for k in _keys_raw.split(",") if k.strip()]
if not GEMINI_API_KEYS:
    print("❌ Thiếu GEMINI_API_KEY(S). Thêm vào .env:\n  GEMINI_API_KEYS=key1,key2,key3")
    sys.exit(1)

MODEL_ID = "gemini-2.5-flash"
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "10"))  # số câu hỏi ước tính mỗi chunk gửi cho LLM
OUTPUT_DIR = Path(__file__).parent / "output" / "exams"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
DEBUG_DIR = Path(__file__).parent / "output" / "debug"
DEBUG_DIR.mkdir(parents=True, exist_ok=True)

_clients = [genai.Client(api_key=k) for k in GEMINI_API_KEYS]
_key_idx = 0  # index của client đang dùng
_key_lock = threading.Lock()


def _next_key_idx() -> int:
    """Thread-safe key rotation: trả về index hiện tại và tăng lên."""
    global _key_idx
    with _key_lock:
        idx = _key_idx
        _key_idx = (_key_idx + 1) % len(_clients)
    return idx


def _save_debug_text(exam_id: str, kind: str, text: str) -> None:
    """Lưu intermediate text để debug khi parsing sai.

    Files được tạo: <exam_id>_<kind>.txt trong output/debug/.
    Các kind thường dùng: answers_normalized, explanations_marked, explanations_original.
    """
    try:
        path = DEBUG_DIR / f"{exam_id}_{kind}.txt"
        path.write_text(text, encoding="utf-8")
    except Exception as e:
        print(f"  ⚠ Không lưu được debug file {kind}: {e}")


def _validate_clients() -> None:
    """
    Kiểm tra song song tất cả API key ngay lúc khởi động.
    Loại bỏ key không hợp lệ (400/401/403) hoặc hết quota (429).
    Cập nhật _clients và _key_idx tại chỗ.
    """
    global _clients, _key_idx
    from concurrent.futures import ThreadPoolExecutor, as_completed

    def _probe(idx: int, client) -> tuple[int, bool, str]:
        try:
            r = client.models.generate_content(
                model=MODEL_ID,
                contents="Say OK",
                config=types.GenerateContentConfig(max_output_tokens=10, temperature=0),
            )
            _ = r.text  # force evaluation
            return idx, True, "OK"
        except Exception as e:
            err = str(e)
            if "429" in err or "RESOURCE_EXHAUSTED" in err:
                return idx, False, "quota"
            if any(x in err for x in ("400", "401", "403", "API_KEY_INVALID", "PERMISSION_DENIED")):
                return idx, False, "invalid"
            # Lỗi tạm thời (mạng, timeout…) → giữ lại key, cảnh báo
            return idx, True, f"warn({err[:80]})"

    n = len(_clients)
    print(f"🔍 Kiểm tra {n} API key(s)...", flush=True)
    results: list[tuple[int, bool, str]] = [(i, False, "pending") for i in range(n)]

    with ThreadPoolExecutor(max_workers=min(n, 6)) as pool:
        futs = {pool.submit(_probe, i, c): i for i, c in enumerate(_clients)}
        for fut in as_completed(futs):
            idx, ok, status = fut.result()
            results[idx] = (idx, ok, status)

    good: list = []
    for idx, ok, status in results:
        preview = GEMINI_API_KEYS[idx][:10] + "..."
        if ok:
            icon = "⚠" if status.startswith("warn") else "✅"
            print(f"  {icon} Key {idx + 1} ({preview}): {status}")
            good.append(_clients[idx])
        else:
            label = "hết quota (429)" if status == "quota" else "không hợp lệ"
            print(f"  ❌ Key {idx + 1} ({preview}): {label} → loại bỏ")

    if not good:
        print("❌ Tất cả API key đều lỗi! Kiểm tra lại .env")
        sys.exit(1)

    _clients = good
    _key_idx = 0
    print(f"✅ Sẵn sàng: {len(_clients)}/{n} key(s) dùng được.\n")


print(f"🔑 Loaded {len(_clients)} API key(s).")
_validate_clients()

# ---------------------------------------------------------------------------
# BƯỚC 1: Đọc raw từ python-docx
# ---------------------------------------------------------------------------

def extract_full_text(doc: Document) -> str:
    """
    Đọc TOÀN BỘ text trong file Word theo đúng thứ tự xuất hiện,
    bao gồm cả paragraphs LẪN text bên trong table cells.

    Duyệt doc.element.body theo thứ tự XML:
    - Gặp <w:p> (paragraph) → lấy text
    - Gặp <w:tbl> (table) → duyệt từng row → từng cell → lấy text
    Đảm bảo không mất đoạn tư liệu đọc hiểu nằm trong bảng 1 ô.
    """
    full_parts: list[str] = []
    for element in doc.element.body:
        if element.tag == qn("w:p"):
            para = Paragraph(element, doc)
            text = para.text.strip()
            if text:
                full_parts.append(text)
        elif element.tag == qn("w:tbl"):
            table = Table(element, doc)
            for row in table.rows:
                # Deduplicate merged cells bằng XML element identity (_tc)
                # Giữ nguyên giá trị trùng (VD: C, C trong MCQ hoặc Đ, Đ trong T/F)
                cells: list[str] = []
                seen_tcs: set = set()
                for cell in row.cells:
                    tc = cell._tc
                    if tc in seen_tcs:
                        continue
                    seen_tcs.add(tc)
                    cells.append(cell.text.strip())
                row_text = " | ".join(c for c in cells if c)
                if row_text:
                    full_parts.append(row_text)
    return "\n".join(full_parts)


def detect_images(doc: Document) -> list[int]:
    """Quét XML tìm hình ảnh, trả về danh sách index block chứa ảnh."""
    image_blocks: list[int] = []
    for i, element in enumerate(doc.element.body):
        if hasattr(element, "xml"):
            xml_str = element.xml if isinstance(element.xml, str) else element.xml.decode("utf-8", errors="ignore")
        else:
            xml_str = etree.tostring(element, encoding="unicode", method="xml")
        if "a:blip" in xml_str or "wp:inline" in xml_str:
            image_blocks.append(i)
            print(f"  ⚠ Phát hiện hình ảnh tại block #{i} – cần review thủ công")
    return image_blocks


def split_three_blocks(full_text: str) -> tuple[str, str, str]:
    """
    Cắt file thành 3 khối bằng 2 anchor keywords ASCII-friendly.
    Khối 1 (Câu hỏi):     đầu file → trước [[DANH_SACH_DAP_AN]]
    Khối 2 (Bảng đáp án): [[DANH_SACH_DAP_AN]] → trước [[LOI_GIAI_CHI_TIET]]
    Khối 3 (Lời giải):   sau [[LOI_GIAI_CHI_TIET]] → hết file  (có thể rỗng)
    """
    ANCHOR_1 = "[[DANH_SACH_DAP_AN]]"
    ANCHOR_2 = "[[LOI_GIAI_CHI_TIET]]"

    pos1 = full_text.find(ANCHOR_1)
    if pos1 == -1:
        print("  ⚠ Không tìm thấy [[DANH_SACH_DAP_AN]] – trả về toàn bộ text làm khối câu hỏi.")
        return full_text.strip(), "", ""

    question_block = full_text[:pos1].strip()
    rest = full_text[pos1 + len(ANCHOR_1):]

    pos2 = rest.find(ANCHOR_2)
    if pos2 == -1:
        # Không có lời giải → Khối 2 kéo dài đến hết file
        return question_block, rest.strip(), ""

    answer_table_block = rest[:pos2].strip()
    explanation_block = rest[pos2 + len(ANCHOR_2):].strip()
    return question_block, answer_table_block, explanation_block


# ---------------------------------------------------------------------------
# BƯỚC 2: Gọi Gemini 2.0 Flash (LLM Parser + Tagger)
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """Bạn là parser đề thi Lịch sử THPT Việt Nam. Nhiệm vụ:
1. Đọc đoạn text đề thi dưới đây và trích xuất TỪNG CÂU HỎI.
2. Phân loại mỗi câu là "mcq" (trắc nghiệm 4 lựa chọn A/B/C/D) hoặc "true_false" (câu dẫn nhập + 4 phát biểu a/b/c/d Đúng/Sai).
3. Với MỖI câu, bạn BẮT BUỘC tự suy luận và điền:
   - "topic": chủ đề lịch sử cụ thể (VD: "Kháng chiến chống Pháp 1945-1954", "Phong trào dân tộc dân chủ 1919-1930", "Chiến tranh thế giới thứ hai", "Các nước Đông Nam Á", "Việt Nam thời Bắc thuộc"...)
   - "cognitiveLevel": một trong ["knowledge", "comprehension", "application"]
4. KHÔNG điền đáp án đúng. Với MCQ để correctOptionId = null. Với true_false KHÔNG có trường isTrue.
5. Trả về ĐÚNG JSON array theo schema. Không thêm text nào ngoài JSON.

Lưu ý quan trọng:
- Text đề thi có thể có lỗi gõ, dấu câu bất nhất ("Câu 1:" vs "Câu 1." vs "Cau 1"), options không đều dòng.
- Bạn phải TỰ SỬA và format lại cho chuẩn.
- Nếu đoạn text chứa header đề thi (tên trường, mã đề, thời gian...) thì BỎ QUA, chỉ lấy câu hỏi.
- Với câu true_false: "questionText" là phần dẫn nhập/tư liệu đọc hiểu, "statements" là 4 phát biểu a/b/c/d."""

MCQ_QUESTION_SCHEMA = types.Schema(
    type=types.Type.OBJECT,
    properties={
        "questionNumber": types.Schema(type=types.Type.INTEGER),
        "questionType": types.Schema(type=types.Type.STRING, enum=["mcq"]),
        "questionText": types.Schema(type=types.Type.STRING),
        "options": types.Schema(
            type=types.Type.ARRAY,
            items=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "id": types.Schema(type=types.Type.STRING, enum=["A", "B", "C", "D"]),
                    "text": types.Schema(type=types.Type.STRING),
                },
                required=["id", "text"],
            ),
        ),
        "topic": types.Schema(type=types.Type.STRING),
        "cognitiveLevel": types.Schema(
            type=types.Type.STRING,
            enum=["knowledge", "comprehension", "application"],
        ),
        "hasImage": types.Schema(type=types.Type.BOOLEAN),
    },
    required=["questionNumber", "questionType", "questionText", "options", "topic", "cognitiveLevel", "hasImage"],
)

TF_STATEMENT_SCHEMA = types.Schema(
    type=types.Type.OBJECT,
    properties={
        "id": types.Schema(type=types.Type.STRING, enum=["a", "b", "c", "d"]),
        "text": types.Schema(type=types.Type.STRING),
    },
    required=["id", "text"],
)

TF_QUESTION_SCHEMA = types.Schema(
    type=types.Type.OBJECT,
    properties={
        "questionNumber": types.Schema(type=types.Type.INTEGER),
        "questionType": types.Schema(type=types.Type.STRING, enum=["true_false"]),
        "questionText": types.Schema(type=types.Type.STRING),
        "statements": types.Schema(
            type=types.Type.ARRAY,
            items=TF_STATEMENT_SCHEMA,
        ),
        "topic": types.Schema(type=types.Type.STRING),
        "cognitiveLevel": types.Schema(
            type=types.Type.STRING,
            enum=["knowledge", "comprehension", "application"],
        ),
        "hasImage": types.Schema(type=types.Type.BOOLEAN),
    },
    required=["questionNumber", "questionType", "questionText", "statements", "topic", "cognitiveLevel", "hasImage"],
)

# Union schema: mỗi phần tử trong array có thể là MCQ hoặc TF
QUESTION_SCHEMA = types.Schema(
    type=types.Type.OBJECT,
    properties={
        "questionNumber": types.Schema(type=types.Type.INTEGER),
        "questionType": types.Schema(type=types.Type.STRING, enum=["mcq", "true_false"]),
        "questionText": types.Schema(type=types.Type.STRING),
        "options": types.Schema(
            type=types.Type.ARRAY,
            items=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "id": types.Schema(type=types.Type.STRING),
                    "text": types.Schema(type=types.Type.STRING),
                },
                required=["id", "text"],
            ),
            nullable=True,
        ),
        "statements": types.Schema(
            type=types.Type.ARRAY,
            items=TF_STATEMENT_SCHEMA,
            nullable=True,
        ),
        "topic": types.Schema(type=types.Type.STRING),
        "cognitiveLevel": types.Schema(
            type=types.Type.STRING,
            enum=["knowledge", "comprehension", "application"],
        ),
        "hasImage": types.Schema(type=types.Type.BOOLEAN),
    },
    required=["questionNumber", "questionType", "questionText", "topic", "cognitiveLevel", "hasImage"],
)

RESPONSE_SCHEMA = types.Schema(
    type=types.Type.ARRAY,
    items=QUESTION_SCHEMA,
)


def chunk_text(text: str, approx_questions_per_chunk: int = CHUNK_SIZE) -> list[str]:
    """
    Chia text thành chunks. Tìm ranh giới câu hỏi bằng pattern 'Câu X'
    để tránh cắt giữa câu hỏi.
    """
    # Tìm tất cả vị trí bắt đầu câu hỏi
    pattern = re.compile(r"(?m)^.*?(?:Câu|CÂU|câu|Cau|cau)\s*\d+", re.IGNORECASE)
    matches = list(pattern.finditer(text))

    if not matches:
        # Không tìm thấy pattern → trả về nguyên block
        return [text] if text.strip() else []

    chunks: list[str] = []
    i = 0
    while i < len(matches):
        start_pos = matches[i].start()
        end_idx = min(i + approx_questions_per_chunk, len(matches))
        if end_idx < len(matches):
            end_pos = matches[end_idx].start()
        else:
            end_pos = len(text)

        chunk = text[start_pos:end_pos].strip()
        if chunk:
            chunks.append(chunk)
        i = end_idx

    return chunks


def _parse_retry_delay(error_str: str, default: int = 30) -> int:
    """Trích xuất retryDelay (giây) từ message lỗi của Google API."""
    m = re.search(r"retryDelay':\s*'(\d+)s'", error_str)
    if m:
        return int(m.group(1)) + 5  # thêm 5s buffer
    return default


def call_gemini(chunk: str) -> list[dict]:
    """Gọi Gemini Flash với Structured Outputs, trả về list of question dicts.

    Key rotation: khi gặp 429 RESOURCE_EXHAUSTED, tự động chuyển sang key tiếp theo.
    Sau khi thử hết vòng tất cả keys, mới wait theo retryDelay rồi thử lại.
    Dùng _next_key_idx() (thread-safe) thay vì truy cập _key_idx trực tiếp.
    """
    max_attempts = 4 + len(_clients)  # 4 wait-retries + 1 rotation slot per key
    keys_tried_since_last_wait = 0
    cur_idx = _next_key_idx()

    for attempt in range(1, max_attempts + 1):
        try:
            response = _clients[cur_idx].models.generate_content(
                model=MODEL_ID,
                contents=chunk,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_PROMPT,
                    response_mime_type="application/json",
                    response_schema=RESPONSE_SCHEMA,
                    temperature=0.1,
                ),
            )
            keys_tried_since_last_wait = 0  # reset khi thành công
            raw = response.text
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return parsed
            print(f"    ⚠ Gemini trả về không phải array (attempt {attempt})")
            wait = 10
        except json.JSONDecodeError as e:
            print(f"    ⚠ JSON decode error (attempt {attempt}): {e}")
            wait = 10
        except Exception as e:
            error_str = str(e)
            is_rate_limit = "429" in error_str or "RESOURCE_EXHAUSTED" in error_str or "retryDelay" in error_str
            if is_rate_limit:
                keys_tried_since_last_wait += 1
                if keys_tried_since_last_wait < len(_clients):
                    # Còn key chưa thử → rotate ngay, không wait
                    cur_idx = _next_key_idx()
                    print(f"    🔄 Rate limit → chuyển key {cur_idx + 1}/{len(_clients)} (attempt {attempt})...")
                    continue  # thử ngay với key mới, không sleep
                else:
                    # Đã thử hết vòng keys → wait rồi bắt đầu vòng mới
                    keys_tried_since_last_wait = 0
                    wait = _parse_retry_delay(error_str)
                    print(f"    ⚠ Tất cả {len(_clients)} key(s) đều throttle. Đợi {wait}s... (attempt {attempt})")
            else:
                print(f"    ⚠ Gemini API error (attempt {attempt}): {error_str[:300]}")
                wait = min(_parse_retry_delay(error_str), 15)

        if attempt < max_attempts:
            print(f"    ↻ Retry sau {wait}s...")
            time.sleep(wait)

    print("    ❌ Gemini thất bại sau tất cả retries. Trả về [].")
    return []


def call_gemini_text(prompt: str, system: str) -> str:
    """Gọi Gemini trả về text thuần (không JSON schema).

    Dùng cho normalize đáp án và chèn marker lời giải — cả 2 không cần JSON mode.
    temperature=0 (deterministic) vì output phải tuân thủ format nghiêm ngặt.
    Tái sử dụng key rotation + retry của call_gemini.
    """
    max_attempts = 4 + len(_clients)
    keys_tried_since_last_wait = 0
    cur_idx = _next_key_idx()

    for attempt in range(1, max_attempts + 1):
        try:
            response = _clients[cur_idx].models.generate_content(
                model=MODEL_ID,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system,
                    temperature=0,
                ),
            )
            keys_tried_since_last_wait = 0
            return response.text or ""
        except Exception as e:
            error_str = str(e)
            is_rate_limit = "429" in error_str or "RESOURCE_EXHAUSTED" in error_str or "retryDelay" in error_str
            if is_rate_limit:
                keys_tried_since_last_wait += 1
                if keys_tried_since_last_wait < len(_clients):
                    cur_idx = _next_key_idx()
                    print(f"    🔄 Rate limit → chuyển key {cur_idx + 1}/{len(_clients)} (attempt {attempt})...")
                    continue
                else:
                    keys_tried_since_last_wait = 0
                    wait = _parse_retry_delay(error_str)
                    print(f"    ⚠ Tất cả {len(_clients)} key(s) đều throttle. Đợi {wait}s... (attempt {attempt})")
            else:
                print(f"    ⚠ Gemini API error (attempt {attempt}): {error_str[:300]}")
                wait = min(_parse_retry_delay(error_str), 15)

        if attempt < max_attempts:
            print(f"    ↻ Retry sau {wait}s...")
            time.sleep(wait)

    print("    ❌ call_gemini_text thất bại sau tất cả retries. Trả về \"\".")
    return ""


def parse_questions_with_llm(question_block: str) -> list[dict]:
    """Chia question_block thành chunks, gọi Gemini cho từng chunk, gộp kết quả."""
    chunks = chunk_text(question_block)
    if not chunks:
        print("  ⚠ Không tìm thấy câu hỏi nào trong question_block.")
        return []

    all_questions: list[dict] = []
    print(f"  📦 Chia thành {len(chunks)} chunk(s) để gửi Gemini...")

    for idx, chunk in enumerate(chunks):
        print(f"    → Chunk {idx + 1}/{len(chunks)} ({len(chunk)} chars)...")
        questions = call_gemini(chunk)
        print(f"      ✓ Nhận được {len(questions)} câu hỏi")
        all_questions.extend(questions)
        if idx < len(chunks) - 1:
            # Nếu chunk vừa thất bại hoàn toàn (0 câu) → nhiều khả năng vẫn bị throttle
            # Chờ 65s để RPM window reset rồi mới gọi chunk tiếp theo
            if not questions:
                print(f"      ⏳ Chunk thất bại → chờ 65s để rate limit window reset...")
                time.sleep(65)
            else:
                # Chunk thành công: chờ 20s giữa các chunk (safe với 15 RPM)
                print(f"      ⏳ Chờ 20s trước chunk tiếp...")
                time.sleep(20)

    # Deduplicate theo (questionNumber, questionType) – tránh drop câu Đ/S
    # khi trùng số với MCQ (VD: Đ/S câu 1-4 không bị xoá bởi MCQ câu 1-4)
    seen: dict[tuple, dict] = {}
    for q in all_questions:
        num = q.get("questionNumber")
        qtype = q.get("questionType", "mcq")
        key = (num, qtype)
        if num is not None and key not in seen:
            seen[key] = q
    # Sắp xếp: MCQ trước, Đ/S sau; trong mỗi loại sắp theo số câu
    deduped = sorted(
        seen.values(),
        key=lambda x: (0 if x.get("questionType") == "mcq" else 1, x.get("questionNumber", 0))
    )

    print(f"  ✅ Tổng cộng {len(deduped)} câu hỏi (đã deduplicate)")
    return deduped


# ---------------------------------------------------------------------------
# BƯỚC 3: Parse bảng đáp án + Lời giải
# ---------------------------------------------------------------------------

def parse_answer_text(answer_table_block: str) -> dict:
    """
    Parse đáp án từ văn bản thô (Khối 2) dựa trên dòng.
    Không phụ thuộc doc.tables – hoạt động với mọi kiểu phân tách (|, tab, khoảng trắng).

    MCQ: Dòng "Câu" + số câu, dòng kế "Đáp án" + chữ cái → zip ghép cặp.
    T/F: Dòng "Câu X" + chuỗi Đ/S → áp nhãn a,b,c,d.
    """
    if not answer_table_block or not answer_table_block.strip():
        return {}

    answer_dict: dict = {}
    lines = answer_table_block.splitlines()
    tf_counter = 0
    sub_ids = ["a", "b", "c", "d"]
    tf_map = {"đ": True, "đúng": True, "s": False, "sai": False}

    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue

        line_lower = line.lower()

        # --- MCQ: dòng "Câu" + dòng "Đáp án" ---
        if "câu" in line_lower and i + 1 < len(lines):
            next_line = lines[i + 1].strip()
            next_lower = next_line.lower()
            if "đáp" in next_lower or "dap" in next_lower:
                nums = re.findall(r'\d+', line)
                anss = re.findall(r'\b[ABCD]\b', next_line, re.IGNORECASE)
                if nums and anss:
                    for n, a in zip(nums, anss):
                        answer_dict[n] = {"answer": a.upper()}
                    i += 2
                    continue

        # --- T/F: dòng "Câu X" + Đ/S ---
        tf_match = re.match(r'.*?[Cc]âu\s*(\d+)', line)
        if tf_match:
            q_num = tf_match.group(1)
            rest = line[tf_match.end():]
            tf_vals = re.findall(r'\b(Đúng|Sai|Đ|S|đúng|sai|đ|s)\b', rest, re.IGNORECASE)
            if len(tf_vals) == 4:
                tf_counter += 1
                for k, (sub, val) in enumerate(zip(sub_ids, tf_vals)):
                    is_true = tf_map.get(val.lower())
                    if is_true is not None:
                        key_pos = f"tf_{tf_counter}_{sub}"
                        key_local = f"tf_local_{q_num}_{sub}"
                        if key_pos not in answer_dict:
                            answer_dict[key_pos] = {"isTrue": is_true, "explanation": ""}
                        if key_local not in answer_dict:
                            answer_dict[key_local] = {"isTrue": is_true, "explanation": ""}
                i += 1
                continue

        i += 1

    return answer_dict


def parse_explanations(explanation_block: str, expected_questions: int = 28) -> dict:
    """
    Parse lời giải chi tiết từ Khối 3 (raw text).
    Trả về: {"1": {"explanation": "..."}, "2": {"explanation": "..."}, ...}

    Strategy: Regex trước, Gemini fallback nếu < 50% câu kỳ vọng.
    ⚠ DEFENSIVE: không bao giờ crash, trả về {} khi có lỗi.
    """
    if not explanation_block or not explanation_block.strip():
        return {}

    result = _parse_explanations_regex(explanation_block)

    # Gemini fallback: nếu regex trả về quá ít
    if len(result) < expected_questions * 0.5:
        print(f"  ℹ Regex chỉ lấy được {len(result)}/{expected_questions} lời giải → thử Gemini fallback...")
        gemini_result = _parse_explanations_gemini(explanation_block)
        if len(gemini_result) > len(result):
            result = gemini_result

    return result


def _parse_explanations_regex(explanation_block: str) -> dict:
    """
    Parse lời giải vạn năng. Hỗ trợ:
      - Dạng chuẩn: "Câu 1: Lời giải..."
      - Dạng bảng thô: "1 | C | Lời giải..." hoặc "1,C,Lời giải..."
    Nếu block bắt đầu bằng chữ cái A/B/C/D → tách ra làm MCQ answer.
    """
    result: dict = {}
    try:
        pattern = re.compile(
            r"(?:^|\n)\s*(?:Câu\s*)?(\d+)\s*(?:[\|:.,)\-])\s*(.*?)(?=\n\s*(?:Câu\s*)?\d+\s*(?:[\|:.,)\-])|\Z)",
            re.DOTALL | re.IGNORECASE,
        )
        for num_str, block in pattern.findall(explanation_block):
            block = block.strip()
            if not block:
                continue

            entry: dict = {}
            # Thử tách chữ cái đáp án MCQ ở đầu block
            ans_match = re.match(r'^([ABCD])\s*(?:[\|,.:;]\s*|\n)(.*)', block, re.DOTALL | re.IGNORECASE)
            if ans_match:
                entry["answer"] = ans_match.group(1).upper()
                entry["explanation"] = ans_match.group(2).strip()
            else:
                entry["explanation"] = block

            # Nếu key đã tồn tại (MCQ "Câu 1" vs T/F "Câu 1") → thêm suffix _tf
            key = num_str if num_str not in result else f"{num_str}_tf"
            if key not in result:
                result[key] = entry
    except Exception as e:
        print(f"  ⚠ Regex lời giải error: {e}")
    return result


_EXPL_SYSTEM_PROMPT = """Bạn là parser lời giải đề thi. Trích xuất lời giải cho TỬNG CÂU HỎI từ đoạn text.
Trả về JSON array, mỗi phần tử: {"questionNumber": int, "explanation": "string"}.
Giữ nguyên nội dung explanation, KHÔNG tóm tắt hay sửa đổi."""

_EXPL_SCHEMA = {
    "type": "ARRAY",
    "items": {
        "type": "OBJECT",
        "properties": {
            "questionNumber": {"type": "INTEGER"},
            "explanation": {"type": "STRING"},
        },
        "required": ["questionNumber", "explanation"],
    },
}


def _parse_explanations_gemini(explanation_block: str) -> dict:
    """Fallback: gọi Gemini parse lời giải khi regex không đủ."""
    result: dict = {}
    try:
        response = _clients[_key_idx].models.generate_content(
            model=MODEL_ID,
            contents=explanation_block[:30000],
            config=types.GenerateContentConfig(
                system_instruction=_EXPL_SYSTEM_PROMPT,
                response_mime_type="application/json",
                response_schema=_EXPL_SCHEMA,
                temperature=0.1,
            ),
        )
        parsed = json.loads(response.text)
        if isinstance(parsed, list):
            for item in parsed:
                num = str(item.get("questionNumber", ""))
                expl = item.get("explanation", "")
                if num and expl and num not in result:
                    result[num] = {"explanation": expl}
            print(f"  ✓ Gemini fallback: {len(result)} lời giải")
    except Exception as e:
        print(f"  ⚠ Gemini fallback error: {e}")
    return result


# ---------------------------------------------------------------------------
# V3.1 — Bước 3 mới: Normalize đáp án qua LLM + parse regex
# ---------------------------------------------------------------------------

ANSWER_NORMALIZE_PROMPT = """Bạn nhận INPUT là đoạn text/bảng chứa đáp án đề thi Lịch sử THPT Việt Nam \
(format 2025: 24 câu MCQ + 4 câu Đúng/Sai, mỗi câu Đ/S có 4 ý a,b,c,d).

Nhiệm vụ: Chuyển về OUTPUT đúng format sau, KHÔNG thêm bất kỳ text nào khác \
(không markdown, không giải thích, không code fence):

[[DANH_SACH_DAP_AN]]

# PHAN_I_MCQ
1=<A|B|C|D>
...
24=<A|B|C|D>

# PHAN_II_TRUE_FALSE
25a=<D|S>
...
28d=<D|S>

QUY TẮC:
- Phần I dùng A/B/C/D (in hoa). Phần II dùng D (Đúng) / S (Sai).
- Mọi biến thể trong input: "Đúng"/"Đ"/"True"/"T"/"đ" → D; "Sai"/"S"/"False"/"F"/"s" → S.
- Số câu Phần II BẮT ĐẦU TỪ 25. Nếu input đánh số 1-4 cho Đ/S, tự cộng 24.
- Mỗi entry trên 1 dòng. Không khoảng trắng quanh =.
- Thiếu câu nào → xuất dòng đó với giá trị ?. VD: 17=?"""


def normalize_answers_with_llm(answer_block: str) -> str:
    """Gọi Gemini normalize bảng đáp án về format chuẩn N=X."""
    if not answer_block.strip():
        return ""
    print("  📤 Normalize đáp án qua LLM...")
    result = call_gemini_text(answer_block, ANSWER_NORMALIZE_PROMPT)
    return result


def parse_normalized_answers(normalized_text: str) -> dict:
    """
    Parse text đã normalize thành answer_dict tương thích Bước 4.

    Format input:
        # PHAN_I_MCQ
        1=A
        ...
        24=C
        # PHAN_II_TRUE_FALSE
        25a=D
        ...
        28d=S

    Output: {"1": {"answer": "A"}, "tf_1_a": {"isTrue": True}, ...}
    D→True, S→False, ?→None.
    Câu 25→tf_1, 26→tf_2, 27→tf_3, 28→tf_4.
    """
    result: dict = {}
    mcq_re = re.compile(r"^\s*(\d+)\s*=\s*([ABCD?])\s*$", re.MULTILINE)
    tf_re  = re.compile(r"^\s*(\d+)([a-d])\s*=\s*([DS?])\s*$", re.MULTILINE)

    for m in mcq_re.finditer(normalized_text):
        num, ans = m.group(1), m.group(2)
        result[num] = {"answer": ans if ans != "?" else None}

    for m in tf_re.finditer(normalized_text):
        num_int = int(m.group(1))
        sub     = m.group(2)
        val     = m.group(3)
        section_pos = num_int - 24 if num_int >= 25 else num_int
        key = f"tf_{section_pos}_{sub}"
        is_true = True if val == "D" else (False if val == "S" else None)
        result[key] = {"isTrue": is_true}

    n_mcq = sum(1 for k in result if not k.startswith("tf_"))
    n_tf  = sum(1 for k in result if k.startswith("tf_"))
    if n_mcq != 24:
        print(f"  ⚠ parse_normalized_answers: kỳ vọng 24 MCQ, parse được {n_mcq}")
    if n_tf != 16:
        print(f"  ⚠ parse_normalized_answers: kỳ vọng 16 T/F entries, parse được {n_tf}")

    return result


# ---------------------------------------------------------------------------
# V3.1 — Normalize lời giải qua LLM (marker-only, anti-hallucination)
# ---------------------------------------------------------------------------

EXPLANATION_MARK_PROMPT = """Bạn nhận INPUT là phần lời giải chi tiết của đề thi Lịch sử THPT Việt Nam.

NHIỆM VỤ DUY NHẤT: Chèn marker phân tách vào đúng vị trí TRONG text gốc.
TUYỆT ĐỐI KHÔNG sửa, thêm, bớt, paraphrase bất kỳ nội dung nào của lời giải.

FORMAT MARKER (dùng dấu ngoặc vuông kép [[...]] để tránh nhầm markdown):
- Câu MCQ (số 1-24):
    Đặt [[Q<số>|MCQ|<đáp_án>]] ngay TRƯỚC nội dung lời giải câu đó.
    Đặt [[END]] ngay SAU nội dung lời giải đó.

- Câu Đ/S (số 25-28, mỗi câu 4 ý a/b/c/d):
    MỖI Ý là 1 entry riêng:
    Đặt [[Q<số>|TF|<ý>|<đáp_án>]] ngay TRƯỚC nội dung lời giải ý đó.
    Đặt [[END]] ngay SAU nội dung lời giải ý đó.
    Nếu lời giải gốc gộp chung cho cả 4 ý (không tách được) →
    dùng [[Q<số>|TF|all|MIXED]]...[[END]] (1 entry chung).

VÍ DỤ OUTPUT (PHẢI y hệt format này):
[[Q1|MCQ|A]]Câu 1. Chọn A. Vì đây là đáp án đúng.[[END]]
[[Q25|TF|a|D]]a) Đúng. Lý do là...[[END]]
[[Q25|TF|b|S]]b) Sai. Vì...[[END]]

QUY TẮC TUYỆT ĐỐI - VI PHẠM = LỖI NẶNG:
1. KHÔNG sửa 1 ký tự nào của nội dung lời giải (kể cả chính tả, dấu câu).
2. KHÔNG paraphrase, KHÔNG tóm tắt, KHÔNG thay từ đồng nghĩa.
3. KHÔNG bịa lời giải cho câu không có trong input.
4. KHÔNG "cải thiện" câu văn, KHÔNG sửa lỗi gõ, KHÔNG sửa tên riêng/năm tháng.
5. CHỈ được thêm marker [[...]] và [[END]] vào text gốc. KHÔNG dùng >, >>>, hay bất kỳ ký tự nào khác.
6. Câu Đ/S đánh số 25-28 (nếu input đánh 1-4 thì cộng 24 thành 25-28).
7. Đáp án Đ/S: D = Đúng, S = Sai (mọi biến thể "Đ"/"Đúng" → D, "S"/"Sai" → S).
8. Nếu không xác định được boundary của 1 câu → BỎ QUA câu đó, không đoán.
9. Output PHẢI chứa NGUYÊN VĂN input text, chỉ khác ở chỗ có thêm marker.
10. KHÔNG thêm markdown, code fence, comment, hay bất kỳ text nào khác.
11. PHẢI đóng MỖI entry bằng [[END]]. Không được bỏ sót. Đây là quy tắc \
QUAN TRỌNG NHẤT để Python parse đúng."""


def normalize_explanations_with_llm(explanation_block: str) -> str:
    """Gọi Gemini chèn marker vào lời giải. KHÔNG sinh lại text."""
    if not explanation_block.strip():
        return ""
    print("  📤 Chèn marker lời giải qua LLM...")
    return call_gemini_text(explanation_block, EXPLANATION_MARK_PROMPT)


def parse_normalized_explanations(marked_text: str, original_block: str) -> dict:
    """
    Parse marker từ LLM output và verify anti-hallucination.

    ⚠ CRITICAL: original_block = explanation_block TRƯỚC KHI gửi LLM.
    TUYỆT ĐỐI không dùng marked_text.replace(...) làm original — sẽ self-verify.

    Args:
        marked_text:     output LLM (có marker <<<Q...|...|...>>>...<<<END>>>)
        original_block:  text gốc explanation_block (ground truth để verify)

    Returns:
        dict tương thích Bước 4:
            {"1": {"answer": "A", "explanation": "..."},
             "tf_1_a": {"isTrue": True, "explanation": "..."}, ...}
    """
    from difflib import SequenceMatcher

    if not marked_text or not marked_text.strip():
        return {}

    result: dict = {}
    rejected = 0
    missing_end_count = 0

    # Pre-process: strip markdown code fence + cắt sau [[END]] cuối cùng
    # Cũng fallback cho format cũ <<<END>>> nếu LLM dùng format cũ
    marked_text = re.sub(r"```[a-z]*\n?", "", marked_text)
    # Ưu tiên new format [[END]]
    last_end = marked_text.rfind("[[END]]")
    if last_end != -1:
        marked_text = marked_text[:last_end + len("[[END]]")]
    else:
        # Fallback: format cũ <<<END>>>
        last_end = marked_text.rfind("<<<END>>>")
        if last_end != -1:
            marked_text = marked_text[:last_end + len("<<<END>>>")]

    # Regex hỗ trợ SONG SONG cả 2 format: [[Q...|...|...]] và <<<Q...|...|>>>
    pattern = re.compile(
        r"(?:\[\[Q(\d+)\|(MCQ|TF)(?:\|([a-d]|all))?\|([ABCDS]|MIXED)\]\]|"
        r"<<<Q(\d+)\|(MCQ|TF)(?:\|([a-d]|all))?\|([ABCDS]|MIXED)>>>)"
        r"(.*?)"
        r"(?=\[\[END\]\]|<<<END>>>|\[\[Q\d+\||<<<Q\d+\||\Z)",
        re.DOTALL,
    )

    original_normalized = re.sub(r"\s+", " ", original_block).strip()

    for match in pattern.finditer(marked_text):
        # Groups 1-4: new format [[...]]; groups 5-8: old format <<<...>>>
        g = match.groups()
        if g[0] is not None:
            q_num, q_type, sub_id, ans = g[0], g[1], g[2], g[3]
        else:
            q_num, q_type, sub_id, ans = g[4], g[5], g[6], g[7]
        content = g[8]

        end_pos = match.end()
        has_end = (
            (end_pos + len("[[END]]") <= len(marked_text) and marked_text[end_pos: end_pos + len("[[END]]")] == "[[END]]")
            or (end_pos + len("<<<END>>>") <= len(marked_text) and marked_text[end_pos: end_pos + len("<<<END>>>")] == "<<<END>>>")
        )
        if not has_end:
            missing_end_count += 1
            print(f"  ⚠ Q{q_num}{sub_id or ''}: LLM quên [[END]], dùng marker kế tiếp làm boundary")

        content = content.strip()
        if not content:
            continue

        # === FIX 1A: Strip leaked marker artifacts TRƯỚC anti-halluc ===
        # LLM hay thêm '>' (blockquote markdown) hoặc ']' leak từ marker vào content
        # Case A: content bắt đầu thẳng bằng '>' hoặc ']'
        content = re.sub(r'^[\s>\]]+', '', content)
        # Case B (T/F): "a) >" hoặc "a) > text" trước newline rồi mới có real content
        # VD: "a) >\na) Đúng. Lý do..." → "a) Đúng. Lý do..."
        if sub_id and sub_id in "abcd":
            content = re.sub(rf'^{sub_id}[)\s.]*>[^\n]*\n\s*', '', content)
            # Strip duplicate sub-label đầu dòng cho T/F: "a)" + newline + "a)" lại
            content = re.sub(
                rf'^{sub_id}[).\s]*\n\s*(?={sub_id}[).\s])',
                '',
                content,
            )
        content = content.strip()
        if not content:
            continue

        # === ANTI-HALLUCINATION: 2 tầng ===
        content_normalized = re.sub(r"\s+", " ", content).strip()

        # Tầng 1: substring check (chặt nhất)
        is_valid = content_normalized in original_normalized

        # Tầng 2: find_longest_match nếu fail tầng 1
        if not is_valid:
            matcher = SequenceMatcher(None, content_normalized, original_normalized, autojunk=False)
            match_obj = matcher.find_longest_match(
                0, len(content_normalized), 0, len(original_normalized)
            )
            coverage = match_obj.size / len(content_normalized) if content_normalized else 0
            if coverage >= 0.95:
                print(f"  ⚠ Q{q_num}{sub_id or ''}: fuzzy match (coverage={coverage:.1%}), có thể LLM sửa nhẹ")
                is_valid = True
            else:
                rejected += 1
                print(f"  ❌ Q{q_num}{sub_id or ''}: REJECT (coverage={coverage:.1%}) — LLM có thể đã ảo giác")
                print(f"     Content[:100]: {content_normalized[:100]}")
                continue

        # Build key
        if q_type == "MCQ":
            key = q_num
            result[key] = {
                "answer": ans if ans in "ABCD" else None,
                "explanation": content,
            }
        else:  # TF
            q_num_int = int(q_num)
            section_pos = q_num_int - 24 if q_num_int >= 25 else q_num_int
            if sub_id == "all":
                key = f"{q_num}_tf"
                result[key] = {"explanation": content}
            else:
                key = f"tf_{section_pos}_{sub_id}"
                is_true = (True if ans == "D" else False) if ans in ("D", "S") else None
                result[key] = {"isTrue": is_true, "explanation": content}

    if rejected > 0:
        print(f"  ⚠ Tổng {rejected} entry bị REJECT do nghi ngờ ảo giác LLM")
    if missing_end_count > 0:
        print(f"  ⚠ Tổng {missing_end_count} entry thiếu <<<END>>> (đã xử lý fallback)")

    # Fallback regex nếu parse được < 50% câu mong đợi
    expected_count = len(re.findall(r"Câu\s*\d+", original_block))
    if expected_count > 0 and len(result) < expected_count * 0.5:
        print(f"  ⚠ Fallback regex: parse được {len(result)}/{expected_count} câu, kích hoạt fallback thuần...")
        result = _fallback_explanation_regex(original_block, result)

    return result


def _fallback_explanation_regex(original_block: str, existing: dict) -> dict:
    """Fallback regex đơn giản khi LLM fail normalize lời giải."""
    result = {**existing}
    try:
        pattern = re.compile(
            r"(?:Câu|CÂU|câu)\s*(\d+)\s*(?:\([^)]{1,20}\))?\s*[:.)\-]?\s*(.*?)"
            r"(?=(?:Câu|CÂU|câu)\s*\d+|\Z)",
            re.DOTALL | re.IGNORECASE,
        )
        for num_str, block in pattern.findall(original_block):
            block = block.strip()
            if not block or num_str in result:
                continue
            # Chỉ lấy explanation (không phát hiện answer từ fallback để tránh sai)
            result[num_str] = {"explanation": block}
    except Exception as e:
        print(f"  ⚠ Fallback regex lỗi: {e}")
    return result


# ---------------------------------------------------------------------------
# V3.1 — build_answer_dict mới: nhận normalized text, KHÔNG gọi LLM
# ---------------------------------------------------------------------------

def build_answer_dict(
    normalized_answers_text: str,
    marked_expls_text: str,
    original_explanation_block: str = "",
    exam_id: str = "unknown",
) -> dict:
    """
    Merge đáp án (Khối 2) + lời giải (Khối 3) thành answer_dict hoàn chỉnh.

    ⚠ KHÔNG gọi LLM — nhận text đã normalized từ parse_single_file().
    Bảng đáp án (Khối 2) là Source of Truth cho answer/isTrue.
    Lời giải (Khối 3) chỉ bổ sung explanation, KHÔNG ghi đè answer đã có.

    Args:
        normalized_answers_text:     output từ normalize_answers_with_llm
        marked_expls_text:           output từ normalize_explanations_with_llm
        original_explanation_block:  explanation_block GỐC (trước LLM, cho anti-halluc)
        exam_id:                     tên file để save debug
    """
    # Step 1: Parse đáp án từ text đã normalize
    answers_dict = parse_normalized_answers(normalized_answers_text)
    _save_debug_text(exam_id, "answers_normalized", normalized_answers_text)

    # Step 2: Parse lời giải từ marked text
    expls_dict: dict = {}
    if marked_expls_text:
        _save_debug_text(exam_id, "explanations_marked", marked_expls_text)
        _save_debug_text(exam_id, "explanations_original", original_explanation_block)
        expls_dict = parse_normalized_explanations(marked_expls_text, original_explanation_block)

    # Step 3: Bắt đầu từ answers_dict (nguồn chân lý số 1)
    result: dict = {**answers_dict}
    for key in result:
        if "explanation" not in result[key]:
            result[key]["explanation"] = ""

    # Step 4: Bổ sung từ expls_dict — CHỈ thêm explanation, KHÔNG ghi đè answer/isTrue
    for key, expl_entry in expls_dict.items():
        if key in result:
            if not result[key].get("explanation"):
                result[key]["explanation"] = expl_entry.get("explanation", "")
            # Đáp án từ lời giải CHỈ dùng khi bảng đáp án thiếu
            if "answer" in expl_entry and not result[key].get("answer"):
                result[key]["answer"] = expl_entry["answer"]
            if "isTrue" in expl_entry and result[key].get("isTrue") is None:
                result[key]["isTrue"] = expl_entry["isTrue"]
        else:
            result[key] = {**expl_entry}
            if "explanation" not in result[key]:
                result[key]["explanation"] = ""

    return result


# ---------------------------------------------------------------------------
# BƯỚC 4: Merge đáp án + Validate + Xuất JSON
# ---------------------------------------------------------------------------

def merge_and_validate(
    llm_questions: list[dict],
    answer_dict: dict,
    metadata: dict,
) -> dict:
    """
    Merge đáp án từ answer_dict vào câu hỏi từ LLM.
    Validate và xuất FullExam JSON.
    """
    mcq_questions: list[dict] = []
    tf_questions: list[dict] = []
    warnings: list[str] = []

    for q in llm_questions:
        q_num = q.get("questionNumber")
        q_type = q.get("questionType", "mcq")
        q_num_str = str(q_num) if q_num is not None else "?"

        exam_id_prefix = metadata.get("examId", "exam")

        if q_type == "mcq":
            # Lấy đáp án MCQ
            ans_entry = answer_dict.get(q_num_str, {})
            correct_id = ans_entry.get("answer")
            explanation = ans_entry.get("explanation", "")

            if not correct_id:
                warnings.append(f"Câu {q_num_str} (MCQ): THIẾU đáp án trong bảng đáp án!")

            question_obj = {
                "id": f"{exam_id_prefix}-q{q_num_str.zfill(2)}",
                "orderInExam": q_num or 0,
                "questionType": "mcq",
                "questionText": q.get("questionText", ""),
                "options": q.get("options", []),
                "correctOptionId": correct_id,
                "explanation": explanation,
                "difficulty": "medium",  # Mặc định, có thể tag lại sau
                "topic": q.get("topic", ""),
                "cognitiveLevel": q.get("cognitiveLevel", "knowledge"),
                "hasImage": q.get("hasImage", False),
                "sourceRefs": [
                    {
                        "title": metadata.get("sourceDetail", ""),
                        "location": f"Câu {q_num_str}",
                    }
                ],
            }
            mcq_questions.append(question_obj)

        elif q_type == "true_false":
            # Normalize số câu: LLM đôi khi dùng số local 1-4, đôi khi global 25-28.
            # Luôn convert về global để ID nhất quán và section_pos chính xác.
            q_num_int = int(q_num_str) if q_num_str.isdigit() else 0
            if q_num_int <= 24:
                # Section-local (1-4) → global (25-28)
                q_global = q_num_int + 24
                section_pos = q_num_int  # 1, 2, 3, 4
            else:
                # Đã global (25-28)
                q_global = q_num_int
                section_pos = q_num_int - 24  # 1, 2, 3, 4

            if section_pos < 1 or section_pos > 4:
                warnings.append(f"Câu Đ/S: section_pos={section_pos} không hợp lệ (q_num={q_num_str})")
                section_pos = max(1, min(4, section_pos))

            statements = q.get("statements", [])
            explanation_parts: list[str] = []
            for stmt in statements:
                stmt_id = stmt.get("id", "")  # "a", "b", "c", "d"
                # Tra cứu key tf_{section_pos}_{stmt_id} — mapping nhất quán
                ans_entry = (
                    answer_dict.get(f"tf_{section_pos}_{stmt_id}", {})
                    or answer_dict.get(f"{q_global}{stmt_id}", {})
                )
                is_true = ans_entry.get("isTrue")
                stmt_expl = ans_entry.get("explanation", "")

                if is_true is None:
                    warnings.append(f"Câu Đ/S #{section_pos}.{stmt_id}: THIẾU đáp án!")

                stmt["isTrue"] = is_true if is_true is not None else False
                if stmt_expl:
                    # Strip leading label "a)" / "a." / "a " nếu content đã có sẵn
                    # (LLM giữ nguyên label từ Word gốc), sau đó re-add 1 lần duy nhất
                    stmt_expl_clean = re.sub(
                        rf'^\s*{stmt_id}\)?\.?\s*',
                        '',
                        stmt_expl,
                        count=1,
                        flags=re.IGNORECASE,
                    ).strip()
                    explanation_parts.append(f"{stmt_id}) {stmt_expl_clean}")

            combined_expl = "\n".join(explanation_parts)

            # Fallback: lời giải tổng hợp từ key "{q_global}_tf"
            if not combined_expl:
                tf_expl_entry = answer_dict.get(f"{q_global}_tf", {})
                combined_expl = tf_expl_entry.get("explanation", "")

            question_obj = {
                "id": f"{exam_id_prefix}-q{str(q_global).zfill(2)}",
                "orderInExam": q_global,
                "questionType": "true_false",
                "questionText": q.get("questionText", ""),
                "statements": statements,
                "explanation": combined_expl,
                "difficulty": "hard",  # Câu Đ/S thường khó hơn
                "topic": q.get("topic", ""),
                "cognitiveLevel": q.get("cognitiveLevel", "application"),
                "hasImage": q.get("hasImage", False),
                "sourceRefs": [
                    {
                        "title": metadata.get("sourceDetail", ""),
                        "location": f"Câu {q_num_str}",
                    }
                ],
            }
            tf_questions.append(question_obj)

    # Validation warnings
    n_mcq = len(mcq_questions)
    n_tf = len(tf_questions)

    if n_mcq != 24:
        warnings.append(f"Số câu MCQ = {n_mcq} (kỳ vọng 24)")
    if n_tf != 4:
        warnings.append(f"Số câu Đ/S = {n_tf} (kỳ vọng 4)")

    for q in mcq_questions:
        if len(q.get("options", [])) != 4:
            warnings.append(f"Câu {q['orderInExam']} (MCQ): chỉ có {len(q.get('options', []))} options (kỳ vọng 4)")
        if not q.get("correctOptionId"):
            warnings.append(f"Câu {q['orderInExam']} (MCQ): thiếu correctOptionId")
        if not q.get("explanation"):
            warnings.append(f"Câu {q['orderInExam']} (MCQ): thiếu lời giải (không crash)")

    for q in tf_questions:
        if len(q.get("statements", [])) != 4:
            warnings.append(f"Câu {q['orderInExam']} (Đ/S): chỉ có {len(q.get('statements', []))} statements (kỳ vọng 4)")
        if not q.get("explanation"):
            warnings.append(f"Câu {q['orderInExam']} (Đ/S): thiếu lời giải (không crash)")

    # Print warnings
    if warnings:
        print(f"\n  ⚠ {len(warnings)} cảnh báo validation:")
        for w in warnings:
            print(f"    - {w}")

    # Build FullExam JSON
    exam_format = "thpt_2025" if n_tf > 0 else "thpt_legacy"

    sections = []
    if mcq_questions:
        sections.append({
            "sectionId": "phan-1",
            "sectionType": "mcq",
            "title": "Phần I – Trắc nghiệm nhiều lựa chọn",
            "totalQuestions": n_mcq,
            "maxScore": round(n_mcq * 0.25, 2),
            "scorePerQuestion": 0.25,
            "questions": mcq_questions,
        })
    if tf_questions:
        sections.append({
            "sectionId": "phan-2",
            "sectionType": "true_false",
            "title": "Phần II – Trắc nghiệm Đúng/Sai",
            "totalQuestions": n_tf,
            "maxScore": round(n_tf * 1.0, 2),
            "scoringRule": "ladder",
            "questions": tf_questions,
        })

    total_score = sum(s.get("maxScore", 0) for s in sections)

    full_exam = {
        "examId": metadata.get("examId", ""),
        "title": metadata.get("title", ""),
        "year": metadata.get("year", 0),
        "source": metadata.get("source", ""),
        "sourceDetail": metadata.get("sourceDetail", ""),
        "examCode": metadata.get("examCode", ""),
        "format": exam_format,
        "timeLimitMinutes": metadata.get("timeLimitMinutes", 50),
        "totalScore": total_score,
        "parsedAt": datetime.now(timezone.utc).isoformat(),
        "sections": sections,
        "warnings": warnings if warnings else None,
    }

    return full_exam


# ---------------------------------------------------------------------------
# Bước 10: Verification Layer (L1 + L2 + L3)
# ---------------------------------------------------------------------------

def verify_structural_integrity(full_exam: dict) -> dict:
    """L1: Check JSON output đúng schema, không trùng ID, đủ field bắt buộc."""
    checks = []
    all_qs = [q for s in full_exam.get("sections", []) for q in s.get("questions", [])]
    mcq_qs = [q for q in all_qs if q.get("questionType") == "mcq"]
    tf_qs  = [q for q in all_qs if q.get("questionType") == "true_false"]

    # CHECK 1: Số câu MCQ = 24
    checks.append({
        "name": "MCQ count = 24",
        "passed": len(mcq_qs) == 24,
        "actual": len(mcq_qs),
    })

    # CHECK 2: Số câu T/F = 4
    checks.append({
        "name": "T/F count = 4",
        "passed": len(tf_qs) == 4,
        "actual": len(tf_qs),
    })

    # CHECK 3: Không có ID trùng (⭐ catch bug q04 trùng MCQ ↔ T/F)
    all_ids = [q["id"] for q in all_qs]
    duplicates = [id_ for id_ in set(all_ids) if all_ids.count(id_) > 1]
    checks.append({
        "name": "No duplicate question IDs",
        "passed": len(duplicates) == 0,
        "duplicates": duplicates,
    })

    # CHECK 4: orderInExam của T/F phải ≥ 25 (⭐ catch bug Câu 4 T/F giữ số 4)
    tf_wrong_order = [q["id"] for q in tf_qs if q.get("orderInExam", 0) < 25]
    checks.append({
        "name": "T/F orderInExam >= 25",
        "passed": len(tf_wrong_order) == 0,
        "violations": tf_wrong_order,
    })

    # CHECK 5: orderInExam T/F phải đúng là {25, 26, 27, 28}
    tf_orders = sorted(q.get("orderInExam", 0) for q in tf_qs)
    checks.append({
        "name": "T/F orderInExam = {25,26,27,28}",
        "passed": tf_orders == [25, 26, 27, 28],
        "actual": tf_orders,
        "expected": [25, 26, 27, 28],
    })

    # CHECK 6: orderInExam MCQ phải là {1..24}
    mcq_orders = sorted(q.get("orderInExam", 0) for q in mcq_qs)
    checks.append({
        "name": "MCQ orderInExam = {1..24}",
        "passed": mcq_orders == list(range(1, 25)),
        "actual_first_last": (mcq_orders[:3], mcq_orders[-3:]) if mcq_orders else None,
        "expected": "1..24",
    })

    # CHECK 7: Mọi MCQ có correctOptionId ∈ {A,B,C,D}
    mcq_no_answer = [
        q.get("orderInExam") for q in mcq_qs
        if not q.get("correctOptionId") or q["correctOptionId"] not in "ABCD"
    ]
    checks.append({
        "name": "All MCQ have valid correctOptionId",
        "passed": len(mcq_no_answer) == 0,
        "missing_in_questions": mcq_no_answer,
    })

    # CHECK 8: Mọi T/F có 4 statements với isTrue bool
    tf_incomplete = []
    for q in tf_qs:
        stmts = q.get("statements", [])
        if len(stmts) != 4:
            tf_incomplete.append({"q": q.get("orderInExam"), "issue": f"có {len(stmts)} statements"})
        else:
            missing = [s["id"] for s in stmts if s.get("isTrue") is None]
            if missing:
                tf_incomplete.append({"q": q.get("orderInExam"), "missing_isTrue_at": missing})
    checks.append({
        "name": "All T/F have 4 statements with isTrue bool",
        "passed": len(tf_incomplete) == 0,
        "issues": tf_incomplete,
    })

    passed = sum(1 for c in checks if c["passed"])
    return {
        "layer": "L1_structural",
        "passed": passed,
        "total": len(checks),
        "all_passed": passed == len(checks),
        "checks": checks,
    }


def verify_cross_source_mapping(full_exam: dict, original_explanation_block: str) -> dict:
    """L2: Cross-check đáp án giữa JSON (Khối 2) và lời giải gốc (Khối 3).

    ⭐ Đây là check QUAN TRỌNG NHẤT — sẽ catch shifting error.
    Nếu ≥8 T/F entries mismatch → shifting_pattern_detected=True.
    """
    conflicts = []
    all_qs = [q for s in full_exam.get("sections", []) for q in s.get("questions", [])]

    # === Parse đáp án MCQ từ lời giải gốc ===
    # Dùng IGNORECASE vì giáo viên có thể gõ "Chọn a" hoặc "Chọn A"
    mcq_pattern = re.compile(r"Câu\s*(\d+)\.?\s*Chọn\s*([ABCD])\b\.?", re.IGNORECASE)
    expl_mcq_answers = {
        int(m.group(1)): m.group(2).upper()
        for m in mcq_pattern.finditer(original_explanation_block)
    }

    # === Parse đáp án T/F từ lời giải gốc ===
    # Tìm từng khối "Câu N" rồi parse "a) Đúng/Sai"
    tf_section_pattern = re.compile(
        r"Câu\s*(\d+)\b(.*?)(?=Câu\s*\d+\b|\Z)",
        re.DOTALL | re.IGNORECASE,
    )
    expl_tf_answers: dict = {}  # {(q_num_int, sub_id): bool}
    sub_pattern = re.compile(r"\b([a-d])\)?\s*(Đúng|Đ|Sai|S)\b", re.IGNORECASE)
    for m in tf_section_pattern.finditer(original_explanation_block):
        q_num_int = int(m.group(1))
        section_text = m.group(2)
        for sm in sub_pattern.finditer(section_text):
            sub_id = sm.group(1).lower()
            val = sm.group(2).lower()
            is_true = val.startswith("đ")
            expl_tf_answers[(q_num_int, sub_id)] = is_true

    # === Cross-check MCQ ===
    for q in all_qs:
        if q.get("questionType") != "mcq":
            continue
        order = q.get("orderInExam")
        json_ans = q.get("correctOptionId")
        expl_ans = expl_mcq_answers.get(order)
        if expl_ans and json_ans and expl_ans != json_ans:
            conflicts.append({
                "question_id": q["id"],
                "orderInExam": order,
                "type": "mcq",
                "answer_in_json": json_ans,
                "answer_in_explanation": expl_ans,
                "severity": "HIGH",
                "hint": "Có thể shifting error hoặc giáo viên gõ sai 1 trong 2 nguồn",
            })

    # === Cross-check T/F ===
    for q in all_qs:
        if q.get("questionType") != "true_false":
            continue
        order = q.get("orderInExam", 0)  # 25-28
        # Trong lời giải giáo viên thường dùng số local 1-4 hoặc global 25-28
        possible_keys = [order, order - 24]

        for stmt in q.get("statements", []):
            sub = stmt.get("id", "")
            json_is_true = stmt.get("isTrue")

            expl_is_true = None
            matched_key = None
            for key in possible_keys:
                if (key, sub) in expl_tf_answers:
                    expl_is_true = expl_tf_answers[(key, sub)]
                    matched_key = key
                    break

            if expl_is_true is not None and json_is_true != expl_is_true:
                conflicts.append({
                    "question_id": q["id"],
                    "orderInExam": order,
                    "statement": sub,
                    "type": "true_false",
                    "isTrue_in_json": json_is_true,
                    "isTrue_in_explanation": expl_is_true,
                    "matched_in_expl_at_question": matched_key,
                    "severity": "HIGH",
                    "hint": "⚠ Có thể shifting error giữa các câu T/F!",
                })

    # Nếu ≥8 T/F entries mismatch → gần như chắc chắn là shifting error
    tf_conflicts = [c for c in conflicts if c["type"] == "true_false"]
    shifting_detected = len(tf_conflicts) >= 8

    return {
        "layer": "L2_cross_source",
        "n_conflicts": len(conflicts),
        "n_mcq_conflicts": sum(1 for c in conflicts if c["type"] == "mcq"),
        "n_tf_conflicts": len(tf_conflicts),
        "shifting_pattern_detected": shifting_detected,
        "shifting_warning": (
            "⚠⚠⚠ NGHIÊM TRỌNG: Phát hiện pattern shifting error ở T/F! "
            "Kiểm tra lại logic mapping section_pos trong merge_and_validate."
            if shifting_detected else None
        ),
        "conflicts": conflicts[:20],
        "all_passed": len(conflicts) == 0,
    }


def _strip_citation_metadata(text: str) -> str:
    """Loại bỏ phần trích dẫn nguồn trong ngoặc để không bias L3.

    VD: "(Trần Nam Tiến, Lịch sử..., NXB Giáo dục, 2008, tr.23)" → ""
    """
    text = re.sub(r'\([^)]{30,}\)', '', text)
    text = re.sub(r'NXB[^,.]{1,40}', '', text)
    text = re.sub(r'\btr\.\s*\d+', '', text)
    text = re.sub(r'\bTập\s+\d+', '', text)
    return text


def verify_content_integrity(full_exam: dict) -> dict:
    """L3: Check explanation thực sự nói về câu hỏi đó qua keyword overlap.

    Keyword: năm 4 chữ số + từ viết hoa (tên riêng, tổ chức, sự kiện).
    Chỉ flag khi vừa year_fail vừa proper_fail (cả 2 signal) để giảm noise.
    Chỉ là tín hiệu LOW severity — cần review thủ công nếu nhiều case.
    """
    suspicious = []
    all_qs = [q for s in full_exam.get("sections", []) for q in s.get("questions", [])]

    # Pattern tên riêng viết hoa ≥3 ký tự (bao gồm cả viết tắt như ASEAN, SALT)
    proper_re = re.compile(r"\b([A-ZĐÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝẮẶẸẺẼỀẾỆ][a-zđàáâãèéêìíòóôõùúýắặẹẻẽềếệ]{2,}|[A-ZĐẮẶẸẺẼỀẾỆ]{2,})\b")

    for q in all_qs:
        q_text = q.get("questionText", "")
        expl   = q.get("explanation", "")
        if not expl or len(expl) < 30:
            continue

        # Strip metadata trích dẫn TRƯỚC KHI đếm năm (tránh false positive năm xuất bản)
        q_text_clean = _strip_citation_metadata(q_text)
        expl_clean   = _strip_citation_metadata(expl)

        # Năm (1800-2099)
        years_in_q    = set(re.findall(r"\b(1[89]\d{2}|20\d{2})\b", q_text_clean))
        years_in_expl = set(re.findall(r"\b(1[89]\d{2}|20\d{2})\b", expl_clean))

        # Tên riêng viết hoa
        proper_q    = {m.group(0) for m in proper_re.finditer(q_text_clean)}
        proper_expl = {m.group(0) for m in proper_re.finditer(expl_clean)}

        year_overlap   = years_in_q & years_in_expl
        proper_overlap = proper_q & proper_expl

        year_fail   = bool(years_in_q) and not year_overlap
        proper_fail = len(proper_q) >= 2 and not proper_overlap

        # Chỉ flag khi CẢ 2 signal fail (giảm false positive)
        if year_fail and proper_fail:
            suspicious.append({
                "question_id": q["id"],
                "orderInExam": q.get("orderInExam"),
                "issue": "no_year_or_proper_noun_overlap",
                "years_in_q": sorted(years_in_q),
                "years_in_expl": sorted(years_in_expl),
                "proper_in_q_sample": sorted(proper_q)[:5],
                "proper_in_expl_sample": sorted(proper_expl)[:5],
                "severity": "LOW",
            })

    return {
        "layer": "L3_content",
        "n_suspicious": len(suspicious),
        "suspicious": suspicious[:10],
        "note": "LOW severity — cần review thủ công nếu nhiều case",
    }


def _print_verification_summary(filename: str, v1: dict, v2: dict, v3: dict) -> None:
    """In báo cáo verification ra stdout sau khi parse 1 file."""
    line = "═" * 60
    print(f"\n{line}")
    print(f"  🔍 VERIFICATION REPORT: {filename}")
    print(line)

    # L1
    icon_l1 = "✅" if v1["all_passed"] else "❌"
    print(f"  {icon_l1} L1 Structural: {v1['passed']}/{v1['total']} checks pass")
    if not v1["all_passed"]:
        for c in v1["checks"]:
            if not c["passed"]:
                print(f"     ❌ {c['name']}")
                for k, val in c.items():
                    if k not in ("name", "passed") and val:
                        print(f"        {k}: {val}")

    # L2
    icon_l2 = "✅" if v2["all_passed"] else "❌"
    print(f"\n  {icon_l2} L2 Cross-source: {v2['n_conflicts']} conflicts "
          f"(MCQ: {v2['n_mcq_conflicts']}, T/F: {v2['n_tf_conflicts']})")
    if v2.get("shifting_pattern_detected"):
        print(f"     {v2['shifting_warning']}")
    for c in v2.get("conflicts", [])[:5]:
        if c["type"] == "mcq":
            print(f"     ⚠ Q{c['orderInExam']}: JSON={c['answer_in_json']} "
                  f"vs Expl={c['answer_in_explanation']}")
        else:
            print(f"     ⚠ Q{c['orderInExam']}.{c['statement']}: "
                  f"JSON isTrue={c['isTrue_in_json']} vs "
                  f"Expl isTrue={c['isTrue_in_explanation']} "
                  f"(matched expl Q{c['matched_in_expl_at_question']})")

    # L3 (chỉ in nếu nhiều)
    if v3["n_suspicious"] > 3:
        print(f"\n  ⚠ L3 Content: {v3['n_suspicious']} câu suspicious "
              f"(không có keyword overlap năm/tên riêng)")

    # Verdict
    critical_fail = (
        not v1["all_passed"]
        or v2.get("shifting_pattern_detected")
        or v2.get("n_conflicts", 0) > 5
    )
    print()
    if critical_fail:
        print(f"  🚨 KẾT LUẬN: File CÓ VẤN ĐỀ — cần review thủ công!")
    elif v2.get("n_conflicts", 0) > 0:
        print(f"  ⚠  KẾT LUẬN: File OK nhưng có {v2['n_conflicts']} conflict nhỏ")
    else:
        print(f"  ✅ KẾT LUẬN: File PASS toàn bộ verification")
    print(line)


# ---------------------------------------------------------------------------
# Main: Orchestrator
# ---------------------------------------------------------------------------

def parse_single_file(
    filepath: str,
    year: int = 2025,
    source: str = "",
    exam_code: str = "",
) -> Optional[dict]:
    """Parse 1 file Word → 1 FullExam JSON dict."""
    filepath = Path(filepath)
    if not filepath.exists():
        print(f"❌ File không tồn tại: {filepath}")
        return None

    print(f"\n{'='*60}")
    print(f"📄 Đang parse: {filepath.name}")
    print(f"{'='*60}")

    # --- BƯỚC 1 ---
    print("\n🔹 Bước 1: Đọc file Word...")
    doc = Document(str(filepath))
    full_text = extract_full_text(doc)
    print(f"  ✓ Đọc được {len(full_text)} ký tự (paragraphs + table cells)")

    image_blocks = detect_images(doc)
    if image_blocks:
        print(f"  ⚠ Tổng {len(image_blocks)} block có hình ảnh")

    question_block, answer_table_block, explanation_block = split_three_blocks(full_text)
    print(f"  ✓ question_block: {len(question_block)} chars")
    print(f"  ✓ answer_table_block: {len(answer_table_block)} chars")
    print(f"  ✓ explanation_block: {len(explanation_block)} chars")

    # Tạo exam_id sớm để dùng cho debug output
    stem = filepath.stem
    exam_id = re.sub(r"[^a-zA-Z0-9\-]", "-", stem).strip("-").lower()
    exam_id = re.sub(r"-+", "-", exam_id)

    # --- BƯỚC 2 + 3 (SONG SONG) ---
    print("\n🔹 Bước 2+3: Gọi Gemini song song (câu hỏi + đáp án + lời giải)...")
    t_start = time.perf_counter()

    with ThreadPoolExecutor(max_workers=3) as pool:
        f_q = pool.submit(parse_questions_with_llm, question_block)
        f_a = pool.submit(normalize_answers_with_llm, answer_table_block)
        f_e = (
            pool.submit(normalize_explanations_with_llm, explanation_block)
            if explanation_block else None
        )

        llm_questions        = f_q.result()
        normalized_answers   = f_a.result()
        marked_expls         = f_e.result() if f_e else ""

    t_parallel = time.perf_counter() - t_start
    print(f"  ✓ Song song hoàn tất trong {t_parallel:.1f}s")

    if not llm_questions:
        print("  ❌ Không parse được câu hỏi nào. Dừng.")
        return None

    # Phase B: Parse + merge (không gọi LLM, tuần tự)
    answer_dict = build_answer_dict(
        normalized_answers,
        marked_expls,
        original_explanation_block=explanation_block,
        exam_id=exam_id,
    )
    print(f"  ✓ Tìm được {len(answer_dict)} đáp án (MCQ + Đ/S + lời giải)")

    if not answer_dict:
        print("  ⚠ CẢNH BÁO: Không parse được đáp án nào từ bảng!")

    # --- BƯỚC 4 ---
    print("\n🔹 Bước 4: Merge + Validate + Xuất JSON...")

    title = f"Đề thi Lịch sử – {stem}"
    if exam_code:
        title = f"Đề thi Lịch sử – Mã đề {exam_code}"
    source_detail = source or stem

    metadata = {
        "examId": exam_id,
        "title": title,
        "year": year,
        "source": source,
        "sourceDetail": source_detail,
        "examCode": exam_code,
        "timeLimitMinutes": 50,
    }

    full_exam = merge_and_validate(llm_questions, answer_dict, metadata)

    # --- BƯỚC 5: VERIFICATION ---
    print("\n🔹 Bước 5: Verification (output vs input)...")
    v1 = verify_structural_integrity(full_exam)
    v2 = verify_cross_source_mapping(full_exam, explanation_block)
    v3 = verify_content_integrity(full_exam)

    full_exam["verification"] = {
        "structural":       v1,
        "cross_source":     v2,
        "content_integrity": v3,
        "verified_at":      datetime.now(timezone.utc).isoformat(),
    }

    _print_verification_summary(filepath.name, v1, v2, v3)

    # Xuất JSON
    output_path = OUTPUT_DIR / f"{exam_id}.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(full_exam, f, ensure_ascii=False, indent=2)

    n_total = sum(s["totalQuestions"] for s in full_exam.get("sections", []))
    print(f"\n✅ Hoàn tất! {n_total} câu hỏi → {output_path}")

    return full_exam


def _print_batch_verification_summary(batch_results: list) -> None:
    """In bảng tổng kết verification cho tất cả files trong mode thư mục.

    batch_results: list[{"filename": str, "full_exam": dict | None}]
    """
    print(f"\n{'═'*82}")
    print(f"  📊 BATCH VERIFICATION SUMMARY — {len(batch_results)} file(s)")
    print(f"{'═'*82}")
    print(f"  {'File':<43} {'L1':<8} {'L2 Confl':<10} {'Verdict'}")
    print(f"  {'-'*43} {'-'*8} {'-'*10} {'-'*15}")

    critical_files = []
    warning_files  = []
    clean_files    = []
    failed_files   = []

    for r in batch_results:
        fname = r["filename"]
        full_exam = r.get("full_exam")
        if not full_exam:
            failed_files.append(fname)
            print(f"  {fname[:41]:<43} {'—':<8} {'—':<10} 💥 PARSE FAILED")
            continue

        v = full_exam.get("verification", {})
        v1 = v.get("structural", {})
        v2 = v.get("cross_source", {})

        l1_str = f"{v1.get('passed', '?')}/{v1.get('total', '?')}"
        l2_conf = v2.get("n_conflicts", "?")

        if not v1.get("all_passed") or v2.get("shifting_pattern_detected"):
            verdict = "🚨 CRITICAL"
            critical_files.append(fname)
        elif v2.get("n_conflicts", 0) > 0:
            verdict = "⚠  WARNING"
            warning_files.append(fname)
        else:
            verdict = "✅ CLEAN"
            clean_files.append(fname)

        print(f"  {fname[:41]:<43} {l1_str:<8} {str(l2_conf):<10} {verdict}")

    print(f"  {'─'*82}")
    print(f"  ✅ Clean:    {len(clean_files)}")
    print(f"  ⚠  Warning:  {len(warning_files)}")
    print(f"  🚨 Critical: {len(critical_files)}")
    print(f"  💥 Failed:   {len(failed_files)}")

    if critical_files:
        print(f"\n  Files cần review NGAY:")
        for f in critical_files:
            print(f"    - {f}")
    print(f"{'═'*82}\n")


def main():
    parser = argparse.ArgumentParser(
        description="Parse đề thi Lịch sử THPT từ file Word (.docx) sang JSON",
    )
    parser.add_argument(
        "input_path",
        help="Đường dẫn file .docx hoặc thư mục chứa nhiều file .docx",
    )
    parser.add_argument("--year", type=int, default=2025, help="Năm thi (mặc định: 2025)")
    parser.add_argument("--source", type=str, default="", help='Nguồn đề (VD: "Bộ GDĐT", "Sở GD Hà Nội")')
    parser.add_argument("--exam-code", type=str, default="", help="Mã đề thi (VD: 301)")

    args = parser.parse_args()
    input_path = Path(args.input_path)

    if input_path.is_file() and input_path.suffix.lower() == ".docx":
        parse_single_file(str(input_path), args.year, args.source, args.exam_code)

    elif input_path.is_dir():
        docx_files = sorted(input_path.glob("*.docx"))
        if not docx_files:
            print(f"❌ Không tìm thấy file .docx nào trong {input_path}")
            sys.exit(1)

        print(f"📁 Tìm thấy {len(docx_files)} file .docx trong {input_path}")
        batch_results = []

        for docx_file in docx_files:
            try:
                full_exam = parse_single_file(str(docx_file), args.year, args.source)
                batch_results.append({"filename": docx_file.name, "full_exam": full_exam})
            except Exception as e:
                print(f"\n❌ Lỗi khi parse {docx_file.name}: {e}")
                batch_results.append({"filename": docx_file.name, "full_exam": None})

        _print_batch_verification_summary(batch_results)
    else:
        print(f"❌ Đường dẫn không hợp lệ: {input_path}")
        print("   Cần file .docx hoặc thư mục chứa file .docx")
        sys.exit(1)


if __name__ == "__main__":
    main()
