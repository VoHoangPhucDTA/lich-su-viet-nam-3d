import type { MockEventDetail } from '../data/mockEventDetails';
import { mockEventsData } from '../data/mockEventDetails';
import { findEventById } from '../data/events';

const ALIAS_MAP: Record<string, string> = {
  "dien-bien-phu-1954": "chien-dich-dien-bien-phu-1954",
  "khang-chien-chong-phap": "khang-chien-chong-phap-1945-1954",
  "hoi-nghi-yalta": "hoi-nghi-ianta-1945"
};

export const getEventDetailBySlug = async (slugOrId: string): Promise<MockEventDetail | null> => {
  await new Promise(resolve => setTimeout(resolve, 300));
  
  // Resolve alias
  const resolvedKey = ALIAS_MAP[slugOrId] || slugOrId;

  // Search in mock
  const foundInMock = Object.values(mockEventsData).find(event =>
    event.slug === resolvedKey || event.id === resolvedKey
  );

  if (foundInMock) {
    return foundInMock;
  }

  // Fallback builder
  const fallbackRaw = findEventById(resolvedKey);
  if (fallbackRaw) {
    // Generate fallback MockEventDetail shape
    const fallbackEvent: MockEventDetail = {
      id: fallbackRaw.id,
      slug: fallbackRaw.id,
      entityType: 'event',
      eventLevel: fallbackRaw.children?.length ? 'collection' : 'atomic',
      titles: {
        primary: fallbackRaw.name
      },
      classification: {
        eventType: fallbackRaw.eventType,
        eventSubtype: fallbackRaw.eventSubtype
      },
      coverage: {
        grades: []
      },
      chronology: {
        start: String(fallbackRaw.startYear),
        end: fallbackRaw.endYear ? String(fallbackRaw.endYear) : undefined,
        datePrecision: 'year',
        displayDate: fallbackRaw.endYear && fallbackRaw.endYear !== fallbackRaw.startYear 
          ? `${fallbackRaw.startYear} - ${fallbackRaw.endYear}` 
          : `${fallbackRaw.startYear}`
      },
      summary: {
        homepageTitle: fallbackRaw.name,
        homepageSummary: fallbackRaw.description,
        cardSummary: fallbackRaw.description
      },
      textbookContent: {
        canonicalSummary: fallbackRaw.details || fallbackRaw.description,
        detailedNarrative: "Nội dung chi tiết đang được bổ sung cho sự kiện này.",
      },
      display: {
        showOnHomepage: true,
        showOnTimeline: true,
        featured: false
      },
      sourcePolicy: {
        canonicalSource: "Dữ liệu bản đồ"
      }
    };
    
    // Add map data if available
    if (fallbackRaw.geoType !== 'no_location') {
      fallbackEvent.mapData = {
        displayGeometry: {
          geoType: fallbackRaw.geoType,
          marker: fallbackRaw.coordinates ? {
            coordinates: [fallbackRaw.coordinates.lng, fallbackRaw.coordinates.lat]
          } : undefined,
          provinceNames: fallbackRaw.primaryRegions,
        }
      };
    }
    
    if (fallbackRaw.children) {
      fallbackEvent.hierarchy = {
        childIds: fallbackRaw.children.map(c => c.id)
      };
    }

    return fallbackEvent;
  }

  return null;
};

export const getChildrenEvents = async (childIds: string[]): Promise<MockEventDetail[]> => {
  await new Promise(resolve => setTimeout(resolve, 200));
  
  return childIds
    .map(id => Object.values(mockEventsData).find(e => e.id === id))
    .filter((e): e is MockEventDetail => e !== undefined);
};

export const getRelatedEvents = async (ids: string[]): Promise<MockEventDetail[]> => {
  await new Promise(resolve => setTimeout(resolve, 200));
  
  return ids
    .map(id => Object.values(mockEventsData).find(e => e.id === id))
    .filter((e): e is MockEventDetail => e !== undefined);
};
