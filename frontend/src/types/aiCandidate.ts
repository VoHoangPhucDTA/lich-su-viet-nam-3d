export type AiCandidateStatus = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'PUBLISHED';

export interface AiCandidateOption { id: 'A' | 'B' | 'C' | 'D'; text: string; correct: boolean; displayOrder: number; originalText: string }
export interface AiCandidateSource { chunkId: string; documentId: string | null; grade: number | null; lessonNumber: number | null; lessonTitle: string | null; sectionTitle: string | null; pageStart: number | null; pageEnd: number | null; chunkHash: string | null; displayOrder: number }
export interface AiCandidateSummary { id: string; status: AiCandidateStatus; questionText: string; difficulty: string; grade: number; lessonNumber: number | null; topic: string | null; createdBy: string; reviewedBy: string | null; warningCount: number; sourceCount: number; version: number; createdAt: string; updatedAt: string }
export interface AiCandidateDetail extends AiCandidateSummary {
  explanation: string; originalQuestionText: string; originalExplanation: string; originalCorrectOptionId: string;
  generationQuery: string; requestedCount: number; generationRequestId: string; generationModel: string;
  embeddingModel: string; embeddingDimension: number; promptVersion: string; schemaVersion: string;
  corpusSha256: string; collectionName: string; validationStatus: string; validationWarnings: string[];
  generationWarnings: string[]; submittedBy: string | null; publishedBy: string | null; submittedAt: string | null;
  reviewedAt: string | null; publishedAt: string | null; rejectionReason: string | null; reviewNote: string | null;
  officialQuestionId: string | null; selfReviewOverrideUsed: boolean; selfReviewOverrideReason: string | null;
  options: AiCandidateOption[]; sources: AiCandidateSource[]; revision?: AiCandidateRevisionInfo;
}
export interface AiCandidateRevisionInfo {
  originType: 'GENERATED' | 'REVISION'; parentCandidateId: string | null; rootOfficialQuestionId: string | null;
  baseOfficialQuestionId: string | null; revisionNumber: number | null; revisionReason: string | null;
  baseContentHash: string | null; baseQuestionText: string | null; baseExplanation: string | null;
  baseDifficulty: string | null; baseTopic: string | null; baseDatasetId: string | null;
  baseDefinitionId: string | null; baseSectionId: string | null; openRevisionCandidateId: string | null;
  baseOptions: AiCandidateOption[]; baseSources: AiCandidateSource[];
}
export interface AiSourceSearchResult { chunkId: string; chunkHash: string; documentId: string; grade: number; lessonNumber: number; lessonTitle: string; sectionTitle: string; pageStart: number | null; pageEnd: number | null; excerpt: string; distance: number }
export interface AiCandidatePage { items: AiCandidateSummary[]; total: number; limit: number; offset: number }
export interface AiCandidateAuditEvent { id: number; eventType: string; actorId: string; fromStatus: string | null; toStatus: string | null; changedFields: string[]; note: string | null; createdAt: string; requestId: string }
export interface AiPublishTarget { datasetId: string; definitionId: string; sectionId: string; label: string }
