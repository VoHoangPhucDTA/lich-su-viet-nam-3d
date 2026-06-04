/**
 * ExamSessionPage – The actual test-taking interface.
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import * as examService from '../../services/examService';
import type { ExamSession, ExamQuestionStatus, ExamAnswer } from '../../types/exam';
import { useAuth } from '../../auth/AuthContext';

import ExamHeader from '../../components/exams/ExamHeader';
import ExamTimer from '../../components/exams/ExamTimer';
import ExamQuestionCard from '../../components/exams/ExamQuestionCard';
import ExamProgressSidebar from '../../components/exams/ExamProgressSidebar';
import ExamNavigation from '../../components/exams/ExamNavigation';
import ExamSubmitDialog from '../../components/exams/ExamSubmitDialog';

export default function ExamSessionPage() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<ExamSession | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Local volatile states
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<ExamAnswer[]>([]);
  const [questionStatuses, setQuestionStatuses] = useState<Record<string, ExamQuestionStatus>>({});
  
  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isTimeUpSignal, setIsTimeUpSignal] = useState(false);

  // 1. Initial Load
  useEffect(() => {
    async function load() {
      if (!examId) return;
      
      const data = await examService.getExamSession(examId);
      if (!data) {
          setLoading(false);
          return;
      }

      // Route protection
      if (data.status === 'submitted') {
          navigate(`/exams/result/${data.examId}`, { replace: true });
          return;
      }

      setSession(data);
      setCurrentIndex(data.currentQuestionIndex);
      setAnswers(data.answers);
      
      // Derive statuses from answers and persisted flagged questions
      const initialStatuses: Record<string, ExamQuestionStatus> = {};
      data.questions.forEach((q) => {
          const ans = data.answers.find(a => a.questionId === q.id);
          const isFlagged = data.flaggedQuestions?.includes(q.id);
          
          if (isFlagged) {
             initialStatuses[q.id] = 'flagged';
          } else {
             initialStatuses[q.id] = ans?.selectedOptionId ? 'answered' : 'unanswered';
          }
      });
      setQuestionStatuses(initialStatuses);
      
      setLoading(false);
    }
    load();
  }, [examId, navigate]);

  // 2. State Sync -> LocalStorage (Throttle/Debounce in real app, straight call here)
  const syncProgress = useCallback((newIndex: number, newAnswers: ExamAnswer[], newStatuses?: Record<string, ExamQuestionStatus>) => {
      if (!session) return;
      
      const statusesToUse = newStatuses || questionStatuses;
      const flagged = Object.entries(statusesToUse)
         .filter(([_, status]) => status === 'flagged')
         .map(([id]) => id);

      const updatedSession: ExamSession = { 
          ...session, 
          currentQuestionIndex: newIndex, 
          answers: newAnswers,
          flaggedQuestions: flagged
      };
      setSession(updatedSession);
      examService.saveExamProgress(updatedSession);
  }, [session, questionStatuses]);

  // 3. Handlers
  const handleSelectOption = (optionId: 'A' | 'B' | 'C' | 'D') => {
      if (!session) return;
      const currentQ = session.questions[currentIndex];
      
      // Update Answers
      const newAnswers = answers.map(a => 
          a.questionId === currentQ.id ? { ...a, selectedOptionId: optionId } : a
      );
      setAnswers(newAnswers);

      // Update Statuses
      const newStatuses = { ...questionStatuses, [currentQ.id]: 'answered' as ExamQuestionStatus };
      setQuestionStatuses(newStatuses);

      syncProgress(currentIndex, newAnswers, newStatuses);
  };

  const handleClearSelection = () => {
      if (!session) return;
      const currentQ = session.questions[currentIndex];
      
      const newAnswers = answers.map(a => 
          a.questionId === currentQ.id ? { ...a, selectedOptionId: null } : a
      );
      setAnswers(newAnswers);

      const newStatuses = { ...questionStatuses, [currentQ.id]: 'unanswered' as ExamQuestionStatus };
      setQuestionStatuses(newStatuses);

      syncProgress(currentIndex, newAnswers, newStatuses);
  };

  const handleToggleFlag = () => {
      if (!session) return;
      const currentQ = session.questions[currentIndex];
      const currentStatus = questionStatuses[currentQ.id];
      const isAns = answers.find(a => a.questionId === currentQ.id)?.selectedOptionId;
      
      const nextStatus = currentStatus === 'flagged' ? (isAns ? 'answered' : 'unanswered') : 'flagged';
      const newStatuses = { ...questionStatuses, [currentQ.id]: nextStatus as ExamQuestionStatus };
      
      setQuestionStatuses(newStatuses);
      syncProgress(currentIndex, answers, newStatuses);
  };

  const handleNavigate = (idx: number) => {
      if (!session || idx < 0 || idx >= session.questions.length) return;
      setCurrentIndex(idx);
      syncProgress(idx, answers);
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmitFlow = () => {
      setDialogOpen(true);
  };

  const { currentUser } = useAuth();

  const executeSubmit = async () => {
      if (!session) return;
      setDialogOpen(false);
      await examService.submitExam(session.examId, answers, currentUser?.id);
      navigate(`/exams/result/${session.examId}`);
  };

  // Render edge cases
  if (loading) {
      return (
          <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)', color: 'var(--accent)', flexDirection: 'column', gap: '1rem' }}>
             <div style={{ width: '2rem', height: '2rem', border: '3px solid var(--accent-soft)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
             <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
             <span>Đang tải đề thi...</span>
          </div>
      );
  }

  if (!session) {
      return (
          <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)' }}>
             <div style={{ textAlign: 'center' }}>
                <h1 style={{ color: 'var(--danger)', marginBottom: '1rem' }}>Đề thi không tồn tại hoặc đã hết hạn</h1>
                <Link to="/exams/create" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Về trang tạo đề mới</Link>
             </div>
          </div>
      );
  }

  const currentQ = session.questions[currentIndex];
  const unansweredCount = answers.filter(a => a.selectedOptionId === null).length;
  const answeredCount = session.questions.length - unansweredCount;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}>
        
        <ExamHeader session={session} onSubmitClick={handleSubmitFlow}>
            {session.remainingSeconds !== undefined && session.remainingSeconds > 0 && (
                <ExamTimer 
                   initialSeconds={session.remainingSeconds} 
                   onTick={(sec) => { session.remainingSeconds = sec; }}
                   onTimeUp={() => { setIsTimeUpSignal(true); setDialogOpen(true); }}
                />
            )}
        </ExamHeader>

        <main style={{ maxWidth: '80rem', margin: '0 auto', padding: '2rem 1.5rem', display: 'flex', gap: '2rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            
            {/* Left/Main Question Area */}
            <div style={{ flex: '1 1 500px', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                
                <ExamQuestionCard 
                   question={currentQ} 
                   index={currentIndex} 
                   total={session.questions.length} 
                   selectedOptionId={answers.find(a => a.questionId === currentQ.id)?.selectedOptionId || null}
                   onSelectOption={handleSelectOption}
                />
                
                <ExamNavigation 
                   currentIndex={currentIndex}
                   total={session.questions.length}
                   onNavigate={handleNavigate}
                   status={questionStatuses[currentQ.id]}
                   onToggleFlag={handleToggleFlag}
                   onClearSelection={handleClearSelection}
                   hasSelection={!!answers.find(a => a.questionId === currentQ.id)?.selectedOptionId}
                />
                
            </div>

            {/* Right Sidebar Progress Map */}
            <div style={{ flex: '0 0 350px', position: 'sticky', top: '5.5rem' }}>
                <ExamProgressSidebar 
                   session={session}
                   currentIndex={currentIndex}
                   onNavigate={handleNavigate}
                   questionStatuses={questionStatuses}
                   answeredCount={answeredCount}
                />
            </div>

        </main>

        <ExamSubmitDialog 
           isOpen={dialogOpen}
           unansweredCount={unansweredCount}
           isTimeUp={isTimeUpSignal}
           onConfirm={executeSubmit}
           onCancel={() => setDialogOpen(false)}
        />
        
        <style>{`
          @media (max-width: 768px) {
            main > div:nth-child(2) {
              position: static !important;
              flex: 1 1 100% !important;
              order: -1; /* Sidebar moves to top on mobile for quick overview */
            }
          }
        `}</style>
    </div>
  );
}
