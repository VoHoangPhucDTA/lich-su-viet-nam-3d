import { act, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventType, HistoricalEvent } from '../types/event';
import MapPage from './MapPage';

interface SidebarBoundaryProps {
  events: HistoricalEvent[];
  selectedEvent: HistoricalEvent | null;
  onSelectEvent: (event: HistoricalEvent) => void;
  onSearchQueryChange: (query: string) => void;
  activeCategory: EventType | null;
  onActiveCategoryChange: (category: EventType | null) => void;
  listItemCount: number;
  markerCount: number;
}

interface MapBoundaryProps {
  events: HistoricalEvent[];
  selectedEvent: HistoricalEvent | null;
  terrainSession: { id: number } | null;
  onTerrainExitComplete: (sessionId: number) => void;
}

interface EventPopupBoundaryProps {
  onOpenTerrain: () => void;
}

interface TimelineBoundaryProps {
  currentYear: number;
  onYearChange: (year: number) => void;
  onGradeChange: (grade: number | null) => void;
}

const runtime = vi.hoisted(() => ({
  sidebarProps: null as SidebarBoundaryProps | null,
  mapProps: null as MapBoundaryProps | null,
  popupProps: null as EventPopupBoundaryProps | null,
  timelineProps: null as TimelineBoundaryProps | null,
  getEventsByYear: vi.fn(),
  searchEvents: vi.fn(),
  getChildren: vi.fn(),
  getEvent: vi.fn(),
  getTimelineYears: vi.fn(),
  recordEventView: vi.fn(),
  setCenterContent: vi.fn(),
}));

vi.mock('../components/Sidebar', () => ({
  default: (props: SidebarBoundaryProps) => {
    runtime.sidebarProps = props;
    return null;
  },
}));

vi.mock('../components/CesiumMap', () => ({
  default: (props: MapBoundaryProps) => {
    runtime.mapProps = props;
    return null;
  },
}));

vi.mock('../components/Timeline', () => ({
  default: (props: TimelineBoundaryProps) => {
    runtime.timelineProps = props;
    return null;
  },
}));

vi.mock('../components/EventPopup', () => ({
  default: (props: EventPopupBoundaryProps) => {
    runtime.popupProps = props;
    return null;
  },
}));
vi.mock('../components/terrain/TerrainExplorationToolbar', () => ({ default: () => null }));
vi.mock('../components/layout/useHeader', () => ({
  useHeader: () => ({ setCenterContent: runtime.setCenterContent }),
}));
vi.mock('../services/eventApi', () => ({
  getEventsByYearFromBackend: runtime.getEventsByYear,
  searchEventsFromBackend: runtime.searchEvents,
  getChildrenFromBackend: runtime.getChildren,
  getHistoricalEventFromBackend: runtime.getEvent,
  getTimelineYearsFromBackend: runtime.getTimelineYears,
  recordEventView: runtime.recordEventView,
}));

function event(
  id: string,
  overrides: Partial<HistoricalEvent> = {},
): HistoricalEvent {
  return {
    id,
    slug: id,
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

function flatten(events: readonly HistoricalEvent[]): HistoricalEvent[] {
  return events.flatMap((item) => [item, ...flatten(item.children ?? [])]);
}

function sidebarIds(): string[] {
  return flatten(runtime.sidebarProps?.events ?? []).map((item) => item.id);
}

function mapIds(): string[] {
  return (runtime.mapProps?.events ?? []).map((item) => item.id);
}

async function renderReady() {
  render(
    <MemoryRouter>
      <MapPage />
    </MemoryRouter>,
  );
  await waitFor(() => expect(runtime.mapProps).not.toBeNull());
  await waitFor(() => expect(runtime.getEventsByYear).toHaveBeenCalledWith(40, null));
}

async function select(eventToSelect: HistoricalEvent) {
  await act(async () => {
    runtime.sidebarProps?.onSelectEvent(eventToSelect);
  });
  await waitFor(() => expect(runtime.mapProps?.selectedEvent?.id).toBe(eventToSelect.id));
}

describe('MapPage shared visibility boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtime.sidebarProps = null;
    runtime.mapProps = null;
    runtime.popupProps = null;
    runtime.timelineProps = null;
    runtime.getEventsByYear.mockResolvedValue([]);
    runtime.searchEvents.mockResolvedValue([]);
    runtime.getChildren.mockResolvedValue([]);
    runtime.getEvent.mockImplementation(async (id: string) => event(id));
    runtime.getTimelineYears.mockResolvedValue([40, 938]);
    runtime.recordEventView.mockResolvedValue(undefined);
  });

  it('feeds Sidebar and CesiumMap from one projection', async () => {
    const point = event('point');
    const noLocation = event('no-location', {
      geoType: 'no_location',
      coordinates: undefined,
    });
    runtime.getEventsByYear.mockResolvedValue([point, noLocation]);

    await renderReady();
    await waitFor(() => expect(sidebarIds()).toEqual(['point', 'no-location']));
    expect(mapIds()).toEqual(['point']);
    expect(runtime.sidebarProps).toMatchObject({ listItemCount: 2, markerCount: 1 });
  });

  it('projects an embedded child returned only inside its API parent', async () => {
    const embeddedChild = event('embedded-child', {
      name: 'Embedded target event',
      description: 'Embedded event fixture',
      eventType: 'military',
      parentId: 'parent',
    });
    const parent = event('parent', {
      eventType: 'political',
      geoType: 'no_location',
      coordinates: undefined,
      children: [embeddedChild],
    });
    runtime.getEventsByYear.mockResolvedValue([parent]);
    runtime.searchEvents.mockResolvedValue([embeddedChild]);
    await renderReady();

    act(() => runtime.sidebarProps?.onActiveCategoryChange('military'));
    act(() => runtime.sidebarProps?.onSearchQueryChange('target'));

    await waitFor(() => expect(runtime.searchEvents).toHaveBeenCalledWith('target'));
    await waitFor(() => expect(sidebarIds()).toEqual(['parent', 'embedded-child']));
    expect(mapIds()).toEqual(['embedded-child']);
  });

  it('changes CesiumMap IDs immediately when category changes', async () => {
    const military = event('military', { eventType: 'military' });
    const cultural = event('cultural', { eventType: 'cultural' });
    runtime.getEventsByYear.mockResolvedValue([military, cultural]);
    await renderReady();

    act(() => runtime.sidebarProps?.onActiveCategoryChange('cultural'));

    await waitFor(() => expect(sidebarIds()).toEqual(['cultural']));
    expect(mapIds()).toEqual(['cultural']);
    expect(runtime.sidebarProps).toMatchObject({ listItemCount: 1, markerCount: 1 });
  });

  it('changes Sidebar and CesiumMap with the same search predicate', async () => {
    const dienBien = event('dien-bien', { name: 'Chiến thắng Điện Biên Phủ' });
    const saHuynh = event('van-hoa-sa-huynh', { name: 'Văn hoá Sa Huỳnh' });
    runtime.getEventsByYear.mockResolvedValue([dienBien, saHuynh]);
    runtime.searchEvents.mockResolvedValue([dienBien, saHuynh]);
    await renderReady();

    act(() => runtime.sidebarProps?.onSearchQueryChange('điện'));

    await waitFor(() => expect(runtime.searchEvents).toHaveBeenCalledWith('điện'));
    await waitFor(() => expect(sidebarIds()).toEqual(['dien-bien']));
    expect(mapIds()).toEqual(['dien-bien']);
    expect(runtime.sidebarProps).toMatchObject({ listItemCount: 1, markerCount: 1 });
  });

  it('changes both boundaries when grade changes', async () => {
    const grade10 = event('grade-10', { startYear: 938, effectiveEndYear: 938 });
    const grade11 = event('grade-11');
    runtime.getEventsByYear.mockImplementation(async (_year: number, grade: number | null) =>
      grade === 10 ? [grade10] : grade === 11 ? [grade11] : [grade10, grade11],
    );
    runtime.getTimelineYears.mockImplementation(async (grade: number | null) =>
      grade === 10 ? [938, 1010] : [40, 938],
    );
    await renderReady();

    act(() => runtime.timelineProps?.onGradeChange(10));

    await waitFor(() => expect(runtime.getEventsByYear).toHaveBeenCalledWith(938, 10));
    await waitFor(() => expect(sidebarIds()).toEqual(['grade-10']));
    expect(mapIds()).toEqual(['grade-10']);
    expect(runtime.timelineProps?.currentYear).toBe(938);
  });

  it('does not request a map year until the backend timeline model is ready', async () => {
    let resolveYears: ((years: number[]) => void) | undefined;
    runtime.getTimelineYears.mockReturnValue(
      new Promise<number[]>((resolve) => {
        resolveYears = resolve;
      }),
    );

    render(
      <MemoryRouter>
        <MapPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(runtime.getTimelineYears).toHaveBeenCalledWith(null));
    expect(runtime.getEventsByYear).not.toHaveBeenCalled();

    await act(async () => resolveYears?.([938, 1010]));
    await waitFor(() => expect(runtime.getEventsByYear).toHaveBeenCalledWith(938, null));
    expect(runtime.timelineProps?.currentYear).toBe(938);
  });

  it('changes both boundaries when timeline year changes', async () => {
    const year40 = event('year-40');
    const year938 = event('year-938', {
      startYear: 938,
      effectiveEndYear: 938,
    });
    runtime.getEventsByYear.mockImplementation(async (year: number) =>
      year === 938 ? [year938] : [year40],
    );
    await renderReady();

    act(() => runtime.timelineProps?.onYearChange(938));

    await waitFor(() => expect(runtime.getEventsByYear).toHaveBeenCalledWith(938, null));
    await waitFor(() => expect(sidebarIds()).toEqual(['year-938']));
    expect(mapIds()).toEqual(['year-938']);
    expect(runtime.sidebarProps).toMatchObject({ listItemCount: 1, markerCount: 1 });
  });

  it('resolves a year with no event through the backend-derived timeline model', async () => {
    const year938 = event('year-938', {
      startYear: 938,
      effectiveEndYear: 938,
    });
    runtime.getEventsByYear.mockImplementation(async (year: number) =>
      year === 938 ? [year938] : [],
    );
    await renderReady();

    act(() => runtime.timelineProps?.onYearChange(500));

    await waitFor(() => expect(runtime.getEventsByYear).toHaveBeenCalledWith(938, null));
    await waitFor(() => expect(sidebarIds()).toEqual(['year-938']));
    expect(runtime.timelineProps?.currentYear).toBe(938);
  });

  it('preserves event IDs and event-level roles at the Cesium boundary', async () => {
    const collection = event('collection-role', { eventLevel: 'collection' });
    const atomic = event('atomic-role', { eventLevel: 'atomic' });
    runtime.getEventsByYear.mockResolvedValue([collection, atomic]);

    await renderReady();
    await waitFor(() => expect(mapIds()).toEqual(['collection-role', 'atomic-role']));

    expect(runtime.mapProps?.events.map(({ id, eventLevel }) => ({ id, eventLevel }))).toEqual([
      { id: 'collection-role', eventLevel: 'collection' },
      { id: 'atomic-role', eventLevel: 'atomic' },
    ]);
  });

  it('clears selection when the selected event leaves the projection', async () => {
    const military = event('military', { eventType: 'military' });
    runtime.getEventsByYear.mockResolvedValue([military]);
    runtime.getEvent.mockResolvedValue(military);
    await renderReady();
    await select(military);

    act(() => runtime.sidebarProps?.onActiveCategoryChange('cultural'));

    await waitFor(() => expect(runtime.mapProps?.selectedEvent).toBeNull());
    expect(sidebarIds()).toEqual([]);
    expect(mapIds()).toEqual([]);
  });

  it('keeps selection when the selected event remains in the projection', async () => {
    const military = event('military', { eventType: 'military' });
    runtime.getEventsByYear.mockResolvedValue([military]);
    runtime.getEvent.mockResolvedValue(military);
    await renderReady();
    await select(military);

    act(() => runtime.sidebarProps?.onActiveCategoryChange('military'));

    await waitFor(() => expect(mapIds()).toEqual(['military']));
    expect(runtime.mapProps?.selectedEvent?.id).toBe('military');
  });

  it('does not let a stale terrain-exit callback clear a newly valid selection', async () => {
    const military = event('military', {
      eventType: 'military',
      sourceMapData: {
        geoType: 'point',
        marker: { lat: 16, lng: 106 },
      },
    });
    runtime.getEventsByYear.mockResolvedValue([military]);
    runtime.getEvent.mockResolvedValue(military);
    await renderReady();
    await select(military);

    act(() => runtime.popupProps?.onOpenTerrain());
    await waitFor(() => expect(runtime.mapProps?.terrainSession).not.toBeNull());
    const sessionId = runtime.mapProps?.terrainSession?.id;
    expect(sessionId).toBeTypeOf('number');

    act(() => runtime.sidebarProps?.onActiveCategoryChange('cultural'));
    await waitFor(() => expect(mapIds()).toEqual([]));
    expect(runtime.mapProps?.selectedEvent?.id).toBe('military');

    act(() => runtime.sidebarProps?.onActiveCategoryChange('military'));
    await waitFor(() => expect(mapIds()).toEqual(['military']));

    await act(async () => {
      runtime.mapProps?.onTerrainExitComplete(sessionId as number);
      await Promise.resolve();
    });

    expect(runtime.mapProps?.selectedEvent?.id).toBe('military');
  });

  it('does not pass a cached child outside scope to CesiumMap', async () => {
    const parent = event('collection', { childCount: 1 });
    const futureChild = event('future-child', {
      parentId: parent.id,
      startYear: 248,
      effectiveEndYear: 248,
    });
    runtime.getEventsByYear.mockResolvedValue([parent]);
    runtime.getEvent.mockResolvedValue(parent);
    runtime.getChildren.mockResolvedValue([futureChild]);
    await renderReady();

    await select(parent);

    await waitFor(() => expect(runtime.getChildren).toHaveBeenCalledWith(parent.id));
    expect(sidebarIds()).toEqual(['collection']);
    expect(mapIds()).toEqual(['collection']);
  });

  it('never replaces the projected map set with raw selected-collection children', async () => {
    const parent = event('collection', { childCount: 2 });
    const inScope = event('in-scope', { parentId: parent.id });
    const outOfScope = event('out-of-scope', {
      parentId: parent.id,
      startYear: 542,
      effectiveEndYear: 542,
    });
    runtime.getEventsByYear.mockResolvedValue([parent, inScope]);
    runtime.getEvent.mockResolvedValue(parent);
    runtime.getChildren.mockResolvedValue([inScope, outOfScope]);
    await renderReady();

    await select(parent);

    await waitFor(() => expect(sidebarIds()).toEqual(['collection', 'in-scope']));
    expect(new Set(mapIds())).toEqual(new Set(['collection', 'in-scope']));
    expect(mapIds()).not.toContain('out-of-scope');
  });
});
