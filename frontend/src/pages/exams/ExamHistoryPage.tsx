import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as examService from '../../services/examService';
import type { ExamResult } from '../../types/exam';
import { useAuth } from '../../auth/AuthContext';
import ExamHistoryTable from '../../components/exams/ExamHistoryTable';

export default function ExamHistoryPage() {
  const [history, setHistory] = useState<ExamResult[]>([]);
  const [loading, setLoading] = useState(true);
  const { currentUser } = useAuth();

  useEffect(() => {
    async function load() {
      // Pass userId context to fetch the right history
      const data = await examService.getExamHistory(currentUser?.id);
      setHistory(data);
      setLoading(false);
    }
    load();
  }, [currentUser]);

  return (
    <div style={{ minHeight: '100vh', padding: '2rem', background: 'var(--bg-app)', color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
             <Link to="/exams" style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                 <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="19" y1="12" x2="5" y2="12"></line>
                    <polyline points="12 19 5 12 12 5"></polyline>
                 </svg>
                 Trở về
             </Link>
             <h1 style={{ margin: 0 }}>Lịch sử làm đề thi</h1>
             {!currentUser && (
                 <span style={{ padding: '0.25rem 0.75rem', background: 'rgba(234, 179, 8, 0.1)', color: '#eab308', borderRadius: '1rem', fontSize: '0.75rem', border: '1px solid rgba(234, 179, 8, 0.2)' }}>
                    Chế độ khách
                 </span>
             )}
          </div>
          
          {loading ? (
             <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>Đang tải lịch sử...</div>
          ) : (
             <ExamHistoryTable history={history} />
          )}

      </div>
    </div>
  );
}
