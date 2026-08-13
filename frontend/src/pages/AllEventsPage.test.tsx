import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HistoricalPeriodId } from '../data/historicalPeriods';

const mocks = vi.hoisted(() => ({
  useInfiniteEvents: vi.fn(),
}));

vi.mock('../hooks/useInfiniteEvents', () => ({
  useInfiniteEvents: mocks.useInfiniteEvents,
}));

vi.mock('../components/shared/EventCard', () => ({
  default: () => null,
}));

import AllEventsPage from './AllEventsPage';

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

function renderBrowse(initialEntry = '/browse') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/browse" element={<><AllEventsPage /><LocationProbe /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function openFilters() {
  const user = userEvent.setup();
  const toggle = screen.getByRole('button', { name: /^Bộ lọc/ });
  if (toggle.getAttribute('aria-expanded') !== 'true') await user.click(toggle);
  return user;
}

describe('AllEventsPage period filter', () => {
  beforeEach(() => {
    mocks.useInfiniteEvents.mockReset();
    mocks.useInfiniteEvents.mockReturnValue({
      events: [],
      total: 0,
      hasMore: false,
      isInitialLoading: false,
      isLoadingMore: false,
      error: null,
      loadMore: vi.fn(),
      retry: vi.fn(),
    });
  });

  it('uses the cleaned single-heading layout and defaults to Tất cả', async () => {
    renderBrowse();
    expect(screen.getByRole('button', { name: /^Bộ lọc/ })).toHaveAttribute('aria-expanded', 'false');
    await openFilters();

    expect(screen.getAllByRole('heading', { level: 1, name: 'Tất cả sự kiện lịch sử' })).toHaveLength(1);
    expect(screen.queryByText('Quay lại')).not.toBeInTheDocument();
    expect(screen.queryByText('THƯ VIỆN SỰ KIỆN')).not.toBeInTheDocument();
    expect(screen.queryByText(/Duyệt kho sự kiện lịch sử Việt Nam/)).not.toBeInTheDocument();
    const group = screen.getByRole('group', { name: 'Thời kỳ' });
    expect(within(group).getByRole('button', { name: 'Tất cả' })).toHaveAttribute('aria-pressed', 'true');
    expect(mocks.useInfiniteEvents).toHaveBeenLastCalledWith(expect.objectContaining({
      startYearFrom: undefined,
      startYearTo: undefined,
    }));
  });

  it.each([
    ['ancient', 'Cổ đại', undefined, 938],
    ['feudal', 'Phong kiến', 938, 1858],
    ['colonial', 'Cận đại', 1858, 1945],
    ['modern', 'Hiện đại', 1945, 1975],
    ['contemporary', 'Đương đại', 1975, undefined],
  ] satisfies Array<[HistoricalPeriodId, string, number | undefined, number | undefined]>) (
    'derives exact request boundaries for period=%s',
    async (period, label, startYearFrom, startYearTo) => {
      renderBrowse(`/browse?period=${period}`);

      expect(screen.getByRole('button', { name: /^Bộ lọc/ })).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByText('(1)')).toHaveAccessibleName('1 bộ lọc đang dùng');
      expect(mocks.useInfiniteEvents).toHaveBeenLastCalledWith(expect.objectContaining({
        startYearFrom,
        startYearTo,
      }));
      expect(screen.getByTestId('location')).toHaveTextContent(`/browse?period=${period}`);
    },
  );

  it('lets the user collapse an initially expanded period panel without reopening on query updates', async () => {
    const user = userEvent.setup();
    renderBrowse('/browse?period=modern');
    const toggle = screen.getByRole('button', { name: /^Bộ lọc/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('group', { name: 'Thời kỳ' })).not.toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Tìm kiếm sự kiện' }), 'Huế');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('period=modern'));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('resets the app scroll root once on page entry but not on same-page query changes', async () => {
    const user = userEvent.setup();
    const scrollRoot = document.createElement('div');
    scrollRoot.id = 'app-scroll-root';
    scrollRoot.scrollTo = vi.fn();
    document.body.append(scrollRoot);

    try {
      renderBrowse('/browse?period=modern');
      expect(scrollRoot.scrollTo).toHaveBeenCalledTimes(1);
      expect(scrollRoot.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });

      vi.mocked(scrollRoot.scrollTo).mockClear();
      await user.type(screen.getByRole('textbox', { name: 'Tìm kiếm sự kiện' }), 'Huế');
      await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('q=Hu'));
      expect(scrollRoot.scrollTo).not.toHaveBeenCalled();
    } finally {
      scrollRoot.remove();
    }
  });

  it('writes only the canonical period and removes custom years when a preset is clicked', async () => {
    renderBrowse('/browse?from=1000&to=1400');
    const user = await openFilters();
    await user.click(screen.getByRole('button', { name: 'Phong kiến' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/browse?period=feudal'));
    expect(screen.getByTestId('location')).not.toHaveTextContent('from=');
    expect(screen.getByTestId('location')).not.toHaveTextContent('to=');
  });

  it('materializes period bounds and clears period when a year is manually edited', async () => {
    renderBrowse('/browse?period=feudal');
    const user = await openFilters();
    const yearFrom = screen.getByLabelText('Năm từ');
    expect(yearFrom).toHaveValue('938');
    expect(screen.getByLabelText('Năm đến')).toHaveValue('1857');

    await user.clear(yearFrom);
    await user.type(yearFrom, '1000');

    await waitFor(() => {
      const location = screen.getByTestId('location').textContent ?? '';
      expect(location).toContain('from=1000');
      expect(location).toContain('to=1857');
      expect(location).not.toContain('period=');
    });
  });

  it('clears period with Tất cả and with reset', async () => {
    const { unmount } = renderBrowse('/browse?period=modern');
    let user = await openFilters();
    await user.click(screen.getByRole('button', { name: 'Tất cả' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/browse'));

    unmount();
    renderBrowse('/browse?period=modern&type=military&grade=12');
    user = await openFilters();
    await user.click(screen.getByRole('button', { name: 'Xóa bộ lọc' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/browse'));
    expect(screen.getByRole('button', { name: 'Tất cả' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('removes an invalid period safely without inventing request boundaries', async () => {
    renderBrowse('/browse?period=unknown');
    await openFilters();

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/browse'));
    expect(screen.getByRole('button', { name: 'Tất cả' })).toHaveAttribute('aria-pressed', 'true');
    expect(mocks.useInfiniteEvents).toHaveBeenLastCalledWith(expect.objectContaining({
      startYearFrom: undefined,
      startYearTo: undefined,
    }));
  });
});
