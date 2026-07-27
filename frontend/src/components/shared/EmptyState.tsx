import { Landmark } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  textOnly?: boolean;
  title?: string;
  description?: string;
}

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
