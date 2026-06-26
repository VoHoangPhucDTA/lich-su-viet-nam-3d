/**
 * ExamBrowsePage – Duyệt danh sách 38 đề thi THPT thật.
 * Route: /exams/browse
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { listAllExams } from '@/lib/exam/manifestLoader';
import type { ExamManifestEntry } from '@/types/exam';

function ExamCard({ entry }: { entry: ExamManifestEntry }) {
  const verified =
    entry.structuralPassed && entry.crossSourcePassed && !entry.hasContentSuspicion;

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '1.25rem',
        padding: '1.5rem',
        display: 'flex',
        gap: '1.25rem',
        alignItems: 'flex-start',
        boxShadow: 'var(--shadow)',
        transition: 'transform 0.2s cubic-bezier(0.4,0,0.2,1)',
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.transform = 'translateY(-2px)')
      }
      onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
    >
      {/* Year badge */}
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
        <div
          style={{
            fontSize: '1.4rem',
            fontWeight: 800,
            color: 'var(--accent)',
            lineHeight: 1,
          }}
        >
          {entry.year}
        </div>
        <div
          style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}
        >
          THPT
        </div>
      </div>

      {/* Main info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3
          style={{
            margin: '0 0 0.5rem',
            fontSize: '0.95rem',
            fontWeight: 700,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={entry.title}
        >
          {entry.title}
        </h3>
        <div
          style={{
            fontSize: '0.8rem',
            color: 'var(--text-muted)',
            marginBottom: '0.5rem',
          }}
        >
          {entry.mcqCount} MCQ · {entry.tfCount} T/F ·{' '}
          {entry.timeLimitMinutes} phút · {entry.totalScore} điểm
        </div>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            padding: '0.15rem 0.55rem',
            borderRadius: '9999px',
            fontSize: '0.72rem',
            fontWeight: 600,
            background: verified
              ? 'rgba(47,122,87,0.12)'
              : 'rgba(194,155,75,0.14)',
            color: verified ? 'var(--success)' : 'var(--warning)',
            border: `1px solid ${verified ? 'var(--success)' : 'var(--warning)'}`,
          }}
        >
          {verified ? '✓ Đã xác minh' : '⚠ Có cảnh báo'}
        </span>
      </div>

      {/* CTA */}
      <Link
        to={`/exams/de/${entry.examId}`}
        style={{
          flexShrink: 0,
          padding: '0.6rem 1.25rem',
          background: 'var(--accent)',
          color: '#fff',
          borderRadius: '0.75rem',
          textDecoration: 'none',
          fontSize: '0.85rem',
          fontWeight: 600,
          whiteSpace: 'nowrap',
          alignSelf: 'center',
          transition: 'filter 0.15s',
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.filter = 'brightness(1.12)')
        }
        onMouseLeave={(e) => (e.currentTarget.style.filter = 'none')}
      >
        Bắt đầu thi →
      </Link>
    </div>
  );
}

export default function ExamBrowsePage() {
  const [manifest, setManifest] = useState<ExamManifestEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterYear, setFilterYear] = useState<number | null>(null);

  useEffect(() => {
    listAllExams()
      .then(setManifest)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Lỗi tải danh sách đề')
      )
      .finally(() => setLoading(false));
  }, []);

  const years = manifest
    ? [...new Set(manifest.map((e) => e.year))].sort((a, b) => b - a)
    : [];

  const filtered = manifest
    ? (filterYear !== null
        ? manifest.filter((e) => e.year === filterYear)
        : manifest
      ).slice().sort((a, b) => b.year - a.year || a.title.localeCompare(b.title, 'vi'))
    : [];

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-app)',
        color: 'var(--text-primary)',
      }}
    >
      <div
        style={{ maxWidth: '64rem', margin: '0 auto', padding: '2.5rem 1.5rem' }}
      >
        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
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
          <h1
            style={{
              fontSize: '1.75rem',
              fontWeight: 800,
              margin: '0 0 0.5rem',
              color: 'var(--text-primary)',
            }}
          >
            Ngân hàng đề thi THPT
          </h1>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            {manifest ? `${manifest.length} đề thi` : '—'} · Lịch sử Việt Nam &
            Thế giới · Cấu trúc chuẩn THPT 2025
          </p>
        </div>

        {/* Year filter chips */}
        {years.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              flexWrap: 'wrap',
              marginBottom: '1.75rem',
            }}
          >
            {[null, ...years].map((y) => (
              <button
                key={y ?? 'all'}
                onClick={() => setFilterYear(y)}
                style={{
                  padding: '0.35rem 0.9rem',
                  borderRadius: '9999px',
                  fontSize: '0.825rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: '1.5px solid',
                  borderColor:
                    filterYear === y ? 'var(--accent)' : 'var(--border)',
                  background:
                    filterYear === y ? 'var(--accent-soft)' : 'var(--bg-surface)',
                  color:
                    filterYear === y ? 'var(--accent)' : 'var(--text-secondary)',
                  transition: 'all 0.15s',
                }}
              >
                {y === null ? 'Tất cả' : y}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        {loading && (
          <div
            style={{
              padding: '5rem',
              textAlign: 'center',
              color: 'var(--text-muted)',
            }}
          >
            <div
              style={{
                width: '2rem',
                height: '2rem',
                border: '3px solid var(--accent-soft)',
                borderTopColor: 'var(--accent)',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 1rem',
              }}
            />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {filtered.length === 0 ? (
              <div
                style={{
                  padding: '4rem',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                }}
              >
                Không có đề nào
              </div>
            ) : (
              filtered.map((entry) => (
                <ExamCard key={entry.examId} entry={entry} />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
