import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { HistoricalPeriod } from '../../data/historicalPeriods';
import { getEventTitleFallback } from '../../data/eventTitleImages';

interface HistoricalPeriodCardProps {
  period: HistoricalPeriod;
  compact?: boolean;
}

function formatPeriodRange(period: HistoricalPeriod) {
  const start = period.startYearInclusive ?? 'TCN';
  const end = period.endYearExclusive == null ? 'nay' : period.endYearExclusive - 1;
  return `${start} – ${end}`;
}

export default function HistoricalPeriodCard({ period, compact = false }: HistoricalPeriodCardProps) {
  return (
    <Link
      to={`/periods?period=${period.id}`}
      className="public-card group block overflow-hidden text-left no-underline transition duration-200 hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow)]"
    >
      <div
        className={`relative overflow-hidden ${compact ? 'aspect-[16/8]' : 'aspect-[16/9]'}`}
        style={!period.thumbnail ? { background: getEventTitleFallback(period.fallbackEventType) } : undefined}
      >
        {period.thumbnail && (
          <img
            src={period.thumbnail}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-stone-950/75 via-stone-950/15 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4">
          <div>
            <span className="ui-label inline-flex rounded-md border border-white/20 bg-stone-950/55 px-2 py-1 text-[10px] font-semibold text-amber-100">
              {formatPeriodRange(period)}
            </span>
            <p className="mt-2 text-lg font-bold text-white">{period.shortLabel}</p>
          </div>
          <ArrowRight size={17} aria-hidden="true" className="mb-1 shrink-0 text-amber-200 transition-transform group-hover:translate-x-1" />
        </div>
      </div>
      <div className={compact ? 'p-4' : 'p-5'}>
        <h3 className="app-heading text-xl font-bold text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent)]">
          {period.label}
        </h3>
        <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--text-muted)]">{period.description}</p>
      </div>
    </Link>
  );
}
