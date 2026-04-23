import AdminLayout from '../../layouts/AdminLayout';
import AdminStatsCard from '../../components/admin/AdminStatsCard';
import { ADMIN_SUMMARY, MOCK_ACTIVITY_LOG, MOCK_DAILY_ACTIVITY, MOCK_ADMIN_USERS } from '../../data/mockAdminData';

/* ─── CSS-only bar mini-chart ─────────────────────────────────────────────── */
function MiniBarChart() {
  const maxViews = Math.max(...MOCK_DAILY_ACTIVITY.map(d => d.views));
  const maxQ = Math.max(...MOCK_DAILY_ACTIVITY.map(d => d.quizzes));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', height: '7rem', marginBottom: '0.5rem' }}>
        {MOCK_DAILY_ACTIVITY.map(d => (
          <div key={d.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', height: '100%', justifyContent: 'flex-end' }}>
            <div style={{ display: 'flex', gap: '3px', alignItems: 'flex-end', width: '100%', justifyContent: 'center' }}>
              <div
                style={{
                  flex: 1,
                  height: `${(d.views / maxViews) * 100}%`,
                  minHeight: '4px',
                  background: 'var(--accent)',
                  borderRadius: '3px 3px 0 0',
                  maxWidth: '14px',
                  boxShadow: 'var(--shadow)',
                }}
              />
              <div
                style={{
                  flex: 1,
                  height: `${(d.quizzes / maxQ) * 100}%`,
                  minHeight: '4px',
                  background: 'var(--admin-accent)',
                  borderRadius: '3px 3px 0 0',
                  maxWidth: '14px',
                  boxShadow: 'var(--shadow)',
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        {MOCK_DAILY_ACTIVITY.map(d => (
          <div key={d.day} style={{ flex: 1, textAlign: 'center', fontSize: '0.65rem', color: 'var(--text-muted)' }}>{d.day}</div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'var(--accent)', display: 'inline-block' }} />
          Xem sự kiện
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'var(--admin-accent)', display: 'inline-block' }} />
          Trắc nghiệm
        </div>
      </div>
    </div>
  );
}

/* ─── Card ───────────────────────────────────────────────────────────────────── */
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '1rem',
        padding: '1.5rem',
        marginBottom: '1.25rem',
        boxShadow: 'var(--shadow)',
      }}
    >
      <h2 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '1.25rem' }}>{title}</h2>
      {children}
    </div>
  );
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' ' +
    d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

/* ─── New users table ────────────────────────────────────────────────────────── */
const newUsers = [...MOCK_ADMIN_USERS]
  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  .slice(0, 5);

export default function AdminDashboardPage() {
  return (
    <AdminLayout title="Dashboard">
      {/* Page header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--text-primary)', marginBottom: '0.5rem', letterSpacing: '-0.02em' }}>
          📊 Dashboard Quản trị
        </h1>
        <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', margin: 0, opacity: 0.8 }}>
          Tổng quan hệ thống — cập nhật thời gian thực (mock).
        </p>
      </div>

      {/* Stats row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(13rem, 1fr))',
          gap: '1rem',
          marginBottom: '2rem',
        }}
      >
        <AdminStatsCard
          icon="👥" label="Tổng người dùng" value={ADMIN_SUMMARY.totalUsers}
          sub={`${ADMIN_SUMMARY.activeUsers} đang hoạt động`} color="var(--accent)"
          badge={{ text: `+${ADMIN_SUMMARY.newUsersThisWeek} tuần`, color: 'var(--success)' }}
        />
        <AdminStatsCard
          icon="MAP" label="Tổng sự kiện" value={ADMIN_SUMMARY.totalEvents}
          sub={`${ADMIN_SUMMARY.publishedEvents} đã xuất bản`} color="var(--success)"
        />
        <AdminStatsCard
          icon="?" label="Câu hỏi" value={ADMIN_SUMMARY.totalQuestions}
          sub={`${ADMIN_SUMMARY.pendingQuestions} chờ duyệt`} color="var(--warning)"
          badge={ADMIN_SUMMARY.pendingQuestions > 0 ? { text: 'Chờ duyệt', color: 'var(--warning)' } : undefined}
        />
        <AdminStatsCard
          icon="QUIZ" label="Bài làm hôm nay" value={ADMIN_SUMMARY.todayAttempts}
          sub="lượt làm bài" color="var(--admin-accent)"
        />
      </div>

      {/* Charts + Activity */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(20rem, 1fr))',
          gap: '1.25rem',
          marginBottom: '1.5rem',
        }}
      >
        <Card title="📈 Hoạt động 7 ngày qua">
          <MiniBarChart />
        </Card>

        <Card title="🕐 Hoạt động gần đây">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0rem' }}>
            {MOCK_ACTIVITY_LOG.map((a, idx) => (
              <div
                key={a.id}
                style={{
                  display: 'flex',
                  gap: '1rem',
                  alignItems: 'flex-start',
                  padding: '1rem 0',
                  borderBottom: idx === MOCK_ACTIVITY_LOG.length - 1 ? 'none' : '1px solid var(--border)',
                }}
              >
                <div
                  style={{
                    width: '2.25rem',
                    height: '2.25rem',
                    borderRadius: '0.75rem',
                    background: 'var(--bg-app)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.1rem',
                    flexShrink: 0,
                  }}
                >
                  {a.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-primary)', lineHeight: 1.5, margin: 0, marginBottom: '0.25rem' }}>
                    <strong style={{ color: 'var(--accent)' }}>{a.user}</strong> {a.action}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--text-muted)', opacity: 0.5 }} />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>{formatTime(a.time)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* New users table */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '1rem',
          padding: '1.5rem',
          overflow: 'hidden',
          boxShadow: 'var(--shadow)',
        }}
      >
        <h2 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '1.5rem' }}>
          🆕 Người dùng mới nhất
        </h2>
        <div style={{ overflowX: 'auto', margin: '0 -1.5rem', padding: '0 1.5rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', minWidth: '40rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                {['Họ tên', 'Email', 'Lớp', 'Trường', 'Ngày tạo'].map(h => (
                  <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {newUsers.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }}>
                  <td style={{ padding: '1rem', color: 'var(--text-primary)', fontWeight: 700 }}>{u.fullName}</td>
                  <td style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 500 }}>{u.email}</td>
                  <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>{u.grade ? `Lớp ${u.grade}` : '—'}</td>
                  <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>{u.school ?? '—'}</td>
                  <td style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 500 }}>
                    {new Date(u.createdAt).toLocaleDateString('vi-VN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
