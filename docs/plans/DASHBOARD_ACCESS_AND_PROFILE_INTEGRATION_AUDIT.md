# Personal Learning Dashboard — Access & Profile Integration Audit

**Phạm vi:** read-only audit navigation, information architecture và khả năng tích hợp profile cho Personal Learning Dashboard.
**Ngày audit:** 2026-07-24
**Branch/HEAD:** `dashboard_exams` / `4cf7184fb33f93eeb9bd1035d11f7772ffa39f74`
**Canonical route hiện tại:** `/exams/thong-ke`
**Trạng thái:** REVIEW GATE — chưa triển khai thay đổi trong audit này.

## 1. Executive summary

Personal Learning Dashboard hiện là một analytics surface dành cho kết quả thi THPT, được nối với route `/exams/thong-ke`. Nó có scope, authority, coverage, range và các CTA ôn tập riêng; không phụ thuộc vào `ProfileLayout` hoặc exam page layout. Route này không dùng `ProtectedRoute`: authenticated user lấy dữ liệu backend-only theo policy của dashboard, anonymous user có thể xem dữ liệu local/no-data state có thông báo rõ nguồn.

`/profile/dashboard` là một trang “Tổng quan” khác: được bảo vệ bởi `ProtectedRoute`, dùng `ProfileLayout`, dữ liệu mock trong `mockLearningStats`, và trộn hoạt động sự kiện, quiz và exam. Trang này không phải source chính thức của dashboard analytics V1. Hai trang cũng có scroll owner khác nhau: app shell dùng `#app-scroll-root`, còn profile dùng nested `<main className="flex-1 overflow-y-auto">`.

### Quyết định đề xuất

- Giữ `/exams/thong-ke` là canonical route cho full Personal Learning Dashboard.
- Không di chuyển full dashboard vào `/profile/dashboard` và không tạo profile subroute trong Goal tiếp theo.
- Thêm một entry point rõ ràng từ profile dashboard (card/link “Thống kê luyện thi”) tới `/exams/thong-ke`; card này không fetch thêm analytics và không sao chép KPI.
- Thêm một contextual entry point ở exam home; cân nhắc thêm link ở history/result sau khi CTA copy được duyệt.
- Giữ route public để bảo toàn anonymous local/no-data behavior. Không thêm `ProtectedRoute` cho `/exams/thong-ke`.
- Không đổi route cũ, không redirect `/exams/thong-ke`, không đổi `/profile/dashboard`.

Đây là biến thể **A + một phần E có kiểm soát**: một canonical route trong domain “Luyện thi THPT”, với các entry point có chủ đích; không mở mọi bề mặt thành bản sao dashboard.

## 2. Git baseline và phạm vi thay đổi

Preflight được đối chiếu trước audit:

- branch: `dashboard_exams`;
- HEAD: `4cf7184fb33f93eeb9bd1035d11f7772ffa39f74` (`feat(dashboard): harden analytics release readiness`);
- không có staged file;
- working tree có sẵn duy nhất:
  `frontend/public/data/exams/exam-dataset-build.json`;
- thay đổi dataset-build là thay đổi có trước, không thuộc audit này và không được sửa, stage, commit hoặc push;
- audit này chỉ tạo tài liệu này.

Các tài liệu đã đọc để đối chiếu:

- `docs/plans/DASHBOARD_ANALYTICS_SOURCE_AUDIT.md`;
- `docs/progress/DASHBOARD_ANALYTICS_IMPLEMENTATION_PROGRESS.md`;
- `docs/dashboard-exams/DASHBOARD_MODULE_HANDOFF.md`;
- `docs/dashboard-exams/DASHBOARD_RELEASE_CHECKLIST.md`.

## 3. Evidence map

| Area | Source |
|---|---|
| Route wiring, shell, lazy loading | `frontend/src/App.tsx` |
| Auth guard | `frontend/src/auth/ProtectedRoute.tsx` |
| Global navigation | `frontend/src/components/layout/AppHeader.tsx` |
| Profile navigation/layout | `frontend/src/layouts/ProfileLayout.tsx` |
| Existing profile overview | `frontend/src/pages/profile/ProfileDashboardPage.tsx` |
| Profile history/scores | `frontend/src/pages/profile/LearningHistoryPage.tsx`, `frontend/src/pages/profile/ScoresPage.tsx` |
| Profile mock source | `frontend/src/data/mockLearningStats.ts` |
| Dashboard orchestration | `frontend/src/features/dashboard/PersonalLearningDashboardPage.tsx`, `usePersonalLearningDashboard.ts` |
| Dashboard adapter/API | `frontend/src/features/dashboard/dashboardMappers.ts`, `dashboardAnalyticsTypes.ts`, `frontend/src/services/dashboardAnalyticsApi.ts` |
| Exam home/history/result | `frontend/src/pages/exams/ExamHomePage.tsx`, `ExamV2HistoryPage.tsx`, `ExamV2ResultPage.tsx` |
| Existing dashboard tests | `frontend/src/features/dashboard/__tests__/PersonalLearningDashboardPage.test.tsx` |

## 4. Current route map

| Route | Guard | Shell/loading | Purpose | Navigation/back behavior |
|---|---|---|---|---|
| `/` | public redirect | App shell | Redirect to `/home` | `replace` redirect |
| `/home` | public | AppHeader + app scroll | Cội Nguồn landing | Main header |
| `/login` | anonymous | AppHeader hidden | Authentication | `ProtectedRoute` sends unauthenticated users here with `location.state.from` |
| `/quiz` | public | App shell | Quiz landing | Main header |
| `/quiz/generate`, `/quiz/session/**`, `/quiz/result/**`, `/quiz/history` | protected (except landing) | route-specific | AI quiz flow/history | Protected redirect preserves origin |
| `/exams` | public, lazy | AppHeader + `#app-scroll-root` | Exam home/catalog entry | Main header “Luyện thi THPT”; cards link to browse/history |
| `/exams/browse` | public, lazy | App shell | Exam bank | Exam home CTA |
| `/exams/tao-de` | public, lazy | App shell | Create custom mock | Exam flow/quick action |
| `/exams/on-chu-de`, `/exams/on-chu-de/**` | public, lazy | practice routes hide AppHeader for session | Topic list/practice | Dashboard weakness CTA and exam flows |
| `/exams/de/**`, `/exams/luyen-tap/**`, `/exams/tuy-chon/**`, `/exams/on-lai/**` | public, lazy | session routes may hide header | Exam/practice sessions | Result/back route supplied by each page |
| `/exams/ket-qua/:sessionId` | public, lazy | App shell | Result/detail | Links to browse and `/exams/lich-su`; retry/topic CTAs |
| `/exams/lich-su` | public, lazy | App shell | Official exam attempt history | Back to `/exams/browse`; rows link to result |
| `/exams/lich-su-v2` | public alias | Same page | Temporary compatibility alias | No distinct navigation |
| `/exams/thong-ke` | **public, lazy, no `ProtectedRoute`** | AppHeader + `#app-scroll-root`; route fallback | Full Personal Learning Dashboard | No current UI link; direct URL only |
| `/profile` | redirect | — | Redirect to `/profile/dashboard` | `replace` |
| `/profile/dashboard` | protected | `ProfileLayout`, nested profile main scroll | Generic/mock learning overview | Profile sidebar/AppHeader profile dropdown |
| `/profile/history` | protected | `ProfileLayout` + nested scroll | Mixed learning activity | Profile sidebar |
| `/profile/scores` | protected | `ProfileLayout` + nested scroll | Mock score overview/table | Profile sidebar |
| `/profile/settings` | protected | `ProfileLayout` + nested scroll | Settings | Profile sidebar |
| `/admin/**` | protected + role/permission | Admin shell | Admin operations | Admin-only |

App routing uses one top-level shell:

```text
App shell (h-screen, overflow-hidden)
└── AppHeader (sticky top: 0)
    └── #app-scroll-root (flex-1, overflow-y: auto)
        └── Suspense
            └── route page
```

The dashboard follows this app scroll owner. It does not introduce a rail scrollbar or an exam-specific layout.

No route-level `document.title`, `useDocumentTitle`, or breadcrumb system was found in `frontend/src`. The dashboard has an in-page eyebrow “Luyện thi THPT” and heading, but no browser title or breadcrumb integration.

## 5. Navigation and discoverability audit

### Existing entry points

| Surface | Current link | Finding |
|---|---|---|
| `AppHeader` desktop | `/exams` | Exam domain is discoverable; statistics is not a nav item |
| `AppHeader` authenticated dropdown | `/profile/dashboard`, `/profile/history`, `/profile/settings` | Generic “Dashboard” points to profile mock page, not analytics |
| `AppHeader` mobile | `/profile/dashboard` (“Hồ sơ”) | No `/exams/thong-ke` entry |
| `ProfileLayout` sidebar | `/profile/dashboard`, `/profile/history`, `/profile/scores`, `/profile/settings`, `/exams` | No exam statistics item |
| `ExamHomePage` | `/exams/browse`, `/exams/lich-su` | No dashboard card/link |
| `ExamHero` | `/exams/browse`, `/exams/lich-su` | No dashboard CTA |
| `ExamV2HistoryPage` | result links, browse back | No analytics CTA |
| `ExamV2ResultPage` | result, retry, topic, browse, history | No analytics CTA |
| Dashboard itself | history, result, browse, create, topic practice | Good downstream CTAs, but cannot be discovered from the app |
| Footer/breadcrumb/dropdown | No dashboard route reference found | No alternate discovery path |

Focused source search found `/exams/thong-ke` only in `App.tsx` and dashboard tests. Therefore an authenticated or anonymous user who does not know the URL cannot reach the dashboard through current product navigation.

### Information architecture finding

The route is semantically inside “Luyện thi THPT”, not a general profile setting:

- its scope includes only supported exam modes;
- its actions point to exam bank, custom exam, topic practice, attempt history and result pages;
- its facts include exam-specific authority and coverage semantics;
- anonymous local behavior is intentionally supported.

The profile area is still a useful discovery surface, but it should link to the canonical exam analytics page rather than become a second authority.

## 6. `/profile/dashboard` audit

### Current implementation

`frontend/src/pages/profile/ProfileDashboardPage.tsx` is statically imported and wrapped in:

```tsx
<ProtectedRoute>
  <ProfileDashboardPage />
</ProtectedRoute>
```

It renders inside `ProfileLayout` and uses `mockLearningStats`:

- `WelcomeHero`: user greeting, percentile and streak;
- five KPI cards: events viewed, quizzes completed, average score, streak, weekly minutes;
- weekly score/category/grade charts;
- static strengths/weaknesses;
- static recent events and recommendations.

The “Xem lịch sử” link goes to `/profile/history`, whose data is a mixed learning activity timeline. Profile `ScoresPage` is also mock-derived and mixes score records/categories. Neither page consumes the dashboard V1 response, `usePersonalLearningDashboard`, or `dashboardMappers`.

### Guard, discoverability and states

- Guard: authenticated only; anonymous access redirects to `/login`.
- Discoverability: AppHeader profile dropdown and ProfileLayout sidebar both expose the page as “Dashboard/Tổng quan”.
- Loading/error/empty: no data loading state, API error state or empty state; content is deterministic mock data.
- Actions: “Tiếp tục/Ôn lại” buttons in the static recent-events area have no navigation handler.
- Mobile: ProfileLayout uses a mobile sidebar overlay and a fixed menu button; content is constrained to the profile main area.

### Scroll and embedding constraint

`ProfileLayout` has a nested main scroll owner (`overflow-y-auto`) inside the app shell’s `#app-scroll-root`. Embedding the full dashboard there would create a page with two potential vertical scroll contexts and would conflict with the dashboard’s tested app-shell flow. The profile sidebar also has its own `overflow-y-auto`.

### Integration conclusion

Use `/profile/dashboard` as a discovery/summary surface only. A first integration should be a link/card with copy that distinguishes “Tổng quan hồ sơ” from “Thống kê luyện thi”, and should not import `mockLearningStats` into official dashboard calculations.

## 7. `/exams/thong-ke` audit

### Wiring and data orchestration

`PersonalLearningDashboardPage` is lazy-loaded by `App.tsx` and calls `usePersonalLearningDashboard` with the authenticated user id when available. The hook supports:

- explicit DEV-only fixtures via `?fixture=...`;
- authenticated backend source;
- anonymous local source;
- narrowly defined local fallback for exact transport/timeout/502/503/504 ownership;
- no silent backend/local merge.

The page presents loading, error, empty and ready states, source/coverage notices, range control, recent attempts, result links and topic-practice actions. The page is standalone and does not depend on `ExamHomePage`, `ExamV2HistoryPage`, `ProfileLayout` or a current exam session.

### Route/auth behavior

- Route: `/exams/thong-ke`.
- Guard: no `ProtectedRoute`.
- Authenticated: backend-only official analytics according to the dashboard authority policy.
- Anonymous: local-only or explicit no-data state; no backend endpoint is required for local raw answers.
- Backend unavailable: exact fallback policy and visible source notice; no silent merge.

This route must remain public unless product explicitly decides to remove anonymous local learning. Adding a profile guard would contradict the current dashboard contract.

### Layout and navigation behavior

- Uses global `AppHeader` unless an unrelated practice/session route hides it.
- Uses `#app-scroll-root` as the single page scroll owner.
- Utility rail is natural document flow; AppHeader is the only sticky element.
- No breadcrumb and no browser title update.
- In-page links point to `/exams/browse`, `/exams/tao-de`, `/exams/on-chu-de/:topicSlug`, `/exams/lich-su`, `/exams/ket-qua/:sessionId`.
- It has no link back to `/profile/dashboard`, which is acceptable for a canonical detail page but should be supplemented by standard contextual navigation.

### Relationship to exam context

The dashboard is not a current-attempt page and does not require an exam id, question bank, or active session. Its natural parent is the exam domain, with the profile area as a cross-domain entry point.

## 8. User journey audit

| Journey | Current path | Current result | Gap |
|---|---|---|---|
| Anonymous → learn → progress | `/exams` → browse/create/practice → `/exams/ket-qua` → direct `/exams/thong-ke` | Local dashboard can preserve learning continuity | No discoverable dashboard CTA after result/history |
| Login → profile → stats | `/login` → `/profile/dashboard` | Lands on generic mock overview | No clear link to official exam analytics |
| Result → trends | `/exams/ket-qua/:sessionId` → history | Result has retry/topic/history actions | No “Xem thống kê học tập” CTA |
| History → analytics | `/exams/lich-su` | History has summary and result rows | No dashboard link |
| Dashboard → practice | `/exams/thong-ke` → browse/custom/topic/history/result | Works and is the strongest current flow | Entry into dashboard is missing |
| Mobile profile → exam stats | Profile mobile menu → `/profile/dashboard` | Generic profile only | No stats item/card |

## 9. Options A–E

### Option definitions

- **A:** Keep `/exams/thong-ke` canonical; add profile link/card.
- **B:** Keep full detail page in exams; add a summary widget in profile.
- **C:** Canonical profile subroute such as `/profile/dashboard/learning` or `/profile/dashboard/thong-ke`; alias old route.
- **D:** Move canonical page entirely into profile; redirect old route.
- **E:** Keep current route and add many entry points across profile, history, result, catalog/header/mobile.

### Scoring matrix

Scores are 1–5 (5 is best). “Duplication” means low duplication; “complexity” and “regression risk” mean low risk/low cost.

| Criterion | A | B | C | D | E |
|---|---:|---:|---:|---:|---:|
| Discoverability | 4 | 5 | 4 | 4 | 5 |
| Information-architecture fit | 5 | 4 | 4 | 3 | 3 |
| Anonymous compatibility | 5 | 4 | 3 | 1 | 5 |
| Authenticated UX | 4 | 5 | 5 | 5 | 4 |
| Duplication avoidance | 5 | 3 | 3 | 4 | 3 |
| Backward compatibility | 5 | 5 | 4 | 2 | 5 |
| Implementation complexity | 5 | 3 | 3 | 2 | 2 |
| Maintenance | 5 | 3 | 3 | 3 | 2 |
| Performance/bundle | 5 | 3 | 4 | 4 | 3 |
| Mobile navigation | 4 | 4 | 4 | 4 | 3 |
| Accessibility | 4 | 4 | 4 | 4 | 3 |
| Route clarity | 5 | 4 | 4 | 3 | 3 |
| Extensibility | 4 | 5 | 5 | 4 | 4 |
| Regression risk | 5 | 3 | 3 | 2 | 2 |
| **Total / 70** | **65** | **54** | **51** | **41** | **47** |

### Trade-off conclusion

Option A has the highest score because it preserves the existing route, anonymous behavior, exam-domain semantics and single analytics authority. Option B is a future enhancement, not a reason to duplicate the full dashboard now. Option C and D introduce profile guard/scroll/route compatibility problems. Option E improves discovery but spreads navigation debt and creates inconsistent CTA maintenance.

## 10. Official recommendation

### Canonical route

`/exams/thong-ke` remains the only canonical full Personal Learning Dashboard route.

### Entry-point hierarchy

**Primary entry point**

1. Exam home (`/exams`) — add a prominent “Thống kê học tập” card or secondary CTA near “Lịch sử luyện thi”.

**Secondary entry points**

1. `/profile/dashboard` — add one authenticated card/link: “Thống kê luyện thi”, with copy “Xem xu hướng điểm, chủ đề và nhịp học tập”.
2. Authenticated AppHeader profile dropdown — keep “Dashboard” pointing to the profile overview; do not relabel it to the exam analytics route until the profile IA is redesigned.

**Contextual entry points**

1. `/exams/lich-su` — add a header/action link to dashboard.
2. `/exams/ket-qua/:sessionId` — add “Xem thống kê học tập” after the result is available.
3. Mobile exam home/navigation — expose the same exam-home CTA; do not add a crowded global header item unless analytics becomes a top-level product destination.

This is deliberately fewer entry points than Option E. Each link should use the same canonical route and stable label.

### Profile integration

Phase 1 should be link-only or a non-fetching summary card. Do not embed the entire dashboard in `ProfileLayout`; that would duplicate hierarchy, create nested scroll concerns and mix official backend facts with mock profile data.

If a summary widget is later approved:

- fetch or derive facts from the dashboard analytics contract, not `mockLearningStats`;
- reuse `dashboardAnalyticsTypes`, `dashboardMappers` and the existing API/hook;
- show source/coverage semantics consistently;
- lazy-load the widget and avoid an extra dashboard request when the profile already has the required summary;
- link “Xem chi tiết” to `/exams/thong-ke`.

### Auth and anonymous behavior

- `/exams/thong-ke` stays unguarded.
- Anonymous users enter via exam home and see local/no-data dashboard states with explicit source messaging.
- Authenticated users enter from profile or exams and receive backend-only analytics.
- Profile routes remain protected.
- No authenticated silent merge of profile mock data, local attempts and backend analytics.

### Backward compatibility

- Keep `/exams/thong-ke` unchanged.
- Keep `/profile/dashboard` unchanged as the existing generic profile overview.
- Do not redirect either route.
- Preserve `/exams/lich-su-v2` as its current temporary alias until a separate cleanup decision.
- Existing result/history routes and their back links remain valid.

## 11. Component and data reuse strategy

| Future concern | Reuse | Do not do |
|---|---|---|
| Full page | `PersonalLearningDashboardPage` | Copy dashboard JSX into profile |
| Data orchestration | `usePersonalLearningDashboard` | Create a second authenticated/local merge hook |
| Wire contract | `dashboardAnalyticsTypes`, `dashboardAnalyticsValidation` | Treat `dashboardTypes` as a backend DTO |
| Presentation mapping | `dashboardMappers`, `dashboardFormatters` | Recalculate KPI bands in profile |
| API | `dashboardAnalyticsApi` | Add N+1 history/detail requests from profile |
| Profile entry | New small `LearningAnalyticsEntryCard` (link-only first) | Import `mockLearningStats` as official exam source |
| Contextual CTA | Shared route constant/helper if introduced | Hard-code divergent analytics URLs |

The dashboard’s own view model must remain the boundary for ready/loading/error/empty states. A profile summary should consume a deliberately bounded subset and retain authority/coverage labels.

## 12. File-level implementation map (future Goal; no changes in this audit)

### Goal N1 — Add canonical entry points

| File | Planned change | Data/API impact |
|---|---|---|
| `frontend/src/pages/exams/ExamHomePage.tsx` | Add one analytics card/CTA adjacent to history | Link-only; no new request |
| `frontend/src/pages/profile/ProfileDashboardPage.tsx` | Add “Thống kê luyện thi” entry card | Link-only; no change to mock KPI semantics |
| `frontend/src/pages/exams/ExamV2HistoryPage.tsx` | Add contextual dashboard link | Link-only |
| `frontend/src/pages/exams/ExamV2ResultPage.tsx` | Add post-result analytics CTA | Link-only; preserve existing result actions |
| `frontend/src/components/layout/AppHeader.tsx` | Only if product chooses a global mobile/exam item; otherwise no change | No data impact |

Acceptance: every new link resolves to `/exams/thong-ke`; keyboard focus, accessible name and mobile layout pass; no duplicate analytics fetch.

### Goal N2 — Optional profile summary widget

| File | Planned change |
|---|---|
| New `frontend/src/components/profile/LearningAnalyticsEntryCard.tsx` | Reusable link-only/summary-card shell |
| `frontend/src/pages/profile/ProfileDashboardPage.tsx` | Render card in a stable location |
| `frontend/src/features/dashboard/usePersonalLearningDashboard.ts` | Only extend if a shared bounded summary query is needed; preserve source policy |
| `frontend/src/services/dashboardAnalyticsApi.ts` | Reuse existing endpoint; no new endpoint unless backend contract changes |
| `frontend/src/features/dashboard/dashboardMappers.ts` | Expose a bounded summary projection if needed |

Acceptance: profile and full dashboard show the same facts for the same source; incomplete coverage is visible; profile remains protected while canonical route remains public.

### Goal N3 — Navigation semantics and QA

| File/area | Planned change |
|---|---|
| `frontend/src/App.tsx` | No route move; optionally add a shared route title mechanism in a separate navigation goal |
| `frontend/src/components/layout/AppHeader.tsx` | Verify mobile/desktop entry decision |
| `frontend/src/layouts/ProfileLayout.tsx` | Add a profile nav item only if it links to canonical stats; do not nest the full page |
| Dashboard/browser tests | Verify route, guards, CTA destinations, scroll owner and mobile layout |
| `docs/dashboard-exams/DASHBOARD_MODULE_HANDOFF.md` | Update canonical route and entry-point status after implementation |
| `docs/dashboard-exams/DASHBOARD_RELEASE_CHECKLIST.md` | Add discoverability/profile integration checks |

No backend, database, auth policy, scoring, source aggregation or migration work is implied by this map.

## 13. Test and validation plan for implementation

### Routing and auth

- Anonymous `/exams/thong-ke` renders local/no-data state; it does not redirect to login.
- Anonymous `/profile/dashboard` redirects to `/login` and preserves `from`.
- Authenticated profile card links to `/exams/thong-ke`.
- Existing `/exams/lich-su`, `/exams/ket-qua/:sessionId` and alias routes remain unchanged.
- Browser back from dashboard returns to the originating profile/exam page naturally.

### Navigation

- Desktop AppHeader, mobile menu, profile sidebar and exam home have no conflicting labels.
- At least one primary and one profile entry point are visible without knowing the URL.
- All links have accessible names and visible keyboard focus.
- No dead link or route spelling drift.

### Data/source

- Profile link-only variant makes no API call.
- Optional summary widget reuses the existing validated response and does not import mock profile data.
- Backend/local/fallback notices are preserved.
- No raw answers or correct answers are exposed by a profile integration.

### Layout and responsive behavior

- Full dashboard still uses `#app-scroll-root` as the only vertical owner.
- Profile page does not acquire an additional nested dashboard scroll region.
- Check 1440×900, 1366×768, 1280×720 and 768×1024.
- Mobile profile overlay and exam mobile navigation do not cover the CTA.

### Quality gates

- TypeScript compile, targeted dashboard tests and production build.
- Route/link test coverage for every new entry point.
- `git diff --check`.
- No staged/committed unrelated dataset artifact.

## 14. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Relabeling profile “Dashboard” to mean exam analytics | Users lose the generic profile overview | Keep distinct labels: “Tổng quan” and “Thống kê luyện thi” |
| Full-page embedding in `ProfileLayout` | Nested scroll, duplicate hierarchy, mobile regressions | Link-only first; keep canonical standalone |
| Reusing `mockLearningStats` as official facts | Misleading KPI/authority and mixed quiz/event scope | Use dashboard API/ViewModel only |
| Too many entry points | Navigation clutter and inconsistent copy | Use primary + profile + two contextual links only |
| Adding `ProtectedRoute` to canonical route | Breaks anonymous local learning | Keep route public; guard only profile surface |
| History/result CTA drift | Users cannot find analytics from natural moments | Centralize route constant/CTA test |
| Missing browser title/breadcrumb | Reduced orientation/deep-link clarity | Separate navigation semantics goal; do not invent a second route |
| Profile summary fetch on every visit | Latency and duplicate backend work | Link-only first; bounded/shared query only if approved |

## 15. CANNOT CONFIRM

The following require product, authenticated browser or backend evidence and were not inferred:

1. Whether product wants analytics to be a global top-level navigation item or exam-only destination.
2. Whether profile summary should remain link-only or include live KPI cards.
3. Authenticated browser rendering of `/profile/dashboard`, because no test session was assumed and credentials/cookies were not inspected.
4. Real production distribution of anonymous local data versus backend attempts.
5. Whether users expect profile mock metrics to be replaced by real data in the same Goal.
6. Final copy/priority of result/history CTAs.
7. Whether a route-title/breadcrumb system is planned outside the files audited.
8. Whether `/exams/lich-su-v2` can be removed after its compatibility window.
9. Performance impact of a future live profile summary under real attempt volume.
10. Backend/API availability and authorization behavior in a deployed environment.

## 16. Readiness verdict

| Layer | Verdict | Reason |
|---|---|---|
| Canonical route | **READY** | `/exams/thong-ke` already exists and is the correct exam-domain boundary |
| Anonymous access | **READY WITH TEST COVERAGE** | Hook defines local/no-data policy; UI entry points are missing |
| Authenticated access | **READY WITH TEST COVERAGE** | Backend-only policy exists; profile does not link to it |
| Profile integration | **NOT IMPLEMENTED** | Existing profile page is mock/static and has no analytics entry |
| Navigation discoverability | **BLOCKED** | No UI reference to `/exams/thong-ke` outside route/tests |
| Full-page embedding | **NOT RECOMMENDED** | Conflicts with profile nested scroll and scope |
| Route migration/alias | **NOT NEEDED** | Moving route would reduce anonymous compatibility and add redirect debt |
| Overall | **READY FOR REVIEW, NOT READY TO CODE** | Recommendation and file map are complete; implementation requires product sign-off on entry-point/card scope |

### Review gate

Approve or revise these decisions before implementation:

1. Keep `/exams/thong-ke` as canonical full dashboard.
2. Add exam-home and profile link/card entry points.
3. Keep profile integration link-only in the first pass.
4. Keep the canonical route public and preserve anonymous local/no-data states.
5. Add history/result contextual links only if the product wants the extra discoverability.

No source, route, CSS, auth, backend, database, scoring or migration changes were made by this audit. No files were staged, committed or pushed.
