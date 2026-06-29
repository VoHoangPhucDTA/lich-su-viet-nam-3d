/**
 * TFQuestionCard – Hiển thị 1 câu T/F dùng V2 types.
 * Hỗ trợ 2 chế độ:
 *  - Session mode: chọn Đúng/Sai cho từng mệnh đề
 *  - Review mode: hiển thị kết quả đúng/sai, disable click
 *
 * Bậc thang điểm THPT 2025:
 *  0 ý đúng → 0đ | 1 ý → 0.1đ | 2 ý → 0.25đ | 3 ý → 0.5đ | 4 ý → 1.0đ
 */
import type { CSSProperties } from 'react';
import type { TFQuestion, QuestionResult } from '@/types/exam';
import { TF_LADDER_SCORES } from '@/lib/exam/examConstants';

const STMT_IDS = ['a', 'b', 'c', 'd'] as const;
type StmtId = 'a' | 'b' | 'c' | 'd';

interface TFQuestionCardProps {
  question: TFQuestion;
  index: number;
  total: number;
  selected: Record<StmtId, boolean | null>;
  onSelect: (stmtId: StmtId, value: boolean | null) => void;
  reviewMode?: boolean;
  /** Cần có khi reviewMode=true. */
  result?: QuestionResult;
}

function TFToggle({
  value,
  label,
  active,
  color,
  disabled,
  onClick,
}: {
  value: boolean;
  label: string;
  active: boolean;
  color: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const baseStyle: CSSProperties = {
    padding: '0.3rem 0.7rem',
    borderRadius: '6px',
    fontSize: '0.8rem',
    fontWeight: 600,
    cursor: disabled ? 'default' : 'pointer',
    border: `1.5px solid ${active ? color : 'var(--border)'}`,
    background: active
      ? `color-mix(in srgb, ${color} 18%, transparent)`
      : 'var(--bg-surface)',
    color: active ? color : 'var(--text-muted)',
    transition: 'all 0.15s',
  };
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${label}: ${value ? 'Đúng' : 'Sai'}`}
      style={baseStyle}
    >
      {label}
    </button>
  );
}

export default function TFQuestionCard({
  question,
  index,
  total,
  selected,
  onSelect,
  reviewMode = false,
  result,
}: TFQuestionCardProps) {
  const correctMap = Object.fromEntries(
    question.statements.map((s) => [s.id, s.isTrue])
  ) as Record<StmtId, boolean>;

  function handleToggle(stmtId: StmtId, value: boolean) {
    if (reviewMode) return;
    // Nhấn lại cùng nút → xóa chọn (về null)
    const current = selected[stmtId];
    onSelect(stmtId, current === value ? null : value);
  }

  function getRowReviewStyle(stmtId: StmtId): CSSProperties {
    if (!reviewMode) return {};
    const userChoice = result?.tf?.selected[stmtId];
    const correct = correctMap[stmtId];

    if (userChoice === null || userChoice === undefined) return { opacity: 0.6 };
    if (userChoice === correct)
      return { background: 'rgba(47,122,87,0.08)', borderRadius: '0.5rem' };
    return { background: 'rgba(159,29,45,0.08)', borderRadius: '0.5rem' };
  }

  const correctCount = result?.tf?.correctCount ?? null;

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
          alignItems: 'center',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span
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
          </span>
          <span
            style={{
              padding: '0.2rem 0.7rem',
              background: 'var(--admin-accent-soft)',
              color: 'var(--admin-accent)',
              borderRadius: '6px',
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            Đúng / Sai
          </span>
        </div>
        {reviewMode && correctCount !== null && (
          <span
            style={{
              padding: '0.25rem 0.75rem',
              borderRadius: '9999px',
              fontSize: '0.8rem',
              fontWeight: 700,
              background:
                correctCount === 4
                  ? 'rgba(47,122,87,0.15)'
                  : 'rgba(194,155,75,0.15)',
              color: correctCount === 4 ? 'var(--success)' : 'var(--warning)',
              border: `1px solid ${correctCount === 4 ? 'var(--success)' : 'var(--warning)'}`,
            }}
          >
            {correctCount}/4 ý đúng → {TF_LADDER_SCORES[correctCount as 0 | 1 | 2 | 3 | 4]}đ
          </span>
        )}
      </div>

      {/* Question text */}
      <p
        style={{
          fontSize: '1rem',
          lineHeight: 1.75,
          color: 'var(--text-primary)',
          fontWeight: 500,
          margin: '0 0 1.5rem 0',
        }}
      >
        {question.questionText}
      </p>

      {/* Statements */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
        {STMT_IDS.map((id) => {
          const stmt = question.statements.find((s) => s.id === id);
          if (!stmt) return null;
          const reviewStyle = getRowReviewStyle(id);
          const selVal = reviewMode
            ? result?.tf?.selected[id] ?? null
            : selected[id];
          const selectedTone = !reviewMode
            ? 'var(--accent)'
            : selVal === correctMap[id]
              ? 'var(--success)'
              : 'var(--danger)';

          return (
            <div
              key={id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '1rem',
                padding: '0.75rem',
                borderBottom: id !== 'd' ? '1px solid var(--border)' : 'none',
                ...reviewStyle,
              }}
            >
              {/* Label */}
              <div
                style={{
                  width: '1.75rem',
                  height: '1.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '50%',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  flexShrink: 0,
                  marginTop: '2px',
                }}
              >
                {id.toUpperCase()}
              </div>

              {/* Statement text */}
              <p
                style={{
                  flex: 1,
                  margin: 0,
                  fontSize: '0.9rem',
                  lineHeight: 1.65,
                  color: 'var(--text-primary)',
                }}
              >
                {stmt.text}
                {reviewMode && (
                  <span
                    style={{
                      marginLeft: '0.5rem',
                      fontSize: '0.75rem',
                      color: correctMap[id] ? 'var(--success)' : 'var(--danger)',
                      fontWeight: 600,
                    }}
                  >
                    ({correctMap[id] ? 'Đúng' : 'Sai'})
                  </span>
                )}
              </p>

              {/* Toggle buttons */}
              <div
                style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}
              >
                <TFToggle
                  value={true}
                  label="Đúng"
                  active={selVal === true}
                  color={selectedTone}
                  disabled={reviewMode}
                  onClick={() => handleToggle(id, true)}
                />
                <TFToggle
                  value={false}
                  label="Sai"
                  active={selVal === false}
                  color={selectedTone}
                  disabled={reviewMode}
                  onClick={() => handleToggle(id, false)}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Scoring hint (session mode only) */}
      {!reviewMode && (
        <div
          style={{
            marginTop: '1.25rem',
            padding: '0.6rem 1rem',
            background: 'var(--bg-surface)',
            borderRadius: '0.5rem',
            fontSize: '0.78rem',
            color: 'var(--text-muted)',
          }}
        >
          Bậc thang điểm: 0 ý → 0đ &nbsp;|&nbsp; 1 ý → 0.1đ &nbsp;|&nbsp;
          2 ý → 0.25đ &nbsp;|&nbsp; 3 ý → 0.5đ &nbsp;|&nbsp; 4 ý → 1.0đ
        </div>
      )}

      {/* Explanation (review mode only) */}
      {reviewMode && question.explanation && (
        <div
          style={{
            marginTop: '1.25rem',
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
  );
}
