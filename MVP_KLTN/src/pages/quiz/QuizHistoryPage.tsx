/**
 * QuizHistoryPage – View history of completed quiz sessions.
 * Displays a table/grid of history items, filterable by grade or difficulty.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import * as quizService from '../../services/quizService';
import type { QuizResult } from '../../types/quiz';

function formatTime(ms: number) {
  const diffMinutes = Math.round(ms / 60000);
  if (diffMinutes < 1) return '< 1 phút';
  return `${diffMinutes} phút`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }).format(d);
}

export default function QuizHistoryPage() {
  const { currentUser } = useAuth();
  const [history, setHistory] = useState<QuizResult[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterDifficulty, setFilterDifficulty] = useState<string>('all');
  const [filterGrade, setFilterGrade] = useState<string>('all');

  useEffect(() => {
    async function loadData() {
      // In mock mode we load from localStorage, but typically we'd pass user id.
      const data = await quizService.getQuizHistory(currentUser?.id);
      setHistory(data);
      setLoading(false);
    }
    loadData();
  }, [currentUser]);

  const filteredHistory = history.filter(item => {
    if (filterDifficulty !== 'all' && item.config.difficulty !== filterDifficulty) return false;
    if (filterGrade !== 'all') {
      if (item.config.grade && item.config.grade.toString() !== filterGrade) return false;
    }
    return true;
  });

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)', color: 'var(--accent)', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ width: '2rem', height: '2rem', border: '3px solid rgba(129,140,248,0.3)', borderTopColor: '#818cf8', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}>

      {/* ── Nav ── */}
      <header style={{ height: '3.5rem', background: 'var(--bg-app)', borderBottom: '1px solid var(--border)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', padding: '0 1.5rem', gap: '1rem', position: 'sticky', top: 0, zIndex: 50 }}>
        <Link to="/quiz" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 500 }}>
          ← Trắc nghiệm AI
        </Link>
        <span style={{ color: 'var(--text-muted)' }}>·</span>
        <span style={{ fontSize: '0.85rem', color: 'var(--accent)', fontWeight: 700 }}>Lịch sử làm bài</span>
      </header>

      <main style={{ maxWidth: '64rem', margin: '0 auto', padding: '2rem 1.5rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.25rem' }}>Lịch sử làm bài</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Thống kê các phiên làm bài trắc nghiệm của bạn.</p>

        {/* ── Filters ── */}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          <select
            value={filterDifficulty}
            onChange={e => setFilterDifficulty(e.target.value)}
            style={{ padding: '0.625rem 1rem', borderRadius: '0.5rem', background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none' }}
          >
            <option value="all" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>Tất cả độ khó</option>
            <option value="easy" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>Nhẹ nhàng (Dễ)</option>
            <option value="medium" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>Thử thách (Vừa)</option>
            <option value="hard" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>Căng não (Khó)</option>
            <option value="mixed" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>Ngẫu nhiên (Trộn)</option>
          </select>

          <select
            value={filterGrade}
            onChange={e => setFilterGrade(e.target.value)}
            style={{ padding: '0.625rem 1rem', borderRadius: '0.5rem', background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none' }}
          >
            <option value="all" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>Tất cả các lớp</option>
            <option value="10" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>Lớp 10</option>
            <option value="11" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>Lớp 11</option>
            <option value="12" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>Lớp 12</option>
          </select>
        </div>

        {/* ── Content ── */}
        {history.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 2rem', background: 'var(--bg-surface)', borderRadius: '1rem', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏜️</div>
            <h2 style={{ fontSize: '1.25rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Bạn chưa có lịch sử làm bài</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', maxWidth: '400px', margin: '0 auto 1.5rem auto' }}>Các bài trắc nghiệm AI đã hoàn thành sẽ xuất hiện ở đây để bạn dễ dàng theo dõi tiến độ học tập.</p>
            <Link to="/quiz/generate" style={{ padding: '0.75rem 1.5rem', background: 'var(--accent)', color: '#fff', borderRadius: '0.5rem', textDecoration: 'none', fontWeight: 600, display: 'inline-block' }}>Tạo bài mới ngay</Link>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 2rem', background: 'var(--bg-surface)', borderRadius: '1rem', border: '1px outset var(--border)', color: 'var(--text-muted)' }}>
            Không tìm thấy kết quả nào phù hợp với bộ lọc.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {filteredHistory.map(item => (
              <div key={item.resultId} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1.25rem', boxShadow: 'var(--shadow)' }}>
                <div style={{ flex: '1 1 250px' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.4rem', display: 'flex', gap: '0.5rem' }}>
                    <span>{formatDate(item.completedAt)}</span>
                    <span>•</span>
                    <span>{formatTime(item.totalTimeMs)}</span>
                  </div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>
                    {item.config.topic || 'Bài luyện tập tổng hợp'}
                  </h3>
                  <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem' }}>
                    <span style={{ padding: '0.15rem 0.5rem', borderRadius: '9999px', background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)' }}>
                      {item.totalQuestions} câu
                    </span>
                    {item.config.grade && (
                      <span style={{ padding: '0.15rem 0.5rem', borderRadius: '9999px', background: 'var(--success-soft)', color: 'var(--success)', border: '1px solid color-mix(in srgb, var(--success) 30%, transparent)' }}>
                        Lớp {item.config.grade}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: item.score10 >= 8 ? 'var(--success)' : item.score10 >= 5 ? 'var(--warning)' : 'var(--danger)' }}>
                      {item.score10}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Điểm số</div>
                  </div>

                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      <span style={{ color: 'var(--success)' }}>{item.correctCount}</span>
                      <span style={{ color: 'var(--border)', margin: '0 2px' }}>/</span>
                      {item.totalQuestions}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Số câu đúng</div>
                  </div>

                  <Link
                    to={`/quiz/result/${item.sessionId}`}
                    style={{ padding: '0.625rem 1.25rem', borderRadius: '0.5rem', background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#fff', textDecoration: 'none', fontWeight: 600, fontSize: '0.9rem', whiteSpace: 'nowrap', transition: 'opacity 0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                  >
                    Xem lại
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
