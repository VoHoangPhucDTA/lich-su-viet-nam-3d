/**
 * build-topic-index.mjs
 *
 * Đọc tất cả đề tại `<repo-root>/data/exams/`, gom câu hỏi theo `topic`,
 * NORMALIZE 347 raw topic phân mảnh thành ~30 canonical topic (theo SGK
 * Lịch sử 12), sinh `MVP_KLTN/public/data/exams/topic-index.json`.
 *
 * Bonus: sinh thêm `topic-raw-mapping.json` để dev xem raw → canonical mapping.
 *
 * Lưu ý:
 *  - 1 raw topic có thể tách thành nhiều phần (dấu phẩy) → map vào nhiều canonical.
 *  - 1 câu hỏi có thể xuất hiện trong nhiều canonical topic (multi-tag).
 *  - Mỗi entry chỉ giữ tham chiếu (examId + questionId), không nhúng question.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  splitAndMapTopics,
  CANONICAL_TOPICS,
  FALLBACK_CANONICAL,
} from './lib/topicTaxonomy.mjs';
import { parseStrictJson } from './lib/strictJson.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(__dirname, '../../data/exams');
const OUT_DIR = path.resolve(__dirname, '../public/data/exams');
const OUT_FILE = path.join(OUT_DIR, 'topic-index.json');
const MAPPING_FILE = path.join(OUT_DIR, 'topic-raw-mapping.json');

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  let files;
  try {
    files = (await fs.readdir(SRC_DIR))
      .filter((f) => f.endsWith('.json'))
      .sort((a, b) => a.localeCompare(b));
  } catch (err) {
    console.error(`❌ Không đọc được thư mục nguồn ${SRC_DIR}:`, err.message);
    process.exit(1);
  }

  /** @type {Record<string, Array<{examId:string,questionId:string,cognitiveLevel:string,difficulty:string,questionType:string}>>} */
  const index = {};
  /** @type {Record<string, Set<string>>} canonical → set of raw topics đã map vào nó */
  const mapping = {};

  let totalQuestions = 0;
  let totalTaggings = 0; // 1 câu có thể thuộc nhiều canonical → đếm tagging

  for (const file of files) {
    const filePath = path.join(SRC_DIR, file);
    const exam = parseStrictJson(
      await fs.readFile(filePath, 'utf-8'),
      `data/exams/${file}`
    );
    if (!exam.examId || !Array.isArray(exam.sections)) {
      throw new Error(`data/exams/${file}: thiếu examId hoặc sections hợp lệ`);
    }

    for (const section of exam.sections) {
      for (const q of section.questions ?? []) {
          totalQuestions++;
          const rawTopic = (q.topic ?? '').trim() || FALLBACK_CANONICAL;
          const canonicals = splitAndMapTopics(rawTopic);

          for (const canonical of canonicals) {
            if (!index[canonical]) index[canonical] = [];
            index[canonical].push({
              examId: exam.examId,
              questionId: q.id,
              cognitiveLevel: q.cognitiveLevel ?? 'knowledge',
              difficulty: q.difficulty ?? 'medium',
              questionType: q.questionType ?? section.sectionType ?? 'mcq',
            });
            totalTaggings++;

            if (!mapping[canonical]) mapping[canonical] = new Set();
            mapping[canonical].add(rawTopic);
          }
      }
    }
  }

  // Sort entries để stable diff
  for (const topic of Object.keys(index)) {
    index[topic].sort(
      (a, b) =>
        a.examId.localeCompare(b.examId) ||
        a.questionId.localeCompare(b.questionId)
    );
  }

  // Đảm bảo thứ tự key giống thứ tự CANONICAL_TOPICS (cho UI ổn định)
  const orderedIndex = {};
  for (const c of CANONICAL_TOPICS) {
    if (index[c]) orderedIndex[c] = index[c];
  }

  await fs.writeFile(OUT_FILE, JSON.stringify(orderedIndex, null, 2), 'utf-8');

  // Export mapping debug: canonical → list raw topics (sorted)
  const mappingExport = {};
  for (const c of CANONICAL_TOPICS) {
    if (mapping[c]) {
      mappingExport[c] = {
        rawCount: mapping[c].size,
        questionCount: index[c]?.length ?? 0,
        rawTopics: [...mapping[c]].sort(),
      };
    }
  }
  await fs.writeFile(MAPPING_FILE, JSON.stringify(mappingExport, null, 2), 'utf-8');

  const usedCanonicals = Object.keys(orderedIndex).length;
  const fallbackCount = orderedIndex[FALLBACK_CANONICAL]?.length ?? 0;

  console.log(`✅ Sinh topic-index: ${usedCanonicals} canonical topics, ${totalQuestions} câu, ${totalTaggings} taggings`);
  console.log(`   → ${path.relative(process.cwd(), OUT_FILE)}`);
  console.log(`   → ${path.relative(process.cwd(), MAPPING_FILE)} (debug)`);
  console.log(`   Fallback "${FALLBACK_CANONICAL}": ${fallbackCount} câu (${((fallbackCount / totalTaggings) * 100).toFixed(1)}%)`);
  console.log(`   Top 8 chủ đề nhiều câu nhất:`);
  const top = Object.entries(orderedIndex)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 8);
  for (const [topic, items] of top) {
    console.log(`     - ${items.length.toString().padStart(3, ' ')} câu | ${topic}`);
  }
}

main().catch((err) => {
  console.error('❌ Build topic-index failed:', err);
  process.exit(1);
});
