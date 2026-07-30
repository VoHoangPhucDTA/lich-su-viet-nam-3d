# Frontend ESLint baseline remediation — Goal 16D

## Baseline

The machine-readable baseline captured before source changes contained 18 errors
and 4 warnings across 18 files.

| Rule | Errors | Warnings |
| --- | ---: | ---: |
| `react-hooks/set-state-in-effect` | 6 | 0 |
| `react-refresh/only-export-components` | 4 | 0 |
| `@typescript-eslint/no-unused-vars` | 3 | 0 |
| `@typescript-eslint/no-empty-object-type` | 2 | 0 |
| `react-hooks/immutability` | 1 | 0 |
| `react-hooks/purity` | 1 | 0 |
| `no-useless-escape` | 1 | 0 |
| `react-hooks/exhaustive-deps` | 0 | 3 |
| Unused ESLint directive | 0 | 1 |

No ESLint rule, severity, directory inclusion or CI command was changed.

## Finding classification and fix direction

| File | Line | Rule | Root-cause category | Fix direction | Behavior risk |
| --- | ---: | --- | --- | --- | --- |
| `components/auth/PasswordStrengthMeter.tsx` | 1 | `react-refresh/only-export-components` | `IMPORT_OR_EXPORT` | Keep the helper private to its component module. | Low |
| `components/event-detail/EventChildrenList.tsx` | 122 | `react-hooks/set-state-in-effect` | `HOOK_EFFECT_STATE_DERIVATION` | Reset thumbnail fallback state through a keyed component identity. | Low |
| `components/event-detail/EventHero.tsx` | 40 | `react-hooks/set-state-in-effect` | `HOOK_EFFECT_STATE_DERIVATION` | Key the hero by event and thumbnail identity. | Low |
| `components/layout/HeaderContext.tsx` | 20 | `react-refresh/only-export-components` | `IMPORT_OR_EXPORT` | Move the hook/context value to a non-component module. | Low |
| `components/onboarding/OnboardingGuide.tsx` | 35 | `react-refresh/only-export-components` | `IMPORT_OR_EXPORT` | Remove an unused co-located hook. | Low |
| `components/profile/Skeleton.tsx` | 105 | `react-hooks/purity` | `RENDER_SIDE_EFFECT` | Replace render-time randomness with fixed representative heights. | Low |
| `data/vietnamProvinceCentroids.ts` | 29 | `no-useless-escape` | `OTHER` | Remove the unnecessary hyphen escape while preserving the character class. | Low |
| `hooks/useActiveSection.ts` | 199 | `react-hooks/set-state-in-effect` | `HOOK_EFFECT_STATE_DERIVATION` | Associate active state with the section identity and derive the reset value. | Medium |
| `lib/exam/useSessionV2.ts` | 101 | `react-hooks/set-state-in-effect` | `HOOK_EFFECT_STATE_DERIVATION` | Key loaded exam/session/error state by `examId`; loading becomes derived state. | Medium |
| `pages/auth/VerifyEmailPage.tsx` | 20 | `react-hooks/set-state-in-effect` | `HOOK_EFFECT_STATE_DERIVATION` | Initialize the missing-token state from the URL token. | Low |
| `pages/exams/ExamCreatePage.tsx` | 53 | `react-hooks/set-state-in-effect` | `HOOK_EFFECT_STATE_DERIVATION` | Initialize form state from a pure preset configuration. | Medium |
| `pages/exams/ExamCreatePage.tsx` | 76 | `@typescript-eslint/no-unused-vars` | `UNUSED_CODE` | Remove the unused catch binding. | Low |
| `pages/exams/ExamSessionPage.tsx` | 80 | `@typescript-eslint/no-unused-vars` | `UNUSED_CODE` | Omit the unused tuple key in status filtering. | Low |
| `pages/exams/ExamSessionPage.tsx` | 192 | `react-hooks/immutability` | `RENDER_SIDE_EFFECT` | Track timer ticks in a ref and copy the value during persistence. | Medium |
| `services/examService.ts` | 14 | `@typescript-eslint/no-unused-vars` | `UNUSED_CODE` | Remove the ignored owner parameter and update direct callers. | Low |
| `services/ragQuizApiContract.ts` | 27 | `@typescript-eslint/no-empty-object-type` | `TYPE_SAFETY` | Use a type alias for the unchanged response shape. | Low |
| `services/ragQuizApiContract.ts` | 54 | `@typescript-eslint/no-empty-object-type` | `TYPE_SAFETY` | Use a type alias for the unchanged result shape. | Low |
| `theme/ThemeContext.tsx` | 37 | `react-refresh/only-export-components` | `IMPORT_OR_EXPORT` | Remove the unused hook export from the provider module. | Low |
| `hooks/useInfiniteEvents.ts` | 14 | `react-hooks/exhaustive-deps` | `UNSTABLE_REFERENCE` | Calculate the primitive request key directly instead of memoizing a rest object. | Low |
| `hooks/useReadingProgress.ts` | 162 | unused directive | `UNUSED_CODE` | Remove the obsolete directive. | Low |
| `hooks/useReadingProgress.ts` | 177 | `react-hooks/exhaustive-deps` | `HOOK_DEPENDENCY` | Remove the unrelated `sections` dependency from the stable reset callback. | Low |
| `pages/EventDetailPage.tsx` | 174 | `react-hooks/exhaustive-deps` | `HOOK_DEPENDENCY` | Include the stable `setInitialProgress` callback dependency. | Low |

## Behavior preservation

- AI quiz generation, local session/result handling, keyboard shortcuts and Goal
  16C responsive behavior were not changed.
- Server-authoritative THPT session, scoring, recovery queue and submission logic
  were not replaced with local state.
- Static fallback session loading now hides stale exam state when `examId` changes,
  while preserving localStorage restoration and cancellation after unmount.
- The legacy timer continues to avoid persistence on every tick. Its current value
  is copied only when normal progress persistence already occurs.
- No backend, AI Service, workflow or generated dataset source was changed.

## Tests and final result

- Added four characterization tests for initial static-session load, identity
  change, answer/flag/navigation restoration and cleanup after unmount.
- Encoding check passed.
- Full ESLint completed with 0 errors and 0 warnings.
- TypeScript project build passed.
- Vitest passed 69 files and 536 tests.
- Vite production build passed with only the existing large-chunk advisory.
- Dataset SHA-256 remained
  `5EE02A8A3CF983D1C2E462579032207221536B690E37D78F62D08F05B5C96D9D`.

There are no remaining ESLint warnings.
