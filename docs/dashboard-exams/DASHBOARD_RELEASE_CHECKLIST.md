# Personal Learning Dashboard — Release Checklist

Ngày kiểm tra: 2026-07-24
Nhánh: `dashboard_exams`
Goal 3B2 commit: `76e69231e5b02006ad687026557384787b0d7a18`
Goal 4 commit: `4cf7184fb33f93eeb9bd1035d11f7772ffa39f74`
Trạng thái: **Goal 4 đã commit; discoverability implementation đang ở REVIEW GATE, chưa stage/commit/push**

## 1. Code validation

| Hạng mục | Trạng thái | Bằng chứng |
| --- | --- | --- |
| Source priority | PASS | DEV fixture → auth loading → anonymous local → authenticated backend → exact-owner fallback → error |
| No-merge invariant | PASS | `DashboardSource` chỉ còn `backend`, `local`, `local-fallback`; mỗi lượt chỉ có một authority |
| Cross-tab refresh | PASS | Exact allowlist, debounce 300 ms, không đọc `newValue`, cleanup khi unmount |
| Stale response protection | PASS | AbortController + request generation; range, logout và owner switch được test |
| ViewModel/IA | PASS | Giữ nguyên `PersonalLearningDashboardViewModel` và information architecture |
| Dashboard route lazy-load | PASS | `PersonalLearningDashboardPage` vẫn được import bằng `lazy()` |
| Migration/index/database write | NONE | Goal 4 không tạo migration, index, table hay thay đổi dữ liệu |

## 2. Backend validation

| Lệnh/hạng mục | Kết quả |
| --- | --- |
| Dashboard targeted tests | PASS — 34 tests, 0 failure/error/skipped, 29.024 s |
| Security + synthetic performance | PASS — 5 tests, 0 failure/error/skipped, 55.412 s |
| `.\mvnw.cmd -DskipTests package` | PASS, 12.044 s |
| Full `.\mvnw.cmd clean test` | 241 tests, 0 failures, 1 error, 15 skipped, 81 s; không gọi là PASS vì đúng một error History RAG ngoài dashboard |

Known baseline ngoài scope:

```text
HistoryRagPackageReaderTest.validatesGeneratedPackageAndBaselineCounts
Package directory does not exist: .../data/history-rag/v1
```

Không tạo `data/history-rag/v1` để hợp thức hóa gate. Dashboard, exam session và recovery tests không có
regression đã quan sát.

## 3. Frontend validation

| Lệnh/hạng mục | Kết quả |
| --- | --- |
| Targeted cross-tab/hook | PASS — hook 51/51 |
| Full `npm run test:run` | PASS — 47 files, 393 tests, 30.73 s |
| `npx tsc -b` | PASS |
| Targeted ESLint, zero warnings | PASS |
| `npm run build` | PASS — 4.168 modules, 41.67 s |
| Build-data preservation | PASS — 4 tracked exam artifacts restored byte-for-byte |

Một lượt full test chạy đồng thời với Maven từng timeout một test trang quản trị AI; test đó pass 10/10 khi
chạy riêng và full suite tuần tự sau đó pass 393/393. Đây là tải/flaky đã tái kiểm chứng, không phải dashboard
regression.

## 4. Security và redaction

- Endpoint bắt buộc authentication; request không nhận `userId`.
- Owner lấy từ principal, rồi cả ba dashboard repository operations đều lọc `a.userId = :userId`.
- Chỉ `TIMED_ORIGINAL` và `CUSTOM_MOCK` được đưa vào dashboard V1.
- Response serialization được kiểm tra theo exact key và không chứa:
  `userAnswer`, `correctAnswer`, `explanation`, `resultJson`, `answersJson`,
  `questionSnapshots`, `rawSnapshot`, `password`, `token`, `email`, `userId`.
- Parser chỉ trả category malformed/unsupported; không attach hoặc log raw persisted JSON.
- API validator error chỉ log validation issues, không log full payload.
- Local scanner chỉ đọc exact allowlist; không đọc token/JWT, draft, locator hoặc key lạ.
- Owner key không được đưa vào ViewModel, DOM, aria label, notice hay console.

## 5. TiDB profile

`TIDB_QUERY_PROFILED: CANNOT_CONFIRM`

Không có development/read-only TiDB connection được xác nhận an toàn trong môi trường hiện tại. Chỉ kiểm tra
tên biến môi trường, không đọc/in giá trị credential. Không chạy query, `EXPLAIN`, migration hoặc index change.

Kết luận index: `CANNOT_CONFIRM`. Source cho thấy ba bounded operations và các index hiện có có khả năng phù
hợp, nhưng không được kết luận optimizer/index thật nếu chưa có profile TiDB.

Checklist thủ công khi có read-only access:

1. Chạy Flyway info/validate.
2. Chỉ lấy aggregate counts theo mode/schema/authority, max attempts/user và min/avg/max JSON bytes.
3. Chạy `EXPLAIN` query owner + range + mode + order + limit, không in user identifier.
4. Ghi index được chọn, table scan/filesort và estimated rows.
5. Tạo review migration riêng nếu và chỉ nếu evidence cho thấy cần index.

## 6. Real-account E2E

`REAL_ACCOUNT_E2E: CANNOT_CONFIRM`

Browser hiện không có verified account/session đã được người dùng chuẩn bị; không tạo account, không bypass
verification và không đọc cookie/token/credential.

Checklist thủ công bắt buộc trước production sign-off:

1. Đăng nhập bằng verified QA account qua UI.
2. Mở `/exams/thong-ke`, xác nhận API 200 và nguồn backend.
3. Đối chiếu total/latest/recent với history/result UI.
4. Kiểm tra range `7d`, `30d`, `90d`, `all`.
5. Mở recent route và xác nhận route dùng public session ID.
6. Nộp một bài theo flow bình thường nếu đã được cho phép, rồi refresh/quay lại dashboard.
7. Xác nhận attempt mới xuất hiện và response không có raw answer/question snapshot.
8. Dùng network interception an toàn để kiểm tra 503 exact-owner fallback và backend recovery.
9. Logout và xác nhận KPI/chart/recent của tài khoản cũ biến mất.

## 7. Anonymous và local fallback

- Anonymous chỉ dùng explicit `ownerScope=anonymous`, không gọi backend.
- Authenticated luôn thử backend trước.
- Local fallback chỉ áp dụng cho transport/network, timeout hoặc `502/503/504`.
- `400/401/403/404/409/429/500`, contract error, abort và unknown không fallback.
- Fallback chỉ nhận exact `authenticated-owner` trùng opaque `currentUser.id`.
- Anonymous, owner khác, unknown/conflicting và device-unscoped không được đưa vào account dashboard.
- Device-unscoped chỉ tạo count-only notice; không title/score/route.
- Pending recovery chỉ tạo owner-scoped notice, không tăng attempt hoặc tạo recent item trùng.
- Retry sau fallback luôn thử backend trước; backend phục hồi thay hoàn toàn local ViewModel.

Cross-tab:

- Chấp nhận exact supported result/history/recovery keys và `event.key === null`.
- Bỏ qua token/auth, draft, locator, unrelated và synthetic-only key.
- Burst event được debounce 300 ms thành một refresh.
- Event chỉ là tín hiệu; không đọc/parse/log `StorageEvent.newValue`.
- Range, logout, owner change và unmount hủy timer cũ; DEV fixture/auth loading không refresh.

## 8. Browser và device matrix

Synthetic browser QA:

| Kịch bản | Viewport | Kết quả |
| --- | ---: | --- |
| Authenticated backend-ready fixture | 1440×900 | PASS, hai cột, không overflow |
| Backend fallback fixture | 1366×768 | PASS, warning/retry đúng |
| Partial detail | 768×1024 | PASS, một cột |
| Anonymous local fixture | 390×844 | PASS, device-source notice |
| Long content | 320×568 | PASS sau scroll-width fix |
| Dark mode | 1440×900 | PASS |
| Keyboard/range buttons | desktop | PASS |
| Browser console | toàn matrix | 0 error, 0 warning |

Scroll/accessibility invariants:

- `#app-scroll-root` là vertical scroll owner.
- Utility rail có natural height, `position: static`, không có nested scrollbar.
- `AppHeader` là sticky element duy nhất và không che nội dung.
- Heading hierarchy, range accessible names, progressbar semantics, chart `role=img` cùng textual summary pass.
- CSS có `prefers-reduced-motion`.
- Mobile zoom/layout không có horizontal overflow sau khi app shell đổi `w-screen` thành `w-full`.
- Exact automated WCAG contrast ratio chưa được đo bằng audit tool; không thấy lỗi hiển thị trong light/dark
  synthetic QA và đây là mục manual accessibility sign-off còn lại.

## 9. E2E field trace và failure matrix

### Field trace

| Source field | DB/snapshot | Backend DTO | Frontend DTO | ViewModel | UI |
| --- | --- | --- | --- | --- | --- |
| Public session identity | `exam_v2_attempts.session_id` | `attemptId` | `attemptId` | trend/recent `attemptId`, `resultRoute` | Chart point, recent link |
| Mode | `mode` | `scope.attemptModes`, trend/recent `mode` | same | `thi_thu`/`custom_mock` | Mode badge/filter coverage |
| Score | `total_score`; snapshot summary only validated | summary/trend/recent `score` | same | KPI/trend/recent score | KPI, chart, history card |
| Submission time | `submitted_at` | `submittedAt` | ISO string | submitted/date labels | Chart and recent time |
| Duration | `duration_seconds` | summary/recent duration | same | total/recent duration | KPI and recent card |
| Authority | authority columns + snapshot root match | counts/recent authority | exact enums | notices/coverage | Official/recovered notices |
| Topic | `result_json.questions[].topicRefs[]` | `topics[]` | `topics[]` | strengths/weaknesses | Insight cards |
| Cognitive | `question.cognitiveLevel` | `cognitiveLevels[]` | same | cognitive performance | Utility cognitive card |
| Question type | question type + completion/correct units | `questionTypes[]` | same | question type performance | Performance cards |
| Coverage/version | schema/version columns + parse category | `coverage`, `diagnostics` | same | coverage/notices | Coverage card/banner |

`resultRoute` dùng public session ID; internal binary attempt/entity ID không rời persistence layer. Dashboard
không join current question bank và không rescore.

### Failure matrix

| Failure | Backend response | Frontend state | Local fallback |
| --- | --- | --- | --- |
| No attempts | 200 empty | empty/sign-in as applicable | Không |
| Invalid range | 400 | request error | Không |
| Unauthorized | 401 | sign-in/session expired | Không |
| Forbidden | 403 | access error | Không |
| Contract mismatch | 200 invalid schema | contract error | Không |
| Backend 500 | 500 | error | Không |
| Backend 502/503/504 | matching status | exact-owner local nếu có | Có |
| Network/timeout | no response/timeout | exact-owner local nếu có | Có |
| Abort/stale response | aborted | không render lỗi/dữ liệu cũ | Không |
| Local storage unavailable | n/a | safe error/sign-in | Không fabricate |
| Local corrupt record | n/a | partial diagnostics | Tiếp tục bounded scan |
| Snapshot malformed | 200 partial | ready + coverage notice | n/a |

## 10. Performance và production bundle

Synthetic backend benchmark, 500 attempt projections, 34 topics, ba cognitive levels và cả MCQ/T/F:

```text
runs=7
attempts=500
median=37.561 ms
max=83.836 ms
serialized response=16,816 bytes
topics=34
trend=50
recent=10
```

Đây là non-gating measurement, không có time-based assertion. Service dùng đúng ba repository operations
(hai count + một bounded fetch), không N+1; fetch cap 500, trend cap 50, recent `1..10` mặc định 5. JSON chỉ
parse trên fetched rows, malformed row không retry vô hạn và projection không fetch relation/question bank.

Frontend maximum-case test tạo response 500 attempts/50 trend/34 topics/10 recent, chạy runtime validator,
map không mutate input và xác nhận ViewModel không có raw response keys.

Production assets:

```text
index-CV5pFKAi.js                           5,466.46 kB | gzip 1,400.92 kB
PersonalLearningDashboardPage-BrZsGqdp.js    460.00 kB | gzip   130.73 kB
PersonalLearningDashboardPage-wf4Zd52C.css    26.56 kB | gzip     5.05 kB
index-DMejmVEk.css                           152.59 kB | gzip    27.26 kB
source maps: 0
```

Dashboard chunk có endpoint và production local scanner; không có development fixture module/name,
synthetic topic/owner/private/token marker hoặc docs schema marker. Main app chunk >500 kB là warning cấp ứng
dụng đã tồn tại; dashboard lazy chunk vẫn dưới 500 kB. Không thêm manualChunks ngoài scope Goal 4.

## 11. Known limitations, rollback và deployment prerequisites

Known limitations:

- Production data, real account correctness và TiDB query plan chưa được xác minh.
- Local analytics không tuyên bố account-wide completeness.
- History RAG full-suite baseline vẫn thiếu artifact ngoài dashboard.
- Full WCAG contrast ratio cần manual/tool audit trước production sign-off.

Rollback:

1. Goal 3B2 có thể revert riêng bằng commit `76e69231`.
2. Goal 4 có thể revert riêng bằng commit `4cf7184f`.
3. Không rollback toàn repository và không dùng `git reset --hard` vì có thay đổi người dùng tồn tại trước.
4. Scroll-width fix là hunk `w-screen` → `w-full` trong `frontend/src/App.tsx`.

Deployment prerequisites:

1. Manual verified-account E2E pass.
2. Read-only TiDB `EXPLAIN` hoặc documented waiver; không thêm index nếu chưa review.
3. Backend/frontend deploy cùng contract schema 1 / policy `dashboard-v1`.
4. Cookie/auth/security configuration đúng môi trường.
5. Monitoring cho endpoint error/latency chỉ ghi aggregate category, không raw payload.
6. Xác nhận data build artifacts không bị ghi đè ngoài release intent.

## 12. Final status

```text
CODE_COMPLETE: yes
PRODUCTION_DATA_VERIFIED: cannot-confirm
TIDB_QUERY_PROFILED: cannot-confirm
REAL_ACCOUNT_E2E: cannot-confirm
RELEASE_RECOMMENDATION: READY_WITH_MANUAL_VERIFICATION
```

Không có evidence về owner leak, raw answer leak, stale data leak, contract mismatch hoặc dashboard blocker.
Không khuyến nghị `READY` cho đến khi manual verified-account E2E hoàn tất.

## 13. Dashboard discoverability checks

### Canonical route và entry points

- [x] `/exams/thong-ke` vẫn là canonical full-dashboard route.
- [x] Route vẫn public, không thêm `ProtectedRoute`, redirect hoặc alias.
- [x] `/exams` có primary link “Thống kê học tập”.
- [x] Anonymous và authenticated user đều thấy ExamHome entry.
- [x] `/profile/dashboard` có secondary link-only card “Thống kê luyện thi”.
- [x] Profile vẫn protected và generic overview; không nhúng full dashboard.
- [x] Cả hai entry point trỏ trực tiếp tới `/exams/thong-ke`.
- [x] Browser Back dùng normal history, không dùng replace navigation.
- [x] Dashboard có thể được tìm thấy mà không cần biết direct URL.

### No-fetch và bundle boundary

- [x] ExamHome entry không request dashboard analytics và không scan local storage.
- [x] Profile entry không request dashboard analytics, không nhận/hiển thị KPI và không scan local storage.
- [x] Hai entry point không import dashboard page, hook, API client, Recharts hoặc DEV fixture.
- [x] Route constant nằm trong module độc lập, không đi qua dashboard barrel.
- [x] `PersonalLearningDashboardPage` vẫn lazy-loaded trong `App.tsx`.
- [x] Production bundle scan xác nhận profile/exam home không kéo full dashboard implementation.
- [x] Production bundle không chứa DEV fixture chunk hoặc synthetic marker.

### Accessibility và responsive

- [x] Card dùng semantic `<Link>` với accessible name riêng.
- [x] Không có nested button/link.
- [x] Icon decorative dùng `aria-hidden`.
- [x] Focus-visible style tồn tại; keyboard Enter navigation có automated test.
- [x] Existing exam card padding/touch target và profile card `min-height` đáp ứng tối thiểu 44px.
- [x] Browser QA ExamHome 1440×900, 768×1024, 390×844 và 320×568 không overflow.
- [x] Profile card component/integration harness không tạo scroll container; real sidebar overlay xem mục kế.
- [x] Browser console không có error/warning.
- [x] Real authenticated profile browser session: explicit `CANNOT_CONFIRM`, không bypass auth.

### Deferred và scope integrity

- [x] AppHeader không thay đổi.
- [x] ProfileLayout/scroll owner không thay đổi.
- [x] History/result contextual CTA chưa được thêm và được deferred.
- [x] Không backend/database/migration/auth/scoring change.
- [x] Audit được commit riêng tại `838ed43047896fd3cddb1b484de4b20b786d65f8`.
- [x] Implementation chưa stage, commit hoặc push.
