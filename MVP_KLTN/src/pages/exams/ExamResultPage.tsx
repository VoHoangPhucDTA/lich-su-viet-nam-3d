import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import * as examService from '../../services/examService';
import type { ExamResult, ExamSession } from '../../types/exam';

import ExamResultSummary from '../../components/exams/ExamResultSummary';
import ExamAnalysisPanel from '../../components/exams/ExamAnalysisPanel';
import ExamAnswerReview from '../../components/exams/ExamAnswerReview';
import ExamResultActions from '../../components/exams/ExamResultActions';

export default function ExamResultPage() {
  const { examId } = useParams<{ examId: string }>();

  const [resultData, setResultData] = useState<{ result: ExamResult; session: ExamSession } | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionNotSubmitted, setSessionNotSubmitted] = useState(false);

  useEffect(() => {
    async function load() {
      if (!examId) return;

      const data = await examService.getExamResult(examId);
      if (data) {
         setResultData(data);
      } else {
         // Check if session exists but not submitted
         const session = await examService.getExamSession(examId);
         if (session && session.status !== 'submitted') {
            setSessionNotSubmitted(true);
         }
      }
      setLoading(false);
    }
    load();
  }, [examId]);

  if (loading) {
     return (
         <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)', color: 'var(--accent)' }}>
            <div style={{ width: '2rem', height: '2rem', border: '3px solid var(--accent-soft)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
         </div>
     );
  }

  if (sessionNotSubmitted) {
     return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)' }}>
           <div style={{ textAlign: 'center', background: 'var(--bg-card)', padding: '3rem', borderRadius: '1rem', border: '1px solid var(--border)' }}>
              <h1 style={{ color: 'var(--warning)', marginBottom: '1rem' }}>Đề thi này chưa được nộp</h1>
              <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Bạn vẫn có thể tiếp tục làm bài hoặc nộp ngay.</p>
               <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                  <Link to={`/exams/session/${examId}`} style={{ padding: '0.75rem 1.5rem', background: 'var(--accent)', color: '#fff', borderRadius: '0.5rem', textDecoration: 'none', fontWeight: 500 }}>
                     Tiếp tục làm bài
                  </Link>
                  <Link to="/exams" style={{ padding: '0.75rem 1.5rem', background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '0.5rem', textDecoration: 'none', fontWeight: 500 }}>
                     Về trang chính
                  </Link>
               </div>
           </div>
        </div>
     );
  }

  if (!resultData) {
     return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)' }}>
           <div style={{ textAlign: 'center', background: 'var(--bg-card)', padding: '3rem', borderRadius: '1rem', border: '1px solid var(--border)' }}>
              <h1 style={{ color: 'var(--danger)', marginBottom: '1rem' }}>Không tìm thấy kết quả</h1>
              <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Kết quả này không tồn tại hoặc đã bị xóa khỏi trình duyệt.</p>
               <Link to="/exams/history" style={{ padding: '0.75rem 1.5rem', background: 'var(--accent)', color: '#fff', borderRadius: '0.5rem', textDecoration: 'none', fontWeight: 500 }}>
                  Xem lịch sử đề thi
               </Link>
           </div>
        </div>
     );
  }

  return (
    <div style={{ minHeight: '100vh', padding: '2rem', background: 'var(--bg-app)', color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}>
       <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          <ExamResultSummary result={resultData.result} />
          
          <ExamAnalysisPanel result={resultData.result} session={resultData.session} />

          <ExamResultActions examId={examId!} />
          
          <ExamAnswerReview result={resultData.result} session={resultData.session} />

       </div>
    </div>
  );
}
