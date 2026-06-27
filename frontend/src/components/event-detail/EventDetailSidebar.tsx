import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface EventDetailSidebarProps {
  navLinks: { id: string; label: string }[];
  showMapAction?: boolean;
  /** Section-based reading progress (0–100), from IntersectionObserver. */
  readingProgress?: number;
  /** Currently visible section ID. */
  activeSection?: string;
  /** Audio listening progress (0–100) or -1 if not actively listening. */
  listeningProgress?: number;
}

/**
 * Sidebar TOC redesigned with CoiNguonPage design language.
 * Red-900 active state, white cards, stone border, subtle shadow.
 */
export default function EventDetailSidebar({
  navLinks,
  showMapAction,
  readingProgress = 0,
  activeSection,
  listeningProgress = -1,
}: EventDetailSidebarProps) {
  const navigate = useNavigate();
  const [activeId, setActiveId] = useState<string>(navLinks[0]?.id ?? '');
  const [readPct, setReadPct] = useState(0);

  // Use the section-based reading progress from parent (IntersectionObserver)
  // instead of raw scroll percentage
  useEffect(() => {
    setReadPct(readingProgress);
  }, [readingProgress]);

  // Update active section from IntersectionObserver data
  useEffect(() => {
    if (activeSection && activeSection !== activeId) {
      setActiveId(activeSection);
    }
  }, [activeSection, activeId]);

  // Derived: should we suggest jumping narration to the current section?
  // When audio is playing (listeningProgress >= 0) and the user has scrolled
  // ahead (readingProgress > listeningProgress + 25), show a subtle nudge.
  const showJumpSuggestion = listeningProgress >= 0 && readingProgress > 0
    && readingProgress > listeningProgress + 25;

  // Legacy scroll fallback for TOC tracking when sections aren't observed
  useEffect(() => {
    const onScroll = () => {
      if (activeSection) return;

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
    return () => {
      document.body.removeEventListener('scroll', onScroll);
      window.removeEventListener('scroll', onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navLinks, activeSection]);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveId(id);
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

  const eyebrowClass = 'text-[10px] font-bold uppercase tracking-[0.16em] font-mono';

  return (
    <aside className="hidden lg:flex w-full min-w-0 flex-col gap-4 sticky top-24 h-fit">
      {/* Reading progress */}
      <div className="p-5 lg:p-6 rounded-2xl" style={cardStyle}>
        <div className="flex items-center justify-between mb-3.5">
          <span className={eyebrowClass} style={{ color: 'var(--text-muted)' }}>Tiến độ đọc</span>
          <span className="font-mono text-xs font-bold" style={{ color: 'var(--accent)' }}>
            {Math.round(readPct)}%
          </span>
        </div>
        <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'var(--bg-surface)' }}>
          <div
            className="h-full rounded-full transition-[width] duration-200 ease-linear"
            style={{
              width: `${readPct}%`,
              background: 'linear-gradient(to right, var(--accent), var(--admin-accent))',
            }}
          />
        </div>
      </div>

      {/* TOC */}
      <nav className="p-5 lg:p-6 rounded-2xl" style={cardStyle}>
        <h3 className={`${eyebrowClass} mb-3.5`} style={{ color: 'var(--text-muted)' }}>Mục lục</h3>
        <div className="flex flex-col gap-0.5">
          {navLinks.map((link, i) => {
            const isActive = activeId === link.id;
            return (
              <button
                key={link.id}
                onClick={() => scrollTo(link.id)}
                className="block w-full text-left text-[13.5px] py-2.5 pr-3.5 pl-[11px] rounded-lg border-l-[3px] transition-all duration-200"
                style={{
                  borderLeftColor: isActive ? 'var(--accent)' : 'transparent',
                  background: isActive ? 'var(--accent-soft)' : 'transparent',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: isActive ? 600 : 400,
                }}
                onMouseEnter={(e) => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-surface)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }}
              >
                <span
                  className="font-mono text-[10px] mr-2"
                  style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)' }}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                {link.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Jump-to-section suggestion — shown when scrolling away from narration */}
      {showJumpSuggestion && (
        <div
          className="p-4 rounded-2xl flex items-start gap-3 transition-all duration-300"
          style={{
            background: 'var(--accent-soft)',
            border: '1px solid color-mix(in srgb, var(--accent) 50%, transparent)',
          }}
        >
          <div
            className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <path d="M21 15a9 9 0 11-6.87-8.62L21 3v6.38A9 9 0 0021 15z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>
              Đang phát tường thuật
            </div>
            <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Bạn đang đọc trước nội dung. Dùng mục lục bên dưới để nhảy đến phần đang được đọc.
            </p>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="p-5 lg:p-6 rounded-2xl flex flex-col gap-2.5" style={cardStyle}>
        <h3 className={`${eyebrowClass} mb-1.5`} style={{ color: 'var(--text-muted)' }}>Hành động nhanh</h3>

        {showMapAction && (
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 font-mono text-xs tracking-wider uppercase"
            style={{
              background: 'var(--accent)',
              color: '#fff',
              boxShadow: 'var(--shadow-glow)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.1)';
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.filter = 'none';
              (e.currentTarget as HTMLButtonElement).style.transform = 'none';
            }}
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
          className="inline-flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-card)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-surface)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
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
