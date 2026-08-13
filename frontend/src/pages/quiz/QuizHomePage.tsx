/**
 * /quiz canonical entry point. Re-renders the generate form so users land
 * directly on the create flow without an intermediate landing step. The
 * Historical QuizHomePage landing-page behaviour (progress / latest /
 * history link) is intentionally removed. The /quiz/generate route is kept
 * as a redirect to /quiz for backward compatibility (see App.tsx).
 */
export { default } from './QuizGeneratePage';
