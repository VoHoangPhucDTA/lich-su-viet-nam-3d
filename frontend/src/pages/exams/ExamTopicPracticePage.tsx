import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatCognitiveLevelLabel, formatDifficultyLabel, formatQuestionTypeLabel } from '@/lib/exam/displayLabels';
import { handleRadioGroupKeyDown } from '@/lib/exam/radioGroupKeyboard';
import { loadExam } from '@/lib/exam/examLoader';
import { useExamKeyboardShortcuts } from '@/lib/exam/useExamKeyboardShortcuts';
import ExamQuickNavigator, { type QuickNavigatorItem } from '@/components/exams/ExamQuickNavigator';
import ExamShortcutHelp, { type ExamShortcutItem } from '@/components/exams/ExamShortcutHelp';
import ExamPracticeHeader from '@/components/exams/ExamPracticeHeader';
import ExamExplanationText from '@/components/exams/ExamExplanationText';
import { useQuestionNavigation } from '@/lib/exam/useQuestionNavigation';
import { loadTopicIndex } from '@/lib/exam/topicIndexLoader';
import { findSummaryBySlug } from '@/lib/exam/topicGrouping';
import {
  flattenExamQuestions,
  isMCQQuestion,
  isTFQuestion,
  type MCQQuestion,
  type Question,
  type TopicIndexEntry,
  type TFQuestion,
  type TFStatement,
} from '@/types/exam';

type MCQChoice = 'A' | 'B' | 'C' | 'D';
type TFChoice = Record<'a' | 'b' | 'c' | 'd', boolean | null>;

interface PracticeQuestion {
  question: Question;
  examId: string;
}

function blankTF(): TFChoice {
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
  return { display: 'inline-flex', alignItems: 'center', padding: '0.2rem 0.55rem', borderRadius: '999px', background: colors[0], border: `1px solid ${colors[1]}`, color: colors[2], fontSize: '0.75rem', fontWeight: 800 };
}

const cardStyle: CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: '1rem',
  padding: '1.25rem',
};

function Explanation({ text, correct }: { text: string; correct: boolean }) {
  return (
    <div style={{ marginTop: '1rem', background: correct ? 'rgba(47,122,87,0.08)' : 'rgba(194,155,75,0.1)', border: `1px solid ${correct ? 'rgba(47,122,87,0.26)' : 'rgba(194,155,75,0.3)'}`, borderRadius: '0.8rem', padding: '0.95rem 1rem', color: 'var(--text-secondary)', lineHeight: 1.65 }}>
      <strong style={{ color: correct ? 'var(--success)' : 'var(--warning)' }}>{correct ? 'Chính xác!' : 'Hãy đọc giải thích trước khi sang câu tiếp theo.'}</strong>
      {text?.trim() && (
        <p style={{ margin: '0.5rem 0 0' }}>
          <strong style={{ color: 'var(--text-primary)' }}>Giải thích: </strong>
          <ExamExplanationText text={text} />
        </p>
      )}
    </div>
  );
}

function MCQCard({ question, selected, checked, onSelect, onCheck }: { question: MCQQuestion; selected: MCQChoice | null; checked: boolean; onSelect: (value: MCQChoice) => void; onCheck: () => void }) {
  const correct = checked && selected === question.correctOptionId;
  return (
    <div style={cardStyle}>
      <QuestionMeta question={question} />
      <h2 style={questionTitleStyle}>{question.questionText}</h2>
      <div role="radiogroup" aria-orientation="vertical" aria-label="Chọn đáp án" style={{ display: 'grid', gap: '0.65rem', marginTop: '1rem' }}>
        {question.options.map((option) => {
          const chosen = selected === option.id;
          const isAnswer = option.id === question.correctOptionId;
          const border = checked && isAnswer ? 'rgba(47,122,87,0.38)' : checked && chosen && !isAnswer ? 'rgba(159,29,45,0.32)' : chosen ? 'var(--accent)' : 'var(--border)';
          const background = checked && isAnswer ? 'rgba(47,122,87,0.1)' : checked && chosen && !isAnswer ? 'rgba(159,29,45,0.08)' : chosen ? 'var(--accent-soft)' : 'var(--bg-surface)';
          return (
            <button key={option.id} type="button" role="radio" aria-checked={chosen} aria-label={`Đáp án ${option.id}: ${option.text}${chosen ? ', đang chọn' : ''}`} tabIndex={selected ? (chosen ? 0 : -1) : option.id === question.options[0]?.id ? 0 : -1} disabled={checked} onKeyDown={(event) => handleRadioGroupKeyDown(event, question.options.map((item) => item.id), option.id, onSelect, checked)} onClick={() => onSelect(option.id)} className="exam-focusable" style={{ border: `1px solid ${border}`, background, color: 'var(--text-primary)', borderRadius: '0.8rem', padding: '0.9rem 1rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start', textAlign: 'left', cursor: checked ? 'default' : 'pointer' }}>
              <strong style={{ minWidth: '1.5rem' }}>{option.id}.</strong>
              <span style={{ flex: 1, lineHeight: 1.55 }}>{option.text}</span>
              {checked && isAnswer && <span style={chipStyle('success')}>Đáp án đúng</span>}
              {checked && chosen && !isAnswer && <span style={chipStyle('danger')}>Bạn đã chọn</span>}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem', alignItems: 'center' }}>
        <button type="button" onClick={onCheck} disabled={!selected || checked} style={{ ...buttonStyle('primary'), opacity: selected && !checked ? 1 : 0.55 }}>Kiểm tra</button>
        {checked && <span style={chipStyle('success')}>Đáp án đúng: {question.correctOptionId}</span>}
      </div>
      {checked && <Explanation text={question.explanation} correct={correct} />}
    </div>
  );
}

function TFCard({ question, selected, checked, onSelect, onCheck }: { question: TFQuestion; selected: TFChoice; checked: boolean; onSelect: (id: TFStatement['id'], value: boolean) => void; onCheck: () => void }) {
  const allAnswered = Object.values(selected).every((value) => value != null);
  const correctCount = question.statements.filter((statement) => selected[statement.id] === statement.isTrue).length;
  const correct = checked && correctCount === 4;
  return (
    <div style={cardStyle}>
      <QuestionMeta question={question} />
      <h2 style={questionTitleStyle}>{question.questionText}</h2>
      <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem' }}>
        {question.statements.map((statement) => {
          const current = selected[statement.id];
          const rowCorrect = checked && current === statement.isTrue;
          const rowWrong = checked && current !== null && current !== statement.isTrue;
          return (
            <div key={statement.id} style={{ border: `1px solid ${rowCorrect ? 'rgba(47,122,87,0.35)' : rowWrong ? 'rgba(159,29,45,0.32)' : 'var(--border)'}`, background: rowCorrect ? 'rgba(47,122,87,0.08)' : rowWrong ? 'rgba(159,29,45,0.07)' : 'var(--bg-surface)', borderRadius: '0.8rem', padding: '0.9rem 1rem' }}>
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
                {checked && <span style={chipStyle('success')}>Đáp án đúng: {statement.isTrue ? 'Đúng' : 'Sai'}</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem', alignItems: 'center' }}>
        <button type="button" onClick={onCheck} disabled={!allAnswered || checked} style={{ ...buttonStyle('primary'), opacity: allAnswered && !checked ? 1 : 0.55 }}>Kiểm tra</button>
        {checked && <span style={chipStyle(correct ? 'success' : 'warning')}>{correctCount}/4 ý đúng</span>}
      </div>
      {checked && <Explanation text={question.explanation} correct={correct} />}
    </div>
  );
}

const questionTitleStyle: CSSProperties = { margin: '0.75rem 0 0', color: 'var(--text-primary)', fontSize: '1.05rem', lineHeight: 1.6 };

function QuestionMeta({ question }: { question: Question }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
      <span style={chipStyle()}>{formatQuestionTypeLabel(question.questionType)}</span>
      <span style={chipStyle()}>{question.topic}</span>
      <span style={chipStyle()}>{formatDifficultyLabel(question.difficulty)}</span>
      <span style={chipStyle()}>{formatCognitiveLevelLabel(question.cognitiveLevel)}</span>
    </div>
  );
}

function shuffleArray<T>(items: T[]): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function samplePracticeRefs(refs: TopicIndexEntry[], limit = 30): TopicIndexEntry[] {
  const byExam = new Map<string, TopicIndexEntry[]>();
  for (const ref of shuffleArray(refs)) {
    const bucket = byExam.get(ref.examId) ?? [];
    bucket.push(ref);
    byExam.set(ref.examId, bucket);
  }

  const exams = shuffleArray(Array.from(byExam.keys()));
  const picked: TopicIndexEntry[] = [];

  while (picked.length < limit && exams.some((examId) => (byExam.get(examId)?.length ?? 0) > 0)) {
    for (const examId of exams) {
      const bucket = byExam.get(examId);
      const next = bucket?.shift();
      if (next) picked.push(next);
      if (picked.length >= limit) break;
    }
  }

  return picked;
}

export default function ExamTopicPracticePage() {
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const shortcutHelpId = useId();
  const shortcutHelpTriggerRef = useRef<HTMLButtonElement>(null);
  const questionRef = useRef<HTMLDivElement>(null);
  const { topicSlug } = useParams<{ topicSlug: string }>();
  const [title, setTitle] = useState('');
  const [practiceLabel, setPracticeLabel] = useState('Ôn theo chủ đề');
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
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
      if (!topicSlug) {
        setError('Liên kết chủ đề không hợp lệ.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const index = await loadTopicIndex();
        const summary = findSummaryBySlug(index, topicSlug);
        if (!summary) {
          setError('Không tìm thấy chủ đề hoặc giai đoạn này.');
          return;
        }
        const refs = samplePracticeRefs(summary.refs, 30);
        const examIds = Array.from(new Set(refs.map((ref) => ref.examId)));
        const loaded = await Promise.allSettled(examIds.map((examId) => loadExam(examId)));
        const questionMap = new Map<string, PracticeQuestion>();
        loaded.forEach((result, indexInList) => {
          if (result.status !== 'fulfilled') return;
          const examId = examIds[indexInList];
          for (const question of flattenExamQuestions(result.value)) {
            questionMap.set(`${examId}:${question.id}`, { question, examId });
          }
        });
        const picked = refs
          .map((ref) => questionMap.get(`${ref.examId}:${ref.questionId}`))
          .filter((value): value is PracticeQuestion => Boolean(value));
        if (!alive) return;
        setTitle(summary.title);
        setPracticeLabel(summary.topics.length > 1 ? 'Ôn theo giai đoạn' : 'Ôn theo chủ đề');
        setQuestions(picked);
        if (picked.length === 0) setError('Chủ đề này chưa tải được câu hỏi phù hợp.');
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : 'Không tải được dữ liệu ôn chủ đề.');
      } finally {
        if (alive) setLoading(false);
      }
    }
    void loadData();
    return () => {
      alive = false;
    };
  }, [topicSlug]);

  const current = questions[currentIndex];
  const checkedCount = questions.filter((item) => checked[item.question.id]).length;
  const correctCount = questions.filter((item) => {
    const question = item.question;
    if (!checked[question.id]) return false;
    if (isMCQQuestion(question)) return mcqAnswers[question.id] === question.correctOptionId;
    if (isTFQuestion(question)) {
      const answer = tfAnswers[question.id];
      return !!answer && question.statements.every((statement) => answer[statement.id] === statement.isTrue);
    }
    return false;
  }).length;
  const navigatorItems: QuickNavigatorItem[] = questions.map(({ question }, index) => {
    const wasChecked = !!checked[question.id];
    const hasSelection = isMCQQuestion(question)
      ? mcqAnswers[question.id] != null
      : Object.values(tfAnswers[question.id] ?? blankTF()).some((value) => value != null);
    const isCorrect = wasChecked && (isMCQQuestion(question)
      ? mcqAnswers[question.id] === question.correctOptionId
      : question.statements.every((statement) => tfAnswers[question.id]?.[statement.id] === statement.isTrue));
    return { id: `${question.id}-${index}`, label: String(index + 1), state: wasChecked ? (isCorrect ? 'correct' : 'incorrect') : hasSelection ? 'selected' : 'untouched' };
  });

  const navigateToQuestion = useQuestionNavigation({ questionCount: questions.length, onIndexChange: setCurrentIndex, questionRef });
  const goToPreviousQuestion = useCallback(() => navigateToQuestion(currentIndex - 1), [currentIndex, navigateToQuestion]);
  const goToNextQuestion = useCallback(() => navigateToQuestion(currentIndex + 1), [currentIndex, navigateToQuestion]);
  const checkCurrentQuestion = useCallback(() => {
    if (!current || checked[current.question.id]) return;
    const question = current.question;
    const ready = isMCQQuestion(question) ? mcqAnswers[question.id] != null : question.statements.every((statement) => tfAnswers[question.id]?.[statement.id] != null);
    if (ready) setChecked((prev) => ({ ...prev, [question.id]: true }));
  }, [checked, current, mcqAnswers, tfAnswers]);

  useExamKeyboardShortcuts({
    onPrevious: goToPreviousQuestion,
    onNext: goToNextQuestion,
    onShowHelp: () => setShortcutHelpOpen(true),
    onCheck: checkCurrentQuestion,
    onSelectOptionByIndex: (index) => {
      const question = current?.question;
      if (question && isMCQQuestion(question) && !checked[question.id]) {
        const option = question.options[index];
        if (option) setMcqAnswers((prev) => ({ ...prev, [question.id]: option.id }));
      }
    },
    mode: 'practice',
    disabled: loading || Boolean(error) || !current || finished || shortcutHelpOpen,
  });

  function reset() {
    setCurrentIndex(0);
    setFinished(false);
    setMcqAnswers({});
    setTfAnswers({});
    setChecked({});
  }

  if (loading) return <StatePage title="Đang tải chủ đề..." message="Hệ thống đang chuẩn bị câu hỏi từ các đề thi." />;
  if (error || !current) return <StatePage title="Chưa thể mở chủ đề" message={error ?? 'Không có câu hỏi để luyện.'} />;

  if (finished) {
    const percent = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;
    const advice = percent >= 80
      ? 'Bạn có thể chuyển sang làm đề thi thử để kiểm tra khả năng tổng hợp.'
      : 'Bạn nên luyện lại chủ đề này và đọc kỹ phần giải thích ở các câu chưa đúng.';
    return (
      <div style={pageStyle}>
        <div style={{ maxWidth: '80rem', margin: '0 auto', display: 'grid', gap: '1.5rem' }}>
          <ExamPracticeHeader backTo="/exams/on-chu-de" backLabel="Quay lại danh sách chủ đề" mode={practiceLabel} title={title} badge="Không tính giờ" />
          <div style={{ width: '100%', maxWidth: '42rem', margin: '0 auto' }}>
          <div style={{ ...cardStyle, textAlign: 'center', padding: '2rem' }}>
            <span style={chipStyle('success')}>{practiceLabel}</span>
            <h1 style={{ margin: '0.8rem 0 0.75rem', fontSize: '1.5rem', fontWeight: 900 }}>Hoàn thành luyện tập</h1>
            <p style={{ margin: '0 0 1.5rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Chủ đề: <strong>{title}</strong>. Bạn đã kiểm tra {checkedCount}/{questions.length} câu, đúng {correctCount} câu ({percent}%).
            </p>
            <p style={{ margin: '0 0 1.5rem', color: 'var(--text-secondary)', lineHeight: 1.6, fontWeight: 700 }}>
              {advice}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center' }}>
              <button type="button" onClick={reset} style={buttonStyle('primary')}>Luyện lại chủ đề này</button>
              <Link to="/exams/on-chu-de" style={buttonStyle('secondary')}>Chọn chủ đề khác</Link>
              <Link to="/exams/browse" style={buttonStyle('secondary')}>Làm đề thi thử</Link>
            </div>
          </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div className="exam-practice-layout">
      <main className="exam-practice-content">
        <ExamPracticeHeader backTo="/exams/on-chu-de" backLabel="Quay lại danh sách chủ đề" mode={practiceLabel} title={title} badge="Không tính giờ" helpId={shortcutHelpId} helpOpen={shortcutHelpOpen} helpTriggerRef={shortcutHelpTriggerRef} onHelp={() => setShortcutHelpOpen(true)} />

        <div style={{ ...cardStyle, padding: '1rem 1.25rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <strong>Câu {currentIndex + 1}/{questions.length}</strong>
            <span style={{ color: 'var(--text-muted)' }}>Đã kiểm tra {checkedCount}/{questions.length}</span>
            <span style={{ color: 'var(--text-muted)' }}>Đúng {correctCount}</span>
          </div>
          <div style={{ height: '0.45rem', background: 'var(--bg-surface)', borderRadius: '999px', overflow: 'hidden', marginTop: '0.8rem' }}>
            <div role="progressbar" aria-label={`Tiến độ kiểm tra: ${checkedCount} trên ${questions.length} câu`} aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={checkedCount} style={{ width: `${(checkedCount / questions.length) * 100}%`, height: '100%', background: 'var(--accent)' }} />
          </div>
        </div>

        <div ref={questionRef} tabIndex={-1} data-exam-current-question>
        {isMCQQuestion(current.question) && (
          <MCQCard question={current.question} selected={mcqAnswers[current.question.id] ?? null} checked={!!checked[current.question.id]} onSelect={(value) => {
            if (!checked[current.question.id]) setMcqAnswers((prev) => ({ ...prev, [current.question.id]: value }));
          }} onCheck={() => setChecked((prev) => ({ ...prev, [current.question.id]: true }))} />
        )}
        {isTFQuestion(current.question) && (
          <TFCard question={current.question} selected={tfAnswers[current.question.id] ?? blankTF()} checked={!!checked[current.question.id]} onSelect={(id, value) => {
            if (!checked[current.question.id]) setTfAnswers((prev) => ({ ...prev, [current.question.id]: { ...(prev[current.question.id] ?? blankTF()), [id]: value } }));
          }} onCheck={() => setChecked((prev) => ({ ...prev, [current.question.id]: true }))} />
        )}
        </div>

        <nav style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <button type="button" onClick={goToPreviousQuestion} disabled={currentIndex === 0} style={{ ...buttonStyle('secondary'), opacity: currentIndex === 0 ? 0.55 : 1 }}>Câu trước</button>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setFinished(true)} style={buttonStyle('danger')}>Kết thúc</button>
            {currentIndex < questions.length - 1 ? (
              <button type="button" onClick={goToNextQuestion} style={buttonStyle('primary')}>Câu tiếp theo</button>
            ) : (
              <button type="button" onClick={() => setFinished(true)} style={buttonStyle('primary')}>Hoàn thành</button>
            )}
          </div>
        </nav>
      </main>
      <ExamQuickNavigator items={navigatorItems} currentIndex={currentIndex} onSelect={navigateToQuestion} />
      </div>
      <ExamShortcutHelp id={shortcutHelpId} isOpen={shortcutHelpOpen} onClose={() => setShortcutHelpOpen(false)} triggerRef={shortcutHelpTriggerRef} shortcuts={PRACTICE_SHORTCUTS} description="Không giới hạn thời gian. Kiểm tra và đọc giải thích sau từng câu." />
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

const pageStyle: CSSProperties = { minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-primary)', padding: '2rem 1.5rem' };

function StatePage({ title, message }: { title: string; message: string }) {
  return (
    <div style={{ ...pageStyle, display: 'grid', placeItems: 'center' }}>
      <div style={{ ...cardStyle, textAlign: 'center', maxWidth: '34rem' }}>
        <h1 style={{ margin: '0 0 0.75rem', fontSize: '1.35rem' }}>{title}</h1>
        <p style={{ margin: '0 0 1.5rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>{message}</p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link to="/exams/on-chu-de" style={buttonStyle('primary')}>Quay lại chủ đề</Link>
          <Link to="/exams/browse" style={buttonStyle('secondary')}>Danh sách đề</Link>
        </div>
      </div>
    </div>
  );
}
