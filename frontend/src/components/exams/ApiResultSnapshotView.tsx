import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { formatAuthorityLabel, type NormalizedExamResult } from '@/lib/exam/resultAdapters';

function answerText(value: unknown): string {
  if (value === null || value === undefined) return 'Chưa chọn';
  if (typeof value === 'boolean') return value ? 'Đúng' : 'Sai';
  return String(value);
}

export default function ApiResultSnapshotView({ result }: { result: NormalizedExamResult }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-primary)', padding: '2rem 1.5rem' }}>
      <main style={{ maxWidth: '58rem', margin: '0 auto', display: 'grid', gap: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <Link to="/exams/browse" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>← Danh sách đề</Link>
          <Link to="/exams/lich-su" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Lịch sử làm bài</Link>
        </div>
        <section style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1.5rem', textAlign: 'center' }}>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>{formatAuthorityLabel(result.authority)}</p>
          <h1 style={{ margin: '0.6rem 0', fontSize: '1.55rem' }}>{result.title ?? 'Kết quả luyện thi'}</h1>
          <strong style={{ display: 'block', fontSize: '3rem', color: 'var(--accent)' }}>{result.totalScore.toFixed(2)}</strong>
          <span style={{ color: 'var(--text-muted)' }}>{result.totalQuestions} câu</span>
        </section>
        <section style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Link to={`/exams/on-lai/${result.sessionId}`} style={buttonStyle('primary')}>Ôn lại câu sai</Link>
          <Link to="/exams/on-chu-de" style={buttonStyle('secondary')}>Ôn chủ đề yếu</Link>
          <Link to="/exams/browse" style={buttonStyle('secondary')}>Làm đề thi thử khác</Link>
          <Link to="/exams/lich-su" style={buttonStyle('secondary')}>Về lịch sử luyện thi</Link>
        </section>
        <section style={{ display: 'grid', gap: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Review chi tiết từng câu</h2>
          {result.questions.map((review, index) => (
            <article key={review.questionInstanceId} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1.25rem', display: 'grid', gap: '0.9rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <strong>Câu {index + 1}</strong>
                <span style={pill(review.correctness ? 'success' : 'danger')}>{review.correctness ? 'Trả lời đúng' : 'Trả lời sai'}</span>
                <span style={pill()}>{review.points.toFixed(2)} điểm</span>
              </div>
              <p style={{ margin: 0, lineHeight: 1.6 }}>{review.question.questionText}</p>
              {review.question.questionType === 'mcq' ? (
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  {review.question.options.map((option) => {
                    const correct = review.correctAnswer === option.id;
                    const selected = review.userAnswer === option.id;
                    return <div key={option.id} style={optionStyle(correct, selected)}><strong>{option.id}.</strong><span>{option.text}</span>{correct && <em>Đáp án đúng</em>}{selected && <em>Bạn chọn</em>}</div>;
                  })}
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  {review.question.statements.map((statement) => {
                    const selected = typeof review.userAnswer === 'object' && review.userAnswer ? review.userAnswer[statement.id] : null;
                    const correct = typeof review.correctAnswer === 'object' && review.correctAnswer ? review.correctAnswer[statement.id] : null;
                    return <div key={statement.id} style={{ border: '1px solid var(--border)', borderRadius: '0.7rem', padding: '0.75rem' }}><strong>{statement.id}) </strong>{statement.text}<div style={{ color: 'var(--text-muted)', marginTop: '0.35rem' }}>Bạn chọn: {answerText(selected)} · Đáp án đúng: {answerText(correct)}</div></div>;
                  })}
                </div>
              )}
              {review.explanation && <p style={{ margin: 0, padding: '0.8rem', background: 'var(--accent-soft)', borderRadius: '0.7rem', lineHeight: 1.55 }}><strong>Giải thích: </strong>{review.explanation}</p>}
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}

function buttonStyle(tone: 'primary' | 'secondary'): CSSProperties {
  return {
    padding: '0.7rem 1rem', borderRadius: '0.7rem', textDecoration: 'none', fontWeight: 700,
    background: tone === 'primary' ? 'var(--accent)' : 'var(--bg-surface)',
    color: tone === 'primary' ? '#fff' : 'var(--text-primary)',
    border: tone === 'primary' ? '1px solid var(--accent)' : '1px solid var(--border)',
  };
}

function pill(tone: 'success' | 'danger' | 'default' = 'default'): CSSProperties {
  const color = tone === 'success' ? 'var(--success)' : tone === 'danger' ? 'var(--danger)' : 'var(--text-muted)';
  return { padding: '0.2rem 0.5rem', borderRadius: '999px', border: `1px solid ${color}`, color, fontSize: '0.78rem' };
}

function optionStyle(correct: boolean, selected: boolean): CSSProperties {
  return {
    display: 'flex', gap: '0.7rem', alignItems: 'center', padding: '0.75rem', borderRadius: '0.7rem',
    border: `1px solid ${correct ? 'var(--success)' : selected ? 'var(--danger)' : 'var(--border)'}`,
    background: correct ? 'rgba(47,122,87,0.08)' : selected ? 'rgba(159,29,45,0.07)' : 'var(--bg-surface)',
  };
}
