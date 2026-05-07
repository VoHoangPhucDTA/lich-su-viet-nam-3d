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
          border: '3px solid rgba(30,58,95,0.2)',
          borderTopColor: '#4f6f95',
          borderRadius: '50%',
          animation: 'admin-spin 0.7s linear infinite',
        }}
      />
      <p style={{ fontSize: '0.85rem' }}>{label}</p>
      <style>{`@keyframes admin-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
