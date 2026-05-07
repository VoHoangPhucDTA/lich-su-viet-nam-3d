export default function ExamGenerationLoading() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.8)', backdropFilter: 'blur(5px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
        <div style={{ width: '3rem', height: '3rem', border: '4px solid rgba(30,58,95,0.2)', borderTopColor: '#4f6f95', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        <h2 style={{ color: '#f8fafc', marginTop: '1.5rem', fontWeight: 600 }}>Đang tạo đề thi từ ngân hàng...</h2>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
