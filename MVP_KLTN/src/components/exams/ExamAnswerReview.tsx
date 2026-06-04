import { useState } from 'react';
import type { ExamResult, ExamSession } from '../../types/exam';
import ExamSourceBadge from './ExamSourceBadge';

interface ExamAnswerReviewProps {
  result: ExamResult;
  session: ExamSession;
}

type FilterType = 'all' | 'correct' | 'wrong' | 'blank' | 'flagged';
type DifficultyFilter = 'all' | 'easy' | 'medium' | 'hard';

export default function ExamAnswerReview({ result, session }: ExamAnswerReviewProps) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [diffFilter, setDiffFilter] = useState<DifficultyFilter>('all');

  const filteredQuestions = session.questions.filter(q => {
    // Difficulty filter
    if (diffFilter !== 'all' && q.difficulty !== diffFilter) return false;

    // Status filter
    const rev = result.answersReview.find(a => a.questionId === q.id);
    if (filter === 'all') return true;
    if (filter === 'correct' && rev?.isCorrect) return true;
    if (filter === 'wrong' && !rev?.isCorrect && rev?.selectedOptionId !== null) return true;
    if (filter === 'blank' && (rev?.selectedOptionId === null || rev?.selectedOptionId === undefined)) return true;
    
    // For flagged, we would need session.questionStatuses if stored, but it is volatile. 
    // Usually result review doesn't strictly need 'flagged' if not saved, but let's mock if we can't find it.
    // Assuming flagged is not saved in Result currently, we skip or mock. Let's just return false for flagged for now if no data.
    if (filter === 'flagged') return false; 

    return false;
  });

  return (
    <div style={{ marginTop: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
         <h2 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--text-primary)' }}>Chi tiết từng câu hỏi</h2>
         
         <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
             <select 
                value={filter} 
                onChange={e => setFilter(e.target.value as FilterType)}
                style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border)', padding: '0.5rem', borderRadius: '0.5rem', outline: 'none' }}
             >
                <option value="all" style={{ background: 'var(--bg-card)' }}>Tất cả trạng thái</option>
                <option value="correct" style={{ background: 'var(--bg-card)' }}>Đúng</option>
                <option value="wrong" style={{ background: 'var(--bg-card)' }}>Sai</option>
                <option value="blank" style={{ background: 'var(--bg-card)' }}>Bỏ trống</option>
             </select>

             <select 
                value={diffFilter} 
                onChange={e => setDiffFilter(e.target.value as DifficultyFilter)}
                style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border)', padding: '0.5rem', borderRadius: '0.5rem', outline: 'none' }}
             >
                <option value="all" style={{ background: 'var(--bg-card)' }}>Mọi độ khó</option>
                <option value="easy" style={{ background: 'var(--bg-card)' }}>Nhận biết/Thông hiểu (Dễ)</option>
                <option value="medium" style={{ background: 'var(--bg-card)' }}>Vận dụng (Vừa)</option>
                <option value="hard" style={{ background: 'var(--bg-card)' }}>Vận dụng cao (Khó)</option>
             </select>
         </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {filteredQuestions.length === 0 ? (
             <div style={{ padding: '3rem', textAlign: 'center', background: 'var(--bg-surface)', borderRadius: '1rem', border: '1px dashed var(--border)', color: 'var(--text-muted)' }}>
                Không có câu hỏi nào khớp với bộ lọc.
             </div>
         ) : (
            filteredQuestions.map((q, idx) => {
               const rev = result.answersReview.find(a => a.questionId === q.id);
               const isBlank = rev?.selectedOptionId === null || rev?.selectedOptionId === undefined;
               let borderColor = 'var(--border)';
               if (rev?.isCorrect) borderColor = 'var(--success)';
               else if (!isBlank) borderColor = 'var(--danger)';

                return (
                   <div key={q.id} style={{ background: 'var(--bg-card)', padding: '1.5rem', borderRadius: '1rem', border: `1px solid ${borderColor}`, boxShadow: 'var(--shadow)' }}>
                     <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                           <span style={{ background: 'var(--bg-surface)', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.875rem', fontWeight: 'bold', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                               Câu {idx + 1}
                           </span>
                           {rev?.isCorrect ? (
                               <span style={{ color: 'var(--success)', fontSize: '0.875rem', fontWeight: 'bold' }}>Đúng</span>
                           ) : isBlank ? (
                               <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem', fontWeight: 'bold' }}>Bỏ trống</span>
                           ) : (
                               <span style={{ color: 'var(--danger)', fontSize: '0.875rem', fontWeight: 'bold' }}>Sai</span>
                           )}
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                           <span style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', background: 'var(--bg-surface)', borderRadius: '1rem', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>{q.topic}</span>
                           <span style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', background: 'var(--bg-surface)', borderRadius: '1rem', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                              {q.difficulty === 'easy' ? 'Nhận biết' : q.difficulty === 'medium' ? 'Vận dụng' : 'Vận dụng cao'}
                           </span>
                        </div>
                     </div>

                     <p style={{ fontSize: '1.125rem', color: 'var(--text-primary)', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                        {q.questionText}
                     </p>

                     <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                        {q.options.map(opt => {
                           const isSelected = rev?.selectedOptionId === opt.id;
                           const isTrueCorrect = q.correctOptionId === opt.id;
                           let optBg = 'var(--bg-surface)';
                           let optBorder = 'var(--border)';
                           let optColor = 'var(--text-secondary)';

                           if (isTrueCorrect) {
                              optBg = 'var(--success-soft)';
                              optBorder = 'var(--success)';
                              optColor = 'var(--success)';
                           } else if (isSelected && !isTrueCorrect) {
                              optBg = 'var(--danger-soft)';
                              optBorder = 'var(--danger)';
                              optColor = 'var(--danger)';
                           }

                           return (
                              <div key={opt.id} style={{ 
                                 padding: '1rem', 
                                 background: optBg, 
                                 border: `1px solid ${optBorder}`, 
                                 borderRadius: '0.5rem',
                                 color: optColor,
                                 display: 'flex',
                                 gap: '0.75rem'
                              }}>
                                 <span style={{ fontWeight: 'bold' }}>{opt.id}.</span>
                                 <span>{opt.text}</span>
                              </div>
                           );
                        })}
                     </div>

                     <div style={{ background: 'var(--bg-surface)', padding: '1rem', borderRadius: '0.5rem', borderLeft: '3px solid var(--accent)', border: '1px solid var(--border)', borderLeftWidth: '4px', borderLeftColor: 'var(--accent)' }}>
                        <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)', fontSize: '0.875rem' }}>Giải thích:</h4>
                        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.5 }}>{q.explanation}</p>
                        
                        {q.sourceRefs && q.sourceRefs.length > 0 && (
                           <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                              {q.sourceRefs.map((ref, i) => (
                                 <ExamSourceBadge key={i} title={ref.title} location={ref.location} />
                              ))}
                           </div>
                        )}
                     </div>

                  </div>
               );
            })
         )}
      </div>
    </div>
  );
}
