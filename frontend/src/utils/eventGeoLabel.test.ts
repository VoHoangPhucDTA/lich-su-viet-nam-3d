import { describe, expect, it } from 'vitest';
import { eventGeoTypeLabel } from './eventGeoLabel';

describe('eventGeoTypeLabel', () => {
  it.each([
    [['Quảng Nam'], 'Một vùng'],
    [['Quảng Bình', 'Bình Thuận'], 'Nhiều vùng'],
    [[' Quảng Nam ', 'quảng   nam', '', '   '], 'Một vùng'],
    [[], 'Vùng'],
  ])('labels multi_polygon from unique non-empty province names %#', (provinceNames, label) => {
    expect(eventGeoTypeLabel('multi_polygon', provinceNames)).toBe(label);
  });

  it('keeps non-region geometry labels unchanged', () => {
    expect(eventGeoTypeLabel('point', ['Quảng Nam'])).toBe('Một điểm');
    expect(eventGeoTypeLabel('multi_point', [])).toBe('Nhiều điểm');
  });
});
