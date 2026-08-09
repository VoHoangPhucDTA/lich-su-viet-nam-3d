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

  it('accepts the fixed backend multi-point contract without an adapter change', async () => {
    const mapData = {
      geoType: 'multi_point',
      markers: [
        { name: 'Bạch Đằng', lat: 20.8833, lng: 106.8 },
        { name: 'Cửa Lục', lat: 20.95, lng: 107.05 },
        { name: 'Thăng Long', lat: 21.0285, lng: 105.8542 },
        { name: 'Vân Đồn', lat: 20.9906, lng: 107.4069 },
      ],
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(apiResponse({
      ...baseDetail,
      id: 'khang-chien-chong-quan-nguyen-1287-1288',
      slug: 'khang-chien-chong-quan-nguyen-1287-1288',
      geoType: 'multi_point',
      lat: null,
      lng: null,
      mapData,
    }));

    const event = await getHistoricalEventFromBackend('khang-chien-chong-quan-nguyen-1287-1288');

    expect(event?.canonicalGeoType).toBe('multi_point');
    expect(event?.sourceMapData).toEqual(mapData);
    expect(event?.sourceMapData?.markers).toHaveLength(4);
    expect(event?.sourceMapData).not.toHaveProperty('object');
    expect(event?.sourceMapData).not.toHaveProperty('valueNode');
  });

  it('keeps event detail rendering functional when mapData is absent', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(apiResponse({ ...baseDetail, mapData: null }));

    const event = await getEventDetailFromBackend('event-1');

    expect(event?.id).toBe('event-1');
    expect(event?.mapData?.displayGeometry?.marker?.coordinates).toEqual([107.59, 16.46]);
  });
});
