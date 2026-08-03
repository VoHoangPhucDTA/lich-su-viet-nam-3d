import { Hourglass } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

interface QuizGenerationLoadingProps {
  questionCount: number;
  onStopWaiting: () => void;
}

export default function QuizGenerationLoading({ questionCount, onStopWaiting }: QuizGenerationLoadingProps) {
  const titleId = useId();
  const descriptionId = useId();
  const stopButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const openedAt = performance.now();
    const frameId = window.requestAnimationFrame(() => stopButtonRef.current?.focus());
    const intervalId = window.setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((performance.now() - openedAt) / 1000)));
    }, 1000);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearInterval(intervalId);
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus();
    };
  }, []);

  return (
    <div className="quiz-loading-overlay">
      <section
        className="quiz-loading-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <span className="quiz-loading-icon quiz-loading-hourglass">
          <Hourglass size={28} aria-hidden="true" />
        </span>
        <h2 id={titleId} className="app-heading">Đang tạo {questionCount} câu hỏi từ nguồn SGK…</h2>
        <p id={descriptionId} role="status" aria-live="polite">Quá trình có thể mất một chút thời gian.</p>
        <p className="quiz-loading-elapsed" aria-live="off">Đã chờ {elapsedSeconds} giây</p>
        <button
          ref={stopButtonRef}
          type="button"
          className="public-secondary-button mt-4"
          onClick={onStopWaiting}
        >
          Dừng chờ
        </button>
      </section>
    </div>
  );
}
