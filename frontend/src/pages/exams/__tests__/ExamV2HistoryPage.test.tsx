import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ExamResultV2 } from '@/types/exam';
import ExamV2HistoryPage from '../ExamV2HistoryPage';

const recoveryResult: ExamResultV2 = {
  sessionId: 'recover_history_only',
  examId: 'exam-history-only',
  mode: 'thi_thu',
  title: 'Đề phục hồi duy nhất',
  totalScore: 4.5,
  mcqScore: 0,
  tfScore: 0,
  totalQuestions: 28,
  correctMCQ: 0,
  wrongMCQ: 0,
  blankMCQ: 0,
  tfBreakdown: [0, 0, 0, 0, 0],
  durationSeconds: 90,
  submittedAt: Date.now(),
  scoreAuthority: 'BACKEND',
  timingAuthority: 'CLIENT_UNVERIFIED',
  submissionOrigin: 'CLIENT_FALLBACK',
  questions: [],
};

vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

vi.mock('@/lib/exam/examAttemptSync', () => ({
  fetchBackendAttemptHistory: vi.fn(async () => ({ items: [{}] })),
  resultSummaryFromAttempt: vi.fn(() => recoveryResult),
}));

vi.mock('@/lib/exam/examRecoveryQueue', () => ({
  flushRecoveryQueue: vi.fn(async () => ({ recovered: 0, pending: 0 })),
}));

vi.mock('@/lib/exam/manifestLoader', () => ({
  loadManifest: vi.fn(async () => []),
}));

vi.mock('@/lib/exam/v2History', () => ({
  clearAllV2Results: vi.fn(),
  getAllV2Results: vi.fn(() => []),
}));

describe('ExamV2HistoryPage authority rendering', () => {
  it('shows recovery attempts even when there are no server-timed statistics', async () => {
    render(
      <MemoryRouter>
        <ExamV2HistoryPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: /đề phục hồi duy nhất/i })).toBeInTheDocument();
    expect(screen.getByText('Được hệ thống chấm lại từ phiên cục bộ')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xem lại bài làm' })).toHaveAttribute(
      'href',
      '/exams/ket-qua/recover_history_only',
    );
    expect(screen.queryByText('Bài đúng hạn')).not.toBeInTheDocument();
  });
});
