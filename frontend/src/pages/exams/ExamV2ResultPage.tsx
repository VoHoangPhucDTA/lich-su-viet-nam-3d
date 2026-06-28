/**
 * Detailed result page for an exam session.
 * Route: /exams/ket-qua/:sessionId
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { loadExam } from '@/lib/exam/examLoader';
import { rateScore, scoreToPercent } from '@/lib/exam/scoring';
import { readResultFromLS } from '@/lib/exam/useSessionV2';
import {
  flattenExamQuestions,
  isMCQQuestion,
  isTFQuestion,
  type CognitiveLevel,
  type DifficultyLevel,
  type ExamFile,
  type ExamResultV2,
  type MCQOption,
  type MCQQuestion,
  type Question,
  type QuestionResult,
  type TFQuestion,
  type TFStatement,
} from '@/types/exam';

const RATING_LABEL: Record<string, string> = {
  gioi: 'Giỏi',
  kha: 'Khá',
  trung_binh: 'Trung bình',
  yeu: 'Yếu',
};

const RATING_COLOR: Record<string, string> = {
  gioi: 'var(--success)',
  kha: 'var(--accent)',
  trung_binh: 'var(--warning)',
  yeu: 'var(--danger)',
};

const DIFFICULTY_LABEL: Record<DifficultyLevel, string> = {
  easy: 'Dễ',
  medium: 'Trung bình',
  hard: 'Khó',
};

const COGNITIVE_LABEL: Record<CognitiveLevel, string> = {
  knowledge: 'Nhận biết',
  comprehension: 'Thông hiểu',
  application: 'Vận dụng',
};

const TF_LABEL: Record<'true' | 'false' | 'blank', string> = {
  true: 'Đúng',
  false: 'Sai',
  blank: 'Chưa chọn',
};

function formatPoints(points: number): string {
  return points > 0 ? `+${points.toFixed(2)}đ` : '0đ';
}

function formatDuration(seconds: number): string {
  const durationMin = Math.floor(seconds / 60);
  const durationSec = seconds % 60;
  return `${durationMin}p ${durationSec}s`;
}

function getAnsweredCount(result: ExamResultV2): number {
  return result.questions.filter((q) => {
    if (q.questionType === 'mcq') return q.mcq?.selected != null;
    if (!q.tf?.selected) return false;
    return Object.values(q.tf.selected).some((value) => value != null);
  }).length;
}

function Chip({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'success' | 'danger' | 'warning' }) {
  const colors = {
    default: ['var(--bg-surface)', 'var(--border)', 'var(--text-muted)'],
    success: ['rgba(47,122,87,0.1)', 'rgba(47,122,87,0.28)', 'var(--success)'],
    danger: ['rgba(159,29,45,0.08)', 'rgba(159,29,45,0.22)', 'var(--danger)'],
    warning: ['rgba(194,155,75,0.12)', 'rgba(194,155,75,0.28)', 'var(--warning)'],
  }[tone];

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: '999px',
        border: `1px solid ${colors[1]}`,
        background: colors[0],
        color: colors[2],
        fontSize: '0.75rem',
        fontWeight: 700,
        padding: '0.2rem 0.55rem',
      }}
    >
      {children}
    </span>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '1.25rem', fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{label}</div>
    </div>
  );
}

function ScoreCard({ result }: { result: ExamResultV2 }) {
  const rating = rateScore(result.totalScore);
  const pct = scoreToPercent(result.totalScore);
  const color = RATING_COLOR[rating];
  const answered = getAnsweredCount(result);
  const blank = Math.max(result.totalQuestions - answered, 0);

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        borderRadius: '1.25rem',
        padding: '2rem',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow)',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
        Tổng điểm
      </div>
      <div style={{ fontSize: '4rem', fontWeight: 900, color, lineHeight: 1, marginBottom: '0.5rem' }}>
        {result.totalScore.toFixed(2)}
      </div>
      <div style={{ fontSize: '1rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
        / 10 · <span style={{ fontWeight: 800, color }}>{RATING_LABEL[rating]}</span> ({pct}%)
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '1.5rem',
          flexWrap: 'wrap',
          paddingTop: '1rem',
          borderTop: '1px solid var(--border)',
        }}
      >
        <Stat label="MCQ" value={`${result.mcqScore.toFixed(2)}đ`} color="var(--accent)" />
        <Stat label="Đúng/Sai" value={`${result.tfScore.toFixed(2)}đ`} color="var(--admin-accent)" />
        <Stat label="Thời gian" value={formatDuration(result.durationSeconds)} color="var(--text-muted)" />
        <Stat label="Đã làm" value={`${answered}/${result.totalQuestions}`} color="var(--success)" />
        <Stat label="Bỏ trống" value={`${blank}`} color="var(--text-muted)" />
      </div>
    </div>
  );
}

function MCQBreakdown({ result }: { result: ExamResultV2 }) {
  return (
    <section style={{ background: 'var(--bg-card)', borderRadius: '1rem', padding: '1.25rem', border: '1px solid var(--border)' }}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--admin-accent)' }}>01</span>
        <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>Phần I - Trắc nghiệm MCQ</h2>
        <span style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
        <span style={{ fontWeight: 800, color: 'var(--accent)', fontSize: '1.05rem' }}>{result.mcqScore.toFixed(2)}đ</span>
      </header>
      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
        <Stat label="Đúng" value={`${result.correctMCQ}`} color="var(--success)" />
        <Stat label="Sai" value={`${result.wrongMCQ}`} color="var(--danger)" />
        <Stat label="Bỏ trống" value={`${result.blankMCQ}`} color="var(--text-muted)" />
      </div>
    </section>
  );
}

function TFBreakdown({ result }: { result: ExamResultV2 }) {
  const ladderLabels = ['0 ý', '1 ý', '2 ý', '3 ý', '4 ý'];
  const ladderPoints = [0, 0.1, 0.25, 0.5, 1.0];

  return (
    <section style={{ background: 'var(--bg-card)', borderRadius: '1rem', padding: '1.25rem', border: '1px solid var(--border)' }}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--admin-accent)' }}>02</span>
        <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>Phần II - Đúng / Sai</h2>
        <span style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
        <span style={{ fontWeight: 800, color: 'var(--admin-accent)', fontSize: '1.05rem' }}>{result.tfScore.toFixed(2)}đ</span>
      </header>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        {result.tfBreakdown.map((count, i) => (
          <div
            key={ladderLabels[i]}
            style={{
              background: count > 0 ? 'var(--accent-soft)' : 'var(--bg-surface)',
              border: `1px solid ${count > 0 ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: '0.75rem',
              padding: '0.6rem 1rem',
              textAlign: 'center',
              minWidth: '4.5rem',
            }}
          >
            <div style={{ fontWeight: 800, fontSize: '1.25rem', color: count > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>{count}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{ladderLabels[i]}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>→ {ladderPoints[i]}đ</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Metadata({ question }: { question: Question }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.75rem' }}>
      <Chip>{question.topic}</Chip>
      <Chip>{DIFFICULTY_LABEL[question.difficulty]}</Chip>
      <Chip>{COGNITIVE_LABEL[question.cognitiveLevel]}</Chip>
    </div>
  );
}

function Explanation({ text }: { text: string }) {
  if (!text?.trim()) return null;
  return (
    <div
      style={{
        marginTop: '1rem',
        borderRadius: '0.75rem',
        border: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        padding: '0.9rem 1rem',
        color: 'var(--text-secondary)',
        fontSize: '0.9rem',
        lineHeight: 1.65,
      }}
    >
      <strong style={{ color: 'var(--text-primary)' }}>Giải thích: </strong>
      {text}
    </div>
  );
}

function optionStyle(option: MCQOption, result: QuestionResult) {
  const selected = result.mcq?.selected;
  const correct = result.mcq?.correct;
  const isCorrect = option.id === correct;
  const isSelected = option.id === selected;

  if (isCorrect) {
    return {
      border: 'rgba(47,122,87,0.35)',
      background: 'rgba(47,122,87,0.1)',
      color: 'var(--success)',
    };
  }
  if (isSelected) {
    return {
      border: 'rgba(159,29,45,0.32)',
      background: 'rgba(159,29,45,0.08)',
      color: 'var(--danger)',
    };
  }
  return {
    border: 'var(--border)',
    background: 'var(--bg-surface)',
    color: 'var(--text-secondary)',
  };
}

function MCQReviewCard({ question, result, index }: { question: MCQQuestion; result: QuestionResult; index: number }) {
  const selected = result.mcq?.selected ?? null;
  const correct = result.mcq?.correct ?? question.correctOptionId;
  const statusTone = selected == null ? 'warning' : result.isCorrect ? 'success' : 'danger';
  const statusText = selected == null ? 'Bỏ trống' : result.isCorrect ? 'Đúng' : 'Sai';

  return (
    <article style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1.25rem' }}>
      <header style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
        <div style={{ minWidth: '2.5rem', height: '2.5rem', borderRadius: '0.75rem', background: 'var(--accent-soft)', color: 'var(--accent)', display: 'grid', placeItems: 'center', fontWeight: 900 }}>
          {index + 1}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.65rem' }}>
            <Chip>MCQ</Chip>
            <Chip tone={statusTone}>{statusText}</Chip>
            <Chip>{formatPoints(result.pointsEarned)}</Chip>
          </div>
          <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1rem', lineHeight: 1.55 }}>{question.questionText}</h3>
          <Metadata question={question} />
        </div>
      </header>

      <div style={{ display: 'grid', gap: '0.65rem', marginTop: '1rem' }}>
        {question.options.map((option) => {
          const style = optionStyle(option, result);
          const isSelected = option.id === selected;
          const isCorrect = option.id === correct;
          return (
            <div
              key={option.id}
              style={{
                display: 'flex',
                gap: '0.75rem',
                alignItems: 'flex-start',
                border: `1px solid ${style.border}`,
                background: style.background,
                borderRadius: '0.75rem',
                padding: '0.85rem 0.95rem',
                color: style.color,
              }}
            >
              <strong style={{ minWidth: '1.5rem' }}>{option.id}.</strong>
              <span style={{ flex: 1, color: 'var(--text-primary)', lineHeight: 1.55 }}>{option.text}</span>
              {isCorrect && <Chip tone="success">Đáp án đúng</Chip>}
              {isSelected && !isCorrect && <Chip tone="danger">Bạn chọn</Chip>}
              {isSelected && isCorrect && <Chip tone="success">Bạn chọn</Chip>}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem' }}>
        <Chip tone={selected ? 'default' : 'warning'}>Bạn chọn: {selected ?? 'Chưa chọn'}</Chip>
        <Chip tone="success">Đáp án đúng: {correct}</Chip>
      </div>
      <Explanation text={question.explanation} />
    </article>
  );
}

function tfAnswerLabel(value: boolean | null | undefined): string {
  if (value == null) return TF_LABEL.blank;
  return value ? TF_LABEL.true : TF_LABEL.false;
}

function TFStatementRow({ statement, result }: { statement: TFStatement; result: QuestionResult }) {
  const selected = result.tf?.selected?.[statement.id] ?? null;
  const correct = result.tf?.correct?.[statement.id] ?? statement.isTrue;
  const isBlank = selected == null;
  const isCorrect = selected === correct;
  const border = isBlank ? 'var(--border)' : isCorrect ? 'rgba(47,122,87,0.35)' : 'rgba(159,29,45,0.32)';
  const background = isBlank ? 'var(--bg-surface)' : isCorrect ? 'rgba(47,122,87,0.08)' : 'rgba(159,29,45,0.07)';

  return (
    <div
      style={{
        border: `1px solid ${border}`,
        background,
        borderRadius: '0.75rem',
        padding: '0.85rem 0.95rem',
        display: 'grid',
        gap: '0.65rem',
      }}
    >
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
        <strong style={{ minWidth: '1.5rem', color: 'var(--text-muted)' }}>{statement.id})</strong>
        <span style={{ color: 'var(--text-primary)', lineHeight: 1.55 }}>{statement.text}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', paddingLeft: '2.25rem' }}>
        <Chip tone={isBlank ? 'warning' : isCorrect ? 'success' : 'danger'}>Bạn chọn: {tfAnswerLabel(selected)}</Chip>
        <Chip tone="success">Đáp án đúng: {tfAnswerLabel(correct)}</Chip>
      </div>
    </div>
  );
}

function TFReviewCard({ question, result, index }: { question: TFQuestion; result: QuestionResult; index: number }) {
  const correctCount = result.tf?.correctCount ?? 0;
  const statusTone = correctCount === 4 ? 'success' : result.pointsEarned > 0 ? 'warning' : 'danger';

  return (
    <article style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1.25rem' }}>
      <header style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
        <div style={{ minWidth: '2.5rem', height: '2.5rem', borderRadius: '0.75rem', background: 'var(--admin-accent-soft)', color: 'var(--admin-accent)', display: 'grid', placeItems: 'center', fontWeight: 900 }}>
          {index + 1}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.65rem' }}>
            <Chip>Đúng/Sai</Chip>
            <Chip tone={statusTone}>{correctCount}/4 ý đúng</Chip>
            <Chip>{formatPoints(result.pointsEarned)}</Chip>
          </div>
          <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1rem', lineHeight: 1.55 }}>{question.questionText}</h3>
          <Metadata question={question} />
        </div>
      </header>

      <div style={{ display: 'grid', gap: '0.65rem', marginTop: '1rem' }}>
        {question.statements.map((statement) => (
          <TFStatementRow key={statement.id} statement={statement} result={result} />
        ))}
      </div>
      <Explanation text={question.explanation} />
    </article>
  );
}

function MissingQuestionCard({ result, index }: { result: QuestionResult; index: number }) {
  return (
    <article style={{ background: 'var(--bg-card)', border: '1px solid rgba(194,155,75,0.35)', borderRadius: '1rem', padding: '1.25rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <Chip tone="warning">Câu {index + 1}</Chip>
        <Chip tone="warning">Không tìm thấy câu hỏi</Chip>
        <Chip>{formatPoints(result.pointsEarned)}</Chip>
      </div>
      <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        Kết quả có questionId <strong>{result.questionId}</strong>, nhưng câu hỏi này không có trong file đề hiện tại. Điểm đã lưu vẫn được giữ nguyên.
      </p>
    </article>
  );
}

function ReviewCard({ result, question, index }: { result: QuestionResult; question?: Question; index: number }) {
  if (!question) return <MissingQuestionCard result={result} index={index} />;
  if (isMCQQuestion(question)) return <MCQReviewCard question={question} result={result} index={index} />;
  if (isTFQuestion(question)) return <TFReviewCard question={question} result={result} index={index} />;
  return <MissingQuestionCard result={result} index={index} />;
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)', padding: '1.5rem' }}>
      <div style={{ textAlign: 'center', background: 'var(--bg-card)', padding: '2.5rem', borderRadius: '1.25rem', border: '1px solid var(--border)', maxWidth: '34rem' }}>
        <h2 style={{ color: 'var(--danger)', margin: '0 0 1rem' }}>{title}</h2>
        <p style={{ color: 'var(--text-muted)', margin: '0 0 1.5rem', lineHeight: 1.6 }}>{message}</p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link to="/exams/browse" style={{ padding: '0.75rem 1.25rem', background: 'var(--accent)', color: '#fff', borderRadius: '0.75rem', textDecoration: 'none', fontWeight: 700 }}>
            Xem danh sách đề
          </Link>
          <Link to="/exams/lich-su-v2" style={{ padding: '0.75rem 1.25rem', background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '0.75rem', textDecoration: 'none', fontWeight: 700 }}>
            Xem lịch sử
          </Link>
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)', color: 'var(--accent)' }}>
      <div style={{ width: '2rem', height: '2rem', border: '3px solid var(--accent-soft)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function ExamV2ResultPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [result, setResult] = useState<ExamResultV2 | null>(null);
  const [exam, setExam] = useState<ExamFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function loadResultAndExam() {
      if (!sessionId) {
        setLoading(false);
        setError('Liên kết kết quả không hợp lệ.');
        return;
      }

      setLoading(true);
      setError(null);
      setExam(null);

      const storedResult = readResultFromLS(sessionId);
      if (!storedResult) {
        if (!alive) return;
        setResult(null);
        setLoading(false);
        setError('Kết quả đã bị xóa hoặc liên kết không hợp lệ.');
        return;
      }

      if (!alive) return;
      setResult(storedResult);

      if (!storedResult.examId) {
        setLoading(false);
        setError('Kết quả này được lưu từ phiên bản cũ và thiếu mã đề, nên chưa thể hiển thị review chi tiết.');
        return;
      }

      try {
        const loadedExam = await loadExam(storedResult.examId);
        if (!alive) return;
        setExam(loadedExam);
      } catch (err) {
        if (!alive) return;
        const detail = err instanceof Error ? err.message : 'Không rõ nguyên nhân.';
        setError(`Không tải được file đề thi để hiển thị review chi tiết. ${detail}`);
      } finally {
        if (alive) setLoading(false);
      }
    }

    void loadResultAndExam();

    return () => {
      alive = false;
    };
  }, [sessionId]);

  const questionMap = useMemo(() => {
    if (!exam) return new Map<string, Question>();
    return new Map(flattenExamQuestions(exam).map((question) => [question.id, question]));
  }, [exam]);

  if (loading) return <LoadingState />;

  if (!result) {
    return <EmptyState title="Không tìm thấy kết quả" message={error ?? 'Kết quả đã bị xóa hoặc liên kết không hợp lệ.'} />;
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-primary)', padding: '2rem 1.5rem' }}>
      <div style={{ maxWidth: '58rem', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <Link to="/exams/browse" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.875rem' }}>
            ← Danh sách đề
          </Link>
          <Link to="/exams/lich-su-v2" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.875rem' }}>
            Lịch sử làm bài
          </Link>
        </div>

        <div>
          <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 900 }}>Kết quả luyện thi</h1>
          {exam && <p style={{ margin: '0.45rem 0 0', color: 'var(--text-muted)', lineHeight: 1.5 }}>{exam.title}</p>}
        </div>

        {error && (
          <div style={{ background: 'rgba(194,155,75,0.1)', border: '1px solid rgba(194,155,75,0.35)', borderRadius: '1rem', padding: '1rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--warning)' }}>Lưu ý: </strong>
            {error}
          </div>
        )}

        <ScoreCard result={result} />
        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(18rem, 1fr))' }}>
          <MCQBreakdown result={result} />
          <TFBreakdown result={result} />
        </div>

        <section style={{ display: 'grid', gap: '1rem' }}>
          <header style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: 'var(--text-primary)' }}>Review chi tiết từng câu</h2>
            <span style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{result.questions.length} câu</span>
          </header>

          {exam ? (
            result.questions.map((questionResult, index) => (
              <ReviewCard
                key={`${questionResult.questionId}-${index}`}
                result={questionResult}
                question={questionMap.get(questionResult.questionId)}
                index={index}
              />
            ))
          ) : (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1.25rem', color: 'var(--text-secondary)' }}>
              Chưa thể hiển thị review chi tiết vì không tải được dữ liệu đề. Điểm tổng và breakdown phía trên vẫn là dữ liệu đã lưu khi nộp bài.
            </div>
          )}
        </section>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {result.examId && (
            <Link to={`/exams/de/${result.examId}`} style={{ padding: '0.75rem 1.5rem', background: 'var(--accent)', color: '#fff', borderRadius: '0.875rem', textDecoration: 'none', fontWeight: 700, fontSize: '0.9rem' }}>
              Làm lại đề này
            </Link>
          )}
          <Link to="/exams/browse" style={{ padding: '0.75rem 1.5rem', background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '0.875rem', textDecoration: 'none', fontWeight: 700, fontSize: '0.9rem' }}>
            Chọn đề khác
          </Link>
        </div>
      </div>
    </div>
  );
}
