import { describe, expect, it } from 'vitest';
import type { EventType, HistoricalEvent } from '../types/event';
import {
  buildMapVisibilityProjection,
  normalizeMapSearchTerm,
  type MapQueryState,
} from './mapVisibility';

function event(
  id: string,
  overrides: Partial<HistoricalEvent> = {},
): HistoricalEvent {
  return {
    id,
    name: id,
    description: '',
    startYear: 40,
    endYear: null,
    effectiveEndYear: 40,
    eventType: 'political',
    geoType: 'point',
    coordinates: { lat: 16, lng: 106 },
    parentId: null,
    ...overrides,
  };
}

const baseQuery: MapQueryState = {
  year: 40,
  searchTerm: '',
  grade: null,
  category: null,
};

const ids = (events: readonly HistoricalEvent[]) => events.map((item) => item.id);

describe('buildMapVisibilityProjection', () => {
  it('returns the year-40 tree and locatable IDs for an empty search', () => {
    const candidates = [
      event('parent', { geoType: 'nationwide' }),
      event('hai-ba-trung', { eventType: 'military' }),
      event('no-location', { geoType: 'no_location', coordinates: undefined }),
    ];

    const result = buildMapVisibilityProjection(candidates, baseQuery);

    expect(ids(result.flattenedEvents)).toEqual(['parent', 'hai-ba-trung', 'no-location']);
    expect(ids(result.locatableMapEvents)).toEqual(['hai-ba-trung']);
    expect(result.markerCandidateCount).toBe(1);
  });

  it('normalizes search with trim, Unicode case and collapsed whitespace', () => {
    expect(normalizeMapSearchTerm('  ĐIỆN   BIÊN  ')).toBe('điện biên');
  });

  it('uses the shared exact client predicate for search điện', () => {
    const dienBien = event('dien-bien', { name: 'Chiến thắng Điện Biên Phủ' });
    const saHuynh = event('van-hoa-sa-huynh', { name: 'Văn hoá Sa Huỳnh' });
    const result = buildMapVisibilityProjection(
      [dienBien, saHuynh],
      { ...baseQuery, searchTerm: ' điện ' },
      { searchCandidateIds: new Set([dienBien.id, saHuynh.id]) },
    );

    expect(ids(result.flattenedEvents)).toEqual(['dien-bien']);
    expect(ids(result.locatableMapEvents)).toEqual(['dien-bien']);
  });

  it('cannot show van-hoa-sa-huynh only on the map', () => {
    const saHuynh = event('van-hoa-sa-huynh', { name: 'Văn hoá Sa Huỳnh' });
    const result = buildMapVisibilityProjection(
      [saHuynh],
      { ...baseQuery, searchTerm: 'điện' },
      { searchCandidateIds: new Set([saHuynh.id]) },
    );

    expect(result.sidebarTree).toEqual([]);
    expect(result.locatableMapEvents).toEqual([]);
  });

  it.each<EventType>(['military', 'political', 'economic', 'cultural'])(
    'filters both sidebar and map for %s',
    (category) => {
      const candidates: HistoricalEvent[] = (
        ['military', 'political', 'economic', 'cultural'] as EventType[]
      ).map((type) => event(type, { eventType: type }));
      const result = buildMapVisibilityProjection(candidates, { ...baseQuery, category });

      expect(ids(result.flattenedEvents)).toEqual([category]);
      expect(ids(result.locatableMapEvents)).toEqual([category]);
    },
  );

  it.each([
    [10, ['grade-10']],
    [11, ['grade-11']],
    [12, []],
  ])('uses the backend year+grade scope for grade %s', (grade, expected) => {
    const candidates = [event('grade-10'), event('grade-11')];
    const result = buildMapVisibilityProjection(
      candidates,
      { ...baseQuery, grade: Number(grade) },
      { scopeEventIds: new Set(expected) },
    );

    expect(ids(result.flattenedEvents)).toEqual(expected);
    expect(ids(result.locatableMapEvents)).toEqual(expected);
  });

  it('returns an empty tree and map for no results', () => {
    const result = buildMapVisibilityProjection(
      [event('only-event')],
      { ...baseQuery, searchTerm: 'không tồn tại' },
      { searchCandidateIds: new Set() },
    );

    expect(result.sidebarTree).toEqual([]);
    expect(result.locatableMapEvents).toEqual([]);
  });

  it('deduplicates a stable event ID', () => {
    const result = buildMapVisibilityProjection(
      [event('duplicate'), event('duplicate', { name: 'newer shape' })],
      baseQuery,
    );

    expect(ids(result.flattenedEvents)).toEqual(['duplicate']);
    expect(ids(result.locatableMapEvents)).toEqual(['duplicate']);
  });

  it('keeps no_location in the sidebar but not on the map', () => {
    const result = buildMapVisibilityProjection(
      [event('no-location', { geoType: 'no_location', coordinates: undefined })],
      baseQuery,
    );

    expect(ids(result.flattenedEvents)).toEqual(['no-location']);
    expect(result.locatableMapEvents).toEqual([]);
  });

  it('keeps a parent row when a descendant is visible', () => {
    const child = event('visible-child', { parentId: 'parent', eventType: 'military' });
    const parent = event('parent', {
      eventType: 'political',
      children: [child],
    });
    const result = buildMapVisibilityProjection(
      [parent, child],
      { ...baseQuery, category: 'military' },
    );

    expect(ids(result.flattenedEvents)).toEqual(['parent', 'visible-child']);
    expect(ids(result.locatableMapEvents)).toEqual(['visible-child']);
    expect([...result.visibleEventIds]).toEqual(['visible-child']);
  });

  it('includes an embedded API child in scope without a top-level child row', () => {
    const child = event('embedded-child', {
      name: 'Embedded target event',
      parentId: 'parent',
      eventType: 'military',
    });
    const parent = event('parent', {
      eventType: 'political',
      children: [child],
    });
    const result = buildMapVisibilityProjection(
      [parent],
      { ...baseQuery, searchTerm: 'target', category: 'military' },
      { searchCandidateIds: new Set([child.id]) },
    );

    expect(ids(result.flattenedEvents)).toEqual(['parent', 'embedded-child']);
    expect(ids(result.locatableMapEvents)).toEqual(['embedded-child']);
  });

  it('does not expose a cached child outside the year scope', () => {
    const parent = event('parent');
    const futureChild = event('future', {
      parentId: parent.id,
      startYear: 248,
      effectiveEndYear: 248,
    });
    const result = buildMapVisibilityProjection([parent], baseQuery, {
      childrenByParentId: { [parent.id]: [futureChild] },
      scopeEventIds: new Set([parent.id]),
    });

    expect(ids(result.flattenedEvents)).toEqual(['parent']);
    expect(ids(result.locatableMapEvents)).toEqual(['parent']);
  });

  it('does not expose a cached child outside the category', () => {
    const parent = event('parent', { eventType: 'military' });
    const child = event('political-child', { parentId: parent.id, eventType: 'political' });
    const result = buildMapVisibilityProjection(
      [parent, child],
      { ...baseQuery, category: 'military' },
      { childrenByParentId: { [parent.id]: [child] } },
    );

    expect(ids(result.flattenedEvents)).toEqual(['parent']);
    expect(ids(result.locatableMapEvents)).toEqual(['parent']);
  });

  it('does not expose a cached child outside the search', () => {
    const parent = event('parent', { name: 'Điện Biên' });
    const child = event('other-child', { parentId: parent.id, name: 'Sự kiện khác' });
    const result = buildMapVisibilityProjection(
      [parent, child],
      { ...baseQuery, searchTerm: 'điện' },
      {
        childrenByParentId: { [parent.id]: [child] },
        searchCandidateIds: new Set([parent.id, child.id]),
      },
    );

    expect(ids(result.flattenedEvents)).toEqual(['parent']);
    expect(ids(result.locatableMapEvents)).toEqual(['parent']);
  });

  it('does not let expanded or selected collection children override the projection', () => {
    const outOfScopeChild = event('out-of-scope', {
      parentId: 'collection',
      startYear: 542,
      effectiveEndYear: 542,
    });
    const collection = event('collection', { children: [outOfScopeChild] });
    const result = buildMapVisibilityProjection([collection], baseQuery, {
      scopeEventIds: new Set([collection.id]),
    });

    expect(ids(result.flattenedEvents)).toEqual(['collection']);
    expect(ids(result.locatableMapEvents)).toEqual(['collection']);
  });
});
