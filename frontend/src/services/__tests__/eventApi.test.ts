import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }));

vi.mock('../apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../apiClient')>();
  return { ...actual, apiGet };
});

import { getTerrainInsightBySlug } from '../../data/terrainInsights';
import {
  getEventsByYearFromBackend,
  getHomepageEventSummaries,
  getHomepageEvents,
  searchEventsFromBackend,
} from '../eventApi';

const homepageIds = [
  'homepage-6',
  'homepage-2',
  'homepage-5',
  'homepage-1',
  'homepage-4',
  'homepage-3',
] as const;

function homepageSummary(id: string, index: number) {
  return {
    id,
    slug: `${id}-slug`,
    title: `Homepage title ${index}`,
    startYear: index === 2 ? null : 900 + index,
    eventType: 'military' as const,
    provinceNames: [`Province ${index}`],
    cardSummary: `Homepage summary ${index}`,
  };
}

function homepageResponse(ids: readonly string[] = homepageIds) {
  return { events: ids.map((id, index) => homepageSummary(id, index)) };
}

function fallbackSummary(id: string, index: number) {
  return {
    id,
    slug: `${id}-slug`,
    title: `Fallback title ${index}`,
    eventLevel: 'atomic' as const,
    eventType: 'political' as const,
    startYear: 1900 + index,
    endYear: null,
    geoType: 'no_location' as const,
    provinceNames: [`Fallback province ${index}`],
    cardSummary: `Fallback summary ${index}`,
  };
}

function fallbackResponse() {
  return {
    items: Array.from({ length: 6 }, (_, index) => fallbackSummary(`fallback-${index + 1}`, index)),
    count: 6,
  };
}

function requestedPaths() {
  return apiGet.mock.calls.map(([path]) => path);
}

describe('getHomepageEvents', () => {
  beforeEach(() => {
    apiGet.mockReset();
  });

  it('uses one compact homepage request, retains backend order, and adapts card fields', async () => {
    apiGet.mockResolvedValue(homepageResponse());

    const events = await getHomepageEvents();

    expect(requestedPaths()).toEqual(['/api/events/homepage']);
    expect(events.map((event) => event.id)).toEqual(homepageIds);
    expect(events[0]).toMatchObject({
      id: 'homepage-6',
      slug: 'homepage-6-slug',
      name: 'Homepage title 0',
      description: 'Homepage summary 0',
      details: 'Homepage summary 0',
      startYear: 900,
      eventType: 'military',
      primaryRegions: ['Province 0'],
      endYear: null,
      effectiveEndYear: null,
      geoType: 'no_location',
      parentId: null,
    });
    expect(requestedPaths().some((path) => path.startsWith('/api/events/') && path !== '/api/events/homepage'))
      .toBe(false);
  });

  it('exposes the focused summary request without falling back when its compact contract is usable', async () => {
    apiGet.mockResolvedValue(homepageResponse());

    await expect(getHomepageEventSummaries()).resolves.toHaveLength(6);
    expect(requestedPaths()).toEqual(['/api/events/homepage']);
  });

  it('falls back exactly once after a homepage endpoint error without issuing detail requests', async () => {
    apiGet.mockRejectedValueOnce(new Error('unavailable'));
    apiGet.mockResolvedValueOnce(fallbackResponse());

    const events = await getHomepageEvents();

    expect(requestedPaths()).toEqual([
      '/api/events/homepage',
      '/api/events?eventLevel=atomic&limit=30',
    ]);
    expect(events.map((event) => event.id)).toEqual([
      'fallback-1', 'fallback-2', 'fallback-3', 'fallback-4', 'fallback-5', 'fallback-6',
    ]);
  });

  it('discards an incomplete homepage response and returns only fallback cards', async () => {
    apiGet.mockResolvedValueOnce(homepageResponse(homepageIds.slice(0, 5)));
    apiGet.mockResolvedValueOnce(fallbackResponse());

    const events = await getHomepageEvents();

    expect(requestedPaths()).toEqual([
      '/api/events/homepage',
      '/api/events?eventLevel=atomic&limit=30',
    ]);
    expect(events.map((event) => event.id)).toEqual([
      'fallback-1', 'fallback-2', 'fallback-3', 'fallback-4', 'fallback-5', 'fallback-6',
    ]);
    expect(events.some((event) => event.id.startsWith('homepage-'))).toBe(false);
  });

  it.each([
    ['malformed root', { items: [] }],
    ['invalid required item', {
      events: homepageIds.map((id, index) => index === 3
        ? { ...homepageSummary(id, index), title: '' }
        : homepageSummary(id, index)),
    }],
    ['duplicate ids', {
      events: homepageIds.map((id, index) => homepageSummary(index === 5 ? homepageIds[0] : id, index)),
    }],
    ['duplicate slugs', {
      events: homepageIds.map((id, index) => ({
        ...homepageSummary(id, index),
        slug: index === 5 ? `${homepageIds[0]}-slug` : `${id}-slug`,
      })),
    }],
  ])('uses the fallback once for a %s response', async (_label, invalidResponse) => {
    apiGet.mockResolvedValueOnce(invalidResponse);
    apiGet.mockResolvedValueOnce(fallbackResponse());

    const events = await getHomepageEvents();

    expect(requestedPaths()).toEqual([
      '/api/events/homepage',
      '/api/events?eventLevel=atomic&limit=30',
    ]);
    expect(events).toHaveLength(6);
    expect(events.map((event) => event.id)).not.toContain('homepage-1');
  });

  it('does not retry when the fallback also fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    apiGet.mockRejectedValueOnce(new Error('homepage down'));
    apiGet.mockRejectedValueOnce(new Error('fallback down'));

    await expect(getHomepageEvents()).resolves.toEqual([]);

    expect(requestedPaths()).toEqual([
      '/api/events/homepage',
      '/api/events?eventLevel=atomic&limit=30',
    ]);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('event API slug normalization', () => {
  beforeEach(() => {
    apiGet.mockReset();
  });

  it('preserves a real API slug when the runtime ID is different', async () => {
    apiGet.mockResolvedValue({
      items: [{
        ...fallbackSummary('event-row-000123', 0),
        slug: 'chien-dich-dien-bien-phu-1954',
      }],
      count: 1,
    });

    const [event] = await getEventsByYearFromBackend(1954);
    expect(event.id).toBe('event-row-000123');
    expect(event.slug).toBe('chien-dich-dien-bien-phu-1954');
    expect(getTerrainInsightBySlug(event.slug)?.canonicalSlug).toBe('chien-dich-dien-bien-phu-1954');
  });

  it('does not use an ID that equals a canonical slug when the API slug is missing', async () => {
    apiGet.mockResolvedValue({
      items: [{
        ...fallbackSummary('chien-dich-dien-bien-phu-1954', 0),
        slug: undefined,
      }],
      count: 1,
    });

    const [event] = await getEventsByYearFromBackend(1954);
    expect(event.id).toBe('chien-dich-dien-bien-phu-1954');
    expect(event.slug).toBeUndefined();
    expect(getTerrainInsightBySlug(event.slug)).toBeNull();
  });

  it('normalizes empty and whitespace-only API slugs to undefined', async () => {
    apiGet.mockResolvedValue({
      items: [
        { ...fallbackSummary('empty-slug', 0), slug: '' },
        { ...fallbackSummary('blank-slug', 1), slug: '   ' },
      ],
      count: 2,
    });

    const events = await getEventsByYearFromBackend(1954);
    expect(events.map((event) => event.slug)).toEqual([undefined, undefined]);
  });
});

describe('event API global search', () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiGet.mockResolvedValue({ items: [], count: 0 });
  });

  it('keeps search independent from year while preserving the optional grade filter', async () => {
    await searchEventsFromBackend('Điện Biên', 12);
    await searchEventsFromBackend('Điện Biên', null);

    expect(apiGet).toHaveBeenNthCalledWith(
      1,
      '/api/events?q=%C4%90i%E1%BB%87n+Bi%C3%AAn&grade=12&limit=1000',
    );
    expect(apiGet).toHaveBeenNthCalledWith(
      2,
      '/api/events?q=%C4%90i%E1%BB%87n+Bi%C3%AAn&limit=1000',
    );
  });
});
