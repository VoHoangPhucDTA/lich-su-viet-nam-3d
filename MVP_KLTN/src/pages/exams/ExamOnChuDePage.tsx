/**
 * ExamOnChuDePage – Duyệt 32 canonical topics, chọn 1 topic để luyện tập.
 * Route: /exams/on-chu-de
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getTopicCounts } from '@/lib/exam/topicIndexLoader';

const ITEMS_PER_PAGE = 32; // show all topics

function TopicCard({
  topic,
  count,
}: {
  topic: string;
  count: number;
}) {
  const slug = encodeURIComponent(topic);

  return (
    <Link
      to={`/exams/on-chu-de/${slug}`}
      style={{ textDecoration: 'none' }}
    >
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '1rem',
          padding: '1.25rem',
          cursor: 'pointer',
          transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          height: '100%',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.borderColor = 'var(--accent)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.borderColor = 'var(--border)';
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: '0.9rem',
            fontWeight: 700,
            color: 'var(--text-primary)',
            lineHeight: 1.4,
          }}
        >
          {topic}
        </h3>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 'auto',
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              padding: '0.2rem 0.6rem',
              background: 'var(--accent-soft)',
              color: 'var(--accent)',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 700,
            }}
          >
            {count} câu
          </span>
          <span
            style={{
              fontSize: '0.75rem',
              color: 'var(--accent)',
              fontWeight: 600,
            }}
          >
            Luyện tập →
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function ExamOnChuDePage() {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    getTopicCounts()
      .then(setCounts)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Lỗi tải danh sách chủ đề')
      )
      .finally(() => setLoading(false));
  }, []);

  const topics = counts
    ? Object.entries(counts)
        .filter(
          ([t]) =>
            search.trim() === '' ||
            t.toLowerCase().includes(search.trim().toLowerCase())
        )
        .sort((a, b) => b[1] - a[1]) // sort by count desc
        .slice(0, ITEMS_PER_PAGE)
    : [];

  const totalQuestions = counts
    ? Object.values(counts).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-app)',
        color: 'var(--text-primary)',
      }}
    >
      <div
        style={{ maxWidth: '72rem', margin: '0 auto', padding: '2.5rem 1.5rem' }}
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
            Ôn tập theo chủ đề
          </h1>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            {counts ? `${Object.keys(counts).length} chủ đề` : '—'} ·{' '}
            {totalQuestions > 0 ? `${totalQuestions} câu hỏi` : '—'} · Lịch sử Việt Nam & Thế giới
          </p>
        </div>

        {/* Search */}
        <div style={{ marginBottom: '1.75rem', maxWidth: '28rem' }}>
          <input
            className="themed-input"
            type="text"
            placeholder="Tìm chủ đề..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '0.65rem 1rem',
              background: 'var(--input-bg)',
              border: '1px solid var(--input-border)',
              borderRadius: '0.75rem',
              color: 'var(--input-text)',
              fontSize: '0.9rem',
              outline: 'none',
            }}
            onFocus={(e) =>
              (e.currentTarget.style.borderColor = 'var(--accent)')
            }
            onBlur={(e) =>
              (e.currentTarget.style.borderColor = 'var(--input-border)')
            }
          />
        </div>

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
            Đang tải chủ đề...
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
          <>
            {topics.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '3rem' }}>
                Không tìm thấy chủ đề nào
              </p>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: '1rem',
                }}
              >
                {topics.map(([topic, count]) => (
                  <TopicCard key={topic} topic={topic} count={count} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
