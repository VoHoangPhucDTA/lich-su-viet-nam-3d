import { GEO_TYPE_LABELS, type GeoType } from '../types/event';

function uniqueRegionNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names = new Map<string, string>();
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const displayName = item.trim().replace(/\s+/gu, ' ');
    if (!displayName) continue;
    const key = displayName.toLocaleLowerCase('vi-VN');
    if (!names.has(key)) names.set(key, displayName);
  }
  return [...names.values()];
}

export function eventGeoTypeLabel(
  geoType: GeoType,
  provinceNames?: unknown,
): string {
  if (geoType !== 'multi_polygon') return GEO_TYPE_LABELS[geoType];
  const regionCount = uniqueRegionNames(provinceNames).length;
  if (regionCount === 1) return 'Một vùng';
  if (regionCount > 1) return 'Nhiều vùng';
  return 'Vùng';
}
