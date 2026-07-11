import { BookOpenCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';

export default function ExamHero() {
  const { currentUser } = useAuth();

  return (
    <section className="exam-home-hero">
      <div className="exam-home-eyebrow">
        <BookOpenCheck aria-hidden="true" size={17} />
        Chuyên đề ôn thi THPT Quốc gia
      </div>
      <h1>Luyện đề thi THPT môn Lịch sử</h1>
      <p className="exam-home-hero-copy">
        Luyện đề thi thử, ôn theo chủ đề và theo dõi lịch sử làm bài từ kho đề THPT đã chuẩn hóa cho môn Lịch sử.
        {!currentUser && <span className="exam-home-guest-note">Bạn đang truy cập ở chế độ khách.</span>}
      </p>
      <div className="exam-home-hero-actions">
        <Link className="exam-focusable exam-home-cta exam-home-cta-primary" to="/exams/browse">
          Vào ngân hàng đề
        </Link>
        <Link className="exam-focusable exam-home-cta exam-home-cta-secondary" to="/exams/lich-su">
          Xem lịch sử luyện thi
        </Link>
      </div>
    </section>
  );
}
