import { useState, useEffect, useRef } from 'react';
import type { MockEventDetail } from '../../data/mockEventDetails';

interface EventTTSPlayerProps {
  event: MockEventDetail;
}

type TTSStatus = 'idle' | 'playing' | 'paused';

/**
 * TTS player – thanh ngang gọn với nút tròn play, settings menu thả xuống.
 * Hiện đang dùng Web Speech API; sẽ thay bằng FPT.AI khi backend sẵn sàng.
 */
export default function EventTTSPlayer({ event }: EventTTSPlayerProps) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>('');
  const [rate, setRate] = useState<number>(1);
  const [status, setStatus] = useState<TTSStatus>('idle');
  const [hasVnVoice, setHasVnVoice] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  const chunksRef = useRef<string[]>([]);
  const currentChunkIndexRef = useRef(0);
  const isPlayingRef = useRef(false);

  /* ───── Load voices + chunks ───── */
  useEffect(() => {
    const synth = window.speechSynthesis;

    const loadVoices = () => {
      const available = synth.getVoices();
      if (available.length === 0) return;
      setVoices(available);
      const vn = available.filter(
        (v) => v.lang.startsWith('vi') || v.lang.startsWith('vi-VN'),
      );
      if (vn.length > 0) {
        setSelectedVoiceURI(vn[0].voiceURI);
        setHasVnVoice(true);
      } else {
        setSelectedVoiceURI(available[0].voiceURI);
        setHasVnVoice(false);
      }
    };

    synth.onvoiceschanged = loadVoices;
    loadVoices();

    const rawText = [
      event.titles.primary,
      event.chronology.displayDate,
      event.summary.homepageSummary,
      event.textbookContent.canonicalSummary,
      event.textbookContent.detailedNarrative || '',
      event.textbookContent.significance || '',
      ...(event.textbookContent.keyFacts || []),
    ].join('. \n ');

    const rawChunks = rawText.match(/[^.!?]+[.!?]*|./g) || [rawText];
    const grouped: string[] = [];
    let current = '';
    for (const piece of rawChunks) {
      if (current.length + piece.length > 150) {
        if (current) grouped.push(current);
        current = piece;
      } else {
        current += piece;
      }
    }
    if (current) grouped.push(current);
    chunksRef.current = grouped.map((c) => c.trim()).filter(Boolean);

    return () => stopSpeak();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);

  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
      isPlayingRef.current = false;
    };
  }, [event]);

  /* ───── Player controls ───── */
  const speakChunk = (index: number) => {
    const synth = window.speechSynthesis;
    if (index >= chunksRef.current.length) {
      setStatus('idle');
      isPlayingRef.current = false;
      return;
    }

    const utterance = new SpeechSynthesisUtterance(chunksRef.current[index]);
    if (selectedVoiceURI) {
      const voice = voices.find((v) => v.voiceURI === selectedVoiceURI);
      if (voice) utterance.voice = voice;
    }
    utterance.rate = rate;
    utterance.onend = () => {
      if (isPlayingRef.current) {
        currentChunkIndexRef.current += 1;
        speakChunk(currentChunkIndexRef.current);
      }
    };
    utterance.onerror = (e) => {
      if (e.error !== 'canceled') {
        console.error('TTS error', e);
        setStatus('idle');
        isPlayingRef.current = false;
      }
    };
    synth.speak(utterance);
    setStatus('playing');
  };

  const playSpeak = () => {
    const synth = window.speechSynthesis;
    if (status === 'paused') {
      synth.resume();
      setStatus('playing');
      return;
    }
    synth.cancel();
    isPlayingRef.current = true;
    if (status === 'idle') currentChunkIndexRef.current = 0;
    speakChunk(currentChunkIndexRef.current);
  };

  const pauseSpeak = () => {
    if (status === 'playing') {
      window.speechSynthesis.pause();
      setStatus('paused');
    }
  };

  const stopSpeak = () => {
    window.speechSynthesis.cancel();
    isPlayingRef.current = false;
    currentChunkIndexRef.current = 0;
    setStatus('idle');
  };

  const handleRateChange = (newRate: number) => {
    setRate(newRate);
    if (status === 'playing') {
      stopSpeak();
      setTimeout(playSpeak, 100);
    }
  };

  const handleVoiceChange = (uri: string) => {
    setSelectedVoiceURI(uri);
    if (status === 'playing') {
      stopSpeak();
      setTimeout(playSpeak, 100);
    }
  };

  const isPlaying = status === 'playing';
  const totalChunks = chunksRef.current.length;
  const progressPct =
    totalChunks > 0 ? (currentChunkIndexRef.current / totalChunks) * 100 : 0;

  return (
    <div
      className="p-5 rounded-2xl"
      style={{
        background:
          'linear-gradient(135deg, var(--accent-soft), transparent 60%), var(--bg-card)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow)',
      }}
    >
      <div className="flex items-center gap-4">
        {/* Big circular play button */}
        <button
          onClick={isPlaying ? pauseSpeak : playSpeak}
          aria-label={isPlaying ? 'Tạm dừng' : 'Nghe nội dung sự kiện'}
          className="flex-shrink-0 w-14 h-14 rounded-full flex items-center justify-center transition relative"
          style={{
            background: 'var(--accent)',
            color: '#fff',
            boxShadow: '0 8px 22px -8px var(--accent)',
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.transform =
              'scale(1.05)')
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.transform = 'none')
          }
        >
          {isPlaying ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="6,4 20,12 6,20" />
            </svg>
          )}
          {isPlaying && (
            <span
              aria-hidden
              className="absolute inset-0 rounded-full animate-pulse-glow pointer-events-none"
            />
          )}
        </button>

        {/* Info + progress */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div>
              <div
                className="text-[10px] font-bold uppercase tracking-[0.16em]"
                style={{ color: 'var(--text-muted)' }}
              >
                Nghe nội dung sự kiện
              </div>
              <div
                className="text-sm font-semibold truncate"
                style={{ color: 'var(--text-primary)' }}
              >
                {statusLabel(status)}
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {status !== 'idle' && (
                <button
                  onClick={stopSpeak}
                  aria-label="Dừng"
                  className="w-9 h-9 rounded-lg flex items-center justify-center transition"
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--danger)',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="1" />
                  </svg>
                </button>
              )}
              <button
                onClick={() => setShowSettings((v) => !v)}
                aria-label="Cài đặt giọng đọc"
                className="w-9 h-9 rounded-lg flex items-center justify-center transition"
                style={{
                  background: showSettings ? 'var(--accent-soft)' : 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  color: showSettings ? 'var(--accent)' : 'var(--text-secondary)',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                </svg>
              </button>
            </div>
          </div>
          {/* Progress bar */}
          <div
            className="w-full h-1.5 rounded-full overflow-hidden"
            style={{ background: 'var(--bg-surface)' }}
          >
            <div
              className="h-full transition-[width]"
              style={{
                width: `${progressPct}%`,
                background:
                  'linear-gradient(to right, var(--accent), var(--admin-accent))',
              }}
            />
          </div>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div
          className="mt-4 pt-4 grid grid-cols-1 md:grid-cols-2 gap-3"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <SelectField label="Tốc độ" value={String(rate)} onChange={(v) => handleRateChange(Number(v))}>
            <option value="0.75">0.75x</option>
            <option value="1">1.0x (Bình thường)</option>
            <option value="1.25">1.25x</option>
            <option value="1.5">1.5x</option>
          </SelectField>
          <SelectField label="Giọng đọc" value={selectedVoiceURI} onChange={handleVoiceChange}>
            {voices.length === 0 && <option>Đang tải giọng…</option>}
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
              </option>
            ))}
          </SelectField>
          {!hasVnVoice && (
            <div
              className="md:col-span-2 text-xs px-3 py-2 rounded-lg"
              style={{
                background: 'var(--warning-soft)',
                border: '1px solid color-mix(in srgb, var(--warning) 35%, transparent)',
                color: 'var(--text-primary)',
              }}
            >
              Trình duyệt chưa có giọng tiếng Việt. Sẽ đọc bằng giọng mặc định.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span
        className="text-[10px] font-bold uppercase tracking-[0.16em]"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-2 rounded-lg text-sm outline-none transition"
        style={{
          background: 'var(--input-bg)',
          border: '1px solid var(--input-border)',
          color: 'var(--input-text)',
        }}
      >
        {children}
      </select>
    </label>
  );
}

function statusLabel(s: TTSStatus) {
  switch (s) {
    case 'playing':
      return 'Đang đọc nội dung sự kiện…';
    case 'paused':
      return 'Đã tạm dừng';
    default:
      return 'Nhấn nút để bắt đầu nghe';
  }
}
