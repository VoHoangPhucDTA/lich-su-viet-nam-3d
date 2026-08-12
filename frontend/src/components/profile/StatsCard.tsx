import type { ReactNode } from 'react';

interface StatsCardProps {
  icon: ReactNode;
  label: string;
  value: string | number;
  color?: string;
  loading?: boolean;
}

export default function StatsCard({
  icon,
  label,
  value,
  color = 'var(--accent)',
  loading = false,
}: StatsCardProps) {
  return (
    <article
      aria-busy={loading}
      className="flex min-h-[8.25rem] min-w-0 flex-col rounded-2xl border border-stone-200/70 bg-white p-4 shadow-[var(--admin-shadow)] sm:p-5"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <span className="min-w-0 text-[0.8125rem] font-semibold uppercase leading-5 tracking-[var(--tracking-label)] text-stone-600">
          {label}
        </span>
        <span
          aria-hidden="true"
          className="profile-kpi-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{
            background: `color-mix(in srgb, ${color} 8%, transparent)`,
            color,
          }}
        >
          {icon}
        </span>
      </div>

      {loading ? (
        <div aria-hidden="true" className="mt-auto animate-pulse pt-4">
          <div className="h-8 w-20 max-w-full rounded-md bg-stone-200" />
        </div>
      ) : (
        <div className="mt-auto pt-4">
          <div className="tabular-nums text-2xl font-extrabold leading-none tracking-tight text-stone-900 sm:text-3xl">
            {value}
          </div>
        </div>
      )}

      {loading && <span className="sr-only">Đang tải dữ liệu {label.toLocaleLowerCase('vi-VN')}</span>}
    </article>
  );
}
