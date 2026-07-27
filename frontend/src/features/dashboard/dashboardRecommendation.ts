import type { Confidence, InsightStatus } from './dashboardTypes';

export interface RecommendationCandidate {
  key: string;
  label: string;
  accuracy: number;
  correctUnits: number;
  totalUnits: number;
  attemptCount: number;
  confidence: Confidence;
  status: InsightStatus;
}

export type RecommendationTier =
  | 'weakness'
  | 'developing'
  | 'insufficient-data'
  | 'lowest-confidence';

export interface RecommendationSelection {
  candidate: RecommendationCandidate;
  tier: RecommendationTier;
}

const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 } as const;

function stableKeyOrder(left: RecommendationCandidate, right: RecommendationCandidate): number {
  return left.key.localeCompare(right.key, 'vi');
}

function bySeverity(left: RecommendationCandidate, right: RecommendationCandidate): number {
  return left.accuracy - right.accuracy
    || right.totalUnits - left.totalUnits
    || stableKeyOrder(left, right);
}

function byEvidenceVolume(left: RecommendationCandidate, right: RecommendationCandidate): number {
  return right.totalUnits - left.totalUnits
    || left.accuracy - right.accuracy
    || stableKeyOrder(left, right);
}

function byLowestConfidence(left: RecommendationCandidate, right: RecommendationCandidate): number {
  return CONFIDENCE_RANK[left.confidence] - CONFIDENCE_RANK[right.confidence]
    || left.accuracy - right.accuracy
    || stableKeyOrder(left, right);
}

/** Nguồn chân lý duy nhất để chọn chủ đề ôn tiếp theo cho backend và local. */
export function selectRecommendationCandidate(
  candidates: RecommendationCandidate[],
): RecommendationSelection | null {
  const weakness = candidates.filter(candidate => candidate.status === 'weakness').sort(bySeverity)[0];
  if (weakness) return { candidate: weakness, tier: 'weakness' };

  const developing = candidates.filter(candidate => candidate.status === 'developing').sort(bySeverity)[0];
  if (developing) return { candidate: developing, tier: 'developing' };

  const insufficient = candidates
    .filter(candidate => candidate.status === 'insufficient-data')
    .sort(byEvidenceVolume)[0];
  if (insufficient) return { candidate: insufficient, tier: 'insufficient-data' };

  const lowest = [...candidates].sort(byLowestConfidence)[0];
  return lowest ? { candidate: lowest, tier: 'lowest-confidence' } : null;
}

export function dashboardTopicRoute(topicKey: string): string {
  return `/exams/on-chu-de/${encodeURIComponent(topicKey)}`;
}
