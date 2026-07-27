import { apiDelete, apiGet, apiPatch, apiPost, apiPut, toQueryString } from './apiClient';

export interface AdminPage<T> {
  items: T[];
  count: number;
  total: number;
  limit: number;
  offset: number;
}

export type AdminUserRole = 'student' | 'teacher' | 'admin';
export type AdminUserStatus = 'active' | 'pending' | 'disabled' | 'deleted';
export type AdminUserGrade = '10' | '11' | '12' | 'other' | null;

export interface AdminUserListItem {
  id: string;
  displayName: string | null;
  email: string;
  primaryRole: AdminUserRole | null;
  roles: AdminUserRole[];
  status: AdminUserStatus;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
  lastMeaningfulActivityAt: string | null;
}

export interface AdminUserDetail {
  account: {
    id: string;
    displayName: string | null;
    email: string;
    primaryRole: AdminUserRole | null;
    roles: AdminUserRole[];
    status: AdminUserStatus;
    emailVerified: boolean;
    emailVerifiedAt: string | null;
    grade: AdminUserGrade;
    school: string | null;
    avatarUrl: string | null;
    createdAt: string;
    updatedAt: string;
  };
  sessions: {
    trackingMode: 'STATELESS_JWT';
    trackingAvailable: false;
    activeRefreshSessionCount: null;
  };
  learning: {
    progress: {
      eventsViewed: number;
      distinctEventsViewed: number;
      totalMinutes: number;
      lastActivityAt: string | null;
    };
    quizzes: AdminUserAssessmentSummary;
    exams: AdminUserAssessmentSummary;
  };
  activity: {
    lastMeaningfulActivityAt: string | null;
    recent: AdminUserActivityItem[];
  };
  recentAdminAudit: AdminUserAuditEntry[];
}

export interface AdminUserAssessmentSummary {
  submittedCount: number;
  averageScore10: number | null;
  lastSubmittedAt: string | null;
}

export interface AdminUserActivityItem {
  kind: 'event_view' | 'quiz_submitted' | 'exam_submitted';
  timestamp: string;
  title: string;
  score10: number | null;
}

export interface AdminUserAuditEntry {
  action: string | null;
  relation: 'target' | 'actor' | 'both';
  actor: { displayName: string };
  entityType: string | null;
  entityId: string | null;
  timestamp: string;
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
  cardSummary?: string | null;
  status: 'draft' | 'published' | 'archived';
  grades: number[];
  normalizedGeoType: string;
  canonicalGeoType?: AdminCanonicalGeoType | null;
  thumbnail?: { id: number; url: string; altText?: string | null } | null;
  activeMediaCount: number;
  flags: AdminEventFlags;
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

export interface AdminEventCreateRequest {
  title: string;
  slug: string;
  shortTitle?: string | null;
  eventLevel: 'atomic' | 'collection';
  eventType: 'military' | 'political' | 'economic' | 'cultural';
  eventSubtype?: string | null;
  startYear?: number | null;
  endYear?: number | null;
  effectiveEndYear?: number | null;
  displayDate?: string | null;
  datePrecision?: string | null;
  cardSummary?: string | null;
  canonicalSummary?: string | null;
  detailedNarrative?: string | null;
  significance?: string | null;
  keyFacts: string[];
  grades: number[];
  showOnHomepage: boolean;
  showOnTimeline: boolean;
  featured: boolean;
}

export interface AdminEventCorePatchRequest {
  expectedUpdatedAt: string;
  title?: string | null;
  slug?: string | null;
  shortTitle?: string | null;
  eventLevel?: 'atomic' | 'collection' | null;
  eventType?: 'military' | 'political' | 'economic' | 'cultural' | null;
  eventSubtype?: string | null;
  startYear?: number | null;
  endYear?: number | null;
  effectiveEndYear?: number | null;
  displayDate?: string | null;
  datePrecision?: string | null;
  cardSummary?: string | null;
  canonicalSummary?: string | null;
  detailedNarrative?: string | null;
  significance?: string | null;
  keyFacts?: string[] | null;
  showOnHomepage?: boolean | null;
  showOnTimeline?: boolean | null;
  featured?: boolean | null;
}

export interface AdminEventGradesRequest {
  expectedUpdatedAt: string;
  grades: number[];
}

export type AdminEventPublicationAction = 'publish' | 'unpublish' | 'archive' | 'restore';

export interface AdminEventPublicationRequest {
  expectedUpdatedAt: string;
  action: AdminEventPublicationAction;
}

export interface AdminEventGeographyMarker {
  name?: string | null;
  label?: string | null;
  lat: number;
  lng: number;
  confidence?: number | null;
}

export interface AdminEventGeographyFocus {
  mode: 'auto' | 'bounds';
  zoom?: number | null;
}

type GeographyBase = {
  historicalLocations: string[];
  focus?: AdminEventGeographyFocus | null;
};

export type AdminEventGeographyPayload =
  | (GeographyBase & { geoType: 'no_location' })
  | (GeographyBase & { geoType: 'nationwide' })
  | (GeographyBase & { geoType: 'point'; marker: AdminEventGeographyMarker })
  | (GeographyBase & { geoType: 'multi_point'; markers: AdminEventGeographyMarker[] })
  | (GeographyBase & { geoType: 'multi_polygon'; regions: Array<{ gadmRef: string }> })
  | (GeographyBase & {
    geoType: 'mixed';
    markers: AdminEventGeographyMarker[];
    regions: Array<{ gadmRef: string }>;
  });

export interface AdminEventGeographyPatchRequest {
  expectedUpdatedAt: string;
  geography: AdminEventGeographyPayload;
}

export interface AdminEventMediaCreateRequest {
  expectedUpdatedAt: string;
  mediaType: 'image' | 'video' | 'document' | 'audio';
  url: string;
  caption?: string | null;
  altText?: string | null;
  sourceName?: string | null;
  license?: string | null;
  status?: 'active' | 'missing' | 'hidden';
}

export interface AdminEventMediaPatchRequest {
  expectedUpdatedAt: string;
  mediaType?: AdminEventMediaCreateRequest['mediaType'];
  url?: string;
  caption?: string | null;
  altText?: string | null;
  sourceName?: string | null;
  license?: string | null;
  status?: 'active' | 'missing' | 'hidden';
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
      url: string | null;
      urlSafe?: boolean;
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

export interface AdminDashboardMetrics {
  events: {
    total: number;
    published: number;
    draft: number;
    archived: number;
    missingThumbnail: number;
    missingActiveMedia: number;
    missingOrInvalidMapData: number;
    withCompletenessIssues: number;
  };
  users: {
    activeTotal: number;
    createdLast7Days: number;
  };
}

export interface AdminDashboardAttentionEvent {
  id: string;
  title: string;
  chronology: AdminEventChronology;
  status: AdminEvent['status'];
  thumbnail?: AdminEvent['thumbnail'];
  completeness: AdminEventCompleteness;
  updatedAt: string;
  reasonCode: string;
  recommendedFilter: string;
}

export interface AdminDashboardAuditEntry {
  actor: { displayName: string };
  action: string;
  entityType: string;
  entityId?: string | null;
  timestamp: string;
}

export interface AdminDashboard {
  metrics: AdminDashboardMetrics;
  attention: AdminDashboardAttentionEvent[];
  recentAudit: AdminDashboardAuditEntry[];
}

export function getAdminDashboard(signal?: AbortSignal) {
  return apiGet<AdminDashboard>('/api/admin/dashboard', { signal });
}

export function getAdminDashboardMetrics(signal?: AbortSignal) {
  return apiGet<AdminDashboardMetrics>('/api/admin/dashboard/metrics', { signal });
}

export function getAdminDashboardAttention(signal?: AbortSignal) {
  return apiGet<AdminDashboardAttentionEvent[]>('/api/admin/dashboard/attention', { signal });
}

export function getAdminDashboardAudit(signal?: AbortSignal) {
  return apiGet<AdminDashboardAuditEntry[]>('/api/admin/dashboard/audit', { signal });
}

export interface AdminUserListParams {
  q?: string;
  role?: AdminUserRole;
  status?: AdminUserStatus;
  verified?: 'true' | 'false';
  sortBy?: 'displayName' | 'email' | 'createdAt' | 'updatedAt';
  sortDir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export function getAdminUsers(params: AdminUserListParams, signal?: AbortSignal) {
  return apiGet<AdminPage<AdminUserListItem>>(
    `/api/admin/users${toQueryString({ ...params })}`,
    { signal },
  );
}

export function getAdminUserDetail(id: string, signal?: AbortSignal) {
  return apiGet<AdminUserDetail>(`/api/admin/users/${encodeURIComponent(id)}`, { signal });
}

export interface AdminUserRoleMutationRequest {
  expectedUpdatedAt: string;
  roles: AdminUserRole[];
}

export interface AdminUserStatusMutationRequest {
  expectedUpdatedAt: string;
  status: Exclude<AdminUserStatus, 'deleted'>;
}

export function replaceAdminUserRoles(
  id: string,
  payload: AdminUserRoleMutationRequest,
  signal?: AbortSignal,
) {
  return apiPut<AdminUserDetail>(
    `/api/admin/users/${encodeURIComponent(id)}/roles`,
    payload,
    { signal },
  );
}

export function updateAdminUserStatus(
  id: string,
  payload: AdminUserStatusMutationRequest,
  signal?: AbortSignal,
) {
  return apiPatch<AdminUserDetail>(
    `/api/admin/users/${encodeURIComponent(id)}/status`,
    payload,
    { signal },
  );
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

export function createAdminEvent(payload: AdminEventCreateRequest, signal?: AbortSignal) {
  return apiPost<AdminEventDetail>('/api/admin/events', payload, { signal });
}

export function updateAdminEventCore(id: string, payload: AdminEventCorePatchRequest, signal?: AbortSignal) {
  return apiPatch<AdminEventDetail>(`/api/admin/events/${encodeURIComponent(id)}/core`, payload, { signal });
}

export function replaceAdminEventGrades(id: string, payload: AdminEventGradesRequest, signal?: AbortSignal) {
  return apiPut<AdminEventDetail>(`/api/admin/events/${encodeURIComponent(id)}/grades`, payload, { signal });
}

export function updateAdminEventGeography(
  id: string,
  payload: AdminEventGeographyPatchRequest,
  signal?: AbortSignal,
) {
  return apiPatch<AdminEventDetail>(
    `/api/admin/events/${encodeURIComponent(id)}/geography`,
    payload,
    { signal },
  );
}

export function updateAdminEventPublication(
  id: string,
  payload: AdminEventPublicationRequest,
  signal?: AbortSignal,
) {
  return apiPatch<AdminEventDetail>(
    `/api/admin/events/${encodeURIComponent(id)}/publication`,
    payload,
    { signal },
  );
}

export function addAdminEventMedia(id: string, payload: AdminEventMediaCreateRequest, signal?: AbortSignal) {
  return apiPost<AdminEventDetail>(`/api/admin/events/${encodeURIComponent(id)}/media`, payload, { signal });
}

export function updateAdminEventMedia(
  id: string,
  mediaId: number,
  payload: AdminEventMediaPatchRequest,
  signal?: AbortSignal,
) {
  return apiPatch<AdminEventDetail>(
    `/api/admin/events/${encodeURIComponent(id)}/media/${mediaId}`,
    payload,
    { signal },
  );
}

export function removeAdminEventMedia(id: string, mediaId: number, expectedUpdatedAt: string, signal?: AbortSignal) {
  return apiDelete<AdminEventDetail>(
    `/api/admin/events/${encodeURIComponent(id)}/media/${mediaId}`,
    { signal, headers: { 'X-Event-Version': expectedUpdatedAt } },
  );
}

export function reorderAdminEventMedia(id: string, expectedUpdatedAt: string, mediaIds: number[], signal?: AbortSignal) {
  return apiPut<AdminEventDetail>(
    `/api/admin/events/${encodeURIComponent(id)}/media/order`,
    { expectedUpdatedAt, mediaIds },
    { signal },
  );
}

export function selectAdminEventThumbnail(id: string, mediaId: number, expectedUpdatedAt: string, signal?: AbortSignal) {
  return apiPut<AdminEventDetail>(
    `/api/admin/events/${encodeURIComponent(id)}/thumbnail/${mediaId}`,
    { expectedUpdatedAt },
    { signal },
  );
}
