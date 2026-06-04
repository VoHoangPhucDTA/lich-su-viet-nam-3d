import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';

export default function ExamHero() {
  const { currentUser } = useAuth();
  
  return (
    <section style={{ textAlign: 'center', margin: '3rem 0 4rem 0', position: 'relative' }}>
        {/* Background Glow */}
        {/* Background Glow */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '400px', height: '400px', background: 'radial-gradient(circle, var(--accent-soft) 0%, transparent 70%)', pointerEvents: 'none', opacity: 0.5 }}></div>
        
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0.8rem', borderRadius: '2rem', background: 'var(--accent-soft)', border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)', color: 'var(--accent)', fontWeight: 600, fontSize: '0.85rem', marginBottom: '1.5rem' }}>
            📝 Chuyên đề Ôn thi THPT Quốc Gia
        </div>
        
        <h1 style={{ fontSize: '3rem', fontWeight: 800, margin: '0 0 1rem 0', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Luyện đề thi THPT môn Lịch sử
        </h1>
        <p style={{ fontSize: '1.1rem', color: 'var(--text-muted)', maxWidth: '600px', margin: '0 auto 2.5rem', lineHeight: 1.6 }}>
            Tạo đề luyện tập theo lớp, giai đoạn, độ khó và thời gian làm bài. Sẵn sàng cho kỳ thi THPT với kho dữ liệu phong phú.
            {!currentUser && <span style={{ display: 'block', marginTop: '0.5rem', color: 'var(--warning)', fontSize: '0.9rem' }}>Bạn đang truy cập ở chế độ khách.</span>}
        </p>
        
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <Link to="/exams/create" style={{ padding: '0.875rem 2rem', background: 'var(--accent)', color: '#fff', borderRadius: '0.75rem', textDecoration: 'none', fontWeight: 700, fontSize: '1rem', boxShadow: '0 10px 15px -3px var(--accent-soft)', transition: 'transform 0.2s' }}>
                Tạo đề thi ngay
            </Link>
            <Link to="/exams/history" style={{ padding: '0.875rem 2rem', background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: '0.75rem', textDecoration: 'none', fontWeight: 600, fontSize: '1rem', transition: 'background 0.2s' }}>
                Xem lịch sử làm đề
            </Link>
        </div>
    </section>
  );
}
