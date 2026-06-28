/**
 * ExamV2HistoryPage – Lịch sử các lần làm bài V2.
 * Route: /exams/lich-su-v2
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getAllV2Results, clearAllV2Results } from '@/lib/exam/v2History';
import { rateScore } from '@/lib/exam/scoring';
import type { ExamResultV2 } from '@/types/exam';

const RATING_LABEL: Record<string, string> = {
  gioi: 'Giỏi',
  kha: 'Khá',
  trung_binh: 'TB',
  yeu: 'Yếu',
};

const RATING_COLOR: Record<string, string> = {
  gioi: 'var(--success)',
  kha: 'var(--accent)',
  trung_binh: 'var(--warning)',
  yeu: 'var(--danger)',
};

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}p${s.toString().padStart(2, '0')}s`;
}

function ResultRow({ r }: { r: ExamResultV2 }) {
  const rating = rateScore(r.totalScore);
  const color = RATING_COLOR[rating];

  return (
    <Link
      to={`/exams/ket-qua/${r.sessionId}`}
      style={{ textDecoration: 'none' }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto auto auto auto',
          gap: '1rem',
          alignItems: 'center',
          padding: '0.875rem 1.25rem',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: '0.75rem',
          transition: 'border-color 0.15s',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.borderColor = 'var(--accent)')
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.borderColor = 'var(--border)')
        }
      >
        {/* Date + examId */}
        <div>
          <div
            style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              marginBottom: '0.2rem',
            }}
          >
            {r.examId ?? 'Ôn chủ đề'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {formatDate(r.submittedAt)}
          </div>
        </div>

        {/* Score */}
        <div style={{ textAlign: 'right' }}>
          <div
            style={{ fontSize: '1.3rem', fontWeight: 800, color, lineHeight: 1 }}
          >
            {r.totalScore.toFixed(2)}
          </div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
            / 10
          </div>
        </div>

        {/* Rating badge */}
        <span
          style={{
            padding: '0.2rem 0.65rem',
            borderRadius: '9999px',
            fontSize: '0.75rem',
            fontWeight: 700,
            background: `color-mix(in srgb, ${color} 15%, transparent)`,
            color,
            border: `1px solid ${color}`,
          }}
        >
          {RATING_LABEL[rating]}
        </span>

        {/* Duration */}
        <div
          style={{
            fontSize: '0.8rem',
            color: 'var(--text-muted)',
            whiteSpace: 'nowrap',
          }}
        >
          {formatDuration(r.durationSeconds)}
        </div>

        {/* Arrow */}
        <div style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>›</div>
      </div>
    </Link>
  );
}

export default function ExamV2HistoryPage() {
  const [results, setResults] = useState<ExamResultV2[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    setResults(getAllV2Results());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function handleClear() {
    if (!confirm('Xóa toàn bộ lịch sử làm bài? Hành động này không thể hoàn tác.')) return;
    clearAllV2Results();
    load();
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-app)',
        color: 'var(--text-primary)',
        padding: '2.5rem 1.5rem',
      }}
    >
      <div style={{ maxWidth: '52rem', margin: '0 auto' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            marginBottom: '2rem',
            flexWrap: 'wrap',
          }}
        >
          <Link
            to="/exams"
            style={{
              color: 'var(--text-muted)',
              textDecoration: 'none',
              fontSize: '0.875rem',
            }}
          >
            ← Luyện thi
          </Link>
          <h1
            style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, flex: 1 }}
          >
            Lịch sử làm bài
          </h1>
          {results.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              style={{
                padding: '0.4rem 0.9rem',
                background: 'transparent',
                border: '1px solid var(--danger)',
                borderRadius: '0.5rem',
                color: 'var(--danger)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Xóa tất cả
            </button>
          )}
        </div>

        {loading && (
          <div
            style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}
          >
            Đang tải...
          </div>
        )}

        {!loading && results.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '4rem',
              background: 'var(--bg-card)',
              borderRadius: '1.25rem',
              border: '1px solid var(--border)',
            }}
          >
            <div
              style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.5 }}
            >
              📋
            </div>
            <p style={{ color: 'var(--text-muted)', margin: '0 0 1.5rem' }}>
              Bạn chưa hoàn thành đề thi nào.
            </p>
            <Link
              to="/exams/browse"
              style={{
                padding: '0.75rem 1.5rem',
                background: 'var(--accent)',
                color: '#fff',
                borderRadius: '0.75rem',
                textDecoration: 'none',
                fontWeight: 600,
              }}
            >
              Bắt đầu làm đề
            </Link>
          </div>
        )}

        {!loading && results.length > 0 && (
          <>
            {/* Summary stats */}
            <div
              style={{
                display: 'flex',
                gap: '1rem',
                marginBottom: '1.5rem',
                flexWrap: 'wrap',
              }}
            >
              {[
                ['Đề đã làm', `${results.length}`, 'var(--accent)'],
                [
                  'Điểm TB',
                  `${(results.reduce((a, r) => a + r.totalScore, 0) / results.length).toFixed(1)}`,
                  'var(--success)',
                ],
                [
                  'Điểm cao nhất',
                  `${Math.max(...results.map((r) => r.totalScore)).toFixed(1)}`,
                  'var(--admin-accent)',
                ],
              ].map(([label, value, color]) => (
                <div
                  key={label}
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: '0.875rem',
                    padding: '1rem 1.25rem',
                    minWidth: '7rem',
                  }}
                >
                  <div
                    style={{
                      fontSize: '1.5rem',
                      fontWeight: 800,
                      color,
                      lineHeight: 1,
                    }}
                  >
                    {value}
                  </div>
                  <div
                    style={{
                      fontSize: '0.72rem',
                      color: 'var(--text-muted)',
                      marginTop: '0.25rem',
                    }}
                  >
                    {label}
                  </div>
                </div>
              ))}
            </div>

            {/* Result list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {results.map((r) => (
                <ResultRow key={r.sessionId} r={r} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
