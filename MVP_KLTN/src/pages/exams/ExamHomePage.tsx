/**
 * ExamHomePage – Landing page for the THPT Exam module.
 */

import { Link } from 'react-router-dom';
import ExamHero from '../../components/exams/ExamHero';

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
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}>
       <main style={{ maxWidth: '72rem', margin: '0 auto', padding: '2rem 1.5rem' }}>
           
           <ExamHero />

           {/* ── Stats Mock Overview ── */}
           <section style={{ marginBottom: '4rem' }}>
               <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem', color: 'var(--text-primary)' }}>Thống kê cá nhân</h2>
               <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem' }}>
                   <ExamStat label="Đề đã làm" value="12" color="var(--accent)" />
                   <ExamStat label="Điểm trung bình" value="7.5" color="var(--success)" />
                   <ExamStat label="Điểm cao nhất" value="9.2" color="var(--warning)" />
                   <ExamStat label="Thời gian ôn" value="14h" color="#ec4899" />
                   <div style={{ background: 'var(--bg-card)', border: `1px solid var(--border)`, borderLeft: `4px solid var(--danger)`, borderRadius: '1rem', padding: '1.25rem', flex: '2 1 200px', display: 'flex', flexDirection: 'column', justifyContent: 'center', boxShadow: 'var(--shadow)' }}>
                       <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem', fontWeight: 600 }}>Chủ đề yếu cần ôn</div>
                       <div style={{ color: 'var(--danger)', fontWeight: 700, fontSize: '1rem' }}>Phong kiến phương Đông, Kháng chiến chống Pháp</div>
                   </div>
               </div>
           </section>

           {/* ── Features Grid ── */}
           <section>
               <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem', color: 'var(--text-primary)' }}>Tính năng hỗ trợ</h2>
               <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
                   <FeatureCard 
                     primary={true}
                     title="Làm đề mô phỏng THPT" 
                     desc="Thiết lập đề chuẩn 40 câu / 50 phút bám sát cấu trúc của Bộ GDĐT, tổng hợp kiến thức cả 3 khối." 
                     icon="🎯" 
                     to="/exams/create?preset=mock" 
                   />
                   <FeatureCard 
                     title="Tạo đề luyện tập tự do" 
                     desc="Tự chọn chủ đề, lớp, độ khó và thời gian để test kiến thức một cách ngẫu nhiên." 
                     icon="⚙️" 
                     to="/exams/create?preset=custom" 
                   />
                   <FeatureCard 
                     title="Xem kết quả và phân tích" 
                     desc="Giải thích đáp án cặn kẽ và lưu nguồn SGK để tra cứu nhanh, phân tích tỷ lệ làm bản." 
                     icon="📊" 
                     to="/exams/history" 
                   />
                   <FeatureCard 
                     title="Ôn tập theo điểm yếu" 
                     desc="Hệ thống tự nhận diện các câu làm sai nhiều và tự động sinh đề thi lấp lỗ hổng." 
                     icon="⚕️" 
                     to="/exams/create?preset=weakness" 
                   />
               </div>
           </section>
       </main>
    </div>
  );
}
