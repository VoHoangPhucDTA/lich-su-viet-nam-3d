// ─── UserStatusBadge ─────────────────────────────────────────────────────────

import type { AdminUserStatus } from '../../data/mockAdminData';

const config: Record<AdminUserStatus, { label: string; color: string; bg: string }> = {
  active: { label: 'Hoạt động', color: 'var(--success)', bg: 'var(--success-soft)' },
  locked: { label: 'Đã khóa',   color: 'var(--danger)',  bg: 'var(--danger-soft)' },
};

export default function UserStatusBadge({ status }: { status: AdminUserStatus }) {
  const c = config[status];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '2px 10px',
        borderRadius: '9999px',
        fontSize: '0.72rem',
        fontWeight: 800,
        background: c.bg,
        color: c.color,
        border: `1px solid ${c.color.includes('var') ? 'transparent' : c.color + '20'}`,
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: c.color,
          display: 'inline-block',
          flexShrink: 0,
        }}
      />
      {c.label}
    </span>
  );
}
