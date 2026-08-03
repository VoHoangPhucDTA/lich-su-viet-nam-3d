import { describe, expect, it } from 'vitest';
import {
  getTerrainInsightBySlug,
  TERRAIN_INSIGHTS,
  terrainCtaLabel,
  type TerrainInsight,
} from './terrainInsights';

function normalizeVietnameseForAssertion(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function insightFixture(overrides: Partial<TerrainInsight> = {}): TerrainInsight {
  return {
    canonicalSlug: 'fixture-event',
    relevance: 'contextual',
    headline: 'Fixture headline',
    explanation: 'Fixture explanation',
    observePoints: ['Quan sát fixture'],
    sourceRef: 'Fixture source',
    ...overrides,
  };
}

function productionStringFields(insight: TerrainInsight): Record<string, string> {
  return {
    canonicalSlug: insight.canonicalSlug,
    headline: insight.headline,
    explanation: insight.explanation,
    observePoints: insight.observePoints.join(' '),
    ctaLabel: insight.ctaLabel ?? '',
    sourceRef: insight.sourceRef,
    scopeNote: insight.scopeNote ?? '',
  };
}

describe('terrain insights production data', () => {
  it('contains exactly the two Goal 3-R entries', () => {
    expect(TERRAIN_INSIGHTS).toHaveLength(2);
    expect(TERRAIN_INSIGHTS.map((insight) => insight.canonicalSlug)).toEqual([
      'chien-dich-dien-bien-phu-1954',
      'khang-chien-chong-quan-nguyen-1287-1288',
    ]);
  });

  it('requires complete content, explicit CTA, source, and two to four observation prompts', () => {
    for (const insight of TERRAIN_INSIGHTS) {
      expect(insight.headline.trim(), `${insight.canonicalSlug}.headline`).not.toBe('');
      expect(insight.explanation.trim(), `${insight.canonicalSlug}.explanation`).not.toBe('');
      expect(insight.ctaLabel?.trim(), `${insight.canonicalSlug}.ctaLabel`).not.toBe('');
      expect(insight.sourceRef.trim(), `${insight.canonicalSlug}.sourceRef`).not.toBe('');
      expect(insight.observePoints.length, `${insight.canonicalSlug}.observePoints`).toBeGreaterThanOrEqual(2);
      expect(insight.observePoints.length, `${insight.canonicalSlug}.observePoints`).toBeLessThanOrEqual(4);
    }
  });

  it('resolves both production insights by exact canonical slug', () => {
    expect(getTerrainInsightBySlug('chien-dich-dien-bien-phu-1954')?.canonicalSlug)
      .toBe('chien-dich-dien-bien-phu-1954');
    expect(getTerrainInsightBySlug('khang-chien-chong-quan-nguyen-1287-1288')?.canonicalSlug)
      .toBe('khang-chien-chong-quan-nguyen-1287-1288');
  });

  it('fails closed for titles, unrelated IDs, fuzzy slugs, and missing slugs', () => {
    for (const value of [
      'Chiến dịch Điện Biên Phủ 1954',
      'event-row-000123',
      'chien-dich-dien-bien-phu-1954-near-match',
      '',
      '   ',
      undefined,
      null,
    ]) {
      expect(getTerrainInsightBySlug(value)).toBeNull();
    }
  });

  it('normalizes surrounding whitespace without fuzzy matching', () => {
    expect(getTerrainInsightBySlug('  chien-dich-dien-bien-phu-1954  ')?.canonicalSlug)
      .toBe('chien-dich-dien-bien-phu-1954');
  });

  it('uses explicit CTA before relevance fallbacks', () => {
    expect(terrainCtaLabel(insightFixture({
      relevance: 'decisive',
      ctaLabel: 'CTA được chỉ định',
    }))).toBe('CTA được chỉ định');
  });

  it('uses the decisive fallback for a synthetic fixture', () => {
    expect(terrainCtaLabel(insightFixture({
      relevance: 'decisive',
      ctaLabel: undefined,
    }))).toBe('Vì sao địa hình quan trọng với sự kiện này?');
  });

  it('uses contextual and generic fallbacks', () => {
    expect(terrainCtaLabel(insightFixture({ ctaLabel: undefined }))).toBe('Xem bối cảnh địa hình 3D');
    expect(terrainCtaLabel(null)).toBe('Khám phá địa hình khu vực');
  });

  it('keeps the Điện Biên Phủ textbook layer and project scope note separate', () => {
    const insight = getTerrainInsightBySlug('chien-dich-dien-bien-phu-1954');
    expect(insight?.headline).toBe('Chiến dịch Điện Biên Phủ diễn ra qua ba đợt');
    expect(insight?.explanation).toContain('ba đợt');
    expect(insight?.explanation).toContain('13-3-1954');
    expect(insight?.explanation).toContain('7-5-1954');
    expect(insight?.scopeNote).toContain('dữ liệu bản đồ của đề tài');
    expect(insight?.scopeNote).toContain('không biểu diễn thứ tự từng đợt');
  });

  it('keeps the 1287–1288 sourced claim, scope note, and custom CTA explicit', () => {
    const insight = getTerrainInsightBySlug('khang-chien-chong-quan-nguyen-1287-1288');
    for (const value of ['Vân Đồn', 'Vạn Kiếp', 'Bạch Đằng', '1287–1288']) {
      expect(insight?.headline).toContain(value);
    }
    expect(insight?.explanation).toContain('không được SGK nêu riêng');
    expect(insight?.explanation).toContain('1287–1288');
    expect(insight?.scopeNote).toContain('chưa có tọa độ Vạn Kiếp');
    expect(insight?.ctaLabel).toBe('Xem không gian các trận đánh 1287–1288');
  });

  it('keeps tool guidance out of the sourced textbook layer', () => {
    const forbiddenInSourcedText = [
      'quan sat',
      'doi chieu',
      'uoc luong',
      'mo hinh 3d giup',
      'danh sach dia diem',
      'du lieu ban do',
      'khong bieu dien thu tu',
    ];

    for (const insight of TERRAIN_INSIGHTS) {
      const sourcedText = normalizeVietnameseForAssertion(
        `${insight.headline} ${insight.explanation} ${insight.sourceRef}`,
      );
      const observationText = normalizeVietnameseForAssertion(
        `${insight.observePoints.join(' ')} ${insight.scopeNote ?? ''}`,
      );
      expect(observationText.length).toBeGreaterThan(0);
      for (const phrase of forbiddenInSourcedText) {
        expect(sourcedText, `${insight.canonicalSlug} sourced layer contains: ${phrase}`).not.toContain(phrase);
      }
    }
  });

  it('keeps the 1287 explanation explicitly limited to general context', () => {
    const insight = getTerrainInsightBySlug('khang-chien-chong-quan-nguyen-1287-1288');
    expect(normalizeVietnameseForAssertion(insight?.explanation ?? '')).toContain(
      normalizeVietnameseForAssertion('không được SGK nêu riêng cho cuộc kháng chiến năm 1287–1288'),
    );
  });

  it('uses the exact reviewed 1287 source reference scope', () => {
    const insight = getTerrainInsightBySlug('khang-chien-chong-quan-nguyen-1287-1288');
    const source = insight?.sourceRef ?? '';
    for (const required of ['Lịch sử 11', 'Kết nối tri thức', 'Bài 7', 'tr. 46', 'tr. 49']) {
      expect(source, `sourceRef missing: ${required}`).toContain(required);
    }
    expect(source).not.toContain('54–61');
  });

  it('keeps the target-data note out of all observation prompts', () => {
    for (const insight of TERRAIN_INSIGHTS) {
      for (const [index, point] of insight.observePoints.entries()) {
        expect(
          normalizeVietnameseForAssertion(point),
          `${insight.canonicalSlug}.observePoints[${index}] contains target-data provenance`,
        ).not.toContain('du lieu ban do cua de tai');
      }
    }
  });

  it('rejects forbidden claims after Vietnamese diacritics are removed', () => {
    const forbidden = [
      'ki binh',
      'ky binh',
      'dia hinh quyet dinh',
      'yeu to quyet dinh',
      'nui deo hiem tro',
      'song ngoi chang chit',
      'theo trinh tu cac dot tien cong',
      'tuyen hanh quan',
      'huong tien quan',
      'duong hanh quan',
      'thanh da nam 1287',
      'thanh da nam 1288',
    ];

    for (const insight of TERRAIN_INSIGHTS) {
      for (const [field, value] of Object.entries(productionStringFields(insight))) {
        const normalized = normalizeVietnameseForAssertion(value);
        for (const phrase of forbidden) {
          expect(
            normalized,
            `${insight.canonicalSlug}.${field} contains forbidden phrase: ${phrase}`,
          ).not.toContain(phrase);
        }
      }
    }
  });

  it('does not activate preferred targets or decisive relevance in production', () => {
    for (const insight of TERRAIN_INSIGHTS) {
      expect(insight.preferredInitialTarget, `${insight.canonicalSlug}.preferredInitialTarget`).toBeUndefined();
      expect(insight.relevance, `${insight.canonicalSlug}.relevance`).not.toBe('decisive');
    }
  });
});
