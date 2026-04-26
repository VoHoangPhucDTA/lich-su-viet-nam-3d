import type { ExamMode, ExamDifficulty } from '../../types/exam';

interface PreviewProps {
  mode: ExamMode;
  questionCount: number;
  customCount: string;
  timeLimitMinutes: number;
  customTime: string;
  difficulty: ExamDifficulty;
  topicMode: 'all' | 'specific';
  selectedTopic: string;
  loading: boolean;
  onConfirm: () => void;
}

export default function ExamConfigPreview({ mode, questionCount, customCount, timeLimitMinutes, customTime, difficulty, topicMode, selectedTopic, loading, onConfirm }: PreviewProps) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1.25rem', padding: '1.5rem', boxShadow: 'var(--shadow)' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 1.5rem 0', color: 'var(--text-primary)', display: 'flex', gap: '0.5rem' }}>
            <span>📜</span> Tóm tắt đề thi
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.9rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(71,85,105,0.3)', paddingBottom: '0.5rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Chế độ</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{mode === 'practice' ? 'Luyện tập' : mode === 'thpt_mock' ? 'Mô phỏng THPT' : 'Tùy chỉnh'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(71,85,105,0.3)', paddingBottom: '0.5rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Số câu</span>
                <span style={{ fontWeight: 600, color: '#4f6f95' }}>{questionCount === -1 ? customCount || 0 : questionCount} câu</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(71,85,105,0.3)', paddingBottom: '0.5rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Thời gian</span>
                <span style={{ fontWeight: 600, color: '#e8b0b7' }}>{timeLimitMinutes === -1 ? customTime || 0 : timeLimitMinutes} phút</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(71,85,105,0.3)', paddingBottom: '0.5rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Độ khó</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{difficulty === 'easy' ? 'Dễ' : difficulty === 'medium' ? 'TB' : difficulty === 'hard' ? 'Khó' : 'Trộn'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(71,85,105,0.3)', paddingBottom: '0.5rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Chủ đề</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)', textAlign: 'right', maxWidth: '150px' }}>{topicMode === 'all' ? 'Tổng hợp' : selectedTopic}</span>
            </div>
        </div>

        <button
          onClick={onConfirm}
          disabled={loading}
          style={{ width: '100%', padding: '1rem', marginTop: '2rem', background: 'linear-gradient(135deg, #2f7a57, #266247)', color: '#fff', border: 'none', borderRadius: '0.75rem', fontWeight: 800, fontSize: '1rem', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, boxShadow: '0 4px 6px -1px rgba(47,122,87,0.3)' }}
        >
            {loading ? 'Đang tạo...' : 'Xác nhận Tạo Đề'}
        </button>
        <p style={{ margin: '1rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            *Hệ thống sẽ lấy dữ liệu từ ngân hàng RAG Mock.
        </p>
    </div>
  );
}
