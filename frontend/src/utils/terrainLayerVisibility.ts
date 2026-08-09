import type { TerrainSessionCommand } from '../types/terrain';

export function ordinaryMapLayersVisibleForTerrainMode(
  session: TerrainSessionCommand | null,
): boolean {
  return session?.mode !== 'entering' && session?.mode !== 'active';
}
