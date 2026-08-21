import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

function renderPage(initialEntries = ['/quiz/generate']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/quiz/generate" element={<QuizGeneratePage />} />
        <Route path="/quiz" element={<QuizGeneratePage />} />
        <Route path="/quiz/session/:sessionId" element={<p>Phiên làm bài đã tạo</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function setupQuery(query = 'Chiến thắng Điện Biên Phủ năm 1954') {
  fireEvent.change(screen.getByLabelText('Bạn muốn ôn tập nội dung gì?'), { target: { value: query } });
}

describe('QuizGeneratePage', () => {
  beforeEach(() => {
    mocks.generateQuiz.mockReset();
  });

  it('keeps the canonical form focused on its title and controls', () => {
    renderPage();
    expect(screen.queryByText('LUYỆN TẬP VỚI AI')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Tạo bài luyện tập bằng AI' })).toBeInTheDocument();
    expect(screen.queryByText('AI tạo bài luyện tập từ nội dung SGK Lịch sử, được điều chỉnh theo chủ đề, độ khó và số câu bạn lựa chọn.')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Nội dung' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'Nội dung và cấu hình' })).not.toBeInTheDocument();
    expect(screen.queryByText('Mô tả cụ thể giúp AI tạo câu hỏi sát với nội dung bạn muốn ôn hơn.')).not.toBeInTheDocument();
  });

  it('does not add a page-level back action on the canonical route', () => {
    renderPage();
    expect(screen.queryByRole('button', { name: 'Về Luyện tập với AI' })).not.toBeInTheDocument();
  });

  it('prefills the human-readable topic from q on the canonical /quiz route', () => {
    renderPage(['/quiz?q=C%C3%A1ch+m%E1%BA%A1ng+th%C3%A1ng+T%C3%A1m']);
    expect(screen.getByLabelText('Bạn muốn ôn tập nội dung gì?')).toHaveValue('Cách mạng tháng Tám');
    expect(mocks.generateQuiz).not.toHaveBeenCalled();
  });

  it('renders all six static suggestions as actions without selection semantics', () => {
    renderPage();
    const suggestions = screen.getByRole('group', { name: 'Gợi ý cho bạn' });
    const buttons = within(suggestions).getAllByRole('button');

    expect(buttons).toHaveLength(6);
    expect(within(suggestions).getByRole('button', { name: 'Cách mạng tháng Tám' })).toBeInTheDocument();
    expect(within(suggestions).getByRole('button', { name: 'Điện Biên Phủ 1954' })).toBeInTheDocument();
    expect(within(suggestions).getByRole('button', { name: 'Kháng chiến chống Mỹ' })).toBeInTheDocument();
    expect(within(suggestions).getByRole('button', { name: 'ASEAN' })).toBeInTheDocument();
    expect(within(suggestions).getByRole('button', { name: 'Văn minh Đại Việt' })).toBeInTheDocument();
    expect(within(suggestions).getByRole('button', { name: 'Đổi mới 1986' })).toBeInTheDocument();
    expect(buttons.every((button) => !button.hasAttribute('aria-pressed'))).toBe(true);
    expect(screen.queryByRole('combobox', { name: /gợi ý/i })).not.toBeInTheDocument();
  });

  it('replaces the query on each suggestion click and remains manually editable without submitting', async () => {
    renderPage();
    const user = userEvent.setup();
    const query = screen.getByLabelText('Bạn muốn ôn tập nội dung gì?');
    await user.type(query, 'Nội dung nhập tay');
    await user.click(screen.getByRole('button', { name: 'ASEAN' }));
    expect(query).toHaveValue('ASEAN và quan hệ quốc tế');
    expect(mocks.generateQuiz).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Văn minh Đại Việt' }));
    expect(query).toHaveValue('Văn minh Đại Việt');
    await user.type(query, ' và di sản');
    expect(query).toHaveValue('Văn minh Đại Việt và di sản');
    await user.clear(query);
    expect(screen.getByRole('button', { name: /tạo 3 câu hỏi/i })).toBeDisabled();
  });

  it('keeps short suggestion labels separate from the full generated query', async () => {
    mocks.generateQuiz.mockResolvedValue({ sessionId: 'session-1' });
    renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Điện Biên Phủ 1954' }));
    expect(screen.getByLabelText('Bạn muốn ôn tập nội dung gì?')).toHaveValue('Chiến thắng Điện Biên Phủ năm 1954');
    expect(screen.getByText((_, node) => node?.textContent?.replace(/\s+/g, ' ').trim() === 'Thời gian: 5 phút')).toBeInTheDocument();
    expect(screen.queryByText((_, node) => node?.textContent?.replace(/\s+/g, ' ').trim() === 'Thời gian: 10 phút')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /tạo 3 câu hỏi/i }));

    await waitFor(() => expect(mocks.generateQuiz).toHaveBeenCalledWith({
      query: 'Chiến thắng Điện Biên Phủ năm 1954',
      difficulty: 'medium',
      questionCount: 3,
      timeLimitMinutes: 5,
    }, 'user-1', expect.any(AbortSignal)));
  });

  it('disables the CTA when the query is empty and never falls back to local mock generation', () => {
    renderPage();
    const create = screen.getByRole('button', { name: /tạo 3 câu hỏi/i });
    expect(create).toBeDisabled();
    expect(create).not.toHaveAttribute('aria-describedby');
    fireEvent.click(create);
    expect(mocks.generateQuiz).not.toHaveBeenCalled();
  });

  it('keeps invalid query aria-invalid true without showing the explanatory message', () => {
    renderPage();
    const query = screen.getByLabelText('Bạn muốn ôn tập nội dung gì?');
    fireEvent.change(query, { target: { value: 'a'.repeat(1001) } });
    expect(query).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText('Hãy nhập chủ đề hoặc yêu cầu để tạo câu hỏi.')).not.toBeInTheDocument();
  });

  it('renders difficulty and count as separate responsive fieldsets and exposes exactly 1/3/5 count radios only', () => {
    const { container } = renderPage();
    const difficulty = screen.getByRole('group', { name: 'Độ khó' });
    const count = screen.getByRole('group', { name: 'Số câu' });
    expect(difficulty).not.toBe(count);
    expect(container.querySelector('.quiz-config-grid')).toContainElement(difficulty);
    expect(container.querySelector('.quiz-config-grid')).toContainElement(count);
    expect(screen.queryByText('Tối đa 10 câu cho mỗi bài tự luyện.')).not.toBeInTheDocument();
    const countRadios = within(count).getAllByRole('radio');
    expect(countRadios).toHaveLength(3);
    expect(within(count).getByRole('radio', { name: '1 câu' })).toBeInTheDocument();
    expect(within(count).getByRole('radio', { name: '3 câu' })).toBeInTheDocument();
    expect(within(count).getByRole('radio', { name: '5 câu' })).toBeInTheDocument();
    expect(within(count).queryByRole('radio', { name: 'Khác' })).not.toBeInTheDocument();
    expect(within(count).queryByRole('radio', { name: '10 câu' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Nhập số câu (1–10)')).not.toBeInTheDocument();
    expect(screen.queryByText(/Trung bình • 5 câu • 10 phút/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Trung bình • 3 câu • 5 phút/)).not.toBeInTheDocument();
  });

  it('uses text controls without decorative icons', () => {
    const { container } = renderPage();
    expect(container.querySelector('[data-quiz-icon="setup"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-quiz-icon="generate"]')).not.toBeInTheDocument();
  });

  it('submits once with trimmed query and derived time then navigates on success', async () => {
    mocks.generateQuiz.mockResolvedValue({ sessionId: 'session-1' });
    renderPage();
    setupQuery('  ASEAN  ');
    const create = screen.getByRole('button', { name: /tạo 3 câu hỏi/i });
    fireEvent.click(create);
    fireEvent.click(create);

    await waitFor(() => expect(mocks.generateQuiz).toHaveBeenCalledOnce());
    expect(mocks.generateQuiz.mock.calls[0][0]).toEqual({
      query: 'ASEAN',
      difficulty: 'medium',
      questionCount: 3,
      timeLimitMinutes: 5,
    });
    expect(await screen.findByText('Phiên làm bài đã tạo')).toBeInTheDocument();
  });

  it('recomputes CTA label and timer disclosure when count switches between 1 and 5 without submitting', async () => {
    renderPage();
    const user = userEvent.setup();

    setupQuery('Cách mạng tháng Tám');
    const countGroup = screen.getByRole('group', { name: 'Số câu' });
    const disclosure = (label: string) => screen.getByText((_, node) => node?.textContent?.replace(/\s+/g, ' ').trim() === label);

    expect(disclosure('Thời gian: 5 phút')).toBeInTheDocument();

    expect(disclosure('Thời gian: 5 phút')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tạo 3 câu hỏi/i })).toBeInTheDocument();

    await user.click(within(countGroup).getByRole('radio', { name: '1 câu' }));
    expect(disclosure('Thời gian: 5 phút')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tạo 1 câu hỏi/i })).toBeInTheDocument();
    expect(screen.queryByText((_, node) => node?.textContent?.replace(/\s+/g, ' ').trim() === 'Thời gian: 10 phút')).not.toBeInTheDocument();

    await user.click(within(countGroup).getByRole('radio', { name: '5 câu' }));
    expect(disclosure('Thời gian: 10 phút')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tạo 5 câu hỏi/i })).toBeInTheDocument();

    await user.click(within(countGroup).getByRole('radio', { name: '3 câu' }));
    expect(disclosure('Thời gian: 5 phút')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tạo 3 câu hỏi/i })).toBeInTheDocument();
  });

  it('submits 1-question session to AI quiz service unchanged', async () => {
    mocks.generateQuiz.mockResolvedValue({ sessionId: 'session-1' });
    renderPage();
    const user = userEvent.setup();

    setupQuery('Cách mạng tháng Tám');
    await user.click(screen.getByRole('radio', { name: '1 câu' }));
    fireEvent.click(screen.getByRole('button', { name: /tạo 1 câu hỏi/i }));

    await waitFor(() => expect(mocks.generateQuiz).toHaveBeenCalledWith(expect.objectContaining({
      query: 'Cách mạng tháng Tám',
      difficulty: 'medium',
      questionCount: 1,
      timeLimitMinutes: 5,
    }), expect.any(String), expect.any(AbortSignal)));
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
    setupQuery('Điện Biên Phủ');
    fireEvent.click(screen.getByRole('button', { name: /tạo 3 câu hỏi/i }));
    expect(receivedSignal).toBeInstanceOf(AbortSignal);
    fireEvent.click(await screen.findByRole('button', { name: 'Dừng chờ' }));
    expect(receivedSignal?.aborted).toBe(true);

    await waitFor(() => expect(screen.queryByRole('dialog', { name: /đang tạo 3 câu hỏi/i })).not.toBeInTheDocument());
    expect(screen.getByLabelText('Bạn muốn ôn tập nội dung gì?')).toHaveValue('Điện Biên Phủ');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the form usable and shows a controlled error when AI generation is unavailable', async () => {
    mocks.generateQuiz.mockRejectedValue(new Error('AI service unavailable'));
    renderPage();
    setupQuery('Cách mạng tháng Tám');
    fireEvent.click(screen.getByRole('button', { name: /tạo 3 câu hỏi/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Chưa thể tạo bài luyện tập');
    expect(screen.getByLabelText('Bạn muốn ôn tập nội dung gì?')).toHaveValue('Cách mạng tháng Tám');
  });
});
