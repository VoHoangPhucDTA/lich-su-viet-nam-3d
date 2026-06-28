/**
 * ExamTopicPracticePage – Flashcard luyện tập theo chủ đề.
 * Route: /exams/on-chu-de/:topicSlug
 *
 * Flow: chọn câu → nhấn "Kiểm tra" → xem đáp án + giải thích → "Câu tiếp theo"
 * Không timer. Hiển thị điểm bậc thang cho T/F.
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getQuestionRefsByTopic } from '@/lib/exam/topicIndexLoader';
import { loadExams } from '@/lib/exam/examLoader';
import { scoreMCQQuestion, scoreTFQuestion, rateScore } from '@/lib/exam/scoring';
import {
  type Question,
  type MCQAnswer,
  type TFAnswer,
  type QuestionResult,
  isMCQQuestion,
  isTFQuestion,
  flattenExamQuestions,
} from '@/types/exam';
import MCQQuestionCardV2 from '../../components/exams/MCQQuestionCardV2';
import TFQuestionCard from '../../components/exams/TFQuestionCard';

const MAX_QUESTIONS = 30;
const EMPTY_TF: Record<'a' | 'b' | 'c' | 'd', boolean | null> = {
  a: null,
  b: null,
  c: null,
  d: null,
};

function sampleArray<T>(arr: T[], n: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

// ── Summary screen ────────────────────────────────────────────────────────────
function PracticeSummary({
  topic,
  results,
  onRestart,
}: {
  topic: string;
  results: QuestionResult[];
  onRestart: () => void;
}) {
  const totalScore = results.reduce((a, r) => a + r.pointsEarned, 0);
  const correctCount = results.filter((r) => r.isCorrect).length;
  const rating = rateScore((totalScore / results.length) * 10);
  const ratingLabels: Record<string, string> = {
    gioi: 'Giỏi',
    kha: 'Khá',
    trung_binh: 'Trung bình',
    yeu: 'Yếu',
  };
  const ratingColors: Record<string, string> = {
    gioi: 'var(--success)',
    kha: 'var(--accent)',
    trung_binh: 'var(--warning)',
    yeu: 'var(--danger)',
  };

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        borderRadius: '1.5rem',
        padding: '2.5rem',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow)',
        textAlign: 'center',
        maxWidth: '36rem',
        margin: '0 auto',
      }}
    >
      <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>🎉</div>
      <h2
        style={{
          margin: '0 0 0.5rem',
          fontSize: '1.4rem',
          fontWeight: 800,
          color: 'var(--text-primary)',
        }}
      >
        Hoàn thành!
      </h2>
      <p
        style={{
          color: 'var(--text-muted)',
          fontSize: '0.875rem',
          marginBottom: '2rem',
        }}
      >
        {topic}
      </p>

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '2rem',
          marginBottom: '2rem',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              fontSize: '2.5rem',
              fontWeight: 800,
              color: ratingColors[rating],
            }}
          >
            {correctCount}/{results.length}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Câu đúng
          </div>
        </div>
        <div>
          <div
            style={{
              fontSize: '2.5rem',
              fontWeight: 800,
              color: ratingColors[rating],
            }}
          >
            {ratingLabels[rating]}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Xếp loại
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
        <button
          type="button"
          onClick={onRestart}
          style={{
            padding: '0.75rem 1.5rem',
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: '0.875rem',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '0.9rem',
          }}
        >
          Làm lại (bộ mới)
        </button>
        <Link
          to="/exams/on-chu-de"
          style={{
            padding: '0.75rem 1.5rem',
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            borderRadius: '0.875rem',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: '0.9rem',
          }}
        >
          Chủ đề khác
        </Link>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ExamTopicPracticePage() {
  const { topicSlug } = useParams<{ topicSlug: string }>();
  const topic = decodeURIComponent(topicSlug ?? '');

  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState(0); // increment to restart

  // Per-question state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [mcqSelected, setMcqSelected] = useState<'A' | 'B' | 'C' | 'D' | null>(null);
  const [tfSelected, setTfSelected] =
    useState<Record<'a' | 'b' | 'c' | 'd', boolean | null>>(EMPTY_TF);
  const [revealed, setRevealed] = useState(false);
  const [currentResult, setCurrentResult] = useState<QuestionResult | null>(null);
  const [resultsLog, setResultsLog] = useState<QuestionResult[]>([]);

  // ── Load questions ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!topic) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setCurrentIndex(0);
      setMcqSelected(null);
      setTfSelected(EMPTY_TF);
      setRevealed(false);
      setCurrentResult(null);
      setResultsLog([]);

      try {
        const refs = await getQuestionRefsByTopic(topic);
        if (refs.length === 0) {
          if (!cancelled) { setQuestions([]); setLoading(false); }
          return;
        }

        const sampled = refs.length <= MAX_QUESTIONS ? refs : sampleArray(refs, MAX_QUESTIONS);
        const uniqueExamIds = [...new Set(sampled.map((r) => r.examId))];
        const examFiles = await loadExams(uniqueExamIds);

        const qMap = new Map<string, Question>();
        for (const exam of examFiles) {
          for (const q of flattenExamQuestions(exam)) {
            qMap.set(q.id, q);
          }
        }

        const qs: Question[] = [];
        for (const ref of sampled) {
          const q = qMap.get(ref.questionId);
          if (q) qs.push(q);
        }

        if (!cancelled) { setQuestions(qs); setLoading(false); }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Lỗi tải câu hỏi');
          setLoading(false);
        }
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [topic, runId]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleReveal = useCallback(() => {
    const q = questions[currentIndex];
    if (!q) return;

    let result: QuestionResult;
    if (isMCQQuestion(q)) {
      const ans: MCQAnswer | undefined = mcqSelected !== null
        ? { questionId: q.id, questionType: 'mcq', selected: mcqSelected }
        : undefined;
      result = scoreMCQQuestion(q, ans);
    } else if (isTFQuestion(q)) {
      const ans: TFAnswer = { questionId: q.id, questionType: 'true_false', selected: tfSelected };
      result = scoreTFQuestion(q, ans);
    } else {
      return;
    }

    setCurrentResult(result);
    setResultsLog((prev) => [...prev, result]);
    setRevealed(true);
  }, [questions, currentIndex, mcqSelected, tfSelected]);

  const handleNext = useCallback(() => {
    setCurrentIndex((i) => i + 1);
    setMcqSelected(null);
    setTfSelected(EMPTY_TF);
    setRevealed(false);
    setCurrentResult(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleRestart = useCallback(() => {
    setRunId((id) => id + 1); // triggers useEffect to reload questions
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem', background: 'var(--bg-app)', color: 'var(--accent)' }}>
        <div style={{ width: '2rem', height: '2rem', border: '3px solid var(--accent-soft)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <span style={{ color: 'var(--text-muted)' }}>Đang tải câu hỏi...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--danger)', marginBottom: '1rem' }}>{error}</p>
          <Link to="/exams/on-chu-de" style={{ color: 'var(--accent)' }}>← Quay lại</Link>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>Không có câu hỏi nào cho chủ đề này.</p>
          <Link to="/exams/on-chu-de" style={{ color: 'var(--accent)' }}>← Chọn chủ đề khác</Link>
        </div>
      </div>
    );
  }

  // Summary screen
  if (currentIndex >= questions.length) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-app)', padding: '2.5rem 1.5rem' }}>
        <PracticeSummary topic={topic} results={resultsLog} onRestart={handleRestart} />
      </div>
    );
  }

  const currentQ = questions[currentIndex];
  const hasAnswer = isMCQQuestion(currentQ)
    ? mcqSelected !== null
    : Object.values(tfSelected).some((v) => v !== null);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-primary)' }}>
      {/* Header */}
      <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '0.875rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <Link to="/exams/on-chu-de" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.875rem', flexShrink: 0 }}>
          ← Chủ đề
        </Link>
        <span style={{ flex: 1, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={topic}>
          {topic}
        </span>
        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0 }}>
          {currentIndex + 1} / {questions.length}
        </span>
      </div>

      {/* Progress bar */}
      <div style={{ height: '3px', background: 'var(--bg-surface)' }}>
        <div style={{ height: '100%', background: 'var(--accent)', width: `${((currentIndex + (revealed ? 1 : 0)) / questions.length) * 100}%`, transition: 'width 0.3s' }} />
      </div>

      {/* Content */}
      <div style={{ maxWidth: '42rem', margin: '0 auto', padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

        {/* Running score (if any revealed) */}
        {resultsLog.length > 0 && (
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Đúng: <strong style={{ color: 'var(--success)' }}>{resultsLog.filter(r => r.isCorrect).length}</strong>
              &nbsp;/ {resultsLog.length}
            </span>
          </div>
        )}

        {/* MCQ question */}
        {isMCQQuestion(currentQ) && (
          <MCQQuestionCardV2
            question={currentQ}
            index={currentIndex}
            total={questions.length}
            selectedOptionId={!revealed ? mcqSelected : (currentResult?.mcq?.selected ?? null)}
            onSelectOption={(id) => { if (!revealed) setMcqSelected(id); }}
            reviewMode={revealed}
            result={currentResult ?? undefined}
          />
        )}

        {/* T/F question */}
        {isTFQuestion(currentQ) && (
          <TFQuestionCard
            question={currentQ}
            index={currentIndex}
            total={questions.length}
            selected={revealed ? (currentResult?.tf?.selected ?? EMPTY_TF) : tfSelected}
            onSelect={(stmtId, value) => {
              if (!revealed) {
                setTfSelected((prev) => ({ ...prev, [stmtId]: value }));
              }
            }}
            reviewMode={revealed}
            result={currentResult ?? undefined}
          />
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          {!revealed ? (
            <button
              type="button"
              onClick={handleReveal}
              disabled={!hasAnswer}
              style={{
                padding: '0.75rem 2rem',
                background: hasAnswer ? 'var(--accent)' : 'var(--bg-surface)',
                color: hasAnswer ? '#fff' : 'var(--text-muted)',
                border: 'none',
                borderRadius: '0.875rem',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: hasAnswer ? 'pointer' : 'not-allowed',
                transition: 'all 0.15s',
              }}
            >
              Kiểm tra đáp án
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNext}
              style={{
                padding: '0.75rem 2rem',
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: '0.875rem',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: 'pointer',
              }}
            >
              {currentIndex + 1 >= questions.length ? 'Xem kết quả →' : 'Câu tiếp theo →'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
