import { useState, useEffect, useRef } from 'react';

interface ExamTimerProps {
  deadlineMs?: number;
  /** Kept for the V1 legacy session while V2 uses deadlineMs. */
  initialSeconds?: number;
  onTimeUp: () => void;
  onTick?: (secondsRemain: number) => void;
}

function getRemainingSeconds(deadlineMs: number): number {
  return Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
}

export default function ExamTimer({ deadlineMs, initialSeconds, onTimeUp, onTick }: ExamTimerProps) {
  const legacyDeadlineRef = useRef<number | null>(null);
  const resolvedDeadlineMs = deadlineMs ?? (legacyDeadlineRef.current ??= Date.now() + Math.max(0, initialSeconds ?? 0) * 1000);
  const [seconds, setSeconds] = useState(() => getRemainingSeconds(resolvedDeadlineMs));
  const timeUpRan = useRef(false);
  const onTimeUpRef = useRef(onTimeUp);
  const onTickRef = useRef(onTick);

  onTimeUpRef.current = onTimeUp;
  onTickRef.current = onTick;

  useEffect(() => {
    timeUpRan.current = false;

    const updateRemainingTime = () => {
      const remaining = getRemainingSeconds(resolvedDeadlineMs);
      setSeconds(remaining);
      onTickRef.current?.(remaining);
      if (remaining === 0 && !timeUpRan.current) {
        timeUpRan.current = true;
        onTimeUpRef.current();
      }
    };

    updateRemainingTime();
    const timerId = window.setInterval(updateRemainingTime, 1000);

    return () => window.clearInterval(timerId);
  }, [resolvedDeadlineMs]);

  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  
  const isWarning = seconds <= 300 && seconds > 0; // Less than 5 mins (300 sec)
  const isCritical = seconds <= 60 && seconds > 0; // Less than 1 min (60 sec)

  const color = isCritical ? 'var(--danger)' : isWarning ? 'var(--warning)' : 'var(--text-secondary)';
  const bg = isCritical ? 'rgba(159,29,45,0.12)' : isWarning ? 'rgba(194,155,75,0.15)' : 'var(--bg-surface)';
  const statusLabel = isCritical ? 'Sắp hết giờ' : isWarning ? 'Còn ít thời gian' : 'Thời gian còn lại';

  return (
    <div role="status" aria-live="polite" aria-label={`${statusLabel}: ${m} phút ${s} giây`} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.8rem', background: bg, border: `1px solid ${isCritical ? 'rgba(159,29,45,0.35)' : isWarning ? 'rgba(194,155,75,0.4)' : 'var(--border)'}`, borderRadius: '0.5rem', color, fontWeight: 700, fontSize: '0.95rem' }}>
       <span>⏱️</span>
       <span style={{ fontVariantNumeric: 'tabular-nums' }}>
           {m.toString().padStart(2, '0')}:{s.toString().padStart(2, '0')}
       </span>
    </div>
  );
}
