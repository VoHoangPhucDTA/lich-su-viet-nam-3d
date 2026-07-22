import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';

interface EventDetailSidebarProps {
  navLinks: { id: string; label: string }[];
  /** Map from navLink id to its display index (e.g. '01', '02') for consistent numbering with page content. */
  linkIndices?: Record<string, string>;
  showMapAction?: boolean;
  /** Currently active section id from the page-level scroll-spy. */
  activeSection?: string;
  onNavigateToSection: (id: string) => void;
  onScrollToTop: () => void;
  mapEventKey?: string;
}

/**
 * Sidebar TOC – sticky desktop navigation and quick actions.
 */
export default function EventDetailSidebar({
  navLinks,
  linkIndices,
  showMapAction,
  activeSection,
  onNavigateToSection,
  onScrollToTop,
  mapEventKey,
}: EventDetailSidebarProps) {
  const navigate = useNavigate();
  const displayActiveId = activeSection || navLinks[0]?.id;

  const mapUrl = mapEventKey
    ? `/map?event=${encodeURIComponent(mapEventKey)}`
    : '/map';

  const cardStyle: CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    boxShadow: 'var(--shadow)',
  };

  const eyebrowClass =
    'text-[10px] font-bold uppercase tracking-[0.16em]';

  return (
    <aside className="hidden lg:flex w-full min-w-0 flex-col gap-4 sticky top-24 h-fit">
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
                onClick={() => onNavigateToSection(link.id)}
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
                  className="font-sans text-[10px] mr-2"
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
            onClick={() => navigate(mapUrl)}
            className="inline-flex items-center justify-center w-full px-4 py-3 rounded-[10px] text-sm font-semibold transition hover:brightness-110"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            Mở bản đồ 3D
          </button>
        )}

        <button
          onClick={onScrollToTop}
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
