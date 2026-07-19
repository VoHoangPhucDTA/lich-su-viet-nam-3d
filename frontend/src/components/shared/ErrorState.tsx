import { CircleAlert, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
}

export default function ErrorState({
  title = 'Không thể tải dữ liệu',
  description = 'Đã có lỗi xảy ra. Vui lòng thử lại sau ít phút.',
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="public-state" role="alert">
      <span className="public-state-icon">
        <CircleAlert size={24} aria-hidden="true" />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="public-secondary-button mt-2">
          <RefreshCw size={15} aria-hidden="true" />
          Thử lại
        </button>
      )}
    </div>
  );
}
