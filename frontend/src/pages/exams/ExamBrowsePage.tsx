/** Browse real THPT exam JSON files. Route: /exams/browse */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatExamTitle, getExamDisplayYear, getExamSourceLabel } from '@/lib/exam/examDisplay';
import { preloadExamV2SessionPage } from '@/lib/exam/examRoutePreload';
import { listPublishedExams } from '@/lib/exam/manifestLoader';
import { isExamApiFallbackError, listCatalog } from '@/services/examApi';
import type { ExamCatalogItem } from '@/types/examApi';
import type { ExamManifestEntry } from '@/types/exam';

function catalogItemToManifest(item: ExamCatalogItem): ExamManifestEntry {
  const verified = item.verificationStatus === 'VERIFIED';
  return {
    examId: item.examId,
    title: item.title,
    year: item.year ?? 0,
    sourceDetail: item.sourceDetail ?? '',
    format: item.format,
    timeLimitMinutes: item.timeLimitMinutes,
    totalScore: item.totalScore,
    mcqCount: item.mcqCount,
    tfCount: item.tfCount,
    structuralPassed: verified,
    crossSourcePassed: verified,
    hasContentSuspicion: !verified,
    fileName: '',
  };
}

/**
 * Single source of truth for the year surfaced on Browse. Always derived
 * from `getExamDisplayYear` (which scans title / fileName / examId /
 * sourceDetail and returns the latest 20xx year found). We only fall back to
 * the raw manifest `entry.year` when no display year can be extracted.
 *
 * Used uniformly by:
 *  - the rendered year on each card (ExamCard);
 *  - the year filter option derivation;
 *  - the year filter comparison.
 *
 * Do NOT introduce a parallel expression that mixes a raw `entry.year` field
 * with `getExamDisplayYear` and produces a duplicate year chip.
 */
function getBrowseYear(entry: ExamManifestEntry): number {
  return getExamDisplayYear(entry) || entry.year || 0;
}

function ExamCard({ entry }: { entry: ExamManifestEntry }) {
  const displayTitle = formatExamTitle(entry);
  const displayYear = getBrowseYear(entry);
  const sourceLabel = getExamSourceLabel(entry);

  return (
    <article className="exam-browse-card">
      <div className="exam-browse-card-meta">
        <span className="exam-browse-year"><strong>{displayYear}</strong><small>THPT</small></span>
      </div>
      <div className="exam-browse-card-content">
        <h2 title={displayTitle}>{displayTitle}</h2>
        {sourceLabel && <p className="exam-browse-source">Nguồn: {sourceLabel}</p>}
        <p className="exam-browse-details">
          {entry.mcqCount} TN · {entry.tfCount} Đ/S · {entry.timeLimitMinutes} phút · {entry.totalScore} điểm
        </p>
      </div>
      <div className="exam-browse-card-actions">
        <Link
          className="exam-focusable exam-browse-primary-action"
          to={`/exams/de/${entry.examId}`}
          onFocus={preloadExamV2SessionPage}
          onPointerEnter={preloadExamV2SessionPage}
        >
          Thi thử
        </Link>
        <Link className="exam-focusable exam-browse-secondary-action" to={`/exams/luyen-tap/${entry.examId}`}>Luyện tập</Link>
      </div>
    </article>
  );
}

export default function ExamBrowsePage() {
  const [publishedExams, setPublishedExams] = useState<ExamManifestEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterYear, setFilterYear] = useState<number | null>(null);
  const [usingLocalFallback, setUsingLocalFallback] = useState(false);

  useEffect(() => {
    preloadExamV2SessionPage();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    listCatalog('verified', controller.signal)
      .then((published) => {
        if (!active) return;
        setPublishedExams(published.items.map(catalogItemToManifest));
        setError(null);
        setUsingLocalFallback(false);
      })
      .catch(async (err: unknown) => {
        if (!active || controller.signal.aborted) return;
        if (!isExamApiFallbackError(err)) {
          setError(err instanceof Error ? err.message : 'Không tải được danh sách đề thi.');
          return;
        }
        try {
          const listed = await listPublishedExams();
          if (!active) return;
          setPublishedExams(listed);
          setUsingLocalFallback(true);
        } catch (fallbackError: unknown) {
          if (!active) return;
          setError(fallbackError instanceof Error ? fallbackError.message : 'Không tải được danh sách đề thi.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const years = useMemo(() => {
    if (!publishedExams) return [];
    const unique = new Set<number>();
    for (const entry of publishedExams) {
      const display = getBrowseYear(entry);
      if (display > 0) unique.add(display);
    }
    return [...unique].sort((a, b) => b - a);
  }, [publishedExams]);

  const filtered = useMemo(() => {
    if (!publishedExams) return [];
    const base = filterYear === null
      ? publishedExams
      : publishedExams.filter((entry) => getBrowseYear(entry) === filterYear);
    return base
      .slice()
      .sort((a, b) => {
        const yearDelta = getBrowseYear(b) - getBrowseYear(a);
        if (yearDelta !== 0) return yearDelta;
        return formatExamTitle(a).localeCompare(formatExamTitle(b), 'vi');
      });
  }, [filterYear, publishedExams]);

  const resetFilters = () => setFilterYear(null);

  return (
    <div className="exam-browse-page">
      <main className="exam-browse-main">
        <header className="exam-browse-header">
          <Link className="exam-focusable exam-browse-back" to="/exams">← Luyện thi</Link>
          <h1>Ngân hàng đề thi THPT</h1>
          <p>Đề Lịch sử Việt Nam và thế giới theo cấu trúc thi tốt nghiệp THPT hiện hành.</p>
        </header>

        {publishedExams && (
          <section className="exam-browse-toolbar exam-browse-toolbar-compact" aria-label="Bộ lọc ngân hàng đề">
            <div className="exam-browse-filter-group">
              <span className="exam-browse-filter-label" id="exam-year-filter-label">Năm</span>
              <div className="exam-browse-year-buttons" role="radiogroup" aria-labelledby="exam-year-filter-label">
                <label className="exam-browse-year-chip exam-focusable">
                  <input
                    type="radio"
                    name="exam-year-filter"
                    value="all"
                    checked={filterYear === null}
                    onChange={() => setFilterYear(null)}
                  />
                  <span>Tất cả năm</span>
                </label>
                {years.map((year) => (
                  <label key={year} className="exam-browse-year-chip exam-focusable">
                    <input
                      type="radio"
                      name="exam-year-filter"
                      value={year}
                      checked={filterYear === year}
                      onChange={() => setFilterYear(year)}
                    />
                    <span>{year}</span>
                  </label>
                ))}
              </div>
            </div>
            <strong className="exam-browse-result-count" aria-live="polite">{filtered.length} đề phù hợp</strong>
          </section>
        )}

        {usingLocalFallback && (
          <p className="exam-browse-message" role="status">Đang sử dụng dữ liệu cục bộ vì máy chủ đề thi tạm thời không khả dụng.</p>
        )}
        {loading && <div className="exam-browse-message">Đang tải danh sách đề thi...</div>}
        {error && <div className="exam-browse-message exam-browse-error">{error}</div>}
        {!loading && !error && (
          <section className="exam-browse-list" aria-label="Danh sách đề thi">
            {filtered.length === 0 ? (
              <div className="exam-browse-empty">
                <p>Không có đề nào phù hợp với bộ lọc hiện tại.</p>
                <button className="exam-focusable" type="button" onClick={resetFilters}>Đặt lại bộ lọc</button>
              </div>
            ) : filtered.map((entry) => <ExamCard key={entry.examId} entry={entry} />)}
          </section>
        )}
      </main>
    </div>
  );
}
