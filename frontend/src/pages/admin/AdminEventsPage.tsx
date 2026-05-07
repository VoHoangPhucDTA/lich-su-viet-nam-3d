import { useState } from 'react';
import AdminLayout from '../../layouts/AdminLayout';
import AdminTable from '../../components/admin/AdminTable';
import { MOCK_ADMIN_EVENTS, type AdminEvent } from '../../data/mockAdminData';
import { EVENT_TYPE_LABELS, EVENT_TYPE_COLORS } from '../../types/event';

/* ─── Badge helpers ──────────────────────────────────────────────────────────── */
function EventTypeBadge({ type }: { type: AdminEvent['eventType'] }) {
  const color = EVENT_TYPE_COLORS[type];
  const label = EVENT_TYPE_LABELS[type];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 8px',
      borderRadius: '9999px', fontSize: '0.7rem', fontWeight: 700,
      background: `${color}15`, color, border: `1px solid ${color}30`,
      whiteSpace: 'nowrap' as const,
    }}>
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: AdminEvent['status'] }) {
  const c = status === 'published'
    ? { color: 'var(--success)', bg: 'var(--success-soft)', label: 'Xuất bản' }
    : { color: 'var(--warning)', bg: 'var(--warning-soft)', label: 'Nháp' };
  return (
    <span style={{
      padding: '2px 8px', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: 700,
      background: c.bg, color: c.color, border: `1px solid ${c.color}20`, whiteSpace: 'nowrap' as const,
    }}>
      {c.label}
    </span>
  );
}

function DataBadge({ ok }: { ok: boolean }) {
  return (
    <span style={{ fontSize: '0.72rem', color: ok ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
      {ok ? '✅ Đầy đủ' : '⚠️ Thiếu'}
    </span>
  );
}

function FilterBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '0.45rem 1rem', borderRadius: '9999px', fontSize: '0.8rem',
        fontWeight: active ? 800 : 500,
        color: active ? 'var(--admin-accent)' : 'var(--text-muted)',
        background: active ? 'var(--admin-accent-soft)' : 'var(--bg-app)',
        border: active ? '1px solid var(--admin-accent)' : '1px solid var(--border)',
        cursor: 'pointer', transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)', fontFamily: 'inherit', whiteSpace: 'nowrap' as const,
      }}
    >
      {children}
    </button>
  );
}

export default function AdminEventsPage() {
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState<'all' | 10 | 11 | 12>('all');
  const [typeFilter, setTypeFilter] = useState<AdminEvent['eventType'] | 'all'>('all');
  const [locationFilter, setLocationFilter] = useState<'all' | 'vn' | 'abroad'>('all');
  const [dataFilter, setDataFilter] = useState<'all' | 'ok' | 'missing'>('all');

  const filtered = MOCK_ADMIN_EVENTS.filter(e => {
    const q = search.toLowerCase();
    const matchQ = !q || e.title.toLowerCase().includes(q) || e.id.toLowerCase().includes(q);
    const matchGrade = gradeFilter === 'all' || e.grade === gradeFilter;
    const matchType = typeFilter === 'all' || e.eventType === typeFilter;
    const matchLoc = locationFilter === 'all' || (locationFilter === 'vn' ? e.isVietnam : !e.isVietnam);
    const matchData = dataFilter === 'all' || (dataFilter === 'ok' ? e.dataComplete : !e.dataComplete);
    return matchQ && matchGrade && matchType && matchLoc && matchData;
  });

  return (
    <AdminLayout title="Quản lý sự kiện">
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--text-primary)', marginBottom: '0.5rem', letterSpacing: '-0.02em' }}>
          🗺️ Quản lý sự kiện lịch sử
        </h1>
        <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', margin: 0, opacity: 0.8 }}>
          {MOCK_ADMIN_EVENTS.length} sự kiện · {MOCK_ADMIN_EVENTS.filter(e => !e.dataComplete).length} cần bổ sung dữ liệu
        </p>
      </div>

      {/* Filters */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: '1.25rem', padding: '1.5rem', marginBottom: '1.5rem',
        display: 'flex', flexDirection: 'column', gap: '1.25rem',
        boxShadow: 'var(--shadow)',
      }}>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none', transition: 'all 0.2s' }}>🔍</span>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Tìm theo tên hoặc ID sự kiện..."
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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))', gap: '1.5rem' }}>
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
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 800, marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Loại</p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {(['all', 'military', 'political', 'economic', 'cultural'] as const).map(v => (
                <FilterBtn key={v} active={typeFilter === v} onClick={() => setTypeFilter(v)}>
                  {v === 'all' ? 'Tất cả' : EVENT_TYPE_LABELS[v]}
                </FilterBtn>
              ))}
            </div>
          </div>
          <div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 800, marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Địa điểm</p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {[{ v: 'all', l: 'Tất cả' }, { v: 'vn', l: 'Việt Nam' }, { v: 'abroad', l: 'Ngoài VN' }].map(({ v, l }) => (
                <FilterBtn key={v} active={locationFilter === v as typeof locationFilter} onClick={() => setLocationFilter(v as 'all' | 'vn' | 'abroad')}>
                  {l}
                </FilterBtn>
              ))}
            </div>
          </div>
          <div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 800, marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Dữ liệu</p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {[{ v: 'all', l: 'Tất cả' }, { v: 'ok', l: 'Đầy đủ' }, { v: 'missing', l: 'Thiếu dữ liệu' }].map(({ v, l }) => (
                <FilterBtn key={v} active={dataFilter === v as typeof dataFilter} onClick={() => setDataFilter(v as 'all' | 'ok' | 'missing')}>
                  {l}
                </FilterBtn>
              ))}
            </div>
          </div>
        </div>

        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Hiển thị <strong style={{ color: 'var(--text-primary)' }}>{filtered.length}</strong> / {MOCK_ADMIN_EVENTS.length} sự kiện</span>
          <button style={{ color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.75rem' }} onClick={() => { setSearch(''); setGradeFilter('all'); setTypeFilter('all'); setLocationFilter('all'); setDataFilter('all'); }}>Thiết lập lại</button>
        </div>
      </div>

      {/* Table Section */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1.25rem', overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
        <AdminTable
          rows={filtered}
          getKey={e => e.id}
          emptyIcon="🗺️"
          emptyTitle="Không có sự kiện"
          emptyDesc="Thay đổi bộ lọc để tìm sự kiện khác."
          columns={[
            {
              key: 'title', header: 'Sự kiện', render: e => (
                <div>
                  <div style={{ fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.2rem', fontSize: '0.875rem' }}>{e.title}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace', opacity: 0.8 }}>{e.id}</div>
                </div>
              ),
            },
            {
              key: 'meta', header: 'Lớp / Năm', render: e => (
                <div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>{e.grade ? `Lớp ${e.grade}` : 'Chung'}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>{e.startYear}{e.endYear ? `–${e.endYear}` : ''}</div>
                </div>
              ),
            },
            { key: 'type', header: 'Loại', render: e => <EventTypeBadge type={e.eventType} /> },
            {
              key: 'geo', header: 'Địa lý', render: e => (
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 600 }}>{e.isVietnam ? '🇻🇳 Việt Nam' : '🌐 Ngoài VN'}</div>
                  <div style={{ fontSize: '0.72rem', color: e.hasMap ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>{e.hasMap ? '📍 Có bản đồ' : '❌ Chưa có bản đồ'}</div>
                </div>
              ),
            },
            { key: 'data', header: 'Dữ liệu', render: e => <DataBadge ok={e.dataComplete} /> },
            { key: 'status', header: 'Trạng thái', render: e => <StatusBadge status={e.status} /> },
            {
              key: 'actions', header: 'Hành động', render: e => (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <a
                    href={`/events/${e.id}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      padding: '0.375rem 0.75rem', borderRadius: '0.5rem', fontSize: '0.72rem', fontWeight: 800,
                      color: 'var(--accent)', background: 'var(--accent-soft)', border: '1px solid var(--accent)',
                      textDecoration: 'none', whiteSpace: 'nowrap' as const, display: 'inline-block',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                  >
                    Chi tiết
                  </a>
                  {e.hasMap && (
                    <a
                      href="/"
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        padding: '0.375rem 0.75rem', borderRadius: '0.5rem', fontSize: '0.72rem', fontWeight: 800,
                        color: 'var(--admin-accent)', background: 'var(--admin-accent-soft)', border: '1px solid var(--admin-accent)',
                        textDecoration: 'none', whiteSpace: 'nowrap' as const, display: 'inline-block',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                    >
                      Bản đồ
                    </a>
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
