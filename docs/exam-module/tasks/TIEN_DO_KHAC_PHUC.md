# Tiến độ khắc phục module Dashboard

**Kế hoạch chi tiết:** [`KE_HOACH_KHAC_PHUC_DASHBOARD_CODEX.md`](KE_HOACH_KHAC_PHUC_DASHBOARD_CODEX.md)
**Danh sách lỗi gốc:** [`DANH_GIA_MODULE_DASHBOARD_USER.md`](DANH_GIA_MODULE_DASHBOARD_USER.md)
**Cách chạy bằng Claude Code:** [`../../CLAUDE.md`](../../CLAUDE.md) và `.claude/commands/task.md`

---

## Cách dùng file này

Đây là **nguồn sự thật duy nhất** về việc gì đã làm, việc gì chưa. Quy tắc:

1. Trước khi bắt đầu một task, đọc file này để biết task đó có bị chặn bởi task khác không.
2. Sau khi hoàn thành, cập nhật **một dòng** trong bảng: đổi trạng thái, ghi commit hash, ghi ngày.
3. Nếu task bị bỏ dở hoặc thất bại, ghi trạng thái `⚠️ Dở` và **viết lý do vào mục "Ghi chú theo task"**
   ở cuối file. Đừng để trống — phiên làm việc sau sẽ không biết chuyện gì đã xảy ra.
4. Nếu phát hiện lỗi mới trong lúc sửa, thêm vào mục "Lỗi phát hiện thêm", **không** tự mở rộng task.

**Ký hiệu trạng thái:** `⬜ Chưa` · `🔄 Đang làm` · `✅ Xong` · `⚠️ Dở` · `⏭️ Bỏ qua` · `❌ Không làm`

---

## Cập nhật sau TASK-09-C (27/07/2026)

TASK-09 đã hoàn tất theo **phương án C — nối dữ liệu thật** trong commit `286e16c6`.
Dashboard hồ sơ dùng contract `GET /api/progress/me/learning-summary`, quiz có biên nhận
hoàn thành idempotent, và các màn hình lịch sử/điểm số đã trỏ về luồng bài thi thật.
Các KPI không có nguồn đáng tin cậy (`rankPercentile`, `progressByGrade`, `recentEvents`)
đã được loại khỏi luồng chính. Chi tiết contract và tiêu chí nghiệm thu nằm ở
[`TASK-09-C-IMPLEMENTATION.md`](TASK-09-C-IMPLEMENTATION.md).

## Tổng quan

| | Số task | Xong | Còn lại |
|---|---:|---:|---:|
| **PR-1** Quick wins | 8 | 8 | 0 |
| **PR-2** ProfileDashboard mock data | 1 | 1 | 0 |
| **PR-3** Đồng bộ local ↔ backend | 4 | 0 | 4 |
| **PR-4** Củng cố local analytics | 4 | 0 | 4 |
| **PR-5** Siết phân quyền owner | 3 | 0 | 3 |
| **PR-6** Backend | 2 | 0 | 2 |
| **PR-7** Accessibility & UI | 2 | 0 | 2 |
| **PR-8** Củng cố test | 4 | 0 | 4 |
| **PR-9** Nợ kỹ thuật | 2 | 0 | 2 |
| **TỔNG** | **30** | **9** | **21** |

**Điểm module:** 7.4/10 → mục tiêu 8.8/10 · **Lỗi đang mở:** 1 P0 · 11 P1 · ~34 P2

---

## PR-0 · Chuẩn bị (làm một lần)

| ✔ | Việc | Ghi chú |
|:---:|---|---|
| ✅ | Tạo branch `fix/dashboard-remediation` + tag `dashboard-baseline` | 2026-07-26 · tag tại `c45a8c90` |
| ✅ | Chạy baseline test/typecheck, lưu output vào `artifacts/` | 2026-07-26 · test: 403/404 pass — 1 đỏ sẵn ở `AdminAiCandidateDetailPage.test.tsx:161` (timeout 5s, ngoài module dashboard) · tsc: PASS · log: `artifacts/baseline-frontend-test.log`, `artifacts/baseline-typecheck.log` |
| ✅ | Xác nhận `CLAUDE.md` ở gốc repo đã có và đúng | 2026-07-26 · đã có, nội dung khớp cấu trúc repo |
| ✅ | Xác nhận `.claude/settings.json` + `.claude/commands/task.md` hoạt động | 2026-07-26 · `/task TASK-01` chạy đúng quy trình |

---

## PR-1 · Quick wins (~3-4 giờ · **bắt buộc trước bảo vệ**)

Tám task độc lập, rủi ro thấp, không phụ thuộc nhau. Có thể làm liên tiếp trong một phiên.

| ✔ | Task | Issue | File chính | Ước tính | Commit | Ngày |
|:---:|---|---|---|---:|---|---|
| ✅ | TASK-01 | FE-1 | `dashboardFixtures.ts` — bỏ copy "Goal 3A" | 15p | `ae1d41b2` | 2026-07-26 |
| ✅ | TASK-02 | FE-2 | `PersonalLearningDashboardPage.tsx` + `dashboardTypes.ts` — union `DashboardNoticeId` | 45p | `bcb310e3` | 2026-07-27 |
| ✅ | TASK-03 | LA-9 | `localDashboardAggregator.ts` + `dashboardFormatters.ts` — hoist `Intl.DateTimeFormat` | 15p | | 2026-07-27 |
| ✅ | TASK-04 | LA-1 | `localDashboardAdapters.ts` — MCQ chấm từ đáp án | 30p | | 2026-07-27 |
| ✅ | TASK-05 | LA-6 | `localDashboardRepository.ts` — cờ limit sau filter owner | 20p | | 2026-07-27 |
| ✅ | TASK-06 | BE-2 | `DashboardAnalyticsService.java` — kẹp `totalKnown` | 30p | | 2026-07-27 |
| ✅ | TASK-07 | FE-4 | `PersonalLearningDashboardPage.tsx` — ghi chú nguồn theo ngữ cảnh | 15p | | 2026-07-27 |
| ✅ | TASK-08 | FE-5 | `dashboardFixtures.ts` + hook — bỏ cast `as DashboardErrorKind` | 20p | | 2026-07-27 |

**Kiểm tra sau PR-1:** `npm run test` (toàn bộ) · `npx tsc --noEmit` · `npm run lint` · `npm run check:encoding`

---

## PR-2 · `/profile/dashboard` mock data (P0 · **bắt buộc trước bảo vệ**)

⚠️ **Cần bạn quyết định phương án trước khi giao cho AI.**

| ✔ | Task | Phương án | Ước tính |
|:---:|---|---|---:|
| ✅ | TASK-09 | **C** nối dữ liệu thật: 4 KPI có nguồn backend, recent attempts thật, bỏ metric không có nguồn | 2-4 ngày |

**Phương án đã chọn:** **C** · commit `286e16c6` · 2026-07-27

---

## PR-3 · Đồng bộ semantics local ↔ backend (~1 ngày · rủi ro **cao**)

⚠️ Làm TASK-13 **trước** ba task còn lại để có lưới an toàn.

| ✔ | Task | Issue | Nội dung | Phụ thuộc | Ước tính | Commit |
|:---:|---|---|---|---|---:|---|
| ⬜ | TASK-13 | T-9 | Bộ test đối chiếu hai đường (`dashboardParity.test.ts`) | — | 3h | |
| ⬜ | TASK-10 | LA-3 | Bỏ topicRefs khỏi adapter legacy | TASK-13 | 1h | |
| ⬜ | TASK-11 | LA-2 | Tách `dashboardRecommendation.ts` dùng chung | TASK-13 | 2h | |
| ⬜ | TASK-12 | LA-4, LA-15 | Sửa `detailStatus` + `totalKnownAttempts` | TASK-13 | 30p | |

Sau PR-3, 3 case đỏ trong `dashboardParity.test.ts` phải chuyển sang xanh.

---

## PR-4 · Củng cố local analytics (~1 ngày)

| ✔ | Task | Issue | Nội dung | Ước tính | Commit |
|:---:|---|---|---|---:|---|
| ⬜ | TASK-14 | LA-5 | Gỡ `custom_exam_session_` khỏi allow-list | 45p | |
| ⬜ | TASK-15 | LA-7 | Dung sai lệch đồng hồ + diagnostics | 45p | |
| ⬜ | TASK-16 | LA-8 | Siết `parseTimestamp` | 1h | |
| ⬜ | TASK-17 | LA-11/12/13/17 | 4 sửa nhỏ về an toàn dữ liệu | 1h | |

---

## PR-5 · Siết phân quyền owner (~0.5 ngày)

| ✔ | Task | Issue | Nội dung | Ước tính | Commit |
|:---:|---|---|---|---:|---|
| ⬜ | TASK-18 | LA-10 | Luôn đọc recovery queue để phân loại | 1h | |
| ⬜ | TASK-19 | LA-19/20/21/22 | Dọn chẩn đoán | 1.5h | |
| ⬜ | TASK-20 | LA-18 | Quyết định số phận nhánh legacy (**điều tra trước**) | 1h | |

---

## PR-6 · Backend (~1 ngày)

| ✔ | Task | Issue | Nội dung | Ước tính | Commit |
|:---:|---|---|---|---:|---|
| ⬜ | TASK-21 | BE-1 | Cache Caffeine + query version | 4h | |
| ⬜ | TASK-22 | BE-3/4/5/6 | 4 cải thiện nhỏ | 2h | |

---

## PR-7 · Accessibility & UI (~0.5 ngày)

| ✔ | Task | Issue | Nội dung | Ước tính | Commit |
|:---:|---|---|---|---:|---|
| ⬜ | TASK-23 | UI-1 | Quản lý focus sau retry/đổi range | 1h | |
| ⬜ | TASK-24 | UI-2/4/5, FE-3 | 4 sửa a11y/UI | 2h | |

---

## PR-8 · Củng cố bộ test (~1 ngày)

| ✔ | Task | Issue | Nội dung | Phụ thuộc | Ước tính | Commit |
|:---:|---|---|---|---|---:|---|
| ⬜ | TASK-25 | T-1 | Test timeout 15 s thật | | 1.5h | |
| ⬜ | TASK-26 | T-2 | Chặn request storm | | 1h | |
| ⬜ | TASK-27 | T-3 | Test accessibility + announcement | TASK-23 | 2h | |
| ⬜ | TASK-28 | T-4/5/8, FE-6 | Public API, validation, `now` prop, `waitFor` | | 3h | |

---

## PR-9 · Nợ kỹ thuật (~1 ngày · tùy chọn)

| ✔ | Task | Issue | Nội dung | Phụ thuộc | Ước tính | Commit |
|:---:|---|---|---|---|---:|---|
| ⬜ | TASK-29 | UI-3 | Tách `PersonalLearningDashboardPage.tsx` thành 13 file | TASK-24 | 3h | |
| ⬜ | TASK-30 | LA-23/24/25 | Dọn trùng lặp, hàm dài, magic number | PR-4, PR-5 | 3h | |

---

## Ghi chú theo task

> Ghi vào đây khi một task **không** hoàn thành trọn vẹn, hoặc khi có quyết định cần nhớ.
> Định dạng: `### TASK-xx (ngày)` rồi mô tả.

### TASK-02 (2026-07-26)

**Hoàn tất ngày 2026-07-27.** Giữ union `DashboardNoticeId`, `splitReadyNotices()` và UI `<details>`
theo đặc tả. Đồng thời chuẩn hóa toàn bộ notice ID trong 9 fixture DEV theo ID mà mapper production
thực sự sinh; xóa notice `dense-chart` không có nguồn production và thêm test duyệt cả 10 fixture để
chặn ID ngoài union hoặc ID trùng. Test local-fallback xác nhận chỉ notice lỗi backend hiển thị trực
tiếp, các notice phụ nằm trong `<details>`. Kết quả: dashboard 222/222, `tsc` PASS, encoding PASS;
lint còn đúng 19 lỗi + 5 cảnh báo baseline ngoài module dashboard.

### TASK-09 (2026-07-27)

**Chờ quyết định sản phẩm.** Đặc tả yêu cầu chọn phương án A (gắn nhãn dữ liệu minh họa),
B (chuyển hướng `/profile` và `/profile/dashboard` sang `/exams/thong-ke`, khuyến nghị),
hoặc C (nối dữ liệu thật). Chưa tự chọn vì thay đổi này ảnh hưởng trực tiếp điều hướng và
phạm vi sản phẩm.

### TASK-10 (2026-07-27)

**Chưa bắt đầu — phụ thuộc TASK-13.** Plan yêu cầu xây parity test trước để phát hiện và
khóa khác biệt local/backend; sẽ tiếp tục sau khi dependency này được thực hiện.

---

## Lỗi phát hiện thêm trong quá trình sửa

> Phát hiện lỗi mới thì ghi vào đây, **không** tự mở rộng task đang làm.

| Ngày | Mô tả | File:dòng | Mức | Xử lý |
|---|---|---|---|---|
| 2026-07-26 | 19 lỗi + 5 cảnh báo ESLint có sẵn, toàn bộ ngoài `src/features/dashboard` (PasswordStrengthMeter, EventChildrenList, useSessionV2…) | nhiều file ngoài module | P2 | Cần task dọn riêng, không thuộc phạm vi kế hoạch dashboard |

---

## Nhật ký phiên làm việc

| Ngày | Task đã làm | Kết quả test | Ghi chú |
|---|---|---|---|
| 2026-07-26 | (khởi tạo file) | — | Sắp xếp lại tài liệu, chưa bắt đầu sửa code |
| 2026-07-26 | PR-0 (3/4 việc) | 403/404 pass · tsc PASS | Tạo branch + tag baseline, lưu log vào `artifacts/`. Còn việc thử `/task TASK-01` |
| 2026-07-26 | TASK-01 | dashboard 221/221 pass · tsc PASS · encoding PASS | Sửa 5 chuỗi copy trong `dashboardFixtures.ts`, hết "Goal 3A". Lint có 19 lỗi sẵn có ngoài module dashboard |
| 2026-07-26 | TASK-02 (dở) | dashboard 219/221 — 2 đỏ do fixture JSON chứa ID legacy · tsc PASS | Đặc tả sai: 4 ID "không tồn tại" thực ra nằm trong 3 fixture JSON DEV. Dừng chờ quyết định — xem "Ghi chú theo task". Lưu ý: docs đã được di chuyển sang `docs/exam-module/` giữa phiên |
| 2026-07-27 | TASK-02 | dashboard 222/222 · tsc PASS · encoding PASS | Chuẩn hóa notice ID của fixture theo mapper production, thêm guard test cho union và xác nhận primary/secondary notice ở local fallback. Lint giữ nguyên baseline 19 lỗi + 5 cảnh báo ngoài dashboard |
| 2026-07-27 | TASK-03 | dashboard 222/222 · tsc PASS · encoding PASS | Hoist 4 `Intl.DateTimeFormat` trong 3 file lên module scope; test cũ giữ nguyên. ESLint riêng file task PASS, lint toàn dự án giữ nguyên baseline ngoài dashboard |
| 2026-07-27 | TASK-04 | local analytics 103/103 · dashboard 224/224 · tsc PASS · encoding PASS | MCQ snapshot V2 và legacy đều chấm từ đáp án, không tin cờ correctness; thêm 2 test hồi quy bao phủ cả hai schema. ESLint riêng file task PASS |
| 2026-07-27 | TASK-05→08 | dashboard 225/225 · tsc PASS · encoding PASS · backend `DashboardAnalyticsServiceTest` PASS | Sửa owner-limit, reconcile `totalKnown`, coverage note theo source và derive `DashboardErrorKind` từ API type. ESLint riêng file sửa PASS; lint toàn dự án giữ baseline ngoài dashboard |
