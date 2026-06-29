import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { loadExam } from '@/lib/exam/examLoader';
import {
  flattenExamQuestions,
  isMCQQuestion,
  isTFQuestion,
  type ExamFile,
  type MCQQuestion,
  type Question,
  type TFQuestion,
  type TFStatement,
} from '@/types/exam';

type MCQChoice = 'A' | 'B' | 'C' | 'D';
type TFChoice = Record<'a' | 'b' | 'c' | 'd', boolean | null>;

const cardStyle: CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: '1rem',
  padding: '1.25rem',
};

const questionTitleStyle: CSSProperties = {
  margin: 0,
  color: 'var(--text-primary)',
  fontSize: '1.05rem',
  lineHeight: 1.6,
};

function makeBlankTFChoice(): TFChoice {
  return { a: null, b: null, c: null, d: null };
}

function tfLabel(value: boolean | null | undefined): string {
  if (value == null) return 'Chưa chọn';
  return value ? 'Đúng' : 'Sai';
}

function buttonStyle(tone: 'primary' | 'secondary' | 'danger'): CSSProperties {
  const primary = tone === 'primary';
  const danger = tone === 'danger';
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.72rem 1.05rem',
    borderRadius: '0.75rem',
    border: primary ? '1px solid var(--accent)' : danger ? '1px solid var(--danger)' : '1px solid var(--border)',
    background: primary ? 'var(--accent)' : 'var(--bg-surface)',
    color: primary ? '#fff' : danger ? 'var(--danger)' : 'var(--text-primary)',
    textDecoration: 'none',
    fontWeight: 800,
    fontSize: '0.9rem',
    cursor: 'pointer',
  };
}

function chipStyle(tone: 'default' | 'success' | 'danger' | 'warning' = 'default'): CSSProperties {
  const colors = {
    default: ['var(--bg-surface)', 'var(--border)', 'var(--text-muted)'],
    success: ['rgba(47,122,87,0.1)', 'rgba(47,122,87,0.3)', 'var(--success)'],
    danger: ['rgba(159,29,45,0.08)', 'rgba(159,29,45,0.26)', 'var(--danger)'],
    warning: ['rgba(194,155,75,0.12)', 'rgba(194,155,75,0.32)', 'var(--warning)'],
  }[tone];

  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0.2rem 0.55rem',
    borderRadius: '999px',
    background: colors[0],
    border: `1px solid ${colors[1]}`,
    color: colors[2],
    fontSize: '0.75rem',
    fontWeight: 800,
  };
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', display: 'grid', placeItems: 'center', padding: '1.5rem' }}>
      <div style={{ maxWidth: '34rem', textAlign: 'center', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '2.5rem' }}>
        <h1 style={{ margin: '0 0 0.75rem', color: 'var(--text-primary)', fontSize: '1.35rem' }}>{title}</h1>
        <p style={{ margin: '0 0 1.5rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>{message}</p>
        <Link to="/exams/browse" style={buttonStyle('primary')}>Quay về danh sách đề</Link>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', display: 'grid', placeItems: 'center' }}>
      <div style={{ color: 'var(--text-muted)' }}>Đang tải đề luyện tập...</div>
    </div>
  );
}

function Explanation({ text }: { text: string }) {
  if (!text?.trim()) return null;
  return (
    <div style={{ marginTop: '1rem', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '0.8rem', padding: '0.95rem 1rem', color: 'var(--text-secondary)', lineHeight: 1.65 }}>
      <strong style={{ color: 'var(--text-primary)' }}>Giải thích: </strong>
      {text}
    </div>
  );
}

function MCQPracticeCard({
  question,
  selected,
  checked,
  onSelect,
  onCheck,
}: {
  question: MCQQuestion;
  selected: MCQChoice | null;
  checked: boolean;
  onSelect: (value: MCQChoice) => void;
  onCheck: () => void;
}) {
  const isCorrect = checked && selected === question.correctOptionId;

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <span style={chipStyle()}>MCQ</span>
        {checked && <span style={chipStyle(isCorrect ? 'success' : 'danger')}>{isCorrect ? 'Đúng' : 'Chưa đúng'}</span>}
      </div>
      <h2 style={questionTitleStyle}>{question.questionText}</h2>
      <div style={{ display: 'grid', gap: '0.65rem', marginTop: '1rem' }}>
        {question.options.map((option) => {
          const isSelected = selected === option.id;
          const isAnswer = option.id === question.correctOptionId;
          const border = checked && isAnswer ? 'rgba(47,122,87,0.38)' : checked && isSelected && !isAnswer ? 'rgba(159,29,45,0.32)' : isSelected ? 'var(--accent)' : 'var(--border)';
          const background = checked && isAnswer ? 'rgba(47,122,87,0.1)' : checked && isSelected && !isAnswer ? 'rgba(159,29,45,0.08)' : isSelected ? 'var(--accent-soft)' : 'var(--bg-surface)';
          return (
            <button key={option.id} type="button" onClick={() => onSelect(option.id)} style={{ border: `1px solid ${border}`, background, color: 'var(--text-primary)', borderRadius: '0.8rem', padding: '0.9rem 1rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start', textAlign: 'left', cursor: 'pointer' }}>
              <strong style={{ minWidth: '1.5rem', color: checked && isAnswer ? 'var(--success)' : 'var(--text-muted)' }}>{option.id}.</strong>
              <span style={{ flex: 1, lineHeight: 1.55 }}>{option.text}</span>
              {checked && isAnswer && <span style={chipStyle('success')}>Đáp án đúng</span>}
              {checked && isSelected && !isAnswer && <span style={chipStyle('danger')}>Bạn chọn</span>}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem', alignItems: 'center' }}>
        <button type="button" onClick={onCheck} disabled={!selected} style={{ ...buttonStyle('primary'), opacity: selected ? 1 : 0.55 }}>Kiểm tra</button>
        {checked && <span style={chipStyle('success')}>Đáp án đúng: {question.correctOptionId}</span>}
      </div>
      {checked && <Explanation text={question.explanation} />}
    </div>
  );
}

function TFPracticeCard({
  question,
  selected,
  checked,
  onSelect,
  onCheck,
}: {
  question: TFQuestion;
  selected: TFChoice;
  checked: boolean;
  onSelect: (statementId: TFStatement['id'], value: boolean) => void;
  onCheck: () => void;
}) {
  const allAnswered = Object.values(selected).every((value) => value != null);
  const correctCount = question.statements.filter((statement) => selected[statement.id] === statement.isTrue).length;

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <span style={chipStyle()}>Đúng/Sai</span>
        {checked && <span style={chipStyle(correctCount === 4 ? 'success' : 'warning')}>{correctCount}/4 ý đúng</span>}
      </div>
      <h2 style={questionTitleStyle}>{question.questionText}</h2>
      <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem' }}>
        {question.statements.map((statement) => {
          const current = selected[statement.id];
          const rowCorrect = checked && current === statement.isTrue;
          const rowWrong = checked && current !== null && current !== statement.isTrue;
          const border = rowCorrect ? 'rgba(47,122,87,0.35)' : rowWrong ? 'rgba(159,29,45,0.32)' : 'var(--border)';
          const background = rowCorrect ? 'rgba(47,122,87,0.08)' : rowWrong ? 'rgba(159,29,45,0.07)' : 'var(--bg-surface)';
          return (
            <div key={statement.id} style={{ border: `1px solid ${border}`, background, borderRadius: '0.8rem', padding: '0.9rem 1rem' }}>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                <strong style={{ color: 'var(--text-muted)' }}>{statement.id})</strong>
                <span style={{ flex: 1, lineHeight: 1.55, color: 'var(--text-primary)' }}>{statement.text}</span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem', paddingLeft: '1.8rem' }}>
                {[true, false].map((value) => (
                  <button key={`${statement.id}-${value}`} type="button" onClick={() => onSelect(statement.id, value)} style={{ ...buttonStyle(current === value ? 'primary' : 'secondary'), padding: '0.45rem 0.8rem', fontSize: '0.82rem' }}>
                    {value ? 'Đúng' : 'Sai'}
                  </button>
                ))}
                {checked && <span style={chipStyle('success')}>Đáp án đúng: {tfLabel(statement.isTrue)}</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem', alignItems: 'center' }}>
        <button type="button" onClick={onCheck} disabled={!allAnswered} style={{ ...buttonStyle('primary'), opacity: allAnswered ? 1 : 0.55 }}>Kiểm tra</button>
        {!allAnswered && <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Hãy chọn Đúng/Sai cho đủ 4 ý.</span>}
      </div>
      {checked && <Explanation text={question.explanation} />}
    </div>
  );
}

export default function ExamPracticePage() {
  const { examId } = useParams<{ examId: string }>();
  const [exam, setExam] = useState<ExamFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const [mcqAnswers, setMcqAnswers] = useState<Record<string, MCQChoice | null>>({});
  const [tfAnswers, setTfAnswers] = useState<Record<string, TFChoice>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    async function loadData() {
      if (!examId) {
        setError('Liên kết luyện tập không hợp lệ.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const loadedExam = await loadExam(examId);
        if (!alive) return;
        setExam(loadedExam);
      } catch (err) {
        if (!alive) return;
        const detail = err instanceof Error ? err.message : 'Không rõ nguyên nhân.';
        setError(`Không tải được đề luyện tập. ${detail}`);
      } finally {
        if (alive) setLoading(false);
      }
    }
    void loadData();
    return () => {
      alive = false;
    };
  }, [examId]);

  const questions = useMemo(() => (exam ? flattenExamQuestions(exam) : []), [exam]);
  const currentQuestion: Question | undefined = questions[currentIndex];
  const checkedCount = questions.filter((question) => checked[question.id]).length;
  const correctCount = questions.filter((question) => {
    if (!checked[question.id]) return false;
    if (isMCQQuestion(question)) return mcqAnswers[question.id] === question.correctOptionId;
    if (isTFQuestion(question)) {
      const answer = tfAnswers[question.id];
      return !!answer && question.statements.every((statement) => answer[statement.id] === statement.isTrue);
    }
    return false;
  }).length;
  const mcqCount = questions.filter(isMCQQuestion).length;
  const tfCount = questions.filter(isTFQuestion).length;

  function resetPractice() {
    setCurrentIndex(0);
    setFinished(false);
    setMcqAnswers({});
    setTfAnswers({});
    setChecked({});
  }

  if (loading) return <LoadingState />;
  if (error || !exam) return <EmptyState title="Chưa thể mở luyện tập" message={error ?? 'Dữ liệu đề chưa sẵn sàng.'} />;
  if (questions.length === 0) return <EmptyState title="Đề chưa có câu hỏi" message="Không tìm thấy câu hỏi trong file đề này." />;

  if (finished) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-primary)', padding: '2rem 1.5rem' }}>
        <div style={{ maxWidth: '42rem', margin: '0 auto', display: 'grid', gap: '1rem' }}>
          <div style={{ ...cardStyle, textAlign: 'center', padding: '2rem' }}>
            <span style={chipStyle('success')}>Luyện tập tự do</span>
            <h1 style={{ margin: '0.8rem 0 0.75rem', fontSize: '1.5rem', fontWeight: 900 }}>Hoàn thành luyện tập</h1>
            <p style={{ margin: '0 0 1.5rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>Bạn đã kiểm tra {checkedCount}/{questions.length} câu. Số câu đúng hoàn toàn: {correctCount}.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center' }}>
              <button type="button" onClick={resetPractice} style={buttonStyle('primary')}>Làm lại</button>
              <Link to="/exams/browse" style={buttonStyle('secondary')}>Chọn đề khác</Link>
              <Link to={`/exams/de/${exam.examId}`} style={buttonStyle('secondary')}>Thi thử đề này</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-primary)', padding: '2rem 1.5rem' }}>
      <div style={{ maxWidth: '52rem', margin: '0 auto', display: 'grid', gap: '1rem' }}>
        <header style={{ display: 'grid', gap: '0.55rem' }}>
          <Link to="/exams/browse" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.875rem' }}>← Danh sách đề</Link>
          <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <h1 style={{ margin: 0, fontSize: '1.65rem', fontWeight: 900 }}>Luyện tập tự do</h1>
            <span style={chipStyle('warning')}>Không giới hạn thời gian</span>
          </div>
          <p style={{ margin: 0, color: 'var(--text-primary)', fontWeight: 700, lineHeight: 1.55 }}>{exam.title}</p>
          <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.55 }}>Không giới hạn thời gian, kiểm tra đáp án ngay sau từng câu.</p>
        </header>

        <div style={{ ...cardStyle, padding: '1rem 1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <strong>Câu {currentIndex + 1}/{questions.length}</strong>
            <span style={{ color: 'var(--text-muted)' }}>Đã kiểm tra {checkedCount}/{questions.length}</span>
            <span style={{ color: 'var(--text-muted)' }}>Đúng hoàn toàn {correctCount}</span>
            <span style={{ flex: 1 }} />
            <span style={chipStyle()}>{mcqCount} MCQ · {tfCount} Đúng/Sai</span>
          </div>
          <div style={{ height: '0.45rem', background: 'var(--bg-surface)', borderRadius: '999px', overflow: 'hidden', marginTop: '0.8rem' }}>
            <div style={{ width: `${((currentIndex + 1) / questions.length) * 100}%`, height: '100%', background: 'var(--accent)', borderRadius: '999px' }} />
          </div>
        </div>

        {currentQuestion && isMCQQuestion(currentQuestion) && (
          <MCQPracticeCard question={currentQuestion} selected={mcqAnswers[currentQuestion.id] ?? null} checked={!!checked[currentQuestion.id]} onSelect={(value) => setMcqAnswers((prev) => ({ ...prev, [currentQuestion.id]: value }))} onCheck={() => setChecked((prev) => ({ ...prev, [currentQuestion.id]: true }))} />
        )}

        {currentQuestion && isTFQuestion(currentQuestion) && (
          <TFPracticeCard question={currentQuestion} selected={tfAnswers[currentQuestion.id] ?? makeBlankTFChoice()} checked={!!checked[currentQuestion.id]} onSelect={(statementId, value) => setTfAnswers((prev) => ({ ...prev, [currentQuestion.id]: { ...(prev[currentQuestion.id] ?? makeBlankTFChoice()), [statementId]: value } }))} onCheck={() => setChecked((prev) => ({ ...prev, [currentQuestion.id]: true }))} />
        )}

        <nav style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <button type="button" onClick={() => setCurrentIndex((value) => Math.max(value - 1, 0))} disabled={currentIndex === 0} style={{ ...buttonStyle('secondary'), opacity: currentIndex === 0 ? 0.55 : 1 }}>Câu trước</button>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setFinished(true)} style={buttonStyle('danger')}>Kết thúc luyện tập</button>
            {currentIndex < questions.length - 1 ? (
              <button type="button" onClick={() => setCurrentIndex((value) => Math.min(value + 1, questions.length - 1))} style={buttonStyle('primary')}>Câu tiếp theo</button>
            ) : (
              <button type="button" onClick={() => setFinished(true)} style={buttonStyle('primary')}>Hoàn thành</button>
            )}
          </div>
        </nav>
      </div>
    </div>
  );
}
