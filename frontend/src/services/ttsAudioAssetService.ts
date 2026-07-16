import { apiGet, apiPostOnce } from './apiClient';

export type TtsAudioAssetStatus =
  | 'pending'
  | 'synthesizing'
  | 'uploading'
  | 'assembling'
  | 'ready'
  | 'failed';

export interface TtsAudioAssetResponse {
  status: TtsAudioAssetStatus;
  assetId: string;
  eventId: string;
  audioUrl: string | null;
  voice: string;
  cacheHit: boolean;
  stale: boolean;
  retryEligible: boolean;
  retryAfterSeconds: number | null;
  staleAfter: string | null;
  errorCode: string | null;
  message: string | null;
  durationMs: number | null;
}

export function requestTtsAudioAsset(
  eventId: string,
  voice: string,
  signal?: AbortSignal,
): Promise<TtsAudioAssetResponse> {
  return apiPostOnce<TtsAudioAssetResponse>(
    `/api/tts/events/${encodeURIComponent(eventId)}/audio`,
    { voice },
    { signal },
  );
}

export function getTtsAudioAsset(
  assetId: string,
  signal?: AbortSignal,
): Promise<TtsAudioAssetResponse> {
  return apiGet<TtsAudioAssetResponse>(
    `/api/tts/audio-assets/${encodeURIComponent(assetId)}`,
    { signal },
  );
}

export function isTtsAudioAssetPending(status: TtsAudioAssetStatus): boolean {
  return status === 'pending'
    || status === 'synthesizing'
    || status === 'uploading'
    || status === 'assembling';
}
