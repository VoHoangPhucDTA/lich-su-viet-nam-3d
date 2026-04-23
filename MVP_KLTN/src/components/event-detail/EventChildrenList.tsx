import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { MockEventDetail } from '../../data/mockEventDetails';
import { getChildrenEvents } from '../../services/eventDetailService';

interface EventChildrenListProps {
  childIds?: string[];
}

export default function EventChildrenList({ childIds }: EventChildrenListProps) {
  const [children, setChildren] = useState<MockEventDetail[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (childIds && childIds.length > 0) {
      getChildrenEvents(childIds).then(setChildren);
    }
  }, [childIds]);

  if (!childIds || childIds.length === 0) return null;

  return (
    <section id="su-kien-con" className="scroll-mt-24 w-full max-w-4xl mt-8">
      <h2 className="text-2xl font-bold text-primary mb-4 border-b border-default pb-2">Các sự kiện liên quan</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {children.map(child => {
          const geoType = child.mapData?.displayGeometry?.geoType;
          let icon = '📄';
          if (child.eventLevel === 'collection') icon = '📁';
          else if (geoType && geoType !== 'no_location') icon = '📍';

          return (
            <div 
              key={child.id}
              onClick={() => navigate(`/events/${child.slug}`)}
              className="group bg-card border border-default rounded-xl p-4 cursor-pointer transition shadow-theme"
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent)';
                e.currentTarget.style.background = 'var(--bg-surface)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.background = 'var(--bg-card)';
              }}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2 text-sm text-muted font-medium font-mono">
                  <span>{child.chronology.displayDate}</span>
                </div>
                <span className="text-lg opacity-70">{icon}</span>
              </div>
              <h3 className="text-lg font-semibold text-primary transition leading-snug mb-2 group-hover:text-[var(--accent)]">
                {child.titles.primary}
              </h3>
              <p className="text-sm text-muted line-clamp-2">
                {child.summary.cardSummary}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
