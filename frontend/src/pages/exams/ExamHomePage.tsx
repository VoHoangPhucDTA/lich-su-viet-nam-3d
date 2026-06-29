/**
 * ExamHomePage – Landing page for the THPT Exam module.
 */

import { Link } from 'react-router-dom';
import ExamHero from '../../components/exams/ExamHero';

function FeatureCard({ title, desc, icon, to, primary = false }: { title: string; desc: string; icon: string; to: string; primary?: boolean }) {
  return (
    <Link to={to} style={{ 
      textDecoration: 'none', 
      background: primary ? 'var(--accent-soft)' : 'var(--bg-card)', 
      border: primary ? '1px solid var(--accent)' : '1px solid var(--border)', 
      borderRadius: '1.25rem', 
      padding: '1.5rem', 
      display: 'flex', 
      gap: '1.25rem', 
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', 
      cursor: 'pointer', 
      boxShadow: 'var(--shadow)'
    }} onMouseEnter={e => {
      e.currentTarget.style.transform = 'translateY(-4px)';
      e.currentTarget.style.borderColor = 'var(--accent)';
    }} onMouseLeave={e => {
      e.currentTarget.style.transform = 'translateY(0)';
      e.currentTarget.style.borderColor = primary ? 'var(--accent)' : 'var(--border)';
    }}>
        <div style={{ 
          fontSize: '2.5rem', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          width: '4rem',
          height: '4rem',
          background: 'var(--bg-surface)',
          borderRadius: '1rem',
          flexShrink: 0
        }}>{icon}</div>
        <div>
           <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)', fontSize: '1.1rem', fontWeight: 700 }}>{title}</h3>
           <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.6 }}>{desc}</p>
        </div>
    </Link>
  );
}

export default function ExamHomePage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}>
       <main style={{ maxWidth: '72rem', margin: '0 auto', padding: '2rem 1.5rem' }}>
           
           <ExamHero />

           <section>
               <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem', color: 'var(--text-primary)' }}>Bắt đầu luyện thi</h2>
               <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
                   <FeatureCard 
                     primary={true}
                     title="Ngân hàng đề thi"
                     desc="Chọn đề thật đã parse từ dữ liệu, vào thi thử 50 phút hoặc luyện tập tự do theo từng đề."
                     icon="Đề"
                     to="/exams/browse"
                   />
                   <FeatureCard
                     title="Ôn theo chủ đề"
                     desc="Luyện câu hỏi theo từng mảng kiến thức và giai đoạn lịch sử, xem giải thích ngay sau từng câu."
                     icon="CH"
                     to="/exams/on-chu-de"
                   />
                   <FeatureCard 
                     title="Lịch sử luyện thi"
                     desc="Xem lại các bài đã nộp, điểm số, thời gian làm bài và mở phần ôn lại câu sai."
                     icon="LS"
                     to="/exams/lich-su"
                   />
               </div>
           </section>
       </main>
    </div>
  );
}
