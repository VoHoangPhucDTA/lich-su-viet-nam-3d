interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
}

/**
 * Renders an alert-style error message with an optional retry action.
 *
 * @param title - The error heading, defaulting to a Vietnamese loading error message.
 * @param description - The error details, defaulting to a Vietnamese retry message.
 * @param onRetry - Callback invoked when the retry button is clicked.
 * @returns The rendered error state.
 */
export default function ErrorState({
  title = 'Không thể tải dữ liệu',
  description = 'Đã có lỗi xảy ra. Vui lòng thử lại sau ít phút.',
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="public-state" role="alert">
      <h2>{title}</h2>
      <p>{description}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="public-secondary-button mt-2">
          Thử lại
        </button>
      )}
    </div>
  );
}
