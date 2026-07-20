# Kế hoạch đưa ngân hàng đề thi vào MySQL/TiDB-compatible

## 1. Hiện trạng và mục tiêu

Module luyện thi hiện đọc 38 file `data/exams/*.json` qua static assets. Pipeline sinh `exams-manifest.json`, `topic-index.json` và `topic-raw-mapping.json`; dữ liệu hiện có 76 section, 1.064 public question ID duy nhất và 1.092 topic tagging. `phan-1` và `phan-2` lặp ở cả 38 đề.

Frontend tự tạo session, giữ answer trong `localStorage`, chấm điểm bằng `scoring.ts`, lưu `v2_result_*`, rồi best-effort sync bài thi của user đăng nhập tới `POST /api/exams/attempts`. Backend V13 chỉ lưu payload client trong `exam_v2_attempts`; chưa có question bank, server-issued session hay backend scoring.

Mục tiêu là đưa question bank vào dataset có version, để backend phát hành session, giữ answer key khỏi safe payload, chấm điểm authoritative, lưu immutable result snapshot và hỗ trợ anonymous/local fallback mà không làm sai lịch sử cũ.

## 2. Quyết định kiến trúc

1. Dùng versioned dataset và staging + atomic active pointer; không import từng đề vào runtime đang active.
2. Catalog chỉ trả metadata. Chỉ `POST /api/exam-sessions` chọn và trả tập `SafeQuestion[]` cố định.
3. Session được lưu trong database, không dùng signed descriptor làm nguồn trạng thái chính.
4. Chỉ `TIMED_ORIGINAL` và `CUSTOM_MOCK` có whole-submit và chỉ authenticated submission mới tạo `exam_v2_attempts`.
5. Practice chỉ lưu session/check result, không tạo attempt trong phase đầu.
6. Backend chấm từ session snapshot; submit không được gửi score, correctness, mode, duration, refs hay server timestamps.
7. Mỗi attempt có immutable result snapshot. Result/history/retry snapshot v2 không join current answer key.
8. `exam_submission_receipts` là nguồn idempotency duy nhất và mỗi session có tối đa một successful receipt.
9. Static fallback là transitional, vẫn lộ answer key và không được mô tả là bảo mật hoàn toàn.
10. Không sửa V13 và không dùng hai bảng legacy `exam_attempts`, `exam_answers`.

## 3. Mode policy matrix

| Mode | Check từng câu | Submit toàn bài | Tạo `exam_v2_attempts` | Lưu server session |
|---|---:|---:|---:|---:|
| `TIMED_ORIGINAL` | Không | Có | Có, nếu authenticated | Có |
| `CUSTOM_MOCK` | Không | Có | Có, nếu authenticated | Có |
| `FREE_PRACTICE` | Có | Không | Không | Có |
| `TOPIC_PRACTICE` | Có | Không | Không | Có |
| `RETRY_WRONG` | Có | Không | Không | Có |
| `CUSTOM_PRACTICE` | Có | Không | Không | Có |

## 4. Database design

### 4.1. Bảng dự kiến

| Bảng | Vai trò chính |
|---|---|
| `exam_datasets` | Dataset version, aggregate hash, trạng thái staging/active/retired và build metadata. |
| `exam_import_runs` | Audit mỗi dry-run/import/promote, counts, source commit và warning/error report. |
| `exam_runtime_state` | Singleton active dataset pointer. |
| `exam_definitions` | Metadata đề theo dataset, content hash, visibility và verification. |
| `exam_sections` | Section thuộc một exam definition. |
| `exam_questions` | Nội dung câu hỏi và public question ID theo dataset. |
| `exam_mcq_options` | Options MCQ và correct flag chỉ dùng nội bộ backend. |
| `exam_tf_statements` | Statements T/F và truth value chỉ dùng nội bộ backend. |
| `exam_question_sources` | Source references, count do importer audit động. |
| `exam_topics` | Canonical topic metadata. |
| `exam_question_topics` | Mapping question-topic và raw topic trace. |
| `exam_sessions` | Server-issued session, ownership, deadline, status và anonymous result tạm thời. |
| `exam_session_questions` | Question instances, safe snapshot, answer key snapshot và checked result. |
| `exam_submission_receipts` | Idempotency, recovery status và association tới attempt. |
| `exam_v2_attempts` | Bảng V13 hiện có, lưu authenticated immutable result/history. |

ID nội bộ mới dùng `BINARY(16)` theo convention `UuidBytes`. Public IDs dùng `VARCHAR` và không làm primary key.

### 4.2. Keys và constraints

`exam_definitions`:

- `UNIQUE (dataset_id, exam_id)`.

`exam_sections`:

- FK đơn `exam_definition_id -> exam_definitions.id`.
- `UNIQUE (exam_definition_id, section_id)`.
- `UNIQUE (exam_definition_id, order_in_exam)`.

`exam_questions`:

- Có `dataset_id`, `exam_section_id`, `question_id`, `order_in_section`.
- FK đơn `exam_section_id -> exam_sections.id`.
- `UNIQUE (dataset_id, question_id)`.
- `UNIQUE (exam_section_id, order_in_section)`.
- Không thêm `exam_definition_id` vào question.

`exam_mcq_options` và `exam_tf_statements`:

- FK tới internal question ID.
- `UNIQUE (question_id, option_key)`.
- `UNIQUE (question_id, statement_key)`.

Hai dataset được phép dùng lại cùng public question ID; cùng dataset thì không. Section ID được scope theo exam nên `phan-1`, `phan-2` được lặp giữa các đề.

### 4.3. Invariant được enforce ở đâu

DB baseline enforce row ownership cơ bản bằng FK đơn và các unique trên. Vì chưa biết TiDB production version, plan không khẳng định composite FK enforce `exam_questions.dataset_id` khớp dataset của section.

Importer và service phải join `question -> section -> exam -> dataset`, từ chối mismatch và chạy audit zero-mismatch trước promote. Direct SQL có thể vượt qua invariant này nếu bỏ qua service/importer; đó là rủi ro được ghi nhận. Chỉ cân nhắc composite FK sau smoke test trên engine/version thật.

### 4.4. Visibility và verification

- `visibility_status`: `PUBLIC`, `HIDDEN`.
- `verification_status`: `VERIFIED`, `REVIEW_REQUIRED`.
- Public API luôn lọc `PUBLIC`; `view=REVIEWABLE` không bao gồm `HIDDEN`.
- Explanation được phép null hoặc empty và không phải API error.

## 5. Dataset và import lifecycle

Importer đọc đồng thời:

- `data/exams/*.json`;
- `exams-manifest.json`;
- `topic-index.json`;
- `topic-raw-mapping.json`;
- `exam-dataset-build.json`.

`topic-index.json` cung cấp runtime association; `topic-raw-mapping.json` dùng để xác minh canonical/raw mapping consistency. Mọi count được tính từ dữ liệu thực tế, không hardcode 1.064 source rows.

Lifecycle:

1. Chạy bằng profile importer riêng, hỗ trợ dry-run và không tự chạy trong production profile.
2. Đọc và validate toàn bộ source/artifact trước khi promote.
3. Import vào dataset `STAGING`; dữ liệu active không bị sửa.
4. Audit schema, refs, duplicate IDs, dataset-section invariant, topic mapping và source hashes.
5. Chỉ khi không có blocking error mới đổi `exam_runtime_state.active_dataset_id` trong transaction ngắn và đặt dataset mới `ACTIVE`.
6. Lỗi ở đề cuối giữ nguyên active pointer và runtime dataset cũ.
7. Aggregate hash đã tồn tại trả `SKIPPED`, không tạo dataset hoặc update hàng loạt.
8. Dataset cũ được giữ trong phase đầu để bảo vệ active sessions, H1 retry và recovery queue.

Mỗi lần chạy ghi `exam_import_runs`: import ID, target dataset/hash, `DRY_RUN|RUNNING|VALIDATED|PROMOTED|FAILED|SKIPPED`, started/finished time, source commit nếu có, tổng/changed/skipped counts và warning/error report JSON. Import run là audit record; content equality vẫn dựa trên aggregate hash.

## 6. Deterministic dataset build

### 6.1. Pin implementation

- Node pipeline: `canonicalize@3.0.0`.
- Java importer: `io.github.erdtman:java-json-canonicalization:1.1`.
- Không tự viết RFC 8785 canonicalizer.
- Bất kỳ upgrade nào phải tăng `buildAlgorithmVersion` và pass lại shared corpus.

### 6.2. Strict raw validation

RFC 8785 canonicalizer không phải duplicate-key detector. Pipeline bắt buộc:

```text
raw UTF-8 JSON bytes
-> strict duplicate-property validator
-> parse I-JSON
-> RFC 8785 canonicalization
-> SHA-256
```

Node pin `json-dup-key-validator@1.0.3` và gọi validator trên raw text trước khi nhận parsed value; không dùng `JSON.parse` làm bước đầu. Java importer dùng Jackson 3 `StreamReadFeature.STRICT_DUPLICATE_DETECTION` trên raw bytes trước tree/data binding. Cả hai đều revalidate raw sources; verified hashes không thay thế strict parsing. BOM, duplicate property, parse error, NaN/Infinity hoặc number không hợp lệ theo I-JSON/JCS làm build/import fail.

### 6.3. Hash algorithm

1. Sort source theo relative path chuẩn hóa `/`.
2. Canonicalize từng source theo RFC 8785 và hash UTF-8 bytes bằng SHA-256.
3. Sinh ba artifact; canonicalize và hash từng artifact.
4. Tạo aggregate input deterministic gồm `hashSchemaVersion`, `buildAlgorithmVersion`, sorted source path/hash và artifact name/hash.
5. Canonicalize aggregate input rồi SHA-256 để có `aggregateHash`.
6. Sinh `exam-dataset-build.json` sau cùng; metadata không hash chính nó.

Metadata tối thiểu:

```json
{
  "buildId": "audit-only-uuid",
  "generatedAt": "audit-only timestamp",
  "hashAlgorithm": "SHA-256",
  "canonicalization": "RFC8785",
  "hashSchemaVersion": 1,
  "buildAlgorithmVersion": 1,
  "aggregateHash": "...",
  "sources": [],
  "artifacts": {}
}
```

`buildId`, `generatedAt`, absolute path, machine name, user name và metadata file không tham gia aggregate hash. Content equality dùng `aggregateHash`, không dùng build ID.

### 6.4. Shared canonicalization corpus

Node và Java đọc cùng một fixture corpus có raw input, expected canonical UTF-8 bytes/hex và expected SHA-256. Corpus gồm RFC sample number/literal/string, UTF-16 property order, nested object/array, escapes/Unicode, negative zero, number boundaries và raw duplicate-property rejection. CI fail nếu hai runtime khác bytes/hash. Test duplicate key phải nhận raw text, không nhận object đã parse.

## 7. Immutable result snapshot

### 7.1. Authenticated attempt

Tái sử dụng V13:

- `answers_json` là raw answers canonical của submission.
- `result_json` là immutable result snapshot v2.
- `config_json`, `question_refs_json`, `source_exam_ids_json` giữ compatibility nếu cần.
- `question_snapshots_json` chỉ phục vụ legacy compatibility.

Không thêm `raw_answers_json` hay `result_snapshot_json` trùng nghĩa.

Attempt bổ sung ở migration tương lai:

- `snapshot_schema_version`;
- `score_authority`;
- `timing_authority`;
- `submission_origin`;
- `scoring_version`;
- `dataset_version`;
- `exam_content_hash`.

Không thêm `client_submission_id` hoặc `submission_hash` vào attempt.

### 7.2. Snapshot schema v2

Root gồm `snapshotSchemaVersion: 2`, session metadata, dataset/scoring/content version, authority fields, server timestamps và summary. Mỗi reviewed question giữ:

- public question ID và question instance ID;
- type, question text, options/statements;
- user answer và correct answer tại thời điểm chấm;
- correctness, points và `BLANK|PARTIAL|COMPLETE`;
- explanation nullable;
- source references và topic references.

History/detail trả snapshot, không join current answer key. Re-import H2 không thay đổi H1 result. Retry snapshot v2 dùng H1 snapshot.

### 7.3. Anonymous result

Anonymous không tạo attempt. Temporary immutable result chỉ nằm tại `exam_sessions.result_json`; receipt không lưu result snapshot.

Anonymous submit thành công:

- session `SUBMITTED`;
- `exam_sessions.result_json` chứa snapshot v2;
- receipt `SUCCESS`, `success_slot=1`, `attempt_id=null`.

Idempotent retry đi từ receipt tới session rồi đọc `session.result_json`. Session result và receipt có thể cleanup cùng nhau khi hết retention.

## 8. Safe DTO và frontend adapters

Bank type hiện có chứa `correctOptionId`, `statements[].isTrue` và `explanation`, nên không được tái dùng làm pre-check API response.

- `SafeQuestion`: question text và choices/statements, không answer key, correctness hoặc explanation.
- `CheckedQuestionResult`: user answer, correct answer, correctness, points và explanation sau practice check hợp lệ.
- `ReviewedQuestion`: immutable review item trong snapshot.

Backend dùng DTO whitelist, không serialize JPA entity. Frontend giữ legacy/bank types riêng, dùng `LegacyResultAdapter` và `ResultSnapshotV2Adapter` có runtime schema validation, rồi mới tạo normalized view model cho result/history/retry.

Legacy original result có thể tải current JSON như compatibility fallback và phải có nhãn legacy. Legacy custom tiếp tục dùng `questionSnapshots` hiện có.

## 9. Session lifecycle và persistence

Status duy nhất:

- `IN_PROGRESS`;
- `COMPLETED`;
- `SUBMITTED`;
- `EXPIRED`;
- `CANCELLED`.

Backend cố định mode, dataset/scoring version, question instances, scoring config, started time và deadline. `exam_session_questions` lưu safe snapshot, answer key snapshot và checked result để active session không phụ thuộc current bank.

Server resume trả question set, dataset/scoring version, deadline, status và checked practice results. LocalStorage chỉ giữ `currentIndex`, flags, unchecked/unsubmitted answers và UI draft cần thiết; không khôi phục dialog/sheet đang mở. Không gọi API mỗi lần chọn answer.

## 10. Catalog và session API

### 10.1. Catalog

- `GET /api/exams?view=VERIFIED|REVIEWABLE`: metadata list.
- `GET /api/exams/{examId}`: metadata, duration, count, section summary, visibility/verification warnings.
- `GET /api/exams/topics`: slug/title/count/type/difficulty breakdown.
- `POST /api/exams/custom/preview`: normalized config, availability/breakdown và dataset version.

Không endpoint nào ở trên trả full questions, question refs hoặc answer key.

### 10.2. Session create/resume

- `POST /api/exam-sessions`: nhận mode và scope/config hợp lệ; backend filter, dedupe, balance/shuffle/select rồi trả fixed `SafeQuestion[]`.
- `GET /api/exam-sessions/{sessionId}`: authorization, resume safe set/status/deadline/checked results; nếu submitted trả result reference hoặc anonymous session result phù hợp.

`RETRY_WRONG` tạo session từ source attempt snapshot, không tải current bank. Custom create gửi filter/config, không gửi question refs.

## 11. Anonymous authorization

Anonymous token là opaque high-entropy capability token:

- Chỉ raw token trong create-session response đầu tiên.
- Backend lưu SHA-256 hash và so sánh constant-time.
- Gửi qua `X-Exam-Session-Token` cho resume/check/complete/submit.
- Không đặt trong URL/query, log, snapshot, receipt result hoặc attempt.
- Authenticated session dùng JWT owner, không dùng token.
- Token không claim anonymous session vào account đăng nhập sau đó.

Frontend lưu `exam_session_token_{sessionId}` trong `localStorage` để phù hợp reload/resume hiện tại. Mất token thì server resume không còn, dù local draft có thể còn. Xóa token khi local session hết retention hoặc user clear local data. Web storage có rủi ro XSS; token không phải credential tài khoản hay biện pháp chống XSS.

`SecurityConfig` phải allow `X-Exam-Session-Token` trong CORS; cấu hình hiện tại chỉ allow `Authorization`, `Content-Type`, `Accept`.

## 12. Practice check và completion

- `POST /api/exam-sessions/{sessionId}/questions/{questionInstanceId}/check` chỉ cho practice.
- Question phải thuộc session và answer phải complete: MCQ có một selection, T/F đủ mọi statement.
- Check đầu tiên lưu immutable checked result và khóa question.
- Recheck cùng canonical answer trả cached result; answer khác trả 409.
- Timed/mock không gọi check.

Khi check hợp lệ làm `checkedQuestionCount == totalQuestionCount`, backend tự chuyển `IN_PROGRESS -> COMPLETED` và trả normalized practice summary.

`POST /api/exam-sessions/{sessionId}/complete` chỉ kết thúc practice sớm:

- idempotent;
- câu chưa check là `UNTOUCHED`;
- không tạo attempt;
- gọi lại trả cùng summary;
- sau completed không check câu mới;
- timed/mock gọi complete bị từ chối.

## 13. Submit array contract

```json
{
  "clientSubmissionId": "uuid",
  "answers": [
    { "questionInstanceId": "qi_001", "questionType": "mcq", "selected": "B" },
    { "questionInstanceId": "qi_002", "questionType": "mcq", "selected": null },
    {
      "questionInstanceId": "qi_025",
      "questionType": "true_false",
      "selected": { "a": true, "b": null, "c": false, "d": null }
    }
  ]
}
```

Frontend có thể giữ `Record` nội bộ nhưng chuyển thành array tại API boundary. Backend dùng `Set` phát hiện duplicate instance trước khi tạo Map. Payload phải chứa đúng tập instance; duplicate, missing, extra, unknown, sai type hoặc shape bị từ chối. MCQ null và T/F partial hợp lệ khi submit, không phải malformed. Backend tự suy ra `BLANK`, `PARTIAL`, `COMPLETE`.

Submit không nhận score, correctness, correct answer, mode, duration, refs, scoring policy, started time hoặc submitted time từ client.

## 14. Idempotency receipt

`exam_submission_receipts` là nguồn sự thật duy nhất cho:

- `client_submission_id`;
- canonical `submission_hash`;
- session/owner;
- receipt status và `error_code`;
- nullable unique `attempt_id`;
- `success_slot`.

`client_submission_id` là UUID có unique index toàn cục. Canonical submission hash không chứa client ID; hash input version 1 gồm `sessionId`, contract version và answers được sort theo `questionInstanceId`, với T/F statement keys chuẩn hóa `a,b,c,d`. Vì vậy hai client IDs gửi cùng semantic payload cho cùng session tạo cùng hash dù thứ tự array khác nhau.

Receipt status duy nhất: `RECEIVED`, `PROCESSING`, `SUCCESS`, `SUPERSEDED`, `FAILED_RETRYABLE`, `FAILED_PERMANENT`, `VERSION_MISMATCH`, `AUTH_MISMATCH`. Chỉ `SUCCESS` có `success_slot=1`; các trạng thái khác để `NULL`.

Quan hệ một chiều `exam_submission_receipts.attempt_id -> exam_v2_attempts.id`. Không có FK ngược. Một receipt liên kết tối đa một attempt; backend-scored attempt là write-once.

## 15. One-successful-submission invariant

Mỗi timed/mock session có tối đa một successful submission dù client dùng nhiều `clientSubmissionId`.

- `success_slot TINYINT NULL`, chỉ nhận `NULL` hoặc `1`.
- Successful receipt đặt `1`.
- `UNIQUE (session_id, success_slot)` cho phép nhiều failed/retry receipt có `NULL`, nhưng chỉ một success.
- Khai báo `CHECK (success_slot IS NULL OR success_slot = 1)` nếu engine đích enforce CHECK; service luôn enforce cùng rule và engine smoke test là gate bắt buộc.
- Smoke test engine đích phải chứng minh hai `NULL` được phép và value `1` thứ hai bị unique violation.
- Existing `UNIQUE (user_id, session_id)` của V13 là lớp bảo vệ bổ sung cho authenticated attempt.

Nếu session đã thành công:

- cùng canonical submission hash: trả result cũ, kể cả client ID khác, không tạo receipt mới;
- hash khác: 409 `SESSION_ALREADY_SUBMITTED`.

Client ID đã tồn tại với session/hash khác trả 409 `IDEMPOTENCY_CONFLICT`.

## 16. Receipt acquisition và scoring lifecycle

Không để receipt biến mất khi scoring transaction rollback.

### Bước A - receipt acquisition transaction ngắn

1. Canonicalize transport payload và tính submission hash.
2. Kiểm tra client ID và ownership.
3. Tạo hoặc lấy receipt `RECEIVED`.
4. Commit receipt độc lập trước scoring.

### Bước B - scoring transaction

1. Lock session bằng `SELECT ... FOR UPDATE` hoặc pessimistic equivalent.
2. Kiểm tra successful receipt hiện có.
3. Validate exact instance set, deadline/recovery policy và answer shapes.
4. Backend score từ session answer-key snapshot.
5. Authenticated: tạo immutable attempt. Anonymous: ghi `exam_sessions.result_json`.
6. Gắn `attempt_id` nếu có; đặt receipt `SUCCESS`, `success_slot=1`; chuyển session `SUBMITTED`.
7. Commit.

Domain validation lỗi được bắt trong scoring boundary, cập nhật `FAILED_PERMANENT` và commit error code thay vì ném exception làm rollback receipt. Lỗi hệ thống làm scoring transaction rollback; error finalizer dùng transaction ngắn mới (`REQUIRES_NEW` hoặc transaction template tương đương) để đặt `FAILED_RETRYABLE`. Vì receipt đã commit ở bước A, không lỗi scoring nào được làm mất receipt. Retry cùng client ID tiếp tục receipt cũ. Session row lock tuần tự hóa race; unique success slot là lớp bảo vệ cuối.

Nếu request thứ hai đã có receipt `RECEIVED` nhưng request thứ nhất thắng race: cùng hash thì receipt thứ hai thành `SUPERSEDED` và response đọc result từ successful receipt/session; khác hash thì receipt thứ hai thành `FAILED_PERMANENT` với `SESSION_ALREADY_SUBMITTED`. Receipt thứ hai không gắn cùng `attempt_id`, giữ invariant `attempt_id` nullable unique.

## 17. Backend scoring

Backend lấy answer key, scoring rules và total score từ `exam_session_questions`/session scoring snapshot. MCQ blank nhận 0; T/F partial được chấm theo ladder hiện hành của dataset/scoring version, không coi null là malformed. Backend tạo per-question status, correctness, points, section totals và total score rồi ghi snapshot trong cùng successful scoring transaction.

Scoring parity fixture phải bao phủ MCQ đúng/sai/blank, T/F từ 0 đến 4 statements đúng, partial/blank và rounding. `scoring_version` thay đổi khi rule hoặc rounding thay đổi; attempt lịch sử không re-score tự động.

## 18. Timer, deadline và grace

Backend tạo `startedAtServer`, `deadlineAt`, `submittedAtServer`. Frontend timer chỉ phục vụ hiển thị. Server quyết định đúng hạn bằng server clock.

Grace lấy từ `exam.session.submit-grace-seconds`, mặc định dự kiến 10 giây và không hardcode rải rác. Submit trong deadline + grace có `timingAuthority=SERVER`; sau đó đi late recovery, không giả là đúng hạn.

## 19. Late và static recovery

Authenticated server-issued late submission được xác minh:

- `scoreAuthority=BACKEND`;
- `timingAuthority=CLIENT_UNVERIFIED`;
- `submissionOrigin=SERVER_ISSUED_LATE`.

Verified static fallback:

- `scoreAuthority=BACKEND`;
- `timingAuthority=CLIENT_UNVERIFIED`;
- `submissionOrigin=CLIENT_FALLBACK`.

Hai loại trên có thể tạo authenticated attempt và xuất hiện trong history với nhãn “Được chấm bởi hệ thống - thời gian nộp chưa được xác minh”. Mọi leaderboard, streak hoặc thống kê yêu cầu bài đúng hạn phải lọc đồng thời:

```text
timingAuthority = SERVER
AND submissionOrigin = SERVER_ON_TIME
```

Nếu H1 không còn xác minh được: local result giữ `LOCAL_FALLBACK`, receipt `VERSION_MISMATCH`, không tạo attempt và không dùng H2 để chấm H1.

Ba authority field độc lập: `scoreAuthority` trả lời ai chấm, `timingAuthority` trả lời thời gian có được server xác minh, `submissionOrigin` trả lời submission bắt nguồn từ flow nào.

## 20. Static fallback và queue

Queue item tối thiểu giữ client ID, local session, owner-at-creation, mode, exam/session descriptor, raw answers, client timestamps, dataset version/content hash, local result, retry status/count và error code.

- Chỉ sync vào account nếu item được tạo khi đúng user đã authenticated; anonymous không tự claim sau login.
- Backend chỉ nâng thành backend-scored khi xác minh đúng owner, question set và version.
- Static asset vẫn chứa answer key; rollout chỉ coi đây là transitional availability fallback.

## 21. Result, history và retry compatibility

- Authenticated result/history detail đọc `exam_v2_attempts.result_json` snapshot.
- Anonymous submitted result đọc `exam_sessions.result_json` trong retention window.
- Receipt không chứa result snapshot.
- History chỉ gồm timed original/custom mock attempts, kể cả late/verified fallback có nhãn authority; practice không xuất hiện.
- Retry snapshot v2 dùng reviewed questions của snapshot.
- Legacy adapter giữ khả năng mở V13 payload hiện tại; legacy original current-bank fallback phải được ghi rõ là không immutable.

## 22. Retention và cleanup

Initial configurable defaults:

- Anonymous in-progress/expired: 7 ngày sau deadline hoặc last activity.
- Anonymous submitted và receipt liên quan: 7 ngày.
- Authenticated completed practice/session: 30 ngày.
- Authenticated submitted session/receipt: 30 ngày sau attempt creation; attempt không bị xóa theo session.
- Attempt snapshot theo policy account/history, không cascade từ session.
- Superseded dataset giữ vô thời hạn trong phase đầu; chỉ thiết kế cleanup sau khi có retention chính thức và không còn active session/recovery reference.

Cleanup chạy theo `expires_at`, xóa session questions cùng session, không xóa attempt snapshot. Retention dài hạn là open question trước production cleanup.

## 23. Migration strategy

- Không sửa `V13__exam_v2_attempts.sql` và không dùng `exam_attempts`/`exam_answers` legacy.
- Trước mỗi implementation phase phải liệt kê migration hiện có; nếu V13 vẫn là cuối thì dự kiến V14 cho dataset/question bank, V15 cho sessions/receipts và V16 cho attempt authority metadata.
- Migration additive trước, code read/write sau feature flag; không drop legacy columns trong rollout đầu.
- `spring.jpa.hibernate.ddl-auto=validate` tiếp tục bắt entity/schema mismatch; Flyway là nguồn schema duy nhất.
- Package/compile trên MySQL-compatible local là gate tối thiểu. FK/CHECK, multiple-NULL unique và pessimistic row-lock race phải smoke-test trên đúng production engine/version trước promote.
- Rollback dataset bằng active pointer; rollback application bằng feature flag. Không rollback migration đã apply bằng cách sửa file cũ.

## 24. Rollout phases

| Phase | Scope và components dự kiến | Migration impact | Tests/gate | Rollback |
|---|---|---|---|---|
| 0 | Duyệt ba tài liệu kiến trúc. | Không migration. | Architecture review hoàn tất. | Không có runtime change. |
| 1 | Dataset entities/repositories, build metadata, importer dry-run/staging/promote. | V14 question-bank/dataset tables. | Hash corpus, importer atomicity, engine FK/CHECK smoke. | Giữ active pointer ở dataset cũ; drop staging dataset lỗi. |
| 2 | Catalog/topic/custom preview controllers, services và Safe DTO. | Không hoặc index-only migration nếu profiling chứng minh cần. | Hidden/leakage, DB/JSON parity, API contract tests. | Feature flag quay về static catalog. |
| 3 | Session/session-question/receipt entities, resume, token filter, practice check/complete. | V15 session và receipt tables. | Ownership/token/CORS, lifecycle, success-slot và race tests. | Tắt session API flag; static flow còn nguyên. |
| 4 | Backend scoring, receipt acquisition/scoring services, immutable snapshot. | V16 authority/version columns cho attempt. | Scoring parity, idempotency/race, snapshot immutability. | Không ghi attempt mới qua flow mới; giữ legacy read adapter. |
| 5 | Frontend API client, safe types, result adapters, history/retry integration. | Không migration dự kiến. | Build, unit adapter fixtures, browser E2E và legacy result QA. | Feature flag trở về static/local-first frontend. |
| 6 | Recovery queue, late/static recovery, authority-aware history/statistics queries. | Index/status migration chỉ khi cần và dùng version tiếp theo. | H1/H2 mismatch, ownership, history label và stats exclusion. | Tắt queue sync; local result vẫn mở được. |
| 7 | Ổn định một release, tắt legacy POST attempts, cân nhắc bỏ static answer-key copy. | Không sửa migration cũ; cleanup dùng migration mới nếu được duyệt. | Telemetry, regression suite và rollback rehearsal. | Bật lại legacy endpoint/static copy trong release rollback window. |

Mỗi phase chỉ tạo migration version tiếp theo tại thời điểm triển khai. Không sửa V13; hiện dự kiến V14, V15, V16 như bảng trên.

## 25. Testing matrix

### Dataset/import

- Audit động 38 đề, 76 section và question/tagging counts.
- Hai dataset dùng cùng question ID; cùng dataset trùng ID bị từ chối.
- Dataset-section mismatch bị importer/service từ chối.
- Section ID lặp giữa exam hợp lệ.
- Artifact tampering fail; lỗi đề cuối không đổi active pointer; cùng hash trả `SKIPPED`.
- Node/Java cho cùng canonical bytes/hash; duplicate raw property bị từ chối trước parse.

### Catalog/security

- Hidden exam không xuất hiện; catalog không trả questions/refs.
- Safe payload không có answer key/explanation.
- Check chỉ trả answer/explanation của câu đã check.
- Anonymous token thiếu/sai/của session khác bị từ chối; token không vào log/snapshot.
- CORS preflight cho phép custom token header.

### Practice

- Check câu cuối tự complete; complete sớm để phần còn lại `UNTOUCHED`.
- Complete lần hai trả cùng summary; practice không tạo attempt.
- Completed session không check câu mới; timed mode không complete/check.

### Submit/scoring

- MCQ null và T/F partial hợp lệ.
- Duplicate array item, missing/extra/unknown, sai shape/type bị từ chối.
- Client sửa mode/duration/refs không có tác dụng.
- Grace policy và scoring parity với scoring hiện tại.

### Idempotency/race

- Cùng client ID/hash trả result cũ; khác payload trả conflict.
- Hai client ID cùng payload chỉ một successful receipt; payload khác chỉ một success và request còn lại 409.
- Receipt acquisition tồn tại sau scoring failure; retry tiếp tục receipt retryable.
- Nhiều `NULL` success slot được phép, chỉ một `1`; một receipt không tạo hai attempts.
- Legacy endpoint không ghi đè backend-authoritative attempt.

### Snapshot/history/recovery

- Submit H1, import H2, result/history/retry H1 không đổi.
- Legacy result adapter mở được fixture thật đã ẩn danh.
- Anonymous result chỉ ở session; authenticated result chỉ ở attempt; receipt không có result snapshot.
- Explanation null không lỗi.
- Version mismatch không tạo attempt; late/fallback hiện history nhưng bị loại khỏi server-timed statistics, leaderboard và streak.

## 26. Acceptance criteria

1. Runtime chỉ nhìn thấy một active dataset hoàn chỉnh.
2. Catalog không lộ question set; SafeQuestion không lộ answer key/explanation.
3. Backend-issued session là authority cho mode, refs, scoring và timing.
4. Practice auto/manual completion đúng policy và không tạo attempt.
5. Submit array phân biệt valid blank/partial với malformed payload.
6. Mỗi session có tối đa một successful receipt/attempt dưới concurrent race.
7. Receipt acquisition không rollback mất cùng scoring failure.
8. Anonymous result chỉ ở session; authenticated result chỉ ở attempt; receipt không lưu result snapshot.
9. H1 snapshot/history/retry bất biến sau H2 import.
10. Dataset hash deterministic, không self-reference và được Node/Java cross-verified.
11. Raw duplicate property bị bắt trước `JSON.parse`.
12. Hidden exam không qua public API.
13. Late/fallback authority hiển thị đúng và không làm bẩn server-timed statistics.
14. Static fallback được mô tả đúng là transitional và version-aware.

## 27. Risks và deferred

- Target TiDB version/FK/CHECK/locking chưa xác minh: smoke test migration và unique-null/row-lock behavior trước phase 1/3.
- Session questions tăng nhanh: theo dõi storage, indexes và cleanup; chưa tách activity analytics.
- Static assets tiếp tục lộ answer key đến phase 7.
- Topic mapping hiện là heuristic, không tuyên bố taxonomy học thuật tuyệt đối.
- Anonymous capability token trong localStorage chịu rủi ro XSS.
- Backend re-score lịch sử bằng answer key mới bị cấm; mọi migration lịch sử phải là task riêng có version/policy.
- Anonymous claim, practice activity table, delete backend history và long-term dataset cleanup được deferred.

## 28. Open questions

1. Phiên bản MySQL/TiDB production thật.
2. Hành vi FK/CHECK/pessimistic locking/unique-multiple-NULL trên đúng engine đích.
3. Các shape `result_json` thực tế trong production; cần fixture đã ẩn danh trước khi khóa adapter.
4. Retention dài hạn cho sessions, receipts và superseded datasets.
