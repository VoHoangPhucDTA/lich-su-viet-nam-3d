// ─── Shared: EmptyState ──────────────────────────────────────────────────────

interface EmptyStateProps {
  icon?: string;
  title?: string;
  description?: string;
}

export default function EmptyState({
  icon = '📭',
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
        padding: '3.5rem 1rem',
        color: '#64748b',
        textAlign: 'center',
        gap: '0.5rem',
      }}
    >
      <span style={{ fontSize: '2.5rem', marginBottom: '0.25rem' }}>{icon}</span>
      <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#94a3b8' }}>{title}</p>
      <p style={{ fontSize: '0.78rem', maxWidth: '22rem', lineHeight: 1.5 }}>{description}</p>
    </div>
  );
}
