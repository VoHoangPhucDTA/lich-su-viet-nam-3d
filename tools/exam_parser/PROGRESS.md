# Tiến độ Module Luyện Thi THPT – So với Plan

> Cập nhật: 26/06/2026  
> Tham chiếu plan gốc: `C:\Users\ADMIN\.windsurf\plans\module-luyen-thi-thpt-989e85.md`

---

## Tổng quan

| Phase | Nội dung | Trạng thái |
|---|---|---|
| **Phase 1** | ETL Pipeline (Word → LLM → JSON) | ✅ Hoàn tất |
| **Phase 2** | Refactor Data Model TypeScript | ⬜ Chưa bắt đầu |
| **Phase 3** | UI Components + Câu Đúng/Sai | ⬜ Chưa bắt đầu |
| **Phase 4** | Chế độ luyện nâng cao | ⬜ Chưa bắt đầu |
| **Phase 5** | Backend integration | ⬜ Chưa bắt đầu |

---

## Phase 1 – ETL Pipeline

### ✅ Đã hoàn thành

#### P1.1 – Folder structure
```
tools/exam_parser/
├── .env.example          ⚠️ Chưa tạo
├── .gitignore            ✅
├── requirements.txt      ✅ (python-docx, google-genai, python-dotenv)
├── input/.gitkeep        ✅
└── output/exams/.gitkeep ✅
```

#### P1.2 – `parse_exam_word.py` (script chính)

Pipeline 4 bước đã hoạt động đúng với file thực tế:

| Bước | Nội dung plan | Thực tế triển khai | Ghi chú |
|---|---|---|---|
| **Bước 1** | `extract_full_text()` duyệt XML body (paragraphs + table cells), cắt tại "ĐÁP ÁN" | ✅ Đúng như plan – join cells bằng `" | "` | Xử lý merged cells bằng dedup |
| **Bước 2** | Chunk text → Gemini 2.0 Flash (Structured Outputs) + topic + cognitiveLevel | ✅ Hoạt động – model `gemini-2.5-flash` | ⚠️ Đổi model (xem bên dưới) |
| **Bước 3** | Parse bảng đáp án + lời giải chi tiết | ✅ Hoạt động – 3 sub-step | Thực tế phức tạp hơn plan |
| **Bước 4** | Merge + validate + xuất JSON | ✅ Xuất JSON hoàn chỉnh với 2 sections | Deduplicate MCQ và T/F đúng |

**Các hàm đã cài đặt:**
- `extract_full_text(doc)` – đọc paragraphs + table cells theo thứ tự XML
- `split_question_answer(full_text)` – cắt tại keyword "ĐÁP ÁN"
- `detect_images(doc)` – log warning hình ảnh, không crash
- `chunk_text(text)` – chia ~10 câu/chunk
- `call_gemini(chunk)` – retry với server-hint `retryDelay`, 4 lần thử
- `parse_questions_with_llm(question_block)` – gọi Gemini theo chunks, 20s delay giữa chunks
- `_parse_mcq_table(rows, answer_dict)` – bảng MCQ ngang/dọc
- `_parse_tf_table(rows, answer_dict)` – bảng Đ/S dạng cột (Câu | Ý | Đúng/Sai | Giải thích)
- `parse_answer_tables(tables)` – quét tất cả tables
- `parse_explanations(answer_block)` – extract MCQ answer letter + explanation từ text
- `build_answer_dict(tables, answer_block)` – merge bảng + text
- `merge_and_validate(llm_questions, answer_dict, metadata)` – xuất JSON cuối

**Output JSON đạt được** (đề Hà Tĩnh 2026 – Lần 1):
- `sections.mcq`: **24 câu** – đáp án A/B/C/D + giải thích đầy đủ
- `sections.true_false`: **4 câu × 4 ý** – isTrue đúng + giải thích từ bảng
- Không có warnings thiếu đáp án

#### P1.3 – `validate_exam.py` ✅
Kiểm tra JSON: đủ câu, đủ đáp án, options, format hợp lệ.

#### P1.4 – `merge_bank.py` ✅
Tách câu hỏi từ nhiều đề → `question_bank.json`.

### 🟡 Đang / Còn thiếu

| Mục | Trạng thái | Ghi chú |
|---|---|---|
| **P1.5** Test 5–10 file Word | ✅ Đã test nhiều file | Validator hiện sạch 38/38 file JSON |
| **P1.6** Parse toàn bộ 38 đề | ✅ Hoàn tất | File lỗi cuối cùng đã bổ sung câu Đ/S còn thiếu |

---

## So sánh chi tiết: Plan vs Thực tế (Phase 1)

### Điểm khác biệt quan trọng

#### 1. Model Gemini
| Plan | Thực tế |
|---|---|
| `gemini-2.0-flash` | `gemini-2.5-flash` |
Lý do: `gemini-2.0-flash` hết 200 RPD/ngày (free tier). `gemini-2.5-flash` có quota bucket riêng, đang hoạt động.

#### 2. Format bảng Đ/S thực tế khác plan
| Plan | Thực tế (đề THPT 2025) |
|---|---|
| Bảng 5 cột: `Câu | a | b | c | d` | Bảng 4 cột: `Câu | Ý | Đúng/Sai | Giải thích` |
| Mỗi row = 1 câu, 4 ô Đ/S | Mỗi row = 1 ý (16 rows cho 4 câu × 4 ý) |
| Key: `"25a"` | Key: `"tf_1_a"`, `"tf_2_b"` (tránh xung đột MCQ) |
Lý do đổi key: câu Đ/S trong đề 2025 đánh số section-local (1-4), trùng với MCQ câu 1-4. Dùng `tf_N_id` để tránh ghi đè.

#### 3. MCQ answer key không có bảng riêng
| Plan | Thực tế |
|---|---|
| Đáp án MCQ từ bảng `doc.tables` | Đáp án MCQ từ **text** trong `answer_block` (format: `Đáp án: C.`) |
`parse_explanations()` được viết lại để extract **cả letter đáp án lẫn giải thích** (không chỉ giải thích như plan).

#### 4. Spurious regex match trong answer_block
**Vấn đề mới phát sinh (không có trong plan)**: Prose "PHẦN II. Thí sinh trả lời từ câu 1 đến câu 4" trong `answer_block` tạo match giả cho câu 1 và câu 4, overwrite đáp án đúng.  
**Fix**: Giữ match ĐẦU TIÊN cho mỗi số câu (`if num_str not in result`).

#### 5. Deduplication LLM output
**Vấn đề mới phát sinh**: T/F câu 1-4 bị xóa bởi MCQ câu 1-4 do dedup theo `questionNumber` đơn.  
**Fix**: Dedup theo `(questionNumber, questionType)` tuple.

### Các bugs đã fix (không có trong plan gốc)

| # | Bug | Fix |
|---|---|---|
| 1 | `gemini-2.0-flash` hết quota | Đổi sang `gemini-2.5-flash` |
| 2 | Retry quá ngắn khi 429 rate limit | Parse `retryDelay` từ server hint, tăng delay lên 20s/chunk |
| 3 | `_parse_tf_table` có điều kiện `>= 25`, loại toàn bộ câu 1-4 | Rewrite sang column-based parsing |
| 4 | Dedup MCQ overwrite T/F cùng số | Dedup bằng `(num, type)` tuple |
| 5 | `build_answer_dict` ghi đè explanation từ bảng bằng `""` | Preserve existing explanation, chỉ fallback khi trống |
| 6 | MCQ answer không extract được (không có bảng MCQ) | Rewrite `parse_explanations` để extract cả letter + explanation từ text |
| 7 | Spurious match "từ câu 1 đến câu 4" trong prose | Giữ first match, skip duplicate |

---

## Phases 2–5 – Chưa bắt đầu

### Phase 2 – Refactor Data Model TypeScript
- [ ] `types/exam.ts`: thêm `TrueFalseQuestion`, `ExamSection`, `FullExam`, `MCQAnswer`, `TrueFalseAnswer`
- [ ] Cập nhật scoring: MCQ 0.25đ/câu, T/F thang bậc [0, 0.1, 0.25, 0.5, 1.0]
- [ ] Import JSON đề thi vào `src/data/exams/`

### Phase 3 – UI Components
- [ ] `TrueFalseQuestion.tsx` – split-pane desktop (40/60), sticky mobile
- [ ] `ExamSectionHeader.tsx`
- [ ] Cập nhật `ExamSessionPage.tsx`, `ExamResultPage.tsx`, `ExamHomePage.tsx`

### Phase 4 – Chế độ luyện nâng cao
- [ ] Quiz custom với filter loại câu
- [ ] Luyện sai
- [ ] Ôn theo điểm yếu
- [ ] Bookmark câu hỏi

### Phase 5 – Backend
- [ ] API CRUD + chấm điểm server-side
- [ ] Migrate localStorage → API

---

## Edge Cases đã xử lý thêm (P1.5 – từ đề Bắc Ninh / Phú Thọ)

| # | Dị bản | Ví dụ thực tế | Hàm xử lý | Cách fix |
|---|---|---|---|---|
| EC1 | Tiêu đề khối đáp án dùng "GIẢI CHI TIẾT" thay "ĐÁP ÁN" | `GIẢI CHI TIẾT`, `LỜI GIẢI CHI TIẾT`, `HƯỚNG DẪN GIẢI` | `split_question_answer` | Thêm các keyword vào regex alternation |
| EC2 | Bảng MCQ gộp số câu + đáp án vào 1 ô | `"1. C"`, `"Câu 1: A"`, `"3.B"` | `_try_parse_combined_mcq_cell` (mới) + fallback trong `_parse_mcq_table` | Parse cell với regex `Câu?\d+[.:-]\s*[ABCD]$` |
| EC3 | Tag độ khó chèn vào tiêu đề câu trong lời giải | `"Câu 1 (NB):"`, `"Câu 2 (TH)."` | `parse_explanations` | Thêm `(?:\([^)]{1,20}\))?` optional group vào regex |
| EC4 | Đáp án Đ/S viết thẳng dạng text, không có bảng | `"Câu 1: Đ, Đ, S, S"` hoặc `"a) Đúng  b) Sai  c) Đ  d) S"` | `_parse_tf_text_block` (mới) + gọi từ `build_answer_dict` | Fallback text scan với 2 regex: compact (4 values inline) và per-label (a/b/c/d) |

---

## Việc tiếp theo cần làm

1. **Chạy thêm file Word** (Phú Thọ, các đề khác) → xác nhận pipeline xử lý đúng nhiều format
2. **Xử lý edge cases** có thể gặp:
   - File không có "ĐÁP ÁN" keyword
   - File có bảng MCQ dạng ngang (số câu hàng 1, đáp án hàng 2)
   - File có hình ảnh trong câu hỏi
3. **Sau khi P1.5 ổn** → parse 39 đề (P1.6), rồi bắt đầu Phase 2 (TypeScript data model)
