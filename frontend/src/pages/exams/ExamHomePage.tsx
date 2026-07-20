import type { LucideIcon } from 'lucide-react';
import { BookOpen, FilePlus2, History, LibraryBig } from 'lucide-react';
import { Link } from 'react-router-dom';
import ExamHero from '../../components/exams/ExamHero';

type FeatureCardProps = {
  title: string;
  desc: string;
  icon: LucideIcon;
  to: string;
  primary?: boolean;
};

function FeatureCard({ title, desc, icon: Icon, to, primary = false }: FeatureCardProps) {
  return (
    <Link className={`exam-focusable exam-home-feature${primary ? ' exam-home-feature-primary' : ''}`} to={to}>
      <span className="exam-home-feature-icon" aria-hidden="true">
        <Icon size={30} strokeWidth={1.8} />
      </span>
      <span>
        <h3>{title}</h3>
        <p>{desc}</p>
      </span>
    </Link>
  );
}

export default function ExamHomePage() {
  return (
    <div className="exam-home-page">
      <main className="exam-home-main">
        <ExamHero />
        <section className="exam-home-features" aria-labelledby="exam-home-features-title">
          <h2 id="exam-home-features-title">Bắt đầu luyện thi</h2>
          <div className="exam-home-feature-grid">
            <FeatureCard primary title="Ngân hàng đề thi" desc="Chọn đề thật từ kho dữ liệu, thi thử 50 phút hoặc luyện tập tự do theo từng đề." icon={LibraryBig} to="/exams/browse" />
            <FeatureCard title="Ôn theo chủ đề" desc="Luyện câu hỏi theo từng mảng kiến thức và giai đoạn lịch sử, xem giải thích ngay sau từng câu." icon={BookOpen} to="/exams/on-chu-de" />
            <FeatureCard title="Tạo đề tùy chọn" desc="Tự chọn số câu, chủ đề, độ khó và thời gian để luyện đúng phần bạn cần." icon={FilePlus2} to="/exams/tao-de" />
            <FeatureCard title="Lịch sử luyện thi" desc="Xem lại các bài đã nộp, điểm số, thời gian làm bài và mở phần ôn lại câu sai." icon={History} to="/exams/lich-su" />
          </div>
        </section>
      </main>
    </div>
  );
}
