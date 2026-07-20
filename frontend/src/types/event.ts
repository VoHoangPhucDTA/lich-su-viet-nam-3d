import type { LucideIcon } from 'lucide-react';
import {
  Swords,
  Landmark,
  Coins,
  BookOpenText,
  MapPinned,
  MapPin,
  Map as MapIcon,
  ClipboardList,
} from 'lucide-react';

export interface HistoricalEvent {
  id: string;
  slug?: string;
  eventLevel?: 'collection' | 'atomic';
  name: string;
  description: string;
  startYear: number | null;
  endYear: number | null;
  effectiveEndYear: number | null;
  displayDate?: string;
  eventType: EventType;
  eventSubtype?: string;
  geoType: GeoType;
  canonicalGeoType?: CanonicalGeoType;
  sourceJson?: EventSourceJson;
  sourceMapData?: SourceMapData;
  coordinates?: { lat: number; lng: number };
  primaryRegions?: string[];
  secondaryRegions?: string[];
  parentId: string | null;
  childCount?: number;
  orderInParent?: number;
  children?: HistoricalEvent[];
  images?: string[];
  thumbnailUrl?: string;
  details?: string;
}

export type EventAssociationType = 'predecessor' | 'successor' | 'related';

export interface RelatedHistoricalEvent extends HistoricalEvent {
  associationType: EventAssociationType;
  relationType: 'related' | 'predecessor' | 'successor' | 'same_topic' | 'same_location' | string;
  relationLabel: string;
  sortOrder: number;
}

export interface RelatedHistoricalEvents {
  predecessors: RelatedHistoricalEvent[];
  successors: RelatedHistoricalEvent[];
  related: RelatedHistoricalEvent[];
}

export type EventType = 'military' | 'political' | 'economic' | 'cultural';

/** Canonical geo contract from the event source JSON. */
export type CanonicalGeoType =
  | 'point'
  | 'multi_point'
  | 'multi_polygon'
  | 'mixed'
  | 'nationwide'
  | 'no_location';

/** Legacy normalized values still consumed by existing map/list UI. */
export type LegacyGeoType = 'multi_region' | 'single_point' | 'nationwide' | 'no_location';

export type GeoType = LegacyGeoType;

export interface SourceMapMarker {
  name?: unknown;
  label?: unknown;
  lat?: unknown;
  lng?: unknown;
  confidence?: unknown;
}

export interface SourceMapData {
  geoType?: unknown;
  marker?: SourceMapMarker | null;
  markers?: unknown;
  provinceNames?: unknown;
  gadmRefs?: unknown;
  focusGeometry?: unknown;
}

export interface EventSourceJson {
  mapData?: SourceMapData;
  [key: string]: unknown;
}

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  military: 'Quân sự',
  political: 'Chính trị',
  economic: 'Kinh tế',
  cultural: 'Văn hóa - Xã hội',
};

/**
 * Tất cả icon đồng bộ dùng từ thư viện `lucide-react` để có style nhất quán
 * (stroke, line-cap, kích thước). Component sử dụng:
 *
 *   const Icon = EVENT_TYPE_ICONS[eventType];
 *   <Icon size={16} />
 */
export const EVENT_TYPE_ICONS: Record<EventType, LucideIcon> = {
  military: Swords,
  political: Landmark,
  economic: Coins,
  cultural: BookOpenText,
};

export const EVENT_TYPE_COLORS: Record<EventType, string> = {
  military: '#9f1d2d',
  political: '#2f5d8a',
  economic: '#c29b4b',
  cultural: '#2f7a57',
};

export const GEO_TYPE_LABELS: Record<GeoType, string> = {
  multi_region: 'Nhiều vùng',
  single_point: 'Một điểm',
  nationwide: 'Toàn quốc',
  no_location: 'Không có địa điểm',
};

/** Lucide icon tương ứng với mỗi loại phạm vi địa lý của sự kiện. */
export const GEO_TYPE_ICONS: Record<GeoType, LucideIcon> = {
  multi_region: MapPinned,
  single_point: MapPin,
  nationwide: MapIcon,
  no_location: ClipboardList,
};
