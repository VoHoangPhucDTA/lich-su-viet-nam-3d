import { useState, useCallback, useMemo } from 'react';
import { ChevronRight, Lightbulb } from 'lucide-react';
import CesiumMap from '../components/CesiumMap';
import Timeline from '../components/Timeline';
import Sidebar from '../components/Sidebar';
import EventPopup from '../components/EventPopup';
import {
  getEventsByYear,
  findEventById,
  TIMELINE_MIN_YEAR,
} from '../data/events';
import { useEffect } from 'react';
import type { HistoricalEvent } from '../types/event';
import { useHeader } from '../components/layout/HeaderContext';

export default function MapPage() {
  const [currentYear, setCurrentYear] = useState(TIMELINE_MIN_YEAR);
  const [selectedEvent, setSelectedEvent] = useState<HistoricalEvent | null>(
    null
  );
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(
    null
  );
  const [navigationStack, setNavigationStack] = useState<HistoricalEvent[]>([]);
  
  const { setCenterContent } = useHeader();

  // Events visible on the map based on the current context
  const visibleMapEvents = useMemo(() => {
    // If an event with children is selected, show its children
    if (
      selectedEvent &&
      selectedEvent.children &&
      selectedEvent.children.length > 0
    ) {
      return selectedEvent.children.filter(
        (c) => c.geoType !== 'no_location' && c.coordinates
      );
    }

    // Otherwise show root events filtered by year
    const yearFiltered = getEventsByYear(currentYear);
    return yearFiltered.filter(
      (e) => e.geoType !== 'no_location' && e.coordinates
    );
  }, [selectedEvent, currentYear]);

  // All events visible in sidebar (including no_location)
  const sidebarEvents = useMemo(() => {
    return getEventsByYear(currentYear);
  }, [currentYear]);

  // Handle selecting an event from map or sidebar
  const handleSelectEvent = useCallback(
    (event: HistoricalEvent | null) => {
      if (event === null) {
        // Deselect — go back to root view
        setSelectedEvent(null);
        setNavigationStack([]);
        return;
      }

      // If the event has children, drill down
      if (event.children && event.children.length > 0) {
        setNavigationStack((prev) =>
          selectedEvent ? [...prev, selectedEvent] : prev
        );
        setSelectedEvent(event);
      } else {
        // Leaf event — just select it
        // Push parent to stack if we're navigating from a parent context
        if (selectedEvent && selectedEvent.id !== event.id) {
          // Check if clicked event is a child of selectedEvent
          const isChildOfCurrent = selectedEvent.children?.some(
            (c) => c.id === event.id
          );
          if (isChildOfCurrent) {
            setNavigationStack((prev) => [...prev, selectedEvent]);
          }
        }
        setSelectedEvent(event);
      }
    },
    [selectedEvent]
  );

  // Navigate to a child event from popup
  const handleNavigateToChild = useCallback(
    (child: HistoricalEvent) => {
      if (selectedEvent) {
        setNavigationStack((prev) => [...prev, selectedEvent]);
      }
      setSelectedEvent(child);
    },
    [selectedEvent]
  );

  // Navigate back to parent
  const handleNavigateToParent = useCallback(() => {
    if (navigationStack.length > 0) {
      const parent = navigationStack[navigationStack.length - 1];
      setNavigationStack((prev) => prev.slice(0, -1));
      setSelectedEvent(parent);
    } else {
      setSelectedEvent(null);
    }
  }, [navigationStack]);

  // Get parent event for the popup "back" button
  const parentEvent = useMemo(() => {
    if (navigationStack.length > 0) {
      return navigationStack[navigationStack.length - 1];
    }
    if (selectedEvent?.parentId) {
      return findEventById(selectedEvent.parentId) || null;
    }
    return null;
  }, [selectedEvent, navigationStack]);

  // Handle year change from timeline
  const handleYearChange = useCallback((year: number) => {
    setCurrentYear(year);
    setSelectedEvent(null);
    setNavigationStack([]);
  }, []);

  // Close popup
  const handleClosePopup = useCallback(() => {
    setSelectedEvent(null);
    setNavigationStack([]);
  }, []);

  useEffect(() => {
    if (selectedEvent) {
      setCenterContent(
        <div
          className="glass-map"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            borderRadius: '999px',
            border: '1px solid var(--border)',
            fontSize: '13px',
          }}
        >
          <button
            onClick={() => {
              setSelectedEvent(null);
              setNavigationStack([]);
            }}
            style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}
          >
            Tổng quan
          </button>
          {navigationStack.map((navEvent) => (
            <span key={navEvent.id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ChevronRight size={14} strokeWidth={2.2} style={{ color: 'var(--text-muted)' }} />
              <button
                onClick={() => {
                  const idx = navigationStack.indexOf(navEvent);
                  setNavigationStack((prev) => prev.slice(0, idx));
                  setSelectedEvent(navEvent);
                }}
                style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '12px', fontWeight: 500, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {navEvent.name}
              </button>
            </span>
          ))}
          <ChevronRight size={14} strokeWidth={2.2} style={{ color: 'var(--text-muted)' }} />
          <span style={{ color: 'var(--text-primary)', fontWeight: 600, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selectedEvent.name}
          </span>
        </div>
      );
    } else {
      setCenterContent(null);
    }
  }, [selectedEvent, navigationStack, setCenterContent]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%', 
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--bg-app)',
      }}
    >
      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Sidebar */}
        <Sidebar
          events={sidebarEvents}
          selectedEvent={selectedEvent}
          onSelectEvent={handleSelectEvent}
          onHoverEvent={setHighlightedEventId}
        />

        {/* Map area */}
        <div className="relative flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
          {/* Cesium Map (flex-1 + min-h-0 để không đẩy Timeline ra khỏi viewport) */}
          <div className="relative flex-1 min-h-0">
            <CesiumMap
              events={visibleMapEvents}
              selectedEvent={selectedEvent}
              onSelectEvent={handleSelectEvent}
              highlightedEventId={highlightedEventId}
            />

            {/* Map overlay info */}
            {!selectedEvent && (
              <div
                className="glass-map animate-fade-in absolute top-4 left-4 flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                <Lightbulb
                  size={18}
                  strokeWidth={2.2}
                  style={{ color: 'var(--accent)' }}
                />
                <span>
                  Kéo timeline để chọn mốc thời gian, click marker để xem chi
                  tiết sự kiện
                </span>
              </div>
            )}
          </div>

          {/* Timeline — flex-shrink-0 đảm bảo không bị squeeze khi map shrink */}
          <Timeline currentYear={currentYear} onYearChange={handleYearChange} />
        </div>

        {/* Event popup */}
        {selectedEvent && (
          <EventPopup
            event={selectedEvent}
            onClose={handleClosePopup}
            onNavigateToChild={handleNavigateToChild}
            onNavigateToParent={handleNavigateToParent}
            parentEvent={parentEvent}
          />
        )}
      </div>
    </div>
  );
}
