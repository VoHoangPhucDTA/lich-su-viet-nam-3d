import { Landmark } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  textOnly?: boolean;
  title?: string;
  description?: string;
}

/**
 * Renders a standardized empty-results state with optional icon and text content.
 *
 * @param icon - Custom icon displayed in the icon section.
 * @param textOnly - Whether to hide the icon section.
 * @param title - Heading text for the empty state.
 * @param description - Supporting description text.
 */
export default function EmptyState({
  icon,
  textOnly = false,
  title = 'Không có dữ liệu',
  description = 'Không tìm thấy kết quả phù hợp với bộ lọc hiện tại.',
}: EmptyStateProps) {
  return (
    <div className="public-state">
      {!textOnly && (
        <div className="public-state-icon">
          {icon || <Landmark size={26} strokeWidth={1.6} />}
        </div>
      )}
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}
