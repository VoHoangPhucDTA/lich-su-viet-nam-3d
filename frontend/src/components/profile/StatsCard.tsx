import { type ReactNode } from 'react';

interface StatsCardProps {
  icon: ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}

/**
 * Displays a labeled value with an icon, accent color, and optional supporting text.
 *
 * @param icon - The icon displayed alongside the label
 * @param label - The label displayed above the value
 * @param value - The primary value displayed by the card
 * @param sub - Optional supporting text displayed below the value
 * @param color - The accent color applied to the card
 */
export default function StatsCard({
  icon,
  label,
  value,
  sub,
  color = 'var(--accent)',
}: StatsCardProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white border border-stone-200/60 p-4">
      <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-2xl opacity-60"
        style={{ background: `linear-gradient(to right, ${color}, transparent)` }} />
      <div className="flex items-center gap-2.5 mb-2.5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `color-mix(in srgb, ${color} 6%, transparent)`, color }}>
          {icon}
        </div>
        <span className="text-[9px] font-sans font-bold uppercase tracking-wider text-stone-400">{label}</span>
      </div>
      <div className="font-sans text-xl sm:text-2xl font-black leading-none tracking-tight mb-1" style={{ color }}>
        {value}
      </div>
      {sub && <span className="text-xs text-stone-400">{sub}</span>}
    </div>
  );
}
