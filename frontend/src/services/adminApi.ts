import { apiDelete, apiGet, apiPatch, apiPost, apiPut, toQueryString } from './apiClient';

export interface AdminPage<T> {
  items: T[];
  count: number;
  total: number;
  limit: number;
  offset: number;
}

export interface AdminUser {
  id: string;
  fullName: string;
  email: string;
  grade?: number | null;
  school?: string | null;
  avatarUrl?: string | null;
  status: 'active' | 'pending' | 'disabled';
  role: 'student' | 'admin';
  createdAt: string;
  lastActivity?: string | null;
}

export interface AdminEvent {
  id: string;
  slug: string;
  title: string;
  shortTitle?: string | null;
  eventLevel: 'atomic' | 'collection';
  eventType: 'military' | 'political' | 'economic' | 'cultural';
  eventSubtype?: string | null;
  chronology: AdminEventChronology;
  /** Temporary bridge for the existing Dashboard; remove in the Dashboard phase. */
  startYear: number | null;
  endYear: number | null;
  cardSummary?: string | null;
  status: 'draft' | 'published' | 'archived';
  grades: number[];
  normalizedGeoType: string;
  canonicalGeoType?: AdminCanonicalGeoType | null;
  thumbnail?: { id: number; url: string; altText?: string | null } | null;
  thumbnailUrl?: string | null;
  activeMediaCount: number;
  flags: AdminEventFlags;
  featured: boolean;
  completeness: AdminEventCompleteness;
  createdAt: string;
  updatedAt: string;
}

export type AdminCanonicalGeoType =
  | 'point' | 'multi_point' | 'multi_polygon' | 'mixed' | 'nationwide' | 'no_location';

export interface AdminEventChronology {
  startYear: number | null;
  endYear: number | null;
  effectiveEndYear: number | null;
  displayDate?: string | null;
  datePrecision?: string | null;
}

export interface AdminEventFlags {
  showOnHomepage: boolean;
  showOnTimeline: boolean;
  featured: boolean;
}

export interface AdminEventMapMarker {
  name?: string | null;
  label?: string | null;
  lat?: number | null;
  lng?: number | null;
  confidence?: number | null;
}

export interface AdminEventMapData {
  geoType?: string | null;
  marker?: AdminEventMapMarker | null;
  markers: AdminEventMapMarker[];
  provinceNames: string[];
  historicalLocations: string[];
  gadmRefs: string[];
  displayGeometry?: {
    geoType?: string | null;
    marker?: AdminEventMapMarker | null;
    provinceNames: string[];
    historicalLocations: string[];
  } | null;
  focusGeometry?: {
    mode?: string | null;
    zoom?: number | null;
    center?: { lat?: number | null; lng?: number | null } | null;
    provinceNames: string[];
  } | null;
}

export interface AdminEventCompleteness {
  complete: boolean;
  issueCount: number;
  issues: Array<{
    code: string;
    section: string;
    severity: 'ERROR' | 'WARNING';
    fields: string[];
  }>;
}

export interface AdminEventDetail {
  core: { id: string; slug: string; title: string; shortTitle?: string | null };
  content: {
    cardSummary?: string | null;
    canonicalSummary?: string | null;
    detailedNarrative?: string | null;
    significance?: string | null;
    keyFacts: string[];
  };
  chronology: AdminEventChronology;
  classification: {
    eventLevel: AdminEvent['eventLevel'];
    eventType: AdminEvent['eventType'];
    eventSubtype?: string | null;
    grades: number[];
  };
  publication: {
    status: AdminEvent['status'];
    flags: AdminEventFlags;
    publishedAt?: string | null;
    createdAt: string;
    updatedAt: string;
  };
  media: {
    thumbnail?: { id: number; url: string; altText?: string | null } | null;
    items: Array<{
      id: number;
      mediaType: 'image' | 'video' | 'document' | 'audio';
      url: string;
      caption?: string | null;
      altText?: string | null;
      sourceName?: string | null;
      license?: string | null;
      storageType: string;
      thumbnail: boolean;
      sortOrder: number;
      status: 'active' | 'missing' | 'hidden';
      createdAt: string;
    }>;
    activeCount: number;
  };
  geography: {
    normalizedGeoType: string;
    canonicalGeoType?: AdminCanonicalGeoType | null;
    lat?: number | null;
    lng?: number | null;
    provinceNames: string[];
    historicalLocations: string[];
    mapData?: AdminEventMapData | null;
  };
  hierarchy: {
    parent?: AdminEventLink | null;
    root?: AdminEventLink | null;
    children: AdminEventLink[];
    relations: Array<{
      associationType: string;
      relationType: string;
      sortOrder: number;
      event: AdminEventLink;
    }>;
  };
  textbook: {
    visibleReferences: Array<{
      id: number;
      grade: number;
      book?: string | null;
      theme?: string | null;
      lesson?: string | null;
      pageStart?: number | null;
      pageEnd?: number | null;
      excerpt?: string | null;
      url?: string | null;
    }>;
    totalReferenceCount: number;
    visibleReferenceCount: number;
    hasTextbookContent: boolean;
  };
  externalSources: Array<{
    sourceType: string;
    title?: string | null;
    canonicalUri: string;
    externalId?: string | null;
    language?: string | null;
    sourceOrder: number;
    matchType: string;
    primary: boolean;
    verificationStatus: string;
  }>;
  completeness: AdminEventCompleteness;
}

export interface AdminEventLink {
  id: string;
  slug: string;
  title: string;
  status: AdminEvent['status'];
  eventLevel: AdminEvent['eventLevel'];
  startYear: number | null;
  endYear: number | null;
}

export interface AdminDashboard {
  users: { total: number; active: number; pending: number; disabled: number; newLast7Days: number };
  events: { total: number; published: number; draft: number; archived: number; atomic: number; collection: number; needsContent: number };
  recentAudit: Array<{ action: string; entityType: string; entityId?: string | null; createdAt: string; actorName: string }>;
}

export type AdminEventPayload = Record<string, unknown>;

export function getAdminDashboard() {
  return apiGet<AdminDashboard>('/api/admin/dashboard');
}

export function getAdminUsers(params: { q?: string; status?: string; role?: string; limit?: number; offset?: number }) {
  return apiGet<AdminPage<AdminUser>>(`/api/admin/users${toQueryString(params)}`);
}

export function setAdminUserStatus(id: string, status: AdminUser['status']) {
  return apiPatch<{ id: string; status: AdminUser['status'] }>(`/api/admin/users/${id}/status`, { status });
}

export function setAdminUserRole(id: string, role: AdminUser['role']) {
  return apiPatch<{ id: string; role: AdminUser['role'] }>(`/api/admin/users/${id}/role`, { role });
}

export function deleteAdminUser(id: string) {
  return apiDelete<{ id: string }>(`/api/admin/users/${id}`);
}

export interface AdminEventListParams {
  q?: string;
  status?: string;
  eventLevel?: string;
  eventType?: string;
  grade?: number;
  geoType?: string;
  chronology?: string;
  startYearFrom?: number;
  startYearTo?: number;
  missingThumbnail?: boolean;
  missingMedia?: boolean;
  missingMapData?: boolean;
  sortBy?: string;
  sortDir?: string;
  limit?: number;
  offset?: number;
}

export function getAdminEvents(params: AdminEventListParams, signal?: AbortSignal) {
  return apiGet<AdminPage<AdminEvent>>(`/api/admin/events${toQueryString({ ...params })}`, { signal });
}

export function getAdminEventDetail(id: string, signal?: AbortSignal) {
  return apiGet<AdminEventDetail>(`/api/admin/events/${encodeURIComponent(id)}`, { signal });
}

/** Kept only for the currently unreachable legacy editor module. */
export function getAdminEvent(id: string) {
  return apiGet<AdminEventPayload>(`/api/admin/events/${encodeURIComponent(id)}`);
}

export function createAdminEvent(payload: AdminEventPayload) {
  return apiPost<AdminEventPayload>('/api/admin/events', payload);
}

export function updateAdminEvent(id: string, payload: AdminEventPayload) {
  return apiPut<AdminEventPayload>(`/api/admin/events/${id}`, payload);
}

export function setAdminEventStatus(id: string, status: AdminEvent['status']) {
  return apiPatch<AdminEventPayload>(`/api/admin/events/${id}/status`, { status });
}

export function deleteAdminEvent(id: string) {
  return apiDelete<{ id: string }>(`/api/admin/events/${id}`);
}
