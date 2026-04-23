interface ExamSubmitDialogProps {
  unansweredCount: number;
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isTimeUp?: boolean;
}

export default function ExamSubmitDialog({ unansweredCount, isOpen, onConfirm, onCancel, isTimeUp = false }: ExamSubmitDialogProps) {
  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1.25rem', padding: '2rem', maxWidth: '400px', width: '100%', boxShadow: 'var(--shadow)', textAlign: 'center' }}>
            
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
                {isTimeUp ? '⌛' : unansweredCount > 0 ? '⚠️' : '📝'}
            </div>
            
            <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', color: 'var(--text-primary)' }}>
                {isTimeUp ? 'Đã hết thời gian làm bài!' : 'Xác nhận nộp bài'}
            </h2>
            
            <p style={{ margin: '0 0 2rem 0', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {isTimeUp 
                  ? 'Hệ thống sẽ tự động nộp bài làm của bạn.' 
                  : unansweredCount > 0 
                    ? `Bạn vẫn còn ${unansweredCount} câu chưa trả lời. Bạn có chắc chắn muốn nộp bài ngay lúc này không?` 
                    : 'Bạn đã hoàn thành tất cả câu hỏi. Bạn có muốn nộp bài ngay?'}
            </p>
            
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                {!isTimeUp && (
                    <button 
                      onClick={onCancel} 
                      style={{ flex: 1, padding: '0.75rem', background: 'transparent', border: '1px solid #475569', borderRadius: '0.5rem', color: '#cbd5e1', cursor: 'pointer', fontWeight: 600 }}
                    >
                        Quay lại làm tiếp
                    </button>
                )}
                <button 
                  onClick={onConfirm} 
                  style={{ flex: 1, padding: '0.75rem', background: '#10b981', border: 'none', borderRadius: '0.5rem', color: '#fff', cursor: 'pointer', fontWeight: 600, boxShadow: '0 4px 6px -1px rgba(16,185,129,0.3)' }}
                >
                    {isTimeUp ? 'Đồng ý nộp bài' : 'Xác nhận nộp'}
                </button>
            </div>
        </div>
    </div>
  );
}
