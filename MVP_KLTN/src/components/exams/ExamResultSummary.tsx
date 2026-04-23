import type { ExamResult } from '../../types/exam';

interface ExamResultSummaryProps {
  result: ExamResult;
}

export default function ExamResultSummary({ result }: ExamResultSummaryProps) {
  // Determine badge
  let badgeRank = '';
  let badgeColor = '';
  let badgeBg = '';

  if (result.score10 >= 9) {
    badgeRank = 'Xuất sắc';
    badgeColor = 'var(--success)';
    badgeBg = 'var(--success-soft)';
  } else if (result.score10 >= 7) {
    badgeRank = 'Khá';
    badgeColor = 'var(--accent)';
    badgeBg = 'var(--accent-soft)';
  } else if (result.score10 >= 5) {
    badgeRank = 'Trung bình';
    badgeColor = 'var(--warning)';
    badgeBg = 'var(--warning-soft)';
  } else {
    badgeRank = 'Cần ôn thêm';
    badgeColor = 'var(--danger)';
    badgeBg = 'var(--danger-soft)';
  }

  // Format time (Duration: seconds to mm:ss layout)
  const mins = Math.floor(result.durationSeconds / 60);
  const secs = result.durationSeconds % 60;
  const timeStr = `${mins} phút ${secs} giây`;

  return (
    <div style={{
      background: 'var(--bg-card)',
      borderRadius: '1rem',
      padding: '2rem',
      border: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      gap: '2rem',
      boxShadow: 'var(--shadow)'
    }}>
      {/* Header Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '1.5rem', color: 'var(--text-primary)' }}>{result.config.title}</h1>
          <div style={{ display: 'flex', gap: '1rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            <span>Chế độ: {result.config.mode === 'practice' ? 'Luyện tập' : result.config.mode === 'thpt_mock' ? 'Thi thử THPT' : 'Tùy chỉnh'}</span>
            <span>•</span>
            <span>Ngày làm: {new Date(result.submittedAt).toLocaleDateString('vi-VN')}</span>
            <span>•</span>
            <span>Thời gian: {timeStr}</span>
          </div>
        </div>
        
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 1rem',
          background: badgeBg,
          color: badgeColor,
          borderRadius: '2rem',
          fontWeight: 600,
          border: `1px solid ${badgeColor}`
        }}>
          {badgeRank}
        </div>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
        
        <div style={{ background: 'var(--bg-surface)', padding: '1.5rem', borderRadius: '0.75rem', textAlign: 'center', border: '1px solid var(--border)' }}>
           <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--accent)' }}>{result.score10.toFixed(2)}</div>
           <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.5rem' }}>Điểm / 10</div>
        </div>

        <div style={{ background: 'var(--bg-surface)', padding: '1.5rem', borderRadius: '0.75rem', textAlign: 'center', border: '1px solid var(--border)' }}>
           <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--success)' }}>{result.correctCount}</div>
           <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.5rem' }}>Câu đúng</div>
        </div>

        <div style={{ background: 'var(--bg-surface)', padding: '1.5rem', borderRadius: '0.75rem', textAlign: 'center', border: '1px solid var(--border)' }}>
           <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--danger)' }}>{result.wrongCount}</div>
           <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.5rem' }}>Câu sai</div>
        </div>

        <div style={{ background: 'var(--bg-surface)', padding: '1.5rem', borderRadius: '0.75rem', textAlign: 'center', border: '1px solid var(--border)' }}>
           <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>{result.blankCount}</div>
           <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.5rem' }}>Bỏ trống</div>
        </div>
      </div>
    </div>
  );
}
