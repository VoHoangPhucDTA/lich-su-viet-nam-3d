/**
 * Retry wrong or blank questions from a submitted exam result.
 * Route: /exams/on-lai/:sessionId
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { loadExam } from '@/lib/exam/examLoader';
import { useExamKeyboardShortcuts } from '@/lib/exam/useExamKeyboardShortcuts';
import { handleRadioGroupKeyDown } from '@/lib/exam/radioGroupKeyboard';
import ExamQuickNavigator, { type QuickNavigatorItem } from '@/components/exams/ExamQuickNavigator';
import ExamShortcutHelp, { type ExamShortcutItem } from '@/components/exams/ExamShortcutHelp';
import { readResultFromLS } from '@/lib/exam/useSessionV2';
import { formatExamTitle } from '@/lib/exam/examDisplay';
import ExamPracticeHeader from '@/components/exams/ExamPracticeHeader';
import ExamExplanationText from '@/components/exams/ExamExplanationText';
import { useQuestionNavigation } from '@/lib/exam/useQuestionNavigation';
import {
  flattenExamQuestions,
  isMCQQuestion,
  isTFQuestion,
  type ExamFile,
  type ExamResultV2,
  type MCQQuestion,
  type Question,
  type QuestionResult,
  type TFQuestion,
  type TFStatement,
} from '@/types/exam';

type MCQChoice = 'A' | 'B' | 'C' | 'D';
type TFChoice = Record<'a' | 'b' | 'c' | 'd', boolean | null>;

function isRetryCandidate(result: QuestionResult): boolean {
  if (result.questionType === 'mcq') return !result.isCorrect || result.mcq?.selected == null;
  if (!result.tf?.selected) return true;
  return !result.isCorrect || Object.values(result.tf.selected).some((value) => value == null);
}

function makeBlankTFChoice(): TFChoice {
  return { a: null, b: null, c: null, d: null };
}

function tfLabel(value: boolean | null | undefined): string {
  if (value == null) return 'Chưa chọn';
  return value ? 'Đúng' : 'Sai';
}

function EmptyState({ title, message, sessionId }: { title: string; message: string; sessionId?: string }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', display: 'grid', placeItems: 'center', padding: '1.5rem' }}>
      <div style={{ maxWidth: '34rem', textAlign: 'center', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '2.5rem' }}>
        <h1 style={{ margin: '0 0 0.75rem', color: 'var(--text-primary)', fontSize: '1.35rem' }}>{title}</h1>
        <p style={{ margin: '0 0 1.5rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>{message}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.75rem' }}>
          {sessionId && (
            <Link to={`/exams/ket-qua/${sessionId}`} style={buttonStyle('primary')}>
              Quay về kết quả
            </Link>
          )}
          <Link to="/exams/lich-su" style={buttonStyle('secondary')}>
            Lịch sử luyện thi
          </Link>
          <Link to="/exams/tao-de" style={buttonStyle('secondary')}>
            Tạo đề tùy chọn mới
          </Link>
          <Link to="/exams/browse" style={buttonStyle('secondary')}>
            Làm đề khác
          </Link>
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', display: 'grid', placeItems: 'center' }}>
      <div style={{ color: 'var(--text-muted)' }}>Đang tải...</div>
    </div>
  );
}

function buttonStyle(tone: 'primary' | 'secondary'): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.72rem 1.05rem',
    borderRadius: '0.75rem',
    border: tone === 'primary' ? '1px solid var(--accent)' : '1px solid var(--border)',
    background: tone === 'primary' ? 'var(--accent)' : 'var(--bg-surface)',
    color: tone === 'primary' ? '#fff' : 'var(--text-primary)',
    textDecoration: 'none',
    fontWeight: 800,
    fontSize: '0.9rem',
    cursor: 'pointer',
  };
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

function Explanation({ text }: { text: string }) {
  if (!text?.trim()) return null;
  return (
    <div style={{ marginTop: '1rem', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '0.8rem', padding: '0.95rem 1rem', color: 'var(--text-secondary)', lineHeight: 1.65 }}>
      <strong style={{ color: 'var(--text-primary)' }}>Giải thích: </strong>
      <ExamExplanationText text={text} />
    </div>
  );
}

function MCQRetryCard({
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
        <span style={chipStyle()}>Trắc nghiệm</span>
        {checked && <span style={chipStyle(isCorrect ? 'success' : 'danger')}>{isCorrect ? 'Đã đúng' : 'Cần xem lại'}</span>}
      </div>
      <h2 style={questionTitleStyle}>{question.questionText}</h2>

      <div role="radiogroup" aria-orientation="vertical" aria-label="Chọn đáp án" style={{ display: 'grid', gap: '0.65rem', marginTop: '1rem' }}>
        {question.options.map((option) => {
          const isSelected = selected === option.id;
          const isAnswer = option.id === question.correctOptionId;
          const border = checked && isAnswer ? 'rgba(47,122,87,0.38)' : checked && isSelected && !isAnswer ? 'rgba(159,29,45,0.32)' : isSelected ? 'var(--accent)' : 'var(--border)';
          const background = checked && isAnswer ? 'rgba(47,122,87,0.1)' : checked && isSelected && !isAnswer ? 'rgba(159,29,45,0.08)' : isSelected ? 'var(--accent-soft)' : 'var(--bg-surface)';

          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={`Đáp án ${option.id}: ${option.text}${isSelected ? ', đang chọn' : ''}`}
              tabIndex={selected ? (isSelected ? 0 : -1) : option.id === question.options[0]?.id ? 0 : -1}
              disabled={checked}
              onKeyDown={(event) => handleRadioGroupKeyDown(event, question.options.map((item) => item.id), option.id, onSelect, checked)}
              onClick={() => onSelect(option.id)}
              className="exam-focusable"
              style={{
                border: `1px solid ${border}`,
                background,
                color: 'var(--text-primary)',
                borderRadius: '0.8rem',
                padding: '0.9rem 1rem',
                display: 'flex',
                gap: '0.75rem',
                alignItems: 'flex-start',
                textAlign: 'left',
                cursor: checked ? 'default' : 'pointer',
              }}
            >
              <strong style={{ minWidth: '1.5rem', color: checked && isAnswer ? 'var(--success)' : 'var(--text-muted)' }}>{option.id}.</strong>
              <span style={{ flex: 1, lineHeight: 1.55 }}>{option.text}</span>
              {checked && isAnswer && <span style={chipStyle('success')}>Đáp án đúng</span>}
              {checked && isSelected && !isAnswer && <span style={chipStyle('danger')}>Bạn chọn</span>}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem', alignItems: 'center' }}>
        <button type="button" onClick={onCheck} disabled={!selected || checked} style={{ ...buttonStyle('primary'), opacity: selected && !checked ? 1 : 0.55 }}>
          Kiểm tra
        </button>
        {checked && <span style={chipStyle('success')}>Đáp án đúng: {question.correctOptionId}</span>}
      </div>
      {checked && <Explanation text={question.explanation} />}
    </div>
  );
}

function TFRetryCard({
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
  const allAnswered = question.statements.every((statement) => selected[statement.id] != null);
  const correctCount = question.statements.filter((statement) => selected[statement.id] === statement.isTrue).length;

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <span style={chipStyle()}>Đúng/Sai</span>
        {checked && <span style={chipStyle(correctCount === question.statements.length ? 'success' : 'warning')}>{correctCount}/{question.statements.length} ý đúng</span>}
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
              <div role="group" aria-label={`Lựa chọn cho ý ${statement.id}`} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem', paddingLeft: '1.8rem' }}>
                {[true, false].map((value) => (
                  <button
                    key={`${statement.id}-${value}`}
                    type="button"
                    aria-pressed={current === value}
                    aria-label={`Chọn ${value ? 'Đúng' : 'Sai'} cho ý ${statement.id}`}
                    disabled={checked}
                    onClick={() => onSelect(statement.id, value)}
                    className="exam-focusable"
                    style={{
                      ...tfChoiceButtonStyle(current, value, checked, statement.isTrue),
                      padding: '0.45rem 0.8rem',
                      fontSize: '0.82rem',
                    }}
                  >
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
        <button type="button" onClick={onCheck} disabled={!allAnswered || checked} style={{ ...buttonStyle('primary'), opacity: allAnswered && !checked ? 1 : 0.55 }}>
          Kiểm tra
        </button>
        {!allAnswered && <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Hãy chọn Đúng/Sai cho đủ các ý.</span>}
      </div>
      {checked && <Explanation text={question.explanation} />}
    </div>
  );
}

function MissingQuestionCard({ result }: { result: QuestionResult }) {
  return (
    <div style={cardStyle}>
      <span style={chipStyle('warning')}>Không tìm thấy câu hỏi</span>
      <p style={{ margin: '0.75rem 0 0', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        Kết quả có questionId <strong>{result.questionId}</strong>, nhưng câu hỏi này không có trong file đề hiện tại.
      </p>
    </div>
  );
}

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

export default function ExamRetryWrongPage() {
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const shortcutHelpId = useId();
  const shortcutHelpTriggerRef = useRef<HTMLButtonElement>(null);
  const questionRef = useRef<HTMLDivElement>(null);
  const { sessionId } = useParams<{ sessionId: string }>();
  const [result, setResult] = useState<ExamResultV2 | null>(null);
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
      if (!sessionId) {
        setError('Liên kết ôn lại không hợp lệ.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const storedResult = readResultFromLS(sessionId);
      if (!storedResult) {
        if (!alive) return;
        setError('Không tìm thấy kết quả bài làm để ôn lại.');
        setLoading(false);
        return;
      }

      if (!alive) return;
      setResult(storedResult);

      if (storedResult.isCustom) {
        if (storedResult.questionSnapshots?.length) {
          setLoading(false);
          return;
        }
        setError('Kết quả tùy chọn này thiếu dữ liệu câu hỏi để ôn lại. Bạn có thể tạo một đề tùy chọn mới hoặc xem lại lịch sử luyện thi.');
        setLoading(false);
        return;
      }

      if (!storedResult.examId) {
        setError('Kết quả này thiếu mã đề nên chưa thể tải câu hỏi để ôn lại.');
        setLoading(false);
        return;
      }

      try {
        const loadedExam = await loadExam(storedResult.examId);
        if (!alive) return;
        setExam(loadedExam);
      } catch (err) {
        if (!alive) return;
        const detail = err instanceof Error ? err.message : 'Không rõ nguyên nhân.';
        setError(`Không tải được đề thi để ôn lại. ${detail}`);
      } finally {
        if (alive) setLoading(false);
      }
    }

    void loadData();

    return () => {
      alive = false;
    };
  }, [sessionId]);

  const questionMap = useMemo(() => {
    if (result?.isCustom && result.questionSnapshots?.length) {
      return new Map(result.questionSnapshots.map((question) => [question.id, question as Question]));
    }
    if (!exam) return new Map<string, Question>();
    return new Map(flattenExamQuestions(exam).map((question) => [question.id, question]));
  }, [exam, result]);

  const retryResults = useMemo(() => {
    return result?.questions.filter(isRetryCandidate) ?? [];
  }, [result]);

  const currentResult = retryResults[currentIndex];
  const currentQuestion = currentResult ? questionMap.get(currentResult.questionId) : undefined;
  const checkedCount = retryResults.filter((item) => checked[item.questionId]).length;
  const correctedCount = retryResults.filter((item) => {
    if (!checked[item.questionId]) return false;
    const question = questionMap.get(item.questionId);
    if (!question) return false;
    if (isMCQQuestion(question)) return mcqAnswers[item.questionId] === question.correctOptionId;
    if (isTFQuestion(question)) {
      const answer = tfAnswers[item.questionId];
      return !!answer && question.statements.every((statement) => answer[statement.id] === statement.isTrue);
    }
    return false;
  }).length;
  const navigatorItems: QuickNavigatorItem[] = retryResults.map((item, index) => {
    const question = questionMap.get(item.questionId);
    const wasChecked = !!checked[item.questionId];
    const hasSelection = question && isMCQQuestion(question)
      ? mcqAnswers[item.questionId] != null
      : Object.values(tfAnswers[item.questionId] ?? makeBlankTFChoice()).some((value) => value != null);
    const isCorrect = !!question && wasChecked && (isMCQQuestion(question)
      ? mcqAnswers[item.questionId] === question.correctOptionId
      : isTFQuestion(question) && question.statements.every((statement) => tfAnswers[item.questionId]?.[statement.id] === statement.isTrue));
    return { id: `${item.questionId}-${index}`, label: String(index + 1), state: wasChecked ? (isCorrect ? 'correct' : 'incorrect') : hasSelection ? 'selected' : 'untouched' };
  });

  const navigateToQuestion = useQuestionNavigation({ questionCount: retryResults.length, onIndexChange: setCurrentIndex, questionRef });
  const goToPreviousQuestion = useCallback(() => navigateToQuestion(currentIndex - 1), [currentIndex, navigateToQuestion]);
  const goToNextQuestion = useCallback(() => navigateToQuestion(currentIndex + 1), [currentIndex, navigateToQuestion]);
  const checkCurrentQuestion = useCallback(() => {
    if (!currentQuestion || !currentResult || checked[currentResult.questionId]) return;
    const ready = isMCQQuestion(currentQuestion) ? mcqAnswers[currentResult.questionId] != null : currentQuestion.statements.every((statement) => tfAnswers[currentResult.questionId]?.[statement.id] != null);
    if (ready) setChecked((prev) => ({ ...prev, [currentResult.questionId]: true }));
  }, [checked, currentQuestion, currentResult, mcqAnswers, tfAnswers]);

  useExamKeyboardShortcuts({
    onPrevious: goToPreviousQuestion,
    onNext: goToNextQuestion,
    onShowHelp: () => setShortcutHelpOpen(true),
    onCheck: checkCurrentQuestion,
    onSelectOptionByIndex: (index) => {
      if (currentQuestion && currentResult && isMCQQuestion(currentQuestion) && !checked[currentResult.questionId]) {
        const option = currentQuestion.options[index];
        if (option) setMcqAnswers((prev) => ({ ...prev, [currentResult.questionId]: option.id }));
      }
    },
    mode: 'practice',
    disabled: loading || Boolean(error) || !result || !currentResult || finished || shortcutHelpOpen,
  });

  if (loading) return <LoadingState />;

  if (error || !result) {
    return <EmptyState title="Chưa thể mở ôn lại" message={error ?? 'Dữ liệu ôn lại chưa sẵn sàng.'} sessionId={sessionId} />;
  }

  if (retryResults.length === 0) {
    return (
      <EmptyState
        title="Bạn đã làm đúng toàn bộ câu hỏi trong bài này"
        message="Không có câu sai hoặc bỏ trống để ôn lại. Có vẻ phần này đã rất ổn rồi."
        sessionId={sessionId}
      />
    );
  }

  if (finished) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-app)', padding: '2rem 1.5rem', color: 'var(--text-primary)' }}>
        <div style={{ maxWidth: '80rem', margin: '0 auto', display: 'grid', gap: '1.5rem' }}>
          <ExamPracticeHeader backTo={`/exams/ket-qua/${result.sessionId}`} backLabel="Quay lại kết quả" mode="Ôn lại câu sai" title={result.isCustom ? result.title ?? 'Thi thử tùy chọn' : exam ? formatExamTitle(exam) : 'Đề thi'} badge="Không tính giờ" />
          <div style={{ width: '100%', maxWidth: '42rem', margin: '0 auto' }}>
          <div style={{ ...cardStyle, textAlign: 'center', padding: '2rem' }}>
            <h1 style={{ margin: '0 0 0.75rem', fontSize: '1.5rem', fontWeight: 900 }}>Hoàn thành ôn lại</h1>
            <p style={{ margin: '0 0 1.5rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Bạn đã kiểm tra {checkedCount}/{retryResults.length} câu cần ôn. Số câu trả lời đúng lại: {correctedCount}.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center' }}>
              <Link to={`/exams/ket-qua/${result.sessionId}`} style={buttonStyle('primary')}>
                Quay về kết quả
              </Link>
              <Link to="/exams/browse" style={buttonStyle('secondary')}>
                Làm đề khác
              </Link>
            </div>
          </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-primary)', padding: '2rem 1.5rem' }}>
      <div className="exam-practice-layout">
      <main className="exam-practice-content">
        <ExamPracticeHeader backTo={`/exams/ket-qua/${result.sessionId}`} backLabel="Quay lại kết quả" mode="Ôn lại câu sai" title={result.isCustom ? result.title ?? 'Thi thử tùy chọn' : exam ? formatExamTitle(exam) : 'Đề thi'} badge="Không tính giờ" helpId={shortcutHelpId} helpOpen={shortcutHelpOpen} helpTriggerRef={shortcutHelpTriggerRef} onHelp={() => setShortcutHelpOpen(true)} />

        <div style={{ ...cardStyle, padding: '1rem 1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <strong>
              Câu {currentIndex + 1}/{retryResults.length}
            </strong>
            <span style={{ color: 'var(--text-muted)' }}>Đã kiểm tra {checkedCount}/{retryResults.length}</span>
            <span style={{ flex: 1 }} />
            <span style={chipStyle('warning')}>{retryResults.length} câu cần ôn</span>
          </div>
          <div style={{ height: '0.45rem', background: 'var(--bg-surface)', borderRadius: '999px', overflow: 'hidden', marginTop: '0.8rem' }}>
            <div role="progressbar" aria-label={`Tiến độ kiểm tra: ${checkedCount} trên ${retryResults.length} câu`} aria-valuemin={0} aria-valuemax={retryResults.length} aria-valuenow={checkedCount} style={{ width: `${(checkedCount / retryResults.length) * 100}%`, height: '100%', background: 'var(--accent)', borderRadius: '999px' }} />
          </div>
        </div>

        <div ref={questionRef} tabIndex={-1} data-exam-current-question>
        {currentResult && currentQuestion && isMCQQuestion(currentQuestion) && (
          <MCQRetryCard
            question={currentQuestion}
            selected={mcqAnswers[currentResult.questionId] ?? null}
            checked={!!checked[currentResult.questionId]}
            onSelect={(value) => {
              if (!checked[currentResult.questionId]) setMcqAnswers((prev) => ({ ...prev, [currentResult.questionId]: value }));
            }}
            onCheck={() => setChecked((prev) => ({ ...prev, [currentResult.questionId]: true }))}
          />
        )}

        {currentResult && currentQuestion && isTFQuestion(currentQuestion) && (
          <TFRetryCard
            question={currentQuestion}
            selected={tfAnswers[currentResult.questionId] ?? makeBlankTFChoice()}
            checked={!!checked[currentResult.questionId]}
            onSelect={(statementId, value) =>
              !checked[currentResult.questionId] && setTfAnswers((prev) => ({
                ...prev,
                [currentResult.questionId]: {
                  ...(prev[currentResult.questionId] ?? makeBlankTFChoice()),
                  [statementId]: value,
                },
              }))
            }
            onCheck={() => setChecked((prev) => ({ ...prev, [currentResult.questionId]: true }))}
          />
        )}

        {currentResult && !currentQuestion && <MissingQuestionCard result={currentResult} />}
        </div>

        <nav style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <button
            type="button"
            onClick={goToPreviousQuestion}
            disabled={currentIndex === 0}
            style={{ ...buttonStyle('secondary'), opacity: currentIndex === 0 ? 0.55 : 1 }}
          >
            Câu trước
          </button>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {currentIndex < retryResults.length - 1 ? (
              <button type="button" onClick={goToNextQuestion} style={buttonStyle('primary')}>
                Câu tiếp theo
              </button>
            ) : (
              <button type="button" onClick={() => setFinished(true)} style={buttonStyle('primary')}>
                Hoàn thành
              </button>
            )}
          </div>
        </nav>
      </main>
      <ExamQuickNavigator items={navigatorItems} currentIndex={currentIndex} onSelect={navigateToQuestion} />
      </div>
      <ExamShortcutHelp id={shortcutHelpId} isOpen={shortcutHelpOpen} onClose={() => setShortcutHelpOpen(false)} triggerRef={shortcutHelpTriggerRef} shortcuts={PRACTICE_SHORTCUTS} description="Không giới hạn thời gian. Kiểm tra lại từng câu và đọc giải thích để củng cố phần còn thiếu." />
    </div>
  );
}

const PRACTICE_SHORTCUTS: ExamShortcutItem[] = [
  { keyLabel: '← / →', description: 'Chuyển câu' },
  { keyLabel: '↑ / ↓', description: 'Chuyển giữa các đáp án trắc nghiệm' },
  { keyLabel: '1–4', description: 'Chọn nhanh đáp án A–D' },
  { keyLabel: 'Ctrl + Enter', description: 'Kiểm tra câu hiện tại' },
  { keyLabel: '?', description: 'Mở hướng dẫn làm bài' },
];
