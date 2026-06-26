/**
 * ExamHomePage – Landing page for the THPT Exam module.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import ExamHero from '../../components/exams/ExamHero';
import { getV2Stats } from '@/lib/exam/v2History';
import type { V2Stats } from '@/lib/exam/v2History';

function ExamStat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: `1px solid var(--border)`, borderTop: `4px solid ${color}`, borderRadius: '1rem', padding: '1.25rem', flex: 1, minWidth: '130px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: 'var(--shadow)' }}>
       <div style={{ fontSize: '1.75rem', fontWeight: 800, color: color, marginBottom: '0.25rem' }}>{value}</div>
       <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>{label}</div>
    </div>
  );
}

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
  const [stats, setStats] = useState<V2Stats | null>(null);

  useEffect(() => {
    setStats(getV2Stats());
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}>
       <main style={{ maxWidth: '72rem', margin: '0 auto', padding: '2rem 1.5rem' }}>
           
           <ExamHero />

           {/* ── Stats (thực tế từ V2 localStorage) ── */}
           <section style={{ marginBottom: '4rem' }}>
               <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                   <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Thống kê cá nhân</h2>
                   {stats && (
                       <Link to="/exams/lich-su-v2" style={{ fontSize: '0.8rem', color: 'var(--accent)', textDecoration: 'none' }}>Xem lịch sử →</Link>
                   )}
               </div>
               {stats ? (
                   <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem' }}>
                       <ExamStat label="Đề đã làm" value={stats.count} color="var(--accent)" />
                       <ExamStat label="Điểm trung bình" value={stats.avgScore} color="var(--success)" />
                       <ExamStat label="Điểm cao nhất" value={stats.maxScore} color="var(--warning)" />
                       <ExamStat label="Thời gian ôn" value={`${stats.totalHours}h`} color="var(--accent)" />
                   </div>
               ) : (
                   <div style={{ padding: '2rem', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                       Chưa có dữ liệu. Hãy hoàn thành 1 đề thi để xem thống kê.
                   </div>
               )}
           </section>

           {/* ── Features Grid ── */}
           <section>
               <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem', color: 'var(--text-primary)' }}>Tính năng hỗ trợ</h2>
               <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
                   <FeatureCard 
                     primary={true}
                     title="Thi đề thật THPT 2019–2025" 
                     desc="38 đề thi gốc của Bộ GD&ĐT – cấu trúc MCQ + Đúng/Sai bậc thang, xác minh 3 lớp, điểm thang 10." 
                     icon="📋" 
                     to="/exams/browse" 
                   />
                   <FeatureCard 
                     title="Tạo đề luyện tập tự do" 
                     desc="Tự chọn chủ đề, lớp, độ khó và thời gian để test kiến thức một cách ngẫu nhiên." 
                     icon="⚙️" 
                     to="/exams/create?preset=custom" 
                   />
                   <FeatureCard 
                     title="Ôn tập theo chủ đề" 
                     desc="32 chủ đề Lịch sử VN & Thế giới – luyện tập từng câu, xem đáp án + giải thích ngay." 
                     icon="�" 
                     to="/exams/on-chu-de" 
                   />
                   <FeatureCard 
                     title="Lịch sử làm bài V2" 
                     desc="Xem lại kết quả, điểm số và chi tiết từng câu của các lần thi đề thật trước đây." 
                     icon="📊" 
                     to="/exams/lich-su-v2" 
                   />
               </div>
           </section>
       </main>
    </div>
  );
}
