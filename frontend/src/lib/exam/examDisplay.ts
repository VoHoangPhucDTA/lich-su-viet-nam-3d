import type { ExamManifestEntry } from '@/types/exam';

type ExamDisplaySource = Partial<Pick<ExamManifestEntry, 'title' | 'year' | 'sourceDetail' | 'examId'>> & {
  /** Compatibility input for legacy callers; manifests no longer publish it. */
  fileName?: string;
};

const KNOWN_PLACES: Array<[RegExp, string]> = [
  [/\bbac ninh\b/g, 'Bắc Ninh'],
  [/\bnghe an\b/g, 'Nghệ An'],
  [/\bhai phong\b/g, 'Hải Phòng'],
  [/\bhung yen\b/g, 'Hưng Yên'],
  [/\bquang tri\b/g, 'Quảng Trị'],
  [/\bda nang\b/g, 'Đà Nẵng'],
  [/\bdak lak\b/g, 'Đắk Lắk'],
  [/\bca mau\b/g, 'Cà Mau'],
  [/\bninh binh\b/g, 'Ninh Bình'],
  [/\bcao bang\b/g, 'Cao Bằng'],
  [/\bdong nai\b/g, 'Đồng Nai'],
  [/\bphu tho\b/g, 'Phú Thọ'],
  [/\bquang ninh\b/g, 'Quảng Ninh'],
  [/\bthanh hoa\b/g, 'Thanh Hóa'],
  [/\btp hue\b/g, 'TP Huế'],
  [/\bha long\b/g, 'Hạ Long'],
  [/\bphan boi chau\b/g, 'Phan Bội Châu'],
  [/\btran phu\b/g, 'Trần Phú'],
];

function safeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function compactSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function stripKnownSource(value: string): string {
  return value
    .replace(/\.json$/i, '')
    .replace(/^Đề thi Lịch sử\s*[–-]\s*/i, '')
    .replace(/^De thi Lich su\s*[–-]\s*/i, '')
    .replace(/thuvienhoclieu(?:\.com|-com)?/gi, '')
    .replace(/^[\s._-]+/, '');
}

function dedupeRepeatedYears(value: string): string {
  const seen = new Set<string>();
  return compactSpaces(
    value.replace(/\b20\d{2}\b/g, (year) => {
      if (seen.has(year)) return '';
      seen.add(year);
      return year;
    })
  );
}

function polishExamWords(value: string): string {
  let title = ` ${value.toLowerCase()} `;

  title = title
    .replace(/\bde\b/g, 'Đề')
    .replace(/\bkscl\b/g, 'KSCL')
    .replace(/\bthi thu\b/g, 'thi thử')
    .replace(/\bthi tn thpt\b/g, 'thi TN THPT')
    .replace(/\btn thpt\b/g, 'TN THPT')
    .replace(/\bthpt\b/g, 'THPT')
    .replace(/\btn\b/g, 'TN')
    .replace(/\bmon\b/g, 'môn')
    .replace(/\blich su\b/g, 'Lịch sử')
    .replace(/\bcum truong\b/g, 'Cụm trường')
    .replace(/\blien truong\b/g, 'Liên trường')
    .replace(/\bso gd\b/g, 'Sở GD')
    .replace(/\bchuyen mon\b/g, 'Chuyên môn')
    .replace(/\bchuyen\b/g, 'Chuyên')
    .replace(/\blan\s+(\d+)\b/g, 'Lần $1');

  for (const [pattern, label] of KNOWN_PLACES) {
    title = title.replace(pattern, label);
  }

  title = compactSpaces(title)
    .replace(/\s+(Cụm trường|Liên trường|Sở GD|Chuyên)\b/g, ' - $1')
    .replace(/\s+(Lần\s+\d+)\b/g, ' - $1')
    .replace(/\s+-\s+/g, ' - ')
    .replace(/(?:\s+-){2,}/g, ' -');

  return dedupeRepeatedYears(title);
}

export function getExamDisplayYear(entry: ExamDisplaySource): number {
  const haystack = [entry.title, entry.fileName, entry.examId, entry.sourceDetail]
    .map(safeText)
    .join(' ');
  const years = Array.from(haystack.matchAll(/\b20\d{2}\b/g), (match) => Number(match[0]))
    .filter((year) => Number.isFinite(year));

  if (years.length > 0) return Math.max(...years);
  return typeof entry.year === 'number' && Number.isFinite(entry.year) ? entry.year : 0;
}

export function formatExamTitle(entry: ExamDisplaySource): string {
  const raw = safeText(entry.sourceDetail) || safeText(entry.title) || safeText(entry.fileName) || safeText(entry.examId);
  if (!raw) return 'Đề thi Lịch sử';

  const normalized = compactSpaces(stripKnownSource(raw).replace(/[-_]+/g, ' '));
  const polished = polishExamWords(normalized);
  return polished || safeText(entry.title) || 'Đề thi Lịch sử';
}

export function getExamSourceLabel(entry: ExamDisplaySource): string | null {
  const raw = [entry.sourceDetail, entry.title, entry.fileName, entry.examId].map(safeText).join(' ');
  if (/thuvienhoclieu(?:\.com|-com)/i.test(raw)) return 'thuvienhoclieu.com';
  return null;
}
