import { describe, expect, it } from 'vitest';
import { EXAM_DURATION_SECONDS } from '../examConstants';
import { getExamDeadlineMs, getRemainingExamSeconds, normalizeSessionDurationSeconds } from '../examDuration';

describe('exam duration', () => {
  it('prefers a valid stored duration', () => expect(normalizeSessionDurationSeconds(900, 50)).toBe(900));
  it('uses exam duration when stored duration is invalid', () => expect(normalizeSessionDurationSeconds(-1, 50)).toBe(3000));
  it('uses fallback when both values are invalid', () => expect(normalizeSessionDurationSeconds(null, 0)).toBe(EXAM_DURATION_SECONDS));
  it('calculates the absolute deadline', () => expect(getExamDeadlineMs(1_000, 60)).toBe(61_000));
  it('never returns negative remaining time', () => {
    expect(getRemainingExamSeconds(61_000, 60_001)).toBe(1);
    expect(getRemainingExamSeconds(61_000, 70_000)).toBe(0);
  });
});
