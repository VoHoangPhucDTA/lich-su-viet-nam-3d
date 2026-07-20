import { describe, expect, it } from 'vitest';
import {
  buildInspectionResult,
  formatHeight,
  formatLatitude,
  formatLongitude,
  inspectionErrorMessage,
  isInspectionFailure,
  isLatestInspection,
  normalizeLatitude,
  normalizeLongitude,
} from './terrainInspection';

describe('normalizeLongitude', () => {
  it('keeps in-range values unchanged', () => {
    expect(normalizeLongitude(108.655)).toBeCloseTo(108.655, 6);
    expect(normalizeLongitude(-180)).toBe(180);
    expect(normalizeLongitude(180)).toBe(180);
  });

  it('wraps values outside [-180, 180] into that range', () => {
    expect(normalizeLongitude(190)).toBeCloseTo(-170, 6);
    expect(normalizeLongitude(360)).toBeCloseTo(0, 6);
    expect(normalizeLongitude(-190)).toBeCloseTo(170, 6);
  });

  it('returns 0 for non-finite input', () => {
    expect(normalizeLongitude(Number.NaN)).toBe(0);
    expect(normalizeLongitude(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('normalizeLatitude', () => {
  it('clamps values outside [-90, 90]', () => {
    expect(normalizeLatitude(95)).toBe(90);
    expect(normalizeLatitude(-120)).toBe(-90);
  });

  it('returns 0 for non-finite input', () => {
    expect(normalizeLatitude(Number.NaN)).toBe(0);
  });
});

describe('formatLatitude / formatLongitude', () => {
  it('formats Hanoi latitude and longitude with cardinal direction', () => {
    expect(formatLatitude(21.0285)).toBe('21.0285° N');
    expect(formatLongitude(105.8542)).toBe('105.8542° E');
  });

  it('uses south and west for negative values', () => {
    expect(formatLatitude(-34.6)).toBe('34.6000° S');
    expect(formatLongitude(-58.4)).toBe('58.4000° W');
  });

  it('handles values just outside the canonical range without crashing', () => {
    // 91 deg clamps to 90 deg (north pole) so its display remains N.
    expect(formatLatitude(91)).toBe('90.0000° N');
    expect(formatLongitude(190)).toMatch(/W/);
  });
});

describe('formatHeight', () => {
  it('renders meters with a single decimal', () => {
    expect(formatHeight(42)).toBe('42.0 m');
    expect(formatHeight(1234.567)).toBe('1234.6 m');
  });

  it('renders “—” when height is missing or non-finite', () => {
    expect(formatHeight(null)).toBe('—');
    expect(formatHeight(undefined)).toBe('—');
    expect(formatHeight(Number.NaN)).toBe('—');
  });
});

describe('inspectionErrorMessage / isInspectionFailure', () => {
  it('returns null for available status', () => {
    expect(inspectionErrorMessage('available')).toBeNull();
    expect(isInspectionFailure('available')).toBe(false);
  });

  it('returns a friendly localized message for unavailable and error', () => {
    expect(inspectionErrorMessage('unavailable')).toMatch(/Không thể xác định vị trí/);
    expect(inspectionErrorMessage('error')).toMatch(/Không thể tải độ cao/);
    expect(isInspectionFailure('unavailable')).toBe(true);
    expect(isInspectionFailure('error')).toBe(true);
  });

  it('returns an advisory message (not error) for ellipsoid_only', () => {
    expect(inspectionErrorMessage('ellipsoid_only')).toMatch(/ellipsoid/);
    expect(isInspectionFailure('ellipsoid_only')).toBe(false);
  });
});

describe('isLatestInspection', () => {
  it('accepts strictly greater ids', () => {
    expect(isLatestInspection(5, 4)).toBe(true);
  });

  it('rejects equal or lower ids', () => {
    expect(isLatestInspection(4, 5)).toBe(false);
    expect(isLatestInspection(4, 4)).toBe(false);
  });

  it('rejects non-finite ids', () => {
    expect(isLatestInspection(Number.NaN, 1)).toBe(false);
    expect(isLatestInspection(2, Number.NaN)).toBe(false);
  });
});

describe('buildInspectionResult', () => {
  it('normalizes lat/lng and preserves height + status', () => {
    const result = buildInspectionResult(190, 95, 42, 'available');
    expect(result.latitude).toBe(90);
    expect(result.longitude).toBeCloseTo(-170, 6);
    expect(result.heightMeters).toBe(42);
    expect(result.heightStatus).toBe('available');
  });

  it('keeps null height when status indicates a fallback', () => {
    const result = buildInspectionResult(108.6, 15.2, null, 'ellipsoid_only');
    expect(result.heightMeters).toBeNull();
    expect(result.heightStatus).toBe('ellipsoid_only');
  });
});
