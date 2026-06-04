/**
 * QuizSessionPage – Active quiz taking interface.
 * Implements timer, question navigation, option selection, flagging, and submission.
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as quizService from '../../services/quizService';
import type { QuizSession, QuizAnswer, QuestionStatus } from '../../types/quiz';

// ─── Shared Components inline ───────────────────────────────────────────────

function QuizTimer({ 
  startedAt, 
  timeLimit, 
  onTimeUp 
}: { 
  startedAt: string; 
  timeLimit: number; 
  onTimeUp: () => void 
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startMs = new Date(startedAt).getTime();
    
    const initElapsed = Math.floor((Date.now() - startMs) / 1000);
    if (timeLimit > 0 && initElapsed >= timeLimit * 60) {
        onTimeUp();
        return;
    }

    const interval = setInterval(() => {
      const currentElapsed = Math.floor((Date.now() - startMs) / 1000);
      setElapsed(currentElapsed);
      if (timeLimit > 0 && currentElapsed >= timeLimit * 60) {
        clearInterval(interval);
        onTimeUp();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt, timeLimit, onTimeUp]);

  if (timeLimit > 0) {
    const remaining = Math.max(0, timeLimit * 60 - elapsed);
    const m = Math.floor(remaining / 60).toString().padStart(2, '0');
    const s = (remaining % 60).toString().padStart(2, '0');
    const isWarning = remaining < 60;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', fontWeight: 700, color: isWarning ? 'var(--danger)' : 'var(--text-primary)' }}>
        <span style={{ fontSize: '1.25rem' }}>⏱️</span> {m}:{s}
      </div>
    );
  } else {
    const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const s = (elapsed % 60).toString().padStart(2, '0');
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', fontWeight: 600, color: 'var(--text-muted)' }}>
        <span style={{ fontSize: '1.25rem' }}>⏱️</span> {m}:{s}
      </div>
    );
  }
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function QuizSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<QuizSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const timeUpTriggered = useRef(false);

  useEffect(() => {
    async function loadSession() {
      if (!sessionId) return;
      setIsLoading(true);
      try {
        const data = await quizService.getQuizSession(sessionId);
        if (!data) {
          setError('Không tìm thấy phiên làm bài này.');
        } else if (data.submittedAt) {
          navigate(`/quiz/result/${sessionId}`, { replace: true });
        } else {
          setSession(data);
        }
      } catch (err) {
        setError('Có lỗi khi tải dữ liệu bài làm.');
      } finally {
        setIsLoading(false);
      }
    }
    loadSession();
  }, [sessionId, navigate]);

  const handleUpdateAnswer = (questionId: string, optionId: 'A' | 'B' | 'C' | 'D' | null) => {
    if (!session) return;
    
    const newAnswers: QuizAnswer[] = session.answers.map(a => 
       a.questionId === questionId ? { ...a, selectedOptionId: optionId } : a
    );
    
    const newStatuses: Record<string, QuestionStatus> = { ...session.questionStatuses };
    
    if (newStatuses[questionId] !== 'flagged') {
       newStatuses[questionId] = optionId ? 'answered' : 'unanswered';
    }

    const updatedSession = { ...session, answers: newAnswers, questionStatuses: newStatuses };
    setSession(updatedSession);
    quizService.saveQuizProgress(updatedSession);
  };

  const toggleFlag = (questionId: string) => {
    if (!session) return;
    const currentQType = session.questionStatuses[questionId];
    let newStatus: QuestionStatus;
    
    if (currentQType === 'flagged') {
       const isAnswered = session.answers.find(a => a.questionId === questionId)?.selectedOptionId != null;
       newStatus = isAnswered ? 'answered' : 'unanswered';
    } else {
       newStatus = 'flagged';
    }

    const updatedSession = { 
        ...session, 
        questionStatuses: { ...session.questionStatuses, [questionId]: newStatus } 
    };
    setSession(updatedSession);
    quizService.saveQuizProgress(updatedSession);
  };

  const navQuestion = (delta: number) => {
    if (!session) return;
    const nextIdx = session.currentQuestionIndex + delta;
    if (nextIdx >= 0 && nextIdx < session.questions.length) {
      const updated = { ...session, currentQuestionIndex: nextIdx };
      setSession(updated);
      quizService.saveQuizProgress(updated);
    }
  };
  
  const jumpToQuestion = (index: number) => {
    if (!session) return;
    if (index >= 0 && index < session.questions.length) {
      const updated = { ...session, currentQuestionIndex: index };
      setSession(updated);
      quizService.saveQuizProgress(updated);
    }
  };

  const handleSubmit = async (force = false) => {
    if (!session) return;
    const unanswered = session.answers.filter(a => a.selectedOptionId === null).length;
    
    if (unanswered > 0 && !force) {
        setShowConfirm(true);
        return;
    }
    
    setIsSubmitting(true);
    setShowConfirm(false);
    try {
        await quizService.submitQuiz(session.sessionId, session.answers);
        navigate(`/quiz/result/${session.sessionId}`, { replace: true });
    } catch (err) {
        alert('Có lỗi xảy ra khi nộp bài. Vui lòng thử lại.');
        setIsSubmitting(false);
    }
  };

  const handleTimeUp = () => {
      if (!timeUpTriggered.current) {
          timeUpTriggered.current = true;
          alert('Đã hết thời gian làm bài! Hệ thống sẽ tự động nộp bài.');
          handleSubmit(true);
      }
  };

  if (isLoading) {
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)', color: 'var(--accent)', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ width: '2rem', height: '2rem', border: '3px solid var(--accent-soft)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Đang tải bài làm...</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
  }

  if (error || !session) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)' }}>
        <div style={{ textAlign: 'center', background: 'var(--bg-card)', padding: '3rem', borderRadius: '1rem', border: '1px solid var(--border)', maxWidth: '400px' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚧</div>
            <h2 style={{ fontSize: '1.25rem', color: 'var(--text-primary)', marginBottom: '0.75rem' }}>{error || 'Lỗi dữ liệu'}</h2>
            <button 
               onClick={() => navigate('/quiz/generate')}
               style={{ padding: '0.75rem 1.5rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 600, outline: 'none' }}>
               Tạo bài tập mới
            </button>
        </div>
      </div>
    );
  }

  const currentQ = session.questions[session.currentQuestionIndex];
  const currentAns = session.answers.find(a => a.questionId === currentQ.id);
  const currentStatus = session.questionStatuses[currentQ.id];
  const isFirst = session.currentQuestionIndex === 0;
  const isLast = session.currentQuestionIndex === session.questions.length - 1;

  const difficultyNames: Record<string, string> = { 'easy': 'Dễ', 'medium': 'Trung bình', 'hard': 'Khó' };
  const difficultyColors: Record<string, string> = { 'easy': 'var(--success)', 'medium': 'var(--warning)', 'hard': 'var(--danger)' };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-app)',
        color: 'var(--text-primary)',
        fontFamily: 'Inter, sans-serif',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* ── Header ── */}
      <header
        style={{
          height: '4rem',
          background: 'var(--bg-card)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 1.5rem',
          gap: '1.5rem',
          position: 'sticky',
          top: 0,
          zIndex: 50,
          boxShadow: 'var(--shadow)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
            <span style={{ fontSize: '1.5rem' }}>📚</span>
            <div>
                 <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>Đề trắc nghiệm lịch sử</div>
               <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{session.questions.length} câu • Demo mode</div>
            </div>
        </div>

        <div>
            <QuizTimer startedAt={session.startedAt} timeLimit={session.config.timeLimitMinutes} onTimeUp={handleTimeUp} />
        </div>

        <div style={{ flex: 1, display: 'flex', justifyItems: 'flex-end', justifyContent: 'flex-end' }}>
            <button
               disabled={isSubmitting}
               onClick={() => handleSubmit(false)}
               style={{
                   padding: '0.5rem 1.25rem',
                    background: 'var(--danger)',
                    color: '#fff',
                    fontWeight: 600,
                    border: 'none',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px var(--danger-soft)',
                    transition: 'all 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.1)'}
                onMouseLeave={e => e.currentTarget.style.filter = 'none'}
                onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
                onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
            >
                Nộp bài
            </button>
        </div>
      </header>

      {/* ── Main Layout ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          
         {/* Left: Question Area */}
         <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: '2rem 1rem' }}>
             <div style={{ maxWidth: '800px', margin: '0 auto', width: '100%' }}>
                 
                 {/* Question Header */}
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                        Câu {session.currentQuestionIndex + 1}
                        <span style={{ fontSize: '1.1rem', color: 'var(--text-muted)' }}>/{session.questions.length}</span>
                    </h2>

                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {currentQ.grade && (
                             <span style={{ padding: '0.3rem 0.6rem', borderRadius: '0.375rem', background: 'var(--accent-soft)', border: '1px solid var(--border)', color: 'var(--accent)', fontSize: '0.75rem', fontWeight: 600 }}>Lớp {currentQ.grade}</span>
                        )}
                        <span style={{ padding: '0.3rem 0.6rem', borderRadius: '0.375rem', background: 'var(--bg-surface)', border: '1px solid var(--border)', color: difficultyColors[currentQ.difficulty], fontSize: '0.75rem', fontWeight: 600 }}>
                            {difficultyNames[currentQ.difficulty]}
                        </span>
                        {currentQ.topic && (
                             <span style={{ padding: '0.3rem 0.6rem', borderRadius: '0.375rem', background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 500 }}>{currentQ.topic}</span>
                        )}
                    </div>
                 </div>

                 {/* Question Text */}
                 <div style={{ background: 'var(--bg-card)', padding: '1.5rem', borderRadius: '1rem', border: '1px solid var(--border)', marginBottom: '2rem', boxShadow: 'var(--shadow)' }}>
                     <p style={{ fontSize: '1.1rem', lineHeight: 1.6, margin: 0, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                         {currentQ.questionText}
                     </p>
                 </div>

                 {/* Options */}
                 <div style={{ display: 'grid', gap: '1rem', marginBottom: '2rem' }}>
                     {currentQ.options.map(opt => {
                         const isSelected = currentAns?.selectedOptionId === opt.id;
                         return (
                             <button
                                key={opt.id}
                                onClick={() => handleUpdateAnswer(currentQ.id, opt.id)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '1rem',
                                    padding: '1.25rem',
                                    background: isSelected ? 'var(--accent-soft)' : 'var(--bg-card)',
                                    border: isSelected ? '2px solid var(--accent)' : '2px solid var(--border)',
                                    borderRadius: '0.75rem',
                                    color: 'var(--text-primary)',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s',
                                    fontFamily: 'inherit',
                                    boxShadow: isSelected ? 'var(--shadow)' : 'none',
                                }}
                                onMouseEnter={e => {
                                    if (!isSelected) {
                                        e.currentTarget.style.background = 'var(--bg-surface)';
                                        e.currentTarget.style.borderColor = 'var(--accent)';
                                    }
                                }}
                                onMouseLeave={e => {
                                    if (!isSelected) {
                                        e.currentTarget.style.background = 'var(--bg-card)';
                                        e.currentTarget.style.borderColor = 'var(--border)';
                                    }
                                }}
                             >
                                 <div style={{ 
                                     minWidth: '2.25rem', height: '2.25rem', 
                                     borderRadius: '50%', 
                                     background: isSelected ? 'var(--accent)' : 'var(--bg-surface)', 
                                     color: isSelected ? '#fff' : 'var(--text-muted)', 
                                     display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                     fontWeight: 700,
                                     border: '1px solid var(--border)',
                                 }}>
                                    {opt.id}
                                 </div>
                                 <div style={{ fontSize: '1.05rem', lineHeight: 1.5, marginTop: '0.3rem' }}>
                                     {opt.text}
                                 </div>
                             </button>
                         );
                     })}
                 </div>

                 {/* Utilities */}
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <button
                        onClick={() => handleUpdateAnswer(currentQ.id, null)}
                        disabled={!currentAns?.selectedOptionId}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: currentAns?.selectedOptionId ? 'pointer' : 'default', opacity: currentAns?.selectedOptionId ? 1 : 0.5, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem' }}
                     >
                         <span>❌</span> Xóa lựa chọn
                     </button>
                     
                     <button
                        onClick={() => toggleFlag(currentQ.id)}
                        style={{ background: currentStatus === 'flagged' ? 'var(--warning-soft)' : 'transparent', border: currentStatus === 'flagged' ? '1px solid var(--warning)' : '1px solid var(--border)', color: currentStatus === 'flagged' ? 'var(--warning)' : 'var(--text-muted)', padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.15s' }}
                     >
                         <span>{currentStatus === 'flagged' ? '🚩' : '⛳'}</span> {currentStatus === 'flagged' ? 'Đã đánh dấu' : 'Đánh dấu xem lại'}
                     </button>
                 </div>
                 
                 <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '2rem 0' }} />

                 {/* Bottom Navigation */}
                 <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                     <button
                         onClick={() => navQuestion(-1)}
                         disabled={isFirst}
                         style={{ padding: '0.75rem 1.5rem', background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '0.5rem', cursor: isFirst ? 'not-allowed' : 'pointer', opacity: isFirst ? 0.5 : 1, fontWeight: 600 }}
                     >
                         ← Câu trước
                     </button>
                     <button
                         onClick={() => navQuestion(1)}
                         disabled={isLast}
                         style={{ padding: '0.75rem 1.5rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '0.5rem', cursor: isLast ? 'not-allowed' : 'pointer', opacity: isLast ? 0.5 : 1, fontWeight: 600 }}
                     >
                         Câu tiếp theo →
                     </button>
                 </div>
                 
             </div>
         </main>

         {/* Right: Progress Sidebar */}
         <aside className="quiz-progress-sidebar" style={{ width: '280px', background: 'var(--bg-card)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
             <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border)' }}>
                 <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Tiến trình</h3>
             </div>
             
             <div style={{ padding: '1.25rem', overflowY: 'auto', flex: 1 }}>
                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.5rem' }}>
                    {session.questions.map((q, idx) => {
                        const status = session.questionStatuses[q.id];
                        const isCurrent = session.currentQuestionIndex === idx;
                        
                        let bgColor = 'var(--bg-surface)';
                        let borderColor = 'var(--border)';
                        let textColor = 'var(--text-muted)';
                        
                        if (status === 'answered') {
                            bgColor = 'var(--accent)';
                            borderColor = 'var(--accent)';
                            textColor = '#fff';
                        } else if (status === 'flagged') {
                            bgColor = 'var(--warning-soft)';
                            borderColor = 'var(--warning)';
                            textColor = 'var(--warning)';
                        }
                        
                        if (isCurrent) {
                            borderColor = 'var(--text-primary)';
                        }
                        
                        return (
                            <button
                                key={q.id}
                                onClick={() => jumpToQuestion(idx)}
                                style={{
                                    width: '100%',
                                    aspectRatio: '1',
                                    borderRadius: '0.5rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: bgColor,
                                    border: isCurrent ? `2px solid ${borderColor}` : `1px solid ${borderColor}`,
                                    color: textColor,
                                    fontWeight: 700,
                                    fontSize: '0.9rem',
                                    cursor: 'pointer',
                                    boxShadow: isCurrent ? '0 0 0 2px var(--accent-soft)' : 'none'
                                }}
                            >
                                {idx + 1}
                            </button>
                        );
                    })}
                 </div>
             </div>

             <div style={{ padding: '1.25rem', borderTop: '1px solid var(--border)', fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                     <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: 'var(--bg-surface)', border: '1px solid var(--border)' }} /> Chưa làm
                 </div>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                     <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: 'var(--accent)' }} /> Đã làm
                 </div>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                     <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: 'var(--warning-soft)', border: '1px solid var(--warning)' }} /> Đánh dấu xem lại
                 </div>
             </div>
         </aside>
      </div>

      {/* ── Confirm Submit Modal ── */}
      {showConfirm && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
              <div style={{ background: 'var(--bg-card)', borderRadius: '1rem', padding: '2.5rem', maxWidth: '400px', width: '90%', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '1rem', textAlign: 'center' }}>📋</div>
                  <h3 style={{ marginTop: 0, fontSize: '1.25rem', color: 'var(--text-primary)', textAlign: 'center' }}>Nộp bài ngay?</h3>
                  <p style={{ color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '2rem', textAlign: 'center' }}>
                      Bạn còn <span style={{ color: 'var(--danger)', fontWeight: 700 }}>{session.answers.filter(a => a.selectedOptionId === null).length}</span> câu chưa trả lời. 
                      Bạn có chắc chắn muốn nộp bài kết thúc phiên này không?
                  </p>
                  <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                     <button
                        onClick={() => setShowConfirm(false)}
                        style={{ padding: '0.75rem 1.25rem', background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 600 }}
                     >
                         Làm tiếp
                     </button>
                     <button
                        onClick={() => handleSubmit(true)}
                        style={{ padding: '0.75rem 1.25rem', background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 600 }}
                     >
                         Xác nhận nộp
                     </button>
                  </div>
              </div>
          </div>
      )}
      
      <style>{`
          @media (max-width: 768px) {
              .quiz-progress-sidebar {
                  display: none !important;
              }
          }
      `}</style>
    </div>
  );
}
