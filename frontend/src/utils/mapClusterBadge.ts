import { Entity } from 'cesium';

export const MAP_CLUSTER_BADGE_BACKGROUND = '#6f3b2f';
export const MAP_CLUSTER_PICK_KIND = 'map-cluster' as const;

export interface MapClusterPickPayload {
  kind: typeof MAP_CLUSTER_PICK_KIND;
  entities: readonly Entity[];
}

export interface MapClusterPickPrimitive {
  id: unknown;
}

export interface MapClusterPickPrimitives {
  billboard?: MapClusterPickPrimitive | null;
  label?: MapClusterPickPrimitive | null;
  point?: MapClusterPickPrimitive | null;
}

export interface MapClusterVisualPolicy {
  countText: string;
  image: string;
  billboard: {
    show: true;
    width: number;
    height: number;
    disableDepthTestDistance: number;
  };
  label: {
    show: false;
  };
}

export function formatMapClusterCount(count: number): string {
  return count >= 100 ? '99+' : String(Math.max(1, Math.floor(count)));
}

export function createMapClusterPickPayload(entities: readonly Entity[]): MapClusterPickPayload {
  return {
    kind: MAP_CLUSTER_PICK_KIND,
    entities: [...entities],
  };
}

export function isMapClusterPickPayload(value: unknown): value is MapClusterPickPayload {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<MapClusterPickPayload>;
  return candidate.kind === MAP_CLUSTER_PICK_KIND
    && Array.isArray(candidate.entities)
    && candidate.entities.length > 1
    && candidate.entities.every((entity) => entity instanceof Entity);
}

export function clusterEntitiesFromPick(value: unknown): Entity[] | null {
  if (isMapClusterPickPayload(value)) return [...value.entities];
  if (
    Array.isArray(value)
    && value.length > 1
    && value.every((entity) => entity instanceof Entity)
  ) return [...value];
  return null;
}

export function isMapClusterPick(value: unknown): boolean {
  return clusterEntitiesFromPick(value) !== null;
}

export function attachMapClusterPickPayload(
  entities: readonly Entity[],
  primitives: MapClusterPickPrimitives,
): MapClusterPickPayload {
  const payload = createMapClusterPickPayload(entities);
  if (primitives.billboard) primitives.billboard.id = payload;
  if (primitives.label) primitives.label.id = payload;
  if (primitives.point) primitives.point.id = payload;
  return payload;
}

export type OrdinaryMapPickResult = 'event' | 'cluster' | 'empty' | 'ignored';

export function handleOrdinaryMapPick<TEvent>(
  picked: unknown,
  handlers: {
    resolveEvent: (entity: Entity) => TEvent | undefined;
    selectEvent: (event: TEvent | null) => void;
    focusCluster: (entities: Entity[]) => void;
  },
): OrdinaryMapPickResult {
  const pickedId = picked && typeof picked === 'object'
    ? (picked as { id?: unknown }).id
    : undefined;
  if (pickedId instanceof Entity) {
    const event = handlers.resolveEvent(pickedId);
    if (event) {
      handlers.selectEvent(event);
      return 'event';
    }
  }
  const clusterEntities = clusterEntitiesFromPick(pickedId);
  if (clusterEntities) {
    handlers.focusCluster(clusterEntities);
    return 'cluster';
  }
  if (!picked || pickedId == null) {
    handlers.selectEvent(null);
    return 'empty';
  }
  return 'ignored';
}

export function createMapClusterBadgeDataUrl(count: number): string {
  const countText = formatMapClusterCount(count);
  const fontSize = countText.length > 2 ? 12 : 14;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="42" height="42" viewBox="0 0 42 42"><circle cx="21" cy="21" r="18" fill="${MAP_CLUSTER_BADGE_BACKGROUND}" stroke="#fff" stroke-width="3"/><circle cx="21" cy="21" r="14" fill="none" stroke="rgba(255,255,255,.25)"/><text x="21" y="21" dy=".35em" text-anchor="middle" fill="#fff" font-family="Inter,Arial,sans-serif" font-size="${fontSize}" font-weight="700">${countText}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function resolveMapClusterVisual(count: number): MapClusterVisualPolicy {
  return {
    countText: formatMapClusterCount(count),
    image: createMapClusterBadgeDataUrl(count),
    billboard: {
      show: true,
      width: 42,
      height: 42,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: { show: false },
  };
}
