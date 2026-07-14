import { describe, expect, it } from 'vitest';
import { legacyExamSessionPath } from '../legacyExamRedirect';

describe('legacy exam session redirect', () => {
  it('preserves the real exam id in the V2 route', () => {
    expect(legacyExamSessionPath('exam-real-id')).toBe('/exams/de/exam-real-id');
  });

  it('falls back to browse when the id is missing', () => {
    expect(legacyExamSessionPath()).toBe('/exams/browse');
  });
});
