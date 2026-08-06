import { describe, expect, it } from 'vitest';
import type { GeoType } from '../../types/event';
import { isCanonicalGeoType } from '../../types/event';
import { rawToHistoricalEvent } from '../../data/eventAdapter';
import type { RawEventJson } from '../../data/eventRegistry';

describe('canonical GeoType contract', () => {
  it('recognizes exactly the six canonical values', () => {
    expect(isCanonicalGeoType('point')).toBe(true);
    expect(isCanonicalGeoType('multi_point')).toBe(true);
    expect(isCanonicalGeoType('multi_polygon')).toBe(true);
    expect(isCanonicalGeoType('mixed')).toBe(true);
    expect(isCanonicalGeoType('nationwide')).toBe(true);
    expect(isCanonicalGeoType('no_location')).toBe(true);
  });

  it('rejects legacy values', () => {
    expect(isCanonicalGeoType('single_point')).toBe(false);
    expect(isCanonicalGeoType('multi_region')).toBe(false);
    expect(isCanonicalGeoType('polygon')).toBe(false);
    expect(isCanonicalGeoType('unknown')).toBe(false);
    expect(isCanonicalGeoType(undefined)).toBe(false);
  });

  it('type assertion is a proper GeoType guard', () => {
    const value: unknown = 'multi_polygon';
    if (isCanonicalGeoType(value)) {
      const geoType: GeoType = value;
      expect(geoType).toBe('multi_polygon');
    }
  });
});

describe('legacy fixture adapter (old fixtures only)', () => {
  const baseRaw = (mapData: unknown): RawEventJson => ({
    id: 'fixture-1',
    slug: 'fixture-1',
    titles: { primary: 'Fixture event' },
    chronology: { start: { year: 938 }, displayDate: '938' },
    classification: { eventType: 'military' },
    summary: { cardSummary: 'summary' },
    mapData,
  } as RawEventJson);

  it('maps legacy single_point to canonical point', () => {
    const event = rawToHistoricalEvent(
      baseRaw({ geoType: 'single_point', marker: { lat: 20.5, lng: 106.5 } })
    );
    expect(event.geoType).toBe('point');
    expect(event.coordinates).toEqual({ lat: 20.5, lng: 106.5 });
  });

  it('maps legacy multi_region to canonical multi_polygon', () => {
    const event = rawToHistoricalEvent(
      baseRaw({ geoType: 'multi_region', provinceNames: ['Quảng Ninh'] })
    );
    expect(event.geoType).toBe('multi_polygon');
  });

  it('passes canonical values through unchanged', () => {
    const event = rawToHistoricalEvent(
      baseRaw({ geoType: 'multi_point', markers: [
        { lat: 20.5, lng: 106.5 },
        { lat: 21.0, lng: 107.0 },
      ] })
    );
    expect(event.geoType).toBe('multi_point');
  });

  it('does not derive coordinates from province centroid or focusGeometry', () => {
    const event = rawToHistoricalEvent(
      baseRaw({
        geoType: 'point',
        focusGeometry: { center: { lat: 21.0, lng: 105.8 } },
      })
    );
    expect(event.coordinates).toBeUndefined();
  });
});
