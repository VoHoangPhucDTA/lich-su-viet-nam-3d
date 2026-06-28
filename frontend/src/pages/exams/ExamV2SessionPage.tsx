/**
 * ExamV2SessionPage – Giao diện làm bài thi thật (format thpt_2025).
 * Route: /exams/de/:examId
 *
 * Tái sử dụng: ExamTimer, ExamSubmitDialog, ExamNavigation (type-compatible).
 * Mới: MCQQuestionCardV2, TFQuestionCard, useSessionV2.
 */
import { useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useSessionV2 } from '@/lib/exam/useSessionV2';
import type { QuestionDisplayStatus } from '@/lib/exam/useSessionV2';
import { isMCQQuestion, isTFQuestion } from '@/types/exam';
import MCQQuestionCardV2 from '../../components/exams/MCQQuestionCardV2';
import TFQuestionCard from '../../components/exams/TFQuestionCard';
import ExamTimer from '../../components/exams/ExamTimer';
import ExamSubmitDialog from '../../components/exams/ExamSubmitDialog';
import ExamNavigation from '../../components/exams/ExamNavigation';
import type { ExamQuestionStatus } from '../../types/exam';

// ── Progress Sidebar ──────────────────────────────────────────────────────────
function ProgressSidebar({
  flatQuestions,
  currentIndex,
  questionStatuses,
  onNavigate,
}: {
  flatQuestions: ReturnType<typeof useSessionV2>['flatQuestions'];
  currentIndex: number;
  questionStatuses: Record<string, QuestionDisplayStatus>;
  onNavigate: (i: number) => void;
}) {
  const mcqCount = flatQuestions.filter((q) => q.questionType === 'mcq').length;

  function boxStyle(idx: number): React.CSSProperties {
    const q = flatQuestions[idx];
    if (!q) return {};
    const status = questionStatuses[q.id] ?? 'unanswered';
    const isCurrent = idx === currentIndex;

    const base: React.CSSProperties = {
      width: '2rem',
      height: '2rem',
      borderRadius: '0.375rem',
      fontSize: '0.7rem',
      fontWeight: 700,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: '2px solid',
      transition: 'all 0.12s',
      outline: isCurrent ? '2px solid var(--accent)' : 'none',
      outlineOffset: '1px',
    };

    if (status === 'answered')
      return { ...base, background: 'var(--accent-soft)', borderColor: 'var(--accent)', color: 'var(--accent)' };
    if (status === 'flagged')
      return { ...base, background: 'var(--warning-soft)', borderColor: 'var(--warning)', color: 'var(--warning)' };
    return { ...base, background: 'var(--bg-surface)', borderColor: 'var(--border)', color: 'var(--text-muted)' };
  }

  const sectionLabel: React.CSSProperties = {
    fontSize: '0.7rem',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    marginBottom: '0.5rem',
  };

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        borderRadius: '1rem',
        padding: '1.25rem',
        border: '1px solid var(--border)',
      }}
    >
      <div style={sectionLabel}>Phần I – Trắc nghiệm</div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 2rem)',
          gap: '0.35rem',
          marginBottom: '1rem',
        }}
      >
        {Array.from({ length: mcqCount }, (_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Câu ${i + 1}`}
            onClick={() => onNavigate(i)}
            style={boxStyle(i)}
          >
            {i + 1}
          </button>
        ))}
      </div>

      <div style={sectionLabel}>Phần II – Đúng / Sai</div>
      <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '1.25rem' }}>
        {Array.from(
          { length: flatQuestions.length - mcqCount },
          (_, i) => {
            const idx = mcqCount + i;
            return (
              <button
                key={i}
                type="button"
                aria-label={`Câu ${idx + 1}`}
                onClick={() => onNavigate(idx)}
                style={{ ...boxStyle(idx), width: '2.5rem' }}
              >
                {idx + 1}
              </button>
            );
          }
        )}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        {(
          [
            ['var(--accent)', 'Đã trả lời'],
            ['var(--warning)', 'Xem lại sau'],
            ['var(--border)', 'Chưa làm'],
          ] as [string, string][]
        ).map(([color, label]) => (
          <div
            key={label}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}
          >
            <div
              style={{
                width: '0.75rem',
                height: '0.75rem',
                borderRadius: '2px',
                background: color === 'var(--border)' ? 'var(--bg-surface)' : `color-mix(in srgb, ${color} 20%, transparent)`,
                border: `1.5px solid ${color}`,
                flexShrink: 0,
              }}
            />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ExamV2SessionPage() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isTimeUp, setIsTimeUp] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitStartedRef = useRef(false);

  const {
    exam,
    flatQuestions,
    currentQuestion,
    currentIndex,
    loading,
    error,
    initialRemainingSeconds,
    questionStatuses,
    unansweredCount,
    handleMCQSelect,
    handleTFSelect,
    handleClearAnswer,
    handleToggleFlag,
    handleNavigate,
    handleSubmit,
    getMCQAnswer,
    getTFAnswer,
  } = useSessionV2(examId);

  const executeSubmit = useCallback(() => {
    if (submitStartedRef.current) return;
    submitStartedRef.current = true;
    setIsSubmitting(true);

    const result = handleSubmit();
    setDialogOpen(false);
    if (result) {
      navigate(`/exams/ket-qua/${result.sessionId}`);
      return;
    }

    submitStartedRef.current = false;
    setIsSubmitting(false);
  }, [handleSubmit, navigate]);

  const handleTimeUpAndSubmit = useCallback(() => {
    setIsTimeUp(true);
    executeSubmit();
  }, [executeSubmit]);

  const handleTimerTick = useCallback(() => {}, []);

  // ── Loading / Error ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: '1rem',
          background: 'var(--bg-app)',
          color: 'var(--accent)',
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
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <span>Đang tải đề thi...</span>
      </div>
    );
  }

  if (error || !exam || !currentQuestion) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-app)',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ color: 'var(--danger)', marginBottom: '1rem' }}>
            {error ?? 'Không tải được đề thi'}
          </h2>
          <Link to="/exams/browse" style={{ color: 'var(--accent)' }}>
            ← Về danh sách đề
          </Link>
        </div>
      </div>
    );
  }

  // ── Compute hasSelection ─────────────────────────────────────────────────
  const hasSelection = isMCQQuestion(currentQuestion)
    ? (getMCQAnswer(currentQuestion.id)?.selected ?? null) !== null
    : Object.values(
        getTFAnswer(currentQuestion.id)?.selected ?? {}
      ).some((v) => v !== null);

  const currentStatus: ExamQuestionStatus =
    (questionStatuses[currentQuestion.id] as ExamQuestionStatus) ?? 'unanswered';

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-app)',
        color: 'var(--text-primary)',
      }}
    >
      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: 'var(--bg-card)',
          borderBottom: '1px solid var(--border)',
          padding: '0.75rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
        }}
      >
        <Link
          to="/exams/browse"
          style={{
            color: 'var(--text-muted)',
            textDecoration: 'none',
            fontSize: '0.875rem',
            flexShrink: 0,
          }}
        >
          ← Đề thi
        </Link>

        <span
          style={{
            flex: 1,
            fontSize: '0.9rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={exam.title}
        >
          {exam.title}
        </span>

        <ExamTimer
          initialSeconds={initialRemainingSeconds}
          onTimeUp={handleTimeUpAndSubmit}
          onTick={handleTimerTick}
        />

        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => {
            if (!isSubmitting) setDialogOpen(true);
          }}
          style={{
            padding: '0.5rem 1.25rem',
            background: isSubmitting ? 'var(--text-muted)' : 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: '0.75rem',
            fontWeight: 600,
            fontSize: '0.875rem',
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            flexShrink: 0,
          }}
        >
          {isSubmitting ? 'Đang nộp...' : 'Nộp bài'}
        </button>
      </header>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <main
        style={{
          maxWidth: '80rem',
          margin: '0 auto',
          padding: '2rem 1.5rem',
          display: 'flex',
          gap: '1.75rem',
          alignItems: 'flex-start',
        }}
      >
        {/* Question area */}
        <div style={{ flex: '1 1 500px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {isMCQQuestion(currentQuestion) && (
            <MCQQuestionCardV2
              question={currentQuestion}
              index={currentIndex}
              total={flatQuestions.length}
              selectedOptionId={getMCQAnswer(currentQuestion.id)?.selected ?? null}
              onSelectOption={(id) => handleMCQSelect(currentQuestion.id, id)}
            />
          )}
          {isTFQuestion(currentQuestion) && (
            <TFQuestionCard
              question={currentQuestion}
              index={currentIndex}
              total={flatQuestions.length}
              selected={
                getTFAnswer(currentQuestion.id)?.selected ?? {
                  a: null,
                  b: null,
                  c: null,
                  d: null,
                }
              }
              onSelect={(stmtId, value) =>
                handleTFSelect(currentQuestion.id, stmtId, value)
              }
            />
          )}

          <ExamNavigation
            currentIndex={currentIndex}
            total={flatQuestions.length}
            onNavigate={handleNavigate}
            status={currentStatus}
            onToggleFlag={() => handleToggleFlag(currentQuestion.id)}
            onClearSelection={() => handleClearAnswer(currentQuestion.id)}
            hasSelection={hasSelection}
          />
        </div>

        {/* Progress sidebar */}
        <div style={{ flex: '0 0 260px', position: 'sticky', top: '5rem' }}>
          <ProgressSidebar
            flatQuestions={flatQuestions}
            currentIndex={currentIndex}
            questionStatuses={questionStatuses}
            onNavigate={handleNavigate}
          />
        </div>
      </main>

      {/* ── Submit dialog ─────────────────────────────────────────────────── */}
      <ExamSubmitDialog
        isOpen={dialogOpen}
        unansweredCount={unansweredCount}
        isTimeUp={isTimeUp}
        onConfirm={executeSubmit}
        onCancel={() => setDialogOpen(false)}
      />

      <style>{`
        @media (max-width: 768px) {
          main { flex-direction: column-reverse !important; }
          main > div:last-child { position: static !important; flex: 1 1 100% !important; }
        }
      `}</style>
    </div>
  );
}
