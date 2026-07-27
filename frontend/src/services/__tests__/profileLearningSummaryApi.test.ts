import { describe, expect, it } from 'vitest';
import {
  parseProfileLearningSummaryV1,
  ProfileLearningSummaryApiError,
} from '../profileLearningSummaryApi';

const valid = {
  schemaVersion: 1,
  generatedAt: '2026-07-27T03:00:00Z',
  timezone: 'Asia/Ho_Chi_Minh',
  eventsViewed: 7,
  quizzesCompleted: 2,
  totalMinutes: 85,
  streakDays: 4,
};

describe('ProfileLearningSummary V1 contract', () => {
  it('accepts the exact privacy-safe contract', () => {
    expect(parseProfileLearningSummaryV1(valid)).toEqual(valid);
  });

  it.each([
    { ...valid, rankPercentile: 10 },
    { ...valid, schemaVersion: 2 },
    { ...valid, eventsViewed: -1 },
    { ...valid, totalMinutes: 1.5 },
    { ...valid, timezone: 'UTC' },
  ])('rejects unsupported or invalid payload %#', payload => {
    expect(() => parseProfileLearningSummaryV1(payload)).toThrow(ProfileLearningSummaryApiError);
  });
});
