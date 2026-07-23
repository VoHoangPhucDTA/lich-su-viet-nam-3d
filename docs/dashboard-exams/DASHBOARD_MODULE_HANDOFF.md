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

Module hiện tại có **frontend presentation hoàn chỉnh** và đã hoàn thành Goal 1 về data boundary:
fixture development được tách khỏi docs, wire DTO V1 có runtime validator, policy `dashboard-v1`
và mapper DTO → ViewModel. Nó vẫn chưa kết nối API/backend thật, chưa aggregate localStorage và
chưa tự lưu dữ liệu dashboard. Production hiện hiển thị trạng thái “chưa được kết nối”, không hiển
thị fixture mặc định.

---

## 2. Trạng thái FE/BE hiện tại

### 2.1. Frontend

Frontend dashboard đã hoàn thành ở mức presentation và fixture-driven behavior:

- Có route `/exams/thong-ke`.
- Route được lazy-load trong App và có fallback loading.
- Có layout desktop/tablet/mobile.
- Có light theme và dark preview bằng query `theme=dark` trong môi trường development.
- Có 10 fixture bao phủ ready, loading, error, empty, one-attempt, anonymous, fallback, partial data và dữ liệu dài/nhiều.
- 10 fixture runtime nằm tại `frontend/src/features/dashboard/__fixtures__/`; bản docs chỉ là tài liệu tham chiếu.
- Static imports fixture nằm trong `dashboardDevelopmentFixtures.ts`, được nạp qua dynamic DEV-only boundary.
- Production bundle không chứa fixture và trả explicit unavailable state cho tới khi Goal 2 nối API.
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

Phần dashboard backend **chưa được nối**:

- Chưa có endpoint dashboard chính thức được frontend sử dụng.
- Chưa có adapter từ response API thật sang dashboard view model.
- Chưa có persistence riêng cho dashboard.
- Chưa di chuyển scoring, weakness analysis hoặc cognitive analysis vào dashboard.
- Chưa có cơ chế đồng bộ local data và server data cho module này.
- Không được suy đoán API hoặc tự thay đổi backend khi tiếp tục công việc.

Vì vậy, trạng thái hiện tại nên được hiểu là:

| Phần | Trạng thái |
|---|---|
| Presentation FE | Hoàn thành |
| Mock fixture/state handling | Hoàn thành |
| Scroll/responsive/accessibility | Hoàn thành và đã QA |
| Dashboard API wire contract V1 | Hoàn thành ở frontend |
| Runtime validator/policy/mapper | Hoàn thành ở frontend |
| Production fake fixture | Đã loại bỏ |
| Dashboard API client | Chưa triển khai |
| Backend aggregation | Chưa kết nối |
| Real data integration | Chưa làm |
| Scoring/weakness/cognitive engine | Ngoài phạm vi dashboard hiện tại |

---

## 3. Git và các nhánh liên quan

### Nhánh dashboard

Nhánh hiện tại cần kiểm tra bằng Git trước mỗi Goal. Tại Goal 1:

- **Branch:** `dashboard_exams`
- **HEAD baseline:** `5a8a8323bfbd7b5119add79f5c575509cb7fcd72`
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

Range filter chỉ thay đổi trạng thái UI/live announcement trong development fixture mode. Production
unavailable state không giả lập query; range thật sẽ được nối ở Goal 2.

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
        ├── development: dynamic-import fixture module và đọc query fixture
        ├── production: explicit not-connected ViewModel, không có fake KPI
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

Range filter và retry hiện chỉ mô phỏng state transition. Trong development, retry error chuyển qua
loading rồi quay về default fixture sau khoảng 300ms. Trong production chưa nối API, retry quay lại
explicit unavailable state.

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

## 13. Goal 1 contract và công việc Goal 2 cần làm tiếp

Goal 1 đã khóa các artifact:

```text
frontend/src/features/dashboard/dashboardAnalyticsTypes.ts
frontend/src/features/dashboard/dashboardAnalyticsValidation.ts
frontend/src/features/dashboard/dashboardAnalyticsPolicy.ts
frontend/src/features/dashboard/dashboardMappers.ts
data/dashboard-analytics-fixtures/
```

Backend Goal 2 phải tái sử dụng semantic contract/golden fixtures này. Khi backend sẵn sàng, nên
triển khai theo thứ tự:

### Bước 1 — Implement API contract đã khóa

Implement response tương thích `DashboardAnalyticsResponseV1`; nếu cần đổi semantic phải cập nhật
contract, golden fixture và frontend validator trong cùng review.

Không để UI phụ thuộc trực tiếp vào:

- bảng database;
- tên cột persistence;
- scoring implementation nội bộ;
- cấu trúc localStorage.

### Bước 2 — Nối API client/data loader

Mapper đã tồn tại. Goal 2 chỉ thêm client/orchestrator:

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

### Bước 3 — Giữ fixture development-only

Trong development/test vẫn giữ fixture. Không xóa fixture chỉ vì API đã có.

Nên có boundary rõ:

- production: API loader; khi chưa có API là unavailable state;
- development/test: fixture resolver;
- component: chỉ nhận cùng một ViewModel shape.

### Bước 4 — Xử lý auth và failure

Cần quyết định:

- khi user chưa đăng nhập thì API trả local-only hay empty;
- khi backend timeout thì dùng local fallback hay error;
- notice backend unavailable hiển thị ở đâu;
- data partial có được dùng cho topic analysis hay không.

### Bước 5 — Kiểm thử contract

Cần thêm test cho:

- API response đầy đủ;
- API response thiếu detail;
- backend timeout;
- auth expired;
- empty response;
- pagination/fetch limit;
- source merged local + backend;
- score trend không đầy đủ.

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

Dashboard người dùng đã hoàn thành phần frontend presentation và Goal 1 data boundary. Nhánh
`dashboard_exams` là điểm bắt đầu cho Goal 2 backend/API integration.

Việc còn lại chính là:

1. implement backend response theo wire contract/golden fixtures;
2. tạo API client và production loader;
3. validate response rồi map sang ViewModel;
4. kiểm tra auth/fallback/partial data;
5. triển khai local fallback ở Goal riêng;
6. giữ nguyên presentation, accessibility và scroll invariants đã QA.
