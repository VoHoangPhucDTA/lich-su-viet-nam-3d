import { describe, expect, it } from 'vitest';
import { deriveQuestionState } from '../questionState';
import type { AnswerEntry, MCQQuestion, TFQuestion } from '@/types/exam';

const base = { orderInExam: 1, questionText: 'Question', explanation: '', difficulty: 'easy' as const, topic: 'Topic', cognitiveLevel: 'knowledge' as const, hasImage: false, sourceRefs: [] };
const mcq: MCQQuestion = { ...base, id: 'm1', questionType: 'mcq', options: ['A', 'B', 'C', 'D'].map((id) => ({ id: id as 'A' | 'B' | 'C' | 'D', text: id })), correctOptionId: 'A' };
const tf: TFQuestion = { ...base, id: 't1', questionType: 'true_false', statements: ['a', 'b', 'c', 'd'].map((id) => ({ id: id as 'a' | 'b' | 'c' | 'd', text: id, isTrue: true })) };
const tfAnswer = (...values: Array<boolean | null>): AnswerEntry => ({ questionId: 't1', questionType: 'true_false', selected: { a: values[0] ?? null, b: values[1] ?? null, c: values[2] ?? null, d: values[3] ?? null } });

describe('deriveQuestionState', () => {
  it.each([
    ['untouched', undefined, false, false, [false, false, 0, 1, false, false]],
    ['answered', { questionId: 'm1', questionType: 'mcq', selected: 'A' } as AnswerEntry, false, false, [true, true, 1, 1, false, false]],
    ['answered flagged', { questionId: 'm1', questionType: 'mcq', selected: 'B' } as AnswerEntry, true, false, [true, true, 1, 1, true, false]],
    ['current answered flagged', { questionId: 'm1', questionType: 'mcq', selected: 'C' } as AnswerEntry, true, true, [true, true, 1, 1, true, true]],
  ])('derives MCQ %s', (_name, answer, flagged, current, expected) => {
    expect(Object.values(deriveQuestionState(mcq, answer, flagged, current))).toEqual(expected);
  });

  it.each([
    ['0/4', tfAnswer(), false, false, [false, false, 0, 4, false, false]],
    ['1/4', tfAnswer(true), false, false, [true, false, 1, 4, false, false]],
    ['3/4', tfAnswer(true, false, true), false, false, [true, false, 3, 4, false, false]],
    ['4/4', tfAnswer(true, false, true, false), false, false, [true, true, 4, 4, false, false]],
    ['partial flagged current', tfAnswer(true, false), true, true, [true, false, 2, 4, true, true]],
  ])('derives T/F %s', (_name, answer, flagged, current, expected) => {
    expect(Object.values(deriveQuestionState(tf, answer, flagged, current))).toEqual(expected);
  });
});
