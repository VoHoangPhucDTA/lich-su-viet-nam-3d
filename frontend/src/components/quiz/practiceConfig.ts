export type CountMode = '1' | '3' | '5';

const PRESET_COUNT: Record<CountMode, number> = { '1': 1, '3': 3, '5': 5 };

export function derivePracticeTimeLimitMinutes(questionCount: number): number {
  if (questionCount <= 3) return 5;
  if (questionCount <= 6) return 10;
  return 15;
}

export function resolveQuestionCount(mode: CountMode): number | null {
  return PRESET_COUNT[mode] ?? null;
}
