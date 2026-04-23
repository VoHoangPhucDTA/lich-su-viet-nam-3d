interface ExamSourceBadgeProps {
  title: string;
  location: string;
}

export default function ExamSourceBadge({ title, location }: ExamSourceBadgeProps) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.25rem',
      padding: '0.25rem 0.5rem',
      background: 'rgba(99, 102, 241, 0.1)',
      color: '#818cf8',
      borderRadius: '0.25rem',
      fontSize: '0.75rem',
      fontWeight: 500,
      border: '1px solid rgba(99, 102, 241, 0.2)'
    }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
      </svg>
      {title} - {location}
    </span>
  );
}
