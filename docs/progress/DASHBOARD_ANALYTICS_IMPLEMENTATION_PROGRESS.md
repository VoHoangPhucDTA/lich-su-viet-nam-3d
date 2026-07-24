# Dashboard Analytics — Implementation Progress

Ngày cập nhật: 2026-07-24  
Nhánh làm việc: `dashboard_exams`  
Goal 1 commit: `0edd68166609cbc1228c79e5218dc91038e75ac7`

Goal 2 commit / Goal 3A baseline: `195db79f4b2055e97bbd02909ce7f1a2ba4134ca`

Goal 3A commit / Goal 3B1 baseline: `655702f48522faed9f5ce1691be190c7b582a117`

## Trạng thái tổng quát

| Goal | Trạng thái | Phạm vi |
| --- | --- | --- |
| Goal 0 | Hoàn thành | Source audit read-only và bản đồ nguồn dữ liệu |
| Goal 1 | Hoàn thành, đã commit | Fixture boundary, wire contract V1, validator, policy, mapper và test frontend |
| Goal 2 | Hoàn thành, đã commit | Authenticated backend analytics API V1 |
| Goal 3A | Hoàn thành, đã commit | Authenticated production API client/hook, auth/range/error/retry/partial coverage |
| Goal 3B1 | Đã triển khai, REVIEW GATE | Local scanner/adapters/owner scope/dedupe/aggregation/mapper thuần; chưa wired production |
| Goal 3B2 | Deferred | Quyết định và nối anonymous/device-local/backend-off presentation; không silent merge |
| Goal 4 | Chưa thực hiện | Đối soát dữ liệu thật, observability và rollout |

## Goal 0 — Source audit

Kết quả audit nằm tại:

```text
docs/plans/DASHBOARD_ANALYTICS_SOURCE_AUDIT.md
```

Audit xác nhận presentation layer đã tồn tại, nhưng fixture runtime từng import ngược từ thư mục
documentation. Backend chưa có endpoint analytics tương ứng và không có nguồn dữ liệu production đủ
điều kiện để component tự tổng hợp một cách an toàn.

## Goal 1 — Những phần đã triển khai

### 1. Fixture boundary

Mười fixture UI đã được sao chép nguyên nội dung sang:

```text
frontend/src/features/dashboard/__fixtures__/
```

`dashboardFixtures.ts` không còn static-import JSON từ `docs/`. Development fixture chỉ được tải qua
dynamic import khi `import.meta.env.DEV` là `true`. Production build không chứa fixture module; khi API
thật chưa được nối, loader trả explicit unavailable state, không tạo KPI giả.

Các bản fixture trong `docs/dashboard-exams/dashboard-design-handoff/mock-data/` vẫn là artifact
handoff/reference và không còn là runtime dependency.

### 2. Wire contract và runtime validation

```text
frontend/src/features/dashboard/dashboardAnalyticsTypes.ts
frontend/src/features/dashboard/dashboardAnalyticsValidation.ts
```

Contract `DashboardAnalyticsResponseV1` khóa schema version, scope, summary, trend, topic/cognitive
facts, question-type performance, recent attempts, coverage, authority breakdown và diagnostics.
Validator dựng lại DTO đã kiểm chứng từ `unknown`, từ chối field lạ/raw, enum sai, số không hữu hạn,
range sai và các quan hệ count/coverage không nhất quán.

Contract không mang raw answers, reviewed-question payload, persistence snapshot hoặc thông tin dùng
để chấm điểm lại ở frontend.

### 3. Policy thuần

```text
frontend/src/features/dashboard/dashboardAnalyticsPolicy.ts
```

Policy `dashboard-v1` khóa:

- minimum evidence: 8 units và 2 attempts;
- strength: accuracy từ 80%;
- developing: accuracy từ 60% đến dưới 80%;
- weakness: accuracy dưới 60%, chỉ khi đủ evidence;
- confidence high: từ 30 units và 5 attempts;
- confidence medium: từ 16 units và 3 attempts;
- các trường hợp còn lại là low;
- official detail chỉ dùng authority `BACKEND/SERVER/SERVER_ON_TIME`;
- recovered detail chỉ dùng `BACKEND/CLIENT_UNVERIFIED` với origin phục hồi hợp lệ;
- legacy frontend score chỉ đóng góp summary, không tham gia deep analysis.

### 4. DTO → ViewModel mapper

```text
frontend/src/features/dashboard/dashboardMappers.ts
frontend/src/features/dashboard/dashboardFormatters.ts
```

Mapper là hàm thuần: không fetch, không đọc auth/localStorage/recovery queue, không chấm điểm lại và
không sửa input. Mapper tạo KPI, trend, insights, question types, recent attempts, notices và
recommendation có thứ tự tie-break xác định. Các enum backend được đổi sang nhãn UI trước khi render.

`DashboardViewModel`, information architecture và presentation component hiện có được giữ nguyên.

### 5. Golden fixtures

```text
data/dashboard-analytics-fixtures/
```

Bốn response trung lập nguồn dữ liệu gồm default, empty, partial coverage và authority mix. Chúng là
contract fixtures dùng chung cho frontend validator/mapper và backend Goal 2; không chứa raw answer
hoặc PII.

### 6. Test coverage Goal 1

Các test dashboard bao phủ:

- parse và resolve đủ 10 development fixture;
- production unavailable state và không tạo số liệu giả;
- boundary của status/confidence/authority policy;
- validator với golden response hợp lệ và response sai schema/range/enum/number/coverage/raw field;
- mapper cho default, empty, partial coverage, authority mix, mode labels, routes, recommendation
  ordering, insufficient evidence, developing-only, all-strong và tính bất biến của input;
- component states và retry loader.

Quality gate ngày 2026-07-24:

```text
npx vitest run src/features/dashboard --no-file-parallelism
PASS — 5 test files, 57 tests

npm run test:run
PASS — 40 test files, 217 tests

npx tsc -b
PASS

npx eslint src/features/dashboard --ext .ts,.tsx
PASS

npm run build
PASS — gồm build:data, encoding check, TypeScript và Vite production build
```

Build chỉ có cảnh báo chunk lớn đã tồn tại ở cấp ứng dụng. Kiểm tra output production không tìm thấy
tên fixture, marker mock hoặc `dashboardDevelopmentFixtures`. Bốn artifact exam do `prebuild` sinh
lại đã được khôi phục đúng SHA-256 trước build để không ghi đè thay đổi có sẵn trong working tree.

## Goal 2 — Backend Dashboard Analytics API V1

Goal 2 đã hoàn thành review và được commit riêng tại
`195db79f4b2055e97bbd02909ce7f1a2ba4134ca`. Goal 3A dùng commit này làm baseline.

### Endpoint và security

```text
GET /api/exams/dashboard-analytics?range=30d&recentLimit=5
```

- Bắt buộc authenticated; owner chỉ lấy từ principal, không nhận `userId` từ request.
- `range` nhận `7d`, `30d`, `90d`, `all`; mặc định `30d`.
- `recentLimit` nhận số nguyên `1..10`; mặc định `5`.
- Anonymous trả `401`, query sai trả `400`, empty analytics trả `200`.
- Response dùng `schemaVersion = 1`, `policyVersion = dashboard-v1`,
  `timezone = Asia/Ho_Chi_Minh`.

### Backend package

```text
backend/src/main/java/com/lichsuvn/backend/exam/api/
  DashboardAnalyticsController.java
  dto/DashboardAnalyticsResponse.java

backend/src/main/java/com/lichsuvn/backend/exam/application/
  DashboardAnalyticsService.java
  DashboardAnalyticsAggregator.java
  DashboardSnapshotV2Parser.java
  DashboardAnalyticsPolicy.java
  DashboardAnalyticsConfiguration.java
  model/DashboardAttemptRecord.java
  model/DashboardAnalyzedAttempt.java

backend/src/main/java/com/lichsuvn/backend/exam/infrastructure/
  ExamAttemptRepository.java
```

`SecurityConfig` có matcher authenticated riêng cho endpoint. `application.properties` cấu hình
`exam.dashboard.fetch-limit`, được giới hạn tối đa 500.

### Time range và storage convention

`submitted_at` được ánh xạ thành `Instant`. Hibernate/JDBC của ứng dụng dùng
`Asia/Ho_Chi_Minh` và connection init dùng `+07:00`. Service tạo calendar-day boundaries trong
`Asia/Ho_Chi_Minh`, rồi chuyển thành `Instant` để query theo lower-inclusive/upper-exclusive.
`Clock` được inject để range test có tính xác định.

### Query và coverage

Mỗi request dùng đúng ba repository operation, không query theo từng attempt:

1. count attempt thuộc `TIMED_ORIGINAL` hoặc `CUSTOM_MOCK`;
2. count attempt bị loại vì mode khác;
3. fetch projection có giới hạn, order `submittedAt DESC, createdAt DESC`.

Projection chỉ đọc các cột summary/authority/version/hash và `result_json`; không fetch relationship,
không join question bank. Fetch limit mặc định và tối đa là 500. Response phân biệt:
`totalKnownAttempts`, `fetchedAttemptCount`, `summaryAttemptCount`, `detailedAttemptCount`,
`unsupportedSnapshotCount`, `malformedDetailCount`, `legacySummaryCount`,
`excludedModeCount`, `excludedInvalidSummaryCount`, `snapshotVersionCounts` và `isComplete`.

Khi lịch sử vượt cap, KPI chỉ đại diện tập đã fetch và `isComplete = false`; frontend mapper Goal 1
sẽ tạo coverage notice sau khi được nối ở Goal 3.

### Summary, authority và deep analytics

Summary eligibility dùng denormalized columns hợp lệ; không rescore và không sửa persisted row.
Policy authority:

- `BACKEND/SERVER/SERVER_ON_TIME` → official;
- `BACKEND/CLIENT_UNVERIFIED/SERVER_ISSUED_LATE` → recovered late;
- `BACKEND/CLIENT_UNVERIFIED/CLIENT_FALLBACK` → recovered fallback;
- `FRONTEND_LEGACY`, hoặc row pre-v2 không có score authority → legacy summary-only;
- các combination khác, gồm `LOCAL_FALLBACK`, bị loại khỏi summary.

Parser chỉ dùng snapshot immutable schema v2 cho deep analytics. Nó kiểm tra root/column consistency,
shape, enum, authority/version/hash/score và T/F statement keys. Attempt unsupported hoặc malformed
vẫn giữ summary nếu basic columns hợp lệ, nhưng không tham gia deep analytics và không làm request
thất bại.

MCQ dùng một question unit. T/F dùng từng immutable statement làm unit; accuracy dựa trên từng
statement, còn `PARTIAL` được đếm ở cấp question. Topic dùng slug, dedupe cùng question, giữ historical
label mới nhất theo thứ tự deterministic và không join current question bank. Cognitive không biết/null
chỉ bị bỏ khỏi cognitive aggregate, không làm hỏng snapshot.

Topic/cognitive status và confidence dùng đúng boundary `dashboard-v1`: minimum 8 units/2 attempts;
strength từ 80%, developing từ 60%, weakness dưới 60%; medium từ 16 units/3 attempts và high từ
30 units/5 attempts.

### Contract, redaction và validation

Java DTO deserialize/serialize semantic-parity với cả bốn golden fixture Goal 1. Response không có
`userAnswer`, `correctAnswer`, `explanation`, `resultJson`, `answers`, `questionSnapshots` hoặc
`rawSnapshot`.

Validation ngày 2026-07-24:

```text
.\mvnw.cmd -Dtest="Dashboard*" test
PASS — 34 tests

.\mvnw.cmd -Dtest="Dashboard*,ExamSessionServiceIntegrationTest,ExamSubmissionRecoveryHttpIntegrationTest" test
PASS — 49 tests

.\mvnw.cmd clean test
240 tests discovered — 0 failures, 1 error, 15 skipped
Known out-of-scope error: HistoryRagPackageReaderTest thiếu data/history-rag/v1

.\mvnw.cmd -Dtest="!HistoryRagPackageReaderTest" test
PASS — 239 tests, 15 skipped

.\mvnw.cmd -DskipTests package
PASS

npm run test:run
PASS — 40 files, 217 tests

npx tsc -b
PASS

npm run build
PASS
```

Full backend suite chưa thể được ghi là PASS vì repository hiện không có artifact
`data/history-rag/v1` mà `HistoryRagPackageReaderTest` yêu cầu. Lỗi đã được xác định là ngoài module
dashboard; Goal 2 không tạo hoặc sửa artifact ngoài phạm vi để hợp thức hóa gate này.

### Corrective review — History RAG không chặn Goal 2

Verdict: **PRE_EXISTING_OUT_OF_SCOPE_BLOCKER**; không phải `REAL_DASHBOARD_BLOCKER`.

Corrective review đã tạo detached temporary worktree từ commit `0edd6816`, tức baseline Goal 1 trước
mọi thay đổi Goal 2, rồi chạy đúng:

```text
.\mvnw.cmd clean test
```

Baseline compile 183 production sources, compile 51 test sources và khởi tạo
`BackendApplicationTests` thành công. Sau đó suite baseline chạy 206 tests, 0 failures, 1 error,
15 skipped. Error duy nhất giống hệt current worktree:

```text
HistoryRagPackageReaderTest.validatesGeneratedPackageAndBaselineCounts
HistoryRagPackageReaderTest.java:18
  -> HistoryRagPackageReader.read(...)
HistoryRagPackageReader.java:73
  -> PackageValidationException: Package directory does not exist: .../data/history-rag/v1
```

Failure xảy ra trong Maven Surefire test phase của một artifact-contract test thuộc importer/RAG;
không xảy ra trong compile, Spring context initialization, packaging hoặc Dashboard application
startup. `HistoryRagPackageReaderTest.java:18` là source trực tiếp truyền
`Path.of("../data/history-rag/v1")`; `HistoryRagPackageReader.java:70-73` normalize path, kiểm tra
`Files.isDirectory` và fail-fast khi thư mục không tồn tại.

Dependency classification:

- **A — Dashboard analytics trực tiếp:** không có reference/import/call.
- **B — Exam attempt/session:** không có reference/import/call.
- **C — Spring context global:** không có dependency bắt buộc ở default profile;
  `HistoryRagImportRunner` chỉ active với profile `history-rag-import`, còn release-C runner cần
  profile/property riêng. Baseline `BackendApplicationTests` đã khởi tạo context thành công.
- **D — RAG/history ngoài scope:** importer, package reader và controlled release runners.
- **E — Test/tooling ngoài scope:** package-reader/integration tests, export/preflight scripts và
  GitHub workflow.
- **F — Documentation only:** `backend/TESTING.md` và tài liệu `docs/ai-service/**`.

Scan các file Goal 2 — controller, DTO, service, parser, aggregator, policy, repository projection và
`ExamAttemptEntity` — không tìm thấy `history-rag`, canonical-history hoặc importer dependency.
Backend compile, 34 Dashboard tests, 15 exam session/recovery tests và package đều chạy độc lập.
Vì vậy History RAG chỉ được giữ như residual full-repository validation issue; Goal 2 implementation
không bị chặn và có thể chuyển sang review/Goal 3. Full suite vẫn được báo trung thực là không PASS.

Read-only TiDB smoke/EXPLAIN: **CANNOT CONFIRM** vì không có verified QA token hoặc read-only
development connection được xác nhận an toàn. Việc này được chuyển sang Goal 4.

### Database/migration decision và phần deferred

Goal 2 không tạo bảng dashboard, migration, index hay database data; không sửa migration V1–V34,
scoring, session, recovery hoặc persistence behavior.

Frontend production được nối với endpoint trong Goal 3A theo chuỗi:

```text
backend response → runtime validator → pure mapper → DashboardViewModel → page
```

Anonymous/local fallback, merge local/backend, telemetry, production data reconciliation và rollout
không thuộc Goal 2.

## Goal 3A — Authenticated frontend integration

Goal 3A đã hoàn thành review và được commit riêng tại
`655702f48522faed9f5ce1691be190c7b582a117` với message
`feat(dashboard): connect authenticated analytics API`. Commit không chứa thay đổi
`frontend/public/data/exams/exam-dataset-build.json` đã tồn tại từ trước và không được push trong Goal 3B1.

### API client và validation boundary

`frontend/src/services/dashboardAnalyticsApi.ts` gọi:

```text
GET /api/exams/dashboard-analytics?range=<7d|30d|90d|all>&recentLimit=5
```

Client tái sử dụng `apiGet`, nên giữ nguyên base URL, HttpOnly-cookie credentials và refresh convention
của ứng dụng. `AbortSignal` được truyền xuyên boundary. Payload được giữ là `unknown` cho tới khi
`validateDashboardAnalyticsResponseV1` thành công; payload sai contract không được map hoặc render.
Error được phân loại thành 401, 403, 400, contract, transport, timeout, abort, 5xx và unknown mà không
đưa raw response vào error message/log.

### Hook, auth và range

`frontend/src/features/dashboard/usePersonalLearningDashboard.ts` điều phối source và state:

- auth đang restore: loading, không request;
- anonymous: sign-in state không KPI giả, không request và không đọc localStorage;
- authenticated: backend-only;
- explicit `?fixture=...` trong DEV: fixture-only, không HTTP;
- range mặc định `30d`; mọi thay đổi `7d/30d/90d/all` tạo request mới;
- retry tạo request mới;
- abort + request version ngăn response cũ ghi đè range/user mới;
- owner key và derived loading/anonymous state ngăn dữ liệu user cũ xuất hiện khi logout/switch user;
- 401/403/5xx/contract không local-fallback;
- partial coverage tiếp tục hiển thị mapper notice cùng số liệu hợp lệ.

`PersonalLearningDashboardPage.tsx` giữ presentation/layout/scroll hiện có và chuyển orchestration sang
hook. Empty authenticated và anonymous sign-in được trình bày riêng.

### Validation Goal 3A

Kết quả trước full validation gate:

```text
targeted dashboard + API client PASS — 7 files, 94 tests
full frontend tests PASS — 42 files, 254 tests
TypeScript PASS
targeted ESLint PASS
production build PASS
production fixture marker scan PASS
```

Real backend/browser smoke: **CANNOT CONFIRM** nếu không có verified QA account/session sẵn; không tạo
user, bypass verification hoặc đọc credential.

## Goal 3B1 — Local analytics foundation

Goal 3B1 đã triển khai local foundation dưới
`frontend/src/features/dashboard/localAnalytics/` và dừng tại **REVIEW GATE**. Toàn bộ thay đổi Goal 3B1
đang unstaged, chưa commit và chưa push. `PersonalLearningDashboardPage` và
`usePersonalLearningDashboard` không import hoặc gọi local scanner/aggregator/mapper.

### Local storage source map đã xác minh

| Source | Writer / reader thực tế | Shape và identity | Owner / authority | Summary | Deep / quyết định |
|---|---|---|---|---|---|
| `v2_result_{sessionId}` | `writeResultToLS` / `readResultFromLS`, `getAllV2Results`; custom fallback cũng ghi qua cùng writer | `ExamResultV2`, không schema discriminator; `sessionId`, optional `serverSessionId`/`clientSubmissionId`; score/duration/submittedAt | owner chỉ khi `userId`/`ownerId` explicit hoặc recovery correlation; thiếu bằng chứng là device-legacy-unscoped; authority giữ nguyên/default legacy | Có cho hai V1 modes | Question-type nếu `questions` parse được; topic/cognitive chỉ khi immutable `questionSnapshots` nhúng trong result |
| `exam_api_result_{sessionId}` | `writeApiResult` / `readApiResult` trong `useApiTimedSession.ts` | exact `ResultSnapshotV2`, `snapshotSchemaVersion=2`, server `sessionId`, summary và reviewed questions | snapshot không tự có owner; chỉ recovery correlation mới nâng thành authenticated-owner; giữ exact backend authority triple | Có | Full immutable detail: question type, answer/correct answer, completion, topicRefs và cognitive |
| `custom_exam_session_{sessionId}` | `saveCustomSession` / `loadCustomSession` | `CustomExamSession`, có snapshots/answers nhưng không có persisted score | không đủ owner/authority cho attempt hoàn tất | Không | Exclude: không rescore standalone session và không thay writer/scoring |
| `exam_submission_recovery_queue_v1` | `enqueueRecovery`, private `readAll`, `pendingRecoveryCount` | `RecoveryQueueItem storageVersion=1`; ownerId, client/server/local IDs, optional `localResult` | owner-scoped correlation; pending dùng đúng terminal-state policy hiện có | Chỉ optional `localResult` khi không có bản ghi khác | Queue annotate owner/IDs/pending và hỗ trợ dedupe; không tạo attempt thứ hai, không mutate/flush/retry |
| `exam_result_{examId}` | `submitExam` / `getExamResult` trong `examService.ts` | legacy `ExamResult`; stable `examId`; `score10`, duration, submittedAt, config.mode | optional `userId`; thiếu owner là device-legacy-unscoped; frontend legacy | Có cho `thpt_mock/custom`; practice exclude | Summary-only; answersReview không đủ immutable metadata an toàn cho deep analytics |
| `exam_history` | `submitExam` / `getExamHistory` trong `examService.ts` | array của cùng legacy `ExamResult`; dedupe theo exact identity với `exam_result_*` | như trên | Có khi exact legacy shape hợp lệ | Summary-only; practice/unknown shape unsupported |
| `exam_session_token_*` | `saveAnonymousSessionToken` / `readAnonymousSessionToken` | anonymous session token | credential-like secret | Không | Explicit deny: scanner không gọi `getItem` cho prefix này |
| `exam_api_session_draft_*`, `exam_api_session_locator_*`, `exam_session_*` | session/draft/locator writers hiện có | session metadata/progress, không phải completed result | không dùng để tự suy owner | Không | Không nằm trong result allowlist; không đọc |

Raw answers/correct answers chỉ tồn tại tạm trong từng adapter để sinh count an toàn. Chúng không nằm trong
`LocalDashboardAttemptV1`, analytics result, error, notice hoặc log.

### Repository, owner scope và dedupe

- Allowlist duy nhất: bốn prefixes `exam_api_result_`, `v2_result_`, `custom_exam_session_`,
  `exam_result_` và hai exact keys `exam_history`, `exam_submission_recovery_queue_v1`.
- Hard cap: tối đa 1.000 matching keys, 500 normalized attempts sau dedupe và 2 MiB ký tự cho mỗi payload;
  caller chỉ có thể hạ, không thể nâng các cap này. Corrupt/oversized/read-error bị skip và chỉ tăng diagnostic.
- Owner scopes: `anonymous`, `authenticated-owner`, `device-legacy-unscoped`, `unknown`, `conflicting`.
  Không suy owner từ user đang login, title, examId, timestamp, session ID hoặc key prefix. Conflict bị exclude.
- Owner filter là input thuần: anonymous, exact authenticated owner key, device-local hoặc
  all-for-diagnostics chỉ dành test/dev.
- Dedupe deterministic theo exact `serverSessionId`, `clientSubmissionId`, `sessionId + compatible owner`,
  `localSessionId + compatible owner`, rồi source stable ID. Không dùng score/title/time heuristic.
- Winner ưu tiên immutable detail rồi source priority: cached API snapshot, richer local snapshot,
  recovery local result, legacy detail và summary-only. Metadata chỉ merge khi identity/owner tương thích.

### Normalized model và aggregation

`LocalDashboardAttemptV1` là model nội bộ, không phải wire DTO và không serialize lên network. Nó chỉ giữ
identity/provenance/owner, V1 mode, summary fields, safe question evidence counts, detail status và pending
metadata; không giữ raw JSON, answer objects, correct-answer snapshots, token, email hoặc JWT.

`LocalDashboardAnalyticsResultV1` là local-only facts model. Aggregator dùng policy `dashboard-v1`:

- modes `TIMED_ORIGINAL` / `CUSTOM_MOCK`, range theo `Asia/Ho_Chi_Minh`;
- MCQ là một unit, T/F là từng statement; blank/partial được tính riêng;
- topic dùng distinct attempt count; cognitive chỉ dùng metadata immutable có thật;
- thresholds 8 units/2 attempts, bands 80/60, confidence 16/3 và 30/5;
- trend tối đa 50, recent tối đa 5;
- exact backend authority triple trong cache mới được đếm backend-official; local/legacy không được nâng authority;
- malformed, unsupported, owner conflict, oversize, read error hoặc cap đều làm coverage incomplete.

Pure mapper local → `PersonalLearningDashboardViewModel` đã có notice device-only/local-fallback, partial
coverage và pending recovery; bỏ topic insufficient khỏi weaknesses. Mapper chưa được wired production.

### Validation và Goal 3B2 deferred

Validation Goal 3B1 tại review gate:

```text
targeted local analytics PASS — 4 files, 61 tests
full frontend tests PASS — 46 files, 315 tests
TypeScript PASS
targeted local analytics ESLint PASS, zero warnings
production build PASS — 4,162 modules transformed
production bundle marker scan PASS — không UI fixture, synthetic fixture/answer/token marker hoặc local foundation chưa wired
```

Build data pre-step đã được chạy trong một backup/restore boundary; bốn tracked `public/data/exams` artifacts
được khôi phục byte-for-byte sau build. Thay đổi có trước Goal tại `exam-dataset-build.json` vẫn giữ nguyên và
không thuộc Goal 3B1.

Goal 3B2 mới được phép quyết định source filter và presentation cho anonymous, legacy device-local và
backend-off fallback. Cho tới đó anonymous vẫn là sign-in state, backend failure vẫn là error state và không
có backend/local merge.

## Rollback Goal 1

Không dùng rollback toàn repository vì working tree có thay đổi tồn tại trước Goal 1. Để hoàn tác
riêng Goal 1:

1. Xóa các file mới trong `frontend/src/features/dashboard/` liên quan analytics, validator, policy,
   mapper, formatter, development fixtures và test tương ứng.
2. Xóa `data/dashboard-analytics-fixtures/`.
3. Khôi phục riêng các hunk Goal 1 trong `dashboardFixtures.ts`,
   `PersonalLearningDashboardPage.tsx` và các test component.
4. Khôi phục riêng các hunk cập nhật trong `docs/dashboard-exams/`, rồi xóa tài liệu progress này.
5. Không chạm các thay đổi có trước ở `frontend/public/data/exams/`, việc di chuyển tài liệu, backend
   hoặc `data/exams`.

Nên rollback theo commit/hunk sau khi Goal 1 được commit riêng; không dùng `git reset --hard` hoặc
restore toàn working tree.
