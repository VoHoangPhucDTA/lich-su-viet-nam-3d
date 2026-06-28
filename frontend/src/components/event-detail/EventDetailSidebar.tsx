import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface EventDetailSidebarProps {
  navLinks: { id: string; label: string }[];
  /** Map from navLink id to its display index (e.g. '01', '02') for consistent numbering with page content. */
  linkIndices?: Record<string, string>;
  showMapAction?: boolean;
  /** Reading progress (0–100) from IntersectionObserver-based tracking. */
  readingProgress?: number;
  /** Currently active section id from the reading progress tracker. */
  activeSection?: string;
}

/**
 * Sidebar TOC – sticky desktop, có scroll-spy active link và reading progress.
 *
 * Uses IntersectionObserver-based reading progress from the parent (more reliable
 * than raw scroll position) when provided via props. Falls back to legacy
 * scroll-based calculation for backward compatibility.
 */
export default function EventDetailSidebar({
  navLinks,
  linkIndices,
  showMapAction,
  readingProgress: externalReadPct,
  activeSection: externalActiveId,
}: EventDetailSidebarProps) {
  const navigate = useNavigate();
  const [activeId, setActiveId] = useState<string>(navLinks[0]?.id ?? '');
  const [readPct, setReadPct] = useState(0);
  /** Tracks the last section id the user manually clicked (overrides external active during scroll). */
  const [clickedId, setClickedId] = useState<string | null>(null);
  const clickedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Use external reading progress from useReadingProgress hook when provided
  const displayReadPct = externalReadPct !== undefined ? externalReadPct : readPct;
  // After user clicks a TOC link, show the clicked item immediately.
  // The timeout clears the override so the hook's value takes over again.
  const displayActiveId =
    clickedId ??
    (externalActiveId !== undefined ? externalActiveId : activeId);

  /* Legacy scroll-based reading progress (fallback if no external props) */
  useEffect(() => {
    // If external reading progress is provided, skip the legacy scroll listener
    if (externalReadPct !== undefined) return;

    const getScrollState = () => {
      const body = document.body;
      const docEl = document.documentElement;
      const scrollTop = body.scrollTop || docEl.scrollTop || window.scrollY;
      const scrollHeight = Math.max(body.scrollHeight, docEl.scrollHeight);
      const clientHeight = Math.max(body.clientHeight, docEl.clientHeight);
      return { scrollTop, scrollHeight, clientHeight };
    };

    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = getScrollState();
      const total = scrollHeight - clientHeight;
      const pct = total > 0 ? Math.min(100, Math.max(0, (scrollTop / total) * 100)) : 0;
      setReadPct(pct);

      if (externalActiveId !== undefined) return; // external handles active section

      const offsets = navLinks
        .map((l) => {
          const el = document.getElementById(l.id);
          if (!el) return null;
          return { id: l.id, top: el.getBoundingClientRect().top };
        })
        .filter(Boolean) as { id: string; top: number }[];

      const passed = offsets.filter((o) => o.top - 140 <= 0);
      const next = passed.length > 0 ? passed[passed.length - 1].id : navLinks[0]?.id;
      if (next && next !== activeId) setActiveId(next);
    };

    document.body.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      document.body.removeEventListener('scroll', onScroll);
      window.removeEventListener('scroll', onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navLinks, externalReadPct, externalActiveId]);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveId(id);
    // Immediately show the clicked item in the TOC, overriding external activeSection
    if (clickedTimeoutRef.current) clearTimeout(clickedTimeoutRef.current);
    setClickedId(id);
    // Clear the override after IntersectionObserver has time to update
    clickedTimeoutRef.current = setTimeout(() => setClickedId(null), 500);
  };

  const scrollToTop = () => {
    document.body.scrollTo({ top: 0, behavior: 'smooth' });
    document.documentElement.scrollTo({ top: 0, behavior: 'smooth' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    boxShadow: 'var(--shadow)',
  };

  const eyebrowClass =
    'text-[10px] font-bold uppercase tracking-[0.16em]';

  return (
    <aside className="hidden lg:flex w-full min-w-0 flex-col gap-4 sticky top-24 h-fit">
      {/* Reading progress — museum guide plaque */}
      <div className="p-5 lg:p-6 rounded-2xl" style={{...cardStyle, background: 'linear-gradient(135deg, var(--accent-soft), transparent 60%), var(--bg-card)'}}>
        <div className="flex items-center justify-between mb-3.5">
          <span className={eyebrowClass} style={{ color: 'var(--text-muted)' }}>
            Tiến độ đọc
          </span>
          <span
            className="mono-label text-xs"
            style={{ color: 'var(--accent)', fontWeight: 700 }}
          >              {Math.round(displayReadPct)}%
          </span>
        </div>
        <div
          className="w-full h-1 rounded-full overflow-hidden"
          style={{ background: 'var(--bg-surface)' }}
        >
          <div
            className="h-full rounded-full transition-[width] duration-200 ease-linear"
            style={{
              width: `${displayReadPct}%`,
              background:
                'linear-gradient(to right, var(--accent), var(--admin-accent))',
            }}
          />
        </div>
      </div>

      {/* TOC */}
      <nav className="p-5 lg:p-6 rounded-2xl" style={cardStyle}>
        <h3
          className={`${eyebrowClass} mb-3.5`}
          style={{ color: 'var(--text-muted)' }}
        >
          Mục lục
        </h3>
        <div className="flex flex-col gap-0.5">
          {navLinks.map((link, i) => {
            const isActive = displayActiveId === link.id;
            // Use provided linkIndices for consistent numbering with page content,
            // falling back to array index for backward compatibility
            const displayNum = linkIndices?.[link.id] ?? String(i + 1).padStart(2, '0');
            return (
              <button
                key={link.id}
                onClick={() => scrollTo(link.id)}
                className={`block w-full text-left text-[13.5px] py-2.5 pr-3.5 pl-[11px] rounded-lg border-l-[3px] transition hover:bg-[var(--bg-surface)]`}
                style={{
                  borderLeftColor: isActive
                    ? 'var(--admin-accent)'
                    : 'transparent',
                  background: isActive
                    ? 'var(--admin-accent-soft)'
                    : 'transparent',
                  color: isActive
                    ? 'var(--text-primary)'
                    : 'var(--text-secondary)',
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                <span
                  className="font-mono text-[10px] mr-2"
                  style={{
                    color: isActive
                      ? 'var(--admin-accent)'
                      : 'var(--text-muted)',
                  }}
                >
                  {displayNum}
                </span>
                {link.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Quick actions */}
      <div
        className="p-5 lg:p-6 rounded-2xl flex flex-col gap-2.5"
        style={cardStyle}
      >
        <h3
          className={`${eyebrowClass} mb-1.5`}
          style={{ color: 'var(--text-muted)' }}
        >
          Hành động nhanh
        </h3>

        {showMapAction && (
          <button
            onClick={() => navigate('/map')}
            className="inline-flex items-center justify-center gap-2 w-full px-4 py-3 rounded-[10px] text-sm font-semibold transition hover:brightness-110"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1118 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            Mở bản đồ 3D
          </button>
        )}

        <button
          onClick={scrollToTop}
          className="inline-flex items-center justify-center gap-2 w-full px-4 py-3 rounded-[10px] text-sm font-medium transition"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
          Lên đầu trang
        </button>
      </div>
    </aside>
  );
}
