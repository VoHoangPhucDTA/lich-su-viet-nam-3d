import ProfileLayout from '../../layouts/ProfileLayout';
import { useAuth } from '../../auth/AuthContext';
import StatsCard from '../../components/profile/StatsCard';
import { WeeklyScoreChart, CategoryChart, GradeProgressChart } from '../../components/profile/ProgressChart';
import RecommendationCard from '../../components/profile/RecommendationCard';
import {
  mockStats,
  mockWeeklyScores,
  mockCategoryScores,
  mockProgressByGrade,
  mockRecommendations,
  mockRecentEvents,
} from '../../data/mockLearningStats';
import { Link } from 'react-router-dom';
import { useTheme } from '../../theme/ThemeContext';

/* ─── Section header ─────────────────────────────────────────────────────────── */
function SectionHeader({ title, action }: { title: string; action?: { label: string; to: string } }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '0.875rem',
      }}
    >
      <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{title}</h2>
      {action && (
        <Link
          to={action.to}
          style={{
            fontSize: '0.78rem',
            color: 'var(--accent)',
            textDecoration: 'none',
            fontWeight: 600,
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-primary)')}
          onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.color = 'var(--accent)')}
        >
          {action.label} →
        </Link>
      )}
    </div>
  );
}

/* ─── Card wrapper ───────────────────────────────────────────────────────────── */
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '1rem',
        padding: '1.25rem',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ─── Strength / Weakness chips ─────────────────────────────────────────────── */
const strengths = mockCategoryScores.filter(c => c.correctRate >= 75);
const weaknesses = mockCategoryScores.filter(c => c.correctRate < 70);

export default function ProfileDashboardPage() {
  const { currentUser } = useAuth();
  const { isDark } = useTheme();
  const name = currentUser?.fullName ?? 'Học sinh';
  const firstName = name.split(' ').pop() ?? name;

  return (
    <ProfileLayout>
      {/* ── Welcome card ── */}
      <div
        style={{
          background: isDark 
            ? 'linear-gradient(135deg, rgba(30,58,95,0.18) 0%, rgba(194,155,75,0.14) 100%)'
            : 'linear-gradient(135deg, rgba(30,58,95,0.1) 0%, rgba(194,155,75,0.08) 100%)',
          border: '1px solid var(--accent-light)',
          borderRadius: '1.25rem',
          padding: '1.5rem 1.75rem',
          marginBottom: '1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
            Xin chào, {firstName}! 👋
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: 0 }}>
            Tiếp tục hành trình học lịch sử hôm nay — bạn đang trong top {mockStats.rankPercentile}% học sinh!
          </p>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            background: 'var(--accent-soft)',
            border: '1px solid var(--accent)',
            opacity: 0.8,
            borderRadius: '0.75rem',
          }}
        >
          <span style={{ fontSize: '1.25rem' }}>🔥</span>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--warning)' }}>{mockStats.streakDays}</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>ngày liên tiếp</div>
          </div>
        </div>
      </div>

      {/* ── Stats cards ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(8rem, 1fr))',
          gap: '0.875rem',
          marginBottom: '1.75rem',
        }}
      >
        <StatsCard icon="👁️" label="Sự kiện đã xem"    value={mockStats.eventsViewed}     color="#4f6f95" sub="sự kiện lịch sử" />
        <StatsCard icon="📝" label="Bài trắc nghiệm"   value={mockStats.quizzesCompleted}  color="#2f7a57" sub="đã hoàn thành" />
        <StatsCard icon="⭐" label="Điểm trung bình"   value={mockStats.averageScore}      color="#c29b4b" sub="trên thang 10" />
        <StatsCard icon="🔥" label="Chuỗi học"         value={`${mockStats.streakDays} ngày`} color="#9f1d2d" sub="đang duy trì" />
        <StatsCard icon="⏱️" label="Học tuần này"     value={`${mockStats.weeklyMinutes} phút`} color="#4f6f95" sub={`tổng ${mockStats.totalMinutes} phút`} />
      </div>

      {/* ── Charts row ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))',
          gap: '1rem',
          marginBottom: '1.75rem',
        }}
      >
        <Card>
          <SectionHeader title="📈 Điểm theo tuần" />
          <WeeklyScoreChart data={mockWeeklyScores} />
        </Card>

        <Card>
          <SectionHeader title="🎯 Tỉ lệ đúng theo chủ đề" />
          <CategoryChart data={mockCategoryScores} />
        </Card>

        <Card>
          <SectionHeader title="📚 Tiến độ theo lớp" />
          <GradeProgressChart data={mockProgressByGrade} />
        </Card>
      </div>

      {/* ── Strengths / Weaknesses ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(15rem, 1fr))',
          gap: '1rem',
          marginBottom: '1.75rem',
        }}
      >
        <Card>
          <SectionHeader title="💪 Điểm mạnh" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {strengths.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Chưa có dữ liệu</p>
            ) : strengths.map(c => (
              <div
                key={c.category}
                style={{
                  padding: '0.375rem 0.875rem',
                  borderRadius: '9999px',
                  background: `${c.color}18`,
                  border: `1px solid ${c.color}35`,
                  color: c.color,
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                }}
              >
                {c.icon} {c.label}
                <span style={{ fontWeight: 400, opacity: 0.8 }}>({c.correctRate}%)</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeader title="📉 Cần cải thiện" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {weaknesses.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Tuyệt vời, không có điểm yếu!</p>
            ) : weaknesses.map(c => (
              <div
                key={c.category}
                style={{
                  padding: '0.375rem 0.875rem',
                  borderRadius: '9999px',
                  background: 'rgba(159,29,45,0.12)',
                  border: '1px solid rgba(159,29,45,0.2)',
                  color: '#f87171',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                }}
              >
                {c.icon} {c.label}
                <span style={{ fontWeight: 400, opacity: 0.8 }}>({c.correctRate}%)</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ── Continue learning ── */}
      <Card style={{ marginBottom: '1.75rem' }}>
        <SectionHeader title="▶️ Tiếp tục học" action={{ label: 'Xem lịch sử', to: '/profile/history' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {mockRecentEvents.map(ev => (
            <div
              key={ev.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.875rem',
                padding: '0.75rem 1rem',
                background: 'var(--bg-app)',
                borderRadius: '0.75rem',
                border: '1px solid var(--border)',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.background = 'var(--bg-surface)')}
              onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.background = 'var(--bg-app)')}
            >
              <span style={{ fontSize: '1.25rem' }}>{ev.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ev.title}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                  {ev.topic} · Lớp {ev.grade}
                </div>
              </div>
              {/* Progress bar */}
              <div style={{ width: '6rem', flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Tiến độ</span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--accent)', fontWeight: 700 }}>{ev.progress}%</span>
                </div>
                <div style={{ height: '4px', background: 'var(--border)', borderRadius: '9999px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${ev.progress}%`,
                      background: ev.progress === 100 ? 'var(--success)' : 'linear-gradient(90deg, #4f6f95, #6b8fb6)',
                      borderRadius: '9999px',
                    }}
                  />
                </div>
              </div>
              <button
                style={{
                  padding: '0.35rem 0.75rem',
                  borderRadius: '0.5rem',
                  background: ev.progress === 100 ? 'rgba(47,122,87,0.14)' : 'var(--accent-soft)',
                  color: ev.progress === 100 ? 'var(--success)' : 'var(--accent)',
                  border: `1px solid ${ev.progress === 100 ? 'var(--success)' : 'var(--accent)'}`,
                  opacity: 0.8,
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  flexShrink: 0,
                  fontFamily: 'inherit',
                }}
              >
                {ev.progress === 100 ? 'Ôn lại' : 'Tiếp tục'}
              </button>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Recommendations ── */}
      <div style={{ marginBottom: '1rem' }}>
        <SectionHeader title="💡 Gợi ý ôn tập" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {mockRecommendations.map(r => (
            <RecommendationCard key={r.id} item={r} />
          ))}
        </div>
      </div>
    </ProfileLayout>
  );
}
