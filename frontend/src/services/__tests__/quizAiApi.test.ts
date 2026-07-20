import { describe, expect, it } from 'vitest';
import { parsePracticeQuizResponse } from '../quizAiApi';

const source = { chunkId: 'c1', documentId: 'doc', grade: 12, lessonNumber: 6, lessonTitle: 'Cách mạng tháng Tám', sectionTitle: 'Kết quả', pageStart: 1, pageEnd: 2, chunkHash: 'a'.repeat(64) };
const question = { question: 'Q', options: [{ id: 'A', text: 'A' }, { id: 'B', text: 'B' }, { id: 'C', text: 'C' }, { id: 'D', text: 'D' }], correctOptionId: 'B', explanation: 'E', difficulty: 'MEDIUM', sourceChunkIds: ['c1'] };

describe('quizAiApi practice contract', () => {
  it('parses a response without a generation receipt', () => {
    const result = parsePracticeQuizResponse({ questions: [question], sources: [source], warnings: [], generation: { requestedCount: 3, generatedCount: 1, partial: true } });
    expect(result.generation.partial).toBe(true);
    expect(result.questions[0].sourceChunkIds).toEqual(['c1']);
  });

  it('rejects an ungrounded question', () => {
    expect(() => parsePracticeQuizResponse({ questions: [{ ...question, sourceChunkIds: ['missing'] }], sources: [source], warnings: [], generation: { requestedCount: 1, generatedCount: 1, partial: false } })).toThrow('Invalid practice quiz response');
  });
});
