import type { ReactNode } from 'react';
import { ArrowLeft, BookOpenCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import authBanner from '../../assets/banner.png';

interface AuthLayoutProps {
  children: ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <main className="auth-shell">
      <div className="auth-shell-decoration" aria-hidden="true" />

      <section className="auth-showcase" aria-label="Minh họa lịch sử Việt Nam">
        <img
          className="auth-showcase-image"
          src={authBanner}
          alt="Đoàn thủy quân Việt Nam tiến về phía mặt trời"
        />
      </section>

      <section className="auth-form-region">
        <div className="auth-mobile-brand">
          <Link to="/home" className="auth-brand">
            <span className="auth-brand-mark" aria-hidden="true">
              <BookOpenCheck size={22} strokeWidth={1.6} />
            </span>
            <span>
              <strong className="serif-heading">Lịch Sử Việt Nam</strong>
              <small>Bảo tàng số học đường THPT</small>
            </span>
          </Link>
        </div>

        <div className="auth-card">{children}</div>

        <Link to="/home" className="auth-back-link">
          <ArrowLeft size={15} aria-hidden="true" />
          Quay lại trang chủ
        </Link>
      </section>
    </main>
  );
}
