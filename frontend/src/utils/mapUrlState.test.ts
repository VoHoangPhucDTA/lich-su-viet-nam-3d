import { describe, expect, it } from 'vitest';
import { parseExactYearInput, parseMapUrlState, serializeMapUrlState } from './mapUrlState';

describe('map URL state', () => {
  it('parses year, event slug, search, category and grade', () => {
    expect(parseMapUrlState(
      '?year=1954&event=chien-dich-dien-bien-phu-1954&q=%C4%90i%E1%BB%87n+Bi%C3%AAn&category=military&grade=12',
    )).toEqual({
      year: 1954,
      event: 'chien-dich-dien-bien-phu-1954',
      query: 'Điện Biên',
      category: 'military',
      grade: 12,
    });
  });

  it('omits default values while keeping an explicit exploration year', () => {
    expect(serializeMapUrlState({
      year: 40,
      event: '',
      query: '',
      category: null,
      grade: null,
    })).toBe('?year=40');
  });

  it('uses the event detail key as a string and rejects invalid filters', () => {
    expect(parseMapUrlState('?year=nope&event=slug-value&category=all&grade=10.5')).toEqual({
      year: null,
      event: 'slug-value',
      query: '',
      category: null,
      grade: null,
    });
  });

  it.each(['9', '13', '999', '10.5', 'text', ''])(
    'rejects unsupported URL grade %j',
    (grade) => {
      expect(parseMapUrlState(`?grade=${grade}`).grade).toBeNull();
    },
  );

  it.each(['10', '11', '12'])('accepts supported URL grade %s', (grade) => {
    expect(parseMapUrlState(`?grade=${grade}`).grade).toBe(Number(grade));
  });

  it('does not serialize an unsupported grade', () => {
    expect(serializeMapUrlState({
      year: null,
      event: '',
      query: '',
      category: null,
      grade: 999,
    })).toBe('');
  });

  it.each([
    ['-938', -938],
    ['0', 0],
    ['1945', 1945],
    ['2026', 2026],
    ['  -938  ', -938],
  ])('parses exact signed year input %j', (value, expected) => {
    expect(parseExactYearInput(value)).toBe(expected);
  });

  it.each(['', '12.5', '1e3', 'year', '9007199254740992'])('rejects unsafe or non-integer exact year input %j', (value) => {
    expect(parseExactYearInput(value)).toBeNull();
  });

  it.each(['-938', '0', '1945', '2026'])('round-trips exact URL year %s', (year) => {
    expect(parseMapUrlState(serializeMapUrlState({
      year: Number(year),
      event: '',
      query: '',
      category: null,
      grade: null,
    })).year).toBe(Number(year));
  });
});
