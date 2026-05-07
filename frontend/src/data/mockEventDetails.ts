import type { EventType, GeoType } from '../types/event';

/**
 * Shape của một event chi tiết được EventDetailPage và các sub-component sử dụng.
 *
 * Lưu ý: Tên `MockEventDetail` còn lại do lịch sử. Hiện tại object dạng này được
 * dựng động từ JSON thật trong `src/data/history_events/**` thông qua
 * `eventAdapter.rawToEventDetail()`.
 */
export interface MockEventDetail {
  id: string;
  slug: string;
  entityType: 'event';
  eventLevel: 'collection' | 'atomic';

  titles: {
    primary: string;
    short?: string;
    alternatives?: string[];
  };

  classification: {
    eventType: EventType;
    eventSubtype?: string;
    tags?: string[];
  };

  coverage: {
    /** Mã lớp dạng chuỗi: "10", "11", "12" – đã được normalize từ JSON thật */
    grades: string[];
  };

  chronology: {
    start: string;
    end?: string;
    datePrecision: string;
    displayDate: string;
  };

  mapData?: {
    displayGeometry?: {
      geoType: GeoType;
      marker?: {
        /** [lng, lat] để khớp với chuẩn GeoJSON đang dùng ở UI */
        coordinates: [number, number];
      };
      provinceNames?: string[];
      historicalLocations?: string[];
    };
    focusGeometry?: {
      center: [number, number];
      zoom: number;
    };
  };

  summary: {
    homepageTitle: string;
    homepageSummary: string;
    cardSummary: string;
  };

  textbookContent: {
    canonicalSummary: string;
    detailedNarrative?: string;
    significance?: string;
    keyFacts?: string[];
    textbookRefs?: {
      grade: string;
      book: string;
      theme?: string;
      lesson?: string;
      pageStart?: number;
      pageEnd?: number;
      excerpt?: string;
    }[];
  };

  externalContent?: {
    wikipedia?: {
      title: string;
      url: string;
    };
    wikidata?: {
      url: string;
    };
    otherSources?: {
      name: string;
      url: string;
    }[];
  };

  media?: {
    thumbnail?: string;
    items?: {
      id: string;
      type: 'image' | 'video' | 'document';
      url: string;
      caption?: string;
    }[];
  };

  hierarchy?: {
    rootId?: string;
    parentId?: string;
    childIds?: string[];
    level?: number;
    orderInParent?: number;
  };

  associations?: {
    relatedEventIds?: string[];
    relatedFigureIds?: string[];
    predecessorEventIds?: string[];
    successorEventIds?: string[];
  };

  display: {
    showOnHomepage: boolean;
    showOnTimeline: boolean;
    featured: boolean;
  };

  sourcePolicy: {
    canonicalSource: string;
    supplementalSources?: string[];
  };
}
