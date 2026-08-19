import { describe, expect, it } from 'vitest';
import {
  dashboardAiPracticeRoute,
  dashboardTopicRoute,
  selectRecommendationCandidate,
  type RecommendationCandidate,
} from '../dashboardRecommendation';

function candidate(
  key: string,
  overrides: Partial<RecommendationCandidate> = {},
): RecommendationCandidate {
  return {
    key,
    label: key,
    accuracy: 80,
    correctUnits: 8,
    totalUnits: 10,
    attemptCount: 3,
    confidence: 'medium',
    status: 'strength',
    ...overrides,
  };
}

describe('shared dashboard recommendation policy', () => {
  it('prioritizes weakness over every other tier', () => {
    const result = selectRecommendationCandidate([
      candidate('developing', { status: 'developing', accuracy: 60 }),
      candidate('insufficient', { status: 'insufficient-data', totalUnits: 20 }),
      candidate('weakness', { status: 'weakness', accuracy: 55 }),
    ]);
    expect(result).toMatchObject({ tier: 'weakness', candidate: { key: 'weakness' } });
  });

  it('uses developing when there is no weakness', () => {
    const result = selectRecommendationCandidate([
      candidate('strong'),
      candidate('developing', { status: 'developing', accuracy: 70 }),
    ]);
    expect(result).toMatchObject({ tier: 'developing', candidate: { key: 'developing' } });
  });

  it('uses the insufficient-data tier before the strength fallback', () => {
    const result = selectRecommendationCandidate([
      candidate('strong'),
      candidate('insufficient', { status: 'insufficient-data', totalUnits: 4 }),
    ]);
    expect(result).toMatchObject({ tier: 'insufficient-data', candidate: { key: 'insufficient' } });
  });

  it('falls back to the lowest-confidence candidate when all topics are strengths', () => {
    const result = selectRecommendationCandidate([
      candidate('high', { confidence: 'high' }),
      candidate('low', { confidence: 'low' }),
    ]);
    expect(result).toMatchObject({ tier: 'lowest-confidence', candidate: { key: 'low' } });
  });

  it('breaks weakness ties by lower accuracy first', () => {
    const result = selectRecommendationCandidate([
      candidate('less-severe', { status: 'weakness', accuracy: 55 }),
      candidate('more-severe', { status: 'weakness', accuracy: 40 }),
    ]);
    expect(result?.candidate.key).toBe('more-severe');
  });

  it('breaks equal-accuracy severity ties by greater evidence volume', () => {
    const result = selectRecommendationCandidate([
      candidate('smaller', { status: 'weakness', accuracy: 50, totalUnits: 8 }),
      candidate('larger', { status: 'weakness', accuracy: 50, totalUnits: 20 }),
    ]);
    expect(result?.candidate.key).toBe('larger');
  });

  it('selects the most evidenced insufficient-data topic', () => {
    const result = selectRecommendationCandidate([
      candidate('small', { status: 'insufficient-data', totalUnits: 2 }),
      candidate('large', { status: 'insufficient-data', totalUnits: 7 }),
    ]);
    expect(result?.candidate.key).toBe('large');
  });

  it('uses the stable key as the final deterministic tie-break', () => {
    const result = selectRecommendationCandidate([
      candidate('z-topic', { status: 'weakness', accuracy: 50 }),
      candidate('a-topic', { status: 'weakness', accuracy: 50 }),
    ]);
    expect(result?.candidate.key).toBe('a-topic');
  });

  it('returns null for an empty candidate set', () => {
    expect(selectRecommendationCandidate([])).toBeNull();
  });

  it('encodes topic keys in action routes', () => {
    expect(dashboardTopicRoute('viet nam/1945')).toBe('/exams/on-chu-de/viet%20nam%2F1945');
  });

  it('encodes the human-readable topic label in the AI practice query', () => {
    const route = dashboardAiPracticeRoute('Cách mạng tháng Tám');
    expect(new URL(route, 'http://localhost').searchParams.get('q')).toBe('Cách mạng tháng Tám');
    expect(route).toContain('C%C3%A1ch+m%E1%BA%A1ng+th%C3%A1ng+T%C3%A1m');
    expect(route).not.toContain('august-revolution');
  });
});
