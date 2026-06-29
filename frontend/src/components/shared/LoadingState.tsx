export default function LoadingState({ label = 'Đang tải...' }: { label?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4rem 1.5rem',
        gap: '16px',
      }}
    >
      <div
        className="animate-spin-slow"
        style={{
          width: '32px',
          height: '32px',
          border: '3px solid var(--border)',
          borderTopColor: 'var(--accent)',
          borderRadius: '50%',
        }}
      />
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 500 }}>
        {label}
      </p>
    </div>
  );
}
