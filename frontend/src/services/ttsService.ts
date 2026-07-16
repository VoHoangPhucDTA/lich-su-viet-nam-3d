/**
 * Frontend service for AI Historical Narration (Text-to-Speech).
 *
 * Communicates with the backend TTS endpoints which proxy the configured
 * TTS provider (currently Viettel AI). The API key NEVER leaves the backend.
 *
 * Flow:
 *   1. GET  /api/tts/voices       → available voice list (for UI selection)
 *   2. POST /api/tts/generate     → { jobId, status: "processing" }
 *   3. GET  /api/tts/status/{jobId} → { status: "done"|"processing"|"failed", playlist }
 *   4. Frontend plays the audio URLs from the playlist sequentially.
 */

import { apiPost, apiGet } from './apiClient';

export interface TtsGenerateRequest {
  eventId: string;
  text: string;
  voice?: string;
  speed?: number;
}

export interface TtsPlaylistItem {
  index: number;
  url: string;
}

export interface TtsPlaylistData {
  eventId: string;
  totalChunks: number;
  items: TtsPlaylistItem[];
}

export interface TtsJobStatusResponse {
  jobId: string;
  status: 'processing' | 'done' | 'failed';
  data?: TtsPlaylistData;
  errorMessage?: string;
}

export interface TtsGenerateResponse {
  jobId: string;
  status: 'processing' | 'done' | 'failed';
  data?: TtsPlaylistData;
  errorMessage?: string;
}

export interface TtsVoice {
  code: string;
  name: string;
  region: string;
  gender: string;
}

/** Map of Viettel AI voice codes to human-readable metadata. */
const VOICE_METADATA: Record<string, Pick<TtsVoice, 'name' | 'region' | 'gender'>> = {
  'hcm-diemmy':    { name: 'Diễm My',   region: 'Miền Nam', gender: 'Nữ' },
  'hcm-thuyduyen': { name: 'Thúy Duyên', region: 'Miền Nam', gender: 'Nữ' },
  'hn-quynhanh':   { name: 'Quỳnh Anh',  region: 'Miền Bắc', gender: 'Nữ' },
  'hn-thanhtung':  { name: 'Thanh Tùng', region: 'Miền Bắc', gender: 'Nam' },
  'hue-maingoc':   { name: 'Mai Ngọc',   region: 'Miền Trung', gender: 'Nữ' },
};

/**
 * Fetch available voices from the active TTS provider.
 */
export async function fetchVoices(): Promise<TtsVoice[]> {
  const codes = await apiGet<string[]>('/api/tts/voices');
  return codes.map((code) => {
    const meta = VOICE_METADATA[code];
    return {
      code,
      name: meta?.name ?? code,
      region: meta?.region ?? '',
      gender: meta?.gender ?? '',
    };
  });
}

/**
 * Submit text for AI narration generation.
 * Returns immediately with a jobId. Use pollTtsStatus() to get the audio playlist.
 */
export async function generateTts(request: TtsGenerateRequest): Promise<TtsGenerateResponse> {
  return apiPost<TtsGenerateResponse>('/api/tts/generate', request);
}

/**
 * Poll the status of a TTS generation job.
 * When status is "done", the response contains the full audio playlist.
 */
export async function pollTtsStatus(jobId: string): Promise<TtsJobStatusResponse> {
  return apiGet<TtsJobStatusResponse>(`/api/tts/status/${jobId}`);
}
