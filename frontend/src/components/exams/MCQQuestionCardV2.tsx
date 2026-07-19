/**
 * MCQQuestionCardV2 – Hiển thị 1 câu MCQ dùng V2 types.
 * Hỗ trợ 2 chế độ:
 *  - Session mode (reviewMode=false): chọn đáp án
 *  - Review mode (reviewMode=true): hiển thị đúng/sai, disable click
 */
import { useId, useRef, type CSSProperties, type KeyboardEvent } from 'react';
import type { MCQQuestion, QuestionResult } from '@/types/exam';
import type { SafeMCQQuestion } from '@/types/examApi';
import ExamOptionCard from './ExamOptionCard';
import QuestionSourceBlock from './QuestionSourceBlock';

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
  question: MCQQuestion | SafeMCQQuestion;
  index: number;
  total: number;
  selectedOptionId: 'A' | 'B' | 'C' | 'D' | null;
  onSelectOption: (id: 'A' | 'B' | 'C' | 'D') => void;
  reviewMode?: boolean;
  disabled?: boolean;
  showLearningMetadata?: boolean;
  showSource?: boolean;
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
  disabled = false,
  showLearningMetadata = true,
  showSource = true,
  result,
}: MCQQuestionCardV2Props) {
  const correctId = 'correctOptionId' in question ? question.correctOptionId : null;
  const questionId = useId();
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function handleOptionKeyDown(event: KeyboardEvent<HTMLButtonElement>, optionIndex: number) {
    if (reviewMode || disabled) return;
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? question.options.length - 1 :
      (optionIndex + (event.key === 'ArrowDown' ? 1 : -1) + question.options.length) % question.options.length;
    const next = question.options[nextIndex];
    if (next) onSelectOption(next.id);
    optionRefs.current[nextIndex]?.focus();
  }

  function getReviewStyle(optId: 'A' | 'B' | 'C' | 'D'): CSSProperties {
    if (!reviewMode) return {};
    const isCorrect = correctId !== null && optId === correctId;
    const isSelected = optId === result?.mcq?.selected;

    if (isCorrect) {
      return {
        background: 'rgba(47,122,87,0.15)',
        border: '2px solid var(--exam-success)',
        color: 'var(--exam-success)',
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
            {DIFFICULTY_LABEL[question.difficulty ?? ''] ?? question.difficulty ?? 'Chưa phân loại'}
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
            {COGNITIVE_LABEL[question.cognitiveLevel ?? ''] ?? question.cognitiveLevel ?? 'Chưa phân loại'}
          </span>
        </div>}
      </div>

      {/* Question text */}
      <p id={questionId}
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
      {showSource && 'sourceRefs' in question && <QuestionSourceBlock sourceRefs={question.sourceRefs} />}

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
              {correctId !== null && opt.id === correctId && (
                <span style={{ fontSize: '1rem' }}>✓</span>
              )}
              {opt.id === result?.mcq?.selected && opt.id !== correctId && (
                <span style={{ fontSize: '1rem' }}>✗</span>
              )}
            </div>
          ))}

          {/* Explanation */}
          {'explanation' in question && question.explanation && (
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
              <span style={{ whiteSpace: 'pre-wrap' }}>{question.explanation}</span>
            </div>
          )}
        </div>
      ) : (
        <div role="radiogroup" aria-orientation="vertical" aria-labelledby={questionId} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {question.options.map((opt) => (
            <ExamOptionCard
              key={opt.id}
              id={opt.id}
              text={opt.text}
              selected={selectedOptionId === opt.id}
              onClick={() => onSelectOption(opt.id)}
              disabled={disabled}
              buttonRef={(node) => { optionRefs.current[question.options.findIndex((item) => item.id === opt.id)] = node; }}
              tabIndex={selectedOptionId === null ? (opt.id === question.options[0]?.id ? 0 : -1) : selectedOptionId === opt.id ? 0 : -1}
              onKeyDown={(event) => handleOptionKeyDown(event, question.options.findIndex((item) => item.id === opt.id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
