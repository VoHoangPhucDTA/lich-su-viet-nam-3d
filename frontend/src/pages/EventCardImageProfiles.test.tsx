import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HistoricalEvent } from '../types/event';

const mocks = vi.hoisted(() => ({
  getHomepageEvents: vi.fn(),
  useInfiniteEvents: vi.fn(),
}));

vi.mock('../services/eventApi', () => ({
  getHomepageEvents: mocks.getHomepageEvents,
}));

vi.mock('../hooks/useInfiniteEvents', () => ({
  useInfiniteEvents: mocks.useInfiniteEvents,
}));

vi.mock('../components/shared/EventCard', () => ({
  default: ({ imageProfile }: { imageProfile: string }) => (
    <div data-testid="event-card" data-image-profile={imageProfile} />
  ),
}));

import AllEventsPage from './AllEventsPage';
import CoiNguonPage from './CoiNguonPage';
import HistoricalPeriodsPage from './HistoricalPeriodsPage';

const event: HistoricalEvent = {
  id: 'profile-test-event',
  slug: 'profile-test-event',
  name: 'Profile test event',
  description: 'Used only to verify the EventCard image profile at each route.',
  startYear: 938,
  endYear: null,
  effectiveEndYear: null,
  eventType: 'military',
  geoType: 'point',
  parentId: null,
  primaryRegions: ['Hai Phong'],
};

function renderRoute(path: string, page: ReactElement) {
  return render(<MemoryRouter initialEntries={[path]}>{page}</MemoryRouter>);
}

async function expectOnlyImageProfile(expectedProfile: string) {
  const cards = await screen.findAllByTestId('event-card');
  expect(cards).not.toHaveLength(0);
  expect(cards).toHaveLength(1);
  expect(cards[0]).toHaveAttribute('data-image-profile', expectedProfile);
}

describe('EventCard image profiles by public route', () => {
  beforeEach(() => {
    mocks.getHomepageEvents.mockReset();
    mocks.getHomepageEvents.mockResolvedValue([event]);
    mocks.useInfiniteEvents.mockReset();
    mocks.useInfiniteEvents.mockReturnValue({
      events: [event],
      total: 1,
      hasMore: false,
      isInitialLoading: false,
      isLoadingMore: false,
      error: null,
      loadMore: vi.fn(),
      retry: vi.fn(),
    });
  });

  it('uses the home profile for featured EventCards on /home', async () => {
    renderRoute('/home', <CoiNguonPage />);

    await expectOnlyImageProfile('home');
    expect(mocks.getHomepageEvents).toHaveBeenCalledTimes(1);
  });

  it('uses the browse profile for EventCards on /browse', async () => {
    renderRoute('/browse', <AllEventsPage />);

    await expectOnlyImageProfile('browse');
  });

  it('uses the period profile for EventCards on /periods?period=ancient', async () => {
    renderRoute('/periods?period=ancient', <HistoricalPeriodsPage />);

    await expectOnlyImageProfile('period');
  });
});
