import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import ExamQuestionRenderer from '@/components/exams/ExamQuestionRenderer';
import { useApiPracticeSession } from '@/lib/exam/useApiPracticeSession';
import { useQuestionNavigation } from '@/lib/exam/useQuestionNavigation';
import type { CreateExamSessionRequest, SafeQuestionType } from '@/types/examApi';

const BLANK_TF: Record<'a' | 'b' | 'c' | 'd', boolean | null> = { a: null, b: null, c: null, d: null };

export interface ApiPracticeSessionPageProps {
  routeKey: string;
  request: CreateExamSessionRequest | null;
  title: string;
  modeLabel: string;
  backTo: string;
  backLabel: string;
  initialSessionId?: string;
  legacyFallback?: ReactNode;
}

function PracticeFeedback({ questionType, result }: { questionType: SafeQuestionType; result: NonNullable<ReturnType<typeof useApiPracticeSession>['currentQuestion']>['checkedResult'] }) {
  if (!result) return null;
  return (
    <section style={{ marginTop: '0.9rem', padding: '1rem', background: result.correct ? 'rgba(47,122,87,0.08)' : 'rgba(159,29,45,0.07)', border: `1px solid ${result.correct ? 'var(--success)' : 'var(--danger)'}`, borderRadius: '0.75rem', lineHeight: 1.6 }}>
      <strong style={{ color: result.correct ? 'var(--success)' : 'var(--danger)' }}>{result.correct ? 'Trả lời đúng' : 'Cần xem lại'}</strong>
      {questionType === 'mcq' && <p style={{ margin: '0.45rem 0 0' }}>Đáp án đúng: <strong>{String(result.correctAnswer)}</strong></p>}
      {questionType === 'true_false' && <p style={{ margin: '0.45rem 0 0' }}>Bạn trả lời đúng {result.correctCount}/4 ý.</p>}
      {result.explanation && <p style={{ margin: '0.65rem 0 0' }}><strong>Giải thích: </strong>{result.explanation}</p>}
    </section>
  );
}

export default function ApiPracticeSessionPage({ routeKey, request, title, modeLabel, backTo, backLabel, initialSessionId, legacyFallback }: ApiPracticeSessionPageProps) {
  const [finishError, setFinishError] = useState<string | null>(null);
  const questionRef = useRef<HTMLDivElement>(null);
  const {
    serverSession, questions, currentQuestion, currentIndex, answers, loading, error, fallbackEligible,
    checkingId, practiceSummary, checkedCount, correctCount, isComplete, setAnswer, navigate, checkCurrent, complete,
  } = useApiPracticeSession(routeKey, request, initialSessionId);
  const navigateToQuestion = useQuestionNavigation({ questionCount: questions.length, onIndexChange: navigate, questionRef });
  const selected = currentQuestion ? answers[currentQuestion.questionInstanceId]?.selected : null;
  const selectedMCQ = typeof selected === 'string' ? selected : null;
  const selectedTF = selected && typeof selected === 'object' && !Array.isArray(selected) ? selected : BLANK_TF;
  const canCheck = currentQuestion && !currentQuestion.checkedResult && !checkingId
    && (currentQuestion.question.questionType === 'mcq' ? selectedMCQ !== null : Object.values(selectedTF).every((value) => value !== null));
  const progress = questions.length ? Math.round((checkedCount / questions.length) * 100) : 0;
  const modeName = useMemo(() => serverSession?.title || title, [serverSession?.title, title]);

  const finish = useCallback(async () => {
    setFinishError(null);
    try {
      await complete();
    } catch (completeError: unknown) {
      setFinishError(completeError instanceof Error ? completeError.message : 'Không thể kết thúc phiên luyện tập.');
    }
  }, [complete]);

  if (loading) return <div style={stateStyle}>Đang chuẩn bị phiên luyện tập...</div>;
  if (fallbackEligible && legacyFallback) return <>{legacyFallback}</>;
  if (error || !serverSession || !currentQuestion) return <div style={stateStyle}>{error ?? 'Không thể mở phiên luyện tập.'}</div>;
  if (isComplete) {
    const summary = practiceSummary ?? serverSession.practiceSummary;
    return (
      <div style={pageStyle}>
        <main style={contentStyle}>
          <Link to={backTo} style={backStyle}>← {backLabel}</Link>
          <section style={cardStyle}>
            <p style={{ margin: 0, color: 'var(--success)', fontWeight: 800 }}>{modeLabel}</p>
            <h1 style={{ margin: '0.6rem 0' }}>Hoàn thành luyện tập</h1>
            <p style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>Đã kiểm tra {summary?.checkedQuestions ?? checkedCount}/{summary?.totalQuestions ?? questions.length} câu, đúng {summary?.correctQuestions ?? correctCount} câu.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}><Link to={backTo} style={buttonStyle}>Quay lại</Link><Link to="/exams/browse" style={secondaryButtonStyle}>Danh sách đề</Link></div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <main style={contentStyle}>
        <Link to={backTo} style={backStyle}>← {backLabel}</Link>
        <header><p style={{ margin: 0, color: 'var(--accent)', fontWeight: 800 }}>{modeLabel}</p><h1 style={{ margin: '0.45rem 0 0' }}>{modeName}</h1></header>
        {(error || finishError) && <p role="alert" style={errorStyle}>{finishError ?? error}</p>}
        <section style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}><strong>Câu {currentIndex + 1}/{questions.length}</strong><span>Đã kiểm tra {checkedCount}/{questions.length} · Đúng {correctCount}</span></div>
          <div role="progressbar" aria-label="Tiến độ kiểm tra" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} style={{ height: '0.45rem', marginTop: '0.8rem', background: 'var(--bg-surface)', borderRadius: '99px', overflow: 'hidden' }}><div style={{ width: `${progress}%`, height: '100%', background: 'var(--accent)' }} /></div>
        </section>
        <div ref={questionRef} tabIndex={-1} data-exam-current-question>
          <ExamQuestionRenderer question={currentQuestion.question} index={currentIndex} total={questions.length} selectedMCQ={selectedMCQ} selectedTF={selectedTF}
            disabled={Boolean(currentQuestion.checkedResult)}
            onMCQSelect={(optionId) => {
              if (!currentQuestion.checkedResult) setAnswer(currentQuestion.questionInstanceId, 'mcq', optionId);
            }}
            onTFSelect={(statementId, value) => {
              if (!currentQuestion.checkedResult) setAnswer(currentQuestion.questionInstanceId, 'true_false', { ...selectedTF, [statementId]: value });
            }} />
          <PracticeFeedback questionType={currentQuestion.question.questionType} result={currentQuestion.checkedResult} />
        </div>
        <nav style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => navigateToQuestion(currentIndex - 1)} disabled={currentIndex === 0} style={secondaryButtonStyle}>Câu trước</button>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => void finish()} style={{ ...secondaryButtonStyle, borderColor: 'var(--danger)', color: 'var(--danger)' }}>Kết thúc</button>
            <button type="button" onClick={() => void checkCurrent()} disabled={!canCheck} style={{ ...buttonStyle, opacity: canCheck ? 1 : 0.55 }}>{checkingId ? 'Đang kiểm tra...' : currentQuestion.checkedResult ? 'Đã kiểm tra' : 'Kiểm tra'}</button>
            <button type="button" onClick={() => navigateToQuestion(currentIndex + 1)} disabled={currentIndex === questions.length - 1} style={buttonStyle}>Câu tiếp theo</button>
          </div>
        </nav>
      </main>
    </div>
  );
}

const pageStyle = { minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-primary)', padding: '2rem 1.5rem' };
const contentStyle = { maxWidth: '58rem', margin: '0 auto', display: 'grid', gap: '1.2rem' };
const cardStyle = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1.25rem' };
const stateStyle = { minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg-app)', color: 'var(--text-primary)', padding: '1.5rem' };
const backStyle = { color: 'var(--text-muted)', textDecoration: 'none' };
const buttonStyle = { padding: '0.7rem 1rem', borderRadius: '0.7rem', border: '1px solid var(--accent)', background: 'var(--accent)', color: '#fff', fontWeight: 800, textDecoration: 'none', cursor: 'pointer' };
const secondaryButtonStyle = { padding: '0.7rem 1rem', borderRadius: '0.7rem', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontWeight: 700, textDecoration: 'none', cursor: 'pointer' };
const errorStyle = { margin: 0, padding: '0.8rem 1rem', border: '1px solid var(--danger)', borderRadius: '0.7rem', color: 'var(--danger)' };
