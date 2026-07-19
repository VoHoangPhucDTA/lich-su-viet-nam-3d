/**
 * TFQuestionCard – Hiển thị 1 câu T/F dùng V2 types.
 * Hỗ trợ 2 chế độ:
 *  - Session mode: chọn Đúng/Sai cho từng mệnh đề
 *  - Review mode: hiển thị kết quả đúng/sai, disable click
 *
 */
import { useId, type CSSProperties } from 'react';
import type { TFQuestion, QuestionResult } from '@/types/exam';
import type { SafeTFQuestion } from '@/types/examApi';
import { TF_LADDER_SCORES } from '@/lib/exam/examConstants';
import QuestionSourceBlock from './QuestionSourceBlock';
import ExamExplanationText from './ExamExplanationText';

const STMT_IDS = ['a', 'b', 'c', 'd'] as const;
type StmtId = 'a' | 'b' | 'c' | 'd';

interface TFQuestionCardProps {
  question: TFQuestion | SafeTFQuestion;
  index: number;
  total: number;
  selected: Record<StmtId, boolean | null>;
  onSelect: (stmtId: StmtId, value: boolean | null) => void;
  reviewMode?: boolean;
  disabled?: boolean;
  showSource?: boolean;
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
  statementLabel,
}: {
  value: boolean;
  label: string;
  active: boolean;
  color: string;
  disabled: boolean;
  onClick: () => void;
  statementLabel: string;
}) {
  const baseStyle: CSSProperties = {
    padding: '0.3rem 0.7rem',
    minHeight: '44px',
    minWidth: '4.5rem',
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
      className="tf-toggle exam-focusable"
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      aria-label={`Chọn ${value ? 'Đúng' : 'Sai'} cho ${statementLabel}`}
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
  disabled = false,
  result,
  showSource = true,
}: TFQuestionCardProps) {
  const cardId = useId();
  const correctMap = Object.fromEntries(
    question.statements.map((statement) => [statement.id, 'isTrue' in statement ? statement.isTrue : null])
  ) as Record<StmtId, boolean | null>;

  function handleToggle(stmtId: StmtId, value: boolean) {
    if (reviewMode || disabled) return;
    // Nhấn lại cùng nút → xóa chọn (về null)
    const current = selected[stmtId];
    onSelect(stmtId, current === value ? null : value);
  }

  function getRowReviewStyle(stmtId: StmtId): CSSProperties {
    if (!reviewMode) return {};
    const userChoice = result?.tf?.selected[stmtId];
    const correct = correctMap[stmtId];

    if (correct === null || userChoice === null || userChoice === undefined) return { opacity: 0.6 };
    if (userChoice === correct)
      return { background: 'rgba(47,122,87,0.08)', borderRadius: '0.5rem' };
    return { background: 'rgba(159,29,45,0.08)', borderRadius: '0.5rem' };
  }

  const correctCount = result?.tf?.correctCount ?? null;
  const answeredStatementCount = question.statements.filter((statement) => selected[statement.id] != null).length;

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
        {!reviewMode && (
          <span role="status" aria-live="polite" style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 700 }}>
            Đã trả lời {answeredStatementCount}/{question.statements.length} ý
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
      {showSource && 'sourceRefs' in question && <QuestionSourceBlock sourceRefs={question.sourceRefs} />}

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
            ? 'var(--exam-selection)'
            : correctMap[id] !== null && selVal === correctMap[id]
              ? 'var(--exam-success)'
              : 'var(--danger)';

          return (
            <div
              key={id}
              className="tf-statement-row"
              style={{
                gap: '1rem',
                padding: '0.75rem',
                borderBottom: id !== 'd' ? '1px solid var(--border)' : 'none',
                ...reviewStyle,
              }}
            >
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
              <p id={`${cardId}-${id}`}
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
                      color: correctMap[id] ? 'var(--exam-success)' : 'var(--danger)',
                      fontWeight: 600,
                    }}
                  >
                    ({correctMap[id] ? 'Đúng' : 'Sai'})
                  </span>
                )}
              </p>

              {/* Toggle buttons */}
              <div
                className="tf-statement-controls"
                role="group"
                aria-labelledby={`${cardId}-${id}`}
                style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}
              >
                <TFToggle
                  value={true}
                  label="Đúng"
                  active={selVal === true}
                  color={selectedTone}
                  disabled={reviewMode || disabled}
                  onClick={() => handleToggle(id, true)}
                  statementLabel={`ý ${id}`}
                />
                <TFToggle
                  value={false}
                  label="Sai"
                  active={selVal === false}
                  color={selectedTone}
                  disabled={reviewMode || disabled}
                  onClick={() => handleToggle(id, false)}
                  statementLabel={`ý ${id}`}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Explanation (review mode only) */}
      {reviewMode && 'explanation' in question && question.explanation && (
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
          <ExamExplanationText text={question.explanation} />
        </div>
      )}
      <style>{`
        .tf-statement-row {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          align-items: start;
        }
        @media (max-width: 768px) {
          .tf-statement-row {
            grid-template-columns: auto minmax(0, 1fr);
          }
          .tf-statement-controls {
            grid-column: 1 / -1;
            width: 100%;
            margin-top: 0.15rem;
          }
          .tf-statement-controls .tf-toggle {
            flex: 1;
          }
        }
      `}</style>
    </div>
  );
}
