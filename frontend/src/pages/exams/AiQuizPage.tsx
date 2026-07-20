import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Sparkles } from 'lucide-react';
import ExamPracticeHeader from '@/components/exams/ExamPracticeHeader';
import ExamQuickNavigator, { type QuickNavigatorItem } from '@/components/exams/ExamQuickNavigator';
import MCQQuestionCardV2 from '@/components/exams/MCQQuestionCardV2';
import { adaptAiQuizResponse, formatAiQuizSource } from '@/lib/exam/aiQuizAdapter';
import {
  AI_QUIZ_COUNT_MAX,
  AI_QUIZ_COUNT_MIN,
  AI_QUIZ_QUERY_MAX_LENGTH,
  generateAiQuiz,
  getAiQuizErrorMessage,
} from '@/services/aiQuizApi';
import type { QuestionResult } from '@/types/exam';
import type { AiQuizDifficulty, AiQuizViewModel } from '@/types/aiQuiz';

type PageStatus = 'IDLE' | 'VALIDATING' | 'GENERATING' | 'READY' | 'SUBMITTED' | 'ERROR';
type OptionId = 'A' | 'B' | 'C' | 'D';
type FormErrors = Partial<Record<'query' | 'grade' | 'lessonNumber' | 'difficulty' | 'count', string>>;

const DIFFICULTY_OPTIONS: Array<{ value: AiQuizDifficulty; label: string }> = [
  { value: 'EASY', label: 'Dễ' },
  { value: 'MEDIUM', label: 'Trung bình' },
  { value: 'HARD', label: 'Khó' },
];

export default function AiQuizPage() {
  const [status, setStatus] = useState<PageStatus>('IDLE');
  const [query, setQuery] = useState('');
  const [grade, setGrade] = useState<10 | 11 | 12>(12);
  const [lessonNumber, setLessonNumber] = useState('');
  const [difficulty, setDifficulty] = useState<AiQuizDifficulty>('MEDIUM');
  const [count, setCount] = useState(5);
  const [errors, setErrors] = useState<FormErrors>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadingStep, setLoadingStep] = useState(0);
  const [quiz, setQuiz] = useState<AiQuizViewModel | null>(null);
  const [quizGrade, setQuizGrade] = useState<number>(12);
  const [answers, setAnswers] = useState<Record<string, OptionId>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const queryRef = useRef<HTMLTextAreaElement>(null);
  const lessonRef = useRef<HTMLInputElement>(null);
  const countRef = useRef<HTMLInputElement>(null);
  const questionRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    if (status !== 'GENERATING') return undefined;
    setLoadingStep(0);
    const timer = window.setTimeout(() => setLoadingStep(1), 2200);
    return () => window.clearTimeout(timer);
  }, [status]);
  useEffect(() => {
    if (status === 'READY' || status === 'SUBMITTED') questionRef.current?.focus();
  }, [currentIndex, status]);

  const currentQuestion = quiz?.questions[currentIndex] ?? null;
  const answeredCount = Object.keys(answers).length;
  const correctCount = quiz?.questions.filter((question) => answers[question.id] === question.correctOptionId).length ?? 0;
  const isBusy = status === 'VALIDATING' || status === 'GENERATING';
  const navigatorItems = useMemo<QuickNavigatorItem[]>(() => quiz?.questions.map((question, index) => ({
    id: question.id,
    label: String(index + 1),
    state: status === 'SUBMITTED'
      ? (answers[question.id] === question.correctOptionId ? 'correct' : 'incorrect')
      : (answers[question.id] ? 'selected' : 'untouched'),
  })) ?? [], [answers, quiz, status]);

  async function submitGeneration(event?: FormEvent) {
    event?.preventDefault();
    if (abortRef.current || isBusy) return;
    setStatus('VALIDATING');
    setErrorMessage(null);
    const nextErrors = validateForm({ query, grade, lessonNumber, difficulty, count });
    setErrors(nextErrors);
    const firstError = Object.keys(nextErrors)[0] as keyof FormErrors | undefined;
    if (firstError) {
      setStatus('IDLE');
      if (firstError === 'query') queryRef.current?.focus();
      if (firstError === 'lessonNumber') lessonRef.current?.focus();
      if (firstError === 'count') countRef.current?.focus();
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('GENERATING');
    try {
      const response = await generateAiQuiz({
        query,
        grade,
        difficulty,
        count,
        ...(lessonNumber.trim() ? { lessonNumber: Number(lessonNumber) } : {}),
      }, controller.signal);
      if (controller.signal.aborted) return;
      setQuiz(adaptAiQuizResponse(response, query.trim(), grade));
      setQuizGrade(grade);
      setAnswers({});
      setCurrentIndex(0);
      setStatus('READY');
    } catch (error: unknown) {
      if (controller.signal.aborted) return;
      setErrorMessage(getAiQuizErrorMessage(error));
      setStatus('ERROR');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  function cancelWaiting() {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus('IDLE');
  }

  function restartQuiz() {
    setAnswers({});
    setCurrentIndex(0);
    setStatus('READY');
  }

  if (quiz && currentQuestion && (status === 'READY' || status === 'SUBMITTED')) {
    const selected = answers[currentQuestion.id] ?? null;
    const result: QuestionResult = {
      questionId: currentQuestion.id,
      questionType: 'mcq',
      isCorrect: selected === currentQuestion.correctOptionId,
      pointsEarned: selected === currentQuestion.correctOptionId ? 1 : 0,
      mcq: { selected, correct: currentQuestion.correctOptionId },
    };
    return (
      <div className="ai-quiz-page">
        <main className="ai-quiz-main">
          <ExamPracticeHeader backTo="/exams" backLabel="Quay lại luyện thi" mode="Bài luyện tập do AI tạo" title={query.trim()} badge="Không lưu vào ngân hàng đề" />
          {quiz.generation.partial && (
            <p className="ai-quiz-notice" role="status">Hệ thống đã tạo được {quiz.generation.generatedCount}/{quiz.generation.requestedCount} câu phù hợp với nguồn tài liệu.</p>
          )}
          <p className="ai-quiz-auto-note">Nội dung được tạo tự động từ tài liệu học tập.</p>
          {status === 'SUBMITTED' && (
            <section className="ai-quiz-summary" aria-labelledby="ai-quiz-result-title">
              <div><span>Kết quả</span><strong id="ai-quiz-result-title">{correctCount}/{quiz.questions.length} câu đúng</strong></div>
              <div><span>Điểm quy đổi</span><strong>{((correctCount / quiz.questions.length) * 10).toFixed(1)}/10</strong></div>
              <div><span>Chưa đúng</span><strong>{quiz.questions.length - correctCount}</strong></div>
              <div><span>Chưa trả lời</span><strong>{quiz.questions.length - answeredCount}</strong></div>
            </section>
          )}
          <div className="exam-practice-layout">
            <section className="exam-practice-content">
              <div ref={questionRef} tabIndex={-1} data-exam-current-question>
                <MCQQuestionCardV2
                  question={currentQuestion}
                  index={currentIndex}
                  total={quiz.questions.length}
                  selectedOptionId={selected}
                  onSelectOption={(optionId) => setAnswers((current) => ({ ...current, [currentQuestion.id]: optionId }))}
                  reviewMode={status === 'SUBMITTED'}
                  disabled={status === 'SUBMITTED'}
                  result={status === 'SUBMITTED' ? result : undefined}
                  showLearningMetadata
                  showSource={false}
                />
                {status === 'SUBMITTED' && (
                  <AiQuestionSources sources={quiz.sourcesByQuestionId[currentQuestion.id] ?? []} fallbackGrade={quizGrade} />
                )}
              </div>
              <nav className="ai-quiz-actions" aria-label="Điều hướng bài luyện tập">
                <button type="button" onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))} disabled={currentIndex === 0}>Câu trước</button>
                {status === 'READY' && currentIndex === quiz.questions.length - 1 ? (
                  <button type="button" className="is-primary" onClick={() => setStatus('SUBMITTED')}>Nộp bài</button>
                ) : (
                  <button type="button" className="is-primary" onClick={() => setCurrentIndex((value) => Math.min(quiz.questions.length - 1, value + 1))} disabled={currentIndex === quiz.questions.length - 1}>Câu sau</button>
                )}
              </nav>
              {status === 'SUBMITTED' && (
                <div className="ai-quiz-restart-actions">
                  <button type="button" onClick={restartQuiz}>Làm lại bộ câu hỏi này</button>
                  <button type="button" className="is-primary" onClick={() => void submitGeneration()}>Tạo bộ câu hỏi mới</button>
                </div>
              )}
            </section>
            <ExamQuickNavigator items={navigatorItems} currentIndex={currentIndex} onSelect={setCurrentIndex} />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="ai-quiz-page">
      <main className="ai-quiz-main ai-quiz-form-main">
        <ExamPracticeHeader backTo="/exams" backLabel="Quay lại luyện thi" mode="Luyện tập cá nhân" title="Tạo bài luyện tập bằng AI" badge="Nội dung tạo tự động" />
        <section className="ai-quiz-form-card">
          <div className="ai-quiz-form-heading"><Sparkles aria-hidden="true" /><div><h2>Tạo bộ câu hỏi từ tài liệu học tập</h2><p>Bộ câu hỏi chỉ tồn tại trong phiên trang này và không được lưu vào ngân hàng đề.</p></div></div>
          {errorMessage && <p className="ai-quiz-error" role="alert">{errorMessage}</p>}
          <form onSubmit={(event) => void submitGeneration(event)} noValidate>
            <label className="ai-quiz-field ai-quiz-field-wide">
              <span>Chủ đề hoặc yêu cầu</span>
              <textarea ref={queryRef} value={query} maxLength={AI_QUIZ_QUERY_MAX_LENGTH} rows={5} disabled={isBusy} aria-invalid={Boolean(errors.query)} aria-describedby="ai-query-help ai-query-error" onChange={(event) => setQuery(event.target.value)} placeholder="Ví dụ: Nguyên nhân thắng lợi của Cách mạng tháng Tám năm 1945" />
              <small id="ai-query-help">{query.length}/{AI_QUIZ_QUERY_MAX_LENGTH} ký tự</small>
              {errors.query && <small id="ai-query-error" className="ai-quiz-field-error">{errors.query}</small>}
            </label>
            <div className="ai-quiz-form-grid">
              <label className="ai-quiz-field"><span>Lớp</span><select value={grade} disabled={isBusy} onChange={(event) => setGrade(Number(event.target.value) as 10 | 11 | 12)}><option value={10}>Lớp 10</option><option value={11}>Lớp 11</option><option value={12}>Lớp 12</option></select></label>
              <label className="ai-quiz-field"><span>Số bài (không bắt buộc)</span><input ref={lessonRef} type="number" min={1} value={lessonNumber} disabled={isBusy} aria-invalid={Boolean(errors.lessonNumber)} onChange={(event) => setLessonNumber(event.target.value)} placeholder="Ví dụ: 6" />{errors.lessonNumber && <small className="ai-quiz-field-error">{errors.lessonNumber}</small>}</label>
              <label className="ai-quiz-field"><span>Độ khó</span><select value={difficulty} disabled={isBusy} onChange={(event) => setDifficulty(event.target.value as AiQuizDifficulty)}>{DIFFICULTY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label className="ai-quiz-field"><span>Số câu</span><input ref={countRef} type="number" min={AI_QUIZ_COUNT_MIN} max={AI_QUIZ_COUNT_MAX} value={count} disabled={isBusy} aria-invalid={Boolean(errors.count)} onChange={(event) => setCount(Number(event.target.value))} />{errors.count && <small className="ai-quiz-field-error">{errors.count}</small>}</label>
            </div>
            {status === 'GENERATING' ? (
              <div className="ai-quiz-loading" role="status" aria-live="polite"><span className="ai-quiz-spinner" aria-hidden="true" /><div><strong>{loadingStep === 0 ? 'Đang tìm nội dung phù hợp trong tài liệu...' : 'Đang tạo câu hỏi luyện tập...'}</strong><small>Quá trình này có thể mất vài giây.</small></div><button type="button" onClick={cancelWaiting}>Hủy chờ</button></div>
            ) : (
              <button type="submit" className="ai-quiz-generate-button" disabled={isBusy}><Sparkles aria-hidden="true" size={18} />Tạo bài luyện tập</button>
            )}
          </form>
        </section>
      </main>
    </div>
  );
}

function AiQuestionSources({ sources, fallbackGrade }: { sources: AiQuizViewModel['sourcesByQuestionId'][string]; fallbackGrade: number }) {
  if (sources.length === 0) return null;
  return (
    <details className="ai-quiz-sources">
      <summary>Nguồn tham khảo ({sources.length})</summary>
      <div role="region" aria-label="Nguồn tham khảo của câu hỏi">
        {sources.map((source) => <ul key={source.chunkId}>{formatAiQuizSource(source, fallbackGrade).map((line) => <li key={line}>{line}</li>)}</ul>)}
      </div>
    </details>
  );
}

function validateForm(values: { query: string; grade: number; lessonNumber: string; difficulty: string; count: number }): FormErrors {
  const next: FormErrors = {};
  if (!values.query.trim()) next.query = 'Hãy nhập chủ đề hoặc yêu cầu.';
  else if (values.query.length > AI_QUIZ_QUERY_MAX_LENGTH) next.query = `Chủ đề không được vượt quá ${AI_QUIZ_QUERY_MAX_LENGTH} ký tự.`;
  if (![10, 11, 12].includes(values.grade)) next.grade = 'Lớp phải là 10, 11 hoặc 12.';
  if (values.lessonNumber.trim() && (!Number.isInteger(Number(values.lessonNumber)) || Number(values.lessonNumber) < 1)) next.lessonNumber = 'Số bài phải là số nguyên dương.';
  if (!DIFFICULTY_OPTIONS.some((option) => option.value === values.difficulty)) next.difficulty = 'Độ khó không hợp lệ.';
  if (!Number.isInteger(values.count) || values.count < AI_QUIZ_COUNT_MIN || values.count > AI_QUIZ_COUNT_MAX) next.count = `Số câu phải từ ${AI_QUIZ_COUNT_MIN} đến ${AI_QUIZ_COUNT_MAX}.`;
  return next;
}
