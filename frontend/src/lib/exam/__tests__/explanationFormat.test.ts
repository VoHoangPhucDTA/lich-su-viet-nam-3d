import { describe, expect, it } from 'vitest';
import { formatExamExplanation } from '../explanationFormat';

describe('formatExamExplanation', () => {
  it('separates the answer intro and bullet details', () => {
    const input = 'Câu 17. Đáp án D Một thành tựu nổi bật. • B là thành tựu khác. • C là thành tựu xã hội. • A không đúng.';

    expect(formatExamExplanation(input)).toBe(
      'Câu 17. Đáp án D\nMột thành tựu nổi bật.\n• B là thành tựu khác.\n• C là thành tựu xã hội.\n• A không đúng.',
    );
  });

  it('preserves meaningful line breaks from imported data', () => {
    const input = 'Câu 17. Đáp án D\r\nMột thành tựu nổi bật.\r\n• B không đúng.';

    expect(formatExamExplanation(input)).toBe('Câu 17. Đáp án D\nMột thành tựu nổi bật.\n• B không đúng.');
  });

  it('separates true-false sections and their labeled details', () => {
    const input = 'a) Nhận định thứ nhất. Đáp án: Đúng Giải thích: Nội dung thứ nhất. b) Nhận định thứ hai.';

    expect(formatExamExplanation(input)).toBe(
      'a) Nhận định thứ nhất.\nĐáp án: Đúng\nGiải thích: Nội dung thứ nhất.\nb) Nhận định thứ hai.',
    );
  });
});
