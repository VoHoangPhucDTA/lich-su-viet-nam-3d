import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { formatCognitiveLevelLabel } from '@/lib/exam/displayLabels';
import { loadTopicIndex } from '@/lib/exam/topicIndexLoader';
import { buildPeriodSummaries, buildTopicSummaries, filterRefs, type TopicSummary } from '@/lib/exam/topicGrouping';
import type { CognitiveLevel, QuestionType, TopicIndex } from '@/types/exam';
import ExamBackLink from '@/components/exams/ExamBackLink';

type ViewMode = 'topic' | 'period';
type TypeFilter = QuestionType | 'all';
type LevelFilter = CognitiveLevel | 'all';

function pillStyle(active = false): CSSProperties {
  return {
    padding: '0.45rem 0.85rem',
    borderRadius: '999px',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    background: active ? 'var(--accent-soft)' : 'var(--bg-surface)',
    color: active ? 'var(--accent)' : 'var(--text-secondary)',
    fontWeight: 800,
    fontSize: '0.82rem',
    cursor: 'pointer',
  };
}

function TopicCard({ summary, mode }: { summary: TopicSummary; mode: ViewMode }) {
  return (
    <article className="exam-topic-card">
      <div>
        <h2 style={{ margin: '0 0 0.45rem', fontSize: '1.05rem', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.45 }}>
          {summary.title}
        </h2>
        <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.55, fontSize: '0.88rem' }}>
          {summary.description}
        </p>
      </div>

      <div className="exam-topic-badges">
        <Badge>{summary.total} câu</Badge>
        {mode === 'period' && <Badge>{summary.topics.length} chủ đề con</Badge>}
        <Badge>{summary.mcqCount} Trắc nghiệm</Badge>
        <Badge>{summary.tfCount} Đúng/Sai</Badge>
        {summary.cognitiveLevels.map((level) => (
          <Badge key={level}>{formatCognitiveLevelLabel(level)}</Badge>
        ))}
      </div>

      <Link
        to={`/exams/on-chu-de/${summary.slug}`}
        className="exam-focusable exam-topic-cta"
      >
        Bắt đầu ôn
      </Link>
    </article>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="exam-topic-badge">
      {children}
    </span>
  );
}

export default function ExamTopicListPage() {
  const [index, setIndex] = useState<TopicIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>('topic');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');

  useEffect(() => {
    loadTopicIndex()
      .then(setIndex)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Không tải được danh sách chủ đề.'))
      .finally(() => setLoading(false));
  }, []);

  const summaries = useMemo(() => {
    if (!index) return [];
    const base = mode === 'topic' ? buildTopicSummaries(index) : buildPeriodSummaries(index);
    const normalizedSearch = search.trim().toLowerCase();
    return base
      .map((summary) => {
        const refs = filterRefs(summary.refs, typeFilter, levelFilter);
        return {
          ...summary,
          refs,
          total: refs.length,
          mcqCount: refs.filter((ref) => ref.questionType === 'mcq').length,
          tfCount: refs.filter((ref) => ref.questionType === 'true_false').length,
        };
      })
      .filter((summary) => summary.total > 0)
      .filter((summary) => {
        if (!normalizedSearch) return true;
        return `${summary.title} ${summary.description} ${summary.topics.join(' ')}`.toLowerCase().includes(normalizedSearch);
      });
  }, [index, mode, search, typeFilter, levelFilter]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-primary)', padding: '2rem 1.5rem' }}>
      <div style={{ maxWidth: '64rem', margin: '0 auto', display: 'grid', gap: '1.5rem' }}>
        <header style={{ display: 'grid', gap: '0.55rem' }}>
          <ExamBackLink to="/exams">Quay lại luyện thi</ExamBackLink>
          <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 900 }}>Ôn theo chủ đề</h1>
          <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Chọn một chủ đề hoặc giai đoạn lịch sử để luyện các câu hỏi liên quan, xem đáp án và giải thích ngay sau từng câu.
          </p>
        </header>

        <section style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1rem', display: 'grid', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setMode('topic')} style={pillStyle(mode === 'topic')}>Theo chủ đề</button>
            <button type="button" onClick={() => setMode('period')} style={pillStyle(mode === 'period')}>Theo giai đoạn</button>
          </div>

          <div className="exam-topic-filters" style={{ display: 'grid', gridTemplateColumns: 'minmax(14rem, 1fr) auto auto', gap: '0.75rem', alignItems: 'center' }}>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm kiếm chủ đề..."
              aria-label="Tìm kiếm chủ đề"
              className="exam-focusable"
              style={{ padding: '0.7rem 0.9rem', borderRadius: '0.75rem', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)', width: '100%', minWidth: 0, boxSizing: 'border-box' }}
            />
            <select aria-label="Lọc theo dạng câu" className="exam-focusable" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as TypeFilter)} style={selectStyle}>
              <option value="all">Tất cả dạng câu</option>
              <option value="mcq">Trắc nghiệm</option>
              <option value="true_false">Đúng/Sai</option>
            </select>
            <select aria-label="Lọc theo mức độ" className="exam-focusable" value={levelFilter} onChange={(event) => setLevelFilter(event.target.value as LevelFilter)} style={selectStyle}>
              <option value="all">Tất cả mức độ</option>
              <option value="knowledge">Nhận biết</option>
              <option value="comprehension">Thông hiểu</option>
              <option value="application">Vận dụng</option>
            </select>
          </div>
        </section>

        <section style={{ background: 'rgba(47,122,87,0.08)', border: '1px solid rgba(47,122,87,0.22)', borderRadius: '1rem', padding: '1rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Bắt đầu với chủ đề yếu nhất, đọc giải thích sau mỗi câu và làm lại các câu sai để ghi nhớ lâu hơn.
        </section>

        {loading && <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Đang tải danh sách chủ đề...</div>}
        {error && <ErrorBox message={error} />}
        {!loading && !error && summaries.length === 0 && (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem' }}>
            Không có chủ đề phù hợp với bộ lọc hiện tại.
          </div>
        )}
        {!loading && !error && summaries.length > 0 && (
          <div className="exam-topic-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(18rem, 1fr))', gap: '1rem', minWidth: 0 }}>
            {summaries.map((summary) => <TopicCard key={summary.slug} summary={summary} mode={mode} />)}
          </div>
        )}
        <style>{`
          @media (max-width: 640px) {
            .exam-topic-filters,
            .exam-topic-cards {
              grid-template-columns: minmax(0, 1fr) !important;
            }
            .exam-topic-filters select {
              width: 100%;
              min-width: 0;
              box-sizing: border-box;
            }
          }
        `}</style>
      </div>
    </div>
  );
}

const selectStyle: CSSProperties = {
  padding: '0.7rem 0.9rem',
  borderRadius: '0.75rem',
  border: '1px solid var(--border)',
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  fontWeight: 700,
  minWidth: 0,
};

function ErrorBox({ message }: { message: string }) {
  return (
    <div style={{ padding: '1.25rem', background: 'rgba(159,29,45,0.08)', border: '1px solid rgba(159,29,45,0.24)', borderRadius: '1rem', color: 'var(--danger)' }}>
      {message}
    </div>
  );
}
