# Quiz practice AI flow (Goal 14)

## User flow

`/quiz` is public overview. Authenticated users create a self-study set at `/quiz/generate`, answer it at `/quiz/session/:sessionId`, review `/quiz/result/:sessionId`, and browse `/quiz/history`. The legacy `/exams/ai` URL redirects to `/quiz/generate`; no AI card remains on `/exams`.

The form sends only `{query, difficulty, count}`. Count is limited to 1–10. The browser derives the practice time limit from the resolved count: 1–3 questions use 5 minutes, 4–6 use 10 minutes, and 7–10 use 15 minutes. One in-flight request is allowed. Abort cancels the browser wait; generation is never retried automatically.

## API boundary

`POST /api/quiz/generate` is authenticated. Spring sets `topK=5`, `grade=null`, `lessonNumber=null`, and `documentId=null` before calling FastAPI, so retrieval searches the complete grade 10–12 textbook corpus. It validates the grounded response and returns `questions`, `sources`, `warnings`, and `generation`; it never calls `AiGenerationReceiptRepository`.

The compatibility endpoint `POST /api/exams/ai/generate` and admin candidate/review/publish APIs remain separate from student practice. The current candidate/revision workflow requires the complete Flyway schema through V38.

## Local data policy

The browser maps sources to title/location, preserves partial generation metadata, and stores sessions/results/history in localStorage (maximum 50 results). Every read checks the stored `userId`. Correct answers, explanations, and sources are rendered only after submission. No candidate is created from `/quiz`.

## Verification

Goal 16C completed authenticated viewport, keyboard, dialog/focus, mobile progress, result navigation, and THPT shared-primitive regression checks. Goal 17A then passed 536/536 frontend tests, TypeScript, ESLint, encoding, production build, backend/FastAPI suites, and two deterministic four-service Compose E2E runs. Live Gemini is not called by CI. Manual smoke remains: log in, open `/quiz/generate`, generate once with the configured local provider, answer/submit, then confirm source details on the result and user-isolated history.
