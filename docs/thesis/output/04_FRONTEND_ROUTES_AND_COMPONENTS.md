# 04 — Frontend routes and components

The route table below is extracted from `frontend/src/App.tsx`. A route is not proof that its backend or external provider is reachable.

| Path | Component/element | Protected | Role/permission | Evidence |
| --- | --- | --- | --- | --- |
| / | Navigate | no |  | frontend/src/App.tsx:89 |
| /home | CoiNguonPage | no |  | frontend/src/App.tsx:90 |
| /map | MapPage | no |  | frontend/src/App.tsx:91 |
| /browse | AllEventsPage | no |  | frontend/src/App.tsx:92 |
| /periods | HistoricalPeriodsPage | no |  | frontend/src/App.tsx:93 |
| /events/:slug | EventDetailPage | no |  | frontend/src/App.tsx:94 |
| /login | LoginPage | no |  | frontend/src/App.tsx:97 |
| /register | RegisterPage | no |  | frontend/src/App.tsx:98 |
| /verify-email | VerifyEmailPage | no |  | frontend/src/App.tsx:99 |
| /forgot-password | ForgotPasswordPage | no |  | frontend/src/App.tsx:100 |
| /reset-password | ResetPasswordPage | no |  | frontend/src/App.tsx:101 |
| /quiz | QuizHomePage | no |  | frontend/src/App.tsx:104 |
| /quiz/generate | QuizGeneratePage | yes |  | frontend/src/App.tsx:105 |
| /quiz/session/:sessionId | QuizSessionPage | yes |  | frontend/src/App.tsx:106 |
| /quiz/result/:sessionId | QuizResultPage | yes |  | frontend/src/App.tsx:107 |
| /quiz/history | QuizHistoryPage | yes |  | frontend/src/App.tsx:108 |
| /exams | ExamHomePage | no |  | frontend/src/App.tsx:111 |
| /exams/create | Navigate | no |  | frontend/src/App.tsx:112 |
| /exams/session/:examId | LegacyExamSessionRedirect | no |  | frontend/src/App.tsx:113 |
| /exams/result/:examId | Navigate | no |  | frontend/src/App.tsx:114 |
| /exams/history | Navigate | no |  | frontend/src/App.tsx:115 |
| /exams/browse | ExamBrowsePage | no |  | frontend/src/App.tsx:116 |
| /exams/tao-de | ApiCustomCreatePage | no |  | frontend/src/App.tsx:117 |
| /exams/tuy-chon/luyen-tap/:sessionId | ApiCustomPracticeSessionRoutePage | no |  | frontend/src/App.tsx:118 |
| /exams/tuy-chon/:sessionId | ApiCustomMockSessionRoutePage | no |  | frontend/src/App.tsx:119 |
| /exams/de/:examId | ExamV2SessionPage | no |  | frontend/src/App.tsx:120 |
| /exams/luyen-tap/:examId | ApiFreePracticeRoutePage | no |  | frontend/src/App.tsx:121 |
| /exams/on-chu-de | ApiTopicListPage | no |  | frontend/src/App.tsx:122 |
| /exams/on-chu-de/:topicSlug | ApiTopicPracticeRoutePage | no |  | frontend/src/App.tsx:123 |
| /exams/ai | Navigate | no |  | frontend/src/App.tsx:124 |
| /exams/ket-qua/:sessionId | ExamV2ResultPage | no |  | frontend/src/App.tsx:125 |
| /exams/on-lai/:sessionId | ApiRetryWrongRoutePage | no |  | frontend/src/App.tsx:126 |
| /exams/lich-su | ExamV2HistoryPage | no |  | frontend/src/App.tsx:127 |
| /exams/lich-su-v2 | ExamV2HistoryPage | no |  | frontend/src/App.tsx:128 |
| /exams/thong-ke | PersonalLearningDashboardPage | no |  | frontend/src/App.tsx:129 |
| /profile | Navigate | no |  | frontend/src/App.tsx:139 |
| /profile/dashboard | ProfileDashboardPage | yes |  | frontend/src/App.tsx:140 |
| /profile/history | LearningHistoryPage | yes |  | frontend/src/App.tsx:141 |
| /profile/scores | ScoresPage | yes |  | frontend/src/App.tsx:142 |
| /profile/settings | ProfileSettingsPage | yes |  | frontend/src/App.tsx:143 |
| /admin | Navigate | no |  | frontend/src/App.tsx:146 |
| /admin/dashboard | AdminDashboardPage | yes | admin | frontend/src/App.tsx:147 |
| /admin/users | AdminUsersPage | yes | admin | frontend/src/App.tsx:148 |
| /admin/events | AdminEventsPage | yes | admin | frontend/src/App.tsx:149 |
| /admin/exams/ai-candidates | AdminAiCandidatesPage | yes | AI_CANDIDATE_VIEW | frontend/src/App.tsx:150 |
| /admin/exams/ai-candidates/:id | AdminAiCandidateDetailPage | yes | AI_CANDIDATE_VIEW | frontend/src/App.tsx:151 |
| /admin/questions | Navigate | no |  | frontend/src/App.tsx:152 |

Notable design evidence: `Timeline.tsx` is a custom React timeline; the Cesium Viewer disables the built-in animation/timeline widgets. There is no explicit wildcard not-found route in the extracted route list.
