/**
 * QuizResultPage – Displays results after a quiz session is submitted.
 * Shows scores, detailed answer review (with explanations/sources), and recommendations.
 */

import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import * as quizService from '../../services/quizService';
import type { QuizResult, QuizQuestionResult } from '../../types/quiz';

function formatTime(ms: number) {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return m > 0 ? `${m} phút ${s} giây` : `${s} giây`;
}

function formatDate(iso: string) {
    return new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    }).format(new Date(iso));
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatBox({ label, value, color }: { label: string; value: string | number; color: string }) {
    return (
        <div style={{ background: 'var(--bg-surface)', border: `1px solid ${color}30`, borderRadius: '0.875rem', padding: '1rem', flex: 1, minWidth: '120px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: 'var(--shadow)' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: color, marginBottom: '0.25rem' }}>{value}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
        </div>
    );
}

function AnswerReviewCard({ result, index }: { result: QuizQuestionResult; index: number }) {
    const q = result.question;
    const isSkipped = result.selectedOptionId === null;
    const isCorrect = result.isCorrect;

    // Status colors
    const statusColor = isSkipped ? 'var(--text-muted)' : isCorrect ? 'var(--success)' : 'var(--danger)';
    const statusBg = isSkipped ? 'var(--bg-surface)' : isCorrect ? 'var(--success-soft)' : 'var(--danger-soft)';
    const statusText = isSkipped ? 'Chưa trả lời' : isCorrect ? 'Đúng' : 'Sai';
    const statusIcon = isSkipped ? '⚪' : isCorrect ? '✅' : '❌';

    return (
        <div style={{ background: 'var(--bg-card)', borderRadius: '1rem', border: `1px solid ${isSkipped ? 'var(--border)' : statusColor}`, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', boxShadow: 'var(--shadow)' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: '2rem', height: '2rem', borderRadius: '0.5rem', background: statusBg, color: statusColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, border: `1px solid ${statusColor}40` }}>
                        {index + 1}
                    </div>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{statusIcon} {statusText}</span>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {q.topic && <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '9999px', background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>{q.topic}</span>}
                    <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '9999px', background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>{q.difficulty}</span>
                </div>
            </div>

            {/* Question Text */}
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)', lineHeight: 1.6 }}>{q.questionText}</h3>

            {/* Options */}
            <div style={{ display: 'grid', gap: '0.5rem' }}>
                {q.options.map(opt => {
                    const isSelected = result.selectedOptionId === opt.id;
                    const isCorrectOption = q.correctOptionId === opt.id;

                    let bg = 'var(--bg-surface)';
                    let border = '1px solid var(--border)';
                    let color = 'var(--text-secondary)';
                    let icon = '';

                    if (isCorrectOption) {
                        bg = 'var(--success-soft)';
                        border = '1px solid var(--success)';
                        color = 'var(--success)';
                        icon = '✓';
                    } else if (isSelected && !isCorrectOption) {
                        bg = 'var(--danger-soft)';
                        border = '1px solid var(--danger)';
                        color = 'var(--danger)';
                        icon = '✗';
                    }

                    return (
                        <div key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1rem', borderRadius: '0.5rem', background: bg, border: border, color: color }}>
                            <span style={{ fontWeight: 700, width: '1.5rem' }}>{opt.id}.</span>
                            <span style={{ flex: 1 }}>{opt.text}</span>
                            {icon && <span style={{ fontWeight: 800 }}>{icon}</span>}
                        </div>
                    );
                })}
            </div>

            {/* AI Explanation / Source */}
            <div style={{ background: 'var(--accent-soft)', border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', borderRadius: '0.75rem', padding: '1.25rem', marginTop: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--accent)', fontWeight: 600, fontSize: '0.9rem' }}>
                    <span style={{ fontSize: '1.2rem' }}>💡</span> Giải thích từ AI
                </div>
                <p style={{ margin: '0 0 1rem 0', fontSize: '0.95rem', color: 'var(--text-primary)', lineHeight: 1.6 }}>
                    {q.explanation}
                </p>
                {q.sourceRefs && q.sourceRefs.length > 0 && (
                    <div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nguồn tham khảo:</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                            {q.sourceRefs.map((src, i) => (
                                <span key={i} style={{ fontSize: '0.75rem', background: 'var(--bg-surface)', color: 'var(--text-secondary)', padding: '0.2rem 0.5rem', borderRadius: '0.3rem', border: '1px solid var(--border)' }}>
                                    📖 {src.title} - {src.location}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
                {q.eventId && (
                    <div style={{ marginTop: '1rem' }}>
                        <Link to={`/events/${q.eventId}`} style={{ display: 'inline-block', fontSize: '0.85rem', color: 'var(--accent)', textDecoration: 'none', padding: '0.4rem 0.75rem', background: 'var(--accent-soft)', borderRadius: '0.5rem', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)' }}>
                            🔗 Xem sự kiện liên quan: {q.eventTitle || q.eventId}
                        </Link>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function QuizResultPage() {
    const { sessionId } = useParams<{ sessionId: string }>();
    const navigate = useNavigate();

    const [result, setResult] = useState<QuizResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'correct' | 'wrong' | 'skipped'>('all');

    useEffect(() => {
        async function fetchResult() {
            if (!sessionId) return;
            const res = await quizService.getQuizResult(sessionId);
            setResult(res);
            setLoading(false);
        }
        fetchResult();
    }, [sessionId]);

    const handleMockExport = (type: string) => {
        alert(`Tính năng xuất file ${type} sẽ được tích hợp ở phiên bản hệ thống có backend thực tế.`);
    };

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)', color: 'var(--accent)', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ width: '2rem', height: '2rem', border: '3px solid rgba(79,111,149,0.3)', borderTopColor: '#4f6f95', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                <span>Đang tạo báo cáo kết quả...</span>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    if (!result) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)' }}>
                <div style={{ textAlign: 'center' }}>
                    <h1 style={{ color: 'var(--danger)', marginBottom: '1rem' }}>Không tìm thấy kết quả</h1>
                    <Link to="/quiz" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Về trang chủ Trắc nghiệm</Link>
                </div>
            </div>
        );
    }

    // Derived Info
    const badgeLevel = result.score10 >= 8 ? { label: 'Xuất sắc', color: 'var(--success)', icon: '🏆' }
        : result.score10 >= 5 ? { label: 'Khá', color: 'var(--warning)', icon: '⭐' }
            : { label: 'Cần ôn thêm', color: 'var(--danger)', icon: '📚' };

    // Collect weak topics based on wrong answers
    const wrongQuestions = result.questionResults.filter(r => !r.isCorrect);
    const weakTopics = Array.from(new Set(wrongQuestions.map(r => r.question.topic).filter(Boolean)));

    const filteredQuestions = result.questionResults.filter(r => {
        if (filter === 'correct') return r.isCorrect;
        if (filter === 'wrong') return !r.isCorrect && r.selectedOptionId !== null;
        if (filter === 'skipped') return r.selectedOptionId === null;
        return true;
    });

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}>

            {/* ── Nav ── */}
            <header style={{ height: '3.5rem', background: 'var(--bg-app)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 1.5rem', gap: '1rem', position: 'sticky', top: 0, zIndex: 50 }}>
                <Link to="/quiz" style={{ color: 'var(--text-primary)', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 500 }}>← Trắc nghiệm AI</Link>
                <span style={{ color: 'var(--text-muted)' }}>·</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--accent)', fontWeight: 700 }}>Kết quả</span>
                <div style={{ flex: 1 }} />
                <button onClick={() => navigate('/quiz/history')} style={{ background: 'transparent', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>Xem lịch sử</button>
            </header>

            <main style={{ maxWidth: '64rem', margin: '0 auto', padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>

                {/* ── Hero Result ── */}
                <section style={{ background: 'var(--bg-card)', borderRadius: '1.25rem', border: '1px solid var(--border)', padding: '2rem', display: 'flex', flexWrap: 'wrap', gap: '2rem', alignItems: 'center', justifyContent: 'space-between', position: 'relative', overflow: 'hidden', boxShadow: 'var(--shadow)' }}>

                    {/* Glow bg */}
                    <div style={{ position: 'absolute', top: '-50%', right: '-10%', width: '300px', height: '300px', background: `${badgeLevel.color}20`, filter: 'blur(80px)', borderRadius: '50%', pointerEvents: 'none' }} />

                    <div style={{ flex: '1 1 300px', zIndex: 1 }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0.8rem', borderRadius: '9999px', background: `${badgeLevel.color}15`, border: `1px solid ${badgeLevel.color}50`, color: badgeLevel.color, fontWeight: 700, fontSize: '0.8rem', marginBottom: '1rem' }}>
                            {badgeLevel.icon} Đánh giá: {badgeLevel.label}
                        </div>

                        <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: '0 0 0.5rem', color: 'var(--text-primary)' }}>
                            {result.config.topic || 'Bài trắc nghiệm tổng hợp'}
                        </h1>
                        <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem' }}>
                            Hoàn thành lúc: {formatDate(result.completedAt)}
                        </p>
                    </div>

                    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', zIndex: 1 }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '3.5rem', fontWeight: 800, color: badgeLevel.color, lineHeight: 1 }}>
                                {result.score10}
                            </div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 600, marginTop: '0.2rem' }}>Thang 10</div>
                        </div>

                        <div style={{ width: '1px', background: 'var(--border)', height: '60px' }}></div>

                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                                {result.percentageScore}%
                            </div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Độ chính xác</div>
                        </div>
                    </div>
                </section>

                {/* ── Stats Grid ── */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                    <StatBox label="Số câu đúng" value={result.correctCount} color="#2f7a57" />
                    <StatBox label="Số câu sai" value={result.incorrectCount} color="#9f1d2d" />
                    <StatBox label="Bỏ trống" value={result.skippedCount} color="#94a3b8" />
                    <StatBox label="Thời gian" value={formatTime(result.totalTimeMs)} color="#4f6f95" />
                </div>

                {/* ── Recommendations ── */}
                {weakTopics.length > 0 && (
                    <section style={{ background: 'var(--warning-soft)', borderRadius: '1rem', border: '1px solid var(--warning)', padding: '1.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                            <span style={{ fontSize: '1.5rem' }}>📈</span>
                            <h2 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--warning)' }}>Gợi ý ôn tập</h2>
                        </div>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                            Dựa vào các câu trả lời sai, AI gợi ý bạn nên xem lại các chủ đề sau:
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem' }}>
                            {weakTopics.map(t => (
                                <span key={t as string} style={{ padding: '0.4rem 0.8rem', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '0.5rem', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                                    {t as string}
                                </span>
                            ))}
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                            <button onClick={() => navigate('/quiz/generate?mode=weakness')} style={{ padding: '0.6rem 1.25rem', background: 'var(--warning)', color: '#fff', border: 'none', borderRadius: '0.5rem', fontWeight: 600, cursor: 'pointer' }}>Tạo bài luyện tập với điểm yếu</button>
                            <button onClick={() => navigate(`/quiz/generate`)} style={{ padding: '0.6rem 1.25rem', background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '0.5rem', fontWeight: 600, cursor: 'pointer' }}>Tạo bài mới bình thường</button>
                        </div>
                    </section>
                )}

                {/* ── Answer Review ── */}
                <section>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                        <h2 style={{ fontSize: '1.25rem', margin: 0, color: '#f8fafc' }}>Chi tiết ({filteredQuestions.length})</h2>

                        <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--bg-surface)', padding: '0.25rem', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
                            <button onClick={() => setFilter('all')} style={{ padding: '0.4rem 0.8rem', background: filter === 'all' ? 'var(--accent)' : 'transparent', color: filter === 'all' ? '#fff' : 'var(--text-muted)', border: 'none', borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>Tất cả</button>
                            <button onClick={() => setFilter('correct')} style={{ padding: '0.4rem 0.8rem', background: filter === 'correct' ? 'var(--success)' : 'transparent', color: filter === 'correct' ? '#fff' : 'var(--text-muted)', border: 'none', borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>Đúng</button>
                            <button onClick={() => setFilter('wrong')} style={{ padding: '0.4rem 0.8rem', background: filter === 'wrong' ? 'var(--danger)' : 'transparent', color: filter === 'wrong' ? '#fff' : 'var(--text-muted)', border: 'none', borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>Sai</button>
                            <button onClick={() => setFilter('skipped')} style={{ padding: '0.4rem 0.8rem', background: filter === 'skipped' ? 'var(--text-muted)' : 'transparent', color: filter === 'skipped' ? '#fff' : 'var(--text-muted)', border: 'none', borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>Bỏ trống</button>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        {filteredQuestions.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8', background: 'rgba(30,41,59,0.3)', borderRadius: '1rem' }}>Chưa có câu hỏi nào trong danh mục này.</div>
                        ) : (
                            filteredQuestions.map((r) => <AnswerReviewCard key={r.question.id} result={r} index={result.questionResults.findIndex(x => x.question.id === r.question.id)} />)
                        )}
                    </div>
                </section>

                {/* ── Footer Actions ── */}
                <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: '2rem' }}>
                    <button onClick={() => handleMockExport('PDF')} style={{ padding: '0.75rem 1.25rem', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>📄 Xuất PDF</button>
                    <button onClick={() => handleMockExport('Excel')} style={{ padding: '0.75rem 1.25rem', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>📊 Xuất Excel</button>
                    <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} style={{ padding: '0.75rem 1.25rem', background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 600 }}>↑ Lên đầu trang</button>
                </div>
            </main>
        </div>
    );
}
