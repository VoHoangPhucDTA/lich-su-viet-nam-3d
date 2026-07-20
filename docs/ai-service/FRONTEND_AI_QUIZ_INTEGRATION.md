# Frontend AI Quiz Integration

## Runtime và route

- Path: `frontend/`.
- React 19.2 + TypeScript 5.9 + Vite 7.3, npm/`package-lock.json`.
- Route: authenticated `/exams/ai`.
- Browser gọi duy nhất Spring `POST /api/exams/ai/generate` qua API client chung và HttpOnly cookie.

## Component reuse mapping

| Existing component | Decision |
|---|---|
| `ExamPracticeHeader` | Reused directly cho nhãn AI, back link và badge memory-only |
| `MCQQuestionCardV2` / `ExamOptionCard` | Reused directly qua typed adapter cho A–D, keyboard/radio và review đúng/sai/explanation |
| `ExamQuickNavigator` / `ExamAnswerSheet` | Reused directly cho desktop/mobile question navigation |
| Official exam session/result APIs | Không reuse vì sẽ persist attempt; Goal 11 chấm local |
| `QuestionSourceBlock` | Không reuse trực tiếp vì source AI có grade/lesson/page riêng; new semantic source details |

## Lifecycle và data policy

State: `IDLE → VALIDATING → GENERATING → READY → SUBMITTED`; failure tới `ERROR`. Form validation bám DTO Spring. `apiPostOnce` giữ cookie/base URL nhưng không auth-refresh replay request đắt tiền. Abort/unmount dừng chờ browser; không khẳng định upstream generation đã hủy.

Response được parse strict rồi adapter sang `MCQQuestion`. Temporary ID có prefix `ai-`, không giả database ID. Answers, questions, score và sources chỉ ở component memory; không local/session storage, IndexedDB hoặc server write. Restart chỉ reset answer; new set gửi đúng một generation request.

Partial có ít nhất một câu vẫn dùng được và hiển thị X/Y. Source chỉ hiện sau submit. Warning kỹ thuật không render cho học sinh và không được gọi là factual error.

## Verification

- Unit: endpoint/body/signal, full/partial parser, nullable page, malformed option/correct/source/count, error normalization.
- Adapter: A–D/correct/source/temporary ID/partial/nullable page/deduplicate.
- Component mock Spring: validation, loading, double submit, answer/submit/score/explanation/source, partial, restart/new set, neutral warning.
- Static security/no-persistence scan kiểm tra không FastAPI URL/key/internal endpoint/storage/official submission trong production Goal 11 paths.
- Real E2E cần FastAPI + Spring + MySQL + authenticated browser session; chưa được coi là pass nếu chỉ dùng mock Spring response.

Kết quả 2026-07-20: 27/27 test Goal 11 và 118/118 full frontend tests pass; `tsc -b` và `npm run build` pass. ESLint trên các file Goal 11 pass; full repository ESLint còn 36 baseline findings ngoài phạm vi. Các port local 3306/8001/8080/5173 đều không listen nên real authenticated E2E chưa chạy.

## Goal 13 permission-aware UI

The auth context refreshes `/api/auth/me` and consumes backend-exposed permissions. Candidate routes/navigation/actions use permission guards rather than inferring publish authority from an admin URL. Teacher can review another creator's candidate but never sees publish. A creator does not see normal approve; an admin creator sees only explicit override controls with mandatory reason. Forbidden backend responses remain authoritative even if browser state is stale.

## Goal 12 admin review UI

Students retain the memory-only `/exams/ai` flow. An admin additionally sees an explicit per-question selection and “Lưu để duyệt” action backed by the generation receipt. `/admin/exams/ai-candidates` provides the queue and filters; `/admin/exams/ai-candidates/:id` separates original/current content, provenance, neutral manual-review warnings, sources, audit, edit/submit/approve/reject, and confirmed explicit publish. Published fields are disabled, and version conflicts ask the reviewer to reload. No API key, raw prompt, vector, or client-selected provenance is sent.

## Revision detail UX

A published detail shows create-revision only when permitted and no revision is open; otherwise it links to the open candidate. Revision detail renders the immutable base snapshot/options beside current editable content, reason/number/hash, sources and audit. Draft/rejected revisions can search via Spring, select canonical results, supply a remap reason, then use the normal lifecycle. Target publish is pinned to the base dataset/definition/section. React text rendering escapes excerpts/diffs; the frontend contains no FastAPI URL or internal token.
