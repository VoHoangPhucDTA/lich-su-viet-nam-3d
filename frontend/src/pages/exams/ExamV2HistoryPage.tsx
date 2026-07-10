/**
 * Exam history page.
 * Official route: /exams/lich-su
 * Temporary alias: /exams/lich-su-v2
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { fetchBackendAttemptHistory, resultSummaryFromAttempt } from '@/lib/exam/examAttemptSync';
import { formatExamDuration } from '@/lib/exam/durationFormat';
import { formatExamTitle, getExamDisplayYear, getExamSourceLabel } from '@/lib/exam/examDisplay';
import { loadManifest } from '@/lib/exam/manifestLoader';
import { rateScore } from '@/lib/exam/scoring';
import { clearAllV2Results, getAllV2Results } from '@/lib/exam/v2History';
import type { ExamManifestEntry, ExamResultV2 } from '@/types/exam';

const RATING_LABEL: Record<string, string> = {
  gioi: 'Giỏi',
  kha: 'Khá',
  trung_binh: 'TB',
  yeu: 'Yếu',
};

const RATING_COLOR: Record<string, string> = {
  gioi: 'var(--success)',
  kha: 'var(--accent)',
  trung_binh: 'var(--warning)',
  yeu: 'var(--danger)',
};

function formatDate(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return 'Chưa rõ thời gian';
  return new Date(ms).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCustomSubtitle(result: ExamResultV2): string {
  const config = result.config;
  const parts = [
    `${result.totalQuestions ?? result.questions?.length ?? config?.questionCount ?? 0} câu`,
    config?.durationSeconds ? `${Math.round(config.durationSeconds / 60)} phút` : 'Không giới hạn thời gian',
    config?.scopeTitle,
  ].filter(Boolean);
  return parts.join(' · ') || 'Đề tùy chọn';
}

function buildMetaMap(manifest: ExamManifestEntry[]): Map<string, ExamManifestEntry> {
  return new Map(manifest.map((entry) => [entry.examId, entry]));
}

function SummaryStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '0.875rem',
        padding: '1rem 1.25rem',
        minWidth: '8rem',
      }}
    >
      <div style={{ fontSize: '1.55rem', fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>{label}</div>
    </div>
  );
}

function HistoryRow({ result, meta }: { result: ExamResultV2; meta?: ExamManifestEntry }) {
  const rating = rateScore(result.totalScore);
  const color = RATING_COLOR[rating];
  const hasSectionScores = result.questions.length > 0 || result.mcqScore > 0 || result.tfScore > 0;
  const displaySource = meta ?? { examId: result.examId, title: result.title };
  const displayYear = getExamDisplayYear(displaySource);
  const sourceLabel = getExamSourceLabel(displaySource);
  const title = result.isCustom ? result.title ?? 'Thi thử tùy chọn' : formatExamTitle(displaySource);
  const subtitle = meta
    ? [sourceLabel, displayYear || null].filter(Boolean).join(' · ')
    : result.isCustom
      ? formatCustomSubtitle(result)
      : result.examId
      ? [sourceLabel, displayYear || null].filter(Boolean).join(' · ') || 'Không tìm thấy metadata trong manifest'
      : 'Không có mã đề trong kết quả';

  return (
    <article
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        gap: '1rem',
        alignItems: 'center',
        padding: '1rem 1.15rem',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '0.9rem',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <h2 style={{ margin: '0 0 0.35rem', fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.45 }}>
          {title}
        </h2>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', lineHeight: 1.5 }}>
          {subtitle}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
          <InfoPill label="Ngày làm" value={formatDate(result.submittedAt)} />
          <InfoPill label="Thời gian" value={formatExamDuration(result.durationSeconds)} />
          <InfoPill label="Số câu" value={`${result.totalQuestions ?? result.questions.length} câu`} />
        </div>
      </div>

      <div style={{ display: 'grid', gap: '0.75rem', justifyItems: 'end' }}>
        <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <ScoreBlock label="Tổng" value={result.totalScore.toFixed(2)} color={color} />
          {hasSectionScores && (
            <>
              <ScoreBlock label="Trắc nghiệm" value={result.mcqScore.toFixed(2)} color="var(--accent)" />
              <ScoreBlock label="Đúng/Sai" value={result.tfScore.toFixed(2)} color="var(--admin-accent)" />
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span
            style={{
              padding: '0.25rem 0.65rem',
              borderRadius: '999px',
              fontSize: '0.75rem',
              fontWeight: 800,
              background: `color-mix(in srgb, ${color} 14%, transparent)`,
              color,
              border: `1px solid ${color}`,
            }}
          >
            {RATING_LABEL[rating]}
          </span>
          <Link
            to={`/exams/ket-qua/${result.sessionId}`}
            style={{
              padding: '0.65rem 0.95rem',
              background: 'var(--accent)',
              color: '#fff',
              borderRadius: '0.75rem',
              textDecoration: 'none',
              fontWeight: 800,
              fontSize: '0.85rem',
              whiteSpace: 'nowrap',
            }}
          >
            Xem lại bài làm
          </Link>
        </div>
      </div>
    </article>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        gap: '0.35rem',
        alignItems: 'baseline',
        padding: '0.25rem 0.55rem',
        borderRadius: '999px',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        fontSize: '0.75rem',
        color: 'var(--text-muted)',
      }}
    >
      {label}: <strong style={{ color: 'var(--text-secondary)' }}>{value}</strong>
    </span>
  );
}

function ScoreBlock({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ textAlign: 'right', minWidth: '4.25rem' }}>
      <div style={{ fontSize: '1.25rem', fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{label}</div>
    </div>
  );
}

export default function ExamV2HistoryPage() {
  const { isAuthenticated } = useAuth();
  const [results, setResults] = useState<ExamResultV2[]>([]);
  const [metaById, setMetaById] = useState<Map<string, ExamManifestEntry>>(new Map());
  const [loading, setLoading] = useState(true);
  const [manifestWarning, setManifestWarning] = useState<string | null>(null);
  const [historyNotice, setHistoryNotice] = useState<string | null>(null);
  const [isBackendHistory, setIsBackendHistory] = useState(false);

  const stats = useMemo(() => {
    if (results.length === 0) return null;
    const total = results.reduce((sum, result) => sum + result.totalScore, 0);
    const max = Math.max(...results.map((result) => result.totalScore));
    return {
      count: results.length,
      avg: total / results.length,
      max,
    };
  }, [results]);

  async function load() {
    setLoading(true);
    setManifestWarning(null);
    setHistoryNotice(null);
    setIsBackendHistory(false);
    const storedResults = getAllV2Results();

    if (isAuthenticated) {
      try {
        const backendHistory = await fetchBackendAttemptHistory(100);
        if (backendHistory?.items) {
          setResults(backendHistory.items.map(resultSummaryFromAttempt));
          setIsBackendHistory(true);
        } else {
          setResults(storedResults);
          setHistoryNotice('Đang hiển thị lịch sử lưu trên thiết bị này.');
        }
      } catch {
        setResults(storedResults);
        setHistoryNotice('Không thể đồng bộ lịch sử từ máy chủ, đang dùng dữ liệu trên thiết bị.');
      }
    } else {
      setResults(storedResults);
      setHistoryNotice('Đang hiển thị lịch sử lưu trên thiết bị này.');
    }

    try {
      const manifest = await loadManifest();
      setMetaById(buildMetaMap(manifest));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Không rõ nguyên nhân.';
      setMetaById(new Map());
      setManifestWarning(`Không tải được danh mục đề. Lịch sử vẫn hiển thị bằng dữ liệu đã lưu. ${message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [isAuthenticated]);

  function handleClear() {
    if (!confirm('Xóa toàn bộ lịch sử làm bài? Hành động này không thể hoàn tác.')) return;
    clearAllV2Results();
    void load();
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-primary)', padding: '2.5rem 1.5rem' }}>
      <div style={{ maxWidth: '64rem', margin: '0 auto', display: 'grid', gap: '1.5rem' }}>
        <header style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '16rem' }}>
            <Link to="/exams/browse" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.875rem' }}>
              ← Danh sách đề
            </Link>
            <h1 style={{ margin: '0.75rem 0 0.35rem', fontSize: '1.7rem', fontWeight: 900 }}>Lịch sử luyện thi</h1>
            <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Theo dõi các bài thi thử bạn đã hoàn thành.
            </p>
          </div>
          {results.length > 0 && !isBackendHistory && (
            <button
              type="button"
              onClick={handleClear}
              style={{
                padding: '0.55rem 0.9rem',
                background: 'transparent',
                border: '1px solid var(--danger)',
                borderRadius: '0.65rem',
                color: 'var(--danger)',
                fontSize: '0.8rem',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Xóa tất cả
            </button>
          )}
        </header>

        {manifestWarning && (
          <div style={{ background: 'rgba(194,155,75,0.1)', border: '1px solid rgba(194,155,75,0.35)', borderRadius: '0.9rem', padding: '0.9rem 1rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--warning)' }}>Lưu ý: </strong>
            {manifestWarning}
          </div>
        )}

        {historyNotice && (
          <div style={{ background: 'rgba(47,122,87,0.08)', border: '1px solid rgba(47,122,87,0.24)', borderRadius: '0.9rem', padding: '0.85rem 1rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {historyNotice}
          </div>
        )}

        {loading && <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>Đang tải...</div>}

        {!loading && results.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '3.5rem 1.5rem',
              background: 'var(--bg-card)',
              borderRadius: '1.1rem',
              border: '1px solid var(--border)',
            }}
          >
            <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.25rem', color: 'var(--text-primary)' }}>
              Bạn chưa có bài làm nào
            </h2>
            <p style={{ color: 'var(--text-muted)', margin: '0 0 1.5rem' }}>
              Chọn một đề thi thử để bắt đầu lưu lại kết quả luyện thi.
            </p>
            <Link
              to="/exams/browse"
              style={{
                padding: '0.75rem 1.5rem',
                background: 'var(--accent)',
                color: '#fff',
                borderRadius: '0.75rem',
                textDecoration: 'none',
                fontWeight: 800,
              }}
            >
              Làm đề ngay
            </Link>
          </div>
        )}

        {!loading && stats && (
          <>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <SummaryStat label="Bài đã làm" value={`${stats.count}`} color="var(--accent)" />
              <SummaryStat label="Điểm cao nhất" value={stats.max.toFixed(1)} color="var(--admin-accent)" />
              <SummaryStat label="Điểm trung bình" value={stats.avg.toFixed(1)} color="var(--success)" />
            </div>

            <div style={{ display: 'grid', gap: '0.8rem' }}>
              {results.map((result) => (
                <HistoryRow key={result.sessionId} result={result} meta={result.examId ? metaById.get(result.examId) : undefined} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
