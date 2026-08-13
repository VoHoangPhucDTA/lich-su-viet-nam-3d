import { describe, expect, it } from 'vitest';
import { derivePracticeTimeLimitMinutes, resolveQuestionCount } from '../practiceConfig';

describe('practiceConfig', () => {
  it('maps preset count modes to their integer counts', () => {
    expect(resolveQuestionCount('1')).toBe(1);
    expect(resolveQuestionCount('3')).toBe(3);
    expect(resolveQuestionCount('5')).toBe(5);
  });

  it('returns null for unknown preset modes', () => {
    expect(resolveQuestionCount('7' as unknown as '1')).toBeNull();
    expect(resolveQuestionCount('0' as unknown as '1')).toBeNull();
    expect(resolveQuestionCount('11' as unknown as '1')).toBeNull();
  });

  it('derives a 5-minute timer for 1 and 3 questions', () => {
    expect(derivePracticeTimeLimitMinutes(1)).toBe(5);
    expect(derivePracticeTimeLimitMinutes(3)).toBe(5);
  });

  it('derives a 10-minute timer for 5 questions', () => {
    expect(derivePracticeTimeLimitMinutes(5)).toBe(10);
  });

  it('keeps the upper-tier mapping for hypothetical larger counts', () => {
    expect(derivePracticeTimeLimitMinutes(6)).toBe(10);
    expect(derivePracticeTimeLimitMinutes(10)).toBe(15);
  });
});
