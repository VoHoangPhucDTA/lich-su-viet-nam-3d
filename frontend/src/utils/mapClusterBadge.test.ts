import { describe, expect, it } from 'vitest';
import {
  MAP_CLUSTER_BADGE_BACKGROUND,
  createMapClusterBadgeDataUrl,
  formatMapClusterCount,
  isMapClusterPick,
  resolveMapClusterVisual,
} from './mapClusterBadge';

function decodedSvg(count: number): string {
  return decodeURIComponent(createMapClusterBadgeDataUrl(count).split(',')[1]);
}

describe('map cluster badge', () => {
  it.each([[2, '2'], [35, '35'], [100, '99+'], [248, '99+']])(
    'formats count %s as %s',
    (count, expected) => expect(formatMapClusterCount(count)).toBe(expected),
  );

  it('creates a valid SVG data URL with a neutral non-category badge color', () => {
    const url = createMapClusterBadgeDataUrl(35);
    expect(url).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(decodedSvg(35)).toContain('>35<');
    expect(MAP_CLUSTER_BADGE_BACKGROUND).toBe('#6f3b2f');
    expect(MAP_CLUSTER_BADGE_BACKGROUND).not.toBe('#9f1d2d');
    expect(MAP_CLUSTER_BADGE_BACKGROUND).not.toBe('#2f5d8a');
    expect(MAP_CLUSTER_BADGE_BACKGROUND).not.toBe('#c29b4b');
    expect(MAP_CLUSTER_BADGE_BACKGROUND).not.toBe('#2f7a57');
  });

  it('turns on the billboard and turns off the naked label', () => {
    expect(resolveMapClusterVisual(2)).toMatchObject({
      billboard: { show: true, width: 42, height: 42 },
      label: { show: false },
    });
  });

  it('recognizes a multi-entity cluster pick without changing event selection callbacks', () => {
    expect(isMapClusterPick([{}, {}])).toBe(true);
    expect(isMapClusterPick([{}])).toBe(false);
    expect(isMapClusterPick({})).toBe(false);
  });
});
