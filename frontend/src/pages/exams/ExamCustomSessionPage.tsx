import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ExamSubmitDialog from '@/components/exams/ExamSubmitDialog';
import {
  formatCognitiveLevelLabel,
  formatDifficultyLabel,
  formatQuestionTypeLabel,
} from '@/lib/exam/displayLabels';
import { scoreCustomMockSession } from '@/lib/exam/customScoring';
import { loadCustomSession, saveCustomPracticeState, saveCustomSession, updateCustomSession } from '@/lib/exam/customSessionStorage';
import { useExamKeyboardShortcuts } from '@/lib/exam/useExamKeyboardShortcuts';
import { handleRadioGroupKeyDown } from '@/lib/exam/radioGroupKeyboard';
import ExamShortcutHelp, { type ExamShortcutItem } from '@/components/exams/ExamShortcutHelp';
import ExamQuickNavigator, { type QuickNavigatorItem } from '@/components/exams/ExamQuickNavigator';
import ExamPracticeHeader from '@/components/exams/ExamPracticeHeader';
import ExamExplanationText from '@/components/exams/ExamExplanationText';
import QuestionSourceBlock from '@/components/exams/QuestionSourceBlock';
import { useQuestionNavigation } from '@/lib/exam/useQuestionNavigation';
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
    success: ['rgba(47,122,87,0.1)', 'rgba(47,122,87,0.3)', 'var(--exam-success)'],
    danger: ['rgba(159,29,45,0.08)', 'rgba(159,29,45,0.26)', 'var(--danger)'],
    warning: ['rgba(194,155,75,0.12)', 'rgba(194,155,75,0.32)', 'var(--exam-warning)'],
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
      <ExamExplanationText text={text} />
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
      <QuestionSourceBlock sourceRefs={question.sourceRefs} />
      <div role="radiogroup" aria-orientation="vertical" aria-label="Chọn đáp án" style={{ display: 'grid', gap: '0.65rem', marginTop: '1rem' }}>
        {question.options.map((option) => {
          const isSelected = selected === option.id;
          const isAnswer = option.id === question.correctOptionId;
          const border = checked && isAnswer ? 'rgba(47,122,87,0.38)' : checked && isSelected && !isAnswer ? 'rgba(159,29,45,0.32)' : isSelected ? 'var(--accent)' : 'var(--border)';
          const background = checked && isAnswer ? 'rgba(47,122,87,0.1)' : checked && isSelected && !isAnswer ? 'rgba(159,29,45,0.08)' : isSelected ? 'var(--accent-soft)' : 'var(--bg-surface)';
          return (
            <button key={option.id} type="button" role="radio" aria-checked={isSelected} aria-label={`Đáp án ${option.id}: ${option.text}${isSelected ? ', đang chọn' : ''}`} tabIndex={selected ? (isSelected ? 0 : -1) : option.id === question.options[0]?.id ? 0 : -1} disabled={checked} onKeyDown={(event) => handleRadioGroupKeyDown(event, question.options.map((item) => item.id), option.id, onSelect, checked)} onClick={() => onSelect(option.id)} className="exam-focusable" style={{ border: `1px solid ${border}`, background, color: 'var(--text-primary)', borderRadius: '0.8rem', padding: '0.9rem 1rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start', textAlign: 'left', cursor: checked ? 'default' : 'pointer' }}>
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
      <QuestionSourceBlock sourceRefs={question.sourceRefs} />
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
              <div role="group" aria-label={`Lựa chọn cho ý ${statement.id}`} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem', paddingLeft: '1.8rem' }}>
                {[true, false].map((value) => (
                  <button key={`${statement.id}-${value}`} type="button" aria-pressed={current === value} aria-label={`Chọn ${value ? 'Đúng' : 'Sai'} cho ý ${statement.id}`} disabled={checked} onClick={() => onSelect(statement.id, value)} className="exam-focusable" style={{ ...tfChoiceButtonStyle(current, value, checked, statement.isTrue), padding: '0.45rem 0.8rem', fontSize: '0.82rem' }}>
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
      <div role="radiogroup" aria-orientation="vertical" aria-label="Chọn đáp án" style={{ display: 'grid', gap: '0.65rem', marginTop: '1rem' }}>
        {question.options.map((option) => {
          const isSelected = selected === option.id;
          return (
            <button key={option.id} type="button" role="radio" aria-checked={isSelected} aria-label={`Đáp án ${option.id}: ${option.text}${isSelected ? ', đang chọn' : ''}`} tabIndex={selected ? (isSelected ? 0 : -1) : option.id === question.options[0]?.id ? 0 : -1} onKeyDown={(event) => handleRadioGroupKeyDown(event, question.options.map((item) => item.id), option.id, onSelect)} onClick={() => onSelect(option.id)} className="exam-focusable" style={{ border: `1px solid ${isSelected ? 'var(--exam-selection)' : 'var(--border)'}`, background: isSelected ? 'var(--exam-selection-soft)' : 'var(--bg-surface)', color: 'var(--text-primary)', borderRadius: '0.8rem', padding: '0.9rem 1rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start', textAlign: 'left', cursor: 'pointer' }}>
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
  const answeredStatementCount = question.statements.filter((statement) => selected[statement.id] != null).length;
  return (
    <div style={cardStyle}>
      <QuestionMeta question={question} showLearningMetadata={false} />
      <p role="status" aria-live="polite" style={{ margin: '0.65rem 0 0', color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 700 }}>
        Đã trả lời {answeredStatementCount}/{question.statements.length} ý
      </p>
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
              <div role="group" aria-label={`Lựa chọn cho ý ${statement.id}`} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem', paddingLeft: '1.8rem' }}>
                {[true, false].map((value) => (
                  <button key={`${statement.id}-${value}`} type="button" aria-pressed={current === value} aria-label={`Chọn ${value ? 'Đúng' : 'Sai'} cho ý ${statement.id}`} onClick={() => onSelect(statement.id, value)} className="exam-focusable" style={{ ...buttonStyle(current === value ? 'primary' : 'secondary'), ...(current === value ? { background: 'var(--exam-selection)', borderColor: 'var(--exam-selection)' } : {}), padding: '0.45rem 0.8rem', fontSize: '0.82rem' }}>
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

interface InitialCustomSessionState {
  session: CustomExamSession | null;
  practiceState: CustomPracticeState | null;
  error: string | null;
  remainingSeconds: number | null;
  markedForReview: string[];
  submittedResultSessionId: string | null;
}

function loadInitialCustomSession(sessionId: string | undefined): InitialCustomSessionState {
  const emptyState = {
    session: null,
    practiceState: null,
    remainingSeconds: null,
    markedForReview: [],
    submittedResultSessionId: null,
  };

  if (!sessionId) {
    return { ...emptyState, error: 'Liên kết luyện tập tùy chọn không hợp lệ.' };
  }

  const loaded = loadCustomSession(sessionId);
  if (!loaded) {
    return {
      ...emptyState,
      error: 'Không tìm thấy phiên luyện tập tùy chọn. Có thể phiên đã bị xóa hoặc dữ liệu trình duyệt bị dọn dẹp.',
    };
  }
  if (!Array.isArray(loaded.questionSnapshots) || loaded.questionSnapshots.length === 0) {
    return { ...emptyState, error: 'Phiên luyện tập này chưa có câu hỏi để hiển thị.' };
  }

  const isSubmittedMock = loaded.mode === 'custom_mock'
    && loaded.status === 'submitted'
    && Boolean(readResultFromLS(loaded.sessionId));
  const elapsed = Math.floor((Date.now() - (loaded.startedAt ?? Date.now())) / 1000);
  const remainingSeconds = loaded.mode === 'custom_mock' && loaded.durationSeconds && loaded.durationSeconds > 0
    ? Math.max(0, loaded.durationSeconds - elapsed)
    : null;

  return {
    session: loaded,
    practiceState: makeInitialPracticeState(loaded),
    error: null,
    remainingSeconds,
    markedForReview: loaded.markedForReview ?? [],
    submittedResultSessionId: isSubmittedMock ? loaded.sessionId : null,
  };
}

function ExamCustomSessionContent({ sessionId }: { sessionId: string | undefined }) {
  const navigate = useNavigate();
  const [initialState] = useState(() => loadInitialCustomSession(sessionId));
  const [session, setSession] = useState<CustomExamSession | null>(initialState.session);
  const [practiceState, setPracticeState] = useState<CustomPracticeState | null>(initialState.practiceState);
  const error = initialState.error;
  const [saveError, setSaveError] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(initialState.remainingSeconds);
  const [markedForReview, setMarkedForReview] = useState<string[]>(initialState.markedForReview);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const submitStartedRef = useRef(false);
  const shortcutHelpTriggerRef = useRef<HTMLButtonElement>(null);
  const questionRef = useRef<HTMLDivElement>(null);
  const shortcutHelpId = useId();

  useEffect(() => {
    if (initialState.submittedResultSessionId) {
      navigate(`/exams/ket-qua/${initialState.submittedResultSessionId}`, { replace: true });
    }
  }, [initialState.submittedResultSessionId, navigate]);

  const questions = session?.questionSnapshots ?? [];
  const currentIndex = Math.min(practiceState?.currentIndex ?? 0, Math.max(questions.length - 1, 0));
  const currentQuestion = questions[currentIndex];
  const checkedCount = questions.filter((question) => practiceState?.checked[question.id]).length;
  const correctCount = questions.filter((question) => practiceState?.checked[question.id] && isQuestionCorrect(question, practiceState.answers[question.id])).length;
  const percent = checkedCount > 0 ? Math.round((correctCount / checkedCount) * 100) : 0;
  const isMockMode = session?.mode === 'custom_mock';
  const answeredCount = questions.filter((question) => answerIsReady(question, practiceState?.answers[question.id])).length;
  const partialCount = questions.filter((question) => {
    const answer = practiceState?.answers[question.id];
    return answer?.questionType === 'true_false'
      && Object.values(answer.selected).some((value) => value != null)
      && !answerIsReady(question, answer);
  }).length;
  const isCurrentMarked = currentQuestion ? markedForReview.includes(currentQuestion.id) : false;
  const navigatorItems: QuickNavigatorItem[] = questions.map((question, index) => {
    const answer = practiceState?.answers[question.id];
    const wasChecked = !!practiceState?.checked[question.id];
    const ready = answerIsReady(question, answer);
    const hasSelection = answer?.questionType === 'mcq'
      ? answer.selected != null
      : answer?.questionType === 'true_false' && Object.values(answer.selected).some((value) => value != null);
    const correct = wasChecked && isQuestionCorrect(question, answer);
    const state: QuickNavigatorItem['state'] = isMockMode
      ? ready ? 'complete' : hasSelection ? 'partial' : 'untouched'
      : wasChecked ? (correct ? 'correct' : 'incorrect') : hasSelection ? 'selected' : 'untouched';
    return { id: `${question.id}-${index}`, label: String(index + 1), state, flagged: markedForReview.includes(question.id) };
  });

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

  const setQuestionIndex = useCallback((index: number) => {
    if (practiceState) persistState({ ...practiceState, currentIndex: index });
  }, [persistState, practiceState]);
  const navigateToQuestion = useQuestionNavigation({ questionCount: questions.length, onIndexChange: setQuestionIndex, questionRef });

  const goToPreviousQuestion = useCallback(() => {
    if (!practiceState || questions.length === 0) return;
    navigateToQuestion(currentIndex - 1);
  }, [currentIndex, navigateToQuestion, practiceState, questions.length]);

  const goToNextQuestion = useCallback(() => {
    if (!practiceState || questions.length === 0) return;
    navigateToQuestion(currentIndex + 1);
  }, [currentIndex, navigateToQuestion, practiceState, questions.length]);

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
      const result = {
        ...scoreCustomMockSession(finalSession),
        scoreAuthority: 'LOCAL_FALLBACK',
        timingAuthority: 'CLIENT_UNVERIFIED',
        submissionOrigin: 'CLIENT_FALLBACK',
      };
      // This legacy local custom flow has no server-verifiable filter descriptor.
      // Keep its result local rather than posting a client-scored official attempt.
      writeResultToLS(result);
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
    onFlag: isMockMode ? toggleCurrentMark : undefined,
    onShowHelp: () => setShortcutHelpOpen(true),
    onCheck: isMockMode ? undefined : checkCurrentQuestion,
    onSelectOptionByIndex: (index) => {
      if (currentQuestion && isMCQQuestion(currentQuestion) && (isMockMode || !practiceState?.checked[currentQuestion.id])) {
        const option = currentQuestion.options[index];
        if (option) handleMCQSelect(currentQuestion, option.id);
      }
    },
    mode: isMockMode ? 'timed' : 'practice',
    disabled: Boolean(error) || !session || !practiceState || !currentQuestion || practiceState.finished || dialogOpen || shortcutHelpOpen || isSubmitting,
  });

  useEffect(() => {
    if (!isMockMode || remainingSeconds == null || !session || session.status === 'submitted') return;
    if (remainingSeconds <= 0) {
      const timeoutId = window.setTimeout(() => void submitCustomMock(), 0);
      return () => window.clearTimeout(timeoutId);
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
        <div style={{ maxWidth: '80rem', margin: '0 auto', display: 'grid', gap: '1.5rem' }}>
          <ExamPracticeHeader backTo="/exams/tao-de" backLabel="Quay lại tạo đề" mode="Luyện tập tùy chọn" title={session.title} badge="Không tính giờ" />
          <div style={{ width: '100%', maxWidth: '42rem', margin: '0 auto' }}>
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
      </div>
    );
  }

  const answer = currentQuestion ? practiceState.answers[currentQuestion.id] : undefined;
  const selectedMCQ = answer?.questionType === 'mcq' ? answer.selected : null;
  const selectedTF = answer?.questionType === 'true_false' ? answer.selected : makeBlankTFChoice();
  const isChecked = currentQuestion ? !!practiceState.checked[currentQuestion.id] : false;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-primary)', padding: '2rem 1.5rem' }}>
      <div className="exam-practice-layout">
      <main className="exam-practice-content">
        <ExamPracticeHeader backTo="/exams/tao-de" backLabel="Quay lại tạo đề" mode={isMockMode ? 'Thi thử tùy chọn' : 'Luyện tập tùy chọn'} title={session.title} badge={isMockMode ? remainingSeconds == null ? 'Không tính giờ' : `${Math.ceil(remainingSeconds / 60)} phút` : 'Không tính giờ'} helpId={shortcutHelpId} helpOpen={shortcutHelpOpen} helpTriggerRef={shortcutHelpTriggerRef} onHelp={() => setShortcutHelpOpen(true)} />

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
            <div role="progressbar" aria-label={isMockMode ? `Tiến độ hoàn thành: ${answeredCount} trên ${questions.length} câu` : `Tiến độ kiểm tra: ${checkedCount} trên ${questions.length} câu`} aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={isMockMode ? answeredCount : checkedCount} style={{ width: `${(((isMockMode ? answeredCount : checkedCount) / questions.length) * 100)}%`, height: '100%', background: 'var(--accent)', borderRadius: '999px' }} />
          </div>
        </div>

        <div ref={questionRef} tabIndex={-1} data-exam-current-question>
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
        </div>

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
      </main>
      <ExamQuickNavigator items={navigatorItems} currentIndex={currentIndex} onSelect={navigateToQuestion} />
      </div>

      <ExamShortcutHelp
        id={shortcutHelpId}
        isOpen={shortcutHelpOpen}
        onClose={() => setShortcutHelpOpen(false)}
        triggerRef={shortcutHelpTriggerRef}
        shortcuts={isMockMode ? CUSTOM_MOCK_SHORTCUTS : CUSTOM_PRACTICE_SHORTCUTS}
        description={isMockMode ? 'Bài thi tùy chọn có thể giới hạn thời gian và không hiển thị đáp án trước khi nộp.' : 'Không giới hạn thời gian. Kiểm tra và đọc giải thích sau từng câu.'}
      />

      <ExamSubmitDialog
        isOpen={dialogOpen}
        totalQuestions={questions.length}
        completedCount={answeredCount}
        partialCount={partialCount}
        untouchedCount={questions.length - answeredCount - partialCount}
        flaggedCount={markedForReview.length}
        isSubmitting={isSubmitting}
        onConfirm={submitCustomMock}
        onCancel={() => setDialogOpen(false)}
      />
    </div>
  );
}

export default function ExamCustomSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  return <ExamCustomSessionContent key={sessionId ?? 'missing'} sessionId={sessionId} />;
}

const CUSTOM_PRACTICE_SHORTCUTS: ExamShortcutItem[] = [
  { keyLabel: '← / →', description: 'Chuyển câu' },
  { keyLabel: '↑ / ↓', description: 'Chuyển giữa các đáp án trắc nghiệm' },
  { keyLabel: '1–4', description: 'Chọn nhanh đáp án A–D' },
  { keyLabel: 'Ctrl + Enter', description: 'Kiểm tra câu hiện tại' },
  { keyLabel: '?', description: 'Mở hướng dẫn làm bài' },
];

const CUSTOM_MOCK_SHORTCUTS: ExamShortcutItem[] = [
  { keyLabel: '← / →', description: 'Chuyển câu' },
  { keyLabel: '↑ / ↓', description: 'Chuyển giữa các đáp án trắc nghiệm' },
  { keyLabel: '1–4', description: 'Chọn nhanh đáp án A–D' },
  { keyLabel: 'Shift + F', description: 'Đánh dấu hoặc bỏ đánh dấu xem lại' },
  { keyLabel: '?', description: 'Mở hướng dẫn làm bài' },
];
