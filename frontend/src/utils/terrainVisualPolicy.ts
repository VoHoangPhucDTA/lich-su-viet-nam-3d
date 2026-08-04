export type TerrainVisualViewKind = 'overview' | 'region' | 'point';
export type TerrainVisualLayer = 'administrative' | 'terrain-region';
export type TerrainVisualRelation = 'selected' | 'related' | 'unrelated';

export interface TerrainVisualPolicyInput {
  terrainActive: boolean;
  viewKind: TerrainVisualViewKind;
  layer: TerrainVisualLayer;
  selectedRelation: TerrainVisualRelation;
}

export interface TerrainVisualPolicy {
  preserveOriginal: boolean;
  fill?: boolean;
  outline?: boolean;
  show?: boolean;
  fillAlpha?: number;
  outlineAlpha?: number;
  /** Cesium may clamp polygon outline width on terrain; color/alpha remains primary. */
  outlineWidth?: number;
}

const PRESERVE_ORIGINAL: TerrainVisualPolicy = Object.freeze({ preserveOriginal: true });

const administrativeOverviewAlpha = (relation: TerrainVisualRelation) => {
  if (relation === 'selected') return 0.1;
  if (relation === 'related') return 0.08;
  return 0;
};

const administrativeRegionAlpha = (relation: TerrainVisualRelation) => {
  if (relation === 'selected') return 0.04;
  if (relation === 'related') return 0.03;
  return 0;
};

export function resolveTerrainVisualPolicy({
  terrainActive,
  viewKind,
  layer,
  selectedRelation,
}: TerrainVisualPolicyInput): TerrainVisualPolicy {
  if (!terrainActive) return PRESERVE_ORIGINAL;

  if (layer === 'administrative') {
    if (viewKind === 'point') {
      return {
        preserveOriginal: false,
        fill: false,
        outline: true,
        outlineAlpha: selectedRelation === 'selected' ? 0.38 : 0.22,
        outlineWidth: 1,
      };
    }

    return {
      preserveOriginal: false,
      fill: true,
      outline: true,
      fillAlpha: viewKind === 'overview'
        ? administrativeOverviewAlpha(selectedRelation)
        : administrativeRegionAlpha(selectedRelation),
      outlineAlpha: selectedRelation === 'selected' ? 0.72 : 0.38,
      outlineWidth: selectedRelation === 'selected' ? 2 : 1,
    };
  }

  if (viewKind === 'point') {
    return {
      preserveOriginal: false,
      show: false,
    };
  }

  if (viewKind === 'overview') {
    return {
      preserveOriginal: false,
      show: true,
      fill: true,
      outline: true,
      fillAlpha: selectedRelation === 'selected' ? 0.08 : 0.07,
      outlineAlpha: 0.78,
      outlineWidth: 2,
    };
  }

  return {
    preserveOriginal: false,
    show: true,
    fill: true,
    outline: true,
    fillAlpha: selectedRelation === 'selected' ? 0.06 : 0.02,
    outlineAlpha: selectedRelation === 'selected' ? 0.9 : 0.3,
    outlineWidth: selectedRelation === 'selected' ? 2 : 1,
  };
}

export interface TerrainPolygonProperties {
  fill?: unknown;
  outline?: unknown;
  material?: unknown;
  outlineColor?: unknown;
  outlineWidth?: unknown;
  show?: unknown;
}

export interface TerrainPolygonPropertySnapshot {
  sessionId: number;
  fill: unknown;
  outline: unknown;
  material: unknown;
  outlineColor: unknown;
  outlineWidth: unknown;
  show: unknown;
}

export function snapshotTerrainPolygonProperties(
  sessionId: number,
  polygon: TerrainPolygonProperties | null | undefined,
  existing?: TerrainPolygonPropertySnapshot | null,
): TerrainPolygonPropertySnapshot | null {
  if (!polygon) return null;
  if (existing?.sessionId === sessionId) return existing;
  return {
    sessionId,
    fill: polygon.fill,
    outline: polygon.outline,
    material: polygon.material,
    outlineColor: polygon.outlineColor,
    outlineWidth: polygon.outlineWidth,
    show: polygon.show,
  };
}

export function restoreTerrainPolygonProperties(
  currentSessionId: number,
  polygon: TerrainPolygonProperties | null | undefined,
  snapshot: TerrainPolygonPropertySnapshot | null | undefined,
): boolean {
  if (!polygon || !snapshot || snapshot.sessionId !== currentSessionId) return false;
  polygon.fill = snapshot.fill;
  polygon.outline = snapshot.outline;
  polygon.material = snapshot.material;
  polygon.outlineColor = snapshot.outlineColor;
  polygon.outlineWidth = snapshot.outlineWidth;
  polygon.show = snapshot.show;
  return true;
}
