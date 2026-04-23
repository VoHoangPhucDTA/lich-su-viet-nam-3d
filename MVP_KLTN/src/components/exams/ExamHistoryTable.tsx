import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ExamResult } from '../../types/exam';

interface ExamHistoryTableProps {
  history: ExamResult[];
}

export default function ExamHistoryTable({ history }: ExamHistoryTableProps) {
  const [modeFilter, setModeFilter] = useState('all');
  const [diffFilter, setDiffFilter] = useState('all');
  
  if (history.length === 0) {
     return (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', background: 'var(--bg-card)', borderRadius: '1rem', border: '1px dashed var(--border)' }}>
           <div style={{ width: '4rem', height: '4rem', background: 'var(--bg-surface)', borderRadius: '50%', margin: '0 auto 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
               <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                 <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                 <polyline points="14 2 14 8 20 8"/>
                 <line x1="16" y1="13" x2="8" y2="13"/>
                 <line x1="16" y1="17" x2="8" y2="17"/>
                 <polyline points="10 9 9 9 8 9"/>
               </svg>
           </div>
           <h3 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Chưa có bài thi nào</h3>
           <p style={{ color: 'var(--text-muted)', margin: '0 0 1.5rem 0' }}>Hãy bắt đầu làm các bài thi thử THPT để xem lịch sử tại đây.</p>
            <Link to="/exams/create" style={{ display: 'inline-block', padding: '0.75rem 1.5rem', background: 'var(--accent)', color: '#fff', textDecoration: 'none', borderRadius: '0.5rem', fontWeight: 500 }}>
               Tạo đề thi đầu tiên
            </Link>
        </div>
     );
  }

  const filtered = history.filter(h => {
     if (modeFilter !== 'all' && h.config.mode !== modeFilter) return false;
     if (diffFilter !== 'all' && h.config.difficulty !== diffFilter) return false;
     return true;
  });

  return (
    <div>
       <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            <select 
               value={modeFilter} 
               onChange={e => setModeFilter(e.target.value)}
               style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)', padding: '0.5rem', borderRadius: '0.5rem', outline: 'none' }}>
               <option value="all" style={{ background: 'var(--bg-card)' }}>Tất cả chế độ</option>
               <option value="practice" style={{ background: 'var(--bg-card)' }}>Luyện tập</option>
               <option value="thpt_mock" style={{ background: 'var(--bg-card)' }}>Thi thử THPT</option>
               <option value="custom" style={{ background: 'var(--bg-card)' }}>Tùy chỉnh</option>
            </select>
            <select 
               value={diffFilter} 
               onChange={e => setDiffFilter(e.target.value)}
               style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)', padding: '0.5rem', borderRadius: '0.5rem', outline: 'none' }}>
               <option value="all" style={{ background: 'var(--bg-card)' }}>Mọi độ khó</option>
               <option value="easy" style={{ background: 'var(--bg-card)' }}>Cơ bản</option>
               <option value="medium" style={{ background: 'var(--bg-card)' }}>Trung bình</option>
               <option value="hard" style={{ background: 'var(--bg-card)' }}>Nâng cao</option>
               <option value="mixed" style={{ background: 'var(--bg-card)' }}>Tổng hợp</option>
            </select>
       </div>

       <div style={{ background: 'var(--bg-card)', borderRadius: '1rem', overflow: 'hidden', border: '1px solid var(--border)' }}>
          <div style={{ overflowX: 'auto' }}>
             <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                   <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 500 }}>Đề thi</th>
                      <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 500 }}>Chế độ</th>
                      <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 500 }}>Ngày nộp</th>
                      <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 500 }}>Điểm</th>
                      <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 500 }}>Hành động</th>
                   </tr>
                </thead>
                <tbody>
                   {filtered.length === 0 ? (
                       <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Không có lịch sử khớp với bộ lọc.</td></tr>
                   ) : (
                       filtered.map(h => (
                          <tr key={h.examId} style={{ borderBottom: '1px solid var(--border)' }}>
                             <td style={{ padding: '1rem', color: 'var(--text-primary)', fontWeight: 500 }}>{h.config.title}</td>
                             <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>
                                {h.config.mode === 'practice' ? 'Luyện tập' : h.config.mode === 'thpt_mock' ? 'Thi thử' : 'Tùy chỉnh'}
                             </td>
                             <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>
                                {new Date(h.submittedAt).toLocaleDateString('vi-VN')} {new Date(h.submittedAt).toLocaleTimeString('vi-VN')}
                             </td>
                              <td style={{ padding: '1rem' }}>
                                 <span style={{ color: h.score10 >= 8 ? 'var(--success)' : h.score10 >= 5 ? 'var(--warning)' : 'var(--danger)', fontWeight: 'bold' }}>
                                    {h.score10.toFixed(2)}
                                 </span> <span style={{ color: 'var(--text-muted)' }}>/ 10</span>
                              </td>
                             <td style={{ padding: '1rem' }}>
                                <Link to={`/exams/result/${h.examId}`} style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>
                                    Xem kết quả
                                </Link>
                             </td>
                          </tr>
                       ))
                   )}
                </tbody>
             </table>
          </div>
       </div>
    </div>
  );
}
