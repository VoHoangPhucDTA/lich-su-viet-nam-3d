import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import QuizHomePage from '../QuizHomePage';

const mocks = vi.hoisted(() => ({
  getQuizHistory: vi.fn(),
}));

vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    currentUser: { id: 'user-1', fullName: 'Học sinh kiểm thử' },
  }),
}));

vi.mock('@/services/quizService', () => ({
  getQuizHistory: mocks.getQuizHistory,
}));

function renderPage(initialEntries: string[] = ['/quiz']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/quiz" element={<QuizHomePage />} />
        <Route path="/home" element={<p>Trang chủ</p>} />
        <Route path="/unrelated" element={<p>Trang trước trong history</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('QuizHomePage as the canonical generate entry', () => {
  it('renders the create-quiz form on /quiz with the canonical H1', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Tạo bài luyện tập bằng AI' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'Luyện tập Lịch sử theo cách của bạn' })).not.toBeInTheDocument();
  });

  it('exposes the generate inputs (topic suggestions, topic textarea, difficulty radios, count picker)', () => {
    renderPage();
    expect(screen.getByLabelText('Bạn muốn ôn tập nội dung gì?')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Gợi ý cho bạn' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Cách mạng|Điện Biên Phủ|Kháng chiến chống Mỹ|ASEAN|Đại Việt|Đổi mới/ })).toHaveLength(6);
    // 3 difficulty radios: Dễ / Trung bình / Khó.
    const difficultyRadios = screen.getAllByRole('radio', { name: /Dễ|Trung bình|Khó/ });
    expect(difficultyRadios.length).toBeGreaterThanOrEqual(3);
    expect(screen.getByRole('button', { name: /Tạo \d+ câu hỏi/i })).toBeInTheDocument();
  });

  it('does not expose the legacy landing copy, progress, history link, or storage disclaimer', () => {
    renderPage();
    expect(screen.queryByText(/Tiến độ luyện tập/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Dữ liệu trên trình duyệt này/)).not.toBeInTheDocument();
    expect(screen.queryByText('Bài đã hoàn thành')).not.toBeInTheDocument();
    expect(screen.queryByText('Câu đã làm')).not.toBeInTheDocument();
    expect(screen.queryByText('Điểm trung bình')).not.toBeInTheDocument();
    expect(screen.queryByText('Kết quả gần nhất')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Xem lịch sử/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText(/trình duyệt bạn đang dùng/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Kết quả phục vụ ôn tập cá nhân/)).not.toBeInTheDocument();
    expect(mocks.getQuizHistory).not.toHaveBeenCalled();
  });

  it('does not display the regenerated technical disclaimer on the generate section', () => {
    renderPage();
    expect(screen.queryByText(/Câu hỏi được tạo từ nguồn SGK và chỉ được lưu trong trình duyệt của bạn/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Chọn một gợi ý để điền nhanh vào ô bên dưới/)).not.toBeInTheDocument();
  });

  it('does not add a page-level back action on the canonical route', () => {
    renderPage(['/unrelated', '/quiz']);
    expect(screen.queryByRole('button', { name: 'Về Luyện tập với AI' })).not.toBeInTheDocument();
  });
});
