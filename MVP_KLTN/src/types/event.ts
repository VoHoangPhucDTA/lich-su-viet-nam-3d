export interface HistoricalEvent {
  id: string;
  name: string;
  description: string;
  startYear: number;
  endYear?: number;
  eventType: EventType;
  eventSubtype?: string;
  geoType: GeoType;
  coordinates?: { lat: number; lng: number };
  primaryRegions?: string[];
  secondaryRegions?: string[];
  parentId: string | null;
  children?: HistoricalEvent[];
  images?: string[];
  details?: string;
}

export type EventType = 'military' | 'political' | 'economic' | 'cultural';
export type GeoType = 'multi_region' | 'single_point' | 'nationwide' | 'no_location';

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  military: 'Quân sự',
  political: 'Chính trị',
  economic: 'Kinh tế',
  cultural: 'Văn hóa - Xã hội',
};

export const EVENT_TYPE_ICONS: Record<EventType, string> = {
  military: '⚔️',
  political: '🏛️',
  economic: '💰',
  cultural: '📚',
};

export const EVENT_TYPE_COLORS: Record<EventType, string> = {
  military: '#ef4444',
  political: '#3b82f6',
  economic: '#f59e0b',
  cultural: '#10b981',
};

export const GEO_TYPE_LABELS: Record<GeoType, string> = {
  multi_region: 'Nhiều vùng',
  single_point: 'Một điểm',
  nationwide: 'Toàn quốc',
  no_location: 'Không có địa điểm',
};
