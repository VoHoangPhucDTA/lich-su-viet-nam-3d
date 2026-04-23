// ─── Shared: RoleBadge ───────────────────────────────────────────────────────

import type { AdminUserRole } from '../../data/mockAdminData';

const config: Record<string, { label: string; color: string; bg: string }> = {
  student: { label: 'Học sinh', color: '#818cf8', bg: 'rgba(99,102,241,0.12)' },
  admin:   { label: 'Admin',    color: '#fb923c', bg: 'rgba(249,115,22,0.12)' },
};

export default function RoleBadge({ role }: { role: AdminUserRole }) {
  const c = config[role] ?? config.student;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: '9999px',
        fontSize: '0.72rem',
        fontWeight: 700,
        background: c.bg,
        color: c.color,
        border: `1px solid ${c.color}28`,
        letterSpacing: '0.03em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      {c.label}
    </span>
  );
}
