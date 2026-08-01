import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import QuizGeneratePage from '../QuizGeneratePage';

const mocks = vi.hoisted(() => ({
  generateQuiz: vi.fn(),
}));

vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ currentUser: { id: 'user-1' } }),
}));

vi.mock('@/services/quizService', () => ({
  generateQuiz: mocks.generateQuiz,
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/quiz/generate']}>
      <Routes>
        <Route path="/quiz/generate" element={<QuizGeneratePage />} />
        <Route path="/quiz" element={<p>Trang trắc nghiệm</p>} />
        <Route path="/quiz/session/:sessionId" element={<p>Phiên làm bài đã tạo</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('QuizGeneratePage', () => {
  beforeEach(() => {
    mocks.generateQuiz.mockReset();
  });

  it('uses a clear, deterministic back action to the quiz home', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Về trang trắc nghiệm' }));
    expect(screen.getByText('Trang trắc nghiệm')).toBeInTheDocument();
  });

  it('fills the single query from a preset and clears preset selection when edited', async () => {
    renderPage();
    const user = userEvent.setup();
    const preset = screen.getByLabelText('Gợi ý chủ đề');
    const query = screen.getByLabelText('Bạn muốn ôn tập nội dung gì?');
    await user.selectOptions(preset, 'august-revolution-1945');
    expect(query).toHaveValue('Cách mạng tháng Tám năm 1945');
    fireEvent.change(query, { target: { value: '  Cách mạng tháng Tám năm 1945  ' } });
    expect(preset).toHaveValue('august-revolution-1945');
    await user.type(query, ' và ý nghĩa');
    expect(preset).toHaveValue('');
  });

  it('replaces the query when another preset is selected and disables submit after clearing', async () => {
    renderPage();
    const user = userEvent.setup();
    const preset = screen.getByLabelText('Gợi ý chủ đề');
    const query = screen.getByLabelText('Bạn muốn ôn tập nội dung gì?');
    await user.selectOptions(preset, 'asean');
    expect(query).toHaveValue('ASEAN và quan hệ quốc tế');
    await user.selectOptions(preset, 'dai-viet-civilization');
    expect(query).toHaveValue('Văn minh Đại Việt');
    await user.clear(query);
    expect(preset).toHaveValue('');
    expect(screen.getByRole('button', { name: /tạo 5 câu hỏi/i })).toBeDisabled();
  });

  it('explains disabled state and rejects long query and invalid custom count', async () => {
    renderPage();
    const create = screen.getByRole('button', { name: /tạo 5 câu hỏi/i });
    expect(create).toBeDisabled();
    expect(create).toHaveAttribute('aria-describedby', 'quiz-generate-disabled-reason');
    fireEvent.click(create);
    expect(mocks.generateQuiz).not.toHaveBeenCalled();

    const query = screen.getByLabelText('Bạn muốn ôn tập nội dung gì?');
    fireEvent.change(query, { target: { value: 'a'.repeat(1001) } });
    expect(screen.getByText('Chủ đề hoặc yêu cầu không được vượt quá 1.000 ký tự.')).toBeInTheDocument();

    fireEvent.change(query, { target: { value: 'Cách mạng tháng Tám' } });
    await userEvent.click(screen.getByLabelText('Khác'));
    fireEvent.change(screen.getByLabelText('Nhập số câu (1–10)'), { target: { value: '11' } });
    expect(screen.getByText('Số câu phải là số nguyên từ 1 đến 10.')).toBeInTheDocument();
  });

  it('renders difficulty and count as separate responsive fieldsets', () => {
    const { container } = renderPage();
    const difficulty = screen.getByRole('group', { name: 'Độ khó' });
    const count = screen.getByRole('group', { name: 'Số câu' });
    expect(difficulty).not.toBe(count);
    expect(container.querySelector('.quiz-config-grid')).toContainElement(difficulty);
    expect(container.querySelector('.quiz-config-grid')).toContainElement(count);
    expect(screen.getByText('Tối đa 10 câu cho mỗi bài tự luyện.')).toBeInTheDocument();
  });

  it('uses configuration and AI-generation icons for their matching actions', () => {
    const { container } = renderPage();
    expect(container.querySelector('[data-quiz-icon="setup"]')).toBeInTheDocument();
    expect(container.querySelector('[data-quiz-icon="generate"]')).toBeInTheDocument();
  });

  it('submits once with trimmed query and derived time then navigates on success', async () => {
    mocks.generateQuiz.mockResolvedValue({ sessionId: 'session-1' });
    renderPage();
    fireEvent.change(screen.getByLabelText('Bạn muốn ôn tập nội dung gì?'), { target: { value: '  ASEAN  ' } });
    const create = screen.getByRole('button', { name: /tạo 5 câu hỏi/i });
    fireEvent.click(create);
    fireEvent.click(create);

    await waitFor(() => expect(mocks.generateQuiz).toHaveBeenCalledOnce());
    expect(mocks.generateQuiz.mock.calls[0][0]).toEqual({
      query: 'ASEAN',
      difficulty: 'medium',
      questionCount: 5,
      timeLimitMinutes: 10,
    });
    expect(await screen.findByText('Phiên làm bài đã tạo')).toBeInTheDocument();
  });

  it('stops waiting without an error and keeps the form content', async () => {
    let receivedSignal: AbortSignal | undefined;
    mocks.generateQuiz.mockImplementation((...args: unknown[]) => {
      receivedSignal = args[2] as AbortSignal | undefined;
      return new Promise((_resolve, reject) => {
        receivedSignal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    });
    renderPage();
    const query = screen.getByLabelText('Bạn muốn ôn tập nội dung gì?');
    fireEvent.change(query, { target: { value: 'Điện Biên Phủ' } });
    fireEvent.click(screen.getByRole('button', { name: /tạo 5 câu hỏi/i }));
    expect(receivedSignal).toBeInstanceOf(AbortSignal);
    fireEvent.click(await screen.findByRole('button', { name: 'Dừng chờ' }));
    expect(receivedSignal?.aborted).toBe(true);

    await waitFor(() => expect(screen.queryByRole('dialog', { name: /đang tạo 5 câu hỏi/i })).not.toBeInTheDocument());
    expect(query).toHaveValue('Điện Biên Phủ');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
