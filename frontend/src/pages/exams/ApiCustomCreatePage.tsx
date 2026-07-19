import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ExamCustomCreatePage from './ExamCustomCreatePage';
import { createExamSession, isExamApiFallbackError, listTopicMetadata, previewCustomExam } from '@/services/examApi';
import type { CustomPreviewResponse, ExamTopicMetadata } from '@/types/examApi';

type QuestionType = 'all' | 'mcq' | 'true_false';
type Difficulty = 'all' | 'easy' | 'medium' | 'hard';
type Cognitive = 'all' | 'knowledge' | 'comprehension' | 'application';
type Scope = 'all' | 'topic' | 'period';
type Mode = 'practice' | 'mock';

export default function ApiCustomCreatePage() {
  const navigate = useNavigate();
  const [topics, setTopics] = useState<ExamTopicMetadata[]>([]);
  const [usingFallback, setUsingFallback] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [questionCount, setQuestionCount] = useState(28);
  const [questionType, setQuestionType] = useState<QuestionType>('all');
  const [difficulty, setDifficulty] = useState<Difficulty>('all');
  const [cognitiveLevel, setCognitiveLevel] = useState<Cognitive>('all');
  const [scopeType, setScopeType] = useState<Scope>('all');
  const [scopeSlug, setScopeSlug] = useState('');
  const [mode, setMode] = useState<Mode>('practice');
  const [preview, setPreview] = useState<CustomPreviewResponse | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [starting, setStarting] = useState(false);

  const periods = useMemo(() => {
    const map = new Map<string, { slug: string; title: string }>();
    for (const topic of topics) if (topic.periodSlug && topic.periodTitle) map.set(topic.periodSlug, { slug: topic.periodSlug, title: topic.periodTitle });
    return [...map.values()].sort((a, b) => a.title.localeCompare(b.title, 'vi'));
  }, [topics]);
  const scopeOptions = scopeType === 'topic' ? topics.map((topic) => ({ slug: topic.slug, title: topic.title })) : periods;
  const request = useMemo(() => ({ questionCount, questionType, difficulty, cognitiveLevel, scopeType, scopeSlug: scopeType === 'all' ? undefined : scopeSlug || undefined }), [cognitiveLevel, difficulty, questionCount, questionType, scopeSlug, scopeType]);

  useEffect(() => {
    const controller = new AbortController();
    void listTopicMetadata(controller.signal)
      .then((response) => {
        setTopics(response.items);
        setScopeSlug((current) => current || response.items[0]?.slug || '');
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        if (isExamApiFallbackError(loadError)) setUsingFallback(true);
        else setError(loadError instanceof Error ? loadError.message : 'Không thể tải metadata chủ đề.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (scopeType === 'all') return;
    if (!scopeOptions.some((item) => item.slug === scopeSlug)) setScopeSlug(scopeOptions[0]?.slug ?? '');
  }, [scopeOptions, scopeSlug, scopeType]);

  const runPreview = async () => {
    setPreviewing(true);
    setError(null);
    try {
      setPreview(await previewCustomExam(request));
    } catch (previewError: unknown) {
      setError(previewError instanceof Error ? previewError.message : 'Không thể xem trước cấu hình đề.');
    } finally { setPreviewing(false); }
  };

  const start = async () => {
    if (!preview?.enoughQuestions || starting) return;
    setStarting(true);
    setError(null);
    try {
      const session = await createExamSession({
        ...request,
        mode: mode === 'mock' ? 'CUSTOM_MOCK' : 'CUSTOM_PRACTICE',
        expectedDatasetVersion: preview.datasetVersion,
      });
      if (session.anonymousSessionToken) localStorage.setItem(`exam_session_token_${session.sessionId}`, session.anonymousSessionToken);
      navigate(mode === 'mock' ? `/exams/tuy-chon/${session.sessionId}` : `/exams/tuy-chon/luyen-tap/${session.sessionId}`);
    } catch (startError: unknown) {
      setError(startError instanceof Error ? startError.message : 'Không thể tạo phiên tùy chọn.');
    } finally { setStarting(false); }
  };

  if (usingFallback) return <ExamCustomCreatePage />;
  return (
    <div style={pageStyle}>
      <main style={{ maxWidth: '64rem', margin: '0 auto', display: 'grid', gap: '1.25rem' }}>
        <Link to="/exams" style={backStyle}>← Luyện thi</Link>
        <header><h1 style={{ margin: 0 }}>Tạo đề tùy chọn</h1><p style={mutedStyle}>Máy chủ chọn và cố định tập câu hỏi; trình duyệt không tải đáp án hay danh sách câu hỏi trước khi tạo phiên.</p></header>
        {loading ? <p style={mutedStyle}>Đang tải metadata chủ đề...</p> : <>
          {error && <p role="alert" style={errorStyle}>{error}</p>}
          <section style={cardStyle}>
            <label>Số câu <select value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))} style={inputStyle}><option value={10}>10</option><option value={20}>20</option><option value={28}>28</option></select></label>
            <label>Dạng câu <select value={questionType} onChange={(event) => setQuestionType(event.target.value as QuestionType)} style={inputStyle}><option value="all">Tất cả</option><option value="mcq">Trắc nghiệm</option><option value="true_false">Đúng/Sai</option></select></label>
            <label>Độ khó <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as Difficulty)} style={inputStyle}><option value="all">Tất cả</option><option value="easy">Dễ</option><option value="medium">Trung bình</option><option value="hard">Khó</option></select></label>
            <label>Mức độ <select value={cognitiveLevel} onChange={(event) => setCognitiveLevel(event.target.value as Cognitive)} style={inputStyle}><option value="all">Tất cả</option><option value="knowledge">Nhận biết</option><option value="comprehension">Thông hiểu</option><option value="application">Vận dụng</option></select></label>
            <label>Phạm vi <select value={scopeType} onChange={(event) => setScopeType(event.target.value as Scope)} style={inputStyle}><option value="all">Tất cả</option><option value="topic">Một chủ đề</option><option value="period">Một giai đoạn</option></select></label>
            {scopeType !== 'all' && <label>{scopeType === 'topic' ? 'Chủ đề' : 'Giai đoạn'} <select value={scopeSlug} onChange={(event) => setScopeSlug(event.target.value)} style={inputStyle}>{scopeOptions.map((item) => <option key={item.slug} value={item.slug}>{item.title}</option>)}</select></label>}
            <label>Chế độ <select value={mode} onChange={(event) => setMode(event.target.value as Mode)} style={inputStyle}><option value="practice">Luyện tập</option><option value="mock">Thi thử tùy chọn</option></select></label>
          </section>
          <section style={cardStyle}>
            <button type="button" onClick={() => void runPreview()} disabled={previewing} style={buttonStyle}>{previewing ? 'Đang xem trước...' : 'Xem trước cấu hình'}</button>
            {preview && <div style={{ marginTop: '1rem', display: 'grid', gap: '0.45rem' }}><strong>{preview.selectedCount}/{questionCount} câu có thể tạo</strong><span style={mutedStyle}>Có sẵn {preview.availableCount} câu phù hợp.</span>{preview.warnings.map((warning) => <span key={warning} style={errorStyle}>{warning}</span>)}<button type="button" onClick={() => void start()} disabled={!preview.enoughQuestions || starting} style={{ ...buttonStyle, opacity: preview.enoughQuestions ? 1 : 0.55 }}>{starting ? 'Đang tạo phiên...' : mode === 'mock' ? 'Bắt đầu thi thử' : 'Bắt đầu luyện tập'}</button></div>}
          </section>
        </>}
      </main>
    </div>
  );
}

const pageStyle: CSSProperties = { minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-primary)', padding: '2rem 1.5rem' };
const cardStyle: CSSProperties = { display: 'grid', gap: '0.9rem', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1.25rem' };
const inputStyle: CSSProperties = { display: 'block', width: '100%', marginTop: '0.35rem', padding: '0.65rem', borderRadius: '0.6rem', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)' };
const buttonStyle: CSSProperties = { padding: '0.7rem 1rem', borderRadius: '0.7rem', border: '1px solid var(--accent)', background: 'var(--accent)', color: '#fff', fontWeight: 800, cursor: 'pointer', justifySelf: 'start' };
const errorStyle: CSSProperties = { margin: 0, color: 'var(--danger)', lineHeight: 1.5 };
const mutedStyle: CSSProperties = { color: 'var(--text-muted)', lineHeight: 1.6 };
const backStyle: CSSProperties = { color: 'var(--text-muted)', textDecoration: 'none' };
