import { useState, useCallback, useMemo } from 'react';
import CesiumMap from '../components/CesiumMap';
import Timeline from '../components/Timeline';
import Sidebar from '../components/Sidebar';
import EventPopup from '../components/EventPopup';
import {
  HISTORICAL_EVENTS,
  getEventsByYear,
  findEventById,
  TIMELINE_MIN_YEAR,
} from '../data/events';
import type { HistoricalEvent } from '../types/event';

export default function MapPage() {
  const [currentYear, setCurrentYear] = useState(TIMELINE_MIN_YEAR);
  const [selectedEvent, setSelectedEvent] = useState<HistoricalEvent | null>(
    null
  );
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(
    null
  );
  const [navigationStack, setNavigationStack] = useState<HistoricalEvent[]>([]);

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

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--color-surface)',
      }}
    >
      {/* Top bar */}
      <div
        className="glass"
        style={{
          padding: '10px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(71, 85, 105, 0.3)',
          zIndex: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '24px' }}>🏛️</span>
          <div>
            <h1
              style={{
                fontSize: '16px',
                fontWeight: 700,
                background:
                  'linear-gradient(135deg, #818cf8, #6366f1, #a78bfa)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                letterSpacing: '-0.01em',
              }}
            >
              Lịch Sử Việt Nam 3D
            </h1>
            <p
              style={{
                fontSize: '11px',
                color: 'var(--color-text-dim)',
                marginTop: '1px',
              }}
            >
              Khám phá lịch sử qua bản đồ tương tác
            </p>
          </div>
        </div>

        {/* Navigation breadcrumb */}
        {selectedEvent && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
            }}
          >
            <button
              onClick={() => {
                setSelectedEvent(null);
                setNavigationStack([]);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-primary-light)',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              Tổng quan
            </button>
            {navigationStack.map((navEvent) => (
              <span key={navEvent.id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: 'var(--color-text-dim)' }}>›</span>
                <button
                  onClick={() => {
                    const idx = navigationStack.indexOf(navEvent);
                    setNavigationStack((prev) => prev.slice(0, idx));
                    setSelectedEvent(navEvent);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-primary-light)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    maxWidth: '120px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {navEvent.name}
                </button>
              </span>
            ))}
            <span style={{ color: 'var(--color-text-dim)' }}>›</span>
            <span
              style={{
                color: 'var(--color-text)',
                fontWeight: 600,
                maxWidth: '160px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {selectedEvent.name}
            </span>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '12px',
            color: 'var(--color-text-dim)',
          }}
        >
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#10b981',
            }}
          />
          MVP Demo
        </div>
      </div>

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
        <div
          style={{
            flex: 1,
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Cesium Map */}
          <div style={{ flex: 1, position: 'relative' }}>
            <CesiumMap
              events={visibleMapEvents}
              selectedEvent={selectedEvent}
              onSelectEvent={handleSelectEvent}
              highlightedEventId={highlightedEventId}
            />

            {/* Map overlay info */}
            {!selectedEvent && (
              <div
                className="animate-fade-in"
                style={{
                  position: 'absolute',
                  top: '16px',
                  left: '16px',
                  padding: '10px 16px',
                  borderRadius: '10px',
                  background: 'rgba(15, 23, 42, 0.85)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(71, 85, 105, 0.3)',
                  fontSize: '12px',
                  color: 'var(--color-text-dim)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span style={{ fontSize: '16px' }}>💡</span>
                Kéo timeline để chọn mốc thời gian, click marker để xem chi
                tiết sự kiện
              </div>
            )}
          </div>

          {/* Timeline */}
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
