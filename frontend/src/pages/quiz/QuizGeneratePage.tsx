/**
 * QuizGeneratePage – Configure and generate a quiz session.
 * Collects config from user → calls generateQuiz() → redirects to session.
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import * as quizService from '../../services/quizService';
import type { QuizConfig, QuizDifficulty, QuizSourceMode, QuizGrade, CognitiveLevel, QuestionSource } from '../../types/quiz';

// ─── Constants & Options ────────────────────────────────────────────────────

const SCOPE_OPTIONS: { value: QuizSourceMode; label: string; icon: string }[] = [
  { value: 'mixed', label: 'Trộn nhiều nội dung', icon: '🎲' },
  { value: 'event', label: 'Theo sự kiện', icon: '🚩' },
  { value: 'topic', label: 'Theo chủ đề', icon: '📚' },
  { value: 'period', label: 'Theo giai đoạn', icon: '⏳' },
  { value: 'grade', label: 'Theo lớp học', icon: '🎓' },
];

const GRADE_OPTIONS: { value: QuizGrade; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 10, label: 'Lớp 10' },
  { value: 11, label: 'Lớp 11' },
  { value: 12, label: 'Lớp 12' },
];

const DIFFICULTY_OPTIONS: { value: QuizDifficulty; label: string }[] = [
  { value: 'easy', label: 'Nhẹ nhàng (Dễ)' },
  { value: 'medium', label: 'Thử thách (Vừa)' },
  { value: 'hard', label: 'Căng não (Khó)' },
  { value: 'mixed', label: 'Ngẫu nhiên (Trộn)' },
];

const COGNITIVE_OPTIONS: { value: CognitiveLevel; label: string }[] = [
  { value: 'knowledge', label: 'Nhận biết' },
  { value: 'comprehension', label: 'Thông hiểu' },
  { value: 'application', label: 'Vận dụng' },
  { value: 'mixed', label: 'Trộn các mức độ' },
];

const SOURCE_OPTIONS: { value: QuestionSource; label: string }[] = [
  { value: 'textbook', label: 'Nội dung SGK' },
  { value: 'event_data', label: 'Dữ liệu sự kiện chuẩn hóa' },
  { value: 'textbook_wiki', label: 'SGK + Wikipedia bổ sung' },
];

const MOCK_TOPICS = [
  'Cách mạng tháng Tám 1945',
  'Chiến dịch Điện Biên Phủ 1954',
  'ASEAN',
  'Trật tự hai cực I-an-ta',
  'Văn minh Đại Việt',
  'Biển Đông',
];

const MOCK_PERIODS = [
  'Cổ - trung đại',
  'Cận đại',
  'Hiện đại',
  '1945–1954',
  '1954–1975',
  '1975–nay',
];

const PRESET_COUNTS = [5, 10, 15, 20];

// ─── UI Helpers ─────────────────────────────────────────────────────────────

function SectionHeader({ title, desc }: { title: string; desc?: string }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{title}</h3>
      {desc && <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>{desc}</p>}
    </div>
  );
}

function SelectCard({
  label,
  icon,
  selected,
  onClick
}: {
  label: string; icon?: string; selected: boolean; onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        padding: '0.75rem 1rem',
        borderRadius: '0.75rem',
        border: selected ? '1px solid var(--accent)' : '1px solid var(--border)',
        background: selected ? 'var(--accent-soft)' : 'var(--bg-card)',
        color: selected ? 'var(--accent)' : 'var(--text-secondary)',
        fontSize: '0.9rem',
        fontWeight: selected ? 600 : 400,
        cursor: 'pointer',
        transition: 'all 0.15s',
        fontFamily: 'inherit',
        flex: 1,
        minWidth: '110px'
      }}
    >
      {icon && <span>{icon}</span>}
      {label}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function QuizGeneratePage() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  // Form State
  const [sourceMode, setSourceMode] = useState<QuizSourceMode>('mixed');
  const [grade, setGrade] = useState<QuizGrade>('all');
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('');

  const [questionCount, setQuestionCount] = useState<number | string>(10);
  const [difficulty, setDifficulty] = useState<QuizDifficulty>('mixed');
  const [cognitiveLevel, setCognitiveLevel] = useState<CognitiveLevel>('mixed');
  const [sourceOption, setSourceOption] = useState<QuestionSource>('textbook');

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setError(null);
    const count = typeof questionCount === 'string' ? parseInt(questionCount, 10) : questionCount;
    if (isNaN(count) || count < 1 || count > 100) {
      setError('Số lượng câu hỏi không hợp lệ (nhập từ 1-100).');
      return;
    }

    setIsGenerating(true);
    try {
      const config: QuizConfig = {
        questionCount: count,
        difficulty,
        sourceMode,
        grade: grade === 'all' ? undefined : grade,
        topic: selectedTopic || undefined,
        cognitiveLevel,
        source: sourceOption,
        timeLimitMinutes: 15, // Default time limit if not configuring
      };
      const userId = currentUser?.id ?? 'guest';
      const session = await quizService.generateQuiz(config, userId);
      navigate(`/quiz/session/${session.sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra. Hãy thử thiết lập phạm vi chọn rộng hơn.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-app)',
        color: 'var(--text-primary)',
        fontFamily: 'Inter, sans-serif',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* Nav */}
      <header
        style={{
          height: '3.5rem',
          background: 'var(--bg-app)',
          borderBottom: '1px solid var(--border)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 1.5rem',
          gap: '1rem',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <Link to="/quiz" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 500 }}>
          ← Trắc nghiệm AI
        </Link>
        <span style={{ color: 'var(--text-muted)' }}>·</span>
        <span style={{ fontSize: '0.85rem', color: 'var(--accent)', fontWeight: 700 }}>Tạo câu hỏi</span>
        <div style={{ flex: 1 }} />
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1, padding: '2rem 1.5rem' }}>
        <div style={{ maxWidth: '72rem', margin: '0 auto', display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>

          {/* Form Column */}
          <div style={{ flex: '1 1 60%', minWidth: '320px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            <div>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.5rem' }}>Tùy chỉnh cấu hình bài làm</h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Lựa chọn nội dung chi tiết. AI sẽ tự động trộn và sinh ra câu hỏi theo đúng trọng tâm.</p>
            </div>

            {/* ERROR DISPLAY */}
            {error && (
              <div style={{ padding: '1rem', borderRadius: '0.75rem', background: 'var(--danger-soft)', border: '1px solid var(--danger)', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                ⚠️ <span>{error}</span>
              </div>
            )}

            {/* A. Range/Scope */}
            <section style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1.5rem' }}>
              <SectionHeader title="Phạm vi câu hỏi" desc="Bạn muốn ôn tập theo kiến thức nào?" />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {SCOPE_OPTIONS.map(opt => (
                  <SelectCard key={opt.value} label={opt.label} icon={opt.icon} selected={sourceMode === opt.value} onClick={() => setSourceMode(opt.value)} />
                ))}
              </div>

              {/* Conditional Inputs based on scope */}
              <div style={{ marginTop: '1.25rem' }}>
                {sourceMode === 'grade' && (
                  <div className="animate-fade-in" style={{ display: 'flex', gap: '0.5rem' }}>
                    {GRADE_OPTIONS.map(opt => (
                      <SelectCard key={opt.value} label={opt.label} selected={grade === opt.value} onClick={() => setGrade(opt.value)} />
                    ))}
                  </div>
                )}

                {(sourceMode === 'topic' || sourceMode === 'event') && (
                  <div className="animate-fade-in">
                    <select
                      value={selectedTopic}
                      onChange={e => setSelectedTopic(e.target.value)}
                      style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '0.75rem', background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.9rem', outline: 'none' }}
                    >
                      <option value="">-- Chọn {sourceMode === 'event' ? 'sự kiện' : 'chủ đề'} --</option>
                      {MOCK_TOPICS.map(t => <option key={t} value={t} style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>{t}</option>)}
                    </select>
                  </div>
                )}

                {sourceMode === 'period' && (
                  <div className="animate-fade-in">
                    <select
                      value={selectedPeriod}
                      onChange={e => setSelectedPeriod(e.target.value)}
                      style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '0.75rem', background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.9rem', outline: 'none' }}
                    >
                      <option value="">-- Chọn giai đoạn lịch sử --</option>
                      {MOCK_PERIODS.map(t => <option key={t} value={t} style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>{t}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </section>

            {/* Additional Config Container */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem' }}>

              {/* Number of queries & Source */}
              <section style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                <div>
                  <SectionHeader title="Số lượng câu hỏi" />
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {PRESET_COUNTS.map(n => (
                      <button key={n} type="button" onClick={() => setQuestionCount(n)} style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', background: questionCount === n ? 'var(--accent)' : 'var(--bg-surface)', color: questionCount === n ? '#fff' : 'var(--text-secondary)', border: questionCount === n ? 'none' : '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit' }}>{n}</button>
                    ))}
                    <input
                      type="number"
                      placeholder="Khác..."
                      value={typeof questionCount === 'string' ? questionCount : ''}
                      onChange={e => setQuestionCount(e.target.value)}
                      style={{ width: '80px', padding: '0.5rem', borderRadius: '0.5rem', background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }}
                    />
                  </div>
                </div>

                <div>
                  <SectionHeader title="Nguồn tạo câu hỏi" />
                  <select
                    value={sourceOption}
                    onChange={e => setSourceOption(e.target.value as QuestionSource)}
                    style={{ width: '100%', padding: '0.75rem', borderRadius: '0.75rem', background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.9rem', outline: 'none' }}
                  >
                    {SOURCE_OPTIONS.map(o => <option key={o.value} value={o.value} style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>{o.label}</option>)}
                  </select>
                </div>
              </section>

              {/* Difficulty & Type */}
              <section style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div>
                  <SectionHeader title="Độ khó" />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    {DIFFICULTY_OPTIONS.map(opt => (
                      <button key={opt.value} type="button" onClick={() => setDifficulty(opt.value)} style={{ padding: '0.5rem', borderRadius: '0.5rem', background: difficulty === opt.value ? 'var(--accent-soft)' : 'var(--bg-surface)', border: difficulty === opt.value ? '1px solid var(--accent)' : '1px solid var(--border)', color: difficulty === opt.value ? 'var(--accent)' : 'var(--text-muted)', fontSize: '0.85rem', cursor: 'pointer' }}>{opt.label}</button>
                    ))}
                  </div>
                </div>

                <div>
                  <SectionHeader title="Dạng nhận thức" />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    {COGNITIVE_OPTIONS.map(opt => (
                      <button key={opt.value} type="button" onClick={() => setCognitiveLevel(opt.value)} style={{ padding: '0.5rem', borderRadius: '0.5rem', background: cognitiveLevel === opt.value ? 'var(--success-soft)' : 'var(--bg-surface)', border: cognitiveLevel === opt.value ? '1px solid var(--success)' : '1px solid var(--border)', color: cognitiveLevel === opt.value ? 'var(--success)' : 'var(--text-muted)', fontSize: '0.85rem', cursor: 'pointer' }}>{opt.label}</button>
                    ))}
                  </div>
                </div>
              </section>

            </div>

            {/* Actions */}
            <div style={{ marginTop: '1rem' }}>
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                style={{
                  width: '100%',
                  padding: '1.1rem',
                  borderRadius: '0.75rem',
                  background: isGenerating ? 'var(--accent-soft)' : 'var(--accent)',
                  border: 'none',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '1.05rem',
                  cursor: isGenerating ? 'wait' : 'pointer',
                  transition: 'background 0.2s, transform 0.1s',
                  boxShadow: isGenerating ? 'none' : '0 4px 15px var(--accent-soft)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.75rem',
                }}
              >
                {isGenerating ? (
                  <>
                    <span style={{ width: '1.25rem', height: '1.25rem', border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite', display: 'inline-block' }} />
                    AI đang phân tích dữ liệu và tạo câu hỏi...
                  </>
                ) : (
                  '✨ Bắt đầu tạo bài trắc nghiệm'
                )}
              </button>
            </div>
          </div>

          {/* Explanation Panel (Right Side) */}
          <div style={{ flex: '1 1 30%', minWidth: '300px', position: 'sticky', top: '5rem' }}>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1.75rem', backdropFilter: 'blur(10px)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '1.5rem', background: 'var(--accent-soft)', padding: '0.5rem', borderRadius: '0.5rem' }}>🤖</div>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>AI / RAG sẽ làm gì?</h2>
              </div>

              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <span style={{ marginTop: '0.15rem', color: 'var(--accent)' }}>🔍</span>
                  <div>
                    <strong style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '0.2rem' }}>Truy xuất ngữ cảnh RAG</strong>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>Lấy nội dung sự kiện/chủ đề chính xác từ kho dữ liệu đã được chuẩn hóa.</span>
                  </div>
                </li>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <span style={{ marginTop: '0.15rem', color: 'var(--accent)' }}>📝</span>
                  <div>
                    <strong style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '0.2rem' }}>Tạo câu hỏi đa dạng</strong>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>Sinh câu hỏi 4 đáp án A/B/C/D dựa trên sự thiết lập về độ khó và loại nhận thức.</span>
                  </div>
                </li>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <span style={{ marginTop: '0.15rem', color: 'var(--accent)' }}>💡</span>
                  <div>
                    <strong style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '0.2rem' }}>Giải thích cặn kẽ</strong>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>Kèm theo phần giải thích đáp án và trích dẫn trực tiếp từ các nguồn học liệu.</span>
                  </div>
                </li>
              </ul>

              <div style={{ marginTop: '2rem', padding: '1rem', borderRadius: '0.75rem', background: 'var(--warning-soft)', border: '1px solid var(--warning)' }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '1.1rem' }}>🚧</span>
                  <strong style={{ fontSize: '0.85rem', color: 'var(--warning)' }}>Phiên bản MVP Mock</strong>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                  Ở bản MVP này, câu hỏi được lấy từ dữ liệu mô phỏng. Khi tích hợp hệ thống backend thực tế, Quiz Service sẽ liên kết trực tiếp với API LangChain và mô hình AI để sinh câu hỏi theo thời gian thực.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
