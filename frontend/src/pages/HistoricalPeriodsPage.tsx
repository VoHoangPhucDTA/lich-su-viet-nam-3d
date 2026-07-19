import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LoaderCircle } from 'lucide-react';
import {
  getHistoricalPeriodById,
  getPeriodQueryRange,
  HISTORICAL_PERIODS,
  intersectHistoricalPeriodRanges,
} from '../data/historicalPeriods';
import EventCard from '../components/shared/EventCard';
import EmptyState from '../components/shared/EmptyState';
import ErrorState from '../components/shared/ErrorState';
import PublicPageHeader from '../components/public/PublicPageHeader';
import HistoricalPeriodCard from '../components/public/HistoricalPeriodCard';
import EventExplorerToolbar from '../components/public/EventExplorerToolbar';
import { useInfiniteEvents } from '../hooks/useInfiniteEvents';
import type { EventType } from '../types/event';

function parseYear(value: string): number | undefined {
  return value.trim() && /^-?\d+$/.test(value.trim()) ? Number(value) : undefined;
}

export default function HistoricalPeriodsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const periodParam = searchParams.get('period');
  const activePeriod = getHistoricalPeriodById(periodParam);
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [debouncedQuery, setDebouncedQuery] = useState(query.trim());
  const [sortBy, setSortBy] = useState<'year' | 'name'>(searchParams.get('sortBy') === 'name' ? 'name' : 'year');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(searchParams.get('sortDir') === 'desc' ? 'desc' : 'asc');
  const [yearFrom, setYearFrom] = useState(searchParams.get('from') ?? '');
  const [yearTo, setYearTo] = useState(searchParams.get('to') ?? '');
  const initialType = searchParams.get('type');
  const [eventType, setEventType] = useState<EventType | null>(
    initialType === 'military' || initialType === 'political' || initialType === 'economic' || initialType === 'cultural'
      ? initialType
      : null,
  );
  const sentinelRef = useRef<HTMLDivElement>(null);
  const baseRange = getPeriodQueryRange(activePeriod?.id);
  const from = parseYear(yearFrom);
  const to = parseYear(yearTo);
  const invalidInput = Boolean(
    (yearFrom.trim() && from == null) ||
    (yearTo.trim() && to == null) ||
    (from != null && to != null && from > to)
  );
  const finalRange = baseRange && !invalidInput
    ? intersectHistoricalPeriodRanges(baseRange, {
        startYearFrom: from,
        startYearTo: to != null ? to + 1 : undefined,
      })
    : null;

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    if (!activePeriod) return;
    const next = new URLSearchParams({ period: activePeriod.id });
    if (query.trim()) next.set('q', query.trim());
    if (yearFrom.trim()) next.set('from', yearFrom.trim());
    if (yearTo.trim()) next.set('to', yearTo.trim());
    if (eventType) next.set('type', eventType);
    if (sortBy !== 'year') next.set('sortBy', sortBy);
    if (sortDir !== 'asc') next.set('sortDir', sortDir);
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [activePeriod, eventType, query, searchParams, setSearchParams, sortBy, sortDir, yearFrom, yearTo]);

  const { events, total, hasMore, isInitialLoading, isLoadingMore, error, loadMore, retry } = useInfiniteEvents({
    q: debouncedQuery || undefined,
    eventLevel: 'atomic',
    eventType: eventType ?? undefined,
    sortBy,
    sortDir,
    ...finalRange,
    limit: 24,
    enabled: Boolean(activePeriod && finalRange),
  });
  const hasError = Boolean(error);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || isLoadingMore) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) loadMore();
    }, { rootMargin: '500px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, loadMore]);

  if (periodParam && !activePeriod) {
    return (
      <div className="public-shell">
        <main className="public-content-narrow">
          <div className="public-card">
            <EmptyState title="Thời kỳ không tồn tại" description="Đường dẫn thời kỳ không hợp lệ hoặc đã được thay đổi." />
            <div className="-mt-10 flex justify-center pb-10">
              <Link to="/periods" className="public-primary-button no-underline">Quay lại các thời kỳ</Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!activePeriod) {
    return (
      <div className="public-shell">
        <main className="public-content space-y-8">
          <PublicPageHeader
            eyebrow="Tiến trình lịch sử"
            title="Thời kỳ lịch sử trọng đại"
            description="Khám phá lịch sử Việt Nam qua năm giai đoạn, được phân loại thống nhất theo năm bắt đầu của sự kiện."
            showBack
          />
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {HISTORICAL_PERIODS.map(period => <HistoricalPeriodCard key={period.id} period={period} />)}
          </div>
        </main>
      </div>
    );
  }

  const sortValue = `${sortBy}-${sortDir}` as 'year-asc' | 'year-desc' | 'name-asc' | 'name-desc';
  const emptyRange = !invalidInput && !finalRange;

  return (
    <div className="public-shell">
      <main className="public-content space-y-7">
        <PublicPageHeader
          eyebrow="Sự kiện theo thời kỳ"
          title={activePeriod.label}
          description={activePeriod.description}
          showBack
          backFallback="/periods"
        />

        <EventExplorerToolbar
          query={query}
          onQueryChange={setQuery}
          sortValue={sortValue}
          onSortChange={value => {
            const [by, direction] = value.split('-') as ['year' | 'name', 'asc' | 'desc'];
            setSortBy(by);
            setSortDir(direction);
          }}
          yearFrom={yearFrom}
          onYearFromChange={setYearFrom}
          yearTo={yearTo}
          onYearToChange={setYearTo}
          activeType={eventType}
          onTypeChange={setEventType}
          onReset={() => {
            setYearFrom('');
            setYearTo('');
            setEventType(null);
          }}
          rangeError={invalidInput ? 'Khoảng năm không hợp lệ.' : null}
          searchPlaceholder={`Tìm trong ${activePeriod.shortLabel.toLowerCase()}...`}
        />

        {!isInitialLoading && !hasError && !invalidInput && finalRange && (
          <p className="text-xs font-semibold text-[var(--text-muted)]" aria-live="polite">
            {total} sự kiện trong {activePeriod.shortLabel}
          </p>
        )}
        {isInitialLoading && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="public-card h-64 animate-pulse bg-[var(--bg-surface)]" />
            ))}
          </div>
        )}
        {hasError && <ErrorState onRetry={retry} />}
        {!isInitialLoading && !hasError && (emptyRange || (!invalidInput && events.length === 0)) && (
          <EmptyState
            title="Chưa có sự kiện phù hợp"
            description={emptyRange ? 'Khoảng năm đã chọn nằm ngoài thời kỳ này.' : 'Hãy thử từ khóa khác hoặc xóa bộ lọc năm.'}
          />
        )}
        {events.length > 0 && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {events.map(event => <EventCard key={event.id} event={event} imageHeight="h-36" compact />)}
          </div>
        )}
        <div ref={sentinelRef} className="flex min-h-14 items-center justify-center">
          {isLoadingMore && <LoaderCircle size={22} aria-hidden="true" className="animate-spin text-[var(--accent)]" />}
          {hasError && events.length > 0 && (
            <button type="button" onClick={retry} className="public-secondary-button">Tải lại phần tiếp theo</button>
          )}
        </div>
      </main>
    </div>
  );
}
