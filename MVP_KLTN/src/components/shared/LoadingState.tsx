// ─── Shared: LoadingState ────────────────────────────────────────────────────

export default function LoadingState({ label = 'Đang tải...' }: { label?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3.5rem 1rem',
        gap: '0.75rem',
        color: '#64748b',
      }}
    >
      <div
        style={{
          width: '2rem',
          height: '2rem',
          border: '3px solid rgba(99,102,241,0.2)',
          borderTopColor: '#6366f1',
          borderRadius: '50%',
          animation: 'admin-spin 0.7s linear infinite',
        }}
      />
      <p style={{ fontSize: '0.85rem' }}>{label}</p>
      <style>{`@keyframes admin-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
