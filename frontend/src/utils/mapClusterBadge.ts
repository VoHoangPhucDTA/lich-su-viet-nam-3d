export const MAP_CLUSTER_BADGE_BACKGROUND = '#6f3b2f';

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

export function isMapClusterPick(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length > 1;
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
