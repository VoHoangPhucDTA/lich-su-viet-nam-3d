import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventType, HistoricalEvent } from '../types/event';
import { buildMapFocusCameraFrame, focusPositionsForEvent } from '../utils/mapCameraFocus';
import MapPage from './MapPage';

interface SidebarBoundaryProps {
  events: HistoricalEvent[];
  selectedEvent: HistoricalEvent | null;
  onSelectEvent: (event: HistoricalEvent) => void;
  onSearchQueryChange: (query: string) => void;
  searchQuery: string;
  activeCategory: EventType | null;
  onActiveCategoryChange: (category: EventType | null) => void;
  selectedGrade: number | null;
  onGradeChange: (grade: number | null) => void;
  listItemCount: number;
  mappedEventCount: number;
}

interface MapBoundaryProps {
  events: HistoricalEvent[];
  selectedEvent: HistoricalEvent | null;
  terrainSession: { id: number } | null;
  onTerrainExitComplete: (sessionId: number) => void;
  onSelectEvent: (event: HistoricalEvent | null) => void;
  focusRequest: { requestId: number; event: HistoricalEvent; animated: boolean } | null;
}

interface EventPopupBoundaryProps {
  event: HistoricalEvent;
  detailStatus: 'idle' | 'loading' | 'ready' | 'error';
  parentEvent: HistoricalEvent | null;
  onClose: () => void;
  onNavigateToChild: (child: HistoricalEvent) => void;
  onNavigateToParent: () => void;
  onOpenTerrain: () => void;
  onViewDetails: () => void;
}

interface TimelineBoundaryProps {
  currentYear: number;
  onYearChange: (year: number) => void;
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
}));

function DetailLocationProbe() {
  const location = useLocation();
  const state = location.state as { returnTo?: string } | null;
  return (
    <div
      data-testid="detail-location"
      data-pathname={location.pathname}
      data-return-to={state?.returnTo ?? ''}
    />
  );
}

function MapLocationProbe() {
  const location = useLocation();
  return <div data-testid="map-location" data-search={location.search} />;
}

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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
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
    expect(runtime.sidebarProps).toMatchObject({ listItemCount: 2, mappedEventCount: 1 });
  });

  it('starts with no help overlay and keeps Guide and Legend mutually exclusive', async () => {
    await renderReady();
    expect(screen.queryByRole('heading', { name: 'Khám phá Lịch sử Việt Nam' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Chú giải bản đồ' })).toBeNull();

    act(() => screen.getByRole('button', { name: 'Chú giải' }).click());
    expect(screen.getByRole('heading', { name: 'Chú giải bản đồ' })).toBeInTheDocument();

    act(() => screen.getByRole('button', { name: 'Hướng dẫn' }).click());
    expect(screen.getByRole('heading', { name: 'Khám phá Lịch sử Việt Nam' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Chú giải bản đồ' })).toBeNull();

    act(() => screen.getByRole('button', { name: 'Hướng dẫn' }).click());
    expect(screen.queryByRole('heading', { name: 'Khám phá Lịch sử Việt Nam' })).toBeNull();
  });

  it('does not mutate the active overlay when selecting or closing an event', async () => {
    const selected = event('overlay-selection');
    runtime.getEventsByYear.mockResolvedValue([selected]);
    runtime.getEvent.mockResolvedValue(selected);
    await renderReady();

    act(() => screen.getByRole('button', { name: 'Hướng dẫn' }).click());
    await select(selected);
    expect(screen.getByRole('heading', { name: 'Khám phá Lịch sử Việt Nam' })).toBeInTheDocument();

    act(() => runtime.popupProps?.onClose());
    await waitFor(() => expect(runtime.mapProps?.selectedEvent).toBeNull());
    expect(screen.getByRole('heading', { name: 'Khám phá Lịch sử Việt Nam' })).toBeInTheDocument();
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

    await waitFor(() => expect(runtime.searchEvents).toHaveBeenCalledWith('target', null));
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
    expect(runtime.sidebarProps).toMatchObject({ listItemCount: 1, mappedEventCount: 1 });
  });

  it('changes Sidebar and CesiumMap with the same search predicate', async () => {
    const dienBien = event('dien-bien', { name: 'Chiến thắng Điện Biên Phủ' });
    const saHuynh = event('van-hoa-sa-huynh', { name: 'Văn hoá Sa Huỳnh' });
    runtime.getEventsByYear.mockResolvedValue([dienBien, saHuynh]);
    runtime.searchEvents.mockResolvedValue([dienBien, saHuynh]);
    await renderReady();

    act(() => runtime.sidebarProps?.onSearchQueryChange('điện'));

    await waitFor(() => expect(runtime.searchEvents).toHaveBeenCalledWith('điện', null));
    await waitFor(() => expect(sidebarIds()).toEqual(['dien-bien']));
    expect(mapIds()).toEqual(['dien-bien']);
    expect(runtime.sidebarProps).toMatchObject({ listItemCount: 1, mappedEventCount: 1 });
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

    act(() => runtime.sidebarProps?.onGradeChange(10));

    await waitFor(() => expect(runtime.getEventsByYear).toHaveBeenCalledWith(938, 10));
    await waitFor(() => expect(sidebarIds()).toEqual(['grade-10']));
    expect(mapIds()).toEqual(['grade-10']);
    expect(runtime.timelineProps?.currentYear).toBe(938);
  });

  it('reconciles grade timeline domain through current year, URL, and event request', async () => {
    const grade10Event = event('grade-10-1945', {
      startYear: 1945,
      effectiveEndYear: 1945,
    });
    runtime.getTimelineYears.mockImplementation(async (grade: number | null) =>
      grade === 10 ? [1945, 1975] : [938, 1010],
    );
    runtime.getEventsByYear.mockImplementation(async (year: number, grade: number | null) =>
      year === 1945 && grade === 10 ? [grade10Event] : [],
    );

    render(
      <MemoryRouter initialEntries={['/map?year=938']}>
        <Routes>
          <Route path="/map" element={<><MapPage /><MapLocationProbe /></>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(runtime.timelineProps?.currentYear).toBe(938));
    act(() => runtime.sidebarProps?.onGradeChange(10));

    await waitFor(() => expect(runtime.getTimelineYears).toHaveBeenCalledWith(10));
    await waitFor(() => expect(runtime.timelineProps?.currentYear).toBe(1945));
    await waitFor(() => expect(runtime.getEventsByYear).toHaveBeenCalledWith(1945, 10));

    await waitFor(() => {
      const query = new URLSearchParams(
        screen.getByTestId('map-location').getAttribute('data-search') ?? '',
      );
      expect(query.get('grade')).toBe('10');
      expect(query.get('year')).toBe('1945');
    });
    expect(runtime.getTimelineYears.mock.calls.filter(([grade]) => grade === 10)).toHaveLength(1);
    expect(runtime.getEventsByYear.mock.calls.filter(([, grade]) => grade === 10)).toEqual([
      [1945, 10],
    ]);
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
    expect(runtime.sidebarProps).toMatchObject({ listItemCount: 1, mappedEventCount: 1 });
  });

  it('deduplicates the same search event already present in the year result by id', async () => {
    const dienBien = event('dien-bien', { name: 'Chiến thắng Điện Biên Phủ' });
    runtime.getEventsByYear.mockResolvedValue([dienBien]);
    runtime.searchEvents.mockResolvedValue([{ ...dienBien }]);
    await renderReady();

    act(() => runtime.sidebarProps?.onSearchQueryChange('Điện Biên'));
    await waitFor(() => expect(sidebarIds()).toEqual(['dien-bien']));
    expect(mapIds()).toEqual(['dien-bien']);
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

  it('selects the summary before detail and children requests resolve', async () => {
    const summary = event('optimistic', { description: 'summary' });
    const detailRequest = deferred<HistoricalEvent | null>();
    const childrenRequest = deferred<HistoricalEvent[]>();
    runtime.getEventsByYear.mockResolvedValue([summary]);
    runtime.getEvent.mockReturnValue(detailRequest.promise);
    runtime.getChildren.mockReturnValue(childrenRequest.promise);
    await renderReady();

    act(() => runtime.sidebarProps?.onSelectEvent(summary));

    await waitFor(() => expect(runtime.popupProps?.event).toMatchObject({
      id: 'optimistic',
      description: 'summary',
    }));
    expect(runtime.popupProps?.detailStatus).toBe('loading');

    await act(async () => {
      detailRequest.resolve(event('optimistic', { description: 'hydrated' }));
      childrenRequest.resolve([event('child', { parentId: summary.id })]);
      await Promise.resolve();
    });

    await waitFor(() => expect(runtime.popupProps?.detailStatus).toBe('ready'));
    expect(runtime.popupProps?.event.description).toBe('hydrated');
    expect(runtime.popupProps?.event.children?.map((child) => child.id)).toEqual(['child']);
  });

  it('does not let a late A response overwrite a newer B selection', async () => {
    const eventA = event('event-a');
    const eventB = event('event-b');
    const detailA = deferred<HistoricalEvent | null>();
    const detailB = deferred<HistoricalEvent | null>();
    runtime.getEventsByYear.mockResolvedValue([eventA, eventB]);
    runtime.getEvent.mockImplementation((key: string) =>
      key === eventA.id ? detailA.promise : detailB.promise,
    );
    await renderReady();

    act(() => runtime.sidebarProps?.onSelectEvent(eventA));
    await waitFor(() => expect(runtime.popupProps?.event.id).toBe(eventA.id));
    act(() => runtime.sidebarProps?.onSelectEvent(eventB));
    await waitFor(() => expect(runtime.popupProps?.event.id).toBe(eventB.id));

    await act(async () => {
      detailB.resolve(event('event-b', { description: 'B hydrated' }));
      await Promise.resolve();
    });
    await waitFor(() => expect(runtime.popupProps?.event.description).toBe('B hydrated'));

    await act(async () => {
      detailA.resolve(event('event-a', { description: 'A late' }));
      await Promise.resolve();
    });
    expect(runtime.popupProps?.event).toMatchObject({ id: 'event-b', description: 'B hydrated' });
  });

  it('keeps the selected summary usable when detail hydration fails', async () => {
    const summary = event('detail-failure', { description: 'summary remains' });
    runtime.getEventsByYear.mockResolvedValue([summary]);
    runtime.getEvent.mockRejectedValue(new Error('offline'));
    await renderReady();

    act(() => runtime.sidebarProps?.onSelectEvent(summary));

    await waitFor(() => expect(runtime.popupProps?.detailStatus).toBe('error'));
    expect(runtime.popupProps?.event).toMatchObject({
      id: 'detail-failure',
      description: 'summary remains',
    });
  });

  it('preserves the full popup drill-down stack through two Back actions', async () => {
    const grandchild = event('grandchild', { parentId: 'child' });
    const child = event('child', { parentId: 'parent', children: [grandchild] });
    const parent = event('parent', { children: [child] });
    const byId = new Map([parent, child, grandchild].map((item) => [item.id, item]));
    runtime.getEventsByYear.mockResolvedValue([parent]);
    runtime.getEvent.mockImplementation(async (key: string) => byId.get(key) ?? null);
    await renderReady();

    act(() => runtime.sidebarProps?.onSelectEvent(parent));
    await waitFor(() => expect(runtime.popupProps?.event.id).toBe(parent.id));

    act(() => runtime.popupProps?.onNavigateToChild(child));
    await waitFor(() => expect(runtime.popupProps?.event.id).toBe(child.id));
    expect(runtime.popupProps?.parentEvent?.id).toBe(parent.id);

    act(() => runtime.popupProps?.onNavigateToChild(grandchild));
    await waitFor(() => expect(runtime.popupProps?.event.id).toBe(grandchild.id));
    expect(runtime.popupProps?.parentEvent?.id).toBe(child.id);

    act(() => runtime.popupProps?.onNavigateToParent());
    await waitFor(() => expect(runtime.popupProps?.event.id).toBe(child.id));
    expect(runtime.popupProps?.parentEvent?.id).toBe(parent.id);

    act(() => runtime.popupProps?.onNavigateToParent());
    await waitFor(() => expect(runtime.popupProps?.event.id).toBe(parent.id));
    expect(runtime.popupProps).not.toBeNull();
  });

  it('does not inherit popup drill-down history for a direct Sidebar selection', async () => {
    const child = event('child', { parentId: 'parent' });
    const parent = event('parent', { children: [child] });
    runtime.getEventsByYear.mockResolvedValue([parent]);
    runtime.getEvent.mockImplementation(async (key: string) => key === child.id ? child : parent);
    await renderReady();

    act(() => runtime.sidebarProps?.onSelectEvent(parent));
    await waitFor(() => expect(runtime.popupProps?.event.id).toBe(parent.id));
    act(() => runtime.popupProps?.onNavigateToChild(child));
    await waitFor(() => expect(runtime.popupProps?.parentEvent?.id).toBe(parent.id));

    act(() => runtime.sidebarProps?.onSelectEvent(child));
    await waitFor(() => expect(runtime.popupProps?.event.id).toBe(child.id));
    expect(runtime.popupProps?.parentEvent).toBeNull();
  });

  it('creates focus intent for Sidebar but preserves marker-click C1', async () => {
    const point = event('focus-point');
    runtime.getEventsByYear.mockResolvedValue([point]);
    await renderReady();

    act(() => runtime.mapProps?.onSelectEvent(point));
    await waitFor(() => expect(runtime.mapProps?.selectedEvent?.id).toBe(point.id));
    expect(runtime.mapProps?.focusRequest).toBeNull();

    act(() => runtime.sidebarProps?.onSelectEvent(point));
    await waitFor(() => expect(runtime.mapProps?.focusRequest?.event.id).toBe(point.id));
    expect(runtime.mapProps?.focusRequest?.animated).toBe(true);

    act(() => runtime.mapProps?.onSelectEvent(point));
    await waitFor(() => expect(runtime.mapProps?.focusRequest).toBeNull());
  });

  it('waits for hydrated markers before issuing a complete multi-point focus', async () => {
    const representativePoint = { lat: 21.417, lng: 103.043 };
    const markers = [
      { name: 'Him Lam', lat: 21.417, lng: 103.043 },
      { name: 'Độc Lập', lat: 21.458, lng: 103.002 },
      { name: 'A1', lat: 21.379, lng: 103.018 },
      { name: 'Mường Thanh', lat: 21.386, lng: 103.015 },
      { name: 'Bản Kéo', lat: 21.442, lng: 103.013 },
    ];
    const summary = event('chien-dich-dien-bien-phu-1954', {
      geoType: 'multi_point',
      coordinates: representativePoint,
      sourceMapData: undefined,
    });
    const detailRequest = deferred<HistoricalEvent | null>();
    runtime.getEventsByYear.mockResolvedValue([summary]);
    runtime.getEvent.mockReturnValue(detailRequest.promise);
    await renderReady();

    act(() => runtime.sidebarProps?.onSelectEvent(summary));

    await waitFor(() => expect(runtime.popupProps?.event.id).toBe(summary.id));
    expect(runtime.popupProps?.detailStatus).toBe('loading');
    expect(runtime.mapProps?.focusRequest).toBeNull();

    await act(async () => {
      detailRequest.resolve(event(summary.id, {
        geoType: 'multi_point',
        coordinates: representativePoint,
        sourceMapData: { geoType: 'multi_point', markers },
      }));
      await Promise.resolve();
    });

    await waitFor(() => expect(runtime.popupProps?.detailStatus).toBe('ready'));
    const focusedEvent = runtime.mapProps?.focusRequest?.event;
    expect(focusedEvent?.sourceMapData?.markers).toEqual(markers);
    expect(focusedEvent && focusPositionsForEvent(focusedEvent)).toHaveLength(markers.length);
    expect(focusedEvent && buildMapFocusCameraFrame(focusedEvent)?.positions).toHaveLength(
      markers.length,
    );
  });

  it('issues region focus only after detail hydration provides approved center and zoom', async () => {
    const summary = event('phap-tan-cong-da-nang-1858', {
      geoType: 'multi_polygon',
      coordinates: undefined,
      sourceMapData: undefined,
    });
    const detailRequest = deferred<HistoricalEvent | null>();
    runtime.getEventsByYear.mockResolvedValue([summary]);
    runtime.getEvent.mockReturnValue(detailRequest.promise);
    await renderReady();

    act(() => runtime.sidebarProps?.onSelectEvent(summary));
    await waitFor(() => expect(runtime.popupProps?.event.id).toBe(summary.id));
    expect(runtime.mapProps?.focusRequest).toBeNull();

    await act(async () => {
      detailRequest.resolve(event(summary.id, {
        geoType: 'multi_polygon',
        coordinates: undefined,
        sourceMapData: {
          geoType: 'multi_polygon',
          focusGeometry: {
            mode: 'bounds',
            center: { lat: 16.05, lng: 108.2 },
            zoom: 7,
          },
        },
      }));
      await Promise.resolve();
    });

    await waitFor(() => expect(runtime.mapProps?.focusRequest?.event.id).toBe(summary.id));
    expect(buildMapFocusCameraFrame(runtime.mapProps!.focusRequest!.event)).toMatchObject({
      kind: 'authoring-focus',
      positions: [{ lat: 16.05, lng: 108.2 }],
      range: 250_000,
    });
  });

  it('clears a stale point focus for no-location selection and Close', async () => {
    const point = event('focus-a');
    const noLocation = event('focus-b', {
      geoType: 'no_location',
      coordinates: undefined,
    });
    runtime.getEventsByYear.mockResolvedValue([point, noLocation]);
    runtime.getEvent.mockImplementation(async (key: string) =>
      key === noLocation.id ? noLocation : point,
    );
    await renderReady();

    act(() => runtime.sidebarProps?.onSelectEvent(point));
    await waitFor(() => expect(runtime.mapProps?.focusRequest?.event.id).toBe(point.id));

    act(() => runtime.sidebarProps?.onSelectEvent(noLocation));
    await waitFor(() => expect(runtime.mapProps?.selectedEvent?.id).toBe(noLocation.id));
    expect(runtime.mapProps?.focusRequest).toBeNull();

    act(() => runtime.popupProps?.onClose());
    await waitFor(() => expect(runtime.mapProps?.selectedEvent).toBeNull());
    expect(runtime.mapProps?.focusRequest).toBeNull();
  });

  it('discovers an out-of-year global result and moves the timeline when selected', async () => {
    const year40 = event('year-40');
    const dienBien = event('dien-bien-1954', {
      name: 'Chiến dịch Điện Biên Phủ',
      startYear: 1954,
      effectiveEndYear: 1954,
    });
    runtime.getTimelineYears.mockResolvedValue([40, 1954]);
    runtime.getEventsByYear.mockResolvedValue([year40]);
    runtime.searchEvents.mockResolvedValue([dienBien]);
    runtime.getEvent.mockResolvedValue(dienBien);
    await renderReady();

    act(() => runtime.sidebarProps?.onSearchQueryChange('Điện Biên'));
    await waitFor(() => expect(runtime.searchEvents).toHaveBeenCalledWith('điện biên', null));
    await waitFor(() => expect(sidebarIds()).toEqual(['dien-bien-1954']));

    act(() => runtime.sidebarProps?.onSelectEvent(dienBien));

    await waitFor(() => expect(runtime.timelineProps?.currentYear).toBe(1954));
    expect(runtime.mapProps?.selectedEvent?.id).toBe(dienBien.id);
    expect(runtime.mapProps?.focusRequest?.event.id).toBe(dienBien.id);
  });

  it('restores URL state through one requested-event pipeline without duplicate detail fetches', async () => {
    const restored = event('restored', {
      slug: 'restored-slug',
      startYear: 1954,
      effectiveEndYear: 1954,
      eventType: 'military',
    });
    runtime.getTimelineYears.mockResolvedValue([40, 1954]);
    runtime.getEventsByYear.mockResolvedValue([restored]);
    runtime.getEvent.mockResolvedValue(restored);

    render(
      <MemoryRouter initialEntries={['/map?year=1954&event=restored-slug&category=military&grade=12']}>
        <MapPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(runtime.popupProps?.event.id).toBe(restored.id));
    expect(runtime.getEvent).toHaveBeenCalledTimes(1);
    expect(runtime.sidebarProps).toMatchObject({ activeCategory: 'military' });
    expect(runtime.timelineProps?.currentYear).toBe(1954);
    expect(runtime.mapProps?.focusRequest).toMatchObject({
      event: { id: restored.id },
      animated: false,
    });
  });

  it('keeps an undated URL-restored detail pinned without inventing a year', async () => {
    const year40 = event('year-40');
    const undated = event('undated-url', {
      startYear: null,
      endYear: null,
      effectiveEndYear: null,
    });
    runtime.getEventsByYear.mockResolvedValue([year40]);
    runtime.getEvent.mockResolvedValue(undated);

    render(
      <MemoryRouter initialEntries={['/map?event=undated-url']}>
        <Routes>
          <Route path="/map" element={<><MapPage /><MapLocationProbe /></>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(runtime.popupProps?.event.id).toBe(undated.id));
    await waitFor(() => expect(sidebarIds()).toEqual([year40.id]));
    expect(mapIds()).toEqual([year40.id]);
    expect(screen.getByTestId('map-location')).toHaveAttribute(
      'data-search',
      '?event=undated-url',
    );

    act(() => runtime.popupProps?.onClose());
    await waitFor(() => expect(runtime.mapProps?.selectedEvent).toBeNull());
    expect(screen.getByTestId('map-location')).toHaveAttribute('data-search', '?year=40');
    expect(runtime.getEvent).toHaveBeenCalledTimes(1);
  });

  it('hydrates an undated pinned selection after q is cleared while detail is pending', async () => {
    const year40 = event('year-40');
    const undated = event('undated-search', {
      name: 'Sự kiện chưa định niên đại',
      description: 'summary description',
      startYear: null,
      endYear: null,
      effectiveEndYear: null,
    });
    const detailRequest = deferred<HistoricalEvent | null>();
    runtime.getEventsByYear.mockResolvedValue([year40]);
    runtime.searchEvents.mockResolvedValue([undated]);
    runtime.getEvent.mockReturnValue(detailRequest.promise);
    render(
      <MemoryRouter initialEntries={['/map']}>
        <Routes>
          <Route path="/map" element={<><MapPage /><MapLocationProbe /></>} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(runtime.getEventsByYear).toHaveBeenCalledWith(40, null));

    act(() => runtime.sidebarProps?.onSearchQueryChange('chưa định niên đại'));
    await waitFor(() => expect(sidebarIds()).toEqual([undated.id]));
    act(() => runtime.sidebarProps?.onSelectEvent(undated));
    await waitFor(() => expect(runtime.popupProps?.event.id).toBe(undated.id));
    expect(runtime.popupProps?.detailStatus).toBe('loading');

    act(() => runtime.sidebarProps?.onSearchQueryChange(''));
    await waitFor(() => expect(sidebarIds()).toEqual([year40.id]));
    expect(mapIds()).toEqual([year40.id]);
    expect(runtime.popupProps?.event.id).toBe(undated.id);
    expect(runtime.popupProps?.detailStatus).toBe('loading');

    await act(async () => {
      detailRequest.resolve(event(undated.id, {
        ...undated,
        description: 'hydrated description',
      }));
      await Promise.resolve();
    });

    await waitFor(() => expect(runtime.popupProps?.detailStatus).toBe('ready'));
    expect(runtime.popupProps?.event).toMatchObject({
      id: undated.id,
      description: 'hydrated description',
      startYear: null,
    });
    expect(runtime.sidebarProps?.searchQuery).toBe('');
    expect(runtime.timelineProps?.currentYear).toBe(40);

    act(() => runtime.popupProps?.onClose());
    await waitFor(() => expect(runtime.mapProps?.selectedEvent).toBeNull());
    expect(screen.getByTestId('map-location')).toHaveAttribute('data-search', '?year=40');
  });

  it('hydrates an undated pinned selection through a category scope change', async () => {
    const year40 = event('year-40');
    const undated = event('undated-category', {
      startYear: null,
      endYear: null,
      effectiveEndYear: null,
      eventType: 'political',
    });
    const detailRequest = deferred<HistoricalEvent | null>();
    runtime.getEventsByYear.mockResolvedValue([year40]);
    runtime.searchEvents.mockResolvedValue([undated]);
    runtime.getEvent.mockReturnValue(detailRequest.promise);
    await renderReady();

    act(() => runtime.sidebarProps?.onSearchQueryChange('undated'));
    await waitFor(() => expect(sidebarIds()).toEqual([undated.id]));
    act(() => runtime.sidebarProps?.onSelectEvent(undated));
    await waitFor(() => expect(runtime.popupProps?.detailStatus).toBe('loading'));

    act(() => runtime.sidebarProps?.onActiveCategoryChange('cultural'));
    await waitFor(() => expect(sidebarIds()).toEqual([]));
    expect(runtime.popupProps?.event.id).toBe(undated.id);

    await act(async () => {
      detailRequest.resolve(event(undated.id, {
        ...undated,
        description: 'category-safe hydration',
      }));
      await Promise.resolve();
    });

    await waitFor(() => expect(runtime.popupProps?.detailStatus).toBe('ready'));
    expect(runtime.popupProps?.event.description).toBe('category-safe hydration');
  });

  it('consumes a legacy requested event once so Close cannot resurrect it', async () => {
    const legacyA = event('legacy-a');
    runtime.getEventsByYear.mockResolvedValue([legacyA]);
    runtime.getEvent.mockResolvedValue(legacyA);

    render(
      <MemoryRouter initialEntries={[{ pathname: '/map', state: { event: legacyA.id } }]}>
        <Routes>
          <Route path="/map" element={<><MapPage /><MapLocationProbe /></>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(runtime.popupProps?.event.id).toBe(legacyA.id));
    await waitFor(() => expect(screen.getByTestId('map-location')).toHaveAttribute(
      'data-search',
      '?year=40&event=legacy-a',
    ));

    act(() => runtime.popupProps?.onClose());
    await waitFor(() => expect(runtime.mapProps?.selectedEvent).toBeNull());
    expect(screen.getByTestId('map-location')).toHaveAttribute('data-search', '?year=40');
    expect(runtime.getEvent.mock.calls.filter(([key]) => key === legacyA.id)).toHaveLength(1);
  });

  it('never resurrects legacy A after selecting and closing B', async () => {
    const legacyA = event('legacy-a');
    const eventB = event('event-b');
    runtime.getEventsByYear.mockResolvedValue([legacyA, eventB]);
    runtime.getEvent.mockImplementation(async (key: string) =>
      key === eventB.id ? eventB : legacyA,
    );

    render(
      <MemoryRouter initialEntries={[{ pathname: '/map', state: { event: legacyA.id } }]}>
        <MapPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(runtime.popupProps?.event.id).toBe(legacyA.id));
    await waitFor(() => expect(sidebarIds()).toEqual([legacyA.id, eventB.id]));
    act(() => runtime.sidebarProps?.onSelectEvent(eventB));
    await waitFor(() => expect(runtime.popupProps?.event.id).toBe(eventB.id));
    act(() => runtime.popupProps?.onClose());
    await waitFor(() => expect(runtime.mapProps?.selectedEvent).toBeNull());
    expect(runtime.getEvent.mock.calls.filter(([key]) => key === legacyA.id)).toHaveLength(1);
  });

  it('passes the full map query as detail returnTo', async () => {
    const point = event('return-point');
    runtime.getEventsByYear.mockResolvedValue([point]);
    render(
      <MemoryRouter initialEntries={['/map?year=40&category=political']}>
        <Routes>
          <Route path="/map" element={<MapPage />} />
          <Route path="/events/:slug" element={<DetailLocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(runtime.sidebarProps).not.toBeNull());
    await waitFor(() => expect(sidebarIds()).toEqual(['return-point']));

    act(() => runtime.sidebarProps?.onSelectEvent(point));
    await waitFor(() => expect(runtime.popupProps?.event.id).toBe(point.id));
    act(() => runtime.popupProps?.onViewDetails());

    const detailLocation = await screen.findByTestId('detail-location');
    expect(detailLocation).toHaveAttribute('data-pathname', '/events/return-point');
    expect(detailLocation).toHaveAttribute(
      'data-return-to',
      '/map?year=40&event=return-point&category=political',
    );
  });
});
