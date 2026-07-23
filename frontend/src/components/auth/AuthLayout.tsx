import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import authBanner from '../../assets/banner.png';
import appLogo from '../../assets/lich-su-viet-nam-3d-logo-header-transparent.webp';

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
          <Link
            to="/home"
            className="auth-brand"
            aria-label="Lịch Sử Việt Nam 3D - Trang chủ"
          >
            <img
              src={appLogo}
              alt="Lịch Sử Việt Nam 3D"
              width={1215}
              height={534}
              className="auth-brand-logo"
            />
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
