import { describe, expect, it } from 'vitest';
import { adaptAiQuizResponse, formatAiQuizSource } from '../aiQuizAdapter';
import type { AiGeneratedQuizResponse } from '@/types/aiQuiz';

const response: AiGeneratedQuizResponse = {
  questions: [{
    question: 'Câu hỏi?', options: [{ id: 'A', text: 'A' }, { id: 'B', text: 'B' }, { id: 'C', text: 'C' }, { id: 'D', text: 'D' }],
    correctOptionId: 'C', explanation: 'Giải thích', difficulty: 'HARD', sourceChunkIds: ['s1', 's2'],
  }],
  sources: [
    { chunkId: 's1', documentId: 'doc', grade: 12, lessonNumber: 6, lessonTitle: 'Tên bài', sectionTitle: 'Mục I', pageStart: 35, pageEnd: 36, chunkHash: null },
    { chunkId: 's2', documentId: null, grade: null, lessonNumber: null, lessonTitle: null, sectionTitle: null, pageStart: null, pageEnd: null, chunkHash: null },
  ],
  warnings: ['MANUAL_REVIEW_RECOMMENDED'], generation: { requestedCount: 5, generatedCount: 1, partial: true },
  generationReceipt: { id: 'receipt-1', expiresAt: '2026-07-20T14:00:00' },
};

describe('AI quiz response adapter', () => {
  it('maps A-D and the correct answer into the reusable MCQ model', () => {
    const view = adaptAiQuizResponse(response, 'Chủ đề', 12);
    expect(view.questions[0]).toMatchObject({ questionType: 'mcq', correctOptionId: 'C', difficulty: 'hard' });
    expect(view.questions[0]?.options.map((option) => option.id)).toEqual(['A', 'B', 'C', 'D']);
    expect(view.questions[0]?.id).toMatch(/^ai-1-[a-z0-9]+$/);
    expect(view.questions[0]?.id).not.toBe('s1');
  });

  it('preserves source mapping, partial metadata and neutral review advisory', () => {
    const view = adaptAiQuizResponse(response, 'Chủ đề', 12);
    expect(view.sourcesByQuestionId[view.questions[0]!.id]?.map((source) => source.chunkId)).toEqual(['s1', 's2']);
    expect(view.generation.partial).toBe(true);
    expect(view.hasReviewAdvisory).toBe(true);
  });

  it('formats page ranges and safely falls back when nullable metadata is absent', () => {
    expect(formatAiQuizSource(response.sources[0]!, 12)).toEqual(['Lớp 12', 'Bài 6', 'Tên bài', 'Mục I', 'Trang 35–36']);
    expect(formatAiQuizSource(response.sources[1]!, 11)).toEqual(['Lớp 11']);
  });

  it('deduplicates repeated display labels', () => {
    expect(formatAiQuizSource({ ...response.sources[0]!, lessonTitle: 'Bài 6', sectionTitle: 'Bài 6' }, 12)).toEqual(['Lớp 12', 'Bài 6', 'Trang 35–36']);
  });
});
