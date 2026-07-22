import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  Square,
} from 'lucide-react';
import type { MockEventDetail } from '../../data/mockEventDetails';
import { ApiRequestError } from '../../services/apiClient';
import { fetchVoices } from '../../services/ttsService';
import type { TtsVoice } from '../../services/ttsService';
import {
  getTtsAudioAsset,
  isTtsAudioAssetPending,
  requestTtsAudioAsset,
} from '../../services/ttsAudioAssetService';
import type { TtsAudioAssetResponse } from '../../services/ttsAudioAssetService';

interface AssetTTSPlayerProps {
  event: MockEventDetail;
  onNarrationStateChange?: (state: { isPlaying: boolean; progress: number }) => void;
  onAssetFlowDisabled: () => void;
}

type PlayerStatus = 'idle' | 'generating' | 'ready' | 'playing' | 'paused' | 'completed' | 'error';

const DEFAULT_VOICE = 'hcm-diemmy';
const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5] as const;
const DEFAULT_POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 5 * 60_000;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
    : `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export default function AssetTTSPlayer({
  event,
  onNarrationStateChange,
  onAssetFlowDisabled,
}: AssetTTSPlayerProps) {
  const [status, setStatus] = useState<PlayerStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(1);
  const [voices, setVoices] = useState<TtsVoice[]>([]);
  const [appliedVoice, setAppliedVoice] = useState(DEFAULT_VOICE);
  const [draftVoice, setDraftVoice] = useState(DEFAULT_VOICE);
  const [showSettings, setShowSettings] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [assetMessage, setAssetMessage] = useState('');
  const [hasAudioSource, setHasAudioSource] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sourceUrlRef = useRef<string | null>(null);
  const requestTokenRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestInFlightRef = useRef(false);

  const cancelInFlight = useCallback(() => {
    requestTokenRef.current += 1;
    requestInFlightRef.current = false;
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, []);

  const clearAudioSource = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    sourceUrlRef.current = null;
    setHasAudioSource(false);
  }, []);

  const playCurrentAudio = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !sourceUrlRef.current) return;
    try {
      await audio.play();
      setStatus('playing');
    } catch {
      setStatus('paused');
      setErrorMessage('Trình duyệt đang chặn phát tự động. Hãy nhấn nút phát để tiếp tục.');
    }
  }, []);

  const applyReadyAsset = useCallback(async (asset: TtsAudioAssetResponse, token: number) => {
    if (token !== requestTokenRef.current) return;
    if (!asset.audioUrl) {
      setStatus('error');
      setErrorMessage('Tài nguyên âm thanh đã sẵn sàng nhưng thiếu URL phát.');
      return;
    }

    const audio = audioRef.current;
    if (!audio) return;
    if (sourceUrlRef.current !== asset.audioUrl) {
      audio.pause();
      audio.src = asset.audioUrl;
      audio.preload = 'auto';
      audio.playbackRate = speed;
      audio.volume = volume;
      audio.load();
      sourceUrlRef.current = asset.audioUrl;
      setHasAudioSource(true);
      setCurrentTime(0);
      setProgress(0);
    }
    if (asset.durationMs && asset.durationMs > 0) {
      setDuration(asset.durationMs / 1000);
    }
    setAssetMessage(asset.cacheHit ? 'Đang phát bản tường thuật đã lưu.' : 'Âm thanh đã sẵn sàng.');
    setStatus('ready');
    await playCurrentAudio();
  }, [playCurrentAudio, speed, volume]);

  const failAsset = useCallback((asset: TtsAudioAssetResponse) => {
    const retryHint = asset.retryEligible && asset.retryAfterSeconds
      ? ` Có thể thử lại sau ${asset.retryAfterSeconds} giây.`
      : '';
    setStatus('error');
    setErrorMessage((asset.message || 'Không thể tạo âm thanh tường thuật.') + retryHint);
  }, []);

  const requestAsset = useCallback(async () => {
    if (requestInFlightRef.current) return;

    cancelInFlight();
    const token = requestTokenRef.current;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    requestInFlightRef.current = true;
    setStatus('generating');
    setErrorMessage('');
    setAssetMessage('Đang chuẩn bị âm thanh tường thuật...');

    const schedulePoll = (assetId: string, startedAt: number, retryAfterSeconds?: number | null) => {
      const delayMs = Math.max(
        DEFAULT_POLL_INTERVAL_MS,
        (retryAfterSeconds ?? 0) * 1000,
      );
      pollTimerRef.current = setTimeout(async () => {
        if (token !== requestTokenRef.current || controller.signal.aborted) return;
        if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
          requestInFlightRef.current = false;
          setStatus('error');
          setErrorMessage('Quá thời gian chờ tạo âm thanh. Vui lòng thử lại sau.');
          return;
        }

        try {
          const asset = await getTtsAudioAsset(assetId, controller.signal);
          if (token !== requestTokenRef.current) return;
          if (asset.status === 'ready') {
            requestInFlightRef.current = false;
            await applyReadyAsset(asset, token);
            return;
          }
          if (asset.status === 'failed') {
            requestInFlightRef.current = false;
            failAsset(asset);
            return;
          }
          if (isTtsAudioAssetPending(asset.status)) {
            setAssetMessage(asset.stale
              ? 'Yêu cầu đang được khôi phục. Vui lòng đợi thêm một lát.'
              : (asset.message || 'Đang tạo âm thanh tường thuật...'));
            schedulePoll(asset.assetId, startedAt, asset.retryAfterSeconds);
            return;
          }
          requestInFlightRef.current = false;
          setStatus('error');
          setErrorMessage('Trạng thái âm thanh không được hỗ trợ.');
        } catch (error) {
          if (isAbortError(error) || token !== requestTokenRef.current) return;
          schedulePoll(assetId, startedAt);
        }
      }, delayMs);
    };

    try {
      const asset = await requestTtsAudioAsset(event.id, appliedVoice, controller.signal);
      if (token !== requestTokenRef.current) return;
      if (asset.status === 'ready') {
        requestInFlightRef.current = false;
        await applyReadyAsset(asset, token);
        return;
      }
      if (asset.status === 'failed') {
        requestInFlightRef.current = false;
        failAsset(asset);
        return;
      }
      if (isTtsAudioAssetPending(asset.status)) {
        setAssetMessage(asset.stale
          ? 'Yêu cầu đang được khôi phục. Vui lòng đợi thêm một lát.'
          : (asset.message || 'Đang tạo âm thanh tường thuật...'));
        schedulePoll(asset.assetId, Date.now(), asset.retryAfterSeconds);
        return;
      }
      requestInFlightRef.current = false;
      setStatus('error');
      setErrorMessage('Trạng thái âm thanh không được hỗ trợ.');
    } catch (error) {
      if (isAbortError(error) || token !== requestTokenRef.current) return;
      requestInFlightRef.current = false;
      if (error instanceof ApiRequestError && error.code === 'TTS_ASSET_FLOW_DISABLED') {
        onAssetFlowDisabled();
        return;
      }
      setStatus('error');
      setErrorMessage(error instanceof Error
        ? error.message
        : 'Không thể kết nối đến máy chủ tạo âm thanh.');
    }
  }, [appliedVoice, applyReadyAsset, cancelInFlight, event.id, failAsset, onAssetFlowDisabled]);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'auto';
    audioRef.current = audio;
    audio.onloadedmetadata = () => {
      if (Number.isFinite(audio.duration)) setDuration(audio.duration);
    };
    audio.ontimeupdate = () => {
      setCurrentTime(audio.currentTime);
      if (audio.duration > 0 && Number.isFinite(audio.duration)) {
        setProgress(Math.min(100, Math.max(0, (audio.currentTime / audio.duration) * 100)));
      }
    };
    audio.onended = () => {
      setProgress(100);
      setStatus('completed');
    };
    audio.onerror = () => {
      if (sourceUrlRef.current) {
        setStatus('error');
        setErrorMessage('Không thể phát URL âm thanh. Vui lòng thử lại.');
      }
    };

    return () => {
      cancelInFlight();
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audioRef.current = null;
      sourceUrlRef.current = null;
      setHasAudioSource(false);
    };
  }, [cancelInFlight]);

  useEffect(() => {
    fetchVoices()
      .then((availableVoices) => {
        setVoices(availableVoices);
        if (availableVoices.some((voice) => voice.code === DEFAULT_VOICE)) return;
        const firstVoice = availableVoices[0]?.code;
        if (firstVoice) {
          setAppliedVoice(firstVoice);
          setDraftVoice(firstVoice);
        }
      })
      .catch(() => {
        // The backend validates the default voice. A transient voice-list error
        // must not block an otherwise valid cached asset request.
      });
  }, []);

  useEffect(() => {
    onNarrationStateChange?.({ isPlaying: status === 'playing', progress });
  }, [onNarrationStateChange, progress, status]);

  const handlePrimaryAction = useCallback(() => {
    const audio = audioRef.current;
    if (status === 'playing') {
      audio?.pause();
      setStatus('paused');
      return;
    }
    if (sourceUrlRef.current && audio) {
      if (status === 'completed') {
        audio.currentTime = 0;
        setProgress(0);
      }
      void playCurrentAudio();
      return;
    }
    void requestAsset();
  }, [playCurrentAudio, requestAsset, status]);

  const handleStop = useCallback(() => {
    cancelInFlight();
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setCurrentTime(0);
    setProgress(0);
    setStatus('idle');
    setAssetMessage('');
  }, [cancelInFlight]);

  const handleReplay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !sourceUrlRef.current) return;
    audio.currentTime = 0;
    setCurrentTime(0);
    setProgress(0);
    void playCurrentAudio();
  }, [playCurrentAudio]);

  const handleSeek = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    const targetTime = (Number(event.target.value) / 1000) * audio.duration;
    audio.currentTime = targetTime;
    setCurrentTime(targetTime);
    setProgress((targetTime / audio.duration) * 100);

    // An ended media element remains in the completed state. Seeking it must
    // make the same source resumable instead of requiring a new TTS request.
    if (status === 'completed') {
      setStatus('paused');
    }
    void playCurrentAudio();
  }, [playCurrentAudio, status]);

  const handleSpeedChange = useCallback((newSpeed: number) => {
    setSpeed(newSpeed);
    if (audioRef.current) audioRef.current.playbackRate = newSpeed;
  }, []);

  const handleVolumeChange = useCallback((newVolume: number) => {
    setVolume(newVolume);
    if (audioRef.current) audioRef.current.volume = newVolume;
  }, []);

  const handleApplyVoice = useCallback(() => {
    if (draftVoice === appliedVoice) {
      setShowSettings(false);
      return;
    }
    cancelInFlight();
    clearAudioSource();
    setAppliedVoice(draftVoice);
    setStatus('idle');
    setProgress(0);
    setCurrentTime(0);
    setDuration(0);
    setErrorMessage('');
    setAssetMessage('');
    setShowSettings(false);
  }, [appliedVoice, cancelInFlight, clearAudioSource, draftVoice]);

  const isWorking = status === 'generating' || status === 'ready';
  const isPlaying = status === 'playing';
  const isPaused = status === 'paused';
  const isCompleted = status === 'completed';
  const isError = status === 'error';
  const seekValue = duration > 0 ? Math.round((currentTime / duration) * 1000) : 0;
  const buttonLabel = isWorking ? 'Đang tạo giọng đọc' : isPlaying ? 'Tạm dừng' : isPaused ? 'Tiếp tục' : isCompleted ? 'Nghe lại' : 'Nghe tường thuật';
  const statusText = isWorking
    ? assetMessage || 'Đang tạo giọng đọc...'
    : isPlaying ? 'Đang phát tường thuật'
      : isPaused ? 'Đã tạm dừng'
        : isCompleted ? 'Đã phát xong'
          : isError ? 'Lỗi tường thuật'
            : 'Sẵn sàng';

  return (
    <div
      className="p-5 rounded-2xl"
      role="region"
      aria-label="Trình phát tường thuật"
      style={{
        background: 'linear-gradient(135deg, var(--accent-soft), transparent 60%), var(--bg-card)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow)',
      }}
    >
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={handlePrimaryAction}
          disabled={isWorking}
          aria-label={buttonLabel}
          aria-busy={isWorking}
          className="flex-shrink-0 w-14 h-14 rounded-full flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: 'var(--accent)', color: '#fff', boxShadow: '0 8px 22px -8px var(--accent)' }}
        >
          {isWorking ? <LoaderCircle size={22} className="animate-spin" aria-hidden="true" />
            : isPlaying ? <Pause size={22} fill="currentColor" aria-hidden="true" />
              : isCompleted ? <RotateCcw size={22} aria-hidden="true" />
                : <Play size={22} fill="currentColor" aria-hidden="true" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] font-sans" style={{ color: 'var(--text-muted)' }}>
                Tường thuật
              </div>
              <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{statusText}</div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {isCompleted && (
                <button type="button" onClick={handleReplay} aria-label="Nghe lại từ đầu" className="w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{ background: 'var(--accent-soft)', border: '1px solid var(--border)', color: 'var(--accent)' }}>
                  <RotateCcw size={15} aria-hidden="true" />
                </button>
              )}
              {(isPlaying || isPaused || isWorking) && (
                <button type="button" onClick={handleStop} aria-label="Dừng" className="w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--danger)' }}>
                  <Square size={14} fill="currentColor" aria-hidden="true" />
                </button>
              )}
              <button type="button" onClick={() => setShowSettings((current) => !current)} aria-label="Cài đặt" aria-expanded={showSettings}
                className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ background: showSettings ? 'var(--accent-soft)' : 'var(--bg-surface)', border: '1px solid var(--border)', color: showSettings ? 'var(--accent)' : 'var(--text-secondary)' }}>
                <Settings2 size={16} aria-hidden="true" />
              </button>
            </div>
          </div>

          {(hasAudioSource || isWorking) && (
            <div className="mt-2">
              <input
                type="range"
                min={0}
                max={1000}
                value={isWorking ? 0 : seekValue}
                disabled={!hasAudioSource || duration <= 0}
                onChange={handleSeek}
                aria-label="Tìm kiếm tường thuật"
                className="w-full accent-[var(--accent)] disabled:opacity-50"
              />
              <div className="tts-time flex items-center justify-between mt-1 font-sans text-[11px]" style={{ color: 'var(--text-muted)' }}>
                <span>{formatTime(currentTime)}</span>
                <span>{duration > 0 ? `-${formatTime(Math.max(0, duration - currentTime))}` : '--:--'}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {isError && errorMessage && (
        <div className="mt-3 px-4 py-3 rounded-xl text-sm flex items-start gap-2" role="alert"
          style={{ background: 'var(--danger-soft)', border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)', color: 'var(--text-primary)' }}>
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--danger)' }} aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      )}

      {showSettings && (
        <div className="mt-4 pt-4 grid grid-cols-1 md:grid-cols-3 gap-3" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="flex flex-col gap-2">
            <SelectField label="Giọng đọc" value={draftVoice} onChange={setDraftVoice}>
              {voices.length === 0 && <option value={DEFAULT_VOICE}>{DEFAULT_VOICE}</option>}
              {voices.map((voice) => <option key={voice.code} value={voice.code}>{voice.name} ({voice.region}) - {voice.gender}</option>)}
            </SelectField>
            <button type="button" onClick={handleApplyVoice} disabled={draftVoice === appliedVoice}
              className="px-3 py-2 rounded-lg text-xs font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'var(--accent)', color: '#fff' }}>
              Áp dụng
            </button>
          </div>
          <SelectField label="Tốc độ" value={String(speed)} onChange={(value) => handleSpeedChange(Number(value))}>
            {SPEED_OPTIONS.map((option) => <option key={option} value={String(option)}>{option}x</option>)}
          </SelectField>
          <SelectField label="Âm lượng" value={String(Math.round(volume * 100))} onChange={(value) => handleVolumeChange(Number(value) / 100)}>
            <option value="0">0% (Tắt tiếng)</option>
            <option value="25">25%</option>
            <option value="50">50%</option>
            <option value="75">75%</option>
            <option value="100">100%</option>
          </SelectField>
        </div>
      )}
    </div>
  );
}

function SelectField({ label, value, onChange, children }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.16em] font-sans" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}
        className="px-3 py-2 rounded-lg text-sm outline-none transition"
        style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--input-text)' }}>
        {children}
      </select>
    </label>
  );
}
