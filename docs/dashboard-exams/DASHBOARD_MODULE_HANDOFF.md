# User Dashboard Module Handoff

> Tài liệu độc lập dành cho AI/agent tiếp nhận module dashboard người dùng.  
> Mục tiêu: hiểu module đang làm gì, dữ liệu nào được dùng, phần frontend/backend đang ở đâu và cần tiếp tục thế nào mà không phải đọc toàn bộ source code.

**Cập nhật:** 2026-07-24  
**Repository:** `D:/KLTN/lich-su-viet-nam-3d`  
**Frontend:** `D:/KLTN/lich-su-viet-nam-3d/frontend`  
**Route:** `/exams/thong-ke`

---

## 1. Tóm tắt một câu

Đây là dashboard học tập cá nhân cho người dùng ôn thi Lịch sử THPT: tổng hợp kết quả làm bài, xu hướng điểm, chủ đề mạnh/yếu, hiệu suất theo dạng câu, mức nhận thức, phạm vi dữ liệu và các bước học tiếp theo.

Module hiện tại có **frontend presentation hoàn chỉnh**, Goal 1 data boundary, backend Dashboard
Analytics API V1 của Goal 2 và authenticated frontend integration của Goal 3A. Fixture development
được tách khỏi docs; wire DTO V1 có runtime validator, policy `dashboard-v1` và mapper DTO → ViewModel.
Frontend production gọi authenticated endpoint đọc `exam_v2_attempts`; anonymous chỉ thấy sign-in
state. Goal 3B1 đã bổ sung local analytics foundation thuần (allowlisted scanner, adapters, owner scope,
dedupe, aggregation và ViewModel mapper), nhưng chưa nối foundation này vào page/hook production. Vì vậy
anonymous vẫn chưa thấy local KPI, backend-off vẫn là error state và module không merge local với backend.

---

## 2. Trạng thái FE/BE hiện tại

### 2.1. Frontend

Frontend dashboard đã hoàn thành presentation và authenticated backend behavior:

- Có route `/exams/thong-ke`.
- Route được lazy-load trong App và có fallback loading.
- Có layout desktop/tablet/mobile.
- Có light theme và dark preview bằng query `theme=dark` trong môi trường development.
- Có 10 fixture bao phủ ready, loading, error, empty, one-attempt, anonymous, fallback, partial data và dữ liệu dài/nhiều.
- 10 fixture runtime nằm tại `frontend/src/features/dashboard/__fixtures__/`; bản docs chỉ là tài liệu tham chiếu.
- Static imports fixture nằm trong `dashboardDevelopmentFixtures.ts`, được nạp qua dynamic DEV-only boundary.
- Production bundle không chứa fixture; authenticated non-fixture flow gọi backend API thật.
- `dashboardAnalyticsApi.ts` dùng API client/cookie convention hiện có và validate payload trước mapper.
- `usePersonalLearningDashboard.ts` điều phối auth, range, cancellation, stale-response protection, retry và lỗi.
- Anonymous không gọi API, không đọc localStorage và chỉ hiện CTA đăng nhập.
- 401/403/transport/5xx/contract error không local-fallback; Goal 3A không silent merge.
- Local foundation Goal 3B1 chỉ đọc exact result/history/recovery allowlist qua API thuần có hard cap;
  production hook/page chưa gọi nó.
- Token/auth/session credential keys không thuộc allowlist và không bị đọc.
- Legacy result thiếu bằng chứng owner được phân loại device-legacy-unscoped, không phải dữ liệu account.
- Wire contract V1 nằm ở `dashboardAnalyticsTypes.ts`; validator từ chối enum/count/range/coverage sai và unknown fields.
- Policy thuần `dashboard-v1` khóa modes, threshold, confidence và authority triples.
- Mapper thuần `dashboardMappers.ts` tạo ViewModel, recommendation, labels/routes/notices mà không fetch, auth, localStorage hay raw snapshot.
- Có xử lý accessibility semantics, focus-visible, progressbar semantics và live status.
- Đã sửa scroll architecture:
  - `.app-scroll-container` là scroll owner.
  - Utility rail nằm trong document flow.
  - Utility rail không sticky.
  - AppHeader là sticky element duy nhất.
  - Không tạo scrollbar lồng cho main column hoặc utility rail.

### 2.2. Backend

Backend Dashboard Analytics API V1 **đã được triển khai trong Goal 2 và được frontend Goal 3A gọi**:

- Endpoint: `GET /api/exams/dashboard-analytics?range=30d&recentLimit=5`.
- Bắt buộc authenticated; owner lấy từ principal; anonymous trả `401`.
- Đọc projection có giới hạn từ `exam_v2_attempts`, chỉ gồm `TIMED_ORIGINAL` và `CUSTOM_MOCK`.
- Mỗi request dùng ba repository operation: included count, excluded-mode count và một bounded fetch;
  không có N+1 và không join current question bank.
- Parse immutable result snapshot schema v2 cho topic/cognitive/question-type analytics.
- Summary vẫn được giữ khi detail của một attempt unsupported/malformed; coverage phản ánh phần bị
  cap, thiếu hoặc malformed.
- Response Java khớp `DashboardAnalyticsResponseV1` và bốn golden fixtures của Goal 1.
- Không trả raw result JSON, answers, correct answers, explanations hoặc PII.
- Không có persistence riêng cho dashboard, bảng dashboard, migration hoặc index mới.
- Không rescore, không sửa scoring/session/recovery và không đồng bộ local/server data.

Vì vậy, trạng thái hiện tại nên được hiểu là:

| Phần | Trạng thái |
|---|---|
| Presentation FE | Hoàn thành |
| Mock fixture/state handling | Hoàn thành |
| Scroll/responsive/accessibility | Hoàn thành và đã QA |
| Dashboard API wire contract V1 | Hoàn thành ở frontend |
| Runtime validator/policy/mapper | Hoàn thành ở frontend |
| Production fake fixture | Đã loại bỏ |
| Backend Analytics API V1 | Hoàn thành, commit `195db79f` |
| Dashboard API client/hook | Hoàn thành Goal 3A, commit `655702f4` |
| Backend aggregation | Đã triển khai trên immutable attempt snapshot |
| Authenticated real-data integration | Đã triển khai; real browser smoke cần verified QA session |
| Local analytics foundation | Đã triển khai Goal 3B1, unstaged tại review gate; chưa wired production |
| Anonymous/local/offline presentation | Chưa triển khai; deferred Goal 3B2 |
| Scoring/weakness/cognitive engine | Ngoài phạm vi dashboard hiện tại |

---

## 3. Git và các nhánh liên quan

### Nhánh dashboard

Nhánh hiện tại cần kiểm tra bằng Git trước mỗi Goal. Tại Goal 1:

- **Branch:** `dashboard_exams`
- **Goal 1 commit / Goal 2 baseline:** `0edd68166609cbc1228c79e5218dc91038e75ac7`
- **Goal 2 commit / Goal 3A baseline:** `195db79f4b2055e97bbd02909ce7f1a2ba4134ca`
- **Goal 3A commit / Goal 3B1 baseline:** `655702f48522faed9f5ce1691be190c7b582a117`
- Dashboard commit lịch sử: `878571186afda4744d2a4106bd2d37502e3734ab`

Commit gồm:

- route/lazy loading dashboard;
- dependency `recharts`;
- dashboard feature;
- mock data và handoff artifacts của dashboard;
- ảnh QA presentation V3.

### Nhánh backend/exam

Nhánh làm việc backend/exam được chỉ định là `be_exams`.

Những thay đổi backend/exam/data trên `be_exams` không phải là phần Goal 1 và không được tự động
gộp. Source audit đã xác nhận không cần merge/cherry-pick để thực hiện Goal 1.

### Quy trình tiếp tục đề xuất

Khi backend trên `be_exams` hoàn thiện:

```bash
cd D:/KLTN/lich-su-viet-nam-3d
git switch dashboard_exams
git merge be_exams
```

Sau đó kiểm tra xung đột ở `frontend/src/App.tsx`, `frontend/package.json`, `frontend/package-lock.json` nếu backend branch có chạm vào các file này.

---

## 4. Người dùng nhìn thấy gì?

Dashboard được tổ chức thành hai vùng:

```text
Dashboard page
├── Page header
│   ├── Eyebrow: LUYỆN THI THPT
│   ├── Tổng quan học tập
│   ├── Description
│   ├── Date/source scope
│   └── Range filter: 7 ngày / 30 ngày / 90 ngày / Tất cả
│
├── Main column
│   ├── Recommendation hero
│   ├── KPI group
│   ├── Score trend chart
│   ├── Strength / weakness insight
│   ├── Question-type performance
│   └── Recent history
│
└── Utility rail
    ├── Nhịp học tập
    ├── Mức nhận thức
    ├── Phạm vi dữ liệu
    └── Bước tiếp theo
```

### 4.1. Page header

Giữ các nội dung:

- `Luyện thi THPT`
- `Tổng quan học tập`
- mô tả ngắn về việc xem lại kết quả và chọn bước ôn tập tiếp theo;
- khoảng ngày và nguồn dữ liệu;
- range filter.

Range filter chỉ giữ deterministic presentation behavior trong explicit development fixture mode.
Authenticated non-fixture flow gọi endpoint thật cho từng range; anonymous không gọi API.

### 4.2. Recommendation hero

Hero hiển thị chủ đề nên ôn tiếp:

- eyebrow;
- topic title;
- reason;
- 4 evidence blocks:
  - Độ chính xác;
  - Kết quả đúng/tổng;
  - Số bài;
  - Độ tin cậy;
- CTA ôn chủ đề.

Hero dùng tint đỏ nâu nhẹ, không dùng gradient mạnh và không tạo bốn nested card.

Nếu recommendation không có evidence, hero chỉ hiển thị reason và CTA. Đây là trường hợp one-attempt.

### 4.3. KPI group

Có đúng bốn chỉ số:

1. Số bài đã làm.
2. Điểm trung bình.
3. Điểm cao nhất.
4. Điểm gần nhất.

KPI dùng một major surface, bốn internal stat blocks, icon nhỏ, label, value lớn và unit.

### 4.4. Score trend

Chart là visual anchor của main column:

- trục Y từ 0 đến 10;
- area fill nhẹ;
- line và markers;
- marker riêng cho điểm cao nhất và điểm gần nhất;
- thông tin số điểm đang hiển thị;
- số bài nguồn;
- cảnh báo khi chuỗi điểm chưa bao phủ toàn bộ nguồn;
- textual summary;
- expandable data details.

Chart hiện dùng Recharts trong presentation layer. Không được coi chart mock là nguồn scoring chính thức.

### 4.5. Strength / weakness insight

Đây là một major card thống nhất, không phải hai card độc lập:

- `Điểm mạnh`
  - icon semantic strength;
  - số lượng topic;
  - threshold từ 80%;
  - topic rows;
  - accuracy;
  - progress;
  - metadata `ý đúng · số bài · độ tin cậy`;
  - không có CTA lặp lại dưới từng topic.

- `Cần cải thiện`
  - icon semantic weakness;
  - số lượng topic;
  - threshold dưới 60%;
  - weakness rows có link/arrow;
  - một CTA chung `Ôn các chủ đề yếu`.

One-attempt không render hai cột rỗng. Thay vào đó hiển thị unified insufficient card với thông báo chưa đủ dữ liệu để gắn nhãn.

### 4.6. Question-type performance

Là một major card riêng ở main column:

- Trắc nghiệm;
- Đúng/Sai theo mệnh đề;
- accuracy lớn;
- progress bar;
- summary về đúng, bỏ trống và câu làm dở;
- icon theo dạng câu.

Cognitive performance không còn nằm trong card này.

### 4.7. Recent history

Hiển thị tối đa 5 bài gần nhất:

- score badge;
- title;
- mode;
- submitted time;
- duration;
- số câu;
- trạng thái dữ liệu chi tiết;
- action `Xem lại`;
- link xem toàn bộ lịch sử.

---

## 5. Utility rail

Utility rail là static document-flow content, không sticky.

### 5.1. Nhịp học tập

Hiển thị dạng stat overview:

- số ngày hoạt động;
- tổng thời gian;
- note: `Số ngày có bài thi trong kỳ đã chọn`.

Không dùng khái niệm streak vì dữ liệu hiện tại không chứng minh chuỗi liên tục.

### 5.2. Mức nhận thức

Ba nhóm:

- Nhận biết;
- Thông hiểu;
- Vận dụng.

Mỗi item có:

- accuracy;
- progress;
- correct/total;
- số bài;
- confidence;
- trạng thái khi cần: Điểm mạnh, Đang phát triển hoặc Chưa đủ dữ liệu.

### 5.3. Phạm vi dữ liệu

Card ngắn gọn hiển thị:

- Tổng bài;
- Đủ dữ liệu chi tiết;
- Bài nguồn biểu đồ;
- Điểm trên biểu đồ.

Notice đáy card:

`Điểm phục vụ mục đích học tập, chưa được máy chủ chấm lại.`

Các notice partial, fallback, anonymous vẫn nằm ở đầu page theo state/fixture.

### 5.4. Bước tiếp theo

Các action có thể xuất hiện:

- Duyệt kho đề;
- Tạo đề tùy chọn;
- Ôn chủ đề yếu;
- Xem toàn bộ lịch sử.

Mỗi row là một link có icon, title, description, arrow, hover/focus surface và touch target tối thiểu 44px.

---

## 6. Dashboard View Model

Frontend không muốn nhận trực tiếp dữ liệu database rời rạc. Nó mong muốn một view model tổng hợp ở cấp dashboard.

Các nhóm dữ liệu chính:

```text
PersonalLearningDashboardViewModel
├── state
├── scope
├── summary
├── recommendations[]
├── scoreTrend
├── strengths[]
├── weaknesses[]
├── questionTypePerformance[]
├── cognitivePerformance[]
├── recentAttempts[]
├── coverage
└── notices[]
```

### 6.1. `state`

Giá trị logic:

- `loading`
- `error`
- `empty`
- `ready`

State quyết định renderer, không phải CSS.

### 6.2. `scope`

Mô tả phạm vi dữ liệu:

- source: local, backend, local-fallback hoặc merged;
- range: 7d, 30d, 90d hoặc all;
- timezone;
- authenticated;
- from date;
- exclusive end date.

### 6.3. `summary`

Các aggregate cần cho KPI và activity:

- totalAttempts;
- averageScore;
- highestScore;
- latestScore;
- totalDurationSeconds;
- activeDays;
- mcqAccuracy;
- tfStatementAccuracy;
- blankRate;
- tfPartialRate.

Scoring engine phải tạo ra các aggregate này hoặc adapter backend phải map đúng ý nghĩa. Không để presentation tự tính lại điểm thi.

### 6.4. `recommendations`

Mỗi recommendation có:

- id;
- title;
- reason;
- actionLabel;
- actionRoute;
- priority;
- topicKey;
- evidence nullable.

Evidence có:

- accuracy;
- correctUnits;
- totalUnits;
- attemptCount;
- confidence.

### 6.5. `scoreTrend`

Gồm:

- granularity: attempt hoặc day;
- isComplete;
- sourceAttemptCount;
- points[].

Mỗi point có:

- attemptId;
- submittedAt;
- dateLabel;
- score;
- mode;
- title.

### 6.6. `strengths` và `weaknesses`

Mỗi learning insight có:

- key;
- label;
- status;
- accuracy;
- correctUnits;
- totalUnits;
- attemptCount;
- confidence;
- practiceRoute;
- summary.

Status được presentation hiểu là:

- strength;
- developing;
- weakness;
- insufficient-data.

Frontend hiện chỉ trình bày nhãn đã có. Backend/analytics chịu trách nhiệm quyết định accuracy, threshold và status.

### 6.7. `questionTypePerformance`

Mỗi item có:

- type: `mcq` hoặc `true_false`;
- label;
- accuracy nullable;
- correctUnits;
- answeredUnits;
- blankUnits;
- totalUnits;
- partialQuestionCount;
- totalQuestionCount;
- textualSummary.

### 6.8. `cognitivePerformance`

Mỗi item có:

- level: knowledge, comprehension hoặc application;
- label;
- accuracy nullable;
- correctUnits;
- totalUnits;
- attemptCount;
- confidence;
- status;
- textualSummary.

### 6.9. `recentAttempts`

Mỗi attempt có:

- attemptId;
- title;
- mode;
- modeLabel;
- score;
- durationSeconds;
- submittedAt;
- submittedLabel;
- totalQuestions;
- resultRoute;
- detailStatus.

### 6.10. `coverage`

Phạm vi và độ đầy đủ:

- summaryAttemptCount;
- detailedAttemptCount;
- totalKnownAttempts;
- fetchLimit nullable;
- isComplete;
- capturesTimedOriginal;
- capturesCustomMock;
- capturesPractice;
- capturesRetry;
- message.

### 6.11. `notices`

Notice có:

- id;
- type;
- title;
- message;
- actionLabel nullable;
- actionRoute nullable.

Một số notice quan trọng:

- coverage-partial;
- partial-detail;
- insufficient-sample;
- device-only;
- backend-unavailable;
- empty-state.

---

## 7. Mock fixture hiện có

Development có thể chọn fixture bằng:

```text
/exams/thong-ke?fixture=<fixture-name>
```

Runtime copies:

```text
frontend/src/features/dashboard/__fixtures__/
```

Design/document copies vẫn được giữ tại:

```text
docs/dashboard-exams/dashboard-design-handoff/mock-data/
```

Danh sách đầy đủ:

| Fixture | Ý nghĩa |
|---|---|
| `default` | Ready đầy đủ, 12 bài, chart, strength và weakness |
| `loading` | Skeleton dashboard theo layout mới |
| `error` | Error state và retry |
| `empty` | Chưa có bài thi |
| `one-attempt` | Một bài, chưa đủ mẫu để kết luận strength/weakness |
| `anonymous` | Dữ liệu local/device-only và login CTA |
| `backend-fallback` | Backend không khả dụng, hiển thị local fallback warning |
| `partial-details` | Có tổng quan nhưng thiếu detail ở một phần bài |
| `long-content` | Kiểm tra text dài và wrapping |
| `many-attempts` | Kiểm tra nhiều dữ liệu, fetch cap và giới hạn history |

Fixture chỉ dùng để kiểm tra presentation/state. Không coi fixture là dữ liệu production.
Production build không static-import hoặc bundle 10 fixture này.

---

## 8. Luồng runtime ở mức khái niệm

```text
App
└── route /exams/thong-ke
    └── lazy dashboard page
        ├── DEV + explicit fixture query: dynamic-import fixture module, không HTTP
        ├── auth loading: loading skeleton, không HTTP
        ├── anonymous: sign-in state, không local analytics, không HTTP
        ├── authenticated: GET Dashboard Analytics V1
        │   └── runtime validator → mapper → ViewModel
        ├── render header
        └── render theo state
            ├── loading skeleton
            ├── error + retry
            ├── empty state
            └── ready dashboard
```

Trong ready state:

```text
ViewModel
├── ready notices
├── main narrative
└── utility rail
```

Range filter `7d/30d/90d/all` tạo request backend mới ở authenticated non-fixture flow; `recentLimit`
cố định là 5. Retry cũng tạo request mới. AbortController, request version và owner key ngăn response
cũ ghi đè range/user mới. Fixture QA giữ deterministic presentation behavior và không gọi backend.

---

## 9. Route và action contract

Dashboard có thể tạo link tới các route sau:

- `/exams/browse`
- `/exams/tao-de`
- `/exams/on-chu-de/<topic-key>`
- `/exams/lich-su`
- `/exams/ket-qua/<attempt-id>`
- `/login`

Backend integration không nên đổi route dashboard nếu chưa có yêu cầu product mới.

---

## 10. Scroll và responsive invariants

Các invariant bắt buộc giữ khi chỉnh sửa tiếp:

1. `.app-scroll-container` là scroll owner thực tế.
2. Không thêm `overflow-y: auto` cho utility rail.
3. Utility rail không dùng `position: sticky`.
4. Không thêm transform/contain/height cố định vào ancestor làm hỏng sticky AppHeader.
5. AppHeader là sticky element duy nhất.
6. Desktop dùng main column + utility rail.
7. Tablet chuyển utility xuống sau main.
8. Mobile một cột, KPI 2×2, insight xếp dọc.
9. Không có horizontal overflow ở 320px.
10. Không tạo nested scrollbar.

---

## 11. Accessibility và quality gates

Đã kiểm tra:

- landmark và heading hierarchy;
- `aria-live` cho announcement;
- `role="status"` cho loading;
- `role="alert"` cho error;
- `role="progressbar"` cho meter;
- focus-visible;
- link/action names;
- chart textual fallback;
- keyboard-friendly buttons and links.

Quality gates của presentation baseline tại thời điểm tạo handoff cũ:

```text
npm run build:data     PASS
npx tsc -b             PASS
npm run test:run       PASS — 13 test files, 60 tests
npm run build          PASS
```

Production build có cảnh báo bundle lớn từ Vite, nhưng không có build error.

Kết quả validation mới nhất của Goal 1 được ghi tại
`docs/progress/DASHBOARD_ANALYTICS_IMPLEMENTATION_PROGRESS.md`; không dùng số lượng test baseline
phía trên để đại diện cho Goal 1.

Quality gates Goal 1 ngày 2026-07-24:

```text
dashboard tests         PASS — 5 files, 57 tests
full frontend tests     PASS — 40 files, 217 tests
TypeScript              PASS
targeted dashboard lint PASS
production build        PASS
production fixture scan PASS — không có fixture/mock marker
```

---

## 12. Browser QA đã thực hiện

Đã render và kiểm tra:

- 1440×900 light;
- 1366×768 light;
- 1280×720;
- 768×1024;
- 390×844;
- 360×800;
- 320×568;
- 1440×900 dark;
- one-attempt;
- loading;
- error;
- toàn bộ 10 fixture.

Ảnh QA nằm trên nhánh `dashboard_exams` tại:

```text
docs/dashboard-exams/dashboard-design-handoff/references/v3/
```

---

## 13. Goal 1 contract, Goal 2 backend và Goal 3A frontend integration

Goal 1 đã khóa các artifact:

```text
frontend/src/features/dashboard/dashboardAnalyticsTypes.ts
frontend/src/features/dashboard/dashboardAnalyticsValidation.ts
frontend/src/features/dashboard/dashboardAnalyticsPolicy.ts
frontend/src/features/dashboard/dashboardMappers.ts
data/dashboard-analytics-fixtures/
```

Backend Goal 2 đã tái sử dụng semantic contract/golden fixtures này và triển khai:

```text
backend/src/main/java/com/lichsuvn/backend/exam/api/DashboardAnalyticsController.java
backend/src/main/java/com/lichsuvn/backend/exam/api/dto/DashboardAnalyticsResponse.java
backend/src/main/java/com/lichsuvn/backend/exam/application/DashboardAnalyticsService.java
backend/src/main/java/com/lichsuvn/backend/exam/application/DashboardAnalyticsAggregator.java
backend/src/main/java/com/lichsuvn/backend/exam/application/DashboardSnapshotV2Parser.java
backend/src/main/java/com/lichsuvn/backend/exam/application/DashboardAnalyticsPolicy.java
```

Backend facts quan trọng:

- Calendar range được tính tại `Asia/Ho_Chi_Minh`, lower inclusive và upper exclusive.
- Fetch cap mặc định/tối đa 500; response coverage không giả vờ bao phủ toàn bộ khi bị cap.
- Summary dùng denormalized columns; deep analytics chỉ dùng parseable immutable snapshot v2.
- Official, recovered và frontend legacy được phân loại riêng; invalid authority bị loại.
- MCQ dùng question unit, T/F dùng statement unit.
- Topic dùng historical slug/label trong snapshot; unknown cognitive không làm snapshot malformed.
- Malformed/unsupported detail không làm toàn endpoint thất bại.
- Không có query sang current question bank, rescore, dashboard table, migration hoặc index.

Validation Goal 2:

```text
targeted backend dashboard tests PASS — 34 tests
dashboard + exam session/recovery tests PASS — 49 tests
backend regression excluding missing history-rag artifact PASS — 239 tests, 15 skipped
backend package PASS
frontend regression PASS — 40 files, 217 tests
TypeScript PASS
production build PASS
```

`.\mvnw.cmd clean test` còn một error ngoài module:
`HistoryRagPackageReaderTest` yêu cầu `data/history-rag/v1`, nhưng artifact này không tồn tại trong
repository hiện tại. Không được tạo/sửa artifact ngoài phạm vi chỉ để làm test đó pass.

Corrective review đã tái hiện cùng error trên detached clean worktree tại commit Goal 1 `0edd6816`,
trước khi có bất kỳ source Goal 2 nào. Baseline compile và Spring context đều đạt; failure chỉ xảy ra
trong `HistoryRagPackageReaderTest.validatesGeneratedPackageAndBaselineCounts`, từ
`HistoryRagPackageReaderTest.java:18` đến fail-fast directory check tại
`HistoryRagPackageReader.java:73`. Không file Dashboard analytics, exam attempt/session,
`ExamAttemptRepository` hay `ExamAttemptEntity` import/call History RAG.

Verdict chính thức: **PRE_EXISTING_OUT_OF_SCOPE_BLOCKER**. Đây là residual full-repository validation
issue, không phải Dashboard blocker và không ngăn Goal 2 chuyển sang review hoặc Goal 3. Không được
tuyên bố full-suite PASS trong khi artifact vẫn thiếu.

Read-only TiDB/EXPLAIN là **CANNOT CONFIRM** do chưa có verified QA token hoặc read-only development
connection được xác nhận an toàn.

### Goal 3A — API client và orchestrator

Goal 3A đã nối chuỗi:

```text
API response
└── runtime validator
    └── dashboard mapper
        └── PersonalLearningDashboardPage
```

Mapper hiện chịu trách nhiệm:

- map source/scope;
- map aggregate summary;
- map chart points;
- map topic insights;
- map question-type;
- map cognitive;
- map recent attempts;
- map coverage;
- map notices.

API client: `frontend/src/services/dashboardAnalyticsApi.ts`.

Hook: `frontend/src/features/dashboard/usePersonalLearningDashboard.ts`.

Client dùng API/cookie convention hiện có, giữ payload là `unknown` và chỉ trả DTO sau runtime
validation. Hook quản lý auth loading/anonymous/authenticated, range, timeout, cancellation, retry,
partial coverage và stale owner/range protection.

### Giữ fixture development-only

Trong development/test vẫn giữ fixture. Không xóa fixture chỉ vì API đã có.

Boundary hiện tại:

- production/authenticated: backend API;
- production/anonymous: sign-in state không KPI giả;
- development có explicit `fixture`: fixture resolver, không HTTP;
- development không fixture: cùng backend/auth flow như production;
- component luôn nhận cùng một ViewModel shape.

### Auth và failure policy Goal 3A

- Auth loading không request.
- Anonymous không request và không local analytics.
- 401 yêu cầu đăng nhập lại; 403 hiển thị access error.
- Transport/timeout/5xx/contract error có retry nhưng không local fallback.
- Logout/user switch xóa dữ liệu owner trước khỏi view và abort request cũ.
- Partial response hợp lệ vẫn render số liệu cùng mapper coverage notice.

### Kiểm thử integration Goal 3A

Đã thêm test API client, hook và component cho URL/range/recentLimit, signal, validator, auth states,
ready/empty/partial/error/retry, 401/403/5xx/contract, stale range, logout/user switch, unmount abort và
DEV fixture suppression. Goal 3A chủ ý không có source merged local + backend.

Validation Goal 3A:

```text
targeted dashboard + API client PASS — 7 files, 94 tests
full frontend tests PASS — 42 files, 254 tests
TypeScript PASS
targeted ESLint PASS
production build PASS
production fixture marker scan PASS
real backend/browser smoke CANNOT CONFIRM — không có verified QA session
```

### Goal 3B1 — Local analytics foundation (chưa wired production)

Foundation nằm tại `frontend/src/features/dashboard/localAnalytics/`:

- `localDashboardTypes.ts`: `LocalDashboardAttemptV1`, local facts, diagnostics và owner filters;
- `localDashboardAdapters.ts`: adapter riêng cho cached snapshot v2, v2 legacy/custom result,
  old result/history và optional recovery local result;
- `localDashboardRepository.ts`: allowlisted bounded scanner, recovery annotation, owner filter và dedupe;
- `localDashboardAggregator.ts`: policy V1 cho summary/trend/topic/cognitive/question type/coverage;
- `localDashboardMappers.ts`: pure local facts → existing dashboard ViewModel;
- `__tests__/`: chỉ synthetic fixtures, không credential hoặc nội dung đề production.

Allowlist scanner chỉ đọc:

```text
exam_api_result_*
v2_result_*
custom_exam_session_*
exam_result_*
exam_history
exam_submission_recovery_queue_v1
```

Scanner không đọc `exam_session_token_*`, auth/JWT/refresh keys, cookies, session drafts/locators hoặc mọi
unknown localStorage value. Hard caps là 1.000 matching keys, 500 attempts sau dedupe và 2 MiB ký tự/payload;
options không thể nâng các hard caps.

Owner policy là conservative: chỉ explicit owner metadata hoặc exact recovery correlation mới tạo
`authenticated-owner`; explicit anonymous mới là `anonymous`; record cũ không chứng minh được nguồn là
`device-legacy-unscoped`; explicit unknown là `unknown`; conflicting metadata bị exclude. Không claim dữ liệu
anonymous/unscoped sau login và không suy owner từ title/examId/time/key/session prefix.

Dedupe hierarchy: exact server session, client submission, session + compatible owner, local session +
compatible owner, rồi source stable ID. Không dùng cùng score/title/time. Recovery queue chỉ annotate owner,
IDs và pending state hoặc cung cấp optional local result khi chưa có nguồn khác; nó không trở thành attempt thứ
hai và scanner không mutate/flush/retry queue.

Summary KPI chấp nhận exact supported legacy shape nếu score/time/mode hợp lệ. Deep analytics chỉ dùng immutable
detail parseable; thiếu topic/cognitive vẫn có question-type analytics nhưng coverage tương ứng thấp hơn. Không
join current question bank, không rescore và raw answers/correct keys không rời adapter dưới dạng output/log/API.

Local authority luôn giữ provenance gốc. Chỉ cached snapshot có exact
`BACKEND + SERVER + SERVER_ON_TIME` mới tăng backend-official count; local fallback/legacy không được nâng thành
official.

Validation Goal 3B1 tại review gate:

```text
targeted local analytics PASS — 4 files, 61 tests
full frontend tests PASS — 46 files, 315 tests
TypeScript PASS
targeted local analytics ESLint PASS, zero warnings
production build PASS — 4,162 modules transformed
production bundle marker scan PASS
```

### Deferred Goal 3B2

Goal 3B2 mới quyết định owner filter và nối local foundation vào UI. Hiện tại:

- anonymous vẫn là sign-in state, không local KPI;
- backend transport/5xx/contract failure vẫn là error state, không local fallback;
- production hook/page không import local foundation;
- không merge local với backend;
- device-legacy-unscoped không được gọi là account history.

---

## 14. Những điều không được làm tùy tiện

- Không đổi `DashboardViewModel` chỉ để làm UI thuận tiện.
- Không đưa scoring hoặc weakness analysis vào component presentation.
- Không kết nối thẳng component tới database/backend client.
- Không đổi mock JSON khi chưa cập nhật contract.
- Không sửa AppHeader trong phạm vi dashboard.
- Không chuyển scroll owner sang window nếu app shell vẫn dùng `.app-scroll-container`.
- Không biến utility rail thành sticky hoặc scroll riêng.
- Không gộp các thay đổi MVP, database, backend exam hoặc data exam vào dashboard commit.

---

## 15. Kết luận handoff

Dashboard người dùng đã hoàn thành presentation, Goal 1 data boundary, backend Analytics API V1 của
Goal 2 và authenticated frontend integration của Goal 3A. Goal 2 đã commit tại `195db79f`; Goal 3A đã
commit riêng tại `655702f4`. Goal 3B1 local analytics foundation đã triển khai và đang dừng tại review
gate ở trạng thái unstaged, chưa commit/push.

Authenticated dashboard đã có đường end-to-end ở mức source; real browser/backend smoke vẫn cần một
verified QA account/session. Việc còn lại chính là:

1. review Goal 3B1 và chạy smoke authenticated backend khi có QA session an toàn;
2. ở Goal 3B2 riêng, quyết định owner filter/presentation và nối anonymous hoặc backend-off local analytics;
3. không silent merge local/backend;
4. ở Goal 4, chạy TiDB read-only profile/EXPLAIN và production reconciliation khi có quyền an toàn;
5. giữ nguyên presentation, accessibility và scroll invariants đã QA.
