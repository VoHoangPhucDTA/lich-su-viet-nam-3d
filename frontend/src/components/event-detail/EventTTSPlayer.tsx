import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { MockEventDetail } from '../../data/mockEventDetails';
import { generateTts, pollTtsStatus, fetchVoices } from '../../services/ttsService';
import type { TtsPlaylistItem, TtsVoice } from '../../services/ttsService';
import { isTtsAssetPlayerEnabled } from '../../config/tts';
import AssetTTSPlayer from './AssetTTSPlayer';
import { buildNarrationContent } from './narrationContent';

interface EventTTSPlayerProps {
  event: MockEventDetail;
  /** Called whenever narration playback state changes. Used for cross-component sync. */
  onNarrationStateChange?: (state: { isPlaying: boolean; progress: number }) => void;
}

/**
 * Complete state machine for the narration player:
 *
 *   idle ──click──→ generating ──done──→ ready ──auto──→ playing ──end──→ completed ──click──→ idle (replay)
 *                                                          ↕ pause              ↕
 *                                                       paused ──resume──→ playing
 *                                                          ↓ stop
 *                                                        idle
 *   idle ──click──→ generating ──error──→ error ──retry──→ generating
 */
type PlayerStatus =
  | 'idle'
  | 'generating'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'completed'
  | 'error';

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5] as const;
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 120_000;

function LegacyTTSPlayer({ event, onNarrationStateChange }: EventTTSPlayerProps) {
  const [status, setStatus] = useState<PlayerStatus>('idle');
  const [playlist, setPlaylist] = useState<TtsPlaylistItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  // NOTE: initialized to -1 so that auto-play can transition to 0.
  // If initialized to 0, the auto-play effect (status='ready' → 'playing')
  // would set currentIndex(0) → same value → no change detected →
  // the chunk-playback useEffect never fires → audio never plays.
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [, setChunkLabel] = useState('');
  const [speed, setSpeed] = useState<number>(1);
  const [volume, setVolume] = useState(1);
  const [errorMessage, setErrorMessage] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [voices, setVoices] = useState<TtsVoice[]>([]);
  const [appliedVoice, setAppliedVoice] = useState<string>('');
  const [draftVoice, setDraftVoice] = useState<string>('');

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(0);
  const abortRef = useRef(false);
  const jobIdRef = useRef<string>('');
  const seekBarRef = useRef<HTMLDivElement | null>(null);

  // Stable refs to avoid stale closures in callbacks
  const chunkDurationsRef = useRef<number[]>([]);
  const cumulativeTimeBeforeRef = useRef<number>(0);
  const playlistRef = useRef<TtsPlaylistItem[]>(playlist);
  const currentIndexRef = useRef(currentIndex);
  const progressRef = useRef(progress);
  const isSeekingRef = useRef(false);
  /** Pending seek time to apply after playChunk loads new audio (cross-chunk seek). */
  const seekTargetRef = useRef<number | null>(null);
  /** Stable ref for duration so seekTo never captures a stale closure. */
  const durationRef = useRef<number>(0);
  const playlistCacheRef = useRef<Map<string, TtsPlaylistItem[]>>(new Map());

  // Keep refs in sync
  playlistRef.current = playlist;
  currentIndexRef.current = currentIndex;
  progressRef.current = progress;
  durationRef.current = duration;

  // Notify parent of narration state changes
  useEffect(() => {
    onNarrationStateChange?.({
      isPlaying: status === 'playing',
      progress,
    });
  }, [status, progress, onNarrationStateChange]);

  // Narration content built once per event
  const narrationText = useMemo(
    () => buildNarrationContent(event),
    [event]
  );

  // ── Fetch voices on mount ──────────────────────────────────────────────
  useEffect(() => {
    fetchVoices()
      .then((v) => {
        setVoices(v);
        if (v.length > 0) {
          setAppliedVoice((current) => current || v[0].code);
          setDraftVoice((current) => current || v[0].code);
        }
      })
      .catch(() => { /* silent */ });
  }, []);

  // ── Lifecycle cleanup ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      abortRef.current = true;
      stopPolling();
      destroyAudio();
      // Close AudioContext to prevent memory leak
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Unlock audio playback on user gesture.
   * Modern browsers block autoplay for audio not initiated by a user click.
   * We create an AudioContext and resume it immediately so that the browser
   * considers this page as having "user engagement with audio," allowing
   * subsequent async calls to audio.play() to work.
   *
   * Only needs to be called once per user interaction (idle/error/completed start).
   */
  const unlockAudio = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
    } catch {
      // AudioContext not available (e.g. older browser)
    }

    // Also create and prime the HTMLAudioElement so .play() works async
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const destroyAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
      audioRef.current.onended = null;
      audioRef.current.ontimeupdate = null;
      audioRef.current.onloadedmetadata = null;
      audioRef.current.onerror = null;
    }
  }, []);

  const resetState = useCallback(() => {
    destroyAudio();
    setPlaylist([]);
    setCurrentIndex(-1);
    setProgress(0);
    setCurrentTime(0);
    setDuration(0);
    setChunkLabel('');
    setErrorMessage('');
    chunkDurationsRef.current = [];
    cumulativeTimeBeforeRef.current = 0;
  }, [destroyAudio]);

  useEffect(() => {
    playlistCacheRef.current.clear();
    resetState();
    setStatus('idle');
  }, [event.id, resetState]);

  // ── Seek handling ───────────────────────────────────────────────────────
  /**
   * Seek to a position in the global timeline (fraction 0–1).
   *
   * Uses refs exclusively (durationRef, currentIndexRef, playlistRef,
   * chunkDurationsRef) so the callback never captures stale state values.
   * Stable identity — never recreated during playback.
   */
  const seekTo = useCallback((fraction: number) => {
    const pl = playlistRef.current;
    if (!audioRef.current || pl.length === 0 || fraction < 0 || fraction > 1) return;

    const knownDurations = chunkDurationsRef.current.filter((d): d is number => d !== undefined && d > 0);
    const averageChunkDuration = knownDurations.length > 0
      ? knownDurations.reduce((sum, d) => sum + d, 0) / knownDurations.length
      : durationRef.current / Math.max(pl.length, 1) || 1;
    const totalGlobalDuration = durationRef.current || averageChunkDuration * pl.length || 1;
    const targetGlobalTime = fraction * totalGlobalDuration;

    let accumulatedTime = 0;
    let targetChunk = 0;
    for (let i = 0; i < pl.length; i++) {
      const chunkDur = chunkDurationsRef.current[i] || averageChunkDuration;
      if (chunkDur !== undefined && chunkDur > 0) {
        if (accumulatedTime + chunkDur >= targetGlobalTime) {
          targetChunk = i;
          break;
        }
        accumulatedTime += chunkDur;
      } else {
        // Unknown duration — navigate to this chunk and seek to 0
        targetChunk = i;
        break;
      }
    }

    // Store target time in ref so playChunk can apply it after loading the chunk
    const chunkTargetTime = targetGlobalTime - accumulatedTime;
    seekTargetRef.current = Math.max(0, chunkTargetTime);
    setCurrentTime(Math.max(0, targetGlobalTime));
    setProgress(Math.min(100, Math.max(0, fraction * 100)));

    const idx = currentIndexRef.current;
    if (targetChunk !== idx) {
      cumulativeTimeBeforeRef.current = accumulatedTime;
      setCurrentIndex(targetChunk);
    } else if (audioRef.current) {
      // Same chunk — seek directly
      audioRef.current.currentTime = Math.max(0, Math.min(chunkTargetTime, audioRef.current.duration || 0));
      seekTargetRef.current = null;
    }
  }, []);

  /** Stores the most recent seek fraction during drag, applied only on release. */
  const pendingSeekFractionRef = useRef(0);

  const handleSeekStart = useCallback(() => {
    isSeekingRef.current = true;
  }, []);

  const handleSeekEnd = useCallback(() => {
    isSeekingRef.current = false;
    // Apply the final seek position on release (not on every onChange),
    // avoiding rapid chunk switches during drag that cause audio reloads.
    seekTo(pendingSeekFractionRef.current);
  }, [seekTo]);

  const handleSeekChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const fraction = Number(e.target.value) / 1000;
    pendingSeekFractionRef.current = fraction;
    // Update currentTime state directly for visual feedback during drag.
    // Do NOT touch audio.currentTime — setting a global time on a
    // chunk-local element would clamp to the chunk boundary and cause
    // inaccurate visual feedback. The real seek happens in handleSeekEnd.
    seekTo(fraction);
  }, [seekTo]);

  // ── Audio setup for a single chunk ─────────────────────────────────────
  const playChunk = useCallback((url: string, shouldPlay = true) => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    const audio = audioRef.current;
    audio.src = url;
    audio.preload = 'auto';
    audio.playbackRate = speed;
    audio.volume = volume;

    const startPlayback = () => {
      const p = audio.play();
      if (p) {
        p.catch((err) => {
          if (err.name === 'NotAllowedError') {
            setStatus('paused');
            setErrorMessage('Nhấn "Tiếp tục" để bắt đầu phát tường thuật.');
          } else {
            setStatus('error');
            setErrorMessage('Không thể phát âm thanh. Vui lòng thử lại.');
          }
        });
      }
    };

    audio.onloadedmetadata = () => {
      const idx = currentIndexRef.current;
      chunkDurationsRef.current[idx] = audio.duration;
      const knownDurations = chunkDurationsRef.current.filter((d): d is number => d !== undefined && d > 0);
      const totalKnown = knownDurations.reduce((sum, d) => sum + d, 0);
      if (totalKnown > 0) {
        const unknownCount = Math.max(0, playlistRef.current.length - knownDurations.length);
        const average = totalKnown / knownDurations.length;
        setDuration(totalKnown + unknownCount * average);
      }

      // Apply pending cross-chunk seek if any — MUST happen before play()
      // to avoid a brief "play from position 0" that sounds like repeating.
      const hasPendingSeek = seekTargetRef.current !== null && audio.duration > 0;
      if (hasPendingSeek) {
        audio.currentTime = Math.min(seekTargetRef.current!, audio.duration);
        seekTargetRef.current = null;
      }

      // For cross-chunk seeks, start playback only AFTER seek is applied.
      // When paused, load metadata and seek the real element without resuming.
      if (shouldPlay) startPlayback();
    };

    audio.ontimeupdate = () => {
      if (isSeekingRef.current) return; // Don't update while user is seeking

      const idx = currentIndexRef.current;
      const chunkTime = audio.currentTime;
      const cumulative = cumulativeTimeBeforeRef.current + chunkTime;
      setCurrentTime(cumulative);

      const pl = playlistRef.current;
      if (pl.length > 0 && audio.duration > 0) {
        const chunkWeight = 100 / pl.length;
        const globalPct = (idx * chunkWeight) + ((chunkTime / audio.duration) * chunkWeight);
        setProgress(Math.min(100, Math.max(0, globalPct)));
      }
    };

    audio.onended = () => {
      const idx = currentIndexRef.current;
      if (chunkDurationsRef.current[idx] !== undefined) {
        cumulativeTimeBeforeRef.current += chunkDurationsRef.current[idx];
      }

      const pl = playlistRef.current;
      if (idx < pl.length - 1) {
        setCurrentIndex((prev) => prev + 1);
      } else {
        setStatus('completed');
        setProgress(100);
      }
    };

    audio.onerror = () => {
      setStatus('error');
      setErrorMessage('Không thể phát nội dung tường thuật. Vui lòng thử lại.');
    };

    setChunkLabel(`Phần ${currentIndexRef.current + 1}/${playlistRef.current.length}`);
    // NOTE: audio.play() is now called inside onloadedmetadata (via startPlayback)
    // to ensure the seek target is applied before playback starts for cross-chunk seeks.
  }, [speed, volume]);

  // ── Derived state ──────────────────────────────────────────────────────
  const isPlaying = status === 'playing';
  const isGenerating = status === 'generating';
  const isPaused = status === 'paused';
  const isCompleted = status === 'completed';
  const isReady = status === 'ready';
  const isIdle = status === 'idle';
  const isError = status === 'error';
  const totalChunks = playlist.length;
  const currentLabel = currentIndex + 1;

  // Track playback progress for seek bar display (derived values, recalculated every render)
  const seekFraction = duration > 0 ? currentTime / duration : 0;
  const seekPercent = isPlaying || isPaused ? seekFraction * 100 : progress;
  const remainingTime = Math.max(0, duration - currentTime);

  // ── Play chunk on index change ────────────────────────────────────────
  useEffect(() => {
    if (status !== 'playing' && status !== 'ready' && status !== 'paused') return;
    if (playlist.length === 0) return;

    const item = playlist[currentIndex];
    if (!item) return;

    playChunk(item.url, status !== 'paused');

    // Preload next chunk for seamless transition
    if (currentIndex + 1 < playlist.length) {
      const nextUrl = playlist[currentIndex + 1].url;
      const nextLink = document.createElement('link');
      nextLink.rel = 'preload';
      nextLink.as = 'audio';
      nextLink.href = nextUrl;
      document.head.appendChild(nextLink);
      setTimeout(() => {
        try { document.head.removeChild(nextLink); } catch { /* already removed */ }
      }, 10000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  // ── Auto-play when status becomes 'ready' ──────────────────────────────
  useEffect(() => {
    if (status === 'ready' && playlist.length > 0) {
      setStatus('playing');
      setCurrentIndex(0);
    }
  }, [status, playlist]);

  // ── Generate narration ─────────────────────────────────────────────────
  const startGeneration = useCallback(async () => {
    abortRef.current = false;
    resetState();
    setStatus('generating');
    const voiceKey = appliedVoice || '__default__';
    const cachedPlaylist = playlistCacheRef.current.get(voiceKey);
    if (cachedPlaylist?.length) {
      setPlaylist(cachedPlaylist);
      setStatus('ready');
      return;
    }

    try {
      const response = await generateTts({
        eventId: event.id,
        text: narrationText,
        voice: appliedVoice || undefined,
        speed: 1.0,
      });

      if (abortRef.current) return;
      jobIdRef.current = response.jobId;

      if (response.status === 'done' && response.data) {
        playlistCacheRef.current.set(voiceKey, response.data.items);
        setPlaylist(response.data.items);
        setStatus('ready');
        return;
      }

      pollStartRef.current = Date.now();
      pollIntervalRef.current = setInterval(async () => {
        try {
          if (abortRef.current) { stopPolling(); return; }

          if (Date.now() - pollStartRef.current > POLL_TIMEOUT_MS) {
            stopPolling();
            setStatus('error');
            setErrorMessage('Quá thời gian chờ tạo giọng đọc. Vui lòng thử lại.');
            return;
          }

          const pollResponse = await pollTtsStatus(jobIdRef.current);
          if (abortRef.current) return;

          if (pollResponse.status === 'done' && pollResponse.data) {
            stopPolling();
            playlistCacheRef.current.set(voiceKey, pollResponse.data.items);
            setPlaylist(pollResponse.data.items);
            setStatus('ready');
          } else if (pollResponse.status === 'failed') {
            stopPolling();
            setStatus('error');
            setErrorMessage(pollResponse.errorMessage || 'Không thể tạo giọng đọc. Vui lòng thử lại.');
          }
        } catch { /* retry on next poll */ }
      }, POLL_INTERVAL_MS);
    } catch (err) {
      if (abortRef.current) return;
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Kết nối đến máy chủ thất bại. Vui lòng thử lại.');
    }
  }, [event.id, narrationText, appliedVoice, resetState, stopPolling]);

  // ── Controls ───────────────────────────────────────────────────────────
  const handlePlay = useCallback(() => {
    if (status === 'idle' || status === 'error') {
      // Unlock audio on user gesture so async .play() works later
      unlockAudio();
      setErrorMessage('');
      startGeneration();
      return;
    }
    if (status === 'completed') {
      unlockAudio();
      resetState();
      startGeneration();
      return;
    }
    if (status === 'paused' && audioRef.current) {
      audioRef.current.play().catch(() => {});
      setStatus('playing');
    }
  }, [status, startGeneration, resetState, unlockAudio]);

  const handlePause = useCallback(() => {
    if (audioRef.current && status === 'playing') {
      audioRef.current.pause();
      setStatus('paused');
    }
  }, [status]);

  const handleStop = useCallback(() => {
    abortRef.current = true;
    stopPolling();
    resetState();
    setStatus('idle');
  }, [stopPolling, resetState]);

  const handleReplay = useCallback(() => {
    abortRef.current = true;
    stopPolling();
    resetState();
    setTimeout(() => startGeneration(), 100);
  }, [stopPolling, resetState, startGeneration]);

  const handlePrevChunk = useCallback(() => {
    if (currentIndex > 0) {
      const newIndex = currentIndex - 1;
      cumulativeTimeBeforeRef.current -= chunkDurationsRef.current[newIndex] || 0;
      setCurrentIndex(newIndex);
    }
  }, [currentIndex]);

  const handleNextChunk = useCallback(() => {
    if (currentIndex < playlist.length - 1) {
      if (chunkDurationsRef.current[currentIndex] !== undefined) {
        cumulativeTimeBeforeRef.current += chunkDurationsRef.current[currentIndex];
      }
      setCurrentIndex((prev) => prev + 1);
    }
  }, [currentIndex, playlist.length]);

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
    abortRef.current = true;
    stopPolling();
    resetState();
    setAppliedVoice(draftVoice);
    setStatus('idle');
    setShowSettings(false);
  }, [appliedVoice, draftVoice, resetState, stopPolling]);

  const handleRetry = useCallback(() => {
    handleStop();
    setTimeout(() => startGeneration(), 300);
  }, [handleStop, startGeneration]);

  const buttonLabel = isIdle ? 'Nghe tường thuật'
    : isGenerating ? 'Đang tạo giọng đọc...'
    : isReady ? 'Đang chuẩn bị...'
    : isPlaying ? 'Tạm dừng'
    : isPaused ? 'Tiếp tục'
    : isCompleted ? 'Nghe lại'
    : 'Thử lại';

  const statusText = isGenerating ? 'Đang tạo giọng đọc...'
    : isReady ? 'Đã sẵn sàng, chuẩn bị phát...'
    : isPlaying ? `Phần ${currentLabel}/${totalChunks}`
    : isPaused ? 'Đã tạm dừng'
    : isCompleted ? 'Đã phát xong — nhấn Nghe lại để nghe tiếp'
    : isError ? 'Lỗi tường thuật'
    : 'Sẵn sàng';

  const formatTime = (seconds: number) => {
    if (!seconds || !isFinite(seconds)) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // ── Render ──────────────────────────────────────────────────────────────
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
        {/* Main action button */}
        <button
          onClick={isPlaying ? handlePause : handlePlay}
          disabled={isGenerating || isReady}
          aria-label={buttonLabel}
          aria-busy={isGenerating}
          className="flex-shrink-0 w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 relative disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: isCompleted ? 'linear-gradient(135deg, var(--accent), var(--admin-accent))' : 'var(--accent)',
            color: '#fff',
            boxShadow: '0 8px 22px -8px var(--accent)',
          }}
          onMouseEnter={(e) => {
            if (!isGenerating && !isReady) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.05)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'none';
          }}
        >
          {isGenerating ? (
            <svg className="animate-spin" width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.3" />
              <path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          ) : isPlaying ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : isCompleted ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M17.65 6.35A7.96 7.96 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <polygon points="6,4 20,12 6,20" />
            </svg>
          )}
          {isPlaying && (
            <span aria-hidden className="absolute inset-0 rounded-full animate-pulse-glow pointer-events-none" />
          )}
        </button>

        {/* Info + Progress */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div
                className="text-[10px] font-bold uppercase tracking-[0.16em] font-sans"
                style={{ color: 'var(--text-muted)' }}
              >
                Tường thuật
              </div>
              <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                {statusText}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {isError && (
                <button onClick={handleRetry} aria-label="Thử lại"
                  className="w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200"
                  style={{ background: 'var(--accent-soft)', border: '1px solid var(--border)', color: 'var(--accent)' }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-soft)')}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-soft)')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M1 4v6h6M23 20v-6h-6" /><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
                  </svg>
                </button>
              )}
              {isCompleted && (
                <button onClick={handleReplay} aria-label="Nghe lại từ đầu"
                  className="w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200"
                  style={{ background: 'var(--accent-soft)', border: '1px solid var(--border)', color: 'var(--accent)' }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-soft)')}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-soft)')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M17.65 6.35A7.96 7.96 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
                  </svg>
                </button>
              )}
              {(isPlaying || isPaused) && (
                <button onClick={handleStop} aria-label="Dừng"
                  className="w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200"
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--danger)' }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'var(--danger-soft)')}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-surface)')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <rect x="6" y="6" width="12" height="12" rx="1" />
                  </svg>
                </button>
              )}
              <button
                onClick={() => setShowSettings((v) => !v)}
                aria-label="Cài đặt" aria-expanded={showSettings}
                className="w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200"
                style={{
                  background: showSettings ? 'var(--accent-soft)' : 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  color: showSettings ? 'var(--accent)' : 'var(--text-secondary)',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Seekable timeline + time display */}
          {(isPlaying || isPaused || isGenerating || isReady) && (
            <div className="mt-2">
              {/* Seek bar */}
              <div
                ref={seekBarRef}
                className="relative w-full h-7 group cursor-pointer"
                role="slider"
                aria-label="Thanh tìm kiếm tường thuật"
                aria-valuenow={Math.round(seekFraction * 1000)}
                aria-valuemin={0}
                aria-valuemax={1000}
                tabIndex={0}
              >
                {/* Track background */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-full h-1.5 rounded-full overflow-hidden"
                  style={{ background: 'var(--bg-surface)' }}
                >
                  {/* Filled portion — use seekPercent for consistency with range input */}
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${isGenerating || isReady ? 5 : seekPercent}%`,
                      background: isGenerating
                        ? 'linear-gradient(90deg, var(--accent) 30%, transparent 70%)'
                        : 'linear-gradient(to right, var(--accent), var(--admin-accent))',
                      backgroundSize: isGenerating ? '200% 100%' : '100% 100%',
                      animation: isGenerating ? 'shimmer 1.5s ease-in-out infinite' : 'none',
                      transition: isSeekingRef.current ? 'none' : 'width 0.1s linear',
                    }}
                  />
                </div>

                {/* Hidden range input for accessibility + seek */}
                {(isPlaying || isPaused) && duration > 0 && (
                  <>
                    <input
                      type="range"
                      min={0}
                      max={1000}
                      value={Math.round(seekFraction * 1000)}
                      onChange={handleSeekChange}
                      onMouseDown={handleSeekStart}
                      onMouseUp={handleSeekEnd}
                      onTouchStart={handleSeekStart}
                      onTouchEnd={handleSeekEnd}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      aria-label="Tìm kiếm"
                    />
                    {/* Draggable thumb */}
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full shadow-md transition-opacity duration-200 opacity-0 group-hover:opacity-100 pointer-events-none"
                      style={{
                        left: `calc(${seekPercent}% - 8px)`,
                        background: 'var(--accent)',
                        boxShadow: '0 0 0 4px color-mix(in srgb, var(--accent) 20%, transparent)',
                      }}
                    />
                  </>
                )}
              </div>

              {/* Time display */}
              {(isPlaying || isPaused) && (
                <div className="tts-time flex items-center justify-between mt-1">
                  <span className="font-sans text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {formatTime(currentTime)}
                  </span>
                  <span className="font-sans text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    -{formatTime(remainingTime)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Completed progress bar */}
          {isCompleted && (
            <div className="mt-2">
              <div
                className="w-full h-1.5 rounded-full overflow-hidden"
                style={{ background: 'var(--bg-surface)' }}
                role="progressbar"
                aria-valuenow={100}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Hoàn thành"
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: '100%',
                    background: 'linear-gradient(to right, var(--accent), var(--admin-accent))',
                    opacity: 0.6,
                  }}
                />
              </div>
              <div className="tts-time flex items-center justify-between mt-1">
                <span className="font-sans text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {formatTime(duration)}
                </span>
                <span className="font-sans text-[11px]" style={{ color: 'var(--accent)' }}>
                  Đã phát xong
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Error message */}
      {isError && errorMessage && (
        <div
          className="mt-3 px-4 py-3 rounded-xl text-sm flex items-start gap-2"
          role="alert"
          style={{
            background: 'var(--danger-soft)',
            border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)',
            color: 'var(--text-primary)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 flex-shrink-0" style={{ color: 'var(--danger)' }} aria-hidden="true">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Settings panel */}
      {showSettings && (
        <div
          className="mt-4 pt-4 grid grid-cols-1 md:grid-cols-3 gap-3"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          {voices.length > 0 && (
            <div className="flex flex-col gap-2">
              <SelectField label="Giọng đọc" value={draftVoice} onChange={(v) => setDraftVoice(v)}>
                {voices.map((v) => (
                  <option key={v.code} value={v.code}>{v.name} ({v.region}) — {v.gender}</option>
                ))}
              </SelectField>
              <button
                type="button"
                onClick={handleApplyVoice}
                disabled={draftVoice === appliedVoice}
                className="px-3 py-2 rounded-lg text-xs font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: 'var(--accent)',
                  color: '#fff',
                }}
              >
                Áp dụng
              </button>
            </div>
          )}
          <SelectField label="Tốc độ" value={String(speed)} onChange={(v) => handleSpeedChange(Number(v))}>
            {SPEED_OPTIONS.map((s) => (<option key={s} value={String(s)}>{s}x</option>))}
          </SelectField>
          <SelectField label="Âm lượng" value={String(Math.round(volume * 100))} onChange={(v) => handleVolumeChange(Number(v) / 100)}>
            <option value="0">0% (Tắt tiếng)</option>
            <option value="25">25%</option>
            <option value="50">50%</option>
            <option value="75">75%</option>
            <option value="100">100%</option>
          </SelectField>
          {totalChunks > 1 && (isPlaying || isPaused) && (
            <div className="flex items-center gap-2 md:col-span-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] font-sans" style={{ color: 'var(--text-muted)' }}>
                Đoạn: {currentLabel}/{totalChunks}
              </span>
              <button onClick={handlePrevChunk} disabled={currentIndex <= 0}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 disabled:opacity-30"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                ← Trước
              </button>
              <button onClick={handleNextChunk} disabled={currentIndex >= totalChunks - 1}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 disabled:opacity-30"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                Sau →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Helper components ──────────────────────────────────────────────────── */
function SelectField({ label, value, onChange, children }: {
  label: string; value: string; onChange: (v: string) => void; children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.16em] font-sans" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="px-3 py-2 rounded-lg text-sm outline-none transition"
        style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--input-text)' }}>
        {children}
      </select>
    </label>
  );
}

/**
 * The legacy playlist player remains the default until the asset flow is
 * enabled. A disabled backend feature flag falls back only to this path.
 */
export default function EventTTSPlayer(props: EventTTSPlayerProps) {
  const [legacyFallbackEventId, setLegacyFallbackEventId] = useState<string | null>(null);
  const useLegacyFallback = legacyFallbackEventId === props.event.id;

  if (isTtsAssetPlayerEnabled && !useLegacyFallback) {
    return <AssetTTSPlayer key={props.event.id} {...props} onAssetFlowDisabled={() => setLegacyFallbackEventId(props.event.id)} />;
  }

  return <LegacyTTSPlayer {...props} />;
}
