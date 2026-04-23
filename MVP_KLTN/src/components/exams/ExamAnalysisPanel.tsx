import type { ExamResult, ExamSession } from '../../types/exam';

interface ExamAnalysisPanelProps {
  result: ExamResult;
  session: ExamSession; // needed for topic/difficulty info
}

export default function ExamAnalysisPanel({ result, session }: ExamAnalysisPanelProps) {
  
  // Analyze data
  const topicStats: Record<string, { total: number; correct: number; wrong: number; blank: number }> = {};

  session.questions.forEach(q => {
    if (!topicStats[q.topic]) {
      topicStats[q.topic] = { total: 0, correct: 0, wrong: 0, blank: 0 };
    }
    
    topicStats[q.topic].total++;
    
    const rev = result.answersReview.find(a => a.questionId === q.id);
    if (!rev || rev.selectedOptionId === null || rev.selectedOptionId === undefined) {
       topicStats[q.topic].blank++;
    } else if (rev.isCorrect) {
       topicStats[q.topic].correct++;
    } else {
       topicStats[q.topic].wrong++;
    }
  });

  const topicsArray = Object.entries(topicStats).map(([topic, stats]) => ({
    topic,
    ...stats,
    accuracy: stats.total > 0 ? (stats.correct / stats.total) * 100 : 0
  }));

  // Sort by accuracy ascending (worst first)
  topicsArray.sort((a, b) => a.accuracy - b.accuracy);

  const weakTopics = topicsArray.filter(t => t.accuracy < 50 && t.total > 0).slice(0, 3);
  const strongTopics = topicsArray.filter(t => t.accuracy >= 70 && t.total > 0).slice(0, 3);

  return (
    <div style={{
      background: '#1e293b',
      borderRadius: '1rem',
      padding: '2rem',
      border: '1px solid #334155'
    }}>
      <h2 style={{ fontSize: '1.25rem', marginTop: 0, marginBottom: '1.5rem', color: '#f8fafc' }}>
        Phân tích kết quả
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 1fr) minmax(250px, 1fr)', gap: '2rem' }}>
         
         {/* Weaknesses */}
         <div style={{ background: '#0f172a', padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
            <h3 style={{ color: '#ef4444', marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              Cần ôn tập thêm
            </h3>
            {weakTopics.length > 0 ? (
               <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {weakTopics.map(wt => (
                    <li key={wt.topic}>
                       <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                          <span style={{ color: '#e2e8f0', fontSize: '0.875rem' }}>{wt.topic}</span>
                          <span style={{ color: '#ef4444', fontSize: '0.875rem', fontWeight: 600 }}>{wt.accuracy.toFixed(0)}%</span>
                       </div>
                       <div style={{ width: '100%', background: '#1e293b', height: '0.5rem', borderRadius: '1rem', overflow: 'hidden' }}>
                          <div style={{ height: '100%', background: '#ef4444', width: `${wt.accuracy}%` }} />
                       </div>
                       <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                          Sai/bỏ trống {wt.wrong + wt.blank} trên {wt.total} câu
                       </div>
                    </li>
                  ))}
               </ul>
            ) : (
                <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: 0 }}>Bạn không có chủ đề nào yếu theo ngưỡng đánh giá.</p>
            )}
         </div>

         {/* Strengths */}
         <div style={{ background: '#0f172a', padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
            <h3 style={{ color: '#22c55e', marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              Điểm mạnh
            </h3>
            {strongTopics.length > 0 ? (
               <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {strongTopics.map(st => (
                    <li key={st.topic}>
                       <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                          <span style={{ color: '#e2e8f0', fontSize: '0.875rem' }}>{st.topic}</span>
                          <span style={{ color: '#22c55e', fontSize: '0.875rem', fontWeight: 600 }}>{st.accuracy.toFixed(0)}%</span>
                       </div>
                       <div style={{ width: '100%', background: '#1e293b', height: '0.5rem', borderRadius: '1rem', overflow: 'hidden' }}>
                          <div style={{ height: '100%', background: '#22c55e', width: `${st.accuracy}%` }} />
                       </div>
                    </li>
                  ))}
               </ul>
            ) : (
                <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: 0 }}>Cần cố gắng đúng nhiều hơn để đạt ngưỡng xuất sắc.</p>
            )}
         </div>

      </div>
    </div>
  );
}
