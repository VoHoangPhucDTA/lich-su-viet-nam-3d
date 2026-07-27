import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { EventGrade, EventType } from '../types/event';
import EventCard from '../components/shared/EventCard';
import EmptyState from '../components/shared/EmptyState';
import ErrorState from '../components/shared/ErrorState';
import PublicPageHeader from '../components/public/PublicPageHeader';
import EventExplorerToolbar from '../components/public/EventExplorerToolbar';
import { useInfiniteEvents } from '../hooks/useInfiniteEvents';

const PAGE_SIZE = 24;

function parseYear(value: string): number | undefined {
  if (!value.trim() || !/^-?\d+$/.test(value.trim())) return undefined;
  return Number(value);
}

function parseGrade(value: string | null): EventGrade | null {
  const grade = Number(value);
  return grade === 10 || grade === 11 || grade === 12 ? grade : null;
}

export default function AllEventsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') ?? '');
  const [activeType, setActiveType] = useState<EventType | null>((searchParams.get('type') as EventType) || null);
  const [activeGrade, setActiveGrade] = useState<EventGrade | null>(parseGrade(searchParams.get('grade')));
  const [sortBy, setSortBy] = useState<'year' | 'name'>(searchParams.get('sortBy') === 'name' ? 'name' : 'year');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(searchParams.get('sortDir') === 'desc' ? 'desc' : 'asc');
  const [yearFrom, setYearFrom] = useState(searchParams.get('from') ?? '');
  const [yearTo, setYearTo] = useState(searchParams.get('to') ?? '');
  const [debouncedQuery, setDebouncedQuery] = useState(searchQuery.trim());
  const sentinelRef = useRef<HTMLDivElement>(null);
  const from = parseYear(yearFrom);
  const to = parseYear(yearTo);
  const rangeError = Boolean(
    (yearFrom.trim() && from == null) ||
    (yearTo.trim() && to == null) ||
    (from != null && to != null && from > to)
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(searchQuery.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [searchQuery]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (searchQuery.trim()) next.set('q', searchQuery.trim());
    if (activeType) next.set('type', activeType);
    if (activeGrade) next.set('grade', String(activeGrade));
    if (yearFrom.trim()) next.set('from', yearFrom.trim());
    if (yearTo.trim()) next.set('to', yearTo.trim());
    if (sortBy !== 'year') next.set('sortBy', sortBy);
    if (sortDir !== 'asc') next.set('sortDir', sortDir);
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [activeGrade, activeType, searchParams, searchQuery, setSearchParams, sortBy, sortDir, yearFrom, yearTo]);

  const { events, total, hasMore, isInitialLoading, isLoadingMore, error, loadMore, retry } = useInfiniteEvents({
    q: debouncedQuery || undefined,
    eventType: activeType ?? undefined,
    grade: activeGrade ?? undefined,
    eventLevel: 'atomic',
    sortBy,
    sortDir,
    startYearFrom: from,
    startYearTo: to != null ? to + 1 : undefined,
    limit: PAGE_SIZE,
    enabled: !rangeError,
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

  const sortValue = `${sortBy}-${sortDir}` as 'year-asc' | 'year-desc' | 'name-asc' | 'name-desc';
  const resetFilters = () => {
    setActiveType(null);
    setActiveGrade(null);
    setYearFrom('');
    setYearTo('');
  };

  return (
    <div className="public-shell">
      <main className="public-content space-y-7">
        <PublicPageHeader
          eyebrow="Thư viện sự kiện"
          title="Tất cả sự kiện lịch sử"
          description="Duyệt kho sự kiện lịch sử Việt Nam từ cổ đại đến đương đại bằng tìm kiếm và bộ lọc theo lớp, năm."
          showBack
        />

        <EventExplorerToolbar
          query={searchQuery}
          onQueryChange={setSearchQuery}
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
          activeType={activeType}
          onTypeChange={setActiveType}
          activeGrade={activeGrade}
          onGradeChange={setActiveGrade}
          onReset={resetFilters}
          rangeError={rangeError ? 'Khoảng năm không hợp lệ.' : null}
        />

        {!isInitialLoading && !hasError && !rangeError && (
          <p className="text-xs font-semibold text-[var(--text-muted)]" aria-live="polite">
            {total} sự kiện
          </p>
        )}

        {isInitialLoading && events.length === 0 && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, index) => (
              <div key={index} className="public-card h-72 animate-pulse bg-[var(--bg-surface)]" />
            ))}
          </div>
        )}
        {hasError && events.length === 0 && <ErrorState onRetry={retry} />}
        {!isInitialLoading && !hasError && !rangeError && events.length === 0 && (
          <EmptyState textOnly title="Không tìm thấy sự kiện" description="Hãy thử từ khóa khác hoặc xóa bớt bộ lọc lớp, năm và loại sự kiện." />
        )}
        {events.length > 0 && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {events.map(event => <EventCard key={event.id} event={event} />)}
          </div>
        )}
        <div ref={sentinelRef} className="flex min-h-14 items-center justify-center" aria-live="polite">
          {isLoadingMore && <span className="text-sm font-medium text-[var(--text-muted)]" role="status">Đang tải thêm…</span>}
          {hasError && events.length > 0 && (
            <button type="button" onClick={retry} className="public-secondary-button">Tải lại phần tiếp theo</button>
          )}
        </div>
      </main>
    </div>
  );
}
