import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ExamTopicListPage from './ExamTopicListPage';
import { isExamApiFallbackError, listTopicMetadata } from '@/services/examApi';
import type { ExamTopicMetadata } from '@/types/examApi';

type View = 'topic' | 'period';

interface DisplayTopic {
  scopeType: View;
  slug: string;
  title: string;
  questionCount: number;
  mcqCount: number;
  tfCount: number;
  childCount: number;
}

export default function ApiTopicListPage() {
  const [items, setItems] = useState<ExamTopicMetadata[]>([]);
  const [view, setView] = useState<View>('topic');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void listTopicMetadata(controller.signal)
      .then((response) => setItems(response.items))
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        if (isExamApiFallbackError(loadError)) setUsingFallback(true);
        else setError(loadError instanceof Error ? loadError.message : 'Không thể tải danh sách chủ đề.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const displayItems = useMemo<DisplayTopic[]>(() => {
    if (view === 'topic') return items.map((item) => ({ scopeType: 'topic', slug: item.slug, title: item.title, questionCount: item.questionCount, mcqCount: item.mcqCount, tfCount: item.tfCount, childCount: 0 }));
    const byPeriod = new Map<string, DisplayTopic>();
    for (const item of items) {
      if (!item.periodSlug || !item.periodTitle) continue;
      const current = byPeriod.get(item.periodSlug) ?? { scopeType: 'period', slug: item.periodSlug, title: item.periodTitle, questionCount: 0, mcqCount: 0, tfCount: 0, childCount: 0 };
      current.questionCount += item.questionCount;
      current.mcqCount += item.mcqCount;
      current.tfCount += item.tfCount;
      current.childCount += 1;
      byPeriod.set(item.periodSlug, current);
    }
    return [...byPeriod.values()];
  }, [items, view]);
  const normalizedSearch = search.trim().toLocaleLowerCase('vi');
  const visible = displayItems.filter((item) => !normalizedSearch || item.title.toLocaleLowerCase('vi').includes(normalizedSearch));

  if (usingFallback) return <ExamTopicListPage />;
  return (
    <div style={pageStyle}>
      <main style={{ maxWidth: '64rem', margin: '0 auto', display: 'grid', gap: '1.25rem' }}>
        <Link to="/exams" style={backStyle}>← Quay lại luyện thi</Link>
        <header><h1 style={{ margin: 0 }}>Ôn theo chủ đề</h1><p style={mutedStyle}>Chọn chủ đề hoặc giai đoạn để máy chủ tạo một phiên luyện tập có tập câu hỏi cố định.</p></header>
        <section style={cardStyle}>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}><button type="button" onClick={() => setView('topic')} style={view === 'topic' ? buttonStyle : secondaryButtonStyle}>Theo chủ đề</button><button type="button" onClick={() => setView('period')} style={view === 'period' ? buttonStyle : secondaryButtonStyle}>Theo giai đoạn</button></div>
          <div className="form-control-wrap"><input className="form-control" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm chủ đề" aria-label="Tìm chủ đề" /></div>
        </section>
        {loading && <p style={mutedStyle}>Đang tải danh sách chủ đề...</p>}
        {error && <p role="alert" style={errorStyle}>{error}</p>}
        {!loading && !error && <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(17rem, 1fr))', gap: '1rem' }}>{visible.map((item) => <article key={item.slug} style={cardStyle}><h2 style={{ margin: 0, fontSize: '1.05rem' }}>{item.title}</h2><p style={mutedStyle}>{item.questionCount} câu · {item.mcqCount} trắc nghiệm · {item.tfCount} đúng/sai{view === 'period' ? ` · ${item.childCount} chủ đề` : ''}</p><Link to={`/exams/on-chu-de/${item.slug}${item.scopeType === 'period' ? '?scope=period' : ''}`} style={buttonLinkStyle}>Bắt đầu ôn</Link></article>)}</section>}
      </main>
    </div>
  );
}

const pageStyle = { minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-primary)', padding: '2rem 1.5rem' };
const cardStyle = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1.1rem', display: 'grid', gap: '0.7rem' };
const mutedStyle = { margin: 0, color: 'var(--text-muted)', lineHeight: 1.55 };
const errorStyle = { margin: 0, color: 'var(--danger)' };
const backStyle = { color: 'var(--text-muted)', textDecoration: 'none' };
const buttonStyle = { padding: '0.55rem 0.8rem', borderRadius: '0.6rem', border: '1px solid var(--accent)', background: 'var(--accent)', color: '#fff', fontWeight: 800, cursor: 'pointer' };
const secondaryButtonStyle = { ...buttonStyle, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)' };
const buttonLinkStyle = { ...buttonStyle, display: 'inline-block', textDecoration: 'none', justifySelf: 'start' };
