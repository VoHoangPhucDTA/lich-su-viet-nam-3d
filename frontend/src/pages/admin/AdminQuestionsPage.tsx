import { useState } from 'react';
import AdminLayout from '../../layouts/AdminLayout';
import AdminTable from '../../components/admin/AdminTable';
import { MOCK_ADMIN_QUESTIONS, type AdminQuestion } from '../../data/mockAdminData';
import { EVENT_TYPE_LABELS, EVENT_TYPE_COLORS } from '../../types/event';

/* ─── Difficulty badge ───────────────────────────────────────────────────────── */
const diffCfg = {
  easy:   { label: 'Dễ',         color: 'var(--success)' },
  medium: { label: 'Trung bình', color: 'var(--warning)' },
  hard:   { label: 'Khó',        color: 'var(--danger)' },
};

function DiffBadge({ diff }: { diff: AdminQuestion['difficulty'] }) {
  const c = diffCfg[diff];
  return (
    <span style={{
      padding: '2px 8px', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: 700,
      background: `${c.color.includes('var') ? 'var(--bg-app)' : c.color + '15'}`, 
      color: c.color, 
      border: `1px solid ${c.color.includes('var') ? 'var(--border)' : c.color + '30'}`,
      boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
    }}>
      {c.label}
    </span>
  );
}

/* ─── Status badge ───────────────────────────────────────────────────────────── */
const statusCfg = {
  approved: { label: 'Đã duyệt',  color: 'var(--success)' },
  pending:  { label: 'Chờ duyệt', color: 'var(--warning)' },
  rejected: { label: 'Từ chối',   color: 'var(--danger)' },
};

function QStatusBadge({ status }: { status: AdminQuestion['status'] }) {
  const c = statusCfg[status];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
      padding: '2px 10px', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: 700,
      background: 'var(--bg-app)', color: c.color, border: '1px solid var(--border)',
    }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: c.color, display: 'inline-block', flexShrink: 0 }} />
      {c.label}
    </span>
  );
}

/* ─── Correct rate bar ───────────────────────────────────────────────────────── */
function CorrectBar({ pct }: { pct: number }) {
  const color = pct >= 70 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)';
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontSize: '0.75rem', color, fontWeight: 800 }}>{pct}%</span>
      </div>
      <div style={{ height: '6px', background: 'var(--bg-app)', borderRadius: '9999px', overflow: 'hidden', width: '6rem', border: '1px solid var(--border)' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '9999px', transition: 'width 0.5s ease' }} />
      </div>
    </div>
  );
}

/* ─── Filter btn ─────────────────────────────────────────────────────────────── */
function FilterBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '0.45rem 1rem', borderRadius: '9999px', fontSize: '0.825rem',
      fontWeight: active ? 800 : 500, color: active ? 'var(--admin-accent)' : 'var(--text-muted)',
      background: active ? 'var(--admin-accent-soft)' : 'var(--bg-app)',
      border: active ? '1px solid var(--admin-accent)' : '1px solid var(--border)',
      cursor: 'pointer', transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)', fontFamily: 'inherit', whiteSpace: 'nowrap' as const,
    }}>
      {children}
    </button>
  );
}

/* ─── AI / Review action buttons ─────────────────────────────────────────────── */
function MockActionBtn({ icon, label, color }: { icon: string; label: string; color: string }) {
  const [clicked, setClicked] = useState(false);
  return (
    <button
      onClick={() => { setClicked(true); setTimeout(() => setClicked(false), 1500); }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
        padding: '0.625rem 1.25rem', borderRadius: '0.875rem', fontSize: '0.85rem', fontWeight: 800,
        background: clicked ? `${color}25` : `${color}12`,
        color: clicked ? 'var(--text-primary)' : color,
        border: `1px solid ${color}30`,
        cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'inherit',
        boxShadow: 'var(--shadow)',
      }}
    >
      {clicked ? '✅' : icon} {clicked ? 'Đã gửi (mock)' : label}
    </button>
  );
}

export default function AdminQuestionsPage() {
  const [questions, setQuestions] = useState<AdminQuestion[]>(MOCK_ADMIN_QUESTIONS);
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState<'all' | 10 | 11 | 12>('all');
  const [diffFilter, setDiffFilter] = useState<AdminQuestion['difficulty'] | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<AdminQuestion['status'] | 'all'>('all');
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  function approveQ(id: string) {
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, status: 'approved' as const } : q));
    showToast('Đã duyệt câu hỏi (mock)');
  }

  const filtered = questions.filter(q => {
    const matchQ = !search || q.topic.toLowerCase().includes(search.toLowerCase());
    const matchGrade = gradeFilter === 'all' || q.grade === gradeFilter;
    const matchDiff = diffFilter === 'all' || q.difficulty === diffFilter;
    const matchStatus = statusFilter === 'all' || q.status === statusFilter;
    return matchQ && matchGrade && matchDiff && matchStatus;
  });

  const pendingCount = questions.filter(q => q.status === 'pending').length;

  return (
    <AdminLayout title="Quản lý câu hỏi">
      {toast && (
        <div style={{
          position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 999,
          padding: '1rem 1.5rem', borderRadius: '1rem',
          background: 'var(--success-soft)', border: '1px solid var(--success)',
          color: 'var(--success)', fontSize: '0.875rem', fontWeight: 800,
          backdropFilter: 'blur(16px)', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          animation: 'slideInRight 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}>
          ✅ {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--text-primary)', marginBottom: '0.5rem', letterSpacing: '-0.02em' }}>
            ❓ Quản lý câu hỏi
          </h1>
          <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', margin: 0, opacity: 0.8 }}>
            {questions.length} câu hỏi · {pendingCount} chờ duyệt
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <MockActionBtn icon="🤖" label="AI" color="var(--accent)" />
          <MockActionBtn icon="✅" label={`Duyệt (${pendingCount})`} color="var(--admin-accent)" />
        </div>
      </div>

      {/* Filters */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: '1.25rem', padding: '1.5rem', marginBottom: '1.5rem',
        display: 'flex', flexDirection: 'column', gap: '1.25rem',
        boxShadow: 'var(--shadow)',
      }}>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}>🔍</span>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Tìm theo chủ đề..."
            style={{
              width: '100%', padding: '0.75rem 1rem 0.75rem 2.75rem',
              background: 'var(--bg-app)', border: '1px solid var(--border)',
              borderRadius: '0.75rem', color: 'var(--text-primary)', fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit',
              transition: 'all 0.2s',
            }}
            onFocus={e => e.target.style.borderColor = 'var(--accent)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(13rem, 1fr))', gap: '1.5rem' }}>
          <div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 800, marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Lớp</p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {(['all', 10, 11, 12] as const).map(v => (
                <FilterBtn key={v} active={gradeFilter === v} onClick={() => setGradeFilter(v)}>
                  {v === 'all' ? 'Tất cả' : `Lớp ${v}`}
                </FilterBtn>
              ))}
            </div>
          </div>
          <div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 800, marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Độ khó</p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {(['all', 'easy', 'medium', 'hard'] as const).map(v => (
                <FilterBtn key={v} active={diffFilter === v} onClick={() => setDiffFilter(v)}>
                  {v === 'all' ? 'Tất cả' : diffCfg[v].label}
                </FilterBtn>
              ))}
            </div>
          </div>
          <div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 800, marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Trạng thái</p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {(['all', 'approved', 'pending', 'rejected'] as const).map(v => (
                <FilterBtn key={v} active={statusFilter === v} onClick={() => setStatusFilter(v)}>
                  {v === 'all' ? 'Tất cả' : statusCfg[v].label}
                </FilterBtn>
              ))}
            </div>
          </div>
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Hiển thị <strong style={{ color: 'var(--text-primary)' }}>{filtered.length}</strong> / {questions.length} câu hỏi</span>
          <button style={{ color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: '0.75rem' }} onClick={() => { setSearch(''); setGradeFilter('all'); setDiffFilter('all'); setStatusFilter('all'); }}>Thiết lập lại</button>
        </div>
      </div>

      {/* Table Section */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1.25rem', overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
        <AdminTable
          rows={filtered}
          getKey={q => q.id}
          emptyIcon="❓"
          emptyTitle="Không có câu hỏi"
          columns={[
            {
              key: 'topic', header: 'Chủ đề', render: q => (
                <div>
                  <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '0.9rem', marginBottom: '0.35rem', lineHeight: 1.4 }}>{q.topic}</div>
                  <span style={{
                    fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: '6px',
                    background: `${EVENT_TYPE_COLORS[q.category]}15`,
                    color: EVENT_TYPE_COLORS[q.category],
                    border: `1px solid ${EVENT_TYPE_COLORS[q.category]}30`,
                  }}>
                    {EVENT_TYPE_LABELS[q.category]}
                  </span>
                </div>
              ),
            },
            {
              key: 'meta', header: 'Lớp / Ngày', render: q => (
                <div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)', fontWeight: 600 }}>Lớp {q.grade}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500, marginTop: '0.2rem' }}>
                    {new Date(q.createdAt).toLocaleDateString('vi-VN')}
                  </div>
                </div>
              ),
            },
            { key: 'diff', header: 'Độ khó', render: q => <DiffBadge diff={q.difficulty} /> },
            {
              key: 'stats', header: 'Hiệu suất', render: q => (
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>
                    {q.timesAttempted.toLocaleString()} lượt làm
                  </div>
                  <CorrectBar pct={q.correctRate} />
                </div>
              ),
            },
            { key: 'status', header: 'Trạng thái', render: q => <QStatusBadge status={q.status} /> },
            {
              key: 'actions', header: 'Hành động', render: q => (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => showToast(`Xem preview câu hỏi: ${q.topic} (mock)`)}
                    style={{
                      padding: '0.45rem 0.75rem', borderRadius: '0.625rem', fontSize: '0.72rem', fontWeight: 800,
                      color: 'var(--accent)', background: 'var(--accent-soft)', border: '1px solid var(--accent)',
                      cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' as const, transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                  >
                    👁️ Preview
                  </button>
                  {q.status === 'pending' && (
                    <button
                      onClick={() => approveQ(q.id)}
                      style={{
                        padding: '0.45rem 0.75rem', borderRadius: '0.625rem', fontSize: '0.72rem', fontWeight: 800,
                        color: 'var(--success)', background: 'var(--success-soft)', border: '1px solid var(--success)',
                        cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' as const, transition: 'all 0.2s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                    >
                      ✅ Duyệt
                    </button>
                  )}
                </div>
              ), width: '180px',
            },
          ]}
        />
      </div>
    </AdminLayout>
  );
}
