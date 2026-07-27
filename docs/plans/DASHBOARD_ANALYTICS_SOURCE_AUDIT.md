# Personal Learning Dashboard — Analytics Source Audit

> Trạng thái: **REVIEW GATE — chỉ audit, chưa triển khai**
>
> Ngày audit: 2026-07-23
> Repository: `D:/KLTN/lich-su-viet-nam-3d`
> Route dashboard: `/exams/thong-ke`
> Dashboard commit được kiểm tra: `878571186afda4744d2a4106bd2d37502e3734ab`

## Tóm tắt kết luận

- Commit dashboard tồn tại, nằm trong lịch sử của `main`/`dashboard_exams`, và không sửa backend, migration hay database.
- Ref local `be_exams` và `origin/be_exams` đều là ancestor của HEAD đang audit. `git merge-tree` không dự đoán conflict khi hợp nhất các ref hiện có.
- Frontend dashboard hiện là lớp presentation dùng fixture; range filter chưa lọc dữ liệu và chưa có API/local-storage adapter cho dashboard.
- Source hiện **không build/test được** vì `dashboardFixtures.ts` vẫn import 10 fixture từ `docs/dashboard-design-handoff`, trong khi working tree đã chuyển tài liệu sang `docs/dashboard-exams/dashboard-design-handoff`.
- Snapshot schema v2 trong `result_json` có đủ metadata bất biến để tính topic/cognitive/question-type analytics mà không cần join question bank hiện tại.
- Backend chưa có dashboard analytics endpoint/aggregator. History/detail endpoint hiện hữu chỉ là nguồn đầu vào và chưa phải contract phù hợp cho dashboard.
- Không cần bảng dashboard riêng ở V1. Index `(user_id, submitted_at)` đã tồn tại và có thể reverse-scan cho thứ tự giảm dần; việc TiDB thực sự chọn index này là **CANNOT CONFIRM** do chưa chạy `EXPLAIN`.
- Không truy cập TiDB vì không xác nhận được một kết nối development read-only an toàn mà không đọc credential. Không đọc `.env`, không in secret và không truy vấn dữ liệu người dùng.

## Phạm vi và phương pháp

Audit này chỉ:

- đọc source, migration, tests và tài liệu;
- dùng các lệnh Git read-only;
- chạy TypeScript check và test dashboard read-only;
- kiểm tra cấu trúc 10 fixture đã chuyển bằng cách parse JSON và đối chiếu các root field bắt buộc;
- tạo duy nhất tài liệu này.

Audit này không:

- merge, cherry-pick, checkout force, reset hoặc clean;
- sửa frontend/backend/migration/dataset;
- kết nối hoặc thay đổi database;
- stage, commit hoặc push;
- đọc/in `.env`, credential, token, email, user ID hay raw answer/result.

---

## 1. Git baseline

### 1.1 Trạng thái ref tại thời điểm audit

| Ref | Commit | Ghi chú |
|---|---|---|
| Branch đang checkout | `dashboard_exams` | Branch thực tế, không phải `be_exams` |
| `HEAD` | `5a8a8323bfbd7b5119add79f5c575509cb7fcd72` | Cùng commit với local `main` tại thời điểm audit |
| Local `be_exams` | `d88998e2085aaa19184496cbb5a146e04ba7b3bb` | `perf(exams): tối ưu tải phiên thi và lịch sử làm bài` |
| `origin/be_exams` | `2c046e61267e2222a8656a6558fe8a0c184afaa5` | Local ref `be_exams` đang sau ref remote-tracking 16 commit |
| Dashboard commit | `878571186afda4744d2a4106bd2d37502e3734ab` | `feat(exams): add personal learning dashboard` |
| Parent dashboard commit | `1b06645f5d4098f6679771c6699a65632d1234ad` | Parent trực tiếp |

Không chạy `git fetch`, vì vậy chỉ khẳng định trạng thái các ref đã có cục bộ tại thời điểm audit, không khẳng định trạng thái mới nhất trên server Git.

### 1.2 Quan hệ branch và dự đoán conflict

- `merge-base(dashboard_exams, be_exams)` là chính local `be_exams`.
- `dashboard_exams...be_exams` có số commit riêng là `44/0`; local `be_exams` là ancestor của `dashboard_exams`.
- `merge-base(dashboard_exams, origin/be_exams)` là chính `origin/be_exams`.
- `dashboard_exams...origin/be_exams` có số commit riêng là `28/0`; `origin/be_exams` cũng là ancestor của `dashboard_exams`.
- `git merge-tree --write-tree dashboard_exams be_exams` và phép kiểm tra tương tự với `origin/be_exams` đều tạo tree thành công, không báo conflict.
- Mô phỏng ba chiều dùng parent `1b06645f...` làm merge base để áp đúng patch `87857118...` lên local `be_exams` và `origin/be_exams` cũng tạo tree thành công, không báo conflict.

Kết luận: với các ref hiện có, không còn một merge thực sự cần giải quyết; backend branch đã nằm trong lịch sử của branch đang audit. Conflict tương lai vẫn có thể xuất hiện nếu branch tiếp tục phân kỳ sau thời điểm audit.

### 1.3 Phạm vi dashboard commit

Commit `87857118...` có 42 file, 7.466 dòng thêm và 4 dòng xóa:

- 33 artifact thiết kế/handoff dưới `docs/dashboard-design-handoff`;
- `frontend/src/features/dashboard/PersonalLearningDashboardPage.tsx`;
- `frontend/src/features/dashboard/personalLearningDashboard.css`;
- `frontend/src/features/dashboard/dashboardTypes.ts`;
- `frontend/src/features/dashboard/dashboardFixtures.ts`;
- `frontend/src/features/dashboard/__tests__/PersonalLearningDashboardPage.test.tsx`;
- `frontend/src/App.tsx`;
- `frontend/package.json`;
- `frontend/package-lock.json`;
- `frontend/tsconfig.app.json`.

Các thay đổi tích hợp ngoài feature folder đều có lý do:

- `App.tsx`: lazy route `/exams/thong-ke`;
- `package.json`/`package-lock.json`: thêm `recharts`;
- `tsconfig.app.json`: bật `resolveJsonModule`.

Không có backend source, migration, database script, `MVP_KLTN` hay `data/exams` trong dashboard commit. Vì vậy không phát hiện file ngoài scope của feature/handoff trong commit này.

### 1.4 Working tree có trước Goal audit

Các thay đổi sau đã tồn tại trước khi tạo tài liệu audit và không bị sửa/restore trong Goal này:

- xóa bản tracked `docs/dashboard-design-handoff/**`;
- thêm untracked `docs/dashboard-exams/**`, gồm bản handoff đã chuyển và `DASHBOARD_MODULE_HANDOFF.md`;
- sửa `frontend/public/data/exams/exam-dataset-build.json`.

Đây là trạng thái người dùng đang quản lý, không phải thay đổi do source audit.

---

## 2. Dashboard source map

### 2.1 Frontend dashboard

| Path | Vai trò | Trạng thái source |
|---|---|---|
| `frontend/src/App.tsx` | Lazy import và route `/exams/thong-ke` | Đã wired |
| `frontend/src/features/dashboard/PersonalLearningDashboardPage.tsx` | Page, state rendering, KPI, trend, insight, utility rail | Fixture-only |
| `frontend/src/features/dashboard/personalLearningDashboard.css` | Layout, responsive, theme, utility rail | Có document-flow; không sticky rail |
| `frontend/src/features/dashboard/dashboardTypes.ts` | `PersonalLearningDashboardViewModel` và toàn bộ subtype | Contract UI hiện tại |
| `frontend/src/features/dashboard/dashboardFixtures.ts` | Resolver 10 fixture theo query development | Đang bị hỏng path import |
| `frontend/src/features/dashboard/__tests__/PersonalLearningDashboardPage.test.tsx` | Component/fixture/state/layout tests | Không chạy được vì import fixture hỏng |
| `frontend/package.json` | Dependency `recharts` | Đã thêm |
| `frontend/tsconfig.app.json` | `resolveJsonModule` | Đã bật |

### 2.2 Mười fixture

Resolver khai báo đúng 10 key:

1. `default`
2. `loading`
3. `error`
4. `empty`
5. `one-attempt`
6. `anonymous`
7. `backend-fallback`
8. `partial-details`
9. `long-content`
10. `many-attempts`

Các file hiện có và parse JSON thành công tại `docs/dashboard-exams/dashboard-design-handoff/mock-data/`:

- `docs/dashboard-exams/dashboard-design-handoff/mock-data/default.json`
- `docs/dashboard-exams/dashboard-design-handoff/mock-data/loading.json`
- `docs/dashboard-exams/dashboard-design-handoff/mock-data/error.json`
- `docs/dashboard-exams/dashboard-design-handoff/mock-data/empty.json`
- `docs/dashboard-exams/dashboard-design-handoff/mock-data/one-attempt.json`
- `docs/dashboard-exams/dashboard-design-handoff/mock-data/anonymous.json`
- `docs/dashboard-exams/dashboard-design-handoff/mock-data/backend-fallback.json`
- `docs/dashboard-exams/dashboard-design-handoff/mock-data/partial-details.json`
- `docs/dashboard-exams/dashboard-design-handoff/mock-data/long-content.json`
- `docs/dashboard-exams/dashboard-design-handoff/mock-data/many-attempts.json`

Mỗi fixture có đủ các root field được `dashboard-view-model.schema.json` yêu cầu; kiểm tra này chỉ xác nhận parse/root shape, chưa phải full JSON Schema validation.

### 2.3 Runtime behavior hiện tại

- `resolveDashboardFixture(location.search)` chọn fixture theo `?fixture=...` chỉ khi `import.meta.env.DEV` là `true`.
- Production/non-development bỏ qua query và luôn trả fixture `default`.
- `?theme=dark` cũng chỉ có tác dụng trong development.
- Range options là `7d`, `30d`, `90d`, `all`.
- Chọn range chỉ cập nhật local state/aria-live với thông báo rằng mock data được giữ nguyên; không lọc fixture và không gọi API.
- Retry ở error state chuyển sang loading, rồi sau 300 ms trả về fixture `default`.
- Page không đọc backend, localStorage, recovery queue hoặc authenticated user.
- Recharts dùng `ComposedChart`, `Area`, `Line`, `ReferenceDot`, `ResponsiveContainer`, `Tooltip`, `XAxis`, `YAxis` và `CartesianGrid`.

### 2.4 ViewModel hiện tại

`frontend/src/features/dashboard/dashboardTypes.ts` định nghĩa:

- state: `ready | empty | loading | error`;
- source: `local | backend | merged | local-fallback`;
- range: `7d | 30d | 90d | all`;
- mode UI: `thi_thu | custom_mock`;
- confidence: `low | medium | high`;
- insight status: `strength | developing | weakness | insufficient-data`;
- summary, recommendations, score trend, strengths/weaknesses, question-type performance, cognitive performance, recent attempts, coverage và notices.

ViewModel trộn:

- dữ liệu analytics;
- label tiếng Việt đã định dạng;
- route/action của frontend;
- textual summary/notices.

Do đó không nên dùng nguyên ViewModel này làm DTO backend. Backend nên trả facts/versioned enums; frontend mapper tạo label, route và copy.

### 2.5 Route/scroll source facts

- App shell dùng `#app-scroll-root` với `overflow-y-auto`; scroll owner chính của dashboard là app content container, không phải từng cột.
- `AppHeader` là thành phần sticky.
- `.dashboard-layout` là grid với `align-items: start`.
- utility rail có `data-scroll-behavior="document-flow"` và `data-scroll-owner="app-scroll-container"`.
- Dashboard CSS không đặt `position: sticky` hoặc `overflow-y: auto` cho utility rail.

Điều này phù hợp với scroll-fix/handoff mới: hai cột cùng document flow và không có nested scrollbar.

### 2.6 Đối chiếu tài liệu

| Tài liệu | Kết quả |
|---|---|
| `docs/dashboard-exams/DASHBOARD_MODULE_HANDOFF.md` | Đúng về route, fixture-only, ViewModel, scroll owner và backend chưa nối |
| `docs/dashboard-exams/dashboard-design-handoff/data-contract.md` | Phần lớn khớp `dashboardTypes.ts`; threshold/confidence mới là contract thiết kế, chưa có engine |
| `docs/dashboard-exams/dashboard-design-handoff/dashboard-view-model.schema.json` | Root shape/enums/range/coverage khớp types và 10 fixture |
| `docs/dashboard-exams/dashboard-design-handoff/README.md` | Lỗi thời: vẫn mô tả handoff pre-implementation và nói route/React/CSS chưa được tạo |

Các điểm tài liệu lỗi thời/cần sửa ở Goal khác:

1. Nhiều link/path vẫn trỏ `docs/dashboard-design-handoff/**` thay vì vị trí mới.
2. `DASHBOARD_MODULE_HANDOFF.md` ghi quality gates đã pass, nhưng source hiện fail TypeScript/test do relocation fixture.
3. Handoff vẫn dẫn ảnh QA tại path cũ `docs/dashboard-design-handoff/references/v3`.
4. README thiết kế nói chưa có implementation, trái với source hiện tại.
5. Tài liệu threshold diễn đạt như contract mục tiêu; source chưa có aggregate engine thực thi minimum sample/confidence.

---

## 3. Predicted integration conflicts

### 3.1 Blocker hiện tại: fixture import sau khi chuyển tài liệu

`frontend/src/features/dashboard/dashboardFixtures.ts` vẫn import:

`../../../../docs/dashboard-design-handoff/mock-data/*.json`

Trong working tree, thư mục đó đã bị xóa và fixture nằm ở:

`docs/dashboard-exams/dashboard-design-handoff/mock-data/*.json`

Hệ quả đã tái hiện read-only:

- `tsc -p tsconfig.app.json --noEmit`: fail với 10 lỗi `TS2307`, mỗi fixture một lỗi;
- targeted Vitest dashboard: fail ở bước Vite resolve import, `0` test được chạy.

Không sửa blocker trong Goal audit. Trước coding analytics phải quyết định một nguồn fixture ổn định:

- chuyển test fixture vào feature/test assets của frontend; hoặc
- cập nhật import sang path docs mới và khóa quy ước path.

Phương án đầu ít coupling hơn giữa production source và tài liệu.

### 3.2 Mode vocabulary không đồng nhất

- UI ViewModel dùng `thi_thu | custom_mock`.
- Backend/session/snapshot dùng `TIMED_ORIGINAL | CUSTOM_MOCK` cùng bốn practice mode khác.
- Local legacy `ExamResultV2` còn có vocabulary riêng.

Phải có mapper tường minh:

| Backend | Dashboard UI |
|---|---|
| `TIMED_ORIGINAL` | `thi_thu` |
| `CUSTOM_MOCK` | `custom_mock` |

Không cast trực tiếp string giữa DTO backend và ViewModel.

### 3.3 Contract/detail mismatch

- History summary endpoint không trả `snapshotSchemaVersion`, `scoringVersion`, `datasetVersion` hoặc `examContentHash`.
- Detail endpoint trả raw `result`, nhưng không đưa các version/hash column thành field DTO.
- `question_snapshots_json` có column nhưng flow submit hiện tại ghi `null`; snapshot có authority nằm trong `result_json`.
- Frontend normalized adapter giữ `question`/`topicRefs` nhưng chưa expose cognitive/topic thành các aggregate unit cấp một.

Vì vậy frontend không thể an toàn xây dashboard từ history summary hiện tại, còn gọi detail từng attempt sẽ tạo N+1 request và coupling raw JSON.

### 3.4 Range và coverage

- Range filter hiện chỉ là UI.
- Repository hiện list tối đa 100 attempt, không có date range/keyset contract cho dashboard.
- `scoreTrend.isComplete`, `coverage.fetchLimit` và `coverage.detailedAttemptCount` cần được tính bởi source adapter/aggregator; không thể suy ra chính xác từ page đầu nếu tổng lịch sử lớn hơn limit.

### 3.5 Git-level risk

Không có conflict ở ref hiện tại. Các file có xác suất conflict cao nếu branch lại phân kỳ là:

- `frontend/src/App.tsx`;
- `frontend/package.json`;
- `frontend/package-lock.json`;
- `frontend/tsconfig.app.json`.

Dashboard feature files hiện không đụng backend route/session implementation.

---

## 4. Attempt schema/index audit

### 4.1 `exam_v2_attempts`

Migration nguồn: `backend/src/main/resources/db/migration/V13__exam_v2_attempts.sql`.

| Concern | Column/source |
|---|---|
| Primary key nội bộ | `id BINARY(16)` |
| Public lookup ID | `session_id VARCHAR(120)`; unique theo `(user_id, session_id)` |
| User FK | `user_id BINARY(16) NOT NULL`, FK tới user, cascade delete |
| Mode | `mode VARCHAR(40) NOT NULL` |
| Exam/title/custom | `exam_id`, `title`, `is_custom` |
| Source/question data | `source_exam_ids_json`, `question_refs_json`, `question_snapshots_json`, `answers_json`, `config_json` |
| Authoritative result | `result_json LONGTEXT NOT NULL` |
| Score | `total_score`, `mcq_score`, `tf_score` |
| Size | `total_questions` |
| Duration | `duration_seconds` |
| Submitted timestamp | `submitted_at DATETIME(6)` |
| Audit timestamps | `created_at`, `updated_at` |

V13 indexes:

- unique `(user_id, session_id)`;
- `(user_id, submitted_at)`;
- `(user_id, updated_at)`.

Migration `V33__exam_v2_attempt_snapshot_authority.sql` bổ sung:

- `snapshot_schema_version`;
- `score_authority`;
- `timing_authority`;
- `submission_origin`;
- `scoring_version`;
- `dataset_version`;
- `exam_content_hash`;
- index `(user_id, timing_authority, submission_origin, submitted_at)`.

### 4.2 Entity/repository/service

- `ExamAttemptEntity` map các column V13/V33; entity ID nội bộ là byte array, API public lookup dùng `sessionId`.
- `ExamAttemptRepository.findSummariesByUserId` sort `submittedAt DESC, createdAt DESC`, nhận `Pageable`.
- `ExamAttemptService` mặc định limit 20, clamp tối đa 100, yêu cầu authenticated principal.
- Detail service parse các JSON column bằng Jackson; JSON lưu trữ không hợp lệ gây lỗi `STORED_JSON_INVALID`.
- `ExamAttemptController` expose:
  - `GET /api/exams/attempts?limit=...`;
  - `GET /api/exams/attempts/{sessionId}`.
- Legacy POST `/api/exams/attempts` đã retire và trả HTTP 410.

### 4.3 Snapshot/session persistence

`V32__exam_sessions_and_submission_receipts.sql` tạo:

- `exam_sessions`;
- `exam_session_questions`;
- `exam_submission_receipts`.

Nó hỗ trợ authenticated/anonymous server session, immutable safe/answer-key snapshots và idempotent submission. Timed/custom mock authenticated được persist sang `exam_v2_attempts`; anonymous result nằm trong session/result cache flow và không trở thành user attempt cho tới khi có một contract claim riêng, hiện chưa có.

`ExamSessionRepository.insertAttempt`:

- ghi `snapshot_schema_version = 2`;
- ghi authority/version/hash columns;
- ghi full snapshot vào `result_json`;
- hiện bind `question_snapshots_json = null`.

Vì vậy analytics v2 phải ưu tiên `result_json.questions`, không được giả định `question_snapshots_json` luôn có dữ liệu.

### 4.4 Legacy attempt tables

`V6__quiz_exam_attempts.sql` còn định nghĩa các bảng legacy:

- `quiz_attempts`/`quiz_answers`;
- `exam_attempts`/`exam_answers`.

Chúng có mode/source/score/duration/submitted và một số snapshot/answer JSON, nhưng không cùng contract với `exam_v2_attempts`. Không có dashboard adapter source-level nối các bảng này vào ViewModel hiện tại.

### 4.5 Index tương đương `(user_id, submitted_at DESC)`

Kết luận: **có index tiềm năng tương đương về prefix/filter/order**, nhưng không có khai báo `DESC` tường minh.

- `(user_id, submitted_at)` có thể được B-tree reverse-scan cho `WHERE user_id = ? ORDER BY submitted_at DESC`.
- Query repository có tie-break `created_at DESC`, nhưng `created_at` không nằm trong index này.
- Index V33 hữu ích khi filter thêm `timing_authority` và `submission_origin`; nó không cover `mode` hoặc `score_authority`.

Không đủ bằng chứng để gọi đây là missing index. Chỉ sau `EXPLAIN ANALYZE`/profile an toàn mới quyết định có cần index `(user_id, submitted_at DESC, created_at DESC)` hay index theo authority/mode.

---

## 5. Snapshot v2 exact field map

Nguồn chuẩn:

- construction: `backend/src/main/java/com/lichsuvn/backend/exam/session/application/ExamSessionService.java`;
- TypeScript contract: `frontend/src/types/examApi.ts`;
- frontend parser: `frontend/src/lib/exam/resultAdapters.ts`;
- storage: `exam_v2_attempts.result_json`.

### 5.1 Root

| JSON path | Type/giá trị | Ý nghĩa |
|---|---|---|
| `$.snapshotSchemaVersion` | literal `2` | Version discriminator |
| `$.sessionId` | string | Public attempt/session ID |
| `$.mode` | `TIMED_ORIGINAL`, `CUSTOM_MOCK`, `FREE_PRACTICE`, `TOPIC_PRACTICE`, `RETRY_WRONG`, `CUSTOM_PRACTICE` | Persisted `exam_v2_attempts` V1 chỉ nhận hai timed/custom mode |
| `$.title` | string | Tiêu đề lịch sử |
| `$.datasetVersion` | string | Dataset version bất biến |
| `$.examContentHash` | string/null | Content identity |
| `$.scoringVersion` | string | Version thuật toán chấm |
| `$.scoreAuthority` | `BACKEND`, `LOCAL_FALLBACK`, `FRONTEND_LEGACY` | Authority của score |
| `$.timingAuthority` | `SERVER`, `CLIENT_UNVERIFIED`, `LOCAL` | Authority của timing |
| `$.submissionOrigin` | `SERVER_ON_TIME`, `SERVER_ISSUED_LATE`, `CLIENT_FALLBACK`, `LOCAL_FALLBACK` | Nguồn submission |
| `$.startedAtServer` | number, epoch milliseconds | Server start |
| `$.submittedAtServer` | number, epoch milliseconds | Submitted timestamp chuẩn |
| `$.summary` | object | Score/count facts |
| `$.questions` | array | Reviewed questions |

Duration không nằm ở root snapshot. Duration authoritative của persisted attempt là:

`exam_v2_attempts.duration_seconds`

### 5.2 Summary

| JSON path | Type |
|---|---|
| `$.summary.totalScore` | number, thang 0–10 |
| `$.summary.mcqScore` | number |
| `$.summary.tfScore` | number |
| `$.summary.totalQuestions` | integer |
| `$.summary.correctMCQ` | integer |
| `$.summary.wrongMCQ` | integer |
| `$.summary.blankMCQ` | integer |
| `$.summary.tfBreakdown` | array 5 integer |

`tfBreakdown` là score-distribution/breakdown theo contract scoring hiện hữu; dashboard question-type analytics không nên diễn giải array index nếu chưa dùng chung một named DTO/mapper.

### 5.3 Reviewed question

Với mỗi phần tử `$.questions[i]`:

| JSON path | Type/shape |
|---|---|
| `.publicQuestionId` | string |
| `.questionInstanceId` | string |
| `.questionType` | `mcq`, `true_false` |
| `.question` | immutable safe question snapshot |
| `.userAnswer` | MCQ string/null hoặc T/F object/null |
| `.correctAnswer` | MCQ string hoặc T/F object |
| `.correctness` | boolean |
| `.points` | number |
| `.completionState` | `BLANK`, `PARTIAL`, `COMPLETE` |
| `.explanation` | string/null |
| `.sources` | array `{title, location: string (nullable)}` |
| `.topicRefs` | array `{slug, title, periodSlug: string (nullable), periodTitle: string (nullable)}` |

Safe question `$.questions[i].question`:

| Question type | Exact fields |
|---|---|
| Chung | `questionType`, `questionText`, `difficulty: string (nullable)`, `cognitiveLevel: string (nullable)` |
| MCQ | `options[]` với `{id, text}` |
| True/False | `statements[]` với `{id, text}` |

T/F answer object dùng statement keys hiện hành (`a`, `b`, `c`, `d`) với boolean/null tùy user completion. Audit không đọc/in nội dung answer thật.

### 5.4 Authority/version columns và snapshot

Authority/version có cả ở denormalized columns V33 và trong snapshot root. Aggregator nên:

1. dùng columns để filter/query hiệu quả;
2. xác thực snapshot root nhất quán với columns;
3. nếu mismatch, loại khỏi deep analytics, tăng unsupported/malformed coverage count và tạo telemetry;
4. không tự sửa hay rescore trong read path.

### 5.5 Parser/adapter có thể tái sử dụng

- Backend: Jackson `JsonNode` parser trong `ExamAttemptService` có thể tái dùng ở mức parse, nhưng cần validator/DTO snapshot v2 riêng thay vì để aggregator truy cập raw tree tùy ý.
- Frontend: `adaptResultSnapshotV2` có discriminator và basic structural guards; có thể dùng cho result page/local fallback, nhưng validation còn lỏng ở nested answers, topicRefs và completion enum.
- `adaptLegacyAttempt` tồn tại và có test, nhưng chưa được wired vào production result/history flow.
- Production fallback `resultFromAttemptDetail` hiện cast raw payload sang legacy `ExamResultV2`; không đủ an toàn để làm analytics engine.

Snapshot JSON đủ metadata; pipeline/adapter aggregate chưa sẵn sàng.

---

## 6. Legacy shape support

Không có bằng chứng cho phép suy rộng mọi production legacy payload. Phân loại source-level:

| Shape | Source hiện hữu | KPI/trend | Topic | Cognitive | Question type | Kết luận |
|---|---|---:|---:|---:|---:|---|
| Parseable snapshot v2 | `result_json.snapshotSchemaVersion = 2` | Có | Có | Có | Có | Deep analytics source chuẩn |
| Backend attempt summary | `ExamAttemptSummaryResponse` | Có | Không | Không | Chỉ score tổng/type score, không unit detail | Summary-only |
| Backend legacy detail có `result` object | `adaptLegacyAttempt` | Có theo adapter | Không | Không | Không đáng tin | Adapter trả `questions: []`, nhưng hiện chỉ có test và chưa wired production |
| Original local legacy `v2_result_*` | `ExamResultV2` không có immutable snapshots | Có | Không an toàn | Không an toàn | Có từ question result nếu shape hợp lệ | Result page có thể load current exam theo `examId`; không dùng reconstruction này cho historical analytics |
| Custom local có `questionSnapshots` | `custom_exam_session_*`/local result | Có | Có thể | Có thể | Có | Rich nhưng client-only/non-official; phải validate snapshot |
| Old `exam_result_*`/`exam_history` | `examService.ts` | Có shape riêng | Không có adapter | Không có adapter | Không có adapter | Chưa được dashboard hỗ trợ |
| Malformed/unknown JSON | parse failure hoặc schema lạ | Không | Không | Không | Không | Exclude; báo coverage/notice |

Nguyên tắc đề xuất:

- Summary KPI/trend chỉ cần ID, mode, submittedAt, score, duration và authority đủ tin cậy.
- Deep analytics chỉ dùng parseable detail có immutable metadata phù hợp.
- Legacy/custom local có snapshot có thể được aggregate cục bộ, nhưng phải gắn source/authority và không trộn vào official backend metrics ở V1.
- Không suy topic/cognitive của historical attempt bằng current question bank nếu snapshot thiếu metadata.
- Malformed detail không làm hỏng toàn dashboard: giữ summary nếu summary hợp lệ, đặt `detailStatus = unavailable`, tăng incomplete coverage.

Lưu ý behavior hiện tại:

- official history KPI chỉ nhận exact `BACKEND / SERVER / SERVER_ON_TIME`; legacy authority-null hoặc `FRONTEND_LEGACY` hiện bị loại;
- dùng legacy summary cho dashboard KPI là policy/implementation mới cần review, không phải behavior production đã wired;
- original legacy có thể hiển thị review bằng cách load current exam, nhưng đó là historical-drift risk và không đủ bằng chứng cho topic/cognitive analytics.

---

## 7. Topic/cognitive mapping

### 7.1 Exact source values

| Dimension | Snapshot/source value | Dashboard label |
|---|---|---|
| Topic key của backend snapshot v2 | `topicRefs[].slug` | Không tự dịch; key lịch sử |
| Topic label của backend snapshot v2 | `topicRefs[].title` | Label lịch sử bất biến |
| Period key | `topicRefs[].periodSlug` | Grouping tùy chọn |
| Period label | `topicRefs[].periodTitle` | Label lịch sử |
| Cognitive | `knowledge` | `Nhận biết` |
| Cognitive | `comprehension` | `Thông hiểu` |
| Cognitive | `application` | `Vận dụng` |
| Question type | `mcq` | Trắc nghiệm nhiều lựa chọn |
| Question type | `true_false` | Đúng/Sai |
| Completion | `BLANK` | Bỏ trống |
| Completion | `PARTIAL` | Trả lời một phần |
| Completion | `COMPLETE` | Hoàn tất |

Mapping cognitive label đã có ở `frontend/src/lib/exam/displayLabels.ts`.

### 7.2 Metadata authority

V2 snapshot có:

- `topicRefs` trên từng reviewed question;
- `question.cognitiveLevel`;
- `question.questionType`;
- immutable options/statements và answer state.

Do đó backend **không cần join current question bank** để aggregate v2. Đây là lựa chọn an toàn vì title/topic/cognitive của current bank có thể thay đổi sau ngày làm bài.

Nếu legacy snapshot thiếu metadata:

- đánh dấu detail không đủ;
- không backfill tại read time từ current bank;
- nếu sau này cần backfill, phải là migration/job riêng có version/provenance và review độc lập.

### 7.3 Unit semantics

Theo data contract hiện tại:

- MCQ: một câu là một unit.
- True/False: mỗi statement là một unit cho accuracy.
- `BLANK`, `PARTIAL`, `COMPLETE` là completion state; `PARTIAL` không đồng nghĩa đúng/sai.
- `tfPartialRate` và T/F statement accuracy là hai metric khác nhau.
- `correctness` cấp reviewed question không thay thế việc so từng T/F statement khi tính statement accuracy.

Current frontend normalized model chưa expose cognitive/topic thành aggregate fields riêng; adapter/service analytics cần thực hiện bước này.

Local/legacy source không dùng một vocabulary topic thống nhất:

- `Question.topic`/`topic-index.json` có canonical Vietnamese topic value riêng;
- fixture dashboard dùng `topicKey` dạng slug;
- không có bằng chứng mọi local key bằng `topicRefs[].slug`.

Mapper không được correlation bằng label/string heuristic. Khi thiếu immutable `topicRefs`, đánh dấu topic detail unavailable.

---

## 8. Local storage/recovery map

| Key/prefix | Schema/source | Owner/version | Khả năng | Giới hạn |
|---|---|---|---|---|
| `v2_session_{examId}` | Local `SessionState` | Không có storage version/owner guard chặt | Resume local exam | Raw cast, có thể stale |
| `v2_result_{sessionId}` | Local `ExamResultV2` | Không có schema version; key không owner-scoped | Anonymous/local KPI, trend | History scanner không validate sâu |
| `exam_api_result_{sessionId}` | Snapshot API result | Snapshot discriminator v2; key không owner-scoped | Cached server result | Không được `v2History` aggregate |
| `exam_api_session_draft_{sessionId}` | API draft | `storageVersion = 1` | Resume timed API session | Không có TTL |
| `exam_session_token_{sessionId}` | Anonymous session token | Session-scoped | Anonymous server session | Sensitive local token; không đưa vào audit/API |
| `exam_api_session_locator_{owner}:{route}` | Active locator | Owner-scoped | Restore route/session | Cần cleanup lifecycle |
| `custom_exam_session_{sessionId}` | Custom local session/snapshots | Không có storage version | Rich custom fallback | Có answer-key-bearing snapshot cục bộ |
| `exam_submission_recovery_queue_v1` | Recovery items | `storageVersion = 1`, ownerId | Transport retry/dedupe | Anonymous không enqueue/claim; re-enqueue không reset toàn state |
| `exam_result_*`, `exam_history` | Legacy exam service | Legacy shape | Old summary/result | Không có dashboard adapter |

### 8.1 Anonymous local dashboard

Khả năng hiện tại: **PARTIAL**.

- Có thể quét `v2_result_*` để tính count/score/trend/duration.
- Có thể tính question-type nếu result có question detail hợp lệ.
- Topic/cognitive không bảo đảm vì legacy `ExamResultV2.questions` không luôn mang immutable metadata.
- `exam_api_result_*`, custom session, old history và recovery queue chưa được hợp nhất vào một normalized local dashboard source.

### 8.2 Transport fallback

Khả năng hiện tại: **PARTIAL**.

- Authenticated timed/custom flow có recovery queue và client submission ID.
- Static fallback có thể giữ `localResult`.
- API timed flow có trường hợp enqueue request mà không có `localResult`.
- Anonymous enqueue bị từ chối; chưa có claim-after-login.
- Static `CUSTOM_MOCK` không có server-issued descriptor bị backend từ chối với `RECOVERY_DESCRIPTOR_UNAVAILABLE`; chỉ custom mock có `serverSessionId` hợp lệ mới recovery được.
- Static local result mang authority `LOCAL_FALLBACK / CLIENT_UNVERIFIED / CLIENT_FALLBACK`.
- Server-recovered result mang `BACKEND / CLIENT_UNVERIFIED / CLIENT_FALLBACK` hoặc origin `SERVER_ISSUED_LATE`, tùy nhánh recovery.

Recovery request chứa các correlation/provenance field:

- `clientSubmissionId`;
- optional `serverSessionId`;
- optional `localSessionId`;
- mode, datasetVersion, exam/content/local hashes;
- client timing;
- questionRefs và answers.

### 8.3 Dedupe local/backend

Khả năng hiện tại: **NOT IMPLEMENTED cho dashboard/history merge**.

- Recovery queue dedupe theo `(ownerId, clientSubmissionId)`.
- History authenticated hiện backend-first và không merge local.
- Static recovery có thể tạo backend public ID dạng `recover_<hash(userId:localSessionId)>`, khác local session ID.
- Attempt/history DTO không expose `clientSubmissionId`; vì vậy source hiện chưa có correlation đủ để merge/dedupe static local/backend một cách tổng quát.
- Re-enqueue cùng `(ownerId, clientSubmissionId)` chỉ update request/queuedAt; không thay `localResult` và không reset terminal/retry state.
- V1 đã quyết định không merge, nên chưa cần phát minh correlation mới trong dashboard.

### 8.4 Pending recovery

`pendingRecoveryCount()` có thể nhận biết pending item theo owner và bỏ terminal state, nhưng chưa wired vào DashboardViewModel. Có thể dùng để tạo notice “đang đồng bộ” mà không tính fallback attempt vào official backend KPI.

### 8.5 Local risks

- raw casts và validation chưa sâu;
- một số key không owner-scoped, có rủi ro stale/cross-user trên shared browser;
- result page ưu tiên local cache trước backend detail;
- custom/local snapshot có correct answers;
- corrupt local JSON thường bị skip im lặng;
- không có TTL/storage migration thống nhất.

---

## 9. Read-only DB profile

### 9.1 Kết quả

**CANNOT CONFIRM — không chạy query TiDB.**

Không tìm thấy một cách xác nhận connection development read-only an toàn mà không đọc credential. Theo giới hạn Goal:

- không đọc toàn bộ `.env`;
- không in URL/user/password/token;
- không thử kết nối bằng credential chưa xác minh quyền;
- không in raw `result_json`.

Vì vậy chưa xác nhận:

- total attempts;
- distribution theo mode/snapshot/authority/origin;
- null/invalid/parseable result;
- legacy ratio;
- max attempts/user;
- result size distribution;
- actual TiDB execution plan/index selection.

### 9.2 Query profile đề xuất, chưa chạy

Các query sau chỉ là template aggregate an toàn; phải dùng connection read-only đã được xác nhận:

```sql
SELECT COUNT(*) AS total_attempts
FROM exam_v2_attempts;

SELECT mode, COUNT(*) AS attempt_count
FROM exam_v2_attempts
GROUP BY mode;

SELECT snapshot_schema_version, COUNT(*) AS attempt_count
FROM exam_v2_attempts
GROUP BY snapshot_schema_version;

SELECT score_authority, timing_authority, submission_origin, COUNT(*) AS attempt_count
FROM exam_v2_attempts
GROUP BY score_authority, timing_authority, submission_origin;

SELECT
  SUM(result_json IS NULL) AS null_result_count,
  MIN(OCTET_LENGTH(result_json)) AS min_result_bytes,
  AVG(OCTET_LENGTH(result_json)) AS avg_result_bytes,
  MAX(OCTET_LENGTH(result_json)) AS max_result_bytes
FROM exam_v2_attempts;

SELECT MAX(attempt_count) AS max_attempts_per_user
FROM (
  SELECT user_id, COUNT(*) AS attempt_count
  FROM exam_v2_attempts
  GROUP BY user_id
) grouped;

EXPLAIN
SELECT session_id, mode, total_score, duration_seconds, submitted_at
FROM exam_v2_attempts
WHERE user_id = ?
  AND submitted_at >= ?
  AND submitted_at < ?
ORDER BY submitted_at DESC, created_at DESC
LIMIT ?;
```

Không select user ID trong output profile; subquery dùng ID chỉ nội bộ để aggregate.

---

## 10. Product decision review

| # | Decision | Verdict | Source evidence / điều kiện |
|---:|---|---|---|
| 1 | V1 chỉ `TIMED_ORIGINAL` và `CUSTOM_MOCK` | **CONFIRMED WITH CHANGES** | Backend `TIMED` set và persistence attempt chỉ cho hai mode này; dashboard coverage cũng loại practice/retry. Cần mapper vì UI dùng `thi_thu/custom_mock`. Legacy/local types cho phép mode khác nên phải filter phòng thủ; DB profile chưa chứng minh dữ liệu thực tế có các mode đó. |
| 2 | Không tạo bảng dashboard riêng | **CONFIRMED** | Không có dashboard table/migration; snapshot/summary attempt đủ làm source V1. Chưa có bằng chứng hiệu năng yêu cầu materialization. |
| 3 | Authenticated online backend-only, không merge local ở V1 | **CONFIRMED WITH CHANGES** | History page backend-first và không merge khi thành công, nhưng fallback local khi backend lỗi; result detail lại ưu tiên API/local cache trước backend. Dashboard chưa wired, nên policy này phải được áp dụng riêng và explicit, không coi toàn app đã nhất quán. |
| 4 | Legacy summary dùng cho KPI; chỉ parseable detail dùng deep analytics | **CONFIRMED WITH CHANGES** | Summary DTO có facts cần thiết và adapter proposal trả summary-only, nhưng `adaptLegacyAttempt` chưa wired; official KPI hiện loại legacy authority. Đây là policy mới cần triển khai, validate detail v2 và báo coverage thay vì cast raw. Production legacy distribution chưa xác nhận. |
| 5 | Minimum/strength/developing/weakness/confidence thresholds đã nêu | **CANNOT CONFIRM** | Mốc 80/60 có trong UI helper; minimum `8 units/2 attempts` và confidence `16/3`, `30/5` mới là design proposal, chưa có implementation hoặc product approval end-to-end. Cần duyệt trước khi backend áp dụng canonical policy. |

Threshold contract đề xuất tại review gate:

- insufficient data nếu `< 8 units` hoặc `< 2 attempts`;
- strength nếu đủ minimum và accuracy `>= 80%`;
- developing nếu đủ minimum và `60% <= accuracy < 80%`;
- weakness nếu đủ minimum và accuracy `< 60%`;
- confidence low dưới medium;
- confidence medium khi `>= 16 units` và `>= 3 attempts`;
- confidence high khi `>= 30 units` và `>= 5 attempts`.

Các mốc minimum/confidence chưa có source implementation/approval end-to-end, nên phải được product xác nhận trước coding. Nếu được duyệt, `insufficient-data` ưu tiên hơn accuracy band; confidence không được nâng cao chỉ vì nhiều unit đến từ một attempt.

---

## 11. Recommended API contract

### 11.1 Endpoint

Đề xuất:

`GET /api/exams/dashboard-analytics?range=30d&recentLimit=5`

Authentication: bắt buộc cho backend source V1. Anonymous dashboard được tính client-side từ local source, không gửi local raw answers lên endpoint này.

Query:

| Param | Values/default | Rule |
|---|---|---|
| `range` | `7d | 30d | 90d | all`, default `30d` | Server tính boundary |
| `recentLimit` | `1..10`, default `5` | Chỉ recent list |
| `timezone` | Không nhận từ client ở V1 | Cố định `Asia/Ho_Chi_Minh` |

### 11.2 Backend response facts

Backend response nên versioned và presentation-neutral:

```text
DashboardAnalyticsResponseV1
  schemaVersion: 1
  generatedAt
  scope
    range
    timezone = Asia/Ho_Chi_Minh
    fromDate
    toDateExclusive
    attemptModes = [TIMED_ORIGINAL, CUSTOM_MOCK]
    authorityPolicy
  summary
  trend[]
  topics[]
  cognitiveLevels[]
  questionTypes[]
  recentAttempts[]
  coverage
  diagnostics
```

Các group:

- `summary`: totalAttempts, average/highest/latest score, totalDurationSeconds, activeDays, mcqAccuracy, tfStatementAccuracy, blankRate, tfPartialRate.
- `trend[]`: sessionId, submittedAt, totalScore, mode, title.
- `topics[]`: topicKey, topicLabel, periodKey/label, correctUnits, totalUnits, attemptCount, accuracy, confidence, status.
- `cognitiveLevels[]`: exact `knowledge/comprehension/application` cùng evidence/status.
- `questionTypes[]`: exact `mcq/true_false`, correct/answered/blank/total units, partialQuestionCount, accuracy.
- `recentAttempts[]`: sessionId, mode, title, score, durationSeconds, submittedAt, totalQuestions, detailStatus.
- `coverage`: summaryAttemptCount, detailedAttemptCount, unsupportedSnapshotCount, malformedDetailCount, totalKnownAttempts, fetchLimit, isComplete.
- `diagnostics`: chỉ count/version categories, không raw JSON/answer.

Frontend mapper chịu trách nhiệm:

- `TIMED_ORIGINAL -> thi_thu`;
- label tiếng Việt;
- date/duration formatting;
- action/result routes;
- recommendation copy/priority;
- notices;
- `loading/error/empty/ready` UI state.

### 11.3 Authority policy

Response phải nói rõ policy, ví dụ:

- include modes: `TIMED_ORIGINAL`, `CUSTOM_MOCK`;
- official facts: `scoreAuthority=BACKEND`, `timingAuthority=SERVER`, `submissionOrigin=SERVER_ON_TIME`;
- late/recovered/fallback facts: đưa vào learning summary hay chỉ notice phải được định nghĩa, không ngầm trộn;
- legacy summary: có thể dùng nếu score/timestamp/mode hợp lệ, nhưng không deep analytics.

Khuyến nghị V1:

- summary/trend “learning” có thể include backend-persisted recovered attempt nhưng phải giữ authority counts;
- nhãn “official” chỉ dùng exact authority triple;
- strengths/weaknesses/confidence chỉ dùng parseable, trusted snapshot detail;
- không rescore trong dashboard read path.

### 11.4 Pagination/performance

- Query theo `user_id`, mode, submitted range.
- Dùng keyset/cursor nếu cần đọc hơn một page; không dùng một list endpoint limit 100 rồi mặc định `isComplete=true`.
- Parse JSON ở service/backend, không trả raw reviewed questions cho dashboard.
- Không expose user ID, answer, correct answer, explanation hoặc full source snapshot.
- Cache chỉ sau khi có profile; cache key phải gồm user/range/snapshot policy version.

### 11.5 Error/partial contract

- Một malformed detail không làm fail toàn response.
- Summary hợp lệ vẫn có thể xuất hiện với `detailStatus=unavailable`.
- `coverage` bắt buộc phản ánh incomplete/unsupported.
- Toàn bộ storage/query failure mới trả API error.
- Frontend backend-fallback phải hiện notice và source rõ, không giả là dữ liệu backend complete.

---

## 12. Migration/index decision

### Decision V1

**Không tạo dashboard table và không tạo migration/index trong Goal kế tiếp trước khi có DB profile.**

Lý do:

1. V13/V33 đã có summary columns, authority/version columns và full immutable snapshot.
2. `(user_id, submitted_at)` có khả năng phục vụ range/order bằng reverse scan.
3. `(user_id, timing_authority, submission_origin, submitted_at)` có thể hỗ trợ official policy.
4. Chưa có `EXPLAIN`/cardinality/attempt volume để chứng minh bottleneck.
5. Materialized dashboard table tạo thêm consistency, invalidation và retention burden.

Sau khi có safe TiDB profile:

- nếu query dùng index tốt: không migration;
- nếu filesort/tie-break đáng kể: cân nhắc `(user_id, submitted_at DESC, created_at DESC)`;
- nếu authority-filter chiếm ưu thế: đánh giá index cover mode/authority dựa trên `EXPLAIN`, không thêm theo suy đoán;
- nếu JSON parse mới là bottleneck: ưu tiên bounded aggregation/cache/versioned projection trước khi thiết kế bảng materialized.

Mọi migration tương lai phải là Goal/review riêng; audit này không tạo hoặc sửa migration.

---

## 13. File-level implementation map cho Goal 1–4

Đây là bản đồ triển khai tương lai, không phải thay đổi đã thực hiện.

### Goal 1 — Khóa contract và source adapters

| File | Dự kiến |
|---|---|
| `frontend/src/features/dashboard/dashboardTypes.ts` | Giữ UI ViewModel; không dùng làm wire DTO |
| `frontend/src/features/dashboard/dashboardFixtures.ts` | Sửa nguồn fixture ổn định sau khi review quyết định relocation |
| New `frontend/src/features/dashboard/dashboardAnalyticsTypes.ts` | Wire DTO V1, exact enums/version |
| New `frontend/src/features/dashboard/dashboardMappers.ts` | Backend facts/local normalized facts -> ViewModel |
| `frontend/src/lib/exam/resultAdapters.ts` | Tăng validation snapshot v2/topic/cognitive/completion; không raw cast |
| `frontend/src/services/examAttemptApi.ts` | Không dùng N+1 detail làm dashboard; chỉ tái dùng auth/error conventions |
| Tests cạnh mapper/adapter | Contract, mode mapping, malformed/legacy/partial coverage |

Acceptance:

- TypeScript/test blocker fixture được giải quyết;
- mapper không phụ thuộc DB column name;
- fixture, backend DTO và local DTO cùng sinh được ViewModel tương đương;
- threshold được test tại boundary.

### Goal 2 — Backend dashboard analytics API

| File/package | Dự kiến |
|---|---|
| New `backend/src/main/java/com/lichsuvn/backend/exam/api/dto/DashboardAnalyticsResponse.java` | Versioned presentation-neutral DTO |
| New `backend/src/main/java/com/lichsuvn/backend/exam/application/DashboardAnalyticsService.java` | Range, authority, aggregation, coverage |
| `backend/src/main/java/com/lichsuvn/backend/exam/infrastructure/ExamAttemptRepository.java` | Bounded range/projection query có result/version fields |
| New hoặc mở rộng controller dưới `backend/.../exam/api` | Authenticated GET endpoint |
| New snapshot v2 parser/value objects dưới `backend/.../exam/domain` hoặc application package | Exact validation, không truyền raw `JsonNode` xuyên lớp |
| Backend unit/integration tests | Empty, one/many, malformed legacy, T/F partial, thresholds, authorization |

Acceptance:

- chỉ hai V1 modes;
- timezone/range exclusive boundary đúng;
- no N+1;
- malformed detail tạo incomplete coverage, không 500 toàn dashboard;
- không trả raw answers/correct answers;
- không migration nếu chưa có bằng chứng.

### Goal 3 — Frontend real-data/local fallback integration

| File | Dự kiến |
|---|---|
| New `frontend/src/services/dashboardAnalyticsApi.ts` | Gọi endpoint V1, validate envelope |
| New `frontend/src/features/dashboard/usePersonalLearningDashboard.ts` | Loading/error/retry/range/auth orchestration |
| `frontend/src/features/dashboard/PersonalLearningDashboardPage.tsx` | Thay fixture source production bằng hook; DEV fixture vẫn deterministic |
| `frontend/src/lib/exam/v2History.ts` | Chỉ mở rộng qua normalized adapter nếu anonymous local scope được duyệt |
| `frontend/src/lib/exam/examRecoveryQueue.ts` | Chỉ đọc pending count/notice; không đổi retry semantics ngoài Goal |
| `frontend/src/pages/exams/ExamV2HistoryPage.tsx` | Giữ backend-only authenticated V1; chia sẻ policy helper nếu cần |
| Dashboard/component/hook tests | Backend, anonymous, fallback, partial coverage, retry/range |

Acceptance:

- authenticated online: backend-only;
- anonymous: local-only có source rõ;
- backend unavailable: explicit `local-fallback` hoặc error theo product decision, không silent merge;
- pending recovery hiện notice;
- route/scroll/accessibility không regress.

### Goal 4 — Profile, hardening và release gate

| File/area | Dự kiến |
|---|---|
| Backend integration/security tests | User isolation, response redaction, range/authority policy |
| Frontend Vitest | 10 fixture scenarios + real DTO mapper scenarios |
| Browser QA | `/exams/thong-ke` tại desktop/tablet/mobile, scroll owner, header overlap |
| `docs/dashboard-exams/DASHBOARD_MODULE_HANDOFF.md` | Cập nhật status/source/API/known limits |
| `docs/dashboard-exams/dashboard-design-handoff/**` | Sửa path/claims stale sau khi implementation pass |
| Optional new migration | Chỉ khi TiDB `EXPLAIN`/profile chứng minh cần và review riêng |

Release gate:

- TypeScript, targeted/full test và production build pass;
- no fixture import từ path đã xóa;
- DB profile/EXPLAIN được ghi bằng aggregate metadata, không PII;
- coverage/authority semantics được product sign-off;
- không raw answer trong dashboard response/log.

---

## 14. Risks

| Mức | Risk | Tác động | Mitigation đề xuất |
|---|---|---|---|
| P0 | Fixture imports trỏ thư mục đã xóa | Build/test fail | Khóa vị trí fixture trước implementation |
| P1 | UI/backend mode vocabulary khác nhau | Sai filter/label/coverage | Exhaustive mapper + tests |
| P1 | Summary DTO thiếu snapshot/version fields | Không phân loại deep detail an toàn | Dedicated analytics projection/DTO |
| P1 | Raw JSON cast/validation lỏng | Malformed data làm sai metric hoặc crash | Versioned parser + partial coverage |
| P1 | Join current bank cho history | Historical drift | Dùng immutable snapshot; legacy thiếu thì unavailable |
| P1 | Authenticated local/backend silent merge | Double count/sai authority | Backend-only V1; explicit fallback |
| P1 | Local key thiếu owner/schema/TTL | Cross-user/stale analytics | Scope/validate; không dùng vào official stats |
| P1 | Full correct-answer snapshots ở local custom flow | Exposure trên shared browser | Không đưa vào dashboard API/log; review storage riêng |
| P2 | Limit 100/no complete pagination | Trend/coverage sai | Range query + cursor/coverage |
| P2 | T/F partial semantics bị gộp với correctness | Accuracy sai | Statement-unit aggregation riêng |
| P2 | Threshold chỉ nằm trong docs/UI | FE/BE lệch | Backend canonical policy + boundary tests |
| P2 | Result JSON parse cost/size | Latency ở user nhiều attempt | Profile trước; bounded parse/cache |
| P2 | Timezone boundary | Lệch active day/range | Server fixed `Asia/Ho_Chi_Minh`, exclusive end |
| P3 | Handoff/README stale | AI/dev hiểu sai tiến độ | Cập nhật sau implementation, không trong audit |

---

## 15. CANNOT CONFIRM

Các điểm không thể xác nhận từ source/ref cục bộ:

1. Số attempt thực tế và distribution theo mode/schema/authority/origin trên TiDB.
2. Tỷ lệ `result_json` null, malformed, snapshot v2 hoặc legacy trong production.
3. Max attempts/user và size distribution của `result_json`.
4. TiDB optimizer có reverse-scan `(user_id, submitted_at)` hay chọn index V33 cho query dashboard.
5. Có cần index mới hay materialized projection ở tải thật.
6. Shape đầy đủ của mọi legacy production payload ngoài những shape có trong source.
7. Threshold/minimum/confidence đã từng được áp dụng end-to-end; source hiện chỉ có UI bands và design contract.
8. Correctness của dashboard với dữ liệu thật, vì page chưa nối data source.
9. Remote Git server có commit mới hơn remote-tracking refs cục bộ, vì audit không fetch.
10. Quality-gate “pass” ghi trong handoff còn đúng sau khi thư mục docs được chuyển; kiểm tra hiện tại chứng minh TypeScript/test dashboard đang fail.

---

## 16. Readiness verdict

### Verdict theo lớp

| Lớp | Verdict | Lý do |
|---|---|---|
| Git integration hiện tại | **READY** | Dashboard/backend refs đã cùng lịch sử; merge-tree không conflict |
| Dashboard presentation/UI | **IMPLEMENTED BUT BLOCKED** | UI/route/tests tồn tại, nhưng fixture import hỏng |
| Snapshot v2 analytics source | **READY WITH ADAPTER WORK** | Metadata bất biến đủ; cần exact parser/aggregator |
| Backend dashboard API | **NOT IMPLEMENTED** | Chưa có endpoint/projection/service |
| Authenticated V1 policy | **PARTIAL / NEEDS EXPLICIT IMPLEMENTATION** | History có precedent nhưng fallback/result-detail behavior toàn app chưa nhất quán |
| Anonymous local fallback | **PARTIAL / NOT RELEASE-READY** | Nguồn phân mảnh, validation/owner/topic coverage chưa đủ |
| Legacy deep analytics | **PARTIAL** | Chỉ parseable immutable detail; summary-only vẫn dùng KPI |
| Migration/index | **NO CHANGE APPROVED** | Chưa có DB profile/EXPLAIN |
| Overall | **NOT READY TO CODE BEFORE REVIEW DECISIONS** | Cần duyệt contract, fixture location, authority/fallback và threshold policy |

### Review gate cần chốt

1. Chọn vị trí fixture ổn định và xử lý blocker import trong Goal implementation riêng.
2. Duyệt endpoint/DTO presentation-neutral ở mục 11.
3. Duyệt exact authority policy cho recovered/late attempts.
4. Duyệt threshold contract ở mục 10.
5. Duyệt anonymous local scope và explicit fallback behavior.
6. Nếu cần quyết định index, cung cấp kết nối TiDB development read-only an toàn để chạy aggregate profile/`EXPLAIN`.

### Validation của Goal audit

Đã chạy read-only:

- `git diff --check`;
- `git status --short`;
- `git diff --cached --name-only`;
- `tsc -p tsconfig.app.json --noEmit`;
- targeted dashboard Vitest;
- JSON parse/root-field check cho 10 fixture tại vị trí mới.

Kết quả:

- không có staged file;
- không commit/push;
- không sửa source/migration/database;
- TypeScript và dashboard test fail vì 10 fixture import path cũ;
- 10 JSON tại vị trí mới parse thành công và có đủ root field;
- thay đổi duy nhất do Goal audit là file này;
- các deletion/docs relocation và dataset-build modification là thay đổi có trước Goal, được giữ nguyên.

**STOP: REVIEW GATE. Không bắt đầu implementation trong audit này.**
