import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ExamSubmitDialog from '@/components/exams/ExamSubmitDialog';
import {
  formatCognitiveLevelLabel,
  formatDifficultyLabel,
  formatQuestionTypeLabel,
} from '@/lib/exam/displayLabels';
import { scoreCustomMockSession } from '@/lib/exam/customScoring';
import { loadCustomSession, saveCustomPracticeState, saveCustomSession, updateCustomSession } from '@/lib/exam/customSessionStorage';
import { syncAttemptBestEffort } from '@/lib/exam/examAttemptSync';
import { useExamKeyboardShortcuts } from '@/lib/exam/useExamKeyboardShortcuts';
import { readResultFromLS, writeResultToLS } from '@/lib/exam/useSessionV2';
import {
  isMCQQuestion,
  isTFQuestion,
  type AnswerEntry,
  type CustomExamSession,
  type CustomPracticeState,
  type CustomQuestionSnapshot,
  type MCQAnswer,
  type MCQQuestion,
  type TFAnswer,
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

function makeBlankTFChoice(): TFChoice {
  return { a: null, b: null, c: null, d: null };
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

function tfLabel(value: boolean | null | undefined): string {
  if (value == null) return 'Chưa chọn';
  return value ? 'Đúng' : 'Sai';
}

function tfChoiceButtonStyle(current: boolean | null, value: boolean, checked: boolean, correctValue: boolean): CSSProperties {
  if (current !== value) return buttonStyle('secondary');
  if (!checked) return buttonStyle('primary');
  const correct = value === correctValue;
  return {
    ...buttonStyle('secondary'),
    border: `1px solid ${correct ? 'var(--success)' : 'var(--danger)'}`,
    background: correct ? 'rgba(47,122,87,0.1)' : 'rgba(159,29,45,0.08)',
    color: correct ? 'var(--success)' : 'var(--danger)',
  };
}

function QuestionMeta({ question, showLearningMetadata = true }: { question: CustomQuestionSnapshot; showLearningMetadata?: boolean }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
      <span style={chipStyle()}>{formatQuestionTypeLabel(question.questionType)}</span>
      {showLearningMetadata && <>
        <span style={chipStyle()}>{formatDifficultyLabel(question.difficulty)}</span>
        <span style={chipStyle()}>{formatCognitiveLevelLabel(question.cognitiveLevel)}</span>
        {question.topic && <span style={chipStyle()}>{question.topic}</span>}
      </>}
    </div>
  );
}

function Explanation({ text }: { text?: string }) {
  if (!text?.trim()) return null;
  return (
    <div style={{ marginTop: '1rem', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '0.8rem', padding: '0.95rem 1rem', color: 'var(--text-secondary)', lineHeight: 1.65 }}>
      <strong style={{ color: 'var(--text-primary)' }}>Giải thích: </strong>
      {text}
    </div>
  );
}

function MCQCard({
  question,
  selected,
  checked,
  onSelect,
  onCheck,
}: {
  question: MCQQuestion & CustomQuestionSnapshot;
  selected: MCQChoice | null;
  checked: boolean;
  onSelect: (value: MCQChoice) => void;
  onCheck: () => void;
}) {
  const isCorrect = checked && selected === question.correctOptionId;
  return (
    <div style={cardStyle}>
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <QuestionMeta question={question} />
        {checked && <span style={chipStyle(isCorrect ? 'success' : 'danger')}>{isCorrect ? 'Đúng' : 'Chưa đúng'}</span>}
      </div>
      <h2 style={{ margin: '1rem 0 0', color: 'var(--text-primary)', fontSize: '1.05rem', lineHeight: 1.6 }}>{question.questionText}</h2>
      <div style={{ display: 'grid', gap: '0.65rem', marginTop: '1rem' }}>
        {question.options.map((option) => {
          const isSelected = selected === option.id;
          const isAnswer = option.id === question.correctOptionId;
          const border = checked && isAnswer ? 'rgba(47,122,87,0.38)' : checked && isSelected && !isAnswer ? 'rgba(159,29,45,0.32)' : isSelected ? 'var(--accent)' : 'var(--border)';
          const background = checked && isAnswer ? 'rgba(47,122,87,0.1)' : checked && isSelected && !isAnswer ? 'rgba(159,29,45,0.08)' : isSelected ? 'var(--accent-soft)' : 'var(--bg-surface)';
          return (
            <button key={option.id} type="button" disabled={checked} onClick={() => onSelect(option.id)} style={{ border: `1px solid ${border}`, background, color: 'var(--text-primary)', borderRadius: '0.8rem', padding: '0.9rem 1rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start', textAlign: 'left', cursor: checked ? 'default' : 'pointer' }}>
              <strong style={{ minWidth: '1.5rem', color: checked && isAnswer ? 'var(--success)' : 'var(--text-muted)' }}>{option.id}.</strong>
              <span style={{ flex: 1, lineHeight: 1.55 }}>{option.text}</span>
              {checked && isAnswer && <span style={chipStyle('success')}>Đáp án đúng</span>}
              {checked && isSelected && !isAnswer && <span style={chipStyle('danger')}>Bạn chọn</span>}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem', alignItems: 'center' }}>
        <button type="button" onClick={onCheck} disabled={!selected || checked} style={{ ...buttonStyle('primary'), opacity: selected && !checked ? 1 : 0.55 }}>Kiểm tra đáp án</button>
        {checked && <span style={chipStyle('success')}>Đáp án đúng: {question.correctOptionId}</span>}
      </div>
      {checked && <Explanation text={question.explanation} />}
    </div>
  );
}

function TFCard({
  question,
  selected,
  checked,
  onSelect,
  onCheck,
}: {
  question: TFQuestion & CustomQuestionSnapshot;
  selected: TFChoice;
  checked: boolean;
  onSelect: (statementId: TFStatement['id'], value: boolean) => void;
  onCheck: () => void;
}) {
  const allAnswered = question.statements.every((statement) => selected[statement.id] != null);
  const correctCount = question.statements.filter((statement) => selected[statement.id] === statement.isTrue).length;
  return (
    <div style={cardStyle}>
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <QuestionMeta question={question} />
        {checked && <span style={chipStyle(correctCount === question.statements.length ? 'success' : 'warning')}>{correctCount}/{question.statements.length} ý đúng</span>}
      </div>
      <h2 style={{ margin: '1rem 0 0', color: 'var(--text-primary)', fontSize: '1.05rem', lineHeight: 1.6 }}>{question.questionText}</h2>
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
                  <button key={`${statement.id}-${value}`} type="button" disabled={checked} onClick={() => onSelect(statement.id, value)} style={{ ...tfChoiceButtonStyle(current, value, checked, statement.isTrue), padding: '0.45rem 0.8rem', fontSize: '0.82rem' }}>
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
        <button type="button" onClick={onCheck} disabled={!allAnswered || checked} style={{ ...buttonStyle('primary'), opacity: allAnswered && !checked ? 1 : 0.55 }}>Kiểm tra đáp án</button>
        {!allAnswered && <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Hãy chọn Đúng/Sai cho đủ các ý.</span>}
      </div>
      {checked && <Explanation text={question.explanation} />}
    </div>
  );
}

function MockMCQCard({
  question,
  selected,
  onSelect,
}: {
  question: MCQQuestion & CustomQuestionSnapshot;
  selected: MCQChoice | null;
  onSelect: (value: MCQChoice) => void;
}) {
  return (
    <div style={cardStyle}>
      <QuestionMeta question={question} showLearningMetadata={false} />
      <h2 style={{ margin: '1rem 0 0', color: 'var(--text-primary)', fontSize: '1.05rem', lineHeight: 1.6 }}>{question.questionText}</h2>
      <div style={{ display: 'grid', gap: '0.65rem', marginTop: '1rem' }}>
        {question.options.map((option) => {
          const isSelected = selected === option.id;
          return (
            <button key={option.id} type="button" onClick={() => onSelect(option.id)} style={{ border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`, background: isSelected ? 'var(--accent-soft)' : 'var(--bg-surface)', color: 'var(--text-primary)', borderRadius: '0.8rem', padding: '0.9rem 1rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start', textAlign: 'left', cursor: 'pointer' }}>
              <strong style={{ minWidth: '1.5rem', color: isSelected ? 'var(--accent)' : 'var(--text-muted)' }}>{option.id}.</strong>
              <span style={{ flex: 1, lineHeight: 1.55 }}>{option.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MockTFCard({
  question,
  selected,
  onSelect,
}: {
  question: TFQuestion & CustomQuestionSnapshot;
  selected: TFChoice;
  onSelect: (statementId: TFStatement['id'], value: boolean) => void;
}) {
  return (
    <div style={cardStyle}>
      <QuestionMeta question={question} showLearningMetadata={false} />
      <h2 style={{ margin: '1rem 0 0', color: 'var(--text-primary)', fontSize: '1.05rem', lineHeight: 1.6 }}>{question.questionText}</h2>
      <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem' }}>
        {question.statements.map((statement) => {
          const current = selected[statement.id];
          return (
            <div key={statement.id} style={{ border: '1px solid var(--border)', background: 'var(--bg-surface)', borderRadius: '0.8rem', padding: '0.9rem 1rem' }}>
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
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', display: 'grid', placeItems: 'center', padding: '1.5rem' }}>
      <div style={{ maxWidth: '35rem', textAlign: 'center', ...cardStyle }}>
        <h1 style={{ margin: '0 0 0.75rem', color: 'var(--text-primary)', fontSize: '1.35rem' }}>{title}</h1>
        <p style={{ margin: '0 0 1.5rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>{message}</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Link to="/exams/tao-de" style={buttonStyle('primary')}>Tạo đề tùy chọn</Link>
          <Link to="/exams/browse" style={buttonStyle('secondary')}>Về ngân hàng đề</Link>
        </div>
      </div>
    </div>
  );
}

function makeInitialPracticeState(session: CustomExamSession): CustomPracticeState {
  return session.practiceState ?? {
    answers: {},
    checked: {},
    currentIndex: 0,
    finished: false,
  };
}

function isQuestionCorrect(question: CustomQuestionSnapshot, answer: AnswerEntry | undefined): boolean {
  if (isMCQQuestion(question)) return answer?.questionType === 'mcq' && answer.selected === question.correctOptionId;
  if (isTFQuestion(question)) {
    if (answer?.questionType !== 'true_false') return false;
    return question.statements.every((statement) => answer.selected[statement.id] === statement.isTrue);
  }
  return false;
}

function answerIsReady(question: CustomQuestionSnapshot, answer: AnswerEntry | undefined): boolean {
  if (isMCQQuestion(question)) return answer?.questionType === 'mcq' && answer.selected !== null;
  if (isTFQuestion(question)) {
    const selected = answer?.questionType === 'true_false' ? answer.selected : makeBlankTFChoice();
    return question.statements.every((statement) => selected[statement.id] != null);
  }
  return false;
}

function formatRemainingSeconds(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

export default function ExamCustomSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<CustomExamSession | null>(null);
  const [practiceState, setPracticeState] = useState<CustomPracticeState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [markedForReview, setMarkedForReview] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitStartedRef = useRef(false);

  useEffect(() => {
    if (!sessionId) {
      setError('Liên kết luyện tập tùy chọn không hợp lệ.');
      return;
    }
    const loaded = loadCustomSession(sessionId);
    if (!loaded) {
      setError('Không tìm thấy phiên luyện tập tùy chọn. Có thể phiên đã bị xóa hoặc dữ liệu trình duyệt bị dọn dẹp.');
      return;
    }
    if (!Array.isArray(loaded.questionSnapshots) || loaded.questionSnapshots.length === 0) {
      setError('Phiên luyện tập này chưa có câu hỏi để hiển thị.');
      return;
    }
    if (loaded.mode === 'custom_mock' && loaded.status === 'submitted' && readResultFromLS(loaded.sessionId)) {
      navigate(`/exams/ket-qua/${loaded.sessionId}`, { replace: true });
      return;
    }
    setSession(loaded);
    setPracticeState(makeInitialPracticeState(loaded));
    setMarkedForReview(loaded.markedForReview ?? []);
    if (loaded.mode === 'custom_mock' && loaded.durationSeconds && loaded.durationSeconds > 0) {
      const elapsed = Math.floor((Date.now() - (loaded.startedAt ?? Date.now())) / 1000);
      setRemainingSeconds(Math.max(0, loaded.durationSeconds - elapsed));
    } else {
      setRemainingSeconds(null);
    }
  }, [navigate, sessionId]);

  const questions = session?.questionSnapshots ?? [];
  const currentIndex = Math.min(practiceState?.currentIndex ?? 0, Math.max(questions.length - 1, 0));
  const currentQuestion = questions[currentIndex];
  const checkedCount = questions.filter((question) => practiceState?.checked[question.id]).length;
  const correctCount = questions.filter((question) => practiceState?.checked[question.id] && isQuestionCorrect(question, practiceState.answers[question.id])).length;
  const percent = checkedCount > 0 ? Math.round((correctCount / checkedCount) * 100) : 0;
  const mcqCount = questions.filter(isMCQQuestion).length;
  const tfCount = questions.filter(isTFQuestion).length;
  const isMockMode = session?.mode === 'custom_mock';
  const answeredCount = questions.filter((question) => answerIsReady(question, practiceState?.answers[question.id])).length;
  const isCurrentMarked = currentQuestion ? markedForReview.includes(currentQuestion.id) : false;

  const persistState = useCallback((next: CustomPracticeState) => {
    if (!sessionId) return;
    setPracticeState(next);
    try {
      saveCustomPracticeState(sessionId, next);
      setSaveError(null);
    } catch {
      setSaveError('Chưa lưu được tiến độ vào trình duyệt. Bạn vẫn có thể tiếp tục, nhưng refresh có thể mất tiến độ mới nhất.');
    }
  }, [sessionId]);

  const goToPreviousQuestion = useCallback(() => {
    if (!practiceState || questions.length === 0) return;
    persistState({ ...practiceState, currentIndex: Math.max(currentIndex - 1, 0) });
  }, [currentIndex, persistState, practiceState, questions.length]);

  const goToNextQuestion = useCallback(() => {
    if (!practiceState || questions.length === 0) return;
    persistState({ ...practiceState, currentIndex: Math.min(currentIndex + 1, questions.length - 1) });
  }, [currentIndex, persistState, practiceState, questions.length]);

  const checkCurrentQuestion = useCallback(() => {
    if (!practiceState || !currentQuestion || practiceState.checked[currentQuestion.id]) return;
    const answer = practiceState.answers[currentQuestion.id];
    if (!answerIsReady(currentQuestion, answer)) return;
    persistState({ ...practiceState, checked: { ...practiceState.checked, [currentQuestion.id]: true } });
  }, [currentQuestion, persistState, practiceState]);

  const submitCustomMock = useCallback(() => {
    if (!session || !practiceState || session.mode !== 'custom_mock') return;
    const existingResult = readResultFromLS(session.sessionId);
    if (submitStartedRef.current || session.status === 'submitted') {
      if (existingResult) navigate(`/exams/ket-qua/${session.sessionId}`);
      return;
    }

    submitStartedRef.current = true;
    setIsSubmitting(true);
    const finalSession: CustomExamSession = {
      ...session,
      status: 'submitted',
      submittedAt: Date.now(),
      markedForReview,
      practiceState: {
        ...practiceState,
        currentIndex,
      },
    };

    try {
      saveCustomSession(finalSession);
      setSession(finalSession);
      const result = scoreCustomMockSession(finalSession);
      writeResultToLS(result);
      void syncAttemptBestEffort(result);
      navigate(`/exams/ket-qua/${result.sessionId}`);
    } catch {
      submitStartedRef.current = false;
      setIsSubmitting(false);
      setSaveError('Chưa lưu được kết quả thi thử tùy chọn. Hãy thử nộp lại trước khi đóng trang.');
    }
  }, [currentIndex, markedForReview, navigate, practiceState, session]);

  const toggleCurrentMark = useCallback(() => {
    if (!sessionId || !session || !currentQuestion || session.mode !== 'custom_mock') return;
    const nextMarked = markedForReview.includes(currentQuestion.id)
      ? markedForReview.filter((id) => id !== currentQuestion.id)
      : [...markedForReview, currentQuestion.id];
    setMarkedForReview(nextMarked);
    try {
      const updated = updateCustomSession(sessionId, { markedForReview: nextMarked });
      if (updated) setSession(updated);
      setSaveError(null);
    } catch {
      setSaveError('Chưa lưu được đánh dấu câu hỏi vào trình duyệt.');
    }
  }, [currentQuestion, markedForReview, session, sessionId]);

  useExamKeyboardShortcuts({
    onPrevious: goToPreviousQuestion,
    onNext: goToNextQuestion,
    onEnter: isMockMode ? undefined : checkCurrentQuestion,
    onFlag: isMockMode ? toggleCurrentMark : undefined,
    disabled: Boolean(error) || !session || !practiceState || !currentQuestion || practiceState.finished || dialogOpen || isSubmitting,
  });

  useEffect(() => {
    if (!isMockMode || remainingSeconds == null || !session || session.status === 'submitted') return;
    if (remainingSeconds <= 0) {
      submitCustomMock();
      return;
    }
    const timerId = window.setInterval(() => {
      setRemainingSeconds((prev) => (prev == null ? prev : Math.max(0, prev - 1)));
    }, 1000);
    return () => window.clearInterval(timerId);
  }, [isMockMode, remainingSeconds, session, submitCustomMock]);

  function handleMCQSelect(question: MCQQuestion & CustomQuestionSnapshot, selected: MCQChoice) {
    if (!practiceState) return;
    if (!isMockMode && practiceState.checked[question.id]) return;
    const answer: MCQAnswer = { questionId: question.id, questionType: 'mcq', selected };
    persistState({ ...practiceState, answers: { ...practiceState.answers, [question.id]: answer } });
  }

  function handleTFSelect(question: TFQuestion & CustomQuestionSnapshot, statementId: TFStatement['id'], value: boolean) {
    if (!practiceState) return;
    if (!isMockMode && practiceState.checked[question.id]) return;
    const existing = practiceState.answers[question.id];
    const current = existing?.questionType === 'true_false' ? existing.selected : makeBlankTFChoice();
    const answer: TFAnswer = {
      questionId: question.id,
      questionType: 'true_false',
      selected: { ...current, [statementId]: value },
    };
    persistState({ ...practiceState, answers: { ...practiceState.answers, [question.id]: answer } });
  }

  function finishPractice() {
    if (!practiceState) return;
    persistState({ ...practiceState, finished: true });
  }

  function resetPractice() {
    if (!session) return;
    persistState({ answers: {}, checked: {}, currentIndex: 0, finished: false });
  }

  if (error) return <EmptyState title="Chưa thể mở luyện tập tùy chọn" message={error} />;
  if (!session || !practiceState) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-app)', display: 'grid', placeItems: 'center', color: 'var(--text-muted)' }}>
        Đang tải phiên luyện tập...
      </div>
    );
  }

  if (practiceState.finished) {
    const finalPercent = checkedCount > 0 ? Math.round((correctCount / checkedCount) * 100) : 0;
    const advice = finalPercent < 60
      ? 'Bạn nên luyện lại cấu hình này hoặc nới bộ lọc để gặp thêm câu tương tự.'
      : finalPercent < 80
        ? 'Bạn đã nắm được phần chính, hãy luyện thêm các câu vận dụng.'
        : 'Bạn có thể thử thi thử tùy chọn ở bước sau hoặc làm đề thi thử khác.';
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-primary)', padding: '2rem 1.5rem' }}>
        <div style={{ maxWidth: '42rem', margin: '0 auto', display: 'grid', gap: '1rem' }}>
          <div style={{ ...cardStyle, textAlign: 'center', padding: '2rem' }}>
            <span style={chipStyle('success')}>Luyện tập tùy chọn</span>
            <h1 style={{ margin: '0.8rem 0 0.75rem', fontSize: '1.5rem', fontWeight: 900 }}>Tổng kết buổi luyện</h1>
            <p style={{ margin: '0 0 1rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Bạn đã kiểm tra {checkedCount}/{questions.length} câu, đúng {correctCount} câu ({finalPercent}%).
            </p>
            <p style={{ margin: '0 0 1.5rem', color: 'var(--text-secondary)', lineHeight: 1.6, fontWeight: 700 }}>{advice}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center' }}>
              <button type="button" onClick={resetPractice} style={buttonStyle('primary')}>Luyện lại cấu hình này</button>
              <Link to="/exams/tao-de" style={buttonStyle('secondary')}>Tạo đề mới</Link>
              <Link to="/exams/browse" style={buttonStyle('secondary')}>Về ngân hàng đề</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const answer = currentQuestion ? practiceState.answers[currentQuestion.id] : undefined;
  const selectedMCQ = answer?.questionType === 'mcq' ? answer.selected : null;
  const selectedTF = answer?.questionType === 'true_false' ? answer.selected : makeBlankTFChoice();
  const isChecked = currentQuestion ? !!practiceState.checked[currentQuestion.id] : false;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-primary)', padding: '2rem 1.5rem' }}>
      <div style={{ maxWidth: '54rem', margin: '0 auto', display: 'grid', gap: '1rem' }}>
        <header style={{ display: 'grid', gap: '0.55rem' }}>
          <Link to="/exams/tao-de" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.875rem' }}>← Quay lại tạo đề</Link>
          <h1 style={{ margin: 0, fontSize: '1.65rem', fontWeight: 900 }}>{isMockMode ? 'Thi thử tùy chọn' : 'Luyện tập tùy chọn'}</h1>
          <p style={{ margin: 0, color: 'var(--text-primary)', fontWeight: 700, lineHeight: 1.55 }}>{session.title}</p>
          <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.55 }}>
            {questions.length} câu · {mcqCount} Trắc nghiệm · {tfCount} Đúng/Sai · {session.config.scopeTitle ?? 'Tất cả chủ đề'}
          </p>
        </header>

        {saveError && (
          <div style={{ border: '1px solid rgba(194,155,75,0.34)', background: 'rgba(194,155,75,0.12)', borderRadius: '0.85rem', padding: '0.85rem 0.95rem', color: 'var(--text-secondary)', lineHeight: 1.55, fontSize: '0.86rem' }}>
            {saveError}
          </div>
        )}

        <div style={{ ...cardStyle, padding: '1rem 1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <strong>Câu {currentIndex + 1}/{questions.length}</strong>
            {isMockMode ? (
              <>
                <span style={{ color: 'var(--text-muted)' }}>Đã làm {answeredCount}/{questions.length}</span>
                <span style={{ color: 'var(--text-muted)' }}>Đánh dấu {markedForReview.length}</span>
                <span style={{ color: remainingSeconds != null && remainingSeconds <= 60 ? 'var(--danger)' : 'var(--text-muted)', fontWeight: 800 }}>
                  {remainingSeconds == null ? 'Không giới hạn thời gian' : `Còn ${formatRemainingSeconds(remainingSeconds)}`}
                </span>
              </>
            ) : (
              <>
                <span style={{ color: 'var(--text-muted)' }}>Đã kiểm tra {checkedCount}/{questions.length}</span>
                <span style={{ color: 'var(--text-muted)' }}>Đúng {correctCount}</span>
                <span style={{ color: 'var(--text-muted)' }}>Tỉ lệ {percent}%</span>
              </>
            )}
          </div>
          <div style={{ height: '0.45rem', background: 'var(--bg-surface)', borderRadius: '999px', overflow: 'hidden', marginTop: '0.8rem' }}>
            <div style={{ width: `${((currentIndex + 1) / questions.length) * 100}%`, height: '100%', background: 'var(--accent)', borderRadius: '999px' }} />
          </div>
        </div>

        {currentQuestion && isMockMode && isMCQQuestion(currentQuestion) && (
          <MockMCQCard
            question={currentQuestion}
            selected={selectedMCQ}
            onSelect={(value) => handleMCQSelect(currentQuestion, value)}
          />
        )}

        {currentQuestion && isMockMode && isTFQuestion(currentQuestion) && (
          <MockTFCard
            question={currentQuestion}
            selected={selectedTF}
            onSelect={(statementId, value) => handleTFSelect(currentQuestion, statementId, value)}
          />
        )}

        {currentQuestion && !isMockMode && isMCQQuestion(currentQuestion) && (
          <MCQCard
            question={currentQuestion}
            selected={selectedMCQ}
            checked={isChecked}
            onSelect={(value) => handleMCQSelect(currentQuestion, value)}
            onCheck={checkCurrentQuestion}
          />
        )}

        {currentQuestion && !isMockMode && isTFQuestion(currentQuestion) && (
          <TFCard
            question={currentQuestion}
            selected={selectedTF}
            checked={isChecked}
            onSelect={(statementId, value) => handleTFSelect(currentQuestion, statementId, value)}
            onCheck={checkCurrentQuestion}
          />
        )}

        <nav style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <button type="button" onClick={goToPreviousQuestion} disabled={currentIndex === 0} style={{ ...buttonStyle('secondary'), opacity: currentIndex === 0 ? 0.55 : 1 }}>Câu trước</button>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {isMockMode ? (
              <>
                <button type="button" onClick={toggleCurrentMark} style={buttonStyle(isCurrentMarked ? 'danger' : 'secondary')}>
                  {isCurrentMarked ? 'Bỏ đánh dấu' : 'Đánh dấu'}
                </button>
                {currentIndex < questions.length - 1 && (
                  <button type="button" onClick={goToNextQuestion} style={buttonStyle('secondary')}>Câu tiếp theo</button>
                )}
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setDialogOpen(true)}
                  style={{ ...buttonStyle('primary'), opacity: isSubmitting ? 0.65 : 1 }}
                >
                  {isSubmitting ? 'Đang nộp...' : 'Nộp bài'}
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={finishPractice} style={buttonStyle('danger')}>Kết thúc luyện tập</button>
                {currentIndex < questions.length - 1 ? (
                  <button type="button" onClick={goToNextQuestion} style={buttonStyle('primary')}>Câu tiếp theo</button>
                ) : (
                  <button type="button" onClick={finishPractice} style={buttonStyle('primary')}>Hoàn thành</button>
                )}
              </>
            )}
          </div>
        </nav>
      </div>

      <ExamSubmitDialog
        isOpen={dialogOpen}
        totalQuestions={questions.length}
        answeredCount={answeredCount}
        unansweredCount={questions.length - answeredCount}
        isSubmitting={isSubmitting}
        onConfirm={submitCustomMock}
        onCancel={() => setDialogOpen(false)}
      />
    </div>
  );
}
