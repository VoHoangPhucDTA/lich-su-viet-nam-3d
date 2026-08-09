import {
  Cartesian2,
  Cartesian3,
  Color,
  CustomDataSource,
  HeightReference,
  LabelStyle,
  PropertyBag,
  VerticalOrigin,
} from 'cesium';
import type { TerrainTarget } from './terrainTargets';

export function createTerrainPointDataSource(
  sessionId: number,
  targets: readonly TerrainTarget[],
): CustomDataSource {
  const dataSource = new CustomDataSource(`terrain-point-session-${sessionId}`);
  dataSource.clustering.enabled = false;
  for (const target of targets) {
    if (target.kind !== 'point') continue;
    dataSource.entities.add({
      id: target.id,
      name: target.label,
      position: Cartesian3.fromDegrees(target.position.lng, target.position.lat),
      properties: new PropertyBag({
        terrainSessionId: sessionId,
        terrainTargetId: target.id,
        terrainTargetKind: 'point',
      }),
      point: {
        pixelSize: 15,
        color: Color.fromCssColorString('#9f1d2d'),
        outlineColor: Color.WHITE,
        outlineWidth: 3,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: target.label,
        font: '700 14px Inter, sans-serif',
        fillColor: Color.WHITE,
        outlineColor: Color.fromCssColorString('#0c0a09'),
        outlineWidth: 4,
        style: LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: VerticalOrigin.BOTTOM,
        pixelOffset: new Cartesian2(0, -24),
        heightReference: HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
  }
  return dataSource;
}
