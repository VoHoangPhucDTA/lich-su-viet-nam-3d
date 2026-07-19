/** Browse real THPT exam JSON files. Route: /exams/browse */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatExamTitle, getExamDisplayYear, getExamSourceLabel } from '@/lib/exam/examDisplay';
import { preloadExamV2SessionPage } from '@/lib/exam/examRoutePreload';
import { listAllExams, listPublishedExams } from '@/lib/exam/manifestLoader';
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

function ExamCard({ entry }: { entry: ExamManifestEntry }) {
  const verified = entry.structuralPassed && entry.crossSourcePassed && !entry.hasContentSuspicion;
  const displayTitle = formatExamTitle(entry);
  const displayYear = getExamDisplayYear(entry) || entry.year;
  const sourceLabel = getExamSourceLabel(entry);

  return (
    <article className="exam-browse-card">
      <div className="exam-browse-card-meta">
        <span className="exam-browse-year"><strong>{displayYear}</strong><small>THPT</small></span>
        <span className={`exam-browse-status ${verified ? 'is-verified' : 'needs-review'}`}>
          {verified ? 'Đạt kiểm tra dữ liệu' : 'Cần kiểm tra thêm'}
        </span>
      </div>
      <div className="exam-browse-card-content">
        <h2 title={displayTitle}>{displayTitle}</h2>
        {sourceLabel && <p className="exam-browse-source">Nguồn: {sourceLabel}</p>}
        <p className="exam-browse-details">
          {entry.mcqCount} Trắc nghiệm · {entry.tfCount} Đúng/Sai · {entry.timeLimitMinutes} phút · {entry.totalScore} điểm
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
        <Link className="exam-focusable exam-browse-secondary-action" to={`/exams/luyen-tap/${entry.examId}`}>Luyện tập tự do</Link>
      </div>
    </article>
  );
}

export default function ExamBrowsePage() {
  const [allExams, setAllExams] = useState<ExamManifestEntry[] | null>(null);
  const [publishedExams, setPublishedExams] = useState<ExamManifestEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterYear, setFilterYear] = useState<number | null>(null);
  const [showAllExams, setShowAllExams] = useState(false);
  const [usingLocalFallback, setUsingLocalFallback] = useState(false);

  useEffect(() => {
    preloadExamV2SessionPage();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    Promise.all([listCatalog('reviewable', controller.signal), listCatalog('verified', controller.signal)])
      .then(([reviewable, published]) => {
        if (!active) return;
        setAllExams(reviewable.items.map(catalogItemToManifest));
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
          const [all, published] = await Promise.all([listAllExams(), listPublishedExams()]);
          if (!active) return;
          setAllExams(all);
          setPublishedExams(published);
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

  const activeManifest = showAllExams ? allExams : publishedExams;
  const years = activeManifest
    ? [...new Set(activeManifest.map((entry) => getExamDisplayYear(entry) || entry.year))].sort((a, b) => b - a)
    : [];
  const filtered = activeManifest
    ? (filterYear === null
        ? activeManifest
        : activeManifest.filter((entry) => (getExamDisplayYear(entry) || entry.year) === filterYear))
      .slice()
      .sort((a, b) => (getExamDisplayYear(b) || b.year) - (getExamDisplayYear(a) || a.year)
        || formatExamTitle(a).localeCompare(formatExamTitle(b), 'vi'))
    : [];

  const resetFilters = () => {
    setShowAllExams(false);
    setFilterYear(null);
  };

  return (
    <div className="exam-browse-page">
      <main className="exam-browse-main">
        <header className="exam-browse-header">
          <Link className="exam-focusable exam-browse-back" to="/exams">← Luyện thi</Link>
          <h1>Ngân hàng đề thi THPT</h1>
          <p>Đề Lịch sử Việt Nam và thế giới theo cấu trúc thi tốt nghiệp THPT hiện hành.</p>
        </header>

        {allExams && publishedExams && (
          <section className="exam-browse-toolbar" aria-label="Bộ lọc ngân hàng đề">
            <div className="exam-browse-filter-group">
              <span className="exam-browse-filter-label">Trạng thái</span>
              <div className="exam-browse-segmented">
                <button className="exam-focusable" type="button" aria-pressed={!showAllExams} onClick={() => { setShowAllExams(false); setFilterYear(null); }}>Đạt kiểm tra dữ liệu</button>
                <button className="exam-focusable" type="button" aria-pressed={showAllExams} onClick={() => { setShowAllExams(true); setFilterYear(null); }}>Tất cả đề</button>
              </div>
            </div>
            <div className="exam-browse-filter-group">
              <label className="exam-browse-filter-label" htmlFor="exam-year-filter">Năm</label>
              <select id="exam-year-filter" className="exam-focusable exam-browse-year-filter" value={filterYear ?? ''} onChange={(event) => setFilterYear(event.target.value ? Number(event.target.value) : null)}>
                <option value="">Tất cả năm</option>
                {years.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            </div>
            <strong className="exam-browse-result-count" aria-live="polite">{filtered.length} đề phù hợp</strong>
            <details className="exam-browse-verification-note">
              <summary>Ý nghĩa trạng thái đề</summary>
              <p>“Đạt kiểm tra dữ liệu” là đề đã qua kiểm tra cấu trúc, đối chiếu nguồn và không có cảnh báo nội dung tự động. Trạng thái này không thay thế thẩm định chuyên môn.</p>
            </details>
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
