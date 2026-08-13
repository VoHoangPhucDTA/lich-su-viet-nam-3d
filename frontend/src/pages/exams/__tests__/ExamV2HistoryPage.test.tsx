import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExamResultV2 } from '@/types/exam';
import ExamV2HistoryPage from '../ExamV2HistoryPage';

const mocks = vi.hoisted(() => ({
  items: [] as ExamResultV2[],
}));

function buildResult(overrides: Partial<ExamResultV2>): ExamResultV2 {
  return {
    sessionId: 'session-default',
    examId: 'exam-default',
    mode: 'thi_thu',
    title: 'Đề mặc định',
    totalScore: 0,
    mcqScore: 0,
    tfScore: 0,
    totalQuestions: 28,
    correctMCQ: 0,
    wrongMCQ: 0,
    blankMCQ: 0,
    tfBreakdown: [0, 0, 0, 0, 0],
    durationSeconds: 60,
    submittedAt: Date.now(),
    scoreAuthority: 'BACKEND',
    timingAuthority: 'SERVER',
    submissionOrigin: 'SERVER_ON_TIME',
    questions: [],
    ...overrides,
  };
}

const officialOne: ExamResultV2 = buildResult({
  sessionId: 'official-1',
  examId: 'exam-official-1',
  title: 'Đề chính thức lần 1',
  totalScore: 8,
  totalQuestions: 28,
  submittedAt: 1_700_000_000_000,
});

const officialTwo: ExamResultV2 = buildResult({
  sessionId: 'official-2',
  examId: 'exam-official-2',
  title: 'Đề chính thức lần 2',
  totalScore: 6,
  totalQuestions: 28,
  submittedAt: 1_700_000_500_000,
});

const localRecovered: ExamResultV2 = buildResult({
  sessionId: 'recovered-local-1',
  examId: 'exam-local-1',
  mode: 'thi_thu',
  title: 'Đề phục hồi cục bộ',
  totalScore: 4.5,
  totalQuestions: 28,
  scoreAuthority: 'BACKEND',
  timingAuthority: 'CLIENT_UNVERIFIED',
  submissionOrigin: 'CLIENT_FALLBACK',
  submittedAt: 1_700_001_000_000,
});

const recoveredOnly: ExamResultV2 = buildResult({
  sessionId: 'recover_history_only',
  examId: 'exam-history-only',
  mode: 'thi_thu',
  title: 'Đề phục hồi duy nhất',
  totalScore: 4.5,
  totalQuestions: 28,
  scoreAuthority: 'BACKEND',
  timingAuthority: 'CLIENT_UNVERIFIED',
  submissionOrigin: 'CLIENT_FALLBACK',
  submittedAt: 1_700_002_000_000,
});

vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

vi.mock('@/lib/exam/examAttemptSync', () => ({
  fetchBackendAttemptHistory: vi.fn(async () => ({ items: mocks.items })),
  resultSummaryFromAttempt: vi.fn((attempt: ExamResultV2) => attempt),
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

beforeEach(() => {
  mocks.items = [];
});

function renderPage() {
  return render(
    <MemoryRouter>
      <ExamV2HistoryPage />
    </MemoryRouter>,
  );
}

describe('ExamV2HistoryPage cleanup', () => {
  it('drops the description helper paragraph and the per-attempt status pill', async () => {
    mocks.items = [recoveredOnly];
    renderPage();

    expect(await screen.findByRole('heading', { name: /đề phục hồi duy nhất/i })).toBeInTheDocument();
    expect(screen.queryByText(/Theo dõi các bài thi thử bạn đã hoàn thành/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Kết quả chính thức đúng hạn/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Được hệ thống chấm lại từ phiên cục bộ/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Kết quả cục bộ/)).not.toBeInTheDocument();
    expect(screen.queryByText('Trạng thái')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xem lại bài làm' })).toHaveAttribute(
      'href',
      '/exams/ket-qua/recover_history_only',
    );
    expect(screen.queryByText('Bài đúng hạn')).not.toBeInTheDocument();
  });

  it('counts the completed KPI as actual completed attempts (2 official + 1 local = 3)', async () => {
    mocks.items = [officialOne, officialTwo, localRecovered];
    renderPage();

    const completed = await screen.findByText('Số đề đã làm');
    expect(completed).toBeInTheDocument();
    const completedValue = completed.parentElement?.querySelector('div');
    expect(completedValue?.textContent).toBe('3');

    expect(screen.queryByText('Bài đúng hạn')).not.toBeInTheDocument();
    expect(screen.getByText(/Điểm cao nhất/)).toBeInTheDocument();
    expect(screen.getByText(/Điểm trung bình/)).toBeInTheDocument();
    const avg = (officialOne.totalScore + officialTwo.totalScore) / 2;
    expect(Number((avg).toFixed(1))).toBe(7);
  });

  it('only shows the count KPI when there are no official timed results', async () => {
    mocks.items = [recoveredOnly];
    renderPage();

    const completed = await screen.findByText('Số đề đã làm');
    expect(completed).toBeInTheDocument();
    const completedValue = completed.parentElement?.querySelector('div');
    expect(completedValue?.textContent).toBe('1');
    expect(screen.queryByText('Điểm cao nhất')).not.toBeInTheDocument();
    expect(screen.queryByText('Điểm trung bình')).not.toBeInTheDocument();
  });
});
