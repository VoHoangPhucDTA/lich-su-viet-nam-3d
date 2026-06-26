import { Landmark } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
}

export default function EmptyState({
  icon,
  title = 'Không có dữ liệu',
  description = 'Không tìm thấy kết quả phù hợp với bộ lọc hiện tại.',
}: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4rem 1.5rem',
        textAlign: 'center',
        gap: '12px',
      }}
    >
      <div
        style={{
          width: '56px',
          height: '56px',
          borderRadius: '16px',
          background: 'var(--accent-soft)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--accent)',
          marginBottom: '4px',
        }}
      >
        {icon || <Landmark size={26} strokeWidth={1.6} />}
      </div>
      <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
        {title}
      </p>
      <p
        style={{
          fontSize: '13px',
          maxWidth: '26rem',
          lineHeight: 1.6,
          color: 'var(--text-muted)',
        }}
      >
        {description}
      </p>
    </div>
  );
}
