/**
 * ragQuizApiContract.ts
 *
 * This file defines the expected API contract for the backend FastAPI/LangChain integration.
 * In MVP, the UI uses the mock 'quizService.ts' which simulates this behavior using local data.
 * When the real RAG application backend is ready, 'quizService.ts' will fetch from these endpoints.
 */

import type { QuizConfig, QuizSession, QuizResult, QuizAnswer } from '../types/quiz';

/**
 * 1. Generate Quiz
 * POST /api/quiz/generate
 * 
 * Request payload structure.
 */
export interface GenerateQuizRequest {
  config: QuizConfig;
  userId: string;
}

/**
 * Response payload structure for Generate Quiz.
 * The RAG backend retrieves context from document store, synthesizes questions, 
 * options, and explanations with citations (sourceRefs), then returns a session.
 */
export interface GenerateQuizResponse extends QuizSession {}

/**
 * 2. Get Quiz Session
 * GET /api/quiz/session/:sessionId
 * 
 * Response payload is QuizSession. Questions do not include the correct answer or explanation yet 
 * (handled server-side to prevent cheating in real app).
 * (Note: The MVP frontend relies on `QuizSession` containing all fields for simplicity.)
 */


/**
 * 3. Submit Quiz
 * POST /api/quiz/submit
 * 
 * Request payload structure.
 */
export interface SubmitQuizRequest {
  sessionId: string;
  answers: QuizAnswer[];
}

/**
 * Response payload structure for Submit Quiz.
 * Backend computes score and breakdown.
 */
export interface SubmitQuizResponse extends QuizResult {}

/**
 * 4. Get Quiz Result
 * GET /api/quiz/result/:sessionId
 * 
 * Returns the SubmitQuizResponse (QuizResult).
 */

/**
 * 5. Get Quiz History
 * GET /api/quiz/history?userId=:userId
 * 
 * Returns a list of the user's completed QuizResult summaries.
 */
export type GetQuizHistoryResponse = QuizResult[];
