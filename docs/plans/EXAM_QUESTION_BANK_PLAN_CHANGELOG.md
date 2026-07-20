# Changelog kế hoạch ngân hàng đề thi MySQL

| Vấn đề | Thiết kế cũ | Quyết định cuối | Lý do |
|---|---|---|---|
| Attempt history | Chỉ giữ score authority/hash, có thể dựng review từ current bank. | `result_json` là immutable snapshot v2 cho authenticated attempt. | Re-import không được đổi điểm, answer key hoặc review lịch sử. |
| Session authority | Client gửi mode, refs, duration, score và timestamps. | Backend-issued DB session cố định mode/question set/scoring/version/deadline. | Không tin dữ liệu có thể sửa từ client. |
| Dataset import | Có thể cập nhật/rollback theo từng đề. | Import staging dataset, validate toàn bộ và atomic active-pointer promote. | Tránh runtime chứa mixed old/new dataset. |
| Offline H1 recovery | Queue có thể bị re-score bằng current H2. | Chỉ score khi xác minh đúng version/hash; mismatch giữ local result. | Không dùng answer key mới cho bài cũ. |
| Practice history | Backend legacy cho phép mode practice trong attempt API. | Practice chỉ dùng session/check state, không tạo attempt. | Không trộn activity ôn tập với bài thi/mock. |
| Resume | Chỉ một số flow resume local; không có server session API. | Thêm server resume và giữ local UI draft riêng. | Khôi phục fixed set/deadline/check results mà không sync mỗi selection. |
| Blank/partial | Missing refs và blank/partial chưa tách contract rõ. | Submit đủ instance array; null/partial hợp lệ, malformed shape bị từ chối. | Blank là nghiệp vụ hợp lệ, không phải payload lỗi. |
| Timeout | Sau grace có thể bị từ chối và mất bài. | Giữ local result/queue; late verified có authority chưa xác minh thời gian. | Không mất bài nhưng không giả on-time. |
| Catalog payload | Client tải full JSON/topic refs để chọn câu. | Catalog/topic/preview metadata-only; session create chọn và trả safe set. | Giảm answer-key leakage và đưa selection về backend. |
| Frontend question type | Dùng type chứa answer key cho nhiều context. | Tách Safe/Checked/Reviewed types và version-aware adapters. | Whitelist data theo lifecycle. |
| Retry original | Tải current JSON cho cả result cũ. | Snapshot v2 retry dùng immutable reviewed questions; legacy fallback có nhãn. | Bảo toàn H1 sau H2. |
| Section-scoped question ID | Unique question ID chỉ trong section. | `UNIQUE(dataset_id, question_id)`, section ID scope theo exam. | Public question ID được dùng xuyên session/topic/recovery. |
| Dataset-section ownership | Ngầm dựa vào hierarchy hoặc composite FK chưa xác minh. | FK section đơn + importer/service/audit enforce dataset match. | TiDB production version chưa biết; không tuyên bố DB enforce sai. |
| Idempotency fields | Dự kiến lưu client ID/hash ở receipt và attempt. | Receipt là nguồn duy nhất; attempt không lặp hai field này. | Tránh hai nguồn sự thật. |
| Receipt relation | Có thể dùng FK hai chiều receipt/attempt. | Chỉ `receipt.attempt_id -> attempt.id`, nullable unique. | Receipt tồn tại trước attempt và cần theo dõi failure. |
| Practice completion | “Complete hoặc auto-complete” chưa chốt. | Check câu cuối auto-complete; endpoint complete chỉ kết thúc sớm. | Lifecycle deterministic và testable. |
| Anonymous authorization | Token chưa có transport/persistence rõ. | Header `X-Exam-Session-Token`, hash-only backend, localStorage theo session. | Resume anonymous mà không đưa token vào URL. |
| Submit object | Object keyed có duplicate JSON key bị parser overwrite. | Answer array; service bắt duplicate bằng `Set` trước Map. | Phù hợp mixed Jackson hiện tại và tránh global parser change. |
| Build equality | Artifact không có common deterministic metadata. | RFC 8785 + SHA-256, source/artifact hashes và aggregate build file. | Importer xác minh tất cả artifact cùng content build. |
| RFC implementation | Node/Java có thể tự canonicalize khác nhau. | Pin `canonicalize@3.0.0` và Java canonicalization `1.1`, dùng shared vectors. | Cross-runtime bytes/hash phải giống hệt. |
| Metadata self-hash | Build metadata có nguy cơ tham gia aggregate hash. | Metadata sinh sau cùng và không hash chính nó; timestamp/build ID excluded. | Loại self-reference và nondeterminism. |
| Duplicate source key | `JSON.parse` có thể overwrite trước validation. | Pin Node `json-dup-key-validator@1.0.3`; Java dùng Jackson 3 strict duplicate detection trước parse/canonicalize. | JCS yêu cầu I-JSON và không tự phát hiện duplicate. |
| Receipt transaction | Receipt pending có thể rollback cùng scoring failure. | Transaction A commit `RECEIVED`; transaction B score/update status. | Giữ audit/retry state sau lỗi. |
| Anonymous result storage | Receipt/session có thể cùng lưu snapshot. | Anonymous result chỉ ở session; receipt trỏ session và không lưu snapshot. | Một nguồn result cho anonymous. |
| Authenticated result storage | Có thể lặp snapshot giữa session và attempt. | Authenticated immutable result chỉ ở attempt. | Attempt là nguồn history lâu dài. |
| Multiple submit IDs | Mỗi client ID idempotent nhưng cùng session có thể nhiều success. | `success_slot NULL|1`, unique `(session_id, success_slot)`, session row lock. | Enforce một successful submission ở DB và transaction. |
| Race handling | Chỉ dựa vào client ID hoặc app check. | Lock session, check existing success, unique success slot là backstop. | Hai request đồng thời không tạo hai attempts. |
| Late history | Late/fallback có thể bị ẩn hoặc tính như on-time. | Được hiện history có nhãn; stats lọc SERVER + SERVER_ON_TIME. | Giữ lịch sử nhưng không làm bẩn timing metrics. |
| Static fallback | Có thể bị mô tả như giải pháp bảo mật. | Transitional only, vẫn lộ answer key; version-aware upgrade. | Trung thực với static asset hiện tại. |
| Visibility | Verification và publish bị gộp. | Tách `PUBLIC|HIDDEN` và `VERIFIED|REVIEW_REQUIRED`. | Hidden không bao giờ qua public API. |
| Explanation | Empty explanation có thể bị coi là lỗi. | Null/empty hợp lệ. | Dữ liệu hiện tại có câu chưa có explanation. |
| Migration | Có nguy cơ sửa V13 hoặc dùng bảng legacy. | Giữ V13; migration mới theo version tiếp theo, không dùng legacy tables. | Bảo vệ compatibility và module quiz. |
| Rollout | Big-bang frontend/backend/data cutover. | Chia phase 0-7, mỗi phase có test và rollback gate. | Giảm blast radius và giữ static fallback đến khi ổn định. |

## Ghi chú version tài liệu

Changelog này mô tả thay đổi kiến trúc, không phải migration log. Tên V14/V15/V16 trong revised plan là dự kiến và phải kiểm tra lại migration cuối tại thời điểm implementation.
