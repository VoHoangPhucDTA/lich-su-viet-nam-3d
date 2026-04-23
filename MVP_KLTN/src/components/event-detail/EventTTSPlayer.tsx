import { useState, useEffect, useRef } from 'react';
import type { MockEventDetail } from '../../data/mockEventDetails';

interface EventTTSPlayerProps {
  event: MockEventDetail;
}

type TTSStatus = 'Sẵn sàng' | 'Đang đọc' | 'Đã tạm dừng' | 'Đã dừng';

export default function EventTTSPlayer({ event }: EventTTSPlayerProps) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>('');
  const [rate, setRate] = useState<number>(1);
  const [status, setStatus] = useState<TTSStatus>('Sẵn sàng');
  const [hasVnVoice, setHasVnVoice] = useState(true);

  // We maintain an array of utterance texts for chunking
  const chunksRef = useRef<string[]>([]);
  const currentChunkIndexRef = useRef(0);
  const isPlayingRef = useRef(false);

  useEffect(() => {
    const synth = window.speechSynthesis;
    
    const loadVoices = () => {
      const availableVoices = synth.getVoices();
      if (availableVoices.length === 0) return;
      
      setVoices(availableVoices);
      const vnVoices = availableVoices.filter(v => v.lang.startsWith('vi') || v.lang.startsWith('vi-VN'));
      if (vnVoices.length > 0) {
        setSelectedVoiceURI(vnVoices[0].voiceURI);
        setHasVnVoice(true);
      } else {
        setSelectedVoiceURI(availableVoices[0].voiceURI);
        setHasVnVoice(false);
      }
    };

    // Chrome and Safari async voices load
    synth.onvoiceschanged = loadVoices;
    loadVoices();

    // Prepare content chunks (Splitting by dot or newlines simply)
    const rawText = [
      event.titles.primary,
      event.chronology.displayDate,
      event.summary.homepageSummary,
      event.textbookContent.canonicalSummary,
      event.textbookContent.detailedNarrative || '',
      event.textbookContent.significance || '',
      ...(event.textbookContent.keyFacts || [])
    ].join('. \n ');

    // very basic sentence split to avoid 15-sec limitation on some browsers
    const rawChunks = rawText.match(/[^.!?]+[.!?]*|./g) || [rawText];
    const groupedChunks: string[] = [];
    let current = '';
    for (const piece of rawChunks) {
      if (current.length + piece.length > 150) {
        if (current) groupedChunks.push(current);
        current = piece;
      } else {
        current += piece;
      }
    }
    if (current) groupedChunks.push(current);

    chunksRef.current = groupedChunks.map(c => c.trim()).filter(Boolean);

    return () => {
      stop();
    };
  }, [event]);

  useEffect(() => {
    // If the component is explicitly stopped or paused from outside (if we implement global store), handle it.
    // Cleanup on unmount or when event changes:
    return () => {
      window.speechSynthesis.cancel();
      isPlayingRef.current = false;
    };
  }, [event]);

  const speakChunk = (index: number) => {
    const synth = window.speechSynthesis;
    if (index >= chunksRef.current.length) {
      setStatus('Sẵn sàng');
      isPlayingRef.current = false;
      return;
    }

    const text = chunksRef.current[index];
    const utterance = new SpeechSynthesisUtterance(text);
    
    if (selectedVoiceURI) {
      const voice = voices.find(v => v.voiceURI === selectedVoiceURI);
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
        console.error('Speech synthesis error', e);
        setStatus('Sẵn sàng');
        isPlayingRef.current = false;
      }
    };

    synth.speak(utterance);
    setStatus('Đang đọc');
  };

  const play = () => {
    const synth = window.speechSynthesis;
    if (status === 'Đã tạm dừng' && isPlayingRef.current) {
      synth.resume();
      setStatus('Đang đọc');
    } else {
      synth.cancel();
      isPlayingRef.current = true;
      if (status === 'Sẵn sàng' || status === 'Đã dừng') {
        currentChunkIndexRef.current = 0;
      }
      speakChunk(currentChunkIndexRef.current);
    }
  };

  const pause = () => {
    if (status === 'Đang đọc') {
      window.speechSynthesis.pause();
      setStatus('Đã tạm dừng');
    }
  };

  const stop = () => {
    window.speechSynthesis.cancel();
    isPlayingRef.current = false;
    currentChunkIndexRef.current = 0;
    setStatus('Đã dừng');
  };

  const handleRateChange = (newRate: number) => {
    setRate(newRate);
    if (status === 'Đang đọc') {
      stop();
      setTimeout(() => play(), 100);
    }
  };

  const handleVoiceChange = (uri: string) => {
    setSelectedVoiceURI(uri);
    if (status === 'Đang đọc') {
      stop();
      setTimeout(() => play(), 100);
    }
  };

  return (
    <div className="bg-card border border-default rounded-2xl p-6 shadow-theme">
      <h3 className="text-xl font-bold text-primary mb-4 flex items-center gap-2">
        <span className="text-2xl">🎧</span> Nghe nội dung sự kiện
      </h3>
      
      {!hasVnVoice && (
        <div className="mb-4 text-xs font-medium p-3 rounded-lg border" style={{ background: 'color-mix(in srgb, var(--warning) 12%, transparent)', color: 'var(--text-primary)', borderColor: 'color-mix(in srgb, var(--warning) 35%, transparent)' }}>
          Trình duyệt của bạn có thể không hỗ trợ giọng tiếng Việt. Nội dung sẽ được đọc bằng giọng mặc định.
        </div>
      )}

      <div className="flex flex-col gap-4">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {status !== 'Đang đọc' ? (
            <button onClick={play} className="flex items-center gap-2 px-4 py-2 text-white rounded-lg font-semibold transition" style={{ background: 'var(--accent)' }} title="Nghe">
              ▶ Nghe
            </button>
          ) : (
            <button onClick={pause} className="flex items-center gap-2 px-4 py-2 bg-surface border border-default text-primary rounded-lg font-semibold transition" title="Tạm dừng">
              ⏸ Tạm dừng
            </button>
          )}
          <button onClick={stop} className="flex items-center gap-2 px-4 py-2 text-white rounded-lg font-semibold transition" style={{ background: 'var(--danger)' }} title="Dừng">
            ⏹ Dừng
          </button>
          
          <div className="ml-auto text-sm text-muted font-medium">
            Trạng thái: <span className="accent-primary">{status}</span>
          </div>
        </div>

        {/* Settings */}
        <div className="flex flex-wrap gap-4 mt-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted font-bold uppercase tracking-wider">Tốc độ</label>
            <select 
              value={rate}
              onChange={(e) => handleRateChange(Number(e.target.value))}
              className="px-3 py-1.5 bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--input-text)] rounded-lg text-sm outline-none transition"
            >
              <option value={0.75}>0.75x</option>
              <option value={1}>1.0x (Bình thường)</option>
              <option value={1.25}>1.25x</option>
              <option value={1.5}>1.5x</option>
            </select>
          </div>

          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <label className="text-xs text-muted font-bold uppercase tracking-wider">Giọng đọc</label>
            <select
              value={selectedVoiceURI}
              onChange={(e) => handleVoiceChange(e.target.value)}
              className="px-3 py-1.5 bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--input-text)] rounded-lg text-sm outline-none transition"
              disabled={voices.length === 0}
            >
              {voices.length === 0 && <option>Đang tải giọng...</option>}
              {voices.map(v => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
