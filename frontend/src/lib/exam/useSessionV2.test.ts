import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExamFile, SessionState } from '@/types/exam';
import { loadExam } from './examLoader';
import { useSessionV2 } from './useSessionV2';

vi.mock('./examLoader', () => ({
  loadExam: vi.fn(),
}));

const loadExamMock = vi.mocked(loadExam);

function makeExam(examId: string): ExamFile {
  return {
    examId,
    title: `Đề ${examId}`,
    year: 2025,
    source: 'fixture',
    sourceDetail: 'Characterization fixture',
    examCode: examId,
    format: 'thpt_2025',
    timeLimitMinutes: 50,
    totalScore: 10,
    parsedAt: '2026-07-30T00:00:00.000Z',
    warnings: null,
    sections: [
      {
        sectionId: 'mcq',
        sectionType: 'mcq',
        title: 'Trắc nghiệm',
        totalQuestions: 1,
        maxScore: 10,
        scorePerQuestion: 10,
        questions: [
          {
            id: `${examId}-q1`,
            orderInExam: 1,
            questionType: 'mcq',
            questionText: 'Câu hỏi kiểm thử',
            options: [
              { id: 'A', text: 'A' },
              { id: 'B', text: 'B' },
              { id: 'C', text: 'C' },
              { id: 'D', text: 'D' },
            ],
            correctOptionId: 'A',
            explanation: 'Giải thích',
            difficulty: 'medium',
            topic: 'Chủ đề',
            cognitiveLevel: 'comprehension',
            hasImage: false,
            sourceRefs: [],
          },
        ],
      },
    ],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

beforeEach(() => {
  localStorage.clear();
  loadExamMock.mockReset();
});

describe('useSessionV2 identity and persistence', () => {
  it('loads an initial exam and creates one persisted session', async () => {
    loadExamMock.mockResolvedValue(makeExam('exam-a'));

    const { result } = renderHook(() => useSessionV2('exam-a'));

    expect(result.current.loading).toBe(true);
    expect(result.current.exam).toBeNull();

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.exam?.examId).toBe('exam-a');
    expect(result.current.session?.examId).toBe('exam-a');
    expect(result.current.flatQuestions).toHaveLength(1);
    expect(loadExamMock).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('v2_session_exam-a')).not.toBeNull();
  });

  it('hides stale state and ignores an older request after exam identity changes', async () => {
    const first = deferred<ExamFile>();
    const second = deferred<ExamFile>();
    loadExamMock.mockImplementation((examId) =>
      examId === 'exam-a' ? first.promise : second.promise,
    );

    const { result, rerender } = renderHook(
      ({ examId }: { examId: string }) => useSessionV2(examId),
      { initialProps: { examId: 'exam-a' } },
    );

    rerender({ examId: 'exam-b' });
    expect(result.current.loading).toBe(true);
    expect(result.current.exam).toBeNull();
    expect(result.current.session).toBeNull();

    await act(async () => {
      second.resolve(makeExam('exam-b'));
      await second.promise;
    });
    await waitFor(() => expect(result.current.exam?.examId).toBe('exam-b'));

    await act(async () => {
      first.resolve(makeExam('exam-a'));
      await first.promise;
    });

    expect(result.current.exam?.examId).toBe('exam-b');
    expect(result.current.session?.examId).toBe('exam-b');
    expect(localStorage.getItem('v2_session_exam-a')).toBeNull();
  });

  it('restores answers, flags and navigation from an in-progress session', async () => {
    const restored: SessionState = {
      sessionId: 'restored-session',
      mode: 'thi_thu',
      examId: 'exam-a',
      questionsRef: ['exam-a-q1'],
      answers: {
        'exam-a-q1': {
          questionId: 'exam-a-q1',
          questionType: 'mcq',
          selected: 'B',
        },
      },
      flagged: ['exam-a-q1'],
      startedAt: 1_700_000_000_000,
      durationSeconds: 3_000,
      status: 'in_progress',
      currentIndex: 0,
    };
    localStorage.setItem('v2_session_exam-a', JSON.stringify(restored));
    loadExamMock.mockResolvedValue(makeExam('exam-a'));

    const { result } = renderHook(() => useSessionV2('exam-a'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.session?.sessionId).toBe('restored-session');
    expect(result.current.getMCQAnswer('exam-a-q1')?.selected).toBe('B');
    expect(result.current.questionStates['exam-a-q1']?.isFlagged).toBe(true);
    expect(result.current.currentIndex).toBe(0);
  });

  it('does not persist or publish a late load after unmount', async () => {
    const pending = deferred<ExamFile>();
    loadExamMock.mockReturnValue(pending.promise);

    const { unmount } = renderHook(() => useSessionV2('exam-a'));
    unmount();

    await act(async () => {
      pending.resolve(makeExam('exam-a'));
      await pending.promise;
    });

    expect(localStorage.getItem('v2_session_exam-a')).toBeNull();
  });
});
