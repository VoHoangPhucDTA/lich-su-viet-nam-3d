import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getEventDetailFromBackend, getHistoricalEventFromBackend } from './eventApi';

const baseDetail = {
  id: 'event-1',
  slug: 'event-1',
  title: 'Mapped event',
  shortTitle: 'Mapped',
  eventLevel: 'atomic',
  eventType: 'military',
  startYear: 1945,
  endYear: null,
  effectiveEndYear: 1945,
  displayDate: '1945',
  datePrecision: 'year',
  geoType: 'single_point',
  lat: 16.46,
  lng: 107.59,
  provinceNames: ['Huế'],
  historicalLocations: ['Phú Xuân'],
  parentId: null,
  rootId: null,
  level: 0,
  orderInParent: 0,
  cardSummary: 'Summary',
  canonicalSummary: 'Canonical summary',
  detailedNarrative: 'Narrative',
  significance: 'Significance',
  keyFacts: ['Fact'],
  showOnHomepage: true,
  showOnTimeline: true,
  featured: false,
  childCount: 0,
  status: 'published',
  grades: [12],
  textbookRefs: [],
  externalSources: [],
  media: [],
  relations: [],
  relatedEvents: { predecessors: [], successors: [], related: [] },
  textbookContent: 'Textbook content',
};

function apiResponse(data: unknown) {
  return new Response(JSON.stringify({
    success: true,
    code: 'SUCCESS',
    message: 'Success',
    data,
    timestamp: '2026-01-01T00:00:00Z',
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('eventApi public mapData boundary', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the dedicated mapData response without retaining sourceJson', async () => {
    const mapData = {
      geoType: 'point',
      marker: { label: 'Huế', lat: 16.46, lng: 107.59 },
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(apiResponse({ ...baseDetail, mapData }));

    const event = await getHistoricalEventFromBackend('event-1');

    expect(event?.sourceMapData).toEqual(mapData);
    expect(event?.canonicalGeoType).toBe('point');
    expect(event).not.toHaveProperty('sourceJson');
  });

  it('keeps event detail rendering functional when mapData is absent', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(apiResponse({ ...baseDetail, mapData: null }));

    const event = await getEventDetailFromBackend('event-1');

    expect(event?.id).toBe('event-1');
    expect(event?.mapData?.displayGeometry?.marker?.coordinates).toEqual([107.59, 16.46]);
  });
});
