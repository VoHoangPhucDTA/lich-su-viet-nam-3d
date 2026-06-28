import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search,
  SlidersHorizontal,
  ChevronDown,
  X,
  RefreshCw,
} from 'lucide-react';
import type { HistoricalEvent } from '../types/event';
import type { EventType } from '../types/event';
import {
  EVENT_TYPE_LABELS,
  EVENT_TYPE_COLORS,
} from '../types/event';
import { getBrowseEvents, type BrowseEventsParams } from '../services/eventApi';
import EventCard from '../components/shared/EventCard';
import BackButton from '../components/shared/BackButton';

const PAGE_SIZE = 24;

export default function AllEventsPage() {
  const [searchParams] = useSearchParams();

  const [events, setEvents] = useState<HistoricalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Accumulated event count since backend count is response-size, not total
  const [loadedCount, setLoadedCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [activeType, setActiveType] = useState<EventType | null>(
    (searchParams.get('type') as EventType) || null
  );
  const [sortBy, setSortBy] = useState<'year' | 'name'>('year');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [offset, setOffset] = useState(0);
  const [showFilters, setShowFilters] = useState(false);

  // Prevent double fetch on mount
  const initialMount = useRef(true);

  const fetchEvents = useCallback(
    async (reset = false) => {
      setLoading(true);
      setError(false);
      const params: BrowseEventsParams = {
        limit: PAGE_SIZE,
        offset: reset ? 0 : offset,
        sortBy,
        sortDir,
      };
      if (searchQuery.trim()) params.q = searchQuery.trim();
      if (activeType) params.eventType = activeType;

      try {
        const result = await getBrowseEvents(params);
        if (reset) {
          setEvents(result.events);
          setOffset(0);
          setLoadedCount(result.events.length);
          // If first page is already less than full, we've reached the end
          if (result.events.length < PAGE_SIZE) setHasMore(false);
          else setHasMore(result.hasMore);
        } else {
          // Guard: don't append empty pages (edge case when total = exact multiple of PAGE_SIZE)
          if (result.events.length === 0) {
            setHasMore(false);
            return;
          }
          setEvents((prev) => [...prev, ...result.events]);
          setLoadedCount((prev) => prev + result.events.length);
          setHasMore(result.hasMore);
        }
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    [searchQuery, activeType, sortBy, sortDir, offset]
  );

  // Initial load
  useEffect(() => {
    fetchEvents(true);
    initialMount.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch when filters change (skip initial mount)
  useEffect(() => {
    if (initialMount.current) return;
    const timeout = setTimeout(() => fetchEvents(true), 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, activeType, sortBy, sortDir]);

  const handleLoadMore = () => {
    setOffset((prev) => prev + PAGE_SIZE);
  };

  // Load more when offset changes
  useEffect(() => {
    if (offset > 0) fetchEvents(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset]);

  const eventTypes: EventType[] = ['military', 'political', 'economic', 'cultural'];

  return (
    <div className="bg-stone-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-16 space-y-8">

        {/* Header */}
        <div>
          <BackButton className="mb-5" />
          <div className="space-y-3">
            <span className="font-mono text-xs text-red-900 tracking-[0.2em] uppercase font-bold">
              THƯ VIỆN SỬ LIỆU
            </span>
            <h1 className="font-serif text-3xl lg:text-4xl font-black text-stone-900 leading-tight">
              Tất Cả Sự Kiện Lịch Sử
            </h1>
            <p className="text-sm text-stone-500 max-w-lg">
              Duyệt qua toàn bộ bộ sưu tập sự kiện lịch sử Việt Nam từ cổ đại đến hiện đại.
            </p>
          </div>
        </div>

        {/* Search + Filter bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm sự kiện, địa danh..."
              className="w-full pl-10 pr-10 py-3 bg-white border border-stone-200/60 rounded-xl text-sm outline-none focus:ring-1 focus:ring-red-900/20 focus:border-red-900/30 text-stone-900 placeholder-stone-400 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-xs font-mono font-bold uppercase tracking-wider transition-all ${
              showFilters || activeType
                ? 'bg-red-900 text-white border-red-900'
                : 'bg-white text-stone-500 border-stone-200/60 hover:border-red-900/30'
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Lọc
            {activeType && (
              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 text-[9px]">1</span>
            )}
          </button>

          <select
            value={`${sortBy}-${sortDir}`}
            onChange={(e) => {
              const [by, dir] = e.target.value.split('-') as ['year' | 'name', 'asc' | 'desc'];
              setSortBy(by);
              setSortDir(dir);
            }}
            className="px-4 py-3 bg-white border border-stone-200/60 rounded-xl text-xs font-mono font-bold uppercase tracking-wider text-stone-600 outline-none cursor-pointer"
          >
            <option value="year-asc">Năm ↑</option>
            <option value="year-desc">Năm ↓</option>
            <option value="name-asc">Tên A–Z</option>
            <option value="name-desc">Tên Z–A</option>
          </select>
        </div>

        {/* Expanded filters */}
        {showFilters && (
          <div className="flex flex-wrap gap-2 p-4 bg-white rounded-2xl border border-stone-200/60 animate-fade-in">
            <button
              onClick={() => setActiveType(null)}
              className={`px-3.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all border ${
                !activeType
                  ? 'bg-red-900 text-white border-red-900'
                  : 'bg-stone-50 text-stone-500 border-stone-200/60 hover:border-red-900/20'
              }`}
            >
              Tất cả
            </button>
            {eventTypes.map((type) => {
              const isActive = activeType === type;
              const color = EVENT_TYPE_COLORS[type];
              return (
                <button
                  key={type}
                  onClick={() => setActiveType(isActive ? null : type)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all border"
                  style={{
                    background: isActive ? `${color}15` : '#fafaf9',
                    borderColor: isActive ? `${color}40` : '#e7e5e4',
                    color: isActive ? color : '#78716c',
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                  {EVENT_TYPE_LABELS[type]}
                </button>
              );
            })}
          </div>
        )}

        {/* Results count */}
        {!loading && !error && (
          <div className="text-[10px] font-mono uppercase tracking-wider text-stone-400 font-bold">
            {loadedCount}{hasMore ? '+' : ''} sự kiện
            {searchQuery && <> cho &ldquo;{searchQuery}&rdquo;</>}
            {activeType && <> · {EVENT_TYPE_LABELS[activeType]}</>}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && events.length === 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-white border border-stone-200/65 overflow-hidden animate-pulse">
                <div className="h-40 bg-stone-200" />
                <div className="p-5 space-y-3">
                  <div className="h-3 bg-stone-100 rounded w-1/4" />
                  <div className="h-5 bg-stone-100 rounded w-3/4" />
                  <div className="h-4 bg-stone-100 rounded w-full" />
                  <div className="h-4 bg-stone-100 rounded w-2/3" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {error && events.length === 0 && (
          <div className="text-center py-20 space-y-4">
            <RefreshCw className="h-10 w-10 mx-auto text-stone-300" strokeWidth={1.5} />
            <p className="font-serif text-lg text-stone-400 italic">
              Không thể tải dữ liệu. Vui lòng thử lại.
            </p>
            <button
              onClick={() => fetchEvents(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-900 text-white text-xs font-mono font-bold uppercase tracking-wider rounded-xl hover:bg-red-950 transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Thử lại
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && events.length === 0 && (
          <div className="text-center py-20 space-y-4">
            <Search className="h-10 w-10 mx-auto text-stone-300" strokeWidth={1.5} />
            <p className="font-serif text-lg text-stone-400 italic">
              {searchQuery
                ? `Không tìm thấy sự kiện nào cho "${searchQuery}".`
                : 'Chưa có sự kiện nào.'}
            </p>
            {(searchQuery || activeType) && (
              <button
                onClick={() => { setSearchQuery(''); setActiveType(null); }}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider text-red-900 hover:bg-red-50 rounded-lg transition-colors"
              >
                <RefreshCw className="h-3 w-3" />
                Xoá bộ lọc
              </button>
            )}
          </div>
        )}

        {/* Event grid */}
        {events.length > 0 && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {events.map((ev) => (
                <EventCard key={ev.id} event={ev} />
              ))}
            </div>

            {hasMore && (
              <div className="text-center pt-4">
                <button
                  onClick={handleLoadMore}
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-8 py-3.5 bg-white border border-stone-200/60 rounded-xl text-xs font-mono font-bold uppercase tracking-wider text-stone-600 hover:border-red-900/30 hover:text-red-900 transition-all disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      Đang tải...
                    </>
                  ) : (
                    <>
                      Xem thêm
                      <ChevronDown className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
