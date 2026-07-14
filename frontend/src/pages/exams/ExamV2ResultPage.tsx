/**
 * Detailed result page for an exam session.
 * Route: /exams/ket-qua/:sessionId
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatCognitiveLevelLabel, formatDifficultyLabel, formatQuestionTypeLabel } from '@/lib/exam/displayLabels';
import { fetchBackendAttemptDetail, resultFromAttemptDetail } from '@/lib/exam/examAttemptSync';
import { formatExamDuration } from '@/lib/exam/durationFormat';
import { formatExamTitle } from '@/lib/exam/examDisplay';
import { loadExam } from '@/lib/exam/examLoader';
import { rateScore, scoreToPercent } from '@/lib/exam/scoring';
import { loadTopicIndex } from '@/lib/exam/topicIndexLoader';
import { findSummaryBySlug, slugifyTopic } from '@/lib/exam/topicGrouping';
import { readResultFromLS } from '@/lib/exam/useSessionV2';
import QuestionSourceBlock from '@/components/exams/QuestionSourceBlock';
import { analyzeWeaknesses, analyzeWeaknessesFromQuestions, type WeaknessAnalysis, type WeaknessBucket } from '@/lib/exam/weaknessAnalysis';
import {
  flattenExamQuestions,
  isMCQQuestion,
  isTFQuestion,
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

const TF_LABEL: Record<'true' | 'false' | 'blank', string> = {
  true: 'Đúng',
  false: 'Sai',
  blank: 'Chưa chọn',
};

function formatPoints(points: number): string {
  return points > 0 ? `+${points.toFixed(2)}đ` : '0đ';
}

function getCompletionCounts(result: ExamResultV2): { complete: number; partial: number; untouched: number } {
  return result.questions.reduce((counts, question) => {
    if (question.questionType === 'mcq') {
      counts[question.mcq?.selected == null ? 'untouched' : 'complete'] += 1;
      return counts;
    }
    const values = question.tf?.selected ? Object.values(question.tf.selected) : [];
    const selectedCount = values.filter((value) => value != null).length;
    if (selectedCount === 0) counts.untouched += 1;
    else if (selectedCount === values.length) counts.complete += 1;
    else counts.partial += 1;
    return counts;
  }, { complete: 0, partial: 0, untouched: 0 });
}

function needsRetry(result: ExamResultV2): boolean {
  return result.questions.some((q) => {
    if (q.questionType === 'mcq') return !q.isCorrect || q.mcq?.selected == null;
    if (!q.tf?.selected) return true;
    return !q.isCorrect || Object.values(q.tf.selected).some((value) => value == null);
  });
}

function Chip({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'success' | 'danger' | 'warning' }) {
  const colors = {
    default: ['var(--bg-surface)', 'var(--border)', 'var(--text-muted)'],
    success: ['rgba(47,122,87,0.1)', 'rgba(47,122,87,0.28)', 'var(--exam-success)'],
    danger: ['rgba(159,29,45,0.08)', 'rgba(159,29,45,0.22)', 'var(--danger)'],
    warning: ['rgba(194,155,75,0.12)', 'rgba(194,155,75,0.28)', 'var(--exam-warning)'],
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
  const completion = getCompletionCounts(result);

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
        {result.isCustom ? 'Điểm quy đổi thang 10' : 'Tổng điểm'}
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
        <Stat label="Trắc nghiệm" value={`${result.mcqScore.toFixed(2)}đ`} color="var(--accent)" />
        <Stat label="Đúng/Sai" value={`${result.tfScore.toFixed(2)}đ`} color="var(--admin-accent)" />
        <Stat label="Thời gian" value={formatExamDuration(result.durationSeconds)} color="var(--text-muted)" />
        <Stat label="Hoàn thành" value={`${completion.complete}/${result.totalQuestions}`} color="var(--exam-success)" />
        <Stat label="Làm dở" value={`${completion.partial}`} color="var(--exam-warning)" />
        <Stat label="Bỏ trống" value={`${completion.untouched}`} color="var(--text-muted)" />
      </div>
    </div>
  );
}

function formatConfigDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return 'Không giới hạn';
  const minutes = Math.round(seconds / 60);
  return `${minutes} phút`;
}

function CustomConfigCard({ result }: { result: ExamResultV2 }) {
  if (!result.isCustom || !result.config) return null;
  const config = result.config;
  const scope = config.scopeTitle || (config.scopeType === 'all' ? 'Tất cả chủ đề và giai đoạn' : 'Chưa phân loại');

  return (
    <section style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1.25rem', display: 'grid', gap: '0.85rem' }}>
      <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900, color: 'var(--text-primary)' }}>Cấu hình đề tùy chọn</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem' }}>
        <Chip>{config.questionCount} câu</Chip>
        <Chip>{formatQuestionTypeLabel(config.questionType)}</Chip>
        <Chip>{formatDifficultyLabel(config.difficulty)}</Chip>
        <Chip>{formatCognitiveLevelLabel(config.cognitiveLevel)}</Chip>
        <Chip>{scope}</Chip>
        <Chip>{formatConfigDuration(config.durationSeconds)}</Chip>
      </div>
    </section>
  );
}

function MCQBreakdown({ result }: { result: ExamResultV2 }) {
  return (
    <section style={{ background: 'var(--bg-card)', borderRadius: '1rem', padding: '1.25rem', border: '1px solid var(--border)' }}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--admin-accent)' }}>01</span>
        <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>Phần I - Trắc nghiệm</h2>
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

function AccuracyBar({ bucket }: { bucket: WeaknessBucket }) {
  const issueCount = bucket.wrong + bucket.blank;
  return (
    <div style={{ display: 'grid', gap: '0.35rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'baseline' }}>
        <strong style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>{bucket.label}</strong>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
          {issueCount}/{bucket.total} cần xem lại · {bucket.accuracy}%
        </span>
      </div>
      <div style={{ height: '0.45rem', borderRadius: '999px', background: 'var(--bg-surface)', overflow: 'hidden', border: '1px solid var(--border)' }}>
        <div style={{ height: '100%', width: `${bucket.accuracy}%`, borderRadius: '999px', background: bucket.accuracy >= 80 ? 'var(--success)' : bucket.accuracy >= 50 ? 'var(--warning)' : 'var(--danger)' }} />
      </div>
    </div>
  );
}

function MiniBreakdown({ title, buckets }: { title: string; buckets: WeaknessBucket[] }) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '0.85rem', padding: '1rem', display: 'grid', gap: '0.75rem' }}>
      <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '0.92rem', fontWeight: 900 }}>{title}</h3>
      {buckets.length > 0 ? (
        buckets.map((bucket) => <AccuracyBar key={bucket.key} bucket={bucket} />)
      ) : (
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Chưa đủ dữ liệu.</p>
      )}
    </div>
  );
}

function WeaknessAnalysisSection({ analysis }: { analysis: WeaknessAnalysis }) {
  const topTopics = analysis.byTopic.slice(0, 3);

  return (
    <section style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1.25rem', display: 'grid', gap: '1rem' }}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: 'var(--text-primary)' }}>Phân tích điểm yếu</h2>
        <span style={{ flex: 1, minWidth: '2rem', height: '1px', background: 'var(--border)' }} />
        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          {analysis.analyzedQuestions}/{analysis.totalQuestions} câu có dữ liệu
        </span>
      </header>

      {analysis.hasWeakness ? (
        <div style={{ display: 'grid', gap: '0.55rem', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '0.85rem', padding: '1rem' }}>
          <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Bạn cần chú ý nhiều nhất ở:{' '}
            <strong style={{ color: 'var(--danger)' }}>{analysis.weakestTopic?.label ?? 'chưa xác định'}</strong>.
          </p>
          <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Dạng câu cần luyện thêm:{' '}
            <strong style={{ color: 'var(--warning)' }}>{analysis.weakestQuestionType?.label ?? 'chưa xác định'}</strong>.
          </p>
          {analysis.missingQuestions > 0 && (
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Có {analysis.missingQuestions} câu trong kết quả không tìm thấy metadata đề, nên không đưa vào phân tích.
            </p>
          )}
        </div>
      ) : (
        <div style={{ background: 'rgba(47,122,87,0.1)', border: '1px solid rgba(47,122,87,0.28)', borderRadius: '0.85rem', padding: '1rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--success)' }}>Bạn làm rất tốt bài này.</strong> Hãy thử làm thêm đề khác để duy trì phong độ.
        </div>
      )}

      <div style={{ display: 'grid', gap: '0.8rem' }}>
        <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1rem', fontWeight: 900 }}>Top chủ đề yếu</h3>
        {topTopics.length > 0 ? (
          topTopics.map((bucket) => (
            <div key={bucket.key} style={{ border: '1px solid var(--border)', borderRadius: '0.85rem', padding: '0.9rem 1rem', background: 'var(--bg-surface)' }}>
              <AccuracyBar bucket={bucket} />
            </div>
          ))
        ) : (
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>Chưa có dữ liệu chủ đề để phân tích.</p>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(15rem, 1fr))', gap: '1rem' }}>
        <MiniBreakdown title="Theo dạng câu" buckets={analysis.byQuestionType} />
        <MiniBreakdown title="Theo mức nhận thức" buckets={analysis.byCognitiveLevel} />
        <MiniBreakdown title="Theo độ khó" buckets={analysis.byDifficulty} />
      </div>

      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1rem', fontWeight: 900 }}>Gợi ý học tiếp</h3>
        <div style={{ display: 'grid', gap: '0.55rem' }}>
          {analysis.suggestions.map((suggestion) => (
            <div key={`${suggestion.title}-${suggestion.detail}`} style={{ border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '0.85rem 0.95rem', background: 'var(--bg-surface)' }}>
              <strong style={{ color: 'var(--text-primary)' }}>{suggestion.title}</strong>
              <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', lineHeight: 1.55, fontSize: '0.88rem' }}>{suggestion.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Metadata({ question }: { question: Question }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.75rem' }}>
      <Chip>{question.topic}</Chip>
      <Chip>{formatDifficultyLabel(question.difficulty)}</Chip>
      <Chip>{formatCognitiveLevelLabel(question.cognitiveLevel)}</Chip>
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
  const statusText = selected == null ? 'Chưa trả lời' : result.isCorrect ? 'Trả lời đúng' : 'Trả lời sai';

  return (
    <article style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1.25rem' }}>
      <header style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
        <div style={{ minWidth: '2.5rem', height: '2.5rem', borderRadius: '0.75rem', background: 'var(--accent-soft)', color: 'var(--accent)', display: 'grid', placeItems: 'center', fontWeight: 900 }}>
          {index + 1}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.65rem' }}>
            <Chip>Trắc nghiệm</Chip>
            <Chip tone={statusTone}>{statusText}</Chip>
            <Chip>{formatPoints(result.pointsEarned)}</Chip>
          </div>
          <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1rem', lineHeight: 1.55 }}>{question.questionText}</h3>
          <QuestionSourceBlock sourceRefs={question.sourceRefs} />
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
  const statusText = isBlank ? 'Chưa trả lời' : selected === correct ? 'Trả lời đúng' : 'Trả lời sai';
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
        <Chip tone={isBlank ? 'warning' : isCorrect ? 'success' : 'danger'}>{statusText}</Chip>
      </div>
    </div>
  );
}

function TFReviewCard({ question, result, index }: { question: TFQuestion; result: QuestionResult; index: number }) {
  const correctCount = result.tf?.correctCount ?? 0;
  const statementCount = question.statements.length || 4;
  const statusTone = correctCount === statementCount ? 'success' : result.pointsEarned > 0 ? 'warning' : 'danger';

  return (
    <article style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1.25rem' }}>
      <header style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
        <div style={{ minWidth: '2.5rem', height: '2.5rem', borderRadius: '0.75rem', background: 'var(--admin-accent-soft)', color: 'var(--admin-accent)', display: 'grid', placeItems: 'center', fontWeight: 900 }}>
          {index + 1}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.65rem' }}>
            <Chip>Đúng/Sai</Chip>
            <Chip tone={statusTone}>{correctCount}/{statementCount} ý đúng</Chip>
            <Chip>{formatPoints(result.pointsEarned)}</Chip>
          </div>
          <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1rem', lineHeight: 1.55 }}>{question.questionText}</h3>
          <QuestionSourceBlock sourceRefs={question.sourceRefs} />
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
          <Link to="/exams/tao-de" style={{ padding: '0.75rem 1.25rem', background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '0.75rem', textDecoration: 'none', fontWeight: 700 }}>
            Tạo đề tùy chọn mới
          </Link>
          <Link to="/exams/lich-su" style={{ padding: '0.75rem 1.25rem', background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '0.75rem', textDecoration: 'none', fontWeight: 700 }}>
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
  const [weakestTopicSlug, setWeakestTopicSlug] = useState<string | null>(null);
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

      let currentResult = readResultFromLS(sessionId);
      if (!currentResult) {
        try {
          const backendDetail = await fetchBackendAttemptDetail(sessionId);
          currentResult = backendDetail ? resultFromAttemptDetail(backendDetail) : null;
        } catch {
          currentResult = null;
        }
      }

      if (!currentResult) {
        if (!alive) return;
        setResult(null);
        setLoading(false);
        setError('Kết quả đã bị xóa hoặc liên kết không hợp lệ.');
        return;
      }

      if (!alive) return;
      setResult(currentResult);

      if (currentResult.isCustom && currentResult.questionSnapshots?.length) {
        setLoading(false);
        return;
      }

      if (!currentResult.examId) {
        setLoading(false);
        setError('Kết quả này được lưu từ phiên bản cũ và thiếu mã đề, nên chưa thể hiển thị review chi tiết.');
        return;
      }

      try {
        const loadedExam = await loadExam(currentResult.examId);
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
    if (result?.isCustom && result.questionSnapshots?.length) {
      return new Map(result.questionSnapshots.map((question) => [question.id, question as Question]));
    }
    if (!exam) return new Map<string, Question>();
    return new Map(flattenExamQuestions(exam).map((question) => [question.id, question]));
  }, [exam, result]);

  const weaknessAnalysis = useMemo(() => {
    if (!result) return null;
    if (result.isCustom && result.questionSnapshots?.length) {
      return analyzeWeaknessesFromQuestions(result, result.questionSnapshots);
    }
    if (!exam) return null;
    return analyzeWeaknesses(result, exam);
  }, [result, exam]);

  useEffect(() => {
    let alive = true;

    async function resolveWeakestTopicSlug() {
      const weakestTopic = weaknessAnalysis?.weakestTopic;
      if (!weakestTopic) {
        setWeakestTopicSlug(null);
        return;
      }

      try {
        const candidateSlug = slugifyTopic(weakestTopic.key);
        if (!candidateSlug) {
          if (alive) setWeakestTopicSlug(null);
          return;
        }
        const topicIndex = await loadTopicIndex();
        const summary = findSummaryBySlug(topicIndex, candidateSlug);
        if (alive) setWeakestTopicSlug(summary?.slug ?? null);
      } catch {
        if (alive) setWeakestTopicSlug(null);
      }
    }

    void resolveWeakestTopicSlug();

    return () => {
      alive = false;
    };
  }, [weaknessAnalysis]);

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
          <Link to="/exams/lich-su" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.875rem' }}>
            Lịch sử làm bài
          </Link>
        </div>

        <div>
          <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 900 }}>Kết quả luyện thi</h1>
          {(exam || result.isCustom) && (
            <p style={{ margin: '0.45rem 0 0', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {result.isCustom ? result.title ?? 'Thi thử tùy chọn' : exam ? formatExamTitle(exam) : ''}
            </p>
          )}
        </div>

        {error && (
          <div style={{ background: 'rgba(194,155,75,0.1)', border: '1px solid rgba(194,155,75,0.35)', borderRadius: '1rem', padding: '1rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--warning)' }}>Lưu ý: </strong>
            {error}
          </div>
        )}

        <ScoreCard result={result} />
        <CustomConfigCard result={result} />
        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(18rem, 1fr))' }}>
          <MCQBreakdown result={result} />
          <TFBreakdown result={result} />
        </div>

        {weaknessAnalysis && <WeaknessAnalysisSection analysis={weaknessAnalysis} />}

        <section style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1.25rem', display: 'grid', gap: '0.9rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900, color: 'var(--text-primary)' }}>Tiếp tục luyện tập</h2>
          {result.isCustom && questionMap.size > 0 && needsRetry(result) ? (
            <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Ôn lại các câu sai hoặc bỏ trống trong bài tùy chọn này để củng cố ngay phần còn thiếu.
            </p>
          ) : result.isCustom ? (
            <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Bạn đã làm rất tốt bài tùy chọn này. Có thể xem review chi tiết bên dưới hoặc tạo một đề tùy chọn khác để luyện tiếp.
            </p>
          ) : needsRetry(result) ? (
            <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Ôn lại các câu sai hoặc bỏ trống trong bài này để củng cố ngay phần còn thiếu.
            </p>
          ) : (
            <p style={{ margin: 0, color: 'var(--success)', lineHeight: 1.6, fontWeight: 700 }}>
              Bạn đã làm đúng toàn bộ câu hỏi trong bài này.
            </p>
          )}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            {questionMap.size > 0 && needsRetry(result) && (
              <Link to={`/exams/on-lai/${result.sessionId}`} style={{ padding: '0.75rem 1.5rem', background: 'var(--accent)', color: '#fff', borderRadius: '0.875rem', textDecoration: 'none', fontWeight: 800, fontSize: '0.9rem' }}>
                Ôn lại câu sai
              </Link>
            )}
            {weakestTopicSlug && (
              <Link to={`/exams/on-chu-de/${weakestTopicSlug}`} style={{ padding: '0.75rem 1.5rem', background: !result.isCustom && needsRetry(result) ? 'var(--bg-surface)' : 'var(--accent)', color: !result.isCustom && needsRetry(result) ? 'var(--text-primary)' : '#fff', border: !result.isCustom && needsRetry(result) ? '1px solid var(--border)' : '1px solid var(--accent)', borderRadius: '0.875rem', textDecoration: 'none', fontWeight: 800, fontSize: '0.9rem' }}>
                Ôn chủ đề yếu
              </Link>
            )}
            <Link to="/exams/browse" style={{ padding: '0.75rem 1.5rem', background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '0.875rem', textDecoration: 'none', fontWeight: 700, fontSize: '0.9rem' }}>
              Làm đề thi thử khác
            </Link>
            {result.isCustom && (
              <Link to="/exams/tao-de" style={{ padding: '0.75rem 1.5rem', background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '0.875rem', textDecoration: 'none', fontWeight: 700, fontSize: '0.9rem' }}>
                Tạo đề tùy chọn mới
              </Link>
            )}
            <Link to="/exams/lich-su" style={{ padding: '0.75rem 1.5rem', background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '0.875rem', textDecoration: 'none', fontWeight: 700, fontSize: '0.9rem' }}>
              Về lịch sử luyện thi
            </Link>
          </div>
        </section>

        <section style={{ display: 'grid', gap: '1rem' }}>
          <header style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: 'var(--text-primary)' }}>Review chi tiết từng câu</h2>
            <span style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{result.questions.length} câu</span>
          </header>

          {questionMap.size > 0 ? (
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
      </div>
    </div>
  );
}
