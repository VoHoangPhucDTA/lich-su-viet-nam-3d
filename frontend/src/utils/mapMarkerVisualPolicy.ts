import type { HistoricalEvent } from '../types/event';

export type MarkerRole = 'atomic' | 'collection';
export type MarkerInteractionState = 'default' | 'selected' | 'hovered' | 'dimmed';

export interface MapMarkerVisualInput {
  role: MarkerRole;
  state: MarkerInteractionState;
  categoryColor: string;
}

export interface MapMarkerVisualStyle {
  role: MarkerRole;
  state: MarkerInteractionState;
  categoryColor: string;
  pixelSize: number;
  fillAlpha: number;
  outlineColor: string;
  outlineAlpha: number;
  outlineWidth: number;
  labelVisible: boolean;
  labelBackgroundAlpha: number;
}

const ROLE_DEFAULTS: Record<MarkerRole, Pick<MapMarkerVisualStyle, 'pixelSize' | 'fillAlpha' | 'outlineWidth'>> = {
  atomic: { pixelSize: 14, fillAlpha: 1, outlineWidth: 2 },
  collection: { pixelSize: 17, fillAlpha: 0.16, outlineWidth: 4 },
};

export function markerRoleForEvent(event: Pick<HistoricalEvent, 'eventLevel'>): MarkerRole {
  return event.eventLevel === 'collection' ? 'collection' : 'atomic';
}

export function markerInteractionState(
  eventId: string,
  selectedEventId: string | null,
  hoveredEventId: string | null,
): MarkerInteractionState {
  if (eventId === selectedEventId) return 'selected';
  if (eventId === hoveredEventId) return 'hovered';
  return selectedEventId ? 'dimmed' : 'default';
}

/** Resolve a requested selection to an event that actually has a marker entity. */
export function effectiveSelectedMarkerId(
  requestedSelectedEventId: string | null,
  markerEventIds: Pick<ReadonlySet<string>, 'has'>,
): string | null {
  return requestedSelectedEventId && markerEventIds.has(requestedSelectedEventId)
    ? requestedSelectedEventId
    : null;
}

export function resolveMapMarkerVisualStyle(
  input: MapMarkerVisualInput,
): MapMarkerVisualStyle {
  const base = ROLE_DEFAULTS[input.role];
  const isCollection = input.role === 'collection';

  switch (input.state) {
    case 'selected':
      return {
        ...input,
        pixelSize: base.pixelSize + 6,
        fillAlpha: isCollection ? 0.2 : 1,
        outlineColor: '#ffffff',
        outlineAlpha: 1,
        outlineWidth: 5,
        labelVisible: true,
        labelBackgroundAlpha: 0.78,
      };
    case 'hovered':
      return {
        ...input,
        pixelSize: base.pixelSize + 3,
        fillAlpha: isCollection ? 0.18 : 1,
        outlineColor: '#ffffff',
        outlineAlpha: 0.95,
        outlineWidth: Math.max(base.outlineWidth, 3),
        labelVisible: true,
        labelBackgroundAlpha: 0.72,
      };
    case 'dimmed':
      return {
        ...input,
        pixelSize: base.pixelSize,
        fillAlpha: isCollection ? 0.12 : 0.48,
        outlineColor: isCollection ? input.categoryColor : '#ffffff',
        outlineAlpha: 0.48,
        outlineWidth: base.outlineWidth,
        labelVisible: false,
        labelBackgroundAlpha: 0,
      };
    default:
      return {
        ...input,
        pixelSize: base.pixelSize,
        fillAlpha: base.fillAlpha,
        outlineColor: isCollection ? input.categoryColor : '#ffffff',
        outlineAlpha: 1,
        outlineWidth: base.outlineWidth,
        labelVisible: false,
        labelBackgroundAlpha: 0,
      };
  }
}
