/**
 * ExamV2ResultPage – Hiển thị kết quả sau khi nộp bài.
 * Route: /exams/ket-qua/:sessionId
 *
 * Đọc ExamResultV2 từ localStorage (lưu bởi useSessionV2.handleSubmit).
 * Hiển thị: điểm tổng, điểm từng phần, bảng review câu hỏi.
 */
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { readResultFromLS } from '@/lib/exam/useSessionV2';
import { rateScore, scoreToPercent } from '@/lib/exam/scoring';
import type { ExamResultV2, QuestionResult } from '@/types/exam';

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

// ── Score card ────────────────────────────────────────────────────────────────
function ScoreCard({ result }: { result: ExamResultV2 }) {
  const rating = rateScore(result.totalScore);
  const pct = scoreToPercent(result.totalScore);
  const color = RATING_COLOR[rating];
  const durationMin = Math.floor(result.durationSeconds / 60);
  const durationSec = result.durationSeconds % 60;

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        borderRadius: '1.5rem',
        padding: '2rem',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow)',
        textAlign: 'center',
      }}
    >
      <div
        style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.75rem' }}
      >
        Tổng điểm
      </div>
      <div style={{ fontSize: '4.5rem', fontWeight: 800, color, lineHeight: 1, marginBottom: '0.5rem' }}>
        {result.totalScore.toFixed(2)}
      </div>
      <div style={{ fontSize: '1.1rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
        / 10 &nbsp;·&nbsp;{' '}
        <span style={{ fontWeight: 700, color }}>{RATING_LABEL[rating]}</span>
        &nbsp;({pct}%)
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '2rem',
          flexWrap: 'wrap',
          paddingTop: '1rem',
          borderTop: '1px solid var(--border)',
        }}
      >
        <Stat label="MCQ" value={`${result.mcqScore.toFixed(2)} đ`} color="var(--accent)" />
        <Stat label="Đúng/Sai" value={`${result.tfScore.toFixed(2)} đ`} color="var(--admin-accent)" />
        <Stat label="Thời gian" value={`${durationMin}p ${durationSec}s`} color="var(--text-muted)" />
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '1.25rem', fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{label}</div>
    </div>
  );
}

// ── Section breakdown ─────────────────────────────────────────────────────────
function MCQBreakdown({ result }: { result: ExamResultV2 }) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        borderRadius: '1.25rem',
        padding: '1.5rem',
        border: '1px solid var(--border)',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--admin-accent)' }}>01</span>
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          Phần I – Trắc nghiệm MCQ
        </h2>
        <span style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
        <span style={{ fontWeight: 700, color: 'var(--accent)', fontSize: '1.1rem' }}>
          {result.mcqScore.toFixed(2)} đ
        </span>
      </header>
      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
        <Stat label="Đúng" value={`${result.correctMCQ}`} color="var(--success)" />
        <Stat label="Sai" value={`${result.wrongMCQ}`} color="var(--danger)" />
        <Stat label="Bỏ trống" value={`${result.blankMCQ}`} color="var(--text-muted)" />
      </div>
    </div>
  );
}

function TFBreakdown({ result }: { result: ExamResultV2 }) {
  const ladderLabels = ['0 ý', '1 ý', '2 ý', '3 ý', '4 ý'];
  const ladderPoints = [0, 0.1, 0.25, 0.5, 1.0];

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        borderRadius: '1.25rem',
        padding: '1.5rem',
        border: '1px solid var(--border)',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--admin-accent)' }}>02</span>
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          Phần II – Đúng / Sai
        </h2>
        <span style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
        <span style={{ fontWeight: 700, color: 'var(--admin-accent)', fontSize: '1.1rem' }}>
          {result.tfScore.toFixed(2)} đ
        </span>
      </header>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        {result.tfBreakdown.map((count, i) => (
          <div
            key={i}
            style={{
              background: count > 0 ? 'var(--accent-soft)' : 'var(--bg-surface)',
              border: `1px solid ${count > 0 ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: '0.75rem',
              padding: '0.6rem 1rem',
              textAlign: 'center',
              minWidth: '4.5rem',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '1.25rem', color: count > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>
              {count}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{ladderLabels[i]}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>→ {ladderPoints[i]}đ</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Question review row ───────────────────────────────────────────────────────
function QuestionRow({ r, idx }: { r: QuestionResult; idx: number }) {
  const isMCQ = r.questionType === 'mcq';

  const statusColor = r.isCorrect
    ? 'var(--success)'
    : r.pointsEarned > 0
    ? 'var(--warning)'
    : 'var(--danger)';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        padding: '0.6rem 1rem',
        borderRadius: '0.625rem',
        background: 'var(--bg-surface)',
        border: `1px solid ${r.isCorrect ? 'rgba(47,122,87,0.2)' : r.pointsEarned > 0 ? 'rgba(194,155,75,0.2)' : 'rgba(159,29,45,0.15)'}`,
        fontSize: '0.825rem',
      }}
    >
      <span style={{ width: '2rem', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)' }}>
        {idx + 1}
      </span>
      <span
        style={{
          padding: '0.15rem 0.5rem',
          borderRadius: '4px',
          fontSize: '0.7rem',
          fontWeight: 600,
          background: isMCQ ? 'var(--accent-soft)' : 'var(--admin-accent-soft)',
          color: isMCQ ? 'var(--accent)' : 'var(--admin-accent)',
        }}
      >
        {isMCQ ? 'MCQ' : 'T/F'}
      </span>

      {isMCQ && r.mcq ? (
        <span style={{ flex: 1, color: 'var(--text-secondary)' }}>
          Bạn chọn: <strong style={{ color: r.isCorrect ? 'var(--success)' : 'var(--danger)' }}>{r.mcq.selected ?? '—'}</strong>
          {' · '}
          Đáp án: <strong style={{ color: 'var(--success)' }}>{r.mcq.correct}</strong>
        </span>
      ) : r.tf ? (
        <span style={{ flex: 1, color: 'var(--text-secondary)' }}>
          <strong>{r.tf.correctCount}</strong>/4 ý đúng
        </span>
      ) : (
        <span style={{ flex: 1 }} />
      )}

      <span style={{ fontWeight: 700, color: statusColor, whiteSpace: 'nowrap' }}>
        {r.pointsEarned > 0 ? `+${r.pointsEarned}đ` : '0đ'}
      </span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ExamV2ResultPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [result, setResult] = useState<ExamResultV2 | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    const r = readResultFromLS(sessionId);
    if (r) setResult(r);
    else setNotFound(true);
  }, [sessionId]);

  if (notFound) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-app)',
        }}
      >
        <div
          style={{
            textAlign: 'center',
            background: 'var(--bg-card)',
            padding: '3rem',
            borderRadius: '1.25rem',
            border: '1px solid var(--border)',
          }}
        >
          <h2 style={{ color: 'var(--danger)', marginBottom: '1rem' }}>
            Không tìm thấy kết quả
          </h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
            Kết quả đã bị xóa hoặc liên kết không hợp lệ.
          </p>
          <Link
            to="/exams/browse"
            style={{
              padding: '0.75rem 1.5rem',
              background: 'var(--accent)',
              color: '#fff',
              borderRadius: '0.75rem',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Xem danh sách đề
          </Link>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-app)',
          color: 'var(--accent)',
        }}
      >
        <div
          style={{
            width: '2rem',
            height: '2rem',
            border: '3px solid var(--accent-soft)',
            borderTopColor: 'var(--accent)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-app)',
        color: 'var(--text-primary)',
        padding: '2rem 1.5rem',
      }}
    >
      <div style={{ maxWidth: '48rem', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

        {/* Back nav */}
        <div style={{ display: 'flex', gap: '1rem' }}>
          <Link
            to="/exams/browse"
            style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.875rem' }}
          >
            ← Danh sách đề
          </Link>
        </div>

        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>Kết quả thi</h1>

        <ScoreCard result={result} />
        <MCQBreakdown result={result} />
        <TFBreakdown result={result} />

        {/* Question review */}
        <div
          style={{
            background: 'var(--bg-card)',
            borderRadius: '1.25rem',
            padding: '1.5rem',
            border: '1px solid var(--border)',
          }}
        >
          <h2
            style={{
              margin: '0 0 1rem',
              fontSize: '1rem',
              fontWeight: 700,
              color: 'var(--text-primary)',
            }}
          >
            Chi tiết từng câu
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {result.questions.map((r, i) => (
              <QuestionRow key={r.questionId} r={r} idx={i} />
            ))}
          </div>
        </div>

        {/* CTA */}
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {result.examId && (
            <Link
              to={`/exams/de/${result.examId}`}
              style={{
                padding: '0.75rem 1.5rem',
                background: 'var(--accent)',
                color: '#fff',
                borderRadius: '0.875rem',
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: '0.9rem',
              }}
            >
              Làm lại đề này
            </Link>
          )}
          <Link
            to="/exams/browse"
            style={{
              padding: '0.75rem 1.5rem',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
              borderRadius: '0.875rem',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '0.9rem',
            }}
          >
            Chọn đề khác
          </Link>
        </div>
      </div>
    </div>
  );
}
