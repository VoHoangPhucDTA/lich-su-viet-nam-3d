/**
 * QuizHomePage – Landing page for the AI/RAG Quiz module.
 * Shows overview, stats teaser, and entry points for guest & authenticated users.
 */

import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { useState, useEffect } from 'react';
import * as quizService from '../../services/quizService';

function GuestBadge() {
  return (
    <span
      className="badge-economic"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.35rem',
        padding: '0.25rem 0.75rem',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: 600,
      }}
    >
      👤 Chế độ khách
    </span>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: string | number; icon: string; color: string }) {
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${color}30`,
        borderRadius: '0.875rem',
        padding: '1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        flex: 1,
        minWidth: '150px',
        boxShadow: 'var(--shadow)'
      }}
    >
      <div style={{ fontSize: '1.75rem', background: 'var(--bg-app)', padding: '0.6rem', borderRadius: '0.625rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: color }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>{value}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{label}</div>
      </div>
    </div>
  );
}

function ActionCard({ to, title, desc, icon, highlight }: { to: string; title: string; desc: string; icon: string; highlight?: string }) {
  return (
    <Link
      to={to}
      className="glass"
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${highlight ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: '1rem',
        padding: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        textDecoration: 'none',
        flex: 1,
        minWidth: '220px',
        boxShadow: highlight ? '0 4px 20px var(--accent-soft)' : 'var(--shadow)',
        transition: 'transform 0.2s, box-shadow 0.2s'
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-4px)';
        if (!highlight) e.currentTarget.style.boxShadow = '0 10px 25px var(--shadow)';
        else e.currentTarget.style.boxShadow = '0 10px 25px var(--accent-soft)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = '';
        e.currentTarget.style.boxShadow = highlight ? '0 4px 20px var(--accent-soft)' : 'var(--shadow)';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{ fontSize: '2rem' }}>{icon}</div>
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h3>
      </div>
      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        {desc}
      </p>
    </Link>
  );
}

export default function QuizHomePage() {
  const { isAuthenticated, currentUser } = useAuth();

  // Stats mock state
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [avgScore, setAvgScore] = useState(0);

  useEffect(() => {
    // Load actual history to calculate some basic initial stats if present
    quizService.getQuizHistory(currentUser?.id).then(history => {
      if (history.length > 0) {
        const total = history.reduce((acc, r) => acc + r.totalQuestions, 0);
        const avg = history.reduce((acc, r) => acc + r.score10, 0) / history.length;
        setTotalQuestions(total);
        setAvgScore(Math.round(avg * 10) / 10);
      }
    });
  }, [currentUser?.id]);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-app)',
        color: 'var(--text-primary)',
        fontFamily: 'Inter, sans-serif',
        overflowY: 'auto',
      }}
    >
      {/* ── Top nav ── */}
      <header
        style={{
          height: '3.5rem',
          background: 'var(--bg-app)',
          borderBottom: '1px solid var(--border)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 1.5rem',
          gap: '1rem',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <Link
          to="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            textDecoration: 'none',
          }}
        >
          <span style={{ fontSize: '1.25rem' }}>🗺️</span>
          <span
            style={{
              fontWeight: 700,
              fontSize: '0.9rem',
              background: 'linear-gradient(135deg, var(--accent), var(--accent-secondary))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Lịch Sử Việt Nam 3D
          </span>
        </Link>

        <span style={{ color: 'var(--text-muted)' }}>·</span>
        <span style={{ fontSize: '0.85rem', color: 'var(--accent)', fontWeight: 700 }}>Trắc nghiệm AI</span>

        <div style={{ flex: 1 }} />

        {!isAuthenticated && <GuestBadge />}

        {isAuthenticated ? (
          <Link
            to="/profile/dashboard"
            style={{
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              padding: '0.375rem 0.875rem',
              borderRadius: '0.5rem',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
            }}
          >
            👤 {currentUser?.fullName?.split(' ').pop()}
          </Link>
        ) : (
          <Link
            to="/login"
            style={{
              fontSize: '0.8rem',
              color: 'var(--accent)',
              textDecoration: 'none',
              padding: '0.375rem 0.875rem',
              borderRadius: '0.5rem',
              background: 'var(--accent-soft)',
              border: '1px solid var(--accent-soft)',
            }}
          >
            Đăng nhập
          </Link>
        )}
      </header>

      {/* ── Hero ── */}
      <main style={{ maxWidth: '64rem', margin: '0 auto', padding: '3rem 1.5rem 4rem' }}>
        {/* Decorative glow */}
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            top: '20%',
            left: '50%',
            transform: 'translate(-50%, 0)',
            width: '600px',
            height: '400px',
            borderRadius: '50%',
            background: 'var(--accent-soft)',
            opacity: 0.2,
            filter: 'blur(60px)',
            pointerEvents: 'none',
          }}
        />

        <div className="animate-fade-in" style={{ textAlign: 'center', marginBottom: '3rem', position: 'relative' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '4.5rem',
              height: '4.5rem',
              borderRadius: '1.25rem',
              background: 'var(--accent)',
              fontSize: '2rem',
              marginBottom: '1.25rem',
              boxShadow: '0 0 40px var(--accent-soft)',
            }}
          >
            🤖
          </div>

          <h1
            style={{
              fontSize: 'clamp(2rem, 5vw, 3rem)',
              fontWeight: 800,
              color: 'var(--text-primary)',
              marginBottom: '0.75rem',
              lineHeight: 1.2,
              letterSpacing: '-0.02em'
            }}
          >
            Luyện trắc nghiệm Lịch sử với AI
          </h1>

          <p
            style={{
              fontSize: '1.1rem',
              color: 'var(--text-secondary)',
              maxWidth: '42rem',
              margin: '0 auto 2rem',
              lineHeight: 1.6,
            }}
          >
            Tạo câu hỏi từ sự kiện, chủ đề hoặc giai đoạn lịch sử theo nội dung SGK
          </p>

          {/* CTA */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <Link
              to="/quiz/generate"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.6rem',
                padding: '0.875rem 2rem',
                borderRadius: '0.75rem',
                background: 'var(--accent)',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '1rem',
                textDecoration: 'none',
                boxShadow: '0 4px 12px var(--accent-soft)',
                transition: 'transform 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseLeave={e => e.currentTarget.style.transform = ''}
            >
              ✨ Tạo câu hỏi
            </Link>

            <Link
              to="/quiz/history"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.875rem 1.75rem',
                borderRadius: '0.75rem',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                fontWeight: 600,
                fontSize: '1rem',
                textDecoration: 'none',
                transition: 'background 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-surface)'}
            >
              📜 Xem lịch sử
            </Link>
          </div>
        </div>

        {/* ── Stats Mock ── */}
        <div
          className="animate-fade-in"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '1rem',
            marginBottom: '3rem',
            animationDelay: '0.1s',
            animationFillMode: 'both'
          }}
        >
          <StatCard label="Câu đã làm" value={totalQuestions > 0 ? totalQuestions : 124} icon="✍️" color="#6366f1" />
          <StatCard label="Điểm trung bình" value={avgScore > 0 ? avgScore : 8.5} icon="⭐" color="#f59e0b" />
          <StatCard label="Chủ đề cần ôn" value="Kháng chiến chống Pháp" icon="🎯" color="#ef4444" />
          <StatCard label="Chuỗi ngày học" value="7 ngày" icon="🔥" color="#10b981" />
        </div>

        {/* ── Functional Cards ── */}
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.25rem', color: 'var(--text-primary)' }}>Tính năng chính</h2>
        <div
          className="animate-fade-in"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '1.25rem',
            animationDelay: '0.2s',
            animationFillMode: 'both'
          }}
        >
          <ActionCard
            to="/quiz/generate"
            title="Tạo bài trắc nghiệm mới"
            desc="Tùy chỉnh nội dung, độ khó và số lượng câu hỏi. RAG AI sẽ tự động sinh đề theo yêu cầu của bạn."
            icon="🚀"
            highlight="var(--accent)"
          />
          <ActionCard
            to="/quiz/history"
            title="Xem lịch sử làm bài"
            desc="Xem lại các đề đã làm, tra cứu kết quả chi tiết, lời giải thích và các trích dẫn nguồn."
            icon="📚"
          />
          <ActionCard
            to="/quiz/generate?mode=weakness"
            title="Ôn tập theo điểm yếu"
            desc="Hệ thống tự động phân tích lịch sử làm bài và gợi ý tập trung vào các giai đoạn bạn hay sai."
            icon="📈"
          />
        </div>
      </main>
    </div>
  );
}
