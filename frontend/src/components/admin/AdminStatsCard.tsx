import type { ReactNode } from 'react';

interface AdminStatsCardProps {
  icon: ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  badge?: { text: string; color: string };
}

export default function AdminStatsCard({
  icon,
  label,
  value,
  sub,
  color = 'var(--accent)',
  badge,
}: AdminStatsCardProps) {
  return (
    <article
      className="p-5"
      style={{
        borderRadius: 'var(--admin-radius)',
        border: '1px solid var(--border)',
        background: 'var(--bg-card)',
        boxShadow: 'var(--admin-shadow)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className="text-xs font-semibold uppercase tracking-[0.12em]"
            style={{ color: 'var(--text-muted)' }}
          >
            {label}
          </p>
          <p
            className="mt-2 text-4xl font-semibold leading-none"
            style={{ color: 'var(--text-primary)' }}
          >
            {value}
          </p>
        </div>
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border"
          style={{
            color,
            borderColor: `${color}35`,
            background: `${color}10`,
          }}
        >
          {icon}
        </span>
      </div>
      {sub && (
        <p className="mt-4 text-xs leading-5" style={{ color: 'var(--text-muted)' }}>
          {sub}
        </p>
      )}
      {badge && (
        <span
          className="mt-3 inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold"
          style={{
            color: badge.color,
            borderColor: `${badge.color}35`,
            background: `${badge.color}10`,
          }}
        >
          {badge.text}
        </span>
      )}
    </article>
  );
}
