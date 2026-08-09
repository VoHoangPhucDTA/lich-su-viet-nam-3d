import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EventDetailPage from '../EventDetailPage';
import { getEventDetailBySlug } from '../../services/eventDetailService';

vi.mock('../../services/eventDetailService', () => ({
  getEventDetailBySlug: vi.fn(),
}));

vi.mock('../../services/eventApi', () => ({
  recordEventView: vi.fn().mockResolvedValue({}),
  getEventProgress: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../services/csrfClient', () => ({
  getCsrfToken: () => null,
}));

// jsdom does not implement IntersectionObserver (used by useReadingProgress).
class MockIntersectionObserver {
  root = null;
  rootMargin = '';
  thresholds = [];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
vi.stubGlobal(
  'IntersectionObserver',
  MockIntersectionObserver as unknown as typeof IntersectionObserver
);

describe('EventDetailPage loading skeleton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a stable skeleton shell instead of the full-screen spinner while loading', () => {
    // Never-resolving promise keeps the page in the loading state.
    vi.mocked(getEventDetailBySlug).mockReturnValue(new Promise(() => {}));

    const { container } = render(
      <MemoryRouter initialEntries={['/events/bach-dang-938']}>
        <Routes>
          <Route path="/events/:slug" element={<EventDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    // Loading is announced via role=status with sr-only text.
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải dữ liệu sự kiện…');

    // The old full-screen spinner (which caused the 0.369 CLS swap) must be gone.
    expect(container.querySelector('.animate-spin')).toBeNull();

    // The skeleton mirrors the real page shell: sticky breadcrumb + skeleton blocks.
    expect(screen.getByText('Quay lại')).toBeInTheDocument();
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });
});
