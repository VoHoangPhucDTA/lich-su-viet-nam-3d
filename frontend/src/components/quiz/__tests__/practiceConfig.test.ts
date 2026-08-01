import { describe, expect, it } from 'vitest';
import { derivePracticeTimeLimitMinutes, resolveQuestionCount } from '../practiceConfig';

describe('practice quiz configuration', () => {
  it('derives the bounded self-practice time limit from question count', () => {
    expect([1, 2, 3].map(derivePracticeTimeLimitMinutes)).toEqual([5, 5, 5]);
    expect([4, 5, 6].map(derivePracticeTimeLimitMinutes)).toEqual([10, 10, 10]);
    expect([7, 8, 9, 10].map(derivePracticeTimeLimitMinutes)).toEqual([15, 15, 15, 15]);
  });

  it('maps presets and accepts only integer custom counts from 1 to 10', () => {
    expect(resolveQuestionCount('3', '')).toBe(3);
    expect(resolveQuestionCount('custom', '7')).toBe(7);
    expect(resolveQuestionCount('custom', '0')).toBeNull();
    expect(resolveQuestionCount('custom', '2.5')).toBeNull();
    expect(resolveQuestionCount('custom', '11')).toBeNull();
    expect(resolveQuestionCount('custom', '')).toBeNull();
  });
});
