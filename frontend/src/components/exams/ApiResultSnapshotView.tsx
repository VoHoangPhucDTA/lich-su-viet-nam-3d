import { useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import {
  buildQuestionDiagnosis,
  buildSingleAttemptDiagnosis,
  type DiagnosisEvidence,
  type QuestionDiagnosisStatus,
  type TopicDiagnosisBucket,
} from '@/lib/exam/singleAttemptDiagnosis';
import { formatExamTitle } from '@/lib/exam/examDisplay';
import type { NormalizedExamResult, NormalizedReviewedQuestion } from '@/lib/exam/resultAdapters';
import ExamExplanationText from './ExamExplanationText';

const NUMBER_FORMATTER = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
const SUBMITTED_AT_FORMATTER = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Asia/Ho_Chi_Minh',
});

const TOPIC_COPY: Array<{ copy: string }> = [
  { copy: 'Trong bài này, đây là nội dung bạn cần ưu tiên ôn lại nhất.' },
  { copy: 'Đây cũng là nội dung bạn nên củng cố thêm.' },
  { copy: 'Nội dung này vẫn còn nhiều câu/ý cần xem lại.' },
];

const DEFAULT_TOPIC_COPY = 'Nội dung này vẫn còn câu/ý cần xem lai.';

function formatNumber(value: number): string {
  return NUMBER_FORMATTER.format(value);
}

function formatAccuracy(value: number | null): string {
  return value === null ? '—' : `${formatNumber(value)}%`;
}

function formatSubmittedAt(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  try {
    return SUBMITTED_AT_FORMATTER.format(new Date(value));
  } catch {
    return null;
  }
}

function resultDisplayTitle(value: string | null): string {
  const normalized = formatExamTitle({ title: value ?? '' });
  return normalized || 'Kết quả bài làm';
}

function answerText(value: unknown): string {
  if (value === null || value === undefined) return 'Chưa chọn';
  if (typeof value === 'boolean') return value ? 'Đúng' : 'Sai';
  return String(value);
}

function answerFromMap(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return (value as Record<string, unknown>)[key] ?? null;
}

type ReviewFilter = 'needsReview' | 'all';

interface QuestionReviewRow {
  review: NormalizedReviewedQuestion;
  index: number;
  diagnosisStatus: QuestionDiagnosisStatus | null;
}

function buildQuestionRows(questions: NormalizedReviewedQuestion[]): QuestionReviewRow[] {
  return questions.map((review, index) => ({
    review,
    index,
    diagnosisStatus: buildQuestionDiagnosis(review)?.status ?? null,
  }));
}

function rowNeedsReview(row: QuestionReviewRow): boolean {
  return row.diagnosisStatus === 'wrong'
    || row.diagnosisStatus === 'partial'
    || row.diagnosisStatus === 'blank';
}

function EvidenceLine({ evidence, unitLabel = 'đơn vị đúng' }: { evidence: DiagnosisEvidence; unitLabel?: string }) {
  return (
    <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
      <strong style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
        {evidence.correctUnits}/{evidence.totalUnits} {unitLabel}
      </strong>
      <span aria-hidden="true"> · </span>
      <span>{formatAccuracy(evidence.accuracy)}</span>
    </p>
  );
}

function OverviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <dt style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 700 }}>{label}</dt>
      <dd style={{ margin: '0.35rem 0 0', color: 'var(--text-primary)', fontSize: '1.05rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </dd>
    </div>
  );
}

function DiagnosisMetric({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'success' | 'danger' }) {
  const color = tone === 'success' ? 'var(--success)' : tone === 'danger' ? 'var(--danger)' : 'var(--text-primary)';
  return (
    <div style={{ minWidth: 0, padding: '0.25rem 0' }}>
      <dt style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 700 }}>{label}</dt>
      <dd style={{ margin: '0.3rem 0 0', color, fontSize: 'clamp(1.35rem, 4vw, 1.8rem)', fontWeight: 900, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </dd>
    </div>
  );
}

function TopicCard({ topic, index }: { topic: TopicDiagnosisBucket; index: number }) {
  const isPrimary = index === 0;
  const copyEntry = TOPIC_COPY[index] ?? TOPIC_COPY[TOPIC_COPY.length - 1];
  const headlineCopy = topic.wrongUnits === 0 && topic.blankUnits > 0
    ? 'Nội dung này có nhiều câu/ý bạn chưa trả lời.'
    : (copyEntry?.copy ?? DEFAULT_TOPIC_COPY);
  return (
    <article
      data-topic-rank={index + 1}
      data-topic-tone={isPrimary ? 'primary' : 'secondary'}
      style={{ ...subtleSurfaceStyle, display: 'grid', gap: '0.8rem', minWidth: 0 }}
    >
      <div>
        <p style={{ margin: '0 0 0.25rem', color: 'var(--accent)', fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Ưu tiên {index + 1}
        </p>
        <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 'var(--type-card-title)', lineHeight: 1.35, overflowWrap: 'anywhere' }}>
          {topic.title}
        </h3>
      </div>
      <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
        {headlineCopy}
      </p>
      <EvidenceLine evidence={topic} unitLabel="câu/ý đúng" />
      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.5 }}>
        {topic.wrongUnits} sai · {topic.blankUnits} bỏ trống
      </p>
      <Link
        className="exam-focusable"
        to={`/exams/on-chu-de/${encodeURIComponent(topic.slug)}`}
        aria-label={`Ôn chủ đề ${topic.title}`}
        style={{ ...actionStyle(isPrimary ? 'primary' : 'secondary'), justifySelf: 'start' }}
      >
        Ôn chủ đề này
      </Link>
    </article>
  );
}

function questionStatusLabel(review: NormalizedReviewedQuestion, status: QuestionDiagnosisStatus | null): string {
  if (status === null) return 'Chưa đủ dữ liệu';
  if (status === 'blank') return 'Chưa trả lời';
  if (status === 'wrong') return 'Sai';
  if (status === 'partial') return 'Đúng một phần';
  return review.question.questionType === 'true_false' ? 'Đúng hoàn toàn' : 'Đúng';
}

function QuestionReview({ review, status, originalNumber }: { review: NormalizedReviewedQuestion; status: QuestionDiagnosisStatus | null; originalNumber: number }) {
  const titleId = `review-question-${originalNumber}`;
  const explanation = review.explanation?.trim() ?? '';

  return (
    <article aria-labelledby={titleId} style={{ ...surfaceStyle, display: 'grid', gap: '1rem', minWidth: 0 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.6rem 1rem' }}>
        <h3 id={titleId} style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1rem' }}>Câu {originalNumber}</h3>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.45rem' }}>
          <span style={statusPillStyle(status)}>{questionStatusLabel(review, status)}</span>
        </div>
      </header>

      <p style={{ margin: 0, color: 'var(--text-primary)', lineHeight: 1.65, overflowWrap: 'anywhere' }}>
        {review.question.questionText}
      </p>

      {review.question.questionType === 'mcq' ? (
        <div style={{ display: 'grid', gap: '0.55rem' }}>
          {review.question.options.map((option) => {
            const correct = review.correctAnswer === option.id;
            const selected = review.userAnswer === option.id;
            return (
              <div key={option.id} style={optionStyle(correct, selected)}>
                <strong style={{ flex: '0 0 auto' }}>{option.id}.</strong>
                <span style={{ flex: '1 1 12rem', minWidth: 0, overflowWrap: 'anywhere' }}>{option.text}</span>
                <span style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                  {correct && <em style={answerBadgeStyle('success')}>Đáp án đúng</em>}
                  {selected && <em style={answerBadgeStyle(correct ? 'success' : 'danger')}>Bạn chọn</em>}
                </span>
              </div>
            );
          })}
          {status === 'blank' && <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Bạn chưa chọn đáp án cho câu này.</p>}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '0.55rem' }}>
          {review.question.statements.map((statement) => {
            const selected = answerFromMap(review.userAnswer, statement.id);
            const correct = answerFromMap(review.correctAnswer, statement.id);
            const statementCorrect = selected !== null && selected === correct;
            return (
              <div key={statement.id} style={{ border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '0.85rem', background: 'var(--bg-surface)', minWidth: 0 }}>
                <p style={{ margin: 0, color: 'var(--text-primary)', lineHeight: 1.55, overflowWrap: 'anywhere' }}>
                  <strong>{statement.id}) </strong>{statement.text}
                </p>
                <p style={{ margin: '0.45rem 0 0', color: 'var(--text-muted)', fontSize: '0.84rem', lineHeight: 1.5 }}>
                  Bạn chọn: <strong style={{ color: selected === null ? 'var(--text-muted)' : statementCorrect ? 'var(--success)' : 'var(--danger)' }}>{answerText(selected)}</strong>
                  <span aria-hidden="true"> · </span>
                  Đáp án đúng: <strong style={{ color: 'var(--success)' }}>{answerText(correct)}</strong>
                </p>
              </div>
            );
          })}
        </div>
      )}

      {explanation && (
        <details className="exam-explanation-disclosure">
          <summary className="exam-focusable" style={explanationSummaryStyle}>
            Giải thích đáp án
          </summary>
          <div style={explanationBodyStyle}>
            <ExamExplanationText text={explanation} />
          </div>
        </details>
      )}
    </article>
  );
}

function ReviewFilterToggle({
  filter,
  setFilter,
  needsReviewCount,
  total,
}: {
  filter: ReviewFilter;
  setFilter: (next: ReviewFilter) => void;
  needsReviewCount: number;
  total: number;
}) {
  return (
    <div
      className="exam-review-filter"
      role="group"
      aria-label="Lọc câu hỏi để xem lại"
      style={{ display: 'inline-flex', gap: '0.45rem', flexWrap: 'wrap' }}
    >
      <button
        type="button"
        className="exam-focusable exam-review-filter-button"
        aria-pressed={filter === 'needsReview'}
        onClick={() => setFilter('needsReview')}
        style={filterButtonStyle(filter === 'needsReview')}
      >
        Cần xem lại {needsReviewCount}
      </button>
      <button
        type="button"
        className="exam-focusable exam-review-filter-button"
        aria-pressed={filter === 'all'}
        onClick={() => setFilter('all')}
        style={filterButtonStyle(filter === 'all')}
      >
        Tất cả {total}
      </button>
    </div>
  );
}

export default function ApiResultSnapshotView({ result }: { result: NormalizedExamResult }) {
  const diagnosis = useMemo(() => buildSingleAttemptDiagnosis(result), [result]);
  const submittedAt = formatSubmittedAt(result.submittedAt);
  const hasIssues = diagnosis.overall.wrongUnits + diagnosis.overall.blankUnits > 0;
  const questionRows = useMemo(() => buildQuestionRows(result.questions), [result.questions]);
  const needsReviewCount = useMemo(
    () => questionRows.filter(rowNeedsReview).length,
    [questionRows],
  );
  const hasFilterValue = needsReviewCount > 0 && needsReviewCount < result.questions.length;
  const defaultFilter: ReviewFilter = hasFilterValue ? 'needsReview' : 'all';
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>(defaultFilter);
  const [userHasInteracted, setUserHasInteracted] = useState(false);
  const effectiveFilter: ReviewFilter = userHasInteracted ? reviewFilter : defaultFilter;
  const visibleRows = effectiveFilter === 'needsReview'
    ? questionRows.filter(rowNeedsReview)
    : questionRows;
  const setFilterWithInteraction = (next: ReviewFilter): void => {
    setUserHasInteracted(true);
    setReviewFilter(next);
  };

  return (
    <div style={{ minHeight: 'calc(100dvh - 5rem)', background: 'var(--bg-app)', color: 'var(--text-primary)', padding: 'clamp(1.25rem, 4vw, 3rem) clamp(1rem, 4vw, 2rem)' }}>
      <main style={{ width: 'min(68rem, 100%)', margin: '0 auto', display: 'grid', gap: 'clamp(1.5rem, 4vw, 2.5rem)', minWidth: 0 }}>
        <nav aria-label="Điều hướng kết quả">
          <Link className="exam-focusable" to="/exams/browse" style={textLinkStyle}>← Danh sách đề</Link>
        </nav>

        <header style={{ ...surfaceStyle, display: 'grid', gap: '1.25rem', minWidth: 0 }}>
          <div style={{ maxWidth: '46rem' }}>
            <p style={{ margin: '0 0 0.45rem', color: 'var(--accent)', fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
              Kết quả luyện thi
            </p>
            <h1 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 'var(--type-page-title)', lineHeight: 1.12, overflowWrap: 'anywhere' }}>
              {resultDisplayTitle(result.title)}
            </h1>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 18rem), 1fr))', gap: 'clamp(1rem, 4vw, 2rem)', alignItems: 'end' }}>
            <div>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 700 }}>Điểm bài thi</p>
              <p style={{ margin: '0.3rem 0 0', color: 'var(--accent)', lineHeight: 1, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>
                <span style={{ fontSize: 'clamp(2.75rem, 9vw, 4.75rem)' }}>{formatNumber(result.totalScore)}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '1rem', fontWeight: 700 }}> / 10</span>
              </p>
            </div>
            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 8.5rem), 1fr))', gap: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
              <OverviewMetric label="Số câu hỏi" value={String(result.totalQuestions)} />
              {submittedAt && <OverviewMetric label="Thời điểm nộp" value={submittedAt} />}
            </dl>
          </div>
        </header>

        <section aria-labelledby="result-summary-heading" style={{ ...surfaceStyle, display: 'grid', gap: '1rem', minWidth: 0 }}>
          <h2 id="result-summary-heading" style={sectionHeadingStyle}>Kết quả bài làm</h2>

          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 9rem), 1fr))', gap: '1rem', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: '1.15rem 0' }}>
            <DiagnosisMetric label="Câu/ý đúng" value={String(diagnosis.overall.correctUnits)} tone="success" />
            {!diagnosis.isPerfect && <DiagnosisMetric label="Câu/ý sai" value={String(diagnosis.overall.wrongUnits)} tone={diagnosis.overall.wrongUnits > 0 ? 'danger' : 'default'} />}
            {!diagnosis.isPerfect && <DiagnosisMetric label="Câu/ý bỏ trống" value={String(diagnosis.overall.blankUnits)} />}
            <DiagnosisMetric label="Độ chính xác" value={formatAccuracy(diagnosis.overall.accuracy)} />
          </dl>

          {diagnosis.isPerfect && (
            <div style={{ borderLeft: '3px solid var(--success)', background: 'rgba(47,122,87,0.08)', borderRadius: '0.75rem', padding: '1rem' }}>
              <strong style={{ color: 'var(--success)' }}>Bạn đã hoàn thành tốt bài này.</strong>
            </div>
          )}
        </section>

        {hasIssues && (
          <section aria-labelledby="topic-priority-heading" style={{ display: 'grid', gap: '1rem', minWidth: 0 }}>
            <h2 id="topic-priority-heading" style={sectionHeadingStyle}>Bạn nên ôn gì tiếp theo?</h2>
            {diagnosis.priorityTopics.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 18rem), 1fr))', gap: '1rem', minWidth: 0 }}>
                {diagnosis.priorityTopics.map((topic, index) => <TopicCard key={topic.slug} topic={topic} index={index} />)}
              </div>
            ) : (
              <div style={{ ...subtleSurfaceStyle, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Chưa có dữ liệu chủ đề để gợi ý nội dung ôn tập cho bài này.
              </div>
            )}
          </section>
        )}

        <nav aria-label="Hành động sau bài thi" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem' }}>
          {hasIssues && (
            <Link className="exam-focusable" to={`/exams/on-lai/${encodeURIComponent(result.sessionId)}`} style={actionStyle('secondary')}>
              Ôn lại câu cần cải thiện
            </Link>
          )}
          <Link className="exam-focusable" to="/exams/browse" style={actionStyle(hasIssues ? 'secondary' : 'primary')}>
            Làm đề thi thử khác
          </Link>
          <Link className="exam-focusable" to="/exams/lich-su" style={textLinkStyle}>
            Về lịch sử luyện thi
          </Link>
        </nav>

        <section aria-labelledby="question-review-heading" style={{ display: 'grid', gap: '1rem', minWidth: 0 }}>
          <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem 1rem' }}>
            <h2 id="question-review-heading" style={sectionHeadingStyle}>Xem lại bài làm</h2>
            {hasFilterValue ? (
              <ReviewFilterToggle
                filter={effectiveFilter}
                setFilter={setFilterWithInteraction}
                needsReviewCount={needsReviewCount}
                total={result.questions.length}
              />
            ) : (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{result.questions.length} câu</span>
            )}
          </header>
          {visibleRows.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Trong bài này không có câu/ý nào sai hoặc bỏ trống cần xem lại.
            </p>
          ) : (
            visibleRows.map((row) => (
              <QuestionReview
                key={`${row.review.questionInstanceId}-${row.index}`}
                review={row.review}
                status={row.diagnosisStatus}
                originalNumber={row.index + 1}
              />
            ))
          )}
        </section>
      </main>
    </div>
  );
}

const surfaceStyle: CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--card-radius)',
  padding: 'clamp(1.15rem, 3vw, 1.75rem)',
  boxShadow: 'var(--admin-shadow)',
};

const subtleSurfaceStyle: CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--card-radius)',
  padding: '1.15rem',
};

const sectionHeadingStyle: CSSProperties = {
  margin: 0,
  color: 'var(--text-primary)',
  fontSize: 'var(--type-section-title)',
  lineHeight: 1.2,
};

const textLinkStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  textDecorationColor: 'var(--border-strong)',
  textUnderlineOffset: '0.22em',
  fontWeight: 700,
};

function actionStyle(tone: 'primary' | 'secondary'): CSSProperties {
  return {
    minHeight: '2.75rem',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.65rem 1rem',
    borderRadius: 'var(--control-radius)',
    textDecoration: 'none',
    fontWeight: 800,
    lineHeight: 1.25,
    background: tone === 'primary' ? 'var(--accent)' : 'var(--bg-surface)',
    color: tone === 'primary' ? '#fff' : 'var(--text-primary)',
    border: tone === 'primary' ? '1px solid var(--accent)' : '1px solid var(--border)',
  };
}

function filterButtonStyle(pressed: boolean): CSSProperties {
  return {
    minHeight: '2.5rem',
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0.55rem 0.95rem',
    borderRadius: '999px',
    fontWeight: 800,
    fontSize: '0.85rem',
    background: pressed ? 'var(--accent)' : 'var(--bg-surface)',
    color: pressed ? '#fff' : 'var(--text-primary)',
    border: pressed ? '1px solid var(--accent)' : '1px solid var(--border)',
    cursor: 'pointer',
  };
}

function statusPillStyle(status: QuestionDiagnosisStatus | null): CSSProperties {
  const color = status === 'correct'
    ? 'var(--success)'
    : status === 'partial'
      ? 'var(--admin-accent-text)'
      : status === 'wrong'
        ? 'var(--danger)'
        : 'var(--text-muted)';
  return {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: '1.75rem',
    padding: '0.2rem 0.6rem',
    borderRadius: '999px',
    border: `1px solid ${color}`,
    color,
    background: 'var(--bg-surface)',
    fontSize: '0.78rem',
    fontWeight: 800,
  };
}

const explanationSummaryStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.45rem',
  padding: '0.55rem 0.95rem',
  borderRadius: '999px',
  background: 'var(--accent-soft)',
  color: 'var(--text-primary)',
  fontWeight: 800,
  fontSize: '0.85rem',
  cursor: 'pointer',
  listStyle: 'none',
  border: '1px solid var(--border)',
};

const explanationBodyStyle: CSSProperties = {
  marginTop: '0.85rem',
  padding: '0.95rem 1rem',
  background: 'var(--bg-surface)',
  borderRadius: '0.75rem',
  border: '1px solid var(--border)',
  color: 'var(--text-secondary)',
  lineHeight: 1.6,
};

function answerBadgeStyle(tone: 'success' | 'danger'): CSSProperties {
  const color = tone === 'success' ? 'var(--success)' : 'var(--danger)';
  return {
    border: `1px solid ${color}`,
    borderRadius: '999px',
    padding: '0.12rem 0.45rem',
    color,
    fontSize: '0.72rem',
    fontStyle: 'normal',
    fontWeight: 700,
    whiteSpace: 'nowrap',
  };
}

function optionStyle(correct: boolean, selected: boolean): CSSProperties {
  return {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.55rem 0.75rem',
    alignItems: 'center',
    padding: '0.8rem',
    borderRadius: '0.75rem',
    border: `1px solid ${correct ? 'var(--success)' : selected ? 'var(--danger)' : 'var(--border)'}`,
    background: correct ? 'rgba(47,122,87,0.08)' : selected ? 'rgba(159,29,45,0.07)' : 'var(--bg-surface)',
    minWidth: 0,
  };
}
