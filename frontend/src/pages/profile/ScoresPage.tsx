import ProfileLayout from '../../layouts/ProfileLayout';
import ScoreTable from '../../components/profile/ScoreTable';
import { WeeklyScoreChart, CategoryChart } from '../../components/profile/ProgressChart';
import { mockScores, mockWeeklyScores, mockCategoryScores } from '../../data/mockLearningStats';

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '1rem',
        padding: '1.25rem',
        marginBottom: '1.25rem',
      }}
    >
      <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1rem' }}>{title}</h2>
      {children}
    </div>
  );
}

function SummaryBadge({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '0.875rem 1.25rem',
        background: `${color}12`,
        border: `1px solid ${color}25`,
        borderRadius: '0.75rem',
        gap: '0.25rem',
        flex: 1,
        minWidth: '7rem',
      }}
    >
      <div style={{ fontSize: '1.4rem', fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center', fontWeight: 600 }}>{label}</div>
    </div>
  );
}

export default function ScoresPage() {
  const avg = (mockScores.reduce((s, r) => s + r.score, 0) / mockScores.length).toFixed(1);
  const totalCorrect = mockScores.reduce((s, r) => s + r.correct, 0);
  const totalQ = mockScores.reduce((s, r) => s + r.total, 0);
  const pct = Math.round((totalCorrect / totalQ) * 100);
  const best = Math.max(...mockScores.map(s => s.score)).toFixed(1);

  return (
    <ProfileLayout>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
          🏆 Điểm số
        </h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
          Tổng hợp kết quả {mockScores.length} bài trắc nghiệm và đề thi đã hoàn thành.
        </p>
      </div>

      {/* Summary row */}
      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          flexWrap: 'wrap',
          marginBottom: '1.25rem',
        }}
      >
        <SummaryBadge label="Điểm trung bình" value={avg} color="#4f6f95" />
        <SummaryBadge label="Tỉ lệ đúng"     value={`${pct}%`} color="#2f7a57" />
        <SummaryBadge label="Điểm cao nhất"  value={best} color="#c29b4b" />
        <SummaryBadge label="Số bài đã làm"  value={mockScores.length} color="#4f6f95" />
      </div>

      {/* Charts */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(15rem, 1fr))',
          gap: '1rem',
          marginBottom: '1.25rem',
        }}
      >
        <Card title="📈 Điểm trung bình theo tuần">
          <WeeklyScoreChart data={mockWeeklyScores} />
        </Card>
        <Card title="🎯 Tỉ lệ đúng theo chủ đề">
          <CategoryChart data={mockCategoryScores} />
        </Card>
      </div>

      {/* Score table container */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '1rem',
          padding: '1.25rem',
        }}
      >
        <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1rem' }}>
          📋 Tất cả bài đã làm
        </h2>
        <ScoreTable scores={mockScores} />
      </div>
    </ProfileLayout>
  );
}
