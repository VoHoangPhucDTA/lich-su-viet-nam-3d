import { describe, expect, it } from 'vitest';
import {
  isSafeInternalLocation,
  resolveEventDetailBackTarget,
  resolveEventDetailErrorTarget,
  resolveMapReturnLocation,
} from '../utils/mapReturnLocation';

describe('EventDetailPage navigation contract', () => {
  it('prefers the exact map returnTo including its query string', () => {
    const returnTo = '/map?year=1954&event=chien-dich-dien-bien-phu-1954&q=Điện+Biên';
    expect(resolveMapReturnLocation({ returnTo, from: '/home' })).toBe(returnTo);
    expect(resolveEventDetailBackTarget({ returnTo, from: '/home' }, true)).toBe(returnTo);
  });

  it('preserves a safe internal legacy from location', () => {
    expect(resolveEventDetailBackTarget({ from: '/home' }, true)).toBe('/home');
    expect(resolveEventDetailBackTarget({ from: '/events' }, true)).toBe('/events');
  });

  it('uses history for a normal direct detail only when a previous entry exists', () => {
    expect(resolveEventDetailBackTarget(null, true)).toBe(-1);
    expect(resolveEventDetailBackTarget(null, false)).toBe('/home');
  });

  it('uses map/from for the error action, otherwise home without history traversal', () => {
    expect(resolveEventDetailErrorTarget({ returnTo: '/map?year=938' })).toBe('/map?year=938');
    expect(resolveEventDetailErrorTarget({ from: '/events' })).toBe('/events');
    expect(resolveEventDetailErrorTarget(null)).toBe('/home');
  });

  it('rejects external, scheme-relative and backslash navigation values', () => {
    for (const value of ['https://example.com', '//example.com/path', '/\\example.com']) {
      expect(isSafeInternalLocation(value)).toBe(false);
      expect(resolveEventDetailBackTarget({ from: value }, false)).toBe('/home');
      expect(resolveEventDetailErrorTarget({ from: value })).toBe('/home');
    }
    expect(resolveMapReturnLocation({ returnTo: 'https://example.com/map' })).toBeNull();
  });
});
