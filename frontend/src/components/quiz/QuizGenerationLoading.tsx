import { BrainCircuit, LoaderCircle } from 'lucide-react';

export default function QuizGenerationLoading({ onCancel }: { onCancel?: () => void }) {
  return (
    <div className="quiz-loading-overlay" role="status" aria-live="assertive">
      <div className="quiz-loading-dialog">
        <span className="quiz-loading-icon"><BrainCircuit size={26} aria-hidden="true" /></span>
        <LoaderCircle size={28} aria-hidden="true" className="animate-spin text-[var(--accent)]" />
        <h2 className="serif-heading">Đang tạo bài luyện tập</h2>
        <p>Tìm nguồn SGK lớp 10–12 và tạo câu hỏi có giải thích.</p>
        {onCancel && <button type="button" className="public-secondary-button mt-4" onClick={onCancel}>Hủy chờ</button>}
      </div>
    </div>
  );
}
