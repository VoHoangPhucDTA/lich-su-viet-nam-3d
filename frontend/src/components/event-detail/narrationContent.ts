import type { MockEventDetail } from '../../data/mockEventDetails';

/**
 * Build a documentary-style narration text from event data.
 *
 * Follows the planned narration flow:
 *   1. Title + Date + Location
 *   2. Hook / Lead (homepageSummary)
 *   3. Overview (canonicalSummary)
 *   4. Main narrative (detailedNarrative) OR extended overview
 *   5. Historical significance
 *   6. Quick closing
 *
 * All field accesses are null-safe. If any data is missing,
 * the function gracefully falls back to available content and
 * never throws — the caller wraps it in try-catch as well.
 */
export function buildNarrationContent(event: MockEventDetail): string {
  /* ── Safe getters with graceful fallbacks ── */
  const get = {
    title: safeGet(() => event.titles.primary, ''),
    shortTitle: safeGet(() => event.titles.short, ''),
    date: safeGet(() => event.chronology.displayDate, ''),
    homepageSummary: safeGet(() => event.summary.homepageSummary, ''),
    canonicalSummary: safeGet(() => event.textbookContent.canonicalSummary, ''),
    detailedNarrative: safeGet(() => event.textbookContent.detailedNarrative, ''),
    significance: safeGet(() => event.textbookContent.significance, ''),
    provinces: safeGet(() => event.mapData?.displayGeometry?.provinceNames ?? [], [] as string[]),
  };

  const parts: string[] = [];
  const locationStr = Array.isArray(get.provinces) ? get.provinces.join(', ') : '';

  // ── 1. Title + Date + Location ────────────────────────────────────────

  if (get.title) {
    let opening = get.title;
    if (get.date) {
      opening += `. Diễn ra ${preprocessDate(get.date)}`;
    }
    if (locationStr) {
      opening += `, tại ${locationStr}`;
    }
    opening += '.';
    parts.push(opening);

    // Alternate name, if different
    if (get.shortTitle && get.shortTitle !== get.title) {
      parts.push(`Sự kiện này còn được gọi là: ${get.shortTitle}.`);
    }
  }

  // ── 2. Hook / Lead ────────────────────────────────────────────────────

  if (get.homepageSummary) {
    parts.push(get.homepageSummary);
  }

  // ── 3–4. Main content ─────────────────────────────────────────────────

  if (get.detailedNarrative) {
    if (get.canonicalSummary) {
      parts.push(get.canonicalSummary);
    }
    parts.push(get.detailedNarrative);
  } else if (get.canonicalSummary) {
    parts.push(get.canonicalSummary);
  }

  // ── 5. Historical significance ────────────────────────────────────────

  if (get.significance) {
    parts.push(get.significance);
  }

  // ── 6. Closing ────────────────────────────────────────────────────────

  if (get.title) {
    parts.push(`Trên đây là nội dung tường thuật về sự kiện ${get.title}.`);
  }

  return parts
    .filter(Boolean)
    .map((p) => preprocessText(p))
    .join('\n\n');
}

/** Safely access a value, returning `fallback` if anything throws. */
function safeGet<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/**
 * Preprocess a text block for natural spoken Vietnamese.
 */
function preprocessText(text: string): string {
  let result = text.trim();
  if (!result) return '';

  // Ensure the text ends with proper punctuation
  if (!result.endsWith('.') && !result.endsWith('!') && !result.endsWith('?')) {
    result += '.';
  }

  return result;
}

/**
 * Convert a display date string into natural spoken Vietnamese.
 *
 * Handles patterns like:
 *   - "2/9/1945" → "ngày mồng 2 tháng 9 năm 1945"
 *   - "1954" → "năm 1954"
 *   - "1954–1975" → "từ năm 1954 đến năm 1975"
 *   - "Tháng 3 đến tháng 5 năm 1954" → kept as-is (already natural)
 */
function preprocessDate(displayDate: string): string {
  // If it already starts with "ngày", "tháng", "năm" — it's already natural
  if (/^(ngày|tháng|năm|từ|vào)/i.test(displayDate)) {
    return displayDate;
  }

  // Year range pattern: "1954–1975" or "1954 - 1975"
  const rangeMatch = displayDate.match(/^(\d{4})\s*[–\-—]\s*(\d{4})$/);
  if (rangeMatch) {
    return `từ năm ${rangeMatch[1]} đến năm ${rangeMatch[2]}`;
  }

  // Single year: "1954"
  const yearMatch = displayDate.match(/^(\d{4})$/);
  if (yearMatch) {
    return `năm ${yearMatch[1]}`;
  }

  // Date with slashes: "2/9/1945"
  const dateMatch = displayDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dateMatch) {
    const day = dateMatch[1];
    const month = dateMatch[2];
    const year = dateMatch[3];
    return `ngày ${day} tháng ${month} năm ${year}`;
  }

  // Fallback: return as-is
  return displayDate;
}
