import { apiPost } from './apiClient';

export interface PracticeQuizCompletionInput {
  clientSessionId: string;
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard' | 'mixed';
  totalQuestions: number;
  durationMs: number;
}

interface PracticeQuizCompletionResponse {
  schemaVersion: 1;
  attemptId: string;
  status: 'recorded';
}

export async function recordPracticeQuizCompletion(
  input: PracticeQuizCompletionInput,
): Promise<void> {
  await apiPost<PracticeQuizCompletionResponse>('/api/quiz/attempts', input);
}
