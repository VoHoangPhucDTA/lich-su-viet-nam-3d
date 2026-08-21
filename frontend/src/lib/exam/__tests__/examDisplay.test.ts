import { describe, expect, it } from 'vitest';
import { formatExamTitle } from '../examDisplay';

const MANIFEST_TITLE_SAMPLES = [
  'thuvienhoclieu.com-De-KSCL-thi-TN-THPT-2026-mon-LICH-SU-Cum-truong-Bac-Ninh-2026-Lan-1',
  'thuvienhoclieu.com-De-thi-thu-TN-2026-mon-Lich-su-Chuyen-Phan-Boi-Chau-Nghe-An-Lan-1',
  'Đề thi thử 2025 Lịch sử Hải Phòng 2025',
];

describe('formatExamTitle', () => {
  it.each([
    ['domain', { title: 'thuvienhoclieu.com-De-thi-thu-TN-THPT-2026-mon-Lich-su-Bac-Ninh-Lan-1' }, /thuvienhoclieu/i],
    ['json', { fileName: 'de-thi-thu-tn-thpt-2026-lich-su-nghe-an.json' }, /\.json/i],
    ['hyphen slug', { examId: 'de-thi-thu-tn-thpt-2026-lich-su-hai-phong' }, /-/],
    ['duplicate year', { title: 'De thi TN THPT 2026 Lich su Bac Ninh 2026' }, /2026.*2026/],
  ])('removes %s artifacts', (_name, input, artifact) => expect(formatExamTitle(input)).not.toMatch(artifact));

  it('does not damage an already readable title', () => {
    expect(formatExamTitle({ title: 'Đề KSCL thi TN THPT 2026 môn Lịch sử - Cụm trường Bắc Ninh - Lần 1' })).toContain('KSCL');
  });

  it('does not mutate the supplied exam id', () => {
    const input = { examId: 'de-thi-thu-2026-lich-su' };
    formatExamTitle(input);
    expect(input.examId).toBe('de-thi-thu-2026-lich-su');
  });

  it('keeps all manifest titles free of known raw artifacts', () => {
    const suspicious = MANIFEST_TITLE_SAMPLES.map((title) => formatExamTitle({ title })).filter((formattedTitle) => (
      /thuvienhoclieu|\.json|--|Lần\s+(\d+)\s+\1|\b(20\d{2})\s+\2\b/i.test(formattedTitle)
    ));
    expect(suspicious).toEqual([]);
  });
});
