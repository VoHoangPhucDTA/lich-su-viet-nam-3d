import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Search,
} from 'lucide-react';
import type { HistoricalEvent } from '../types/event';
import { getBrowseEvents } from '../services/eventApi';
import { getEventTitleFallback } from '../data/eventTitleImages';
import EventCard from '../components/shared/EventCard';
import BackButton from '../components/shared/BackButton';
import { compareChronologyS1, matchesNumericFilter } from '../utils/chronology';

/* ─── Historical period definitions ──────────────────────────────────────── */

interface HistoricalPeriod {
  id: string;
  name: string;
  startYear: number;
  endYear: number;
  description: string;
  label: string;
  eventType: string; // maps to a fallback gradient
}

const HISTORICAL_PERIODS: HistoricalPeriod[] = [
  {
    id: 'ancient',
    name: 'Cổ đại',
    startYear: -700,
    endYear: 938,
    description: 'Buổi đầu dựng nước thời Hùng Vương, An Dương Vương, và hơn một nghìn năm Bắc thuộc với những cuộc khởi nghĩa hào hùng của Hai Bà Trưng, Bà Triệu, Lý Bí, Mai Thúc Loan, Phùng Hưng.',
    label: '~700 TCN – 938',
    eventType: 'cultural',
  },
  {
    id: 'feudal',
    name: 'Phong kiến',
    startYear: 938,
    endYear: 1858,
    description: 'Kỷ nguyên độc lập tự chủ, mở đầu với chiến thắng Bạch Đằng của Ngô Quyền. Trải qua các triều đại Đinh, Tiền Lê, Lý, Trần, Hậu Lê, Tây Sơn và Nguyễn với những chiến công hiển hách chống ngoại xâm.',
    label: '938 – 1858',
    eventType: 'political',
  },
  {
    id: 'colonial',
    name: 'Cận đại',
    startYear: 1858,
    endYear: 1945,
    description: 'Thực dân Pháp xâm lược, phong trào Cần Vương, các cuộc khởi nghĩa của Phan Đình Phùng, Hoàng Hoa Thám, và sự ra đời của các phong trào yêu nước theo khuynh hướng mới.',
    label: '1858 – 1945',
    eventType: 'military',
  },
  {
    id: 'modern',
    name: 'Hiện đại',
    startYear: 1945,
    endYear: 1975,
    description: 'Từ Cách mạng tháng Tám thành công, khai sinh nước Việt Nam Dân chủ Cộng hòa, qua hai cuộc kháng chiến chống Pháp và chống Mỹ, kết thúc bằng đại thắng mùa Xuân 1975 thống nhất đất nước.',
    label: '1945 – 1975',
    eventType: 'military',
  },
  {
    id: 'contemporary',
    name: 'Đương đại',
    startYear: 1975,
    endYear: new Date().getFullYear(),
    description: 'Thời kỳ xây dựng và phát triển đất nước sau thống nhất, công cuộc Đổi mới từ 1986, hội nhập quốc tế, và phát triển kinh tế - xã hội toàn diện.',
    label: '1975 – nay',
    eventType: 'economic',
  },
];

/* ─── Page component ──────────────────────────────────────────────────────── */

export default function HistoricalPeriodsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [activePeriod, setActivePeriod] = useState<HistoricalPeriod | null>(null);
  const [periodEvents, setPeriodEvents] = useState<HistoricalEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  // Auto-expand period from URL query param (e.g. /periods?period=feudal)
  useEffect(() => {
    const periodId = searchParams.get('period');
    if (periodId) {
      const period = HISTORICAL_PERIODS.find((p) => p.id === periodId);
      if (period) {
        handlePeriodClick(period);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePeriodClick = async (period: HistoricalPeriod) => {
    setActivePeriod(period);
    setEventsLoading(true);
    setPeriodEvents([]);

    try {
      // Fetch with maximum limit (1000) to ensure ALL events are available
      // for client-side year-range filtering. The backend orders by start_year
      // ASC, so ancient events come first. With ~250 events total, 1000 is safe.
      const result = await getBrowseEvents({ limit: 1000 });
      const filtered = result.events.filter(
        (ev) => matchesNumericFilter(ev, { fromYear: period.startYear, toYear: period.endYear })
      );
      filtered.sort(compareChronologyS1);
      setPeriodEvents(filtered);
    } catch {
      // Silently handle
    } finally {
      setEventsLoading(false);
    }
  };

  // Context-aware back from individual period: use browser history if available,
  // otherwise fall back to the period list. Uses history.length not location.key
  // because key resets on browser refresh.
  const handleBackToPeriods = () => {
    if (window.history.length <= 1) {
      // Direct URL access — no app history, fall back to list
      setActivePeriod(null);
      setPeriodEvents([]);
    } else {
      navigate(-1);
    }
  };

  return (
    <div className="bg-stone-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-16 space-y-8">

        {/* Header */}
        <div>
          {/* Back navigation — context-aware */}
          {!activePeriod && (
            <BackButton className="mb-5" />
          )}
          <div className="space-y-3">
            <span className="font-mono text-xs text-red-900 tracking-[0.2em] uppercase font-bold">
              {activePeriod ? 'SỰ KIỆN THEO THỜI KỲ' : 'TIẾN TRÌNH LỊCH SỬ'}
            </span>
            <h1 className="font-serif text-3xl lg:text-4xl font-black text-stone-900 leading-tight">
              {activePeriod ? activePeriod.name : 'Thời Kỳ Lịch Sử Trọng Đại'}
            </h1>
            <p className="text-sm text-stone-500 max-w-xl">
              {activePeriod
                ? activePeriod.description
                : 'Khám phá lịch sử Việt Nam qua từng thời kỳ — mỗi thời kỳ là một chương sử hào hùng.'}
            </p>
          </div>
        </div>

        {activePeriod ? (
          /* ─── Period events drill-down ─── */
          <div className="space-y-6">
            <button
              onClick={handleBackToPeriods}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider text-stone-500 hover:text-red-900 hover:bg-red-50 rounded-lg transition-colors"
            >
              <ArrowLeft className="h-3 w-3" />
              Quay lại
            </button>

            {eventsLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="rounded-2xl bg-white border border-stone-200/65 overflow-hidden animate-pulse">
                    <div className="h-36 bg-stone-200" />
                    <div className="p-4 space-y-2">
                      <div className="h-3 bg-stone-100 rounded w-1/4" />
                      <div className="h-4 bg-stone-100 rounded w-3/4" />
                      <div className="h-3 bg-stone-100 rounded w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : periodEvents.length === 0 ? (
              <div className="text-center py-16 space-y-3">
                <Search className="h-8 w-8 mx-auto text-stone-300" strokeWidth={1.5} />
                <p className="font-serif text-sm text-stone-400 italic">
                  Chưa có sự kiện cho thời kỳ này.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {periodEvents.map((ev) => (
                  <EventCard key={ev.id} event={ev} imageHeight="h-36" compact />
                ))}
              </div>
            )}
          </div>
        ) : (
          /* ─── Period cards grid ─── */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {HISTORICAL_PERIODS.map((period) => {
              const gradient = getEventTitleFallback(period.eventType);
              return (
                <div
                  key={period.id}
                  onClick={() => handlePeriodClick(period)}
                  className="group cursor-pointer rounded-2xl bg-white border border-stone-200/60 overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5"
                >
                  {/* Image header — gradient fill */}
                  <div
                    className="h-32 p-4 flex items-center justify-center relative"
                    style={{ background: gradient }}
                  >
                    <span className="font-serif text-4xl font-black text-white/15 select-none">
                      {period.name}
                    </span>
                    <div className="absolute bottom-3 left-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-stone-900/70 backdrop-blur-sm border border-amber-500/20 text-amber-200 font-mono text-[9px] font-bold uppercase tracking-widest">
                        <Clock className="h-3 w-3" strokeWidth={2} />
                        {period.label}
                      </span>
                    </div>
                  </div>

                  {/* Card body */}
                  <div className="p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-serif text-lg font-bold text-stone-900 group-hover:text-red-900 transition-colors">
                        {period.name}
                      </h3>
                      <ArrowRight className="h-4 w-4 text-stone-300 group-hover:text-red-900 transition-all group-hover:translate-x-1" />
                    </div>
                    <p className="text-[12px] text-stone-500 leading-relaxed line-clamp-3">
                      {period.description}
                    </p>
                    <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-red-900 uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <span>Khám phá thời kỳ</span>
                      <ArrowRight className="h-3 w-3" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
