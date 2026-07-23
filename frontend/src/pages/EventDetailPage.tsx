import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import type { MockEventDetail } from '../data/mockEventDetails';
import { getEventDetailBySlug } from '../services/eventDetailService';
import { recordEventView, getEventProgress } from '../services/eventApi';
import { useReadingProgress, type SectionInfo } from '../hooks/useReadingProgress';
import { getAppScrollRoot, useActiveSection } from '../hooks/useActiveSection';

import EventHero from '../components/event-detail/EventHero';
import EventTTSPlayer from '../components/event-detail/EventTTSPlayer';
import EventTextbookContent from '../components/event-detail/EventTextbookContent';
import EventKeyFacts from '../components/event-detail/EventKeyFacts';
import EventLocationCard from '../components/event-detail/EventLocationCard';
import EventChildrenList from '../components/event-detail/EventChildrenList';
import EventMediaGallery from '../components/event-detail/EventMediaGallery';
import EventSources from '../components/event-detail/EventSources';
import EventDetailSidebar from '../components/event-detail/EventDetailSidebar';

function hasAnyRelatedEvent(eventData: MockEventDetail | null) {
  const groups = eventData?.relatedEvents;
  return Boolean(
    groups &&
      (groups.predecessors.length > 0 || groups.successors.length > 0 || groups.related.length > 0)
  );
}

/**
 * Displays the detailed page for the event identified by the route slug.
 */
export default function EventDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
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
          setError(false);
          // Don't recordEventView here — we'll record when user actually scrolls
          // (see debounced progress persistence below)
          getAppScrollRoot()?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
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

  /* ─── Reading progress tracking via IntersectionObserver ─── */
  const sectionsInfo = useMemo<SectionInfo[]>(() => {
    if (!eventData) return [];
    const items: SectionInfo[] = [];
    // Weight assignments: content sections are weighted equally, media/sources lighter
    items.push({ id: 'tong-quan', label: 'Tổng quan', weight: 1 });
    if (eventData.textbookContent.detailedNarrative) {
      items.push({ id: 'noi-dung-sgk', label: 'Nội dung chi tiết', weight: 2 });
    }
    if (eventData.textbookContent.significance) {
      items.push({ id: 'y-nghia', label: 'Ý nghĩa lịch sử', weight: 1 });
    }
    if (eventData.textbookContent.keyFacts?.length) {
      items.push({ id: 'du-kien-chinh', label: 'Dữ kiện chính', weight: 1 });
    }
    const isVN = !eventData.classification.tags?.includes('lịch sử thế giới');
    const geoType = eventData.mapData?.displayGeometry?.geoType;
    if (isVN && geoType && geoType !== 'no_location') {
      items.push({ id: 'dia-diem', label: 'Địa điểm', weight: 1 });
    } else if (isVN && eventData.mapData?.displayGeometry) {
      items.push({ id: 'dia-diem', label: 'Địa điểm', weight: 1 });
    }
    if (hasAnyRelatedEvent(eventData)) {
      items.push({ id: 'su-kien-con', label: 'Sự kiện liên quan', weight: 1 });
    }
    if (eventData.media?.thumbnail || eventData.media?.items?.length) {
      items.push({ id: 'media', label: 'Tư liệu & media', weight: 1 });
    }
    if (eventData.textbookContent.textbookRefs?.length) {
      items.push({ id: 'nguon-sgk', label: 'Nguồn SGK', weight: 1 });
    }
    if (eventData.externalSources?.length || eventData.externalContent) {
      items.push({ id: 'nguon-mo-rong', label: 'Nguồn mở rộng', weight: 1 });
    }
    return items;
  }, [eventData]);

  const {
    readingProgress,
    resetProgress: resetReadingProgress,
    setInitialProgress,
  } = useReadingProgress(sectionsInfo);
  const {
    activeSection,
    scrollToSection,
    scrollToTop,
  } = useActiveSection(sectionsInfo);

  /* ─── Reset reading progress on event change ─── */
  const prevEventIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (eventData && eventData.id !== prevEventIdRef.current) {
      prevEventIdRef.current = eventData.id;
      resetReadingProgress();
    }
  }, [eventData, resetReadingProgress]);

  /* ─── Debounced progress persistence ─── */
  const prevProgressRef = useRef(0);
  useEffect(() => {
    const saveProgress = async () => {
      if (!eventData) return;
      // Only save if progress actually changed and we're above a threshold
      const rounded = Math.round(readingProgress);
      if (Math.abs(rounded - prevProgressRef.current) >= 5 || rounded === 100) {
        prevProgressRef.current = rounded;
        await recordEventView(eventData.id, {
          source: 'detail',
          progressPercent: rounded,
        });
      }
    };
    // Throttle: only save when progress changes by >= 5% or hits 100%
    if (readingProgress > 0) {
      const timer = setTimeout(saveProgress, 500);
      return () => clearTimeout(timer);
    }
  }, [readingProgress, eventData]);

  /* ─── Restore reading progress from backend on load ───
   *
   * Sets the viewed sections up to the saved progress point without scrolling,
   * so the IntersectionObserver doesn't mark sections spuriously during an
   * animated scroll. The user scrolls naturally from where they left off.
   */
  // Track which event ID we've restored progress for (so navigating to a
  // different event triggers a new restore)
  const restoredEventIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!eventData) return;
    if (restoredEventIdRef.current === eventData.id) return;
    restoredEventIdRef.current = eventData.id;
    
    getEventProgress(eventData.id).then((savedProgress) => {
      if (savedProgress && savedProgress.progressPercent > 0) {
        const totalWeight = sectionsInfo.reduce((sum, s) => sum + s.weight, 0);
        if (totalWeight === 0) return;
        
        // Determine which sections to mark as viewed based on saved progress
        // (without scrolling, to avoid observer marking sections during animation)
        const initiallyViewed = new Set<string>();
        let cumulative = 0;
        for (const section of sectionsInfo) {
          initiallyViewed.add(section.id);
          cumulative += section.weight / totalWeight * 100;
          if (cumulative >= savedProgress.progressPercent) {
            break;
          }
        }
        // Set via the hook's exposed function so IntersectionObserver picks up from here
        setInitialProgress(initiallyViewed);
      }
    }).catch(() => {
      // Silently ignore — no saved progress
    });
  }, [eventData, sectionsInfo]);

  /* ─── Save progress before leaving the page ─── */
  useEffect(() => {
    if (!eventData) return;
    // Use the same base URL as apiClient (empty string in dev via Vite proxy)
    const API_BASE_URL =
      import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? '';
    const saveBeforeLeave = () => {
      if (prevProgressRef.current > 0) {
        // Use fetch with keepalive (like sendBeacon but with credentials)
        // to ensure auth cookies are sent during page unload
        fetch(`${API_BASE_URL}/api/events/${eventData.id}/view`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          keepalive: true,
          body: JSON.stringify({
            source: 'detail',
            progressPercent: prevProgressRef.current,
          }),
        }).catch(() => {
          // Silently fail — progress was already saved via debounced saves
        });
      }
    };
    window.addEventListener('beforeunload', saveBeforeLeave);
    return () => window.removeEventListener('beforeunload', saveBeforeLeave);
  }, [eventData]);

  /* ─── Build TOC links + numbered indices for each section ─── */
  const { navLinks, sectionIndices, linkIndices } = useMemo(() => {
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

    // 01 Tổng quan (always present)
    links.push({ id: 'tong-quan', label: 'Tổng quan' });
    indices.textbookOverview = next();

    if (eventData.textbookContent.detailedNarrative) {
      links.push({ id: 'noi-dung-sgk', label: 'Nội dung chi tiết' });
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

    if (hasAnyRelatedEvent(eventData)) {
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

    if (eventData.externalSources?.length || eventData.externalContent) {
      links.push({ id: 'nguon-mo-rong', label: 'Nguồn mở rộng' });
      indices.sourcesExternal = next();
    }

    // Build a map from link id → display number for consistent sidebar numbering
    const linkIdxMap: Record<string, string> = {
      'tong-quan': indices.textbookOverview,
      'noi-dung-sgk': indices.textbookNarrative,
      'y-nghia': indices.textbookSignificance,
      'du-kien-chinh': indices.keyFacts,
      'dia-diem': indices.location,
      'su-kien-con': indices.children,
      'media': indices.media,
      'nguon-sgk': indices.sourcesTextbook,
      'nguon-mo-rong': indices.sourcesExternal,
    };

    return {
      navLinks: links,
      linkIndices: linkIdxMap,
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

  /* ─── Loading ─── */
  if (loading) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-screen gap-4"
        style={{ background: 'var(--bg-app)', color: 'var(--text-primary)' }}
      >
        <div
          className="w-10 h-10 rounded-full animate-spin"
          style={{
            border: '3px solid var(--border)',
            borderTopColor: 'var(--accent)',
          }}
        />
        <div className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
          Đang tải dữ liệu sự kiện…
        </div>
      </div>
    );
  }

  /* ─── Error ─── */
  if (error || !eventData) {
    return <NotFoundEventState slug={slug} onGoHome={() => {
      const from = (location.state as { from?: string } | null)?.from;
      if (from) navigate(from);
      else navigate('/home');
    }} />;
  }

  const isVietnamEvent = !eventData.classification.tags?.includes('lịch sử thế giới');
  const hasLocation =
    eventData.mapData?.displayGeometry !== undefined &&
    eventData.mapData.displayGeometry.geoType !== 'no_location';
  const showMapAction = isVietnamEvent && hasLocation;

  return (
    <div
      className="event-detail-shell min-h-screen w-full"
      style={{
        background: 'var(--bg-app)',
        color: 'var(--text-primary)',
      }}
    >
      {/* Sticky breadcrumb */}
      <div
        className="sticky top-0 z-40 glass-map"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="mx-auto w-full max-w-[1440px] px-6 md:px-10 lg:px-16 xl:px-20 py-3 flex items-center gap-3 text-sm">
          <button
            onClick={() => {
              // Smart back: origin route > history back > /home fallback
              const from = (location.state as { from?: string } | null)?.from;
              if (from) {
                navigate(from);
              } else if (window.history.length > 1) {
                navigate(-1);
              } else {
                navigate('/home');
              }
            }}
            className="inline-flex items-center font-medium transition"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.color =
                'var(--accent)')
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.color =
                'var(--text-secondary)')
            }
          >
            Quay lại
          </button>
          <span style={{ color: 'var(--text-muted)' }}>/</span>
          <span
            className="font-semibold truncate max-w-[60vw]"
            style={{ color: 'var(--accent)' }}
          >
            {eventData.titles.primary}
          </span>
        </div>
      </div>

      {/* Main */}
      <div className="mx-auto w-full max-w-[1440px] px-6 md:px-10 lg:px-16 xl:px-20 py-8 lg:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_240px] items-start gap-12 lg:gap-16">
          {/* Content column */}
          <main className="min-w-0 flex flex-col gap-16" style={{ gap: 'clamp(40px, 5vw, 72px)' }}>
            <EventHero event={eventData} showMapAction={showMapAction} />

            <EventTTSPlayer event={eventData} />

            <EventTextbookContent
              event={eventData}
              overviewIndex={sectionIndices.textbookOverview || '01'}
              narrativeIndex={sectionIndices.textbookNarrative || '02'}
              significanceIndex={sectionIndices.textbookSignificance || '03'}
            />

            <EventKeyFacts
              keyFacts={eventData.textbookContent.keyFacts}
              index={sectionIndices.keyFacts || '04'}
            />

            <EventLocationCard event={eventData} index={sectionIndices.location || '05'} />

            <EventChildrenList
              eventId={eventData.id}
              relatedEvents={eventData.relatedEvents}
              index={sectionIndices.children || '06'}
            />

            <EventMediaGallery media={eventData.media} index={sectionIndices.media || '07'} />

            <EventSources
              textbookRefs={eventData.textbookContent.textbookRefs}
              textbookSourceContent={eventData.textbookContent.sourceContent}
              externalSources={eventData.externalSources}
              externalContent={eventData.externalContent}
              textbookIndex={sectionIndices.sourcesTextbook || '08'}
              externalIndex={sectionIndices.sourcesExternal || '09'}
            />
          </main>

          {/* TOC sidebar (desktop) */}
          <EventDetailSidebar
            navLinks={navLinks}
            linkIndices={linkIndices}
            showMapAction={showMapAction}
            activeSection={activeSection}
            onNavigateToSection={scrollToSection}
            onScrollToTop={scrollToTop}
            mapEventKey={eventData.slug || eventData.id}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Displays the event not-found state with suggested events and a home navigation action.
 *
 * @param slug - The requested event slug shown in the message.
 * @param onGoHome - Callback invoked when the user selects the home button.
 */

function NotFoundEventState({
  slug,
  onGoHome,
}: {
  slug?: string;
  onGoHome: () => void;
}) {
  const suggestions = [
    {
      slug: 'bach-dang-938-ngo-quyen-xung-vuong',
      label: 'Chiến thắng Bạch Đằng 938',
    },
    {
      slug: 'chien-dich-dien-bien-phu-1954',
      label: 'Chiến dịch Điện Biên Phủ 1954',
    },
    {
      slug: 'cach-mang-thang-tam-1945',
      label: 'Cách mạng tháng Tám 1945',
    },
    {
      slug: 'tuyen-ngon-doc-lap-1945',
      label: 'Tuyên ngôn Độc lập 2/9/1945',
    },
  ];
  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen p-6 text-center gap-5"
      style={{ background: 'var(--bg-app)', color: 'var(--text-primary)' }}
    >
      <h2 className="text-2xl font-bold">Không tìm thấy thông tin sự kiện</h2>
      <p
        className="max-w-lg text-sm leading-relaxed"
        style={{ color: 'var(--text-muted)' }}
      >
        Sự kiện{' '}
        <strong style={{ color: 'var(--text-primary)' }}>"{slug}"</strong> bạn
        đang tìm chưa được cập nhật dữ liệu chi tiết. Bạn có thể tham khảo các
        sự kiện đã có sẵn dưới đây.
      </p>

      <div
        className="rounded-2xl p-5 max-w-lg w-full text-left"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow)',
        }}
      >
        <div
          className="text-[10px] font-bold uppercase tracking-[0.16em] mb-3"
          style={{ color: 'var(--text-muted)' }}
        >
          Sự kiện tiêu biểu có sẵn
        </div>
        <div className="flex flex-col gap-1">
          {suggestions.map((s) => (
            <a
              key={s.slug}
              href={`/events/${s.slug}`}
              className="px-3 py-2 rounded-lg text-sm font-medium transition"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.background =
                  'var(--accent-soft)';
                (e.currentTarget as HTMLAnchorElement).style.color =
                  'var(--accent)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.background =
                  'transparent';
                (e.currentTarget as HTMLAnchorElement).style.color =
                  'var(--text-secondary)';
              }}
            >
              {s.label}
            </a>
          ))}
        </div>
      </div>

      <button
        onClick={onGoHome}
        className="px-6 py-2.5 rounded-xl font-semibold"
        style={{ background: 'var(--accent)', color: '#fff' }}
      >
        Về trang chủ
      </button>
    </div>
  );
}
