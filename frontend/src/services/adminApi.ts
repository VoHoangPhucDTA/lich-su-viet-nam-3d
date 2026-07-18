import { apiGet, apiPatch, apiPost, apiPut, toQueryString } from './apiClient';

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
  eventLevel: 'atomic' | 'collection';
  eventType: 'military' | 'political' | 'economic' | 'cultural';
  startYear: number;
  endYear?: number | null;
  status: 'draft' | 'published' | 'archived';
  featured: boolean;
  cardSummary?: string | null;
  thumbnailUrl?: string | null;
  updatedAt: string;
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

export function getAdminEvents(params: { q?: string; status?: string; eventLevel?: string; eventType?: string; startYearFrom?: number; startYearTo?: number; limit?: number; offset?: number }) {
  return apiGet<AdminPage<AdminEvent>>(`/api/admin/events${toQueryString(params)}`);
}

export function getAdminEvent(id: string) {
  return apiGet<AdminEventPayload>(`/api/admin/events/${id}`);
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
