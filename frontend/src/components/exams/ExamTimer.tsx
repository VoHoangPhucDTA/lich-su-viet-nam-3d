import { useState, useEffect, useRef } from 'react';

interface ExamTimerProps {
  initialSeconds: number;
  onTimeUp: () => void;
  onTick: (secondsRemain: number) => void;
}

export default function ExamTimer({ initialSeconds, onTimeUp, onTick }: ExamTimerProps) {
  const [seconds, setSeconds] = useState(initialSeconds);
  const timeUpRan = useRef(false);

  useEffect(() => {
    // If we start at 0 or less, auto-run completion.
    if (initialSeconds <= 0 && !timeUpRan.current) {
        timeUpRan.current = true;
        onTimeUp();
        return;
    }

    const timerId = setInterval(() => {
      setSeconds(prev => {
        const next = prev - 1;
        if (next <= 0) {
          clearInterval(timerId);
          if (!timeUpRan.current) {
             timeUpRan.current = true;
             onTimeUp();
          }
          return 0;
        }
        onTick(next);
        return next;
      });
    }, 1000);

    return () => clearInterval(timerId);
  }, [initialSeconds, onTimeUp, onTick]);

  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  
  const isWarning = seconds <= 300 && seconds > 0; // Less than 5 mins (300 sec)
  const isCritical = seconds <= 60 && seconds > 0; // Less than 1 min (60 sec)

  const color = isCritical ? '#9f1d2d' : isWarning ? '#c29b4b' : '#2f7a57';
  const bg = isCritical ? 'rgba(159,29,45,0.12)' : isWarning ? 'rgba(194,155,75,0.15)' : 'rgba(47,122,87,0.12)';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.8rem', background: bg, border: `1px solid ${color}40`, borderRadius: '0.5rem', color: color, fontWeight: 700, fontSize: '0.95rem' }}>
       <span>⏱️</span>
       <span style={{ fontVariantNumeric: 'tabular-nums' }}>
           {m.toString().padStart(2, '0')}:{s.toString().padStart(2, '0')}
       </span>
    </div>
  );
}
