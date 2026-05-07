import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as examService from '../../services/examService';
import { useAuth } from '../../auth/AuthContext';

interface ExamResultActionsProps {
  examId: string;
}

export default function ExamResultActions({ examId }: ExamResultActionsProps) {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleRetake = async () => {
    try {
      setLoading(true);
      const newExamId = await examService.retakeExam(examId, currentUser?.id);
      navigate(`/exams/session/${newExamId}`);
    } catch (e) {
      alert('Không thể tạo lại đề. ' + (e as Error).message);
      setLoading(false);
    }
  };

  const handleMockExport = (type: 'pdf' | 'excel') => {
    setToastMessage(`Chức năng xuất ${type.toUpperCase()} sẽ được tích hợp ở phiên bản backend.`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const btnStyle = {
    padding: '0.75rem 1.5rem',
    borderRadius: '0.5rem',
    fontWeight: 500,
    cursor: 'pointer',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.875rem',
    transition: 'background 0.2s'
  };

  return (
    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
      <button 
        onClick={handleRetake}
        disabled={loading}
        style={{ ...btnStyle, background: '#4f6f95', color: '#fff' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
          <path d="M3 3v5h5"/>
        </svg>
        {loading ? 'Đang tạo...' : 'Làm lại đề'}
      </button>

      <button 
        onClick={() => navigate('/exams/create')}
        style={{ ...btnStyle, background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
      >
        Tạo đề mới
      </button>

      <button 
        onClick={() => navigate('/exams/history')}
        style={{ ...btnStyle, background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
      >
        Xem lịch sử
      </button>

      <div style={{ flex: 1 }} />

      <button 
        onClick={() => handleMockExport('pdf')}
        style={{ ...btnStyle, background: 'rgba(159, 29, 45, 0.12)', color: '#9f1d2d', border: '1px solid rgba(159, 29, 45, 0.2)' }}
      >
        Xuất PDF
      </button>

      <button 
        onClick={() => handleMockExport('excel')}
        style={{ ...btnStyle, background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.2)' }}
      >
        Xuất Excel
      </button>

      {/* Mock Toast */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '2rem',
          right: '2rem',
          background: 'var(--bg-card)',
          color: 'var(--text-primary)',
          padding: '1rem 1.5rem',
          borderRadius: '0.5rem',
          boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)',
          borderLeft: '4px solid var(--accent)',
          zIndex: 50,
          animation: 'slideIn 0.3s ease'
        }}>
          {toastMessage}
          <style>{`
            @keyframes slideIn {
              from { transform: translateX(100%); opacity: 0; }
              to { transform: translateX(0); opacity: 1; }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
