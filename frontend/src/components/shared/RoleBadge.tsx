import type { AdminUserRole } from '../../data/mockAdminData';

const config: Record<string, { label: string; color: string; bg: string }> = {
  student: { label: 'Học sinh', color: 'var(--accent)', bg: 'var(--accent-soft)' },
  admin:   { label: 'Admin',    color: 'var(--admin-accent)', bg: 'var(--admin-accent-soft)' },
};

export default function RoleBadge({ role }: { role: AdminUserRole }) {
  const c = config[role] ?? config.student;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 10px',
        borderRadius: '9999px',
        fontSize: '0.7rem',
        fontWeight: 700,
        background: c.bg,
        color: c.color,
        border: '1px solid color-mix(in srgb, ' + c.color + ' 16%, transparent)',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      {c.label}
    </span>
  );
}
