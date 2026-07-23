# Dashboard Analytics — Implementation Progress

Ngày cập nhật: 2026-07-24  
Nhánh làm việc: `dashboard_exams`  
Baseline commit: `5a8a8323bfbd7b5119add79f5c575509cb7fcd72`

## Trạng thái tổng quát

| Goal | Trạng thái | Phạm vi |
| --- | --- | --- |
| Goal 0 | Hoàn thành | Source audit read-only và bản đồ nguồn dữ liệu |
| Goal 1 | Hoàn thành, chờ review | Fixture boundary, wire contract V1, validator, policy, mapper và test frontend |
| Goal 2 | Chưa thực hiện | Backend analytics API và production API client/loader |
| Goal 3 | Chưa thực hiện | Tích hợp auth, lỗi mạng, partial response và chiến lược fallback |
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

## Goal 2–4 — Phần chủ động deferred

Chưa triển khai:

- backend controller/service/query cho dashboard analytics;
- database hoặc migration;
- production API client và authenticated loader;
- aggregation từ localStorage, recovery queue hay persistence snapshot;
- scoring, weakness analysis hoặc exam persistence mới;
- merge dữ liệu backend/local;
- telemetry, rollout và đối soát response production.

Goal 2 phải tạo response tương thích `DashboardAnalyticsResponseV1`, kiểm thử bằng golden fixtures,
sau đó mới nối API client theo chuỗi:

```text
backend response → runtime validator → pure mapper → DashboardViewModel → page
```

Mọi thay đổi semantic phải cập nhật contract, validator, policy, golden fixtures và test trong cùng
một review.

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
