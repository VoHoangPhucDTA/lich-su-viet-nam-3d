/**
 * Browse real THPT exam JSON files.
 * Route: /exams/browse
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listAllExams, listPublishedExams } from '@/lib/exam/manifestLoader';
import type { ExamManifestEntry } from '@/types/exam';

function ExamCard({ entry }: { entry: ExamManifestEntry }) {
  const verified =
    entry.structuralPassed && entry.crossSourcePassed && !entry.hasContentSuspicion;

  return (
    <article
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '1rem',
        padding: '1.25rem',
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr) auto',
        gap: '1.25rem',
        alignItems: 'start',
        boxShadow: 'var(--shadow)',
      }}
    >
      <div
        style={{
          minWidth: '3.5rem',
          textAlign: 'center',
          padding: '0.5rem 0.25rem',
          background: 'var(--accent-soft)',
          borderRadius: '0.75rem',
          border: '1px solid var(--accent)',
        }}
      >
        <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent)', lineHeight: 1 }}>
          {entry.year}
        </div>
        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
          THPT
        </div>
      </div>

      <div style={{ minWidth: 0 }}>
        <h2
          style={{
            margin: '0 0 0.5rem',
            fontSize: '1rem',
            fontWeight: 800,
            color: 'var(--text-primary)',
            lineHeight: 1.45,
          }}
          title={entry.title}
        >
          {entry.title}
        </h2>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.65rem' }}>
          {entry.mcqCount} Trắc nghiệm · {entry.tfCount} Đúng/Sai · {entry.timeLimitMinutes} phút · {entry.totalScore} điểm
        </div>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            padding: '0.18rem 0.6rem',
            borderRadius: '9999px',
            fontSize: '0.72rem',
            fontWeight: 700,
            background: verified ? 'rgba(47,122,87,0.12)' : 'rgba(194,155,75,0.14)',
            color: verified ? 'var(--success)' : 'var(--warning)',
            border: `1px solid ${verified ? 'var(--success)' : 'var(--warning)'}`,
          }}
        >
          {verified ? 'Đã xác minh' : 'Có cảnh báo'}
        </span>
      </div>

      <div style={{ display: 'grid', gap: '0.55rem', minWidth: '10rem' }}>
        <Link
          to={`/exams/de/${entry.examId}`}
          style={{
            padding: '0.62rem 1rem',
            background: 'var(--accent)',
            color: '#fff',
            borderRadius: '0.75rem',
            textDecoration: 'none',
            fontSize: '0.85rem',
            fontWeight: 800,
            whiteSpace: 'nowrap',
            textAlign: 'center',
          }}
        >
          Thi thử
        </Link>
        <Link
          to={`/exams/luyen-tap/${entry.examId}`}
          style={{
            padding: '0.62rem 1rem',
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            borderRadius: '0.75rem',
            textDecoration: 'none',
            fontSize: '0.85rem',
            fontWeight: 800,
            whiteSpace: 'nowrap',
            textAlign: 'center',
          }}
        >
          Luyện tập tự do
        </Link>
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

  useEffect(() => {
    Promise.all([listAllExams(), listPublishedExams()])
      .then(([all, published]) => {
        setAllExams(all);
        setPublishedExams(published);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Không tải được danh sách đề thi.')
      )
      .finally(() => setLoading(false));
  }, []);

  const activeManifest = showAllExams ? allExams : publishedExams;
  const years = activeManifest
    ? [...new Set(activeManifest.map((entry) => entry.year))].sort((a, b) => b - a)
    : [];
  const filtered = activeManifest
    ? (filterYear !== null
        ? activeManifest.filter((entry) => entry.year === filterYear)
        : activeManifest
      ).slice().sort((a, b) => b.year - a.year || a.title.localeCompare(b.title, 'vi'))
    : [];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-primary)' }}>
      <div style={{ maxWidth: '64rem', margin: '0 auto', padding: '2.5rem 1.5rem' }}>
        <header style={{ marginBottom: '2rem' }}>
          <Link
            to="/exams"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              color: 'var(--text-muted)',
              textDecoration: 'none',
              fontSize: '0.875rem',
              marginBottom: '1rem',
            }}
          >
            ← Luyện thi
          </Link>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 900, margin: '0 0 0.5rem', color: 'var(--text-primary)' }}>
            Ngân hàng đề thi THPT
          </h1>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
            {activeManifest ? `${activeManifest.length} đề thi` : 'Đang tải'} · Lịch sử Việt Nam và thế giới · Cấu trúc chuẩn THPT 2025
          </p>
        </header>

        <section
          style={{
            marginBottom: '1rem',
            padding: '1rem 1.1rem',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h2 style={{ margin: '0 0 0.3rem', fontSize: '1rem', fontWeight: 900, color: 'var(--text-primary)' }}>
              Muốn ôn theo từng mảng kiến thức?
            </h2>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.86rem', lineHeight: 1.55 }}>
              Luyện câu hỏi theo chủ đề/giai đoạn để củng cố phần còn yếu trước khi làm đề thi thử.
            </p>
          </div>
          <Link
            to="/exams/on-chu-de"
            style={{
              padding: '0.68rem 1rem',
              background: 'var(--accent)',
              color: '#fff',
              borderRadius: '0.75rem',
              textDecoration: 'none',
              fontWeight: 800,
              fontSize: '0.9rem',
              whiteSpace: 'nowrap',
            }}
          >
            Ôn theo chủ đề
          </Link>
        </section>

        {allExams && publishedExams && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              flexWrap: 'wrap',
              marginBottom: '1rem',
              padding: '0.75rem 1rem',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '0.875rem',
            }}
          >
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>
              Mặc định hiển thị {publishedExams.length} đề đã xác minh.
              {allExams.length > publishedExams.length
                ? ` Còn ${allExams.length - publishedExams.length} đề có cảnh báo.`
                : ''}
            </div>
            <button
              type="button"
              onClick={() => {
                setShowAllExams((value) => !value);
                setFilterYear(null);
              }}
              style={{
                padding: '0.45rem 0.9rem',
                borderRadius: '9999px',
                fontSize: '0.8rem',
                fontWeight: 800,
                cursor: 'pointer',
                border: '1.5px solid var(--accent)',
                background: showAllExams ? 'var(--accent-soft)' : 'var(--bg-surface)',
                color: 'var(--accent)',
                whiteSpace: 'nowrap',
              }}
            >
              {showAllExams ? 'Chỉ đề đã xác minh' : 'Tất cả đề'}
            </button>
          </div>
        )}

        {years.length > 0 && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.75rem' }}>
            {[null, ...years].map((year) => (
              <button
                key={year ?? 'all'}
                type="button"
                onClick={() => setFilterYear(year)}
                style={{
                  padding: '0.35rem 0.9rem',
                  borderRadius: '9999px',
                  fontSize: '0.825rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: '1.5px solid',
                  borderColor: filterYear === year ? 'var(--accent)' : 'var(--border)',
                  background: filterYear === year ? 'var(--accent-soft)' : 'var(--bg-surface)',
                  color: filterYear === year ? 'var(--accent)' : 'var(--text-secondary)',
                }}
              >
                {year === null ? 'Tất cả' : year}
              </button>
            ))}
          </div>
        )}

        {loading && (
          <div style={{ padding: '5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Đang tải danh sách đề thi...
          </div>
        )}

        {error && (
          <div
            style={{
              padding: '2rem',
              background: 'rgba(159,29,45,0.1)',
              borderRadius: '1rem',
              color: 'var(--danger)',
              textAlign: 'center',
            }}
          >
            {error}
          </div>
        )}

        {!loading && !error && (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                Không có đề nào phù hợp.
              </div>
            ) : (
              filtered.map((entry) => <ExamCard key={entry.examId} entry={entry} />)
            )}
          </div>
        )}
      </div>
    </div>
  );
}
