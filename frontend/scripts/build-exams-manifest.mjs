/**
 * build-exams-manifest.mjs
 *
 * Đọc tất cả file JSON đề thi tại `<repo-root>/data/exams/`,
 * trích metadata cần cho list page và verification rút gọn,
 * sinh `MVP_KLTN/public/data/exams/exams-manifest.json`.
 *
 * Pattern: chạy lúc build-time (`prebuild`) hoặc dev (`predev`).
 * Source-of-truth: `data/exams/` ở root project (NGOÀI MVP_KLTN/).
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(__dirname, '../../data/exams');
const OUT_DIR = path.resolve(__dirname, '../public/data/exams');
const OUT_FILE = path.join(OUT_DIR, 'exams-manifest.json');

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  let files;
  try {
    files = (await fs.readdir(SRC_DIR)).filter((f) => f.endsWith('.json'));
  } catch (err) {
    console.error(`❌ Không đọc được thư mục nguồn ${SRC_DIR}:`, err.message);
    console.error('   Hãy chắc chắn `data/exams/` tồn tại ở root project.');
    process.exit(1);
  }

  if (files.length === 0) {
    console.warn(`⚠️  ${SRC_DIR} không có file JSON nào.`);
    await fs.writeFile(OUT_FILE, '[]', 'utf-8');
    return;
  }

  console.log(`📂 Tìm thấy ${files.length} đề tại ${SRC_DIR}`);

  const manifest = [];
  let errorCount = 0;

  for (const file of files) {
    const filePath = path.join(SRC_DIR, file);
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const exam = JSON.parse(raw);

      if (!exam.examId || !exam.sections) {
        console.warn(`⚠️  Bỏ qua ${file}: thiếu examId hoặc sections`);
        errorCount++;
        continue;
      }

      const mcqSection = exam.sections.find((s) => s.sectionType === 'mcq');
      const tfSection = exam.sections.find((s) => s.sectionType === 'true_false');
      const v = exam.verification || {};

      manifest.push({
        examId: exam.examId,
        title: exam.title ?? '',
        year: exam.year ?? 0,
        sourceDetail: exam.sourceDetail ?? '',
        format: exam.format ?? 'unknown',
        timeLimitMinutes: exam.timeLimitMinutes ?? 50,
        totalScore: exam.totalScore ?? 10,
        mcqCount: mcqSection?.totalQuestions ?? 0,
        tfCount: tfSection?.totalQuestions ?? 0,
        structuralPassed: v.structural?.all_passed === true,
        crossSourcePassed: v.cross_source?.all_passed === true,
        hasContentSuspicion: (v.content_integrity?.n_suspicious ?? 0) > 0,
        fileName: file,
      });
    } catch (err) {
      console.error(`❌ Lỗi parse ${file}: ${err.message}`);
      errorCount++;
    }
  }

  // Sort: năm mới nhất trước, sau đó theo fileName để stable
  manifest.sort(
    (a, b) => b.year - a.year || a.fileName.localeCompare(b.fileName, 'vi')
  );

  await fs.writeFile(OUT_FILE, JSON.stringify(manifest, null, 2), 'utf-8');

  const publishedCount = manifest.filter(
    (e) => e.structuralPassed && e.crossSourcePassed && !e.hasContentSuspicion
  ).length;

  console.log(`✅ Sinh manifest: ${manifest.length} đề → ${path.relative(process.cwd(), OUT_FILE)}`);
  console.log(`   - Đủ điều kiện publish (3 layer pass): ${publishedCount}/${manifest.length}`);
  if (errorCount > 0) {
    console.log(`   - ⚠️  Bỏ qua ${errorCount} file lỗi.`);
  }
}

main().catch((err) => {
  console.error('❌ Build manifest failed:', err);
  process.exit(1);
});
