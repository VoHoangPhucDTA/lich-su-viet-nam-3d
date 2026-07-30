# Quiz Component Reuse Decision

Ngày quyết định: 2026-07-30.

## Decision

`EXTRACT_SHARED_PRESENTATIONAL_COMPONENTS`

Chỉ trích xuất các primitive trình bày và accessibility có cùng semantics giữa
AI self-practice và THPT. Không tạo một “quiz engine” dùng chung.

## Shared now

### `QuizSubmitDialog`

- Nhận model trung lập `QuizSubmitSummary`.
- Sở hữu backdrop, dialog semantics, focus ban đầu/trap/restore, Escape,
  backdrop cancel, busy/disabled state và duplicate-confirm guard.
- Không gọi API, không tính unanswered, không chấm điểm và không biết AI/THPT.
- `ExamSubmitDialog` là thin adapter giữ nguyên public props hiện tại.
- AI session dùng primitive trực tiếp.

### `QuizMcqOptionGroup`

- Nhận option trung lập A–D, selected ID, callback và accessible label.
- Sở hữu radiogroup/radio semantics, roving tabindex, bốn phím mũi tên,
  Home/End, Enter/Space và focus follows selection.
- Không biết đáp án đúng, score, source, explanation, API hoặc persistence.
- AI session dùng primitive trực tiếp. THPT tiếp tục giữ card/domain composition
  hiện tại; primitive là ranh giới tái sử dụng cho lần adapter tiếp theo nếu
  regression suite chứng minh parity.

### `QuizInstructionsDialog`

- Nhận title, description, notes và danh sách `QuizShortcutItem` trung lập.
- Sở hữu dialog semantics, focus ban đầu/trap/restore, Escape và backdrop close.
- `ExamShortcutHelp` là thin adapter giữ nguyên public API THPT.
- AI session dùng component trực tiếp và dùng `AI_SELF_PRACTICE_SHORTCUTS` làm
  single source cho nội dung shortcut thực tế.
- Shortcut handling vẫn do domain container cấu hình qua
  `useExamKeyboardShortcuts`; presentation không tự đăng ký business action.

## Shared later

- Visual tokens cho option selected/disabled/focus nếu hai module thống nhất
  được appearance contract.
- Timer display primitive sau khi tách rõ “display elapsed/remaining” khỏi
  quyền sở hữu deadline.
- Progress summary presentation nếu model trạng thái THPT và AI có mapping
  trung lập ổn định.

Các mục này chưa được coi là đã implement.

## Domain-specific

### AI self-practice

- Gọi `/api/quiz/generate`, mapping RAG response, partial generation.
- Local session/result/history, local scoring, source SGK và explanation.
- Count-derived 5/10/15-minute rule và local deadline handling.

### THPT

- Server-authoritative session, answer synchronization, scoring, timing,
  recovery và submission.
- Partial-answer semantics, question types ngoài MCQ và exam-specific review.

## Why no full THPT runner reuse

Hai runner giống nhau ở một số interaction nhưng khác quyền sở hữu dữ liệu và
độ tin cậy. Hợp nhất submission, scoring, persistence hoặc timer sẽ làm mờ ranh
giới server-authoritative của THPT và tăng blast radius cho self-practice. Goal
này vì vậy ưu tiên adapter/composition nhỏ, có characterization tests.

## Composition rules

- Shared component nhận domain-neutral data; adapter thực hiện mapping ở biên.
- Không thêm `isAi`, `isThpt` hoặc chuỗi boolean props để chuyển behavior.
- Khi behavior khác nhau, giữ ở domain container thay vì nhét điều kiện vào
  primitive.
- Shared component không import service, store hoặc domain response type.

## Final Goal 17A confirmation

`CURRENT_DECISION`: các shared presentational primitives hiện tại đã đủ cho AI
self-practice và các điểm giao diện THPT đang dùng chung. Không xây shared quiz
engine.

Timer, scoring, persistence, submission authority và recovery tiếp tục thuộc
từng domain. AI self-practice giữ local session/result/history; THPT giữ
server-authoritative session và scoring. Chỉ cân nhắc trích xuất thêm primitive
khi hai domain có cùng semantics và có characterization test bảo vệ.
