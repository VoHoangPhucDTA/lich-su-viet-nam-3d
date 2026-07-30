# AI Quiz UI Specification — `/quiz/generate`

Ngày đối chiếu code: 2026-07-30.

## Quy ước trạng thái

- `CURRENT_IMPLEMENTATION`: đã có trong code hiện tại.
- `TARGET_BEHAVIOR`: hành vi mong muốn nhưng chưa được coi là đã triển khai.
- `OPEN_DECISION`: cần quyết định product/kiến trúc trước khi triển khai.

## Ranh giới nghiệp vụ

`CURRENT_IMPLEMENTATION`

- `/quiz/generate` là bài tự luyện MCQ có xác thực. `/quiz` vẫn là trang giới
  thiệu công khai; session, result và history đều được bảo vệ.
- Browser chỉ gọi `POST /api/quiz/generate`; payload công khai không đổi và chỉ
  gồm `query`, `difficulty`, `count`.
- Session/result lưu cục bộ trong browser, cách ly theo `userId`, chấm điểm ở
  frontend và giữ tối đa 50 kết quả.
- Luồng THPT tiếp tục dùng session, thời gian, submit và chấm điểm có thẩm quyền
  từ server. AI self-practice không thay thế runner hoặc scoring THPT.
- Đáp án đúng, lời giải và nguồn SGK chỉ xuất hiện sau khi nộp bài.

## Form và single-query rule

`CURRENT_IMPLEMENTATION`

- “Gợi ý chủ đề” có sáu preset với `selectedPresetId` riêng. Helper giải thích
  preset chỉ là công cụ điền nhanh.
- Chọn preset đặt `selectedPresetId` và thay toàn bộ textarea bằng query của
  preset. Textarea vẫn editable.
- Khi normalized textarea khác normalized query của preset, association bị xóa
  và dropdown trở về placeholder; nội dung người dùng được giữ nguyên.
- Textarea là nguồn query duy nhất. Submit chỉ gửi `query.trim()`; không gửi
  `presetTopic`, lớp, bài, model, routing, `topK` hay thời gian làm bài.
- Query bắt buộc, tối đa 1.000 ký tự; bộ đếm và trạng thái invalid được hiển thị.
- Retrieval được mô tả là tìm trên toàn bộ SGK Lịch sử lớp 10–12.

`OPEN_DECISION`

- Có thu thập preset ID riêng cho analytics trong tương lai hay không. Việc này
  không được âm thầm thay đổi public API.

## Difficulty, số câu và thời gian

`CURRENT_IMPLEMENTATION`

- Difficulty là fieldset radio: Dễ/easy, Trung bình/medium, Khó/hard; mặc định
  Trung bình. Helper mô tả mức nhận biết, thông hiểu, phân tích/vận dụng.
- Count dùng mode loại trừ `3 | 5 | 10 | custom`. Custom input chỉ hiện khi chọn
  “Khác” và chỉ chấp nhận số nguyên 1–10.
- Thời gian bài tự luyện được suy ra bằng pure function:
  1–3 câu = 5 phút; 4–6 câu = 10 phút; 7–10 câu = 15 phút.
- Footer hiển thị summary difficulty • count • time và CTA “Tạo N câu hỏi”.
- CTA disabled có lý do liền kề, liên kết bằng `aria-describedby`.
- CTA disabled vẫn có border, nền xám trung tính, chữ/icon đủ tương phản và
  opacity 1; không hover và dùng `cursor: not-allowed`.
- Difficulty và count là hai fieldset độc lập. Desktop dùng hai cột với gap
  40–64 px; từ 900 px trở xuống stack một cột với row gap tối thiểu 24 px.
- Count có helper “Tối đa 10 câu cho mỗi bài tự luyện.”

`OPEN_DECISION`

- Không có mode không giới hạn thời gian. Nếu cần, phải là thay đổi business
  rule riêng và không ảnh hưởng timer THPT.

## Validation và request

`CURRENT_IMPLEMENTATION`

- Query rỗng, query trên 1.000 ký tự, count rỗng/thập phân/ngoài 1–10 đều bị
  chặn trước request.
- Guard bằng ref ngăn double-submit trước khi React kịp render disabled state.
- Request:

```json
{
  "query": "Cách mạng tháng Tám năm 1945",
  "difficulty": "MEDIUM",
  "count": 5
}
```

- Thời gian tự luyện chỉ nằm trong local `QuizConfig`, không gửi backend.

## Loading, dừng chờ và lỗi

`CURRENT_IMPLEMENTATION`

- Modal loading nói đúng dữ kiện: “Đang tạo N câu hỏi từ nguồn SGK…”, elapsed
  seconds đơn điệu và “Quá trình có thể mất một chút thời gian.” Không có stage
  giả hoặc fake percentage.
- Loading dùng một biểu tượng Hourglass chuyển động nhẹ; animation dừng khi
  `prefers-reduced-motion: reduce`. Không hiển thị spinner cạnh tranh.
- Modal có `role=dialog`, `aria-modal=true`, focus ban đầu ở “Dừng chờ”, cleanup
  interval và khôi phục focus khi đóng. Elapsed không được announce mỗi giây.
- “Dừng chờ” abort browser request, giữ nguyên form và không hiển thị lỗi/retry.
  Không cam kết upstream Gemini đã dừng.
- Error panel dùng `role=alert`, giữ nguyên config, không tự retry và không để lộ
  prompt, token, model hoặc raw backend detail.
- Có mapping cho insufficient context, timeout, unavailable, invalid response,
  generation failure, auth và HTTP 429:
  “Bạn đang tạo bài quá nhanh. Hãy chờ một lúc rồi thử lại.”
- Success lưu local session rồi điều hướng `/quiz/session/:sessionId`; partial
  response vẫn mở session và thông báo generated/requested.

## Session, submit và hết giờ

`CURRENT_IMPLEMENTATION`

- MCQ là accessible radiogroup với roving tabindex; hỗ trợ click, bốn phím mũi
  tên, Home, End, Enter và Space.
- Chọn/xóa/flag/jump được lưu lại cục bộ. Đọc session kiểm tra `userId`.
- Chuyển câu dùng `useQuestionNavigation`, focus question container và tôn trọng
  `prefers-reduced-motion`.
- AI session tái sử dụng `useExamKeyboardShortcuts` và một source shortcut riêng
  đúng với hành vi đã implement: ←/→ chuyển câu; ↑/↓ và Home/End chọn phương án;
  A–D/1–4 chọn nhanh; Delete xóa lựa chọn; Shift+F đánh dấu; Ctrl+Enter mở xác
  nhận nộp bài và `?` mở hướng dẫn.
- Header desktop hiển thị “Hướng dẫn” còn sidebar tiến trình vẫn luôn hiện.
  Tablet/mobile vẫn có “Hướng dẫn” và có trigger “Tiến trình” mở drawer.
- Dialog hướng dẫn dùng shared presentation `QuizInstructionsDialog`, có modal
  semantics, focus trap, Escape, backdrop close và focus restoration.
- Câu cuối hiển thị “Nộp bài”, không còn “Câu tiếp”.
- Hộp thoại submit dùng primitive dùng chung, trap focus, Escape/backdrop,
  restore focus và guard duplicate confirm.
- Không dùng `window.alert`. Submit lỗi hiển thị inline:
  “Không thể nộp bài lúc này. Bài làm của bạn vẫn được giữ lại.” và có retry.
- Hết giờ được announce một lần, khóa đáp án, submit đúng một lần. Nếu submit
  lỗi, session không mất, deadline không reset và đáp án không được mở lại.

## Result, explanation và source

`CURRENT_IMPLEMENTATION`

- Difficulty luôn hiển thị tiếng Việt, không lộ enum English.
- Result hiển thị recommendation duy nhất dựa trên `result.config.query`:
  “Ôn lại chủ đề này” và CTA “Tạo bài ôn lại chủ đề này”.
- Có disclosure: “Kết quả chi tiết của bài tự luyện hiện được lưu trên trình
  duyệt này.”
- Explanation thay thuật ngữ kỹ thuật Fact Context/retrieved context bằng ngôn
  ngữ nguồn SGK. Citation hiển thị title/location, không hiển thị chunk hash.
- `/quiz` được phân loại là `QUIZ_MODULE_HOME`. Result dùng link tường minh có
  ArrowLeft “Về trang trắc nghiệm” tới `/quiz`, không dùng `navigate(-1)`.
- “Tạo bài luyện tập mới” tới `/quiz/generate`, “Xem lịch sử” tới
  `/quiz/history`, action ôn lại giữ query prefill.

`TARGET_BEHAVIOR`

- Bổ sung mô tả ngắn rằng citation là nguồn dùng để tạo/đối chiếu câu hỏi, không
  phải bảo đảm tuyệt đối AI không sai.

## Responsive và accessibility

`CURRENT_IMPLEMENTATION`

- Form hai cột trên màn hình rộng và stack từ 900 px; count grid hai cột,
  footer stack và CTA full width dưới 640 px.
- Difficulty radio có focus-visible; textarea/select/custom count có label,
  invalid state và helper.
- Modal ngăn focus nền; submit dialog/loading quản lý focus; lỗi và hết giờ được
  announce có chủ đích.
- Navigation smooth-scroll bị tắt khi người dùng chọn reduced motion.

`TARGET_BEHAVIOR`

- Xác minh trực quan tại 1440×900, 1024×768, 768×1024 và 390×844, gồm 200% zoom,
  bàn phím ảo, contrast helper và floating widget.

## Verification status

- Unit/component characterization: primitive submit dialog, option group,
  practice config, generation form, AI session và THPT wrapper.
- Live runtime viewport capture: `RUNTIME_VIEWPORT_CAPTURE_NOT_AVAILABLE` trong
  lần cập nhật này; không mô tả target responsive như thể đã được xác minh.
