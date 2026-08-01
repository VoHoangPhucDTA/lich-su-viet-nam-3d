import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { HistoricalEvent } from '../types/event';
import { HISTORICAL_PERIODS } from '../data/historicalPeriods';
import { getHomepageEvents } from '../services/eventApi';
import EventCard from '../components/shared/EventCard';
import HistoricalPeriodCard from '../components/public/HistoricalPeriodCard';

const appLogo = '/home-images/home-logo-384.webp';
const heroAvifSrcSet =
  '/home-images/hero-720.avif 720w, /home-images/hero-1376.avif 1376w';
const heroWebpSrcSet =
  '/home-images/hero-720.webp 720w, /home-images/hero-1376.webp 1376w';
const heroPrimaryImageSizes =
  '(min-width: 1280px) 558px, (min-width: 1024px) 441px, (min-width: 640px) calc(100vw - 50px), calc(100vw - 34px)';
const heroQuoteImageSizes =
  '(min-width: 1280px) 1214px, (min-width: 640px) calc(100vw - 50px), calc(100vw - 34px)';

export default function CoiNguonPage() {
  const [featuredEvents, setFeaturedEvents] = useState<HistoricalEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getHomepageEvents()
      .then(events => {
        if (!cancelled) setFeaturedEvents(events);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="public-shell">
      <main className="public-content space-y-16 lg:space-y-20">
        <section className="public-card grid overflow-hidden lg:grid-cols-[1.08fr_.92fr]">
          <div className="flex flex-col justify-center px-6 py-10 sm:px-10 sm:py-12 lg:px-14">
            <p className="public-eyebrow">Quốc hiệu · Đại Việt</p>
            <h1 className="app-heading mt-4 max-w-3xl text-4xl font-bold tracking-tight text-[var(--text-primary)] sm:text-5xl lg:text-6xl">
              Học lịch sử bằng <span className="text-[var(--accent)]">dòng thời gian sống động</span>
            </h1>
            <div className="my-6 h-px w-24 bg-gradient-to-r from-[var(--accent)] to-[var(--admin-accent)]" />
            <p className="max-w-xl text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
              Khám phá hành trình dựng nước và giữ nước qua sự kiện, bản đồ 3D và các mốc thời gian bám sát chương trình THPT.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/map" className="public-primary-button no-underline">Bản đồ tương tác</Link>
              <Link to="/quiz" className="public-secondary-button no-underline">Ôn luyện kiến thức</Link>
            </div>
            <dl className="mt-9 grid grid-cols-3 border-t border-[var(--border)] pt-6">
              {[
                ['2.000+', 'Năm văn hiến'],
                ['300+', 'Sự kiện tiêu biểu'],
                ['63', 'Tỉnh thành'],
              ].map(([value, label]) => (
                <div key={label} className="border-l border-[var(--border)] px-3 first:border-l-0 first:pl-0">
                  <dt className="sr-only">{label}</dt>
                  <dd className="app-heading text-3xl font-bold text-[var(--accent)]">{value}</dd>
                  <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</span>
                </div>
              ))}
            </dl>
          </div>
          <div className="relative min-h-72 bg-stone-950 lg:min-h-full">
            <picture>
              <source type="image/avif" srcSet={heroAvifSrcSet} sizes={heroPrimaryImageSizes} />
              <source type="image/webp" srcSet={heroWebpSrcSet} sizes={heroPrimaryImageSizes} />
              <img
                src="/vietnam_heritage_hero.jpg"
                alt="Di sản văn hóa Việt Nam"
                width={1376}
                height={768}
                loading="eager"
                fetchPriority="high"
                className="absolute inset-0 h-full w-full object-cover opacity-90"
              />
            </picture>
            <div className="absolute inset-0 bg-gradient-to-t from-stone-950/75 via-stone-950/10 to-transparent" />
          </div>
        </section>

        <section>
          <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="public-eyebrow">Tiến trình lịch sử</p>
              <h2 className="app-heading mt-2 text-3xl font-bold text-[var(--text-primary)] sm:text-4xl">Thời kỳ lịch sử trọng đại</h2>
            </div>
            <Link to="/periods" className="public-text-link inline-flex items-center text-sm font-bold no-underline">
              Xem tất cả thời kỳ
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {HISTORICAL_PERIODS.map(period => <HistoricalPeriodCard key={period.id} period={period} compact />)}
          </div>
        </section>

        <section>
          <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="public-eyebrow">Ký ức vàng son</p>
              <h2 className="app-heading mt-2 text-3xl font-bold text-[var(--text-primary)] sm:text-4xl">Sự kiện lịch sử tiêu biểu</h2>
            </div>
            <Link to="/browse" className="public-text-link inline-flex items-center text-sm font-bold no-underline">
              Xem thư viện sự kiện
            </Link>
          </div>
          {loading ? (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="public-card h-80 animate-pulse bg-[var(--bg-surface)]" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {featuredEvents.map(event => (
                <EventCard
                  key={event.id}
                  event={event}
                  imageHeight="h-48"
                  imageProfile="home"
                />
              ))}
            </div>
          )}
        </section>

        <section className="public-card relative isolate min-h-64 overflow-hidden px-6 py-12 text-center sm:px-10 sm:py-16">
          <picture>
            <source type="image/avif" srcSet={heroAvifSrcSet} sizes={heroQuoteImageSizes} />
            <source type="image/webp" srcSet={heroWebpSrcSet} sizes={heroQuoteImageSizes} />
            <img
              src="/vietnam_heritage_hero.jpg"
              alt=""
              width={1376}
              height={768}
              loading="lazy"
              fetchPriority="low"
              className="absolute inset-0 -z-20 h-full w-full object-cover"
            />
          </picture>
          <div className="absolute inset-0 -z-10 bg-stone-950/70" />
          <blockquote className="app-heading mx-auto max-w-4xl text-2xl font-extrabold leading-relaxed text-white drop-shadow-sm sm:text-3xl lg:text-4xl">
            “Dân ta phải biết sử ta, cho tường gốc tích nước nhà Việt Nam.”
          </blockquote>
        </section>
      </main>
      <footer className="border-t border-[var(--border)] bg-[var(--bg-card)]">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-8 text-center sm:flex-row sm:px-6 sm:text-left">
          <img
            src={appLogo}
            alt="Lịch Sử Việt Nam 3D"
            width={384}
            height={169}
            loading="lazy"
            fetchPriority="low"
            className="app-footer-logo"
          />
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
            Bảo tàng số học đường THPT · {new Date().getFullYear()}
          </span>
        </div>
      </footer>
    </div>
  );
}
