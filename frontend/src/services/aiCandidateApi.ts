import { apiGet, apiPostOnce, apiPut, toQueryString } from './apiClient';
import type { AiCandidateAuditEvent, AiCandidateDetail, AiCandidatePage, AiPublishTarget, AiSourceSearchResult } from '@/types/aiCandidate';

const BASE = '/api/exams/ai/candidates';

export function saveGeneratedCandidates(generationReceiptId: string, questionIndexes: number[], signal?: AbortSignal) {
  return apiPostOnce<AiCandidateDetail[]>(BASE, { generationReceiptId, questionIndexes }, { signal });
}
export function listAiCandidates(params: { status?: string; difficulty?: string; grade?: number; lessonNumber?: number; createdBy?: string; reviewedBy?: string; createdFrom?: string; createdTo?: string; q?: string; limit?: number; offset?: number }, signal?: AbortSignal) {
  return apiGet<AiCandidatePage>(`${BASE}${toQueryString(params)}`, { signal });
}
export function getAiCandidate(id: string, signal?: AbortSignal) { return apiGet<AiCandidateDetail>(`${BASE}/${encodeURIComponent(id)}`, { signal }); }
export function getAiCandidateAudit(id: string, signal?: AbortSignal) { return apiGet<AiCandidateAuditEvent[]>(`${BASE}/${encodeURIComponent(id)}/audit`, { signal }); }
export function getAiPublishTargets(signal?: AbortSignal) { return apiGet<AiPublishTarget[]>(`${BASE}/publish-targets`, { signal }); }
export function updateAiCandidate(id: string, payload: { version: number; questionText: string; explanation: string; difficulty: string; grade: number; lessonNumber?: number; topic?: string; options: Array<{ id: string; text: string; correct: boolean }>; reviewNote?: string }) { return apiPut<AiCandidateDetail>(`${BASE}/${encodeURIComponent(id)}`, payload); }
export function submitAiCandidate(id: string, version: number, note?: string) { return apiPostOnce<AiCandidateDetail>(`${BASE}/${encodeURIComponent(id)}/submit`, { version, note }); }
export function approveAiCandidate(id: string, version: number, note?: string, selfReviewOverride = false, overrideReason?: string) { return apiPostOnce<AiCandidateDetail>(`${BASE}/${encodeURIComponent(id)}/approve`, { version, note, selfReviewOverride, overrideReason }); }
export function rejectAiCandidate(id: string, version: number, reason: string) { return apiPostOnce<AiCandidateDetail>(`${BASE}/${encodeURIComponent(id)}/reject`, { version, reason }); }
export function publishAiCandidate(id: string, version: number, target: AiPublishTarget) { return apiPostOnce<AiCandidateDetail>(`${BASE}/${encodeURIComponent(id)}/publish`, { version, datasetId: target.datasetId, definitionId: target.definitionId, sectionId: target.sectionId }); }
export function createAiCandidateRevision(id: string, reason: string) { return apiPostOnce<AiCandidateDetail>(`${BASE}/${encodeURIComponent(id)}/revisions`, { reason }); }
export function searchAiCandidateSources(id: string, payload: { query: string; grade?: number; lessonNumber?: number; topK?: number }) { return apiPostOnce<AiSourceSearchResult[]>(`${BASE}/${encodeURIComponent(id)}/source-search`, payload); }
export function remapAiCandidateSources(id: string, version: number, sources: Array<{ chunkId: string; chunkHash: string }>, reason: string) { return apiPut<AiCandidateDetail>(`${BASE}/${encodeURIComponent(id)}/sources`, { version, sources, reason }); }
