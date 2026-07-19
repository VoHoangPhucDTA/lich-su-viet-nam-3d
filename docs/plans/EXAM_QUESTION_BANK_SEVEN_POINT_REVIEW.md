# Review kiến trúc ngân hàng đề thi

## Phạm vi đối chiếu

Review dựa trên frontend exam tại `frontend/src/pages/exams`, `frontend/src/lib/exam`, `frontend/src/types/exam.ts`, backend package `backend/src/main/java/com/lichsuvn/backend/exam`, migration V13 và pipeline `data/exams`/`frontend/scripts`.

Kết quả audit dữ liệu hiện tại: 38 đề, 76 section, 1.064 public question ID duy nhất; `phan-1` và `phan-2` đều xuất hiện 38 lần. Manifest có 38 entry, 23 đề publish sạch; topic index có 32 topic và 1.092 tagging.

## Seven-point review

| STT | Nội dung | Kết luận | Bằng chứng source | Quyết định cuối | Section plan cập nhật |
|---:|---|---|---|---|---|
| 1 | Practice attempt policy | **CONFIRMED WITH CHANGES** | `ExamV2SessionPage.tsx:76` và `ExamCustomSessionPage.tsx:483-484` chỉ lưu/sync timed original và custom mock. `ExamPracticePage.tsx:241,397-401`, `ExamTopicPracticePage.tsx:227,405-409`, `ExamRetryWrongPage.tsx:329,567` chỉ kết thúc bằng page state. Tuy nhiên `ExamAttemptService.java:31-37` vẫn cho phép `luyen_tap`, `on_chu_de`, `custom_practice` ở legacy attempt API. | Chỉ `TIMED_ORIGINAL` và `CUSTOM_MOCK` có thể tạo attempt, và chỉ khi authenticated. Mọi practice là session-only; backend mới phải enforce policy thay vì chỉ dựa vào frontend. | 2, 3, 9, 12, 23, 24 |
| 2 | Resume session API | **CONFIRMED WITH CHANGES** | `useSessionV2.ts:28-42,104-138` lưu/resume timed session trong `v2_session_{examId}` với answers, flags và current index. `customSessionStorage.ts:9,39-70` lưu custom snapshots/practice state. Free/topic/retry dùng page state và không có server resume. Backend hiện chỉ có attempt endpoints trong `ExamAttemptController`. | Thêm `GET /api/exam-sessions/{sessionId}`. Server giữ fixed questions/version/deadline/status/checked results; localStorage giữ navigation, flags và unchecked drafts. Không gọi API mỗi selection. | 9, 10, 11, 21, 23 |
| 3 | Blank/partial submit | **CONFIRMED WITH CHANGES** | `questionState.ts:16-41` phân biệt any/complete cho MCQ và T/F; T/F complete khi đủ statements. `exam.ts:255-267` cho phép MCQ null và T/F values null. Frontend state hiện dùng `Record<string, AnswerEntry>` ở `exam.ts:275`. | Wire contract dùng một array duy nhất. MCQ null và T/F partial hợp lệ khi whole-submit; service dùng `Set` bắt duplicate. Practice check yêu cầu complete answer. | 12, 13, 23, 24 |
| 4 | Late submit/recovery | **CONFIRMED WITH CHANGES** | `useSessionV2.ts:286` lưu local result trước best-effort backend sync; `ExamV2SessionPage.tsx:76` và `ExamCustomSessionPage.tsx:483-484` sync không chặn result flow. Backend V13 tin `submittedAt`, duration và score từ client (`ExamAttemptService.java:62-77`). | Giữ local result/queue khi timeout hoặc backend lỗi. Late verified và static verified có authority rõ ràng; version mismatch không tạo official attempt và không chấm H1 bằng H2. | 17, 18, 19, 20, 23, 24 |
| 5 | Catalog/session responsibility | **CONFIRMED WITH CHANGES** | `manifestLoader.ts:15-42` tải metadata manifest. `examLoader.ts:38-60` tải full JSON. `ExamCustomCreatePage.tsx:250-276` và `ExamTopicPracticePage.tsx:251` tải refs/full exams rồi chọn câu ở client. `topicIndexLoader.ts:20` tải topic refs. | Catalog/topic/custom preview chỉ trả metadata/count. Chỉ session create filter/dedupe/select và trả fixed `SafeQuestion[]`; frontend không tải toàn bank để chọn custom/topic. | 2, 8, 10, 19, 22, 23 |
| 6 | Safe types/result adapters | **CONFIRMED WITH CHANGES** | `exam.ts:103,110,121` chứa `isTrue`, `explanation`, `correctOptionId`. `examAttemptSync.ts:79-94` cast trực tiếp backend JSON sang `ExamResultV2`. `ExamV2ResultPage.tsx:628-640` và `ExamRetryWrongPage.tsx:359-375` dùng snapshot cho custom nhưng tải current exam JSON cho original. | Tách `SafeQuestion`, `CheckedQuestionResult`, `ReviewedQuestion`; backend DTO whitelist. Snapshot v2 có schema version; legacy và v2 dùng adapter riêng. Retry v2 dùng snapshot. | 7, 8, 20, 23, 24 |
| 7 | DB constraints/import inputs | **CONFIRMED WITH CHANGES** | Audit `data/exams/*.json` cho thấy 38 đề, 76 section, `phan-1`/`phan-2` lặp 38 lần và 1.064 question IDs không trùng. `build-exams-manifest.mjs:40-85` và `build-topic-index.mjs:46-110` sinh ba artifact nhưng chưa có shared build hash/metadata. | Unique question ID theo dataset; section ID theo exam. FK đơn bảo vệ ownership cơ bản, importer/service enforce dataset-section invariant. Import đủ source + ba artifact + deterministic build metadata và atomic promote. | 4, 5, 6, 22, 23, 24 |

## Implementation-readiness refinements

| STT | Refinement | Kết luận | Bằng chứng source | Quyết định cuối | Section plan cập nhật |
|---:|---|---|---|---|---|
| 1 | Dataset-scoped question ID | **CONFIRMED WITH CHANGES** | Current dataset có 1.064 unique public IDs, nhưng relation hiện chỉ tồn tại trong JSON; `phan-1`/`phan-2` lặp giữa các exam. Production TiDB version không có trong config; backend chỉ cấu hình MySQL JDBC tại `application.properties:4`. | `UNIQUE(dataset_id, question_id)`; `UNIQUE(exam_definition_id, section_id)`. Baseline dùng FK section đơn và importer/service audit mismatch, không tuyên bố composite FK đã enforce. | 4.2, 4.3, 5, 23 |
| 2 | Receipt-owned idempotency | **CONFIRMED WITH CHANGES** | V13 chỉ có `UNIQUE(user_id, session_id)` và không có client ID/hash; `ExamAttemptService.java:48-79` hiện upsert trực tiếp attempt. Không có receipt trong source hiện tại. | Receipt là nơi duy nhất giữ client ID/hash/status/error/attempt association. FK một chiều receipt -> attempt. Receipt acquisition commit trước scoring; attempt backend-scored write-once. | 14, 15, 16, 23 |
| 3 | Practice completion lifecycle | **CONFIRMED WITH CHANGES** | Practice pages hiện dùng `finished` local state (`ExamPracticePage.tsx:241`, `ExamTopicPracticePage.tsx:227`, `ExamRetryWrongPage.tsx:329`); custom practice persists `practiceState` trong `customSessionStorage.ts:41-46`. Backend chưa có lifecycle. | Check câu cuối auto-complete; `/complete` chỉ kết thúc sớm và idempotent; unchecked là `UNTOUCHED`; completed không check mới; không attempt. | 3, 9, 12, 23 |
| 4 | Anonymous token contract | **CONFIRMED WITH CHANGES** | Frontend đang dùng localStorage cho timed/custom resume (`useSessionV2.ts:28-42`, `customSessionStorage.ts:9,50-70`). `SecurityConfig.java:67` chỉ allow ba header chuẩn. Backend attempt hiện bắt JWT principal. | Opaque token qua `X-Exam-Session-Token`, hash-only backend, constant-time compare; lưu `exam_session_token_{sessionId}` trong localStorage; không log/snapshot/claim. | 10, 11, 21, 23 |
| 5 | Submit array duplicate detection | **CONFIRMED WITH CHANGES** | Frontend state là `Record`, nhưng Spring Boot 4.0.3 (`pom.xml:8`) đi cùng Jackson 2 bean (`JacksonConfig.java:3,11-12`) và exam DTO dùng Jackson 3; không có strict duplicate setting. | Dùng answer array và service `Set` duplicate detection trước Map. Không thay global JSON parser. Blank/partial giữ semantics hiện tại. | 13, 16, 23 |
| 6 | Deterministic RFC 8785 dataset hash | **CONFIRMED WITH CHANGES** | Hai build script dùng `JSON.stringify` và chưa hash/build metadata (`build-exams-manifest.mjs:85`, `build-topic-index.mjs:97,110`). | Pin Node `canonicalize@3.0.0`, Java `java-json-canonicalization:1.1`, Node raw validator `json-dup-key-validator@1.0.3` và Jackson 3 strict duplicate detection; dùng shared corpus; aggregate hash không chứa metadata của chính nó. | 5, 6, 22, 23 |

## Các invariant bổ sung đã chốt

- Mỗi session tối đa một successful receipt, kể cả nhiều client submission IDs.
- Receipt có `success_slot NULL|1` và unique `(session_id, success_slot)`; row lock tuần tự hóa race.
- Receipt acquisition và scoring dùng hai transaction để scoring failure không xóa dấu vết receipt.
- Anonymous result chỉ ở `exam_sessions.result_json`; authenticated result chỉ ở `exam_v2_attempts.result_json`; receipt không lưu result snapshot.
- Server-timed statistics bắt buộc lọc cả `timingAuthority=SERVER` và `submissionOrigin=SERVER_ON_TIME`.
- Raw duplicate property phải bị phát hiện trước `JSON.parse`; canonicalizer không thay thế strict parser.

## CANNOT CONFIRM

1. Phiên bản MySQL/TiDB production thật.
2. Hành vi FK/CHECK/pessimistic lock/unique-multiple-NULL trên đúng engine đích.
3. Các shape `result_json` thực tế trong production database.
4. Retention dài hạn cho session, receipt và superseded dataset.
