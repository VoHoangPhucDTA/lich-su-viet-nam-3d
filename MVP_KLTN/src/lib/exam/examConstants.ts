/**
 * examConstants.ts
 *
 * Hằng số dùng chung cho toàn bộ module luyện thi. Đổi ở đây để ảnh hưởng
 * đồng loạt cả loaders, scoring, và UI.
 */

// ===== URLs runtime (Vite SPA — fetch từ public/) ============================
export const EXAM_MANIFEST_URL = '/data/exams/exams-manifest.json';
export const TOPIC_INDEX_URL = '/data/exams/topic-index.json';
/** Trả URL fetch 1 file đề theo examId. */
export const examFileURL = (examId: string): string =>
  `/data/exams/${examId}.json`;

// ===== Cấu hình đề thi THPT 2025 ============================================
export const EXAM_DURATION_MINUTES = 50;
export const EXAM_DURATION_SECONDS = EXAM_DURATION_MINUTES * 60;

/** Phần I MCQ: 24 câu × 0.25 điểm = 6 điểm. */
export const MCQ_COUNT = 24;
export const MCQ_SCORE_PER_QUESTION = 0.25;
export const MCQ_SECTION_MAX_SCORE = MCQ_COUNT * MCQ_SCORE_PER_QUESTION; // 6.0

/** Phần II T/F: 4 câu × 4 ý, tối đa 1 điểm/câu = 4 điểm. */
export const TF_COUNT = 4;
export const TF_STATEMENTS_COUNT = 4;
export const TF_SCORE_PER_QUESTION_MAX = 1.0;
export const TF_SECTION_MAX_SCORE = TF_COUNT * TF_SCORE_PER_QUESTION_MAX; // 4.0

/**
 * Điểm T/F bậc thang (THPT 2025).
 * Index = số ý đúng (0..4), value = điểm nhận được cho câu đó.
 */
export const TF_LADDER_SCORES = [0, 0.1, 0.25, 0.5, 1.0] as const;
export type TFLadderIndex = 0 | 1 | 2 | 3 | 4;

export const EXAM_TOTAL_SCORE =
  MCQ_SECTION_MAX_SCORE + TF_SECTION_MAX_SCORE; // 10.0

// ===== Cache =================================================================
/** Số file đề tối đa giữ trong LRU cache RAM. */
export const LRU_EXAM_CACHE_CAP = 10;
