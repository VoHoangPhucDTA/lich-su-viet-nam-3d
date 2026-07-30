# AI Quiz UI Audit — `/quiz/*`

Ngày cập nhật: 2026-07-30. Trạng thái: post-Goal-16C authenticated runtime QA.

Phạm vi gồm form tạo quiz, loading/error, session, result và regression của
shared primitives trên module THPT. Audit không thay đổi API, scoring,
persistence, timer policy hoặc AI Service.

## Evidence và giới hạn

- Code: `QuizGeneratePage.tsx`, `QuizGenerationLoading.tsx`,
  `QuizSessionPage.tsx`, `QuizResultPage.tsx`, shared question/dialog/keyboard
  primitives, `quizAiApi.ts`, `quizService.ts`, routing và CSS.
- Runtime authenticated: 1440×900, 1024×768, 768×1024 và 390×844.
- Evidence chi tiết: `artifacts/ui-review/goal16c-authenticated/`.
- Goal 17A gate sau visual QA: encoding, ESLint, TypeScript, 536/536 Vitest và
  production build đều pass.
- Timeout, HTTP 429 và AI-unavailable chưa được force bằng response production
  trong visual QA; mapping và component/contract tests là bằng chứng hiện có.
- Chưa thực hiện production deployment, screen-reader laboratory test hoặc
  đo contrast tự động trên mọi cấu hình hệ điều hành.

## P0 — kết quả hiện tại

### P0-1 — Quan hệ preset và textarea — RESOLVED

`CURRENT_IMPLEMENTATION`

Preset được mô tả là gợi ý điền nhanh. Textarea là query duy nhất gửi backend.
Khi người dùng sửa nội dung khác normalized preset query, preset association
được reset nhưng nội dung custom được giữ nguyên.

`TARGET_BEHAVIOR`

Không còn thay đổi bắt buộc. Nếu cần analytics theo preset, phải có quyết định
product và không được âm thầm đổi public request contract.

### P0-2 — Phạm vi lớp 10–12 — RESOLVED

`CURRENT_IMPLEMENTATION`

Form không có grade selector. Helper và configuration context mô tả retrieval
trên toàn bộ SGK Lịch sử lớp 10–12; thông tin vẫn đọc được ở mobile.

`OPEN_DECISION`

Chỉ thêm lọc lớp nếu backend/product chính thức thay đổi contract; không suy ra
grade từ preset.

### P0-3 — Thời gian cố định — RESOLVED

`CURRENT_IMPLEMENTATION`

Thời lượng không còn cố định 15 phút. Pure function suy ra 1–3 câu = 5 phút,
4–6 câu = 10 phút và 7–10 câu = 15 phút. Summary trước CTA hiển thị difficulty,
count và thời lượng thực tế.

`OPEN_DECISION`

Không có mode “không giới hạn”. Đây sẽ là business-rule change riêng nếu được
đề xuất, không phải visual fix.

### P0-4 — Loading/progress/error UX — RESOLVED_WITH_LIMITATION

`CURRENT_IMPLEMENTATION`

Loading là modal vừa viewport mobile, có hourglass, elapsed seconds và thông
điệp trung thực, không fake stage/percentage. Modal có semantics, initial focus,
Escape/focus restoration và reduced-motion. “Dừng chờ” chỉ abort browser wait,
giữ config và không tuyên bố provider đã dừng. Error giữ config, không auto
retry và map timeout, 429, unavailable, insufficient context, auth và response
không hợp lệ.

`TARGET_BEHAVIOR`

Force runtime timeout/429/unavailable trong môi trường kiểm thử có kiểm soát để
bổ sung screenshot regression; không gọi live Gemini trong CI chỉ để tạo lỗi.

## P1 — kết quả usability và accessibility

### P1-1 — Disabled CTA explanation — RESOLVED

CTA disabled vẫn rõ về thị giác, có lý do liền kề và `aria-describedby`; guard
ref ngăn double-submit trước khi React render lại.

### P1-2 — Difficulty segmented control — RESOLVED

Difficulty là fieldset radio Dễ/Trung bình/Khó với focus-visible và keyboard
semantics. Helper mức nhận thức nằm ngay sau nhãn độ khó.

### P1-3 — Custom count — RESOLVED

Count có mode loại trừ 3/5/10/custom. Input “Khác” chỉ hiện khi active, có label,
validation số nguyên 1–10 và không cạnh tranh trạng thái với preset.

### P1-4 — Configuration summary — RESOLVED

Footer hiển thị difficulty • count • time theo resolved config và CTA “Tạo N
câu hỏi”. Phạm vi SGK được mô tả trong form.

### P1-5 — Citation/source explanation — PARTIAL

Source/explanation chỉ hiện sau submit, dùng ngôn ngữ nguồn SGK và wrap tốt.
Microcopy rằng citation là nguồn dùng để tạo/đối chiếu chứ không bảo đảm tuyệt
đối factual correctness vẫn là `TARGET_BEHAVIOR`.

### P1-6 — Mobile/accessibility — VERIFIED_WITH_LIMITATION

Không có horizontal overflow ở bốn viewport. Difficulty/count tách biệt; footer
stack và CTA full-width trên mobile. Dialog trap/restore focus; error/time-up
được announce có chủ đích; reduced-motion được tôn trọng. Screen reader chuyên
dụng và 200% zoom trên mọi browser vẫn là kiểm tra bổ sung.

## P2 — polish

### P2-1 — Back link — RESOLVED

Result hiển thị ArrowLeft; “Về trang trắc nghiệm” đi `/quiz`, “Tạo bài mới” đi
`/quiz/generate`, “Xem lịch sử” đi `/quiz/history`, và ôn lại giữ query.
Generation/history cũng dùng destination-oriented label với đích cố định thay
vì phụ thuộc browser history. Nút “Lên đầu trang” trên result cuộn đúng
`#app-scroll-root`.

### P2-2 — Card spacing — VERIFIED

Generation form giữ nhịp dọc và separation giữa difficulty/count ở desktop,
tablet và mobile matrix; không redesign.

### P2-3 — Helper text contrast — VERIFIED_VISUALLY

Helper/disabled CTA vẫn đọc được trong runtime matrix. Đo contrast tự động và
high-contrast OS mode chưa được thực hiện.

### P2-4 — Floating widget bị cắt — EXTERNAL_OWNER

Widget nổi trong ảnh cũ không thuộc `QuizGeneratePage`/shared quiz primitives.
Không thêm global overflow workaround vì có thể che lỗi owner bên ngoài module.

## Session, keyboard và dialog

- Desktop có sidebar tiến trình và “Hướng dẫn”; tablet/mobile ẩn sidebar hợp lý
  nhưng giữ trigger “Tiến trình” và “Hướng dẫn”.
- A–D/1–4 chọn đáp án; Arrow keys/Home/End điều hướng radio; ←/→ chuyển câu;
  Delete xóa; Shift+F đánh dấu; Ctrl+Enter mở submit; `?` mở hướng dẫn.
- Câu cuối hiển thị “Nộp bài”, không hiển thị “Câu tiếp”.
- Dialog hướng dẫn/submit có focus trap, Escape, backdrop close và focus
  restoration. Submit lỗi hiển thị inline, không dùng `window.alert`.
- Hết giờ khóa đáp án, submit đúng một lần và không reset deadline sau lỗi.

## THPT shared-primitives regression

MCQ selected state, keyboard radio, submit dialog, focus trap/restoration và
mobile dialog đã được characterization. Không thay đổi nghiệp vụ, scoring,
timer, persistence hoặc server-authoritative boundary của THPT.

## Remaining decisions

1. Có thêm analytics identity cho preset hay không.
2. Có bổ sung citation disclaimer trung tính hay không.
3. Có đầu tư automated contrast/screen-reader/200%-zoom gate hay không.
4. Có tạo controlled runtime harness cho timeout/429/unavailable hay chỉ giữ
   contract/component tests.
