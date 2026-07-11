/**
 * MCQQuestionCardV2 – Hiển thị 1 câu MCQ dùng V2 types.
 * Hỗ trợ 2 chế độ:
 *  - Session mode (reviewMode=false): chọn đáp án
 *  - Review mode (reviewMode=true): hiển thị đúng/sai, disable click
 */
import type { CSSProperties } from 'react';
import type { MCQQuestion, QuestionResult } from '@/types/exam';
import ExamOptionCard from './ExamOptionCard';

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: 'Dễ',
  medium: 'Trung bình',
  hard: 'Khó',
};

const COGNITIVE_LABEL: Record<string, string> = {
  knowledge: 'Nhận biết',
  comprehension: 'Thông hiểu',
  application: 'Vận dụng',
};

interface MCQQuestionCardV2Props {
  question: MCQQuestion;
  index: number;
  total: number;
  selectedOptionId: 'A' | 'B' | 'C' | 'D' | null;
  onSelectOption: (id: 'A' | 'B' | 'C' | 'D') => void;
  reviewMode?: boolean;
  showLearningMetadata?: boolean;
  /** Cần có khi reviewMode=true để tô màu đúng/sai. */
  result?: QuestionResult;
}

export default function MCQQuestionCardV2({
  question,
  index,
  total,
  selectedOptionId,
  onSelectOption,
  reviewMode = false,
  showLearningMetadata = true,
  result,
}: MCQQuestionCardV2Props) {
  const correctId = question.correctOptionId;

  function getReviewStyle(optId: 'A' | 'B' | 'C' | 'D'): CSSProperties {
    if (!reviewMode) return {};
    const isCorrect = optId === correctId;
    const isSelected = optId === result?.mcq?.selected;

    if (isCorrect) {
      return {
        background: 'rgba(47,122,87,0.15)',
        border: '2px solid var(--success)',
        color: 'var(--success)',
      };
    }
    if (isSelected && !isCorrect) {
      return {
        background: 'rgba(159,29,45,0.12)',
        border: '2px solid var(--danger)',
        color: 'var(--danger)',
      };
    }
    return { opacity: 0.5 };
  }

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        borderRadius: '1.25rem',
        padding: '2rem',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <div
          style={{
            fontSize: '1.1rem',
            fontWeight: 800,
            color: 'var(--text-primary)',
          }}
        >
          Câu {index + 1}
          <span
            style={{
              color: 'var(--text-muted)',
              fontSize: '0.9rem',
              fontWeight: 500,
            }}
          >
            {' '}/ {total}
          </span>
        </div>
        {showLearningMetadata && <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <span
            style={{
              padding: '0.2rem 0.6rem',
              background: 'var(--bg-surface)',
              color: 'var(--text-secondary)',
              borderRadius: '6px',
              fontSize: '0.72rem',
              fontWeight: 600,
              border: '1px solid var(--border)',
            }}
          >
            {DIFFICULTY_LABEL[question.difficulty] ?? question.difficulty}
          </span>
          <span
            style={{
              padding: '0.2rem 0.6rem',
              background: 'var(--accent-soft)',
              color: 'var(--accent)',
              borderRadius: '6px',
              fontSize: '0.72rem',
              fontWeight: 600,
            }}
          >
            {COGNITIVE_LABEL[question.cognitiveLevel] ?? question.cognitiveLevel}
          </span>
        </div>}
      </div>

      {/* Question text */}
      <p
        style={{
          fontSize: '1rem',
          lineHeight: 1.75,
          color: 'var(--text-primary)',
          fontWeight: 500,
          margin: '0 0 1.75rem 0',
        }}
      >
        {question.questionText}
      </p>

      {/* Options */}
      {reviewMode ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {question.options.map((opt) => (
            <div
              key={opt.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '0.875rem 1rem',
                borderRadius: '0.75rem',
                transition: 'all 0.15s',
                ...getReviewStyle(opt.id),
              }}
            >
              <div
                style={{
                  width: '2rem',
                  height: '2rem',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '0.875rem',
                  flexShrink: 0,
                  border: '1px solid currentColor',
                }}
              >
                {opt.id}
              </div>
              <span style={{ flex: 1, lineHeight: 1.5, fontSize: '0.95rem' }}>
                {opt.text}
              </span>
              {opt.id === correctId && (
                <span style={{ fontSize: '1rem' }}>✓</span>
              )}
              {opt.id === result?.mcq?.selected && opt.id !== correctId && (
                <span style={{ fontSize: '1rem' }}>✗</span>
              )}
            </div>
          ))}

          {/* Explanation */}
          {question.explanation && (
            <div
              style={{
                marginTop: '1rem',
                padding: '1rem',
                background: 'var(--accent-soft)',
                borderRadius: '0.75rem',
                borderLeft: '3px solid var(--accent)',
                fontSize: '0.875rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.6,
              }}
            >
              <strong style={{ color: 'var(--accent)' }}>Giải thích:</strong>{' '}
              {question.explanation}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {question.options.map((opt) => (
            <ExamOptionCard
              key={opt.id}
              id={opt.id}
              text={opt.text}
              selected={selectedOptionId === opt.id}
              onClick={() => onSelectOption(opt.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
