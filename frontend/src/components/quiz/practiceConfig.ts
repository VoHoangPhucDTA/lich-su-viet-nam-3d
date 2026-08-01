export type CountMode = '3' | '5' | '10' | 'custom';

export function derivePracticeTimeLimitMinutes(questionCount: number): number {
  if (questionCount <= 3) return 5;
  if (questionCount <= 6) return 10;
  return 15;
}

export function resolveQuestionCount(mode: CountMode, customCount: string): number | null {
  const count = mode === 'custom' ? Number(customCount) : Number(mode);
  return Number.isInteger(count) && count >= 1 && count <= 10 ? count : null;
}
