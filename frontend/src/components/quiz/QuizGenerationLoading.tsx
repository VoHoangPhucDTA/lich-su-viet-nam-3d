import { BrainCircuit, LoaderCircle } from 'lucide-react';

export default function QuizGenerationLoading() {
  return (
    <div className="quiz-loading-overlay" role="status" aria-live="assertive">
      <div className="quiz-loading-dialog">
        <span className="quiz-loading-icon">
          <BrainCircuit size={26} aria-hidden="true" />
        </span>
        <LoaderCircle size={28} aria-hidden="true" className="animate-spin text-[var(--accent)]" />
        <h2 className="serif-heading">Đang chuẩn bị bài trắc nghiệm</h2>
        <p>Hệ thống đang phân tích cấu hình và chọn câu hỏi phù hợp từ dữ liệu MVP.</p>
      </div>
    </div>
  );
}
