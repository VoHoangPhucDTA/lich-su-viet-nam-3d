# User Dashboard Module Handoff

> Tài liệu độc lập dành cho AI/agent tiếp nhận module dashboard người dùng.  
> Mục tiêu: hiểu module đang làm gì, dữ liệu nào được dùng, phần frontend/backend đang ở đâu và cần tiếp tục thế nào mà không phải đọc toàn bộ source code.

**Cập nhật:** 2026-07-25
**Repository:** `D:/KLTN/lich-su-viet-nam-3d`  
**Frontend:** `D:/KLTN/lich-su-viet-nam-3d/frontend`  
**Route:** `/exams/thong-ke`

---

## 1. Tóm tắt một câu

Đây là dashboard học tập cá nhân cho người dùng ôn thi Lịch sử THPT: tổng hợp kết quả làm bài, xu hướng điểm, chủ đề mạnh/yếu, hiệu suất theo dạng câu, mức nhận thức, phạm vi dữ liệu và các bước học tiếp theo.

Module hiện tại có **frontend presentation hoàn chỉnh**, Goal 1 data boundary, backend Dashboard
Analytics API V1 của Goal 2 và authenticated frontend integration của Goal 3A. Fixture development
được tách khỏi docs; wire DTO V1 có runtime validator, policy `dashboard-v1` và mapper DTO → ViewModel.
Frontend production gọi authenticated endpoint đọc `exam_v2_attempts`; backend success luôn là backend-only.
Goal 3B1 đã bổ sung local analytics foundation thuần (allowlisted scanner, adapters, owner scope, dedupe,
aggregation và ViewModel mapper). Goal 3B2 đã nối foundation vào page/hook: anonymous chỉ dùng dữ liệu
explicit-anonymous, còn authenticated chỉ fallback sang local exact-owner khi network/timeout/502/503/504.
Module không merge local với backend và không gán dữ liệu device-unscoped cho anonymous hoặc tài khoản.
Goal 4 đã bổ sung cross-tab refresh exact-key, security/redaction audit, synthetic performance/bundle audit,
browser matrix và release checklist; Goal 4 đã commit tại `4cf7184f`.

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
- Anonymous không gọi API; chỉ scan local analytics với filter `ownerScope=anonymous`. Không có attempt phù hợp
  thì chỉ hiện CTA đăng nhập và không dựng KPI 0.
- Authenticated gọi backend trước. Chỉ network, timeout và HTTP 502/503/504 được exact-owner local fallback;
  400/401/403/404/409/429/500, contract, abort và unknown giữ error state.
- Local foundation Goal 3B1 chỉ đọc exact result/history/recovery allowlist qua API thuần có hard cap;
  Goal 3B2 gọi foundation qua source helper, không parse/aggregate trong hook hoặc page.
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
| Local analytics foundation | Hoàn thành Goal 3B1, commit `c88c2213` |
| Anonymous/local/offline presentation | Hoàn thành Goal 3B2, commit `76e69231`; Goal 4 hardening commit `4cf7184f` |
| Scoring/weakness/cognitive engine | Ngoài phạm vi dashboard hiện tại |

---

## 3. Git và các nhánh liên quan

### Nhánh dashboard

Nhánh hiện tại cần kiểm tra bằng Git trước mỗi Goal. Tại Goal 1:

- **Branch:** `dashboard_exams`
- **Goal 1 commit / Goal 2 baseline:** `0edd68166609cbc1228c79e5218dc91038e75ac7`
- **Goal 2 commit / Goal 3A baseline:** `195db79f4b2055e97bbd02909ce7f1a2ba4134ca`
- **Goal 3A commit / Goal 3B1 baseline:** `655702f48522faed9f5ce1691be190c7b582a117`
- **Goal 3B1 commit / Goal 3B2 baseline:** `c88c2213bd82b7738a19ab3edec02355f5aa46ea`
- **Goal 3B2 commit / Goal 4 baseline:** `76e69231e5b02006ad687026557384787b0d7a18`
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

- source: local, backend hoặc local-fallback; không có source merged;
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
        ├── anonymous: bounded local analytics với ownerScope=anonymous, không HTTP
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

### Auth và failure policy Goal 3A baseline (đã được Goal 3B2 mở rộng)

- Auth loading không request.
- Ở baseline Goal 3A, anonymous chỉ hiện sign-in state; Goal 3B2 hiện đã cho phép explicit-anonymous local
  analytics.
- 401 yêu cầu đăng nhập lại; 403 hiển thị access error.
- Goal 3A baseline không local fallback; Goal 3B2 chỉ fallback transport/timeout/502/503/504 với exact owner.
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

### Goal 3B1 — Local analytics foundation

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

Goal 3B1 đã được commit riêng tại `c88c2213bd82b7738a19ab3edec02355f5aa46ea`; commit không chứa
`frontend/public/data/exams/exam-dataset-build.json` và chưa được push.

### Goal 3B2 — Local production integration

Production source priority là:

1. explicit DEV fixture;
2. auth loading;
3. anonymous local;
4. authenticated backend;
5. authenticated exact-owner local fallback nếu backend unavailable;
6. error.

Anonymous chỉ nhận `ownerScope=anonymous`, không gọi backend và không đọc authenticated recovery queue. Nếu
không có summary-eligible attempt thì giữ sign-in state, không hiển thị KPI 0. Khi có dữ liệu, dashboard dùng
`source=local`, hiện privacy notice dữ liệu chỉ nằm trên thiết bị và CTA đăng nhập không che analytics.

Authenticated luôn gọi backend trước. Backend success là nguồn duy nhất; không cộng local attempts hoặc local
KPI/trend/topic/recent. Local fallback chỉ xảy ra với network/transport, timeout, HTTP 502, 503 hoặc 504 và
chỉ nhận `authenticated-owner` có owner key khớp tuyệt đối `currentUser.id` (cùng opaque ID convention với
`ownerId` của recovery queue). 400/401/403/404/409/429/500, contract, abort và unknown không fallback.
Không có exact-owner local attempt thì giữ backend error. Retry luôn thử backend trước; backend phục hồi thay
hoàn toàn ViewModel fallback.

`device-legacy-unscoped`, unknown, conflicting, anonymous hoặc owner khác không bao giờ tham gia authenticated
fallback; device-unscoped cũng không tham gia anonymous metrics. UI chỉ có count-only exclusion notice, không
title, score, detail route hoặc chức năng claim/import. Pending recovery chỉ là owner-scoped notice, không
tăng attempt/coverage và không tạo recent item trùng.

Local range dùng `submittedAt` theo `Asia/Ho_Chi_Minh`: 7/30/90 ngày calendar có lower bound inclusive,
ngày mai là upper bound exclusive; `all` không có lower bound và future timestamp bị loại. Range/retry scan
lại local source. Abort + generation/version check bảo vệ range, retry, logout, anonymous/login và user switch;
ViewModel owner cũ được xóa trước khi source mới chạy.

Recent local chỉ có route nếu cached API snapshot v2 hoặc valid `v2_result_*` cung cấp identity công khai an
toàn. Legacy/summary-only dùng action disabled `Chỉ tổng quan`; không tạo route bằng heuristic. Storage
unavailable không làm crash hoặc fabricate local dashboard.

Known limitations:

- cross-tab `storage` event refresh đã hoàn thành trong Goal 4: exact allowlist, `event.key === null`, debounce
  300 ms, không đọc `newValue`, cleanup listener/timer; mount/auth/source/range/retry vẫn scan dữ liệu mới;
- local analytics không tuyên bố account-wide completeness;
- device-unscoped/legacy không thể tự claim cho anonymous hoặc authenticated owner;
- real verified-account browser smoke **CANNOT CONFIRM**; authenticated behavior được kiểm thử mock/integration;
- DEV fixtures vẫn deterministic và production không dùng fixture.

Validation Goal 3B2 tại review gate:

```text
targeted dashboard/local integration PASS — 7 files, 154 tests
full frontend tests PASS — 47 files, 368 tests
TypeScript PASS
targeted ESLint PASS, zero warnings
production build PASS — 4,168 modules transformed
production bundle audit PASS
browser QA PASS — anonymous/local/fallback/mobile; console zero error/warning
real verified-account smoke CANNOT CONFIRM
```

---

## 14. Goal 4 — Release hardening

Goal 4 đã hoàn tất implementation/audit và commit riêng tại
`4cf7184fb33f93eeb9bd1035d11f7772ffa39f74`. Goal 3B2 đã commit riêng tại
`76e69231e5b02006ad687026557384787b0d7a18`; chưa push.

### Cross-tab và source orchestration

- Storage event dùng exact allowlist của local repository: supported result keys, `exam_history`,
  recovery queue và `event.key === null`.
- Token/auth/JWT, draft, locator, unrelated và synthetic-only key bị bỏ qua.
- Debounce 300 ms, cleanup khi unmount/auth-owner-range callback thay đổi; không parse/log `newValue`.
- Anonymous rescan local; authenticated backend success vẫn backend-only; fallback thử backend trước rồi mới
  scan exact owner.
- Range switch, logout, owner switch, stale response và DEV fixture/auth loading đã có test riêng.

### Security/coverage/authority

Backend owner lấy từ principal; repository dashboard luôn filter owner; chỉ tính `TIMED_ORIGINAL` và
`CUSTOM_MOCK`. Summary columns là KPI authority; immutable snapshot v2 mới được dùng deep analytics. Legacy
summary chỉ góp KPI/trend; malformed/unsupported detail giữ summary nếu hợp lệ và phản ánh coverage. Response
không trả raw answers/correct answers/explanation/question snapshots/user ID. Không join current question bank,
không rescore.

### Source trace

```text
server-issued public session
→ submit/recovery
→ exam_v2_attempts.session_id + submitted_at + mode + summary + authority + result_json
→ bounded dashboard repository projection
→ parser/aggregator
→ redacted DashboardAnalyticsResponseV1
→ frontend validator
→ mapper
→ ViewModel/UI
```

Recent route dùng public session ID, không dùng internal attempt/entity ID. Bản trace table đầy đủ và failure
matrix nằm ở `docs/dashboard-exams/DASHBOARD_RELEASE_CHECKLIST.md`.

### Validation và known status

```text
frontend full: 47 files, 393 tests — PASS
frontend TypeScript — PASS
targeted dashboard ESLint — PASS, zero warnings
production build — PASS, 4,168 modules
backend dashboard targeted — 34 tests PASS
backend security + performance — 5 tests PASS
synthetic browser matrix — PASS, console 0 error/warning
PRODUCTION_DATA_VERIFIED — CANNOT_CONFIRM
TIDB_QUERY_PROFILED — CANNOT_CONFIRM
REAL_ACCOUNT_E2E — CANNOT_CONFIRM
RELEASE_RECOMMENDATION — READY_WITH_MANUAL_VERIFICATION
```

Full backend suite cuối có **241 tests, 0 failures, 1 error, 15 skipped**; error duy nhất là baseline ngoài
scope `HistoryRagPackageReaderTest` thiếu `data/history-rag/v1`. Không gọi full suite là PASS và không sửa
History RAG. Không có migration/index/database change trong Goal 4. Bốn tracked exam build artifacts được
backup/restore byte-for-byte sau production build.

### Manual release gate

Trước khi deploy cần verified-account smoke (API 200, range, recent public route, submit → dashboard,
logout, 503 exact-owner fallback/recovery) và read-only TiDB `EXPLAIN` hoặc waiver được review. Không đọc
credential/token/cookie, không tạo account và không ghi DB.

## 15. Những điều không được làm tùy tiện

- Không đổi `DashboardViewModel` chỉ để làm UI thuận tiện.
- Không đưa scoring hoặc weakness analysis vào component presentation.
- Không kết nối thẳng component tới database/backend client.
- Không đổi mock JSON khi chưa cập nhật contract.
- Không sửa AppHeader trong phạm vi dashboard.
- Không chuyển scroll owner sang window nếu app shell vẫn dùng `.app-scroll-container`.
- Không biến utility rail thành sticky hoặc scroll riêng.
- Không gộp các thay đổi MVP, database, backend exam hoặc data exam vào dashboard commit.

---

## 16. Kết luận handoff

Dashboard người dùng đã hoàn thành presentation, Goal 1 data boundary, backend Analytics API V1 của
Goal 2, authenticated frontend integration của Goal 3A và local foundation Goal 3B1. Goal 2 đã commit tại
`195db79f`; Goal 3A tại `655702f4`; Goal 3B1 tại `c88c2213`; Goal 3B2 tại
`76e69231`. Goal 4 đã hoàn tất audit/hardening và commit tại `4cf7184f`, chưa push.

Authenticated backend success vẫn là backend-only; anonymous chỉ dùng explicit-anonymous data; fallback chỉ
dùng exact owner và không silent merge. Việc còn lại chính là:

1. chạy manual verified-account smoke theo `DASHBOARD_RELEASE_CHECKLIST.md`;
2. chạy read-only TiDB profile/EXPLAIN khi có quyền an toàn hoặc ghi waiver được review;
3. giữ nguyên privacy, source priority, presentation, accessibility và scroll invariants đã QA;
4. chỉ sau review gate mới quyết định stage/commit Goal 4.

---

## 17. Dashboard discoverability integration

Canonical full dashboard vẫn là `/exams/thong-ke`, public và lazy-loaded. Dashboard hiện có hai entry point
được triển khai trong frontend:

1. primary entry tại `/exams`: card “Thống kê học tập” trỏ tới canonical route, hiển thị cho cả anonymous và
   authenticated user;
2. secondary entry tại `/profile/dashboard`: link-only card “Thống kê luyện thi” ngay sau welcome hero.

Profile dashboard không phải analytics authority. Card profile không nhận KPI, không fetch
`GET /api/exams/dashboard-analytics`, không dùng `usePersonalLearningDashboard`, không đọc local storage và
không dùng `mockLearningStats` để mô tả official exam analytics. Exam home cũng chỉ render link và không mount
dashboard source orchestration.

Hai entry point dùng trực tiếp module nhỏ:

```text
frontend/src/features/dashboard/dashboardRoute.ts
PERSONAL_LEARNING_DASHBOARD_ROUTE = /exams/thong-ke
```

Module này không export qua barrel và không import page, Recharts, hook, API, local analytics hoặc DEV fixture.
`PersonalLearningDashboardPage` vẫn được lazy-load tại `App.tsx`; route declaration và auth policy không đổi.

Không thay đổi AppHeader, ProfileLayout, ExamV2HistoryPage hoặc ExamV2ResultPage. Contextual history/result CTA
được deferred. Audit quyết định được commit riêng tại `838ed43047896fd3cddb1b484de4b20b786d65f8`;
implementation discoverability đã commit/push riêng tại
`a995f3e75369cb2356d582815c1bd27b99b8de6f`.

Targeted automated validation hiện tại:

```text
5 test files, 35 tests PASS
full frontend suite: 51 files, 402 tests PASS
TypeScript PASS
targeted ESLint PASS, zero warnings
production build PASS, 4,170 modules
dashboard lazy chunk 460.00 kB; ExamHome chunk 3.34 kB
anonymous browser matrix 1440/768/390/320 PASS
browser console zero error/warning
```

Bundle scan chỉ tìm thấy dashboard implementation trong `PersonalLearningDashboardPage` lazy chunk; không có
fixture chunk hoặc synthetic marker. Bốn generated exam artifacts được backup/restore và xác minh SHA-256
byte-for-byte sau build.

Real authenticated browser profile session vẫn `CANNOT_CONFIRM`; profile card được kiểm tra bằng
component/integration harness, không bypass auth. Discoverability implementation đã commit/push; profile
duplication cleanup ở mục 18 là change set mới chưa stage/commit/push.

---

## 18. Profile overview không còn duplicated exam analytics

Cleanup ngày 2026-07-25 xác lập rõ hai surface:

- `/profile/dashboard`: general learning overview;
- `/exams/thong-ke`: canonical deep exam analytics duy nhất.

Profile không còn render bốn khối mock trùng analytics luyện thi:

1. `Điểm theo tuần`;
2. `Tỉ lệ đúng theo chủ đề`;
3. `Chủ đề làm tốt nhất`;
4. `Chủ đề cần ôn luyện`.

KPI profile `Điểm TB` bị loại vì exact source `mockStats.averageScore` là số mock không có bằng chứng
aggregate nhiều module. `ProgressByGrade.averageScore` cũng bị loại; progress theo lớp chỉ còn
`eventsViewed/eventsTotal`. Gợi ý profile được giữ ở vai trò general recommendation nhưng không còn copy dựa
trên điểm, percentage hoặc weakness topic.

Profile vẫn giữ WelcomeHero, sự kiện đã xem, quiz đã hoàn thành, streak, thời gian học, tiến độ theo lớp, tiếp
tục học, gợi ý chung và card `Thống kê luyện thi`. Card nằm ngay sau WelcomeHero, là link-only tới
`/exams/thong-ke`, không KPI, không API, không localStorage, không hook/mapper và không mount full dashboard.

Layout cũ ba cột và strength/weakness grid đã bị xóa khỏi render tree. Tiến độ theo lớp hiện là section
full-width với content `max-width`, không placeholder, empty wrapper, fixed min-height hay scroll context mới.
Heading profile theo thứ tự H1 → H2 → H3; grade meter có semantics `progressbar`.

Các chart/type tuần và chủ đề vẫn tồn tại trong shared profile source vì `/profile/scores` còn sử dụng; chúng
không còn được import/render bởi `ProfileDashboardPage`.

Validation:

```text
targeted profile/card/auth tests PASS — 3 files, 8 tests
full frontend tests PASS — 51 files, 404 tests
TypeScript PASS
targeted ESLint PASS, zero warnings
production build PASS — 4,170 modules
bundle boundary PASS
AUTHENTICATED_BROWSER_QA — CANNOT_CONFIRM; integration harness PASS
```

Canonical dashboard, App route, ProfileLayout, auth, backend, migration, database, History RAG và exam data
không đổi. Cleanup đang ở REVIEW GATE, chưa stage/commit/push.
