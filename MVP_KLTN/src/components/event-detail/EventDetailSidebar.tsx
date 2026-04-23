import { useNavigate } from 'react-router-dom';

interface EventDetailSidebarProps {
  navLinks: { id: string; label: string }[];
  showMapAction?: boolean;
}

export default function EventDetailSidebar({ navLinks, showMapAction }: EventDetailSidebarProps) {
  const navigate = useNavigate();

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="flex w-full lg:w-64 flex-col gap-6 lg:sticky top-8 h-fit shrink-0">
      
      {/* Content Menu */}
      <div className="bg-card border border-default rounded-2xl p-5 shadow-theme">
        <h3 className="text-sm font-bold text-muted uppercase tracking-widest mb-4">Mục lục</h3>
        <nav className="flex flex-col gap-1.5 border-l border-default ml-1">
          {navLinks.map((link) => (
            <button
              key={link.id}
              onClick={() => scrollTo(link.id)}
              className="text-left text-[14px] text-secondary hover:text-[var(--accent)] pl-4 py-1 relative before:absolute before:left-[-1px] before:top-0 before:bottom-0 before:w-[2px] hover:before:bg-[var(--accent)] before:transition"
            >
              {link.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Quick Actions */}
      <div className="bg-card border border-default rounded-2xl p-5 flex flex-col gap-3 shadow-theme">
        <h3 className="text-sm font-bold text-muted uppercase tracking-widest mb-2">Hành động</h3>
        
        {showMapAction && (
          <button 
            onClick={() => navigate('/')} 
            className="w-full text-left px-4 py-2.5 text-[14px] font-medium rounded-lg transition flex items-center gap-2 border border-default bg-surface text-secondary hover:text-[var(--accent)]"
          >
            <span>🌍</span> Xem bản đồ 3D
          </button>
        )}

        <button 
          onClick={() => navigate('/')} 
          className="w-full text-left px-4 py-2.5 bg-transparent border border-default hover:bg-surface text-secondary text-[14px] font-medium rounded-lg transition flex items-center gap-2"
        >
          <span>↩</span> Về trang chủ
        </button>
      </div>
      
    </div>
  );
}
