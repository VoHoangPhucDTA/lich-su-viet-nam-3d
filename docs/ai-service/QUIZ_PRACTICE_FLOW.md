# Quiz practice AI flow (Goal 14)

## User flow

`/quiz` is public overview. Authenticated users create a self-study set at `/quiz/generate`, answer it at `/quiz/session/:sessionId`, review `/quiz/result/:sessionId`, and browse `/quiz/history`. The legacy `/exams/ai` URL redirects to `/quiz/generate`; no AI card remains on `/exams`.

The form sends only `{query, difficulty, count}`. Count is limited to 1–10, the time limit is fixed at 15 minutes, and one in-flight request is allowed. Abort cancels the browser wait; generation is never retried automatically.

## API boundary

`POST /api/quiz/generate` is authenticated. Spring sets `topK=5`, `grade=null`, `lessonNumber=null`, and `documentId=null` before calling FastAPI, so retrieval searches the complete grade 10–12 textbook corpus. It validates the grounded response and returns `questions`, `sources`, `warnings`, and `generation`; it never calls `AiGenerationReceiptRepository`.

The compatibility endpoint `POST /api/exams/ai/generate` and admin candidate/review/publish APIs remain unchanged. They are separate from the student practice flow and may still require the V35–V37 migrations when operated.

## Local data policy

The browser maps sources to title/location, preserves partial generation metadata, and stores sessions/results/history in localStorage (maximum 50 results). Every read checks the stored `userId`. Correct answers, explanations, and sources are rendered only after submission. No candidate is created from `/quiz`.

## Verification

Run the backend AI/controller tests, `npx tsc -b`, `npm run build`, and `git diff --check`. Manual smoke: log in, open `/quiz/generate`, generate once, answer/submit, then confirm source details on the result and user-isolated history.
