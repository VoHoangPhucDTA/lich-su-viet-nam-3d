import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HISTORICAL_PERIODS } from '../data/historicalPeriods';
import type { HistoricalEvent } from '../types/event';

const mocks = vi.hoisted(() => ({
  getHomepageEvents: vi.fn(),
}));

vi.mock('../services/eventApi', () => ({
  getHomepageEvents: mocks.getHomepageEvents,
}));

vi.mock('../components/shared/EventCard', () => ({
  default: ({ event, imageProfile }: {
    event: { id: string; name: string; slug?: string };
    imageProfile: string;
  }) => (
    <a
      data-testid="event-card"
      data-event-id={event.id}
      data-image-profile={imageProfile}
      href={`/events/${event.slug ?? event.id}`}
    >
      {event.name}
    </a>
  ),
}));

import CoiNguonPage from './CoiNguonPage';

function featuredEvent(position: number): HistoricalEvent {
  return {
    id: `featured-${position}`,
    slug: `featured-${position}-slug`,
    name: `Featured event ${position}`,
    description: `Summary ${position}`,
    startYear: 900 + position,
    endYear: null,
    effectiveEndYear: null,
    eventType: 'military',
    geoType: 'no_location',
    parentId: null,
    primaryRegions: ['Việt Nam'],
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

function renderHomepage() {
  return render(
    <MemoryRouter initialEntries={['/home']}>
      <CoiNguonPage />
    </MemoryRouter>,
  );
}

describe('CoiNguonPage homepage cards', () => {
  beforeEach(() => {
    mocks.getHomepageEvents.mockReset();
  });

  it('keeps the skeleton until the summary service resolves, then renders six ordered home-profile cards', async () => {
    const request = deferred<HistoricalEvent[]>();
    mocks.getHomepageEvents.mockReturnValue(request.promise);
    const { container } = renderHomepage();

    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(6);
    expect(screen.queryAllByTestId('event-card')).toHaveLength(0);

    request.resolve(Array.from({ length: 6 }, (_, index) => featuredEvent(index + 1)));

    const cards = await screen.findAllByTestId('event-card');
    expect(cards).toHaveLength(6);
    expect(cards.map((card) => card.getAttribute('data-event-id'))).toEqual([
      'featured-1', 'featured-2', 'featured-3', 'featured-4', 'featured-5', 'featured-6',
    ]);
    expect(cards.every((card) => card.getAttribute('data-image-profile') === 'home')).toBe(true);
    expect(cards[0]).toHaveAttribute('href', '/events/featured-1-slug');
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(0);
    expect(mocks.getHomepageEvents).toHaveBeenCalledTimes(1);
  });

  it('renders fallback-provided cards through the same non-loading card contract', async () => {
    mocks.getHomepageEvents.mockResolvedValue([
      featuredEvent(7), featuredEvent(8), featuredEvent(9),
      featuredEvent(10), featuredEvent(11), featuredEvent(12),
    ]);
    const { container } = renderHomepage();

    const cards = await screen.findAllByTestId('event-card');
    expect(cards.map((card) => card.getAttribute('data-event-id'))).toEqual([
      'featured-7', 'featured-8', 'featured-9', 'featured-10', 'featured-11', 'featured-12',
    ]);
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(0);
  });

  it('keeps all period cards on canonical Browse URLs without the redundant overview link', async () => {
    mocks.getHomepageEvents.mockResolvedValue([]);
    renderHomepage();

    expect(screen.queryByRole('link', { name: /Xem tất cả thời kỳ/ })).not.toBeInTheDocument();
    for (const period of HISTORICAL_PERIODS) {
      expect(screen.getByRole('heading', { name: period.label }).closest('a')).toHaveAttribute(
        'href',
        `/browse?period=${period.id}`,
      );
    }
  });
});
