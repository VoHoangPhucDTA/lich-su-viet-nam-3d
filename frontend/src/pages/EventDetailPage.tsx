import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { MockEventDetail } from '../data/mockEventDetails';
import { getEventDetailBySlug } from '../services/eventDetailService';
import { recordEventView } from '../services/eventApi';
import { useReadingProgress } from '../hooks/useReadingProgress';
import type { SectionInfo } from '../hooks/useReadingProgress';

import EventHero from '../components/event-detail/EventHero';
import EventTTSPlayer from '../components/event-detail/EventTTSPlayer';
import EventTextbookContent from '../components/event-detail/EventTextbookContent';
import EventKeyFacts from '../components/event-detail/EventKeyFacts';
import EventLocationCard from '../components/event-detail/EventLocationCard';
import EventChildrenList from '../components/event-detail/EventChildrenList';
import EventMediaGallery from '../components/event-detail/EventMediaGallery';
import EventSources from '../components/event-detail/EventSources';
import EventDetailSidebar from '../components/event-detail/EventDetailSidebar';
import { ErrorBoundary } from '../components/shared/ErrorBoundary';

export default function EventDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [eventData, setEventData] = useState<MockEventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function loadEvent() {
      if (!slug) return;
      try {
        setLoading(true);
        const data = await getEventDetailBySlug(slug);
        if (data) {
          setEventData(data);
          void recordEventView(data.id, { source: 'detail', progressPercent: 100 });
          setError(false);
          document.body.scrollTo(0, 0);
          document.documentElement.scrollTo(0, 0);
          window.scrollTo(0, 0);
        } else {
          setError(true);
        }
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    loadEvent();
  }, [slug]);

  /* ─── Build TOC links + numbered indices for each section ─── */
  const { navLinks, sectionIndices } = useMemo(() => {
    if (!eventData) {
      return {
        navLinks: [] as { id: string; label: string }[],
        sectionIndices: {
          textbookOverview: '01',
          textbookNarrative: '',
          textbookSignificance: '',
          keyFacts: '',
          location: '',
          children: '',
          media: '',
          sourcesTextbook: '',
          sourcesExternal: '',
        },
      };
    }

    const links: { id: string; label: string }[] = [];
    const indices: Record<string, string> = {};
    let n = 0;
    const next = () => String(++n).padStart(2, '0');

    links.push({ id: 'tong-quan', label: 'Tổng quan' });
    indices.textbookOverview = next();

    if (eventData.textbookContent.detailedNarrative) {
      links.push({ id: 'noi-dung-sgk', label: 'Nội dung SGK' });
      indices.textbookNarrative = next();
    }
    if (eventData.textbookContent.significance) {
      links.push({ id: 'y-nghia', label: 'Ý nghĩa lịch sử' });
      indices.textbookSignificance = next();
    }
    if (eventData.textbookContent.keyFacts?.length) {
      links.push({ id: 'du-kien-chinh', label: 'Dữ kiện chính' });
      indices.keyFacts = next();
    }

    const isVN = !eventData.classification.tags?.includes('lịch sử thế giới');
    const geoType = eventData.mapData?.displayGeometry?.geoType;
    const showLocation = isVN && geoType && geoType !== 'no_location';
    if (showLocation || (isVN && eventData.mapData?.displayGeometry)) {
      links.push({ id: 'dia-diem', label: 'Địa điểm' });
      indices.location = next();
    }

    if (eventData.hierarchy?.childIds?.length) {
      links.push({ id: 'su-kien-con', label: 'Sự kiện liên quan' });
      indices.children = next();
    }

    if (eventData.media?.thumbnail || eventData.media?.items?.length) {
      links.push({ id: 'media', label: 'Tư liệu & media' });
      indices.media = next();
    }

    if (eventData.textbookContent.textbookRefs?.length) {
      links.push({ id: 'nguon-sgk', label: 'Nguồn SGK' });
      indices.sourcesTextbook = next();
    }

    if (eventData.externalContent) {
      links.push({ id: 'nguon-mo-rong', label: 'Nguồn mở rộng' });
      indices.sourcesExternal = next();
    }

    return {
      navLinks: links,
      sectionIndices: indices as typeof indices & {
        textbookOverview: string;
        textbookNarrative: string;
        textbookSignificance: string;
        keyFacts: string;
        location: string;
        children: string;
        media: string;
        sourcesTextbook: string;
        sourcesExternal: string;
      },
    };
  }, [eventData]);

  // ═══════════════════════════════════════════════════
  // ALL hooks MUST be called BEFORE any early return!
  // React Rules of Hooks — every render must call
  // the same hooks in the same order.
  // ═══════════════════════════════════════════════════

  // Build section info for reading progress (empty when no data)
  const sectionInfos: SectionInfo[] = useMemo(() => {
    if (!eventData) return [];
    const infos: SectionInfo[] = [
      { id: 'hero', label: 'Tổng quan', weight: 5 },
      { id: 'tong-quan', label: 'Tóm tắt', weight: 15 },
    ];
    if (eventData.textbookContent.detailedNarrative) {
      infos.push({ id: 'noi-dung-sgk', label: 'Nội dung SGK', weight: 30 });
    }
    if (eventData.textbookContent.significance) {
      infos.push({ id: 'y-nghia', label: 'Ý nghĩa lịch sử', weight: 15 });
    }
    if (eventData.textbookContent.keyFacts?.length) {
      infos.push({ id: 'du-kien-chinh', label: 'Dữ kiện chính', weight: 10 });
    }
    const geoType = eventData.mapData?.displayGeometry?.geoType;
    if (geoType && geoType !== 'no_location') {
      infos.push({ id: 'dia-diem', label: 'Địa điểm', weight: 10 });
    }
    if (eventData.hierarchy?.childIds?.length) {
      infos.push({ id: 'su-kien-con', label: 'Sự kiện liên quan', weight: 5 });
    }
    // media section ALWAYS renders in the DOM (EventMediaGallery shows
    // either the gallery or an empty-state section with id="media").
    infos.push({ id: 'media', label: 'Tư liệu', weight: 5 });
    if (eventData.textbookContent.textbookRefs?.length) {
      infos.push({ id: 'nguon-sgk', label: 'Nguồn SGK', weight: 3 });
    }
    // nguon-mo-rong renders in the DOM when:
    // - BOTH textbookRefs AND externalContent are empty → early return with id="nguon-mo-rong"
    // - OR externalContent exists → inside wrapper div
    // It is ONLY absent when hasTextbookRefs && !hasExternal.
    if (!eventData.textbookContent.textbookRefs?.length || eventData.externalContent) {
      infos.push({ id: 'nguon-mo-rong', label: 'Nguồn mở rộng', weight: 2 });
    }
    return infos;
  }, [eventData]);

  const { readingProgress, activeSection } = useReadingProgress(sectionInfos);

  // Track narration state for cross-component sync
  const [narrationState, setNarrationState] = useState({ isPlaying: false, progress: 0 });

  const handleNarrationStateChange = useCallback(
    (state: { isPlaying: boolean; progress: number }) => {
      setNarrationState(state);
    },
    []
  );

  /* ─── Loading ─── */
  if (loading) {
    return <LoadingState />;
  }

  /* ─── Error ─── */
  if (error || !eventData) {
    return <NotFoundEventState slug={slug} onGoHome={() => navigate('/')} />;
  }

  const isVietnamEvent = !eventData.classification.tags?.includes('lịch sử thế giới');
  const hasLocation =
    eventData.mapData?.displayGeometry !== undefined &&
    eventData.mapData.displayGeometry.geoType !== 'no_location';
  const showMapAction = isVietnamEvent && hasLocation;

  return (
    <div
      className="min-h-screen w-full"
      style={{ background: 'var(--bg-app)', color: 'var(--text-primary)' }}
    >
      {/* Sticky breadcrumb – CoiNguonPage style */}
      <div
        className="sticky top-0 z-40 bg-white/85 backdrop-blur-md"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="mx-auto w-full max-w-[1440px] px-6 md:px-10 lg:px-16 xl:px-20 py-3 flex items-center gap-3 text-sm">
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-1.5 font-medium transition-all duration-200 font-mono text-xs uppercase tracking-wider"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Bản đồ lịch sử
          </button>
          <span style={{ color: 'var(--text-muted)' }}>/</span>
          <span
            className="font-semibold truncate max-w-[60vw] font-serif"
            style={{ color: 'var(--accent)' }}
          >
            {eventData.titles.primary}
          </span>
        </div>
      </div>

      {/* Main */}
      <div className="mx-auto w-full max-w-[1440px] px-6 md:px-10 lg:px-16 xl:px-20 py-8 lg:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_240px] items-start gap-10 lg:gap-12">
          <main className="min-w-0 flex flex-col gap-10">
            <EventHero event={eventData} showMapAction={showMapAction} />
            <ErrorBoundary>
              <EventTTSPlayer event={eventData} onNarrationStateChange={handleNarrationStateChange} />
            </ErrorBoundary>
            <EventTextbookContent
              event={eventData}
              overviewIndex={sectionIndices.textbookOverview || '01'}
              narrativeIndex={sectionIndices.textbookNarrative || '02'}
              significanceIndex={sectionIndices.textbookSignificance || '03'}
            />
            <EventKeyFacts keyFacts={eventData.textbookContent.keyFacts} index={sectionIndices.keyFacts || '04'} />
            <EventLocationCard event={eventData} index={sectionIndices.location || '05'} />
            <EventChildrenList childIds={eventData.hierarchy?.childIds} index={sectionIndices.children || '06'} />
            <EventMediaGallery media={eventData.media} index={sectionIndices.media || '07'} />
            <EventSources
              textbookRefs={eventData.textbookContent.textbookRefs}
              externalContent={eventData.externalContent}
              textbookIndex={sectionIndices.sourcesTextbook || '08'}
              externalIndex={sectionIndices.sourcesExternal || '09'}
            />
          </main>
          <EventDetailSidebar
            navLinks={navLinks}
            showMapAction={showMapAction}
            readingProgress={readingProgress}
            activeSection={activeSection}
            listeningProgress={narrationState.isPlaying ? narrationState.progress : -1}
          />
        </div>
      </div>
    </div>
  );
}

/* ─── Loading State ──────────────────────────────────────────────────────── */

function LoadingState() {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen gap-6"
      style={{ background: 'var(--bg-app)', color: 'var(--text-primary)' }}
    >
      <div className="relative">
        <div
          className="w-14 h-14 rounded-full animate-spin"
          style={{ border: '3px solid var(--border)', borderTopColor: 'var(--accent)' }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-serif text-lg font-bold" style={{ color: 'var(--accent)' }}>S</span>
        </div>
      </div>
      <div className="text-center">
        <p className="font-serif text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          Đang tra cứu thư tịch...
        </p>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Khai thác dữ liệu sự kiện lịch sử
        </p>
      </div>
      <div className="h-[2px] w-12 mx-auto rounded-full" style={{ background: 'var(--accent)' }} />
    </div>
  );
}

/* ─── Not-found state ───────────────────────────────────────────────────── */

function NotFoundEventState({ slug, onGoHome }: { slug?: string; onGoHome: () => void }) {
  const suggestions = [
    { slug: 'bach-dang-938-ngo-quyen-xung-vuong', label: 'Chiến thắng Bạch Đằng 938' },
    { slug: 'chien-dich-dien-bien-phu-1954', label: 'Chiến dịch Điện Biên Phủ 1954' },
    { slug: 'cach-mang-thang-tam-1945', label: 'Cách mạng tháng Tám 1945' },
    { slug: 'tuyen-ngon-doc-lap-1945', label: 'Tuyên ngôn Độc lập 2/9/1945' },
  ];
  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen p-6 text-center gap-5"
      style={{ background: 'var(--bg-app)', color: 'var(--text-primary)' }}
    >
      <div
        className="w-20 h-20 rounded-2xl flex items-center justify-center"
        style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
      >
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2zM22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
        </svg>
      </div>
      <h2 className="font-serif text-3xl font-bold">Không tìm thấy thông tin sự kiện</h2>
      <p className="max-w-lg text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        Sự kiện <strong style={{ color: 'var(--text-primary)' }}>"{slug}"</strong> bạn đang tìm chưa được cập nhật dữ liệu chi tiết. Bạn có thể tham khảo các sự kiện đã có sẵn dưới đây.
      </p>

      <div className="h-[2px] w-12 mx-auto rounded-full mb-2" style={{ background: 'var(--accent)' }} />

      <div
        className="rounded-2xl p-5 max-w-lg w-full text-left"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}
      >
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] mb-3 font-mono" style={{ color: 'var(--accent)' }}>
          Sự kiện tiêu biểu có sẵn
        </div>
        <div className="flex flex-col gap-1">
          {suggestions.map((s) => (
            <a
              key={s.slug}
              href={`/events/${s.slug}`}
              className="px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.background = 'var(--accent-soft)';
                (e.currentTarget as HTMLAnchorElement).style.color = 'var(--accent)';
                (e.currentTarget as HTMLAnchorElement).style.paddingLeft = '16px';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.background = 'transparent';
                (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-secondary)';
                (e.currentTarget as HTMLAnchorElement).style.paddingLeft = '12px';
              }}
            >
              → {s.label}
            </a>
          ))}
        </div>
      </div>

      <button
        onClick={onGoHome}
        className="px-6 py-2.5 rounded-xl font-semibold transition-all duration-200 font-mono text-xs tracking-wider uppercase"
        style={{ background: 'var(--accent)', color: '#fff', boxShadow: 'var(--shadow-glow)' }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.1)';
          (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.filter = 'none';
          (e.currentTarget as HTMLButtonElement).style.transform = 'none';
        }}
      >
        Quay lại bản đồ
      </button>
    </div>
  );
}
