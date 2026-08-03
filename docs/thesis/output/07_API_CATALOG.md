# 07 — API catalog

## Spring REST API (68 statically extracted routes)

| Method | Path | Controller | Handler | Evidence |
| --- | --- | --- | --- | --- |
| GET | /api/admin/dashboard | AdminController | dashboard | backend/src/main/java/com/lichsuvn/backend/admin/api/AdminController.java:30 |
| GET | /api/admin/users | AdminController | users | backend/src/main/java/com/lichsuvn/backend/admin/api/AdminController.java:35 |
| PATCH | /api/admin/users/{id}/status | AdminController | updateUserStatus | backend/src/main/java/com/lichsuvn/backend/admin/api/AdminController.java:46 |
| PATCH | /api/admin/users/{id}/role | AdminController | updateUserRole | backend/src/main/java/com/lichsuvn/backend/admin/api/AdminController.java:55 |
| DELETE | /api/admin/users/{id} | AdminController | deleteUser | backend/src/main/java/com/lichsuvn/backend/admin/api/AdminController.java:64 |
| GET | /api/admin/events | AdminController | events | backend/src/main/java/com/lichsuvn/backend/admin/api/AdminController.java:72 |
| GET | /api/admin/events/{id} | AdminController | event | backend/src/main/java/com/lichsuvn/backend/admin/api/AdminController.java:86 |
| POST | /api/admin/events | AdminController | createEvent | backend/src/main/java/com/lichsuvn/backend/admin/api/AdminController.java:91 |
| PUT | /api/admin/events/{id} | AdminController | updateEvent | backend/src/main/java/com/lichsuvn/backend/admin/api/AdminController.java:99 |
| PATCH | /api/admin/events/{id}/status | AdminController | updateEventStatus | backend/src/main/java/com/lichsuvn/backend/admin/api/AdminController.java:108 |
| DELETE | /api/admin/events/{id} | AdminController | deleteEvent | backend/src/main/java/com/lichsuvn/backend/admin/api/AdminController.java:117 |
| POST | /api/auth/register | AuthController | register | backend/src/main/java/com/lichsuvn/backend/auth/api/AuthController.java:69 |
| POST | /api/auth/login | AuthController | login | backend/src/main/java/com/lichsuvn/backend/auth/api/AuthController.java:81 |
| POST | /api/auth/oauth/google | AuthController | googleOAuth | backend/src/main/java/com/lichsuvn/backend/auth/api/AuthController.java:101 |
| POST | /api/auth/oauth/facebook | AuthController | facebookOAuth | backend/src/main/java/com/lichsuvn/backend/auth/api/AuthController.java:119 |
| GET | /api/auth/verify-email | AuthController | verifyEmail | backend/src/main/java/com/lichsuvn/backend/auth/api/AuthController.java:132 |
| GET | /api/auth/me | AuthController | me | backend/src/main/java/com/lichsuvn/backend/auth/api/AuthController.java:142 |
| POST | /api/auth/me/update | AuthController | updateProfile | backend/src/main/java/com/lichsuvn/backend/auth/api/AuthController.java:147 |
| POST | /api/auth/refresh | AuthController | refresh | backend/src/main/java/com/lichsuvn/backend/auth/api/AuthController.java:162 |
| POST | /api/auth/logout | AuthController | logout | backend/src/main/java/com/lichsuvn/backend/auth/api/AuthController.java:183 |
| POST | /api/auth/forgot-password | AuthController | forgotPassword | backend/src/main/java/com/lichsuvn/backend/auth/api/AuthController.java:192 |
| POST | /api/auth/resend-verification | AuthController | resendVerification | backend/src/main/java/com/lichsuvn/backend/auth/api/AuthController.java:204 |
| POST | /api/auth/reset-password | AuthController | resetPassword | backend/src/main/java/com/lichsuvn/backend/auth/api/AuthController.java:213 |
| POST | /api/auth/change-password | AuthController | changePassword | backend/src/main/java/com/lichsuvn/backend/auth/api/AuthController.java:225 |
| POST | /api/auth/delete-account | AuthController | deleteAccount | backend/src/main/java/com/lichsuvn/backend/auth/api/AuthController.java:233 |
| GET | /api/events | EventController | findEvents | backend/src/main/java/com/lichsuvn/backend/event/api/EventController.java:33 |
| GET | /api/timeline | EventController | findTimeline | backend/src/main/java/com/lichsuvn/backend/event/api/EventController.java:69 |
| GET | /api/events/{idOrSlug} | EventController | findDetail | backend/src/main/java/com/lichsuvn/backend/event/api/EventController.java:79 |
| GET | /api/events/{eventId}/children | EventController | findChildren | backend/src/main/java/com/lichsuvn/backend/event/api/EventController.java:84 |
| GET | /api/events/{eventId}/related | EventController | findRelated | backend/src/main/java/com/lichsuvn/backend/event/api/EventController.java:89 |
| POST | /api/exams/ai/generate | AiQuizController | generate | backend/src/main/java/com/lichsuvn/backend/exam/ai/api/AiQuizController.java:24 |
| POST | /api/quiz/generate | PracticeQuizController | generate | backend/src/main/java/com/lichsuvn/backend/exam/ai/api/PracticeQuizController.java:24 |
| POST | /api/exams/ai/candidates | AiCandidateController | create | backend/src/main/java/com/lichsuvn/backend/exam/ai/review/api/AiCandidateController.java:27 |
| GET | /api/exams/ai/candidates | AiCandidateController | list | backend/src/main/java/com/lichsuvn/backend/exam/ai/review/api/AiCandidateController.java:32 |
| GET | /api/exams/ai/candidates/publish-targets | AiCandidateController | publishTargets | backend/src/main/java/com/lichsuvn/backend/exam/ai/review/api/AiCandidateController.java:44 |
| GET | /api/exams/ai/candidates/{id} | AiCandidateController | detail | backend/src/main/java/com/lichsuvn/backend/exam/ai/review/api/AiCandidateController.java:45 |
| PUT | /api/exams/ai/candidates/{id} | AiCandidateController | update | backend/src/main/java/com/lichsuvn/backend/exam/ai/review/api/AiCandidateController.java:46 |
| POST | /api/exams/ai/candidates/{id}/submit | AiCandidateController | submit | backend/src/main/java/com/lichsuvn/backend/exam/ai/review/api/AiCandidateController.java:47 |
| POST | /api/exams/ai/candidates/{id}/approve | AiCandidateController | approve | backend/src/main/java/com/lichsuvn/backend/exam/ai/review/api/AiCandidateController.java:48 |
| POST | /api/exams/ai/candidates/{id}/reject | AiCandidateController | reject | backend/src/main/java/com/lichsuvn/backend/exam/ai/review/api/AiCandidateController.java:49 |
| POST | /api/exams/ai/candidates/{id}/publish | AiCandidateController | publish | backend/src/main/java/com/lichsuvn/backend/exam/ai/review/api/AiCandidateController.java:50 |
| POST | /api/exams/ai/candidates/{id}/revisions | AiCandidateController | createRevision | backend/src/main/java/com/lichsuvn/backend/exam/ai/review/api/AiCandidateController.java:51 |
| POST | /api/exams/ai/candidates/{id}/source-search | AiCandidateController | sourceSearch | backend/src/main/java/com/lichsuvn/backend/exam/ai/review/api/AiCandidateController.java:52 |
| PUT | /api/exams/ai/candidates/{id}/sources | AiCandidateController | remapSources | backend/src/main/java/com/lichsuvn/backend/exam/ai/review/api/AiCandidateController.java:53 |
| GET | /api/exams/ai/candidates/{id}/audit | AiCandidateController | audit | backend/src/main/java/com/lichsuvn/backend/exam/ai/review/api/AiCandidateController.java:54 |
| GET | /api/time | ExamAttemptController | serverTime | backend/src/main/java/com/lichsuvn/backend/exam/api/ExamAttemptController.java:31 |
| POST | /api/exams/attempts | ExamAttemptController | retiredAttemptWrite | backend/src/main/java/com/lichsuvn/backend/exam/api/ExamAttemptController.java:37 |
| GET | /api/exams/attempts | ExamAttemptController | listAttempts | backend/src/main/java/com/lichsuvn/backend/exam/api/ExamAttemptController.java:46 |
| GET | /api/exams/attempts/{sessionId} | ExamAttemptController | findAttempt | backend/src/main/java/com/lichsuvn/backend/exam/api/ExamAttemptController.java:54 |
| GET | /api/exams | ExamCatalogController | list | backend/src/main/java/com/lichsuvn/backend/exam/catalog/api/ExamCatalogController.java:28 |
| GET | /api/exams/topics | ExamCatalogController | topics | backend/src/main/java/com/lichsuvn/backend/exam/catalog/api/ExamCatalogController.java:33 |
| POST | /api/exams/custom/preview | ExamCatalogController | preview | backend/src/main/java/com/lichsuvn/backend/exam/catalog/api/ExamCatalogController.java:38 |
| GET | /api/exams/{examId} | ExamCatalogController | detail | backend/src/main/java/com/lichsuvn/backend/exam/catalog/api/ExamCatalogController.java:43 |
| POST | /api/exam-sessions | ExamSessionController | create | backend/src/main/java/com/lichsuvn/backend/exam/session/api/ExamSessionController.java:28 |
| GET | /api/exam-sessions/{sessionId} | ExamSessionController | resume | backend/src/main/java/com/lichsuvn/backend/exam/session/api/ExamSessionController.java:33 |
| POST | /api/exam-sessions/{sessionId}/questions/{questionInstanceId}/check | ExamSessionController | check | backend/src/main/java/com/lichsuvn/backend/exam/session/api/ExamSessionController.java:38 |
| POST | /api/exam-sessions/{sessionId}/complete | ExamSessionController | complete | backend/src/main/java/com/lichsuvn/backend/exam/session/api/ExamSessionController.java:43 |
| POST | /api/exam-sessions/{sessionId}/submit | ExamSessionController | submit | backend/src/main/java/com/lichsuvn/backend/exam/session/api/ExamSessionController.java:48 |
| POST | /api/exam-submissions/recover | ExamSubmissionRecoveryController | recover | backend/src/main/java/com/lichsuvn/backend/exam/session/api/ExamSubmissionRecoveryController.java:22 |
| POST | /api/events/{eventId}/view | ProgressController | recordEventView | backend/src/main/java/com/lichsuvn/backend/progress/api/ProgressController.java:29 |
| GET | /api/events/{eventId}/progress | ProgressController | findEventProgress | backend/src/main/java/com/lichsuvn/backend/progress/api/ProgressController.java:39 |
| GET | /api/progress/me | ProgressController | findMyProgress | backend/src/main/java/com/lichsuvn/backend/progress/api/ProgressController.java:48 |
| POST | /api/tts/events/{eventId}/audio | NarrationController | requestEventAudio | backend/src/main/java/com/lichsuvn/backend/tts/api/NarrationController.java:60 |
| GET | /api/tts/audio-assets/{assetId} | NarrationController | getAudioAsset | backend/src/main/java/com/lichsuvn/backend/tts/api/NarrationController.java:77 |
| POST | /api/tts/generate | NarrationController | generate | backend/src/main/java/com/lichsuvn/backend/tts/api/NarrationController.java:94 |
| GET | /api/tts/status/{jobId} | NarrationController | getStatus | backend/src/main/java/com/lichsuvn/backend/tts/api/NarrationController.java:123 |
| GET | /api/tts/audio/{filename:.+} | NarrationController | getAudio | backend/src/main/java/com/lichsuvn/backend/tts/api/NarrationController.java:158 |
| GET | /api/tts/voices | NarrationController | getVoices | backend/src/main/java/com/lichsuvn/backend/tts/api/NarrationController.java:182 |

## AI FastAPI routes (5)

| Service | Verb | Path | Handler | Evidence |
| --- | --- | --- | --- | --- |
| AI | POST/GET | /generate | generate_quiz | ai-service/app/api/routes/generation.py:25 |
| AI | POST/GET | /health | health | ai-service/app/api/routes/health.py:66 |
| AI | POST/GET | /validate | provenance_validate | ai-service/app/api/routes/provenance.py:35 |
| AI | POST/GET | /sources/search | canonical_source_search | ai-service/app/api/routes/provenance.py:52 |
| AI | POST/GET | /debug | retrieval_debug | ai-service/app/api/routes/retrieval.py:21 |

AI router prefixes and deployment base paths are configuration-dependent; verify the composed URL in the target environment before citing it as a public endpoint.
