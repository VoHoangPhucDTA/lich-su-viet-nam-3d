import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generateAiQuiz } = vi.hoisted(() => ({ generateAiQuiz: vi.fn() }));
vi.mock('@/services/aiQuizApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/aiQuizApi')>();
  return { ...actual, generateAiQuiz };
});

import AiQuizPage from '../AiQuizPage';

const response = {
  questions: [{
    question: 'Câu hỏi lịch sử?',
    options: [{ id: 'A', text: 'Đáp án đúng' }, { id: 'B', text: 'Đáp án B' }, { id: 'C', text: 'Đáp án C' }, { id: 'D', text: 'Đáp án D' }],
    correctOptionId: 'A', explanation: 'Giải thích từ tài liệu.', difficulty: 'MEDIUM', sourceChunkIds: ['chunk-1'],
  }],
  sources: [{ chunkId: 'chunk-1', documentId: 'doc', grade: 12, lessonNumber: 6, lessonTitle: 'Tên bài', sectionTitle: 'Mục I', pageStart: 35, pageEnd: null }],
  warnings: ['MANUAL_REVIEW_RECOMMENDED'], generation: { requestedCount: 1, generatedCount: 1, partial: false },
} as const;

function renderPage() {
  return render(<BrowserRouter><AiQuizPage /></BrowserRouter>);
}

async function generate(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^Chủ đề hoặc yêu cầu/), 'Cách mạng tháng Tám');
  await user.clear(screen.getByLabelText(/^Số câu/));
  await user.type(screen.getByLabelText(/^Số câu/), '1');
  await user.click(screen.getByRole('button', { name: 'Tạo bài luyện tập' }));
  await screen.findByText('Câu hỏi lịch sử?');
}

describe('AiQuizPage', () => {
  beforeEach(() => {
    generateAiQuiz.mockReset();
    generateAiQuiz.mockResolvedValue(response);
  });

  it('validates required query and does not send a request', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Tạo bài luyện tập' }));
    expect(screen.getByText('Hãy nhập chủ đề hoặc yêu cầu.')).toBeInTheDocument();
    expect(generateAiQuiz).not.toHaveBeenCalled();
  });

  it('generates, answers, submits, scores and reveals explanation and sources', async () => {
    const user = userEvent.setup();
    renderPage();
    await generate(user);
    expect(generateAiQuiz).toHaveBeenCalledWith(expect.objectContaining({ grade: 12, difficulty: 'MEDIUM', count: 1 }), expect.any(AbortSignal));
    expect(screen.queryByText('Tên bài')).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /Đáp án A/ }));
    await user.click(screen.getByRole('button', { name: 'Nộp bài' }));
    expect(screen.getByText('1/1 câu đúng')).toBeInTheDocument();
    expect(screen.getByText('Giải thích từ tài liệu.')).toBeInTheDocument();
    await user.click(screen.getByText('Nguồn tham khảo (1)'));
    expect(screen.getByText('Tên bài')).toBeInTheDocument();
    expect(screen.getByText('Trang 35')).toBeInTheDocument();
    expect(screen.queryByText(/MANUAL_REVIEW/)).not.toBeInTheDocument();
    expect(screen.queryByText(/câu hỏi sai/i)).not.toBeInTheDocument();
  });

  it('restarts locally but creates a new set through a new request', async () => {
    const user = userEvent.setup();
    renderPage();
    await generate(user);
    await user.click(screen.getByRole('button', { name: 'Nộp bài' }));
    await user.click(screen.getByRole('button', { name: 'Làm lại bộ câu hỏi này' }));
    expect(generateAiQuiz).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Nộp bài' }));
    await user.click(screen.getByRole('button', { name: 'Tạo bộ câu hỏi mới' }));
    await waitFor(() => expect(generateAiQuiz).toHaveBeenCalledTimes(2));
  });

  it('shows a partial result without automatically retrying', async () => {
    generateAiQuiz.mockResolvedValue({ ...response, generation: { requestedCount: 5, generatedCount: 1, partial: true } });
    const user = userEvent.setup();
    renderPage();
    await generate(user);
    expect(screen.getByText('Hệ thống đã tạo được 1/5 câu phù hợp với nguồn tài liệu.')).toBeInTheDocument();
    expect(generateAiQuiz).toHaveBeenCalledTimes(1);
  });

  it('blocks double submit while generation is pending', async () => {
    generateAiQuiz.mockReturnValue(new Promise(() => undefined));
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(/^Chủ đề hoặc yêu cầu/), 'Một chủ đề');
    const button = screen.getByRole('button', { name: 'Tạo bài luyện tập' });
    await user.dblClick(button);
    expect(generateAiQuiz).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('Đang tìm nội dung phù hợp');
  });
});
