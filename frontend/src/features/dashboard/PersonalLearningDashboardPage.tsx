import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import type { DashboardAnalyticsRequest } from '@/services/dashboardAnalyticsApi';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Brain,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  CircleHelp,
  Clock3,
  FileQuestion,
  Gauge,
  History,
  ListChecks,
  SlidersHorizontal,
  Target,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DashboardDevelopmentFixtureLoader } from './dashboardFixtures';
import { formatDashboardDuration, formatDashboardScore } from './dashboardFormatters';
import type { DashboardLocalStorageProvider } from './localAnalytics/localDashboardSource';
import { usePersonalLearningDashboard } from './usePersonalLearningDashboard';
import type {
  CognitivePerformance,
  DashboardNotice,
  DashboardRange,
  InsightStatus,
  LearningInsight,
  PersonalLearningDashboardViewModel,
  QuestionTypePerformance,
  RecentAttemptItem,
} from './dashboardTypes';
import './personalLearningDashboard.css';

const RANGE_OPTIONS: Array<{ value: DashboardRange; label: string }> = [
  { value: '7d', label: '7 ngày' },
  { value: '30d', label: '30 ngày' },
  { value: '90d', label: '90 ngày' },
  { value: 'all', label: 'Tất cả' },
];

const confidenceLabels = { low: 'Độ tin cậy thấp', medium: 'Độ tin cậy trung bình', high: 'Độ tin cậy cao' } as const;
const confidenceShortLabels = { low: 'Thấp', medium: 'Trung bình', high: 'Cao' } as const;
const statusLabels = {
  strength: 'Điểm mạnh',
  developing: 'Đang phát triển',
  weakness: 'Cần cải thiện',
  'insufficient-data': 'Chưa đủ dữ liệu',
} as const;

function DashboardStatusIcon({ status }: { status: InsightStatus }) {
  const props = { size: 13, strokeWidth: 2.2, 'aria-hidden': true } as const;
  if (status === 'strength') return <CheckCircle2 {...props} />;
  if (status === 'weakness') return <AlertTriangle {...props} />;
  if (status === 'developing') return <TrendingUp {...props} />;
  return <CircleHelp {...props} />;
}

function statusFromAccuracy(accuracy: number | null): InsightStatus {
  if (accuracy === null) return 'insufficient-data';
  if (accuracy >= 80) return 'strength';
  if (accuracy < 60) return 'weakness';
  return 'developing';
}

function insightCaution(item: LearningInsight) {
  const summary = item.summary.toLocaleLowerCase('vi-VN');
  if (item.confidence === 'low' || summary.includes('mẫu còn ít')) return 'Mẫu dữ liệu còn ít.';
  if (summary.includes('dữ liệu chi tiết') || summary.includes('phần dữ liệu')) {
    return 'Chỉ phản ánh phần dữ liệu chi tiết hiện có.';
  }
  if (summary.includes('thận trọng') || summary.includes('chưa đầy đủ')) return item.summary;
  return null;
}

function sourceLabel(source: PersonalLearningDashboardViewModel['scope']['source']) {
  if (source === 'local') return 'Thiết bị này';
  if (source === 'backend') return 'Máy chủ';
  if (source === 'local-fallback') return 'Dữ liệu cục bộ dự phòng';
  return 'Dữ liệu đã hợp nhất';
}

function DashboardTimeRangeFilter({ value, onChange }: { value: DashboardRange; onChange: (range: DashboardRange) => void }) {
  return (
    <div className="dashboard-range" role="group" aria-label="Khoảng thời gian thống kê">
      {RANGE_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function DashboardPageHeader({ vm, range, onRangeChange }: {
  vm: PersonalLearningDashboardViewModel;
  range: DashboardRange;
  onRangeChange: (range: DashboardRange) => void;
}) {
  const from = vm.scope.fromDate ? `Từ ${vm.scope.fromDate}` : 'Toàn bộ thời gian';
  const showScope = vm.state !== 'loading'
    && !vm.notices.some((notice) => notice.id === 'authentication-required');
  return (
    <header className="dashboard-page-header">
      <div className="dashboard-heading-copy">
        <p className="dashboard-eyebrow">Luyện thi THPT</p>
        <h1>Tổng quan học tập</h1>
        <p>Nhìn lại kết quả, hiểu phần cần cải thiện và chọn bước ôn tập tiếp theo.</p>
        {showScope && (
          <p className="dashboard-scope-line">
            {from} · đến trước {vm.scope.toDateExclusive} · {sourceLabel(vm.scope.source)}
          </p>
        )}
      </div>
      <DashboardTimeRangeFilter value={range} onChange={onRangeChange} />
    </header>
  );
}

function DashboardNoticeBanner({ notice }: { notice: DashboardNotice }) {
  return (
    <section
      className={`dashboard-notice dashboard-notice-${notice.type}`}
      role={notice.type === 'error' ? 'alert' : undefined}
      aria-label={notice.title}
    >
      <div>
        <strong>{notice.title}</strong>
        <p>{notice.message}</p>
      </div>
      {notice.actionLabel && notice.actionRoute && (
        <Link className="dashboard-text-link" to={notice.actionRoute}>{notice.actionLabel}</Link>
      )}
    </section>
  );
}

function hasNotice(vm: PersonalLearningDashboardViewModel, id: string) {
  return vm.notices.some((notice) => notice.id === id);
}

function readyNotices(vm: PersonalLearningDashboardViewModel) {
  if (hasNotice(vm, 'backend-unavailable')) {
    return vm.notices.filter((notice) => notice.id === 'backend-unavailable');
  }
  return vm.notices.filter((notice) => (
    notice.id !== 'coverage-partial'
    && notice.id !== 'fetch-cap'
    && notice.id !== 'dense-chart'
  ));
}

function DashboardRecommendationCard({ vm }: { vm: PersonalLearningDashboardViewModel }) {
  const recommendation = vm.recommendations[0];
  if (!recommendation) return null;
  return (
    <section className="dashboard-recommendation" aria-labelledby="dashboard-recommendation-title">
      <div>
        <p className="dashboard-section-kicker">Gợi ý ôn tập hôm nay</p>
        <h2 id="dashboard-recommendation-title">{recommendation.title}</h2>
        <p className="dashboard-recommendation-reason">{recommendation.reason}</p>
        {recommendation.evidence ? (
          <dl className="dashboard-evidence" aria-label="Bằng chứng cho gợi ý ôn tập">
            <div><dt>Độ chính xác</dt><dd>{recommendation.evidence.accuracy.toLocaleString('vi-VN')}%</dd></div>
            <div><dt>Kết quả</dt><dd>{recommendation.evidence.correctUnits}/{recommendation.evidence.totalUnits} ý đúng</dd></div>
            <div><dt>Số bài</dt><dd>{recommendation.evidence.attemptCount} bài</dd></div>
            <div><dt>Độ tin cậy</dt><dd>{confidenceShortLabels[recommendation.evidence.confidence]}</dd></div>
          </dl>
        ) : null}
      </div>
      <Link className="dashboard-primary-action" to={recommendation.actionRoute}>
        {recommendation.actionLabel}<ArrowRight aria-hidden="true" />
      </Link>
    </section>
  );
}

function DashboardKpiGrid({ vm }: { vm: PersonalLearningDashboardViewModel }) {
  const items = [
    { label: 'Số bài đã làm', value: vm.summary.totalAttempts.toLocaleString('vi-VN'), suffix: 'bài', icon: <ListChecks aria-hidden="true" /> },
    { label: 'Điểm trung bình', value: formatDashboardScore(vm.summary.averageScore), suffix: '/10', icon: <Gauge aria-hidden="true" /> },
    { label: 'Điểm cao nhất', value: formatDashboardScore(vm.summary.highestScore), suffix: '/10', icon: <Trophy aria-hidden="true" /> },
    { label: 'Điểm gần nhất', value: formatDashboardScore(vm.summary.latestScore), suffix: '/10', icon: <Clock3 aria-hidden="true" /> },
  ];
  return (
    <section className="dashboard-card dashboard-kpi-surface" aria-labelledby="dashboard-kpi-title">
      <h2 id="dashboard-kpi-title" className="dashboard-visually-hidden">Chỉ số tổng hợp</h2>
      <div className="dashboard-kpi-grid">
        {items.map((item) => (
          <article className="dashboard-kpi-card" key={item.label} aria-label={`${item.label}: ${item.value} ${item.suffix}`}>
            <div className="dashboard-kpi-heading"><p>{item.label}</p><span className="dashboard-kpi-icon">{item.icon}</span></div>
            <div className="dashboard-kpi-value"><strong>{item.value}</strong><span>{item.suffix}</span></div>
          </article>
        ))}
      </div>
    </section>
  );
}

function DashboardScoreTrend({ vm }: { vm: PersonalLearningDashboardViewModel }) {
  const { points, sourceAttemptCount, isComplete, granularity } = vm.scoreTrend;
  const highestPoint = points.reduce<(typeof points)[number] | null>((highest, point) => (
    highest === null || point.score > highest.score ? point : highest
  ), null);
  const latestPoint = points.at(-1) ?? null;
  const summary = points.length === 0
    ? 'Chưa có điểm để hiển thị.'
    : points.length === 1
      ? `Một điểm ${formatDashboardScore(points[0].score)} trên 10; chưa đủ dữ liệu để nhận xét xu hướng.`
      : `${points.length} điểm biểu diễn ${sourceAttemptCount} bài nguồn, từ ${formatDashboardScore(points[0].score)} đến ${formatDashboardScore(points.at(-1)?.score ?? null)} trên 10.`;
  return (
    <section className="dashboard-card dashboard-chart-card" aria-labelledby="dashboard-trend-title">
      <div className="dashboard-section-heading">
        <div>
          <p className="dashboard-section-kicker">Điểm số</p>
          <h2 id="dashboard-trend-title">Xu hướng điểm</h2>
          <p className="dashboard-section-description">
            {points.length.toLocaleString('vi-VN')} điểm đang hiển thị từ {sourceAttemptCount.toLocaleString('vi-VN')} bài nguồn · {granularity === 'attempt' ? 'theo bài' : 'theo ngày'}
          </p>
        </div>
        {points.length > 1 && (
          <div className="dashboard-chart-highlights" aria-label="Điểm nổi bật trên biểu đồ">
            <span><small>Cao nhất</small><strong>{formatDashboardScore(highestPoint?.score ?? null)}</strong></span>
            <span><small>Gần nhất</small><strong>{formatDashboardScore(latestPoint?.score ?? null)}</strong></span>
          </div>
        )}
      </div>
      {!isComplete && points.length > 0 && (
        <p className="dashboard-inline-warning">Chuỗi điểm chưa bao phủ toàn bộ dữ liệu nguồn.</p>
      )}
      {points.length === 0 ? (
        <div className="dashboard-chart-empty">Chưa có dữ liệu điểm trong khoảng thời gian này.</div>
      ) : points.length === 1 ? (
        <div className="dashboard-one-point" aria-label={summary}>
          <span aria-hidden="true" />
          <strong>{formatDashboardScore(points[0].score)}/10</strong>
          <p>Chưa đủ dữ liệu để nhận xét xu hướng.</p>
        </div>
      ) : (
        <div className="dashboard-chart" role="img" aria-label={`Biểu đồ xu hướng điểm. ${summary}`}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 16, right: 10, bottom: 8, left: -20 }}>
              <CartesianGrid stroke="var(--dashboard-grid)" strokeDasharray="3 5" vertical={false} />
              <XAxis dataKey="dateLabel" interval="preserveStartEnd" minTickGap={32} tick={{ fill: 'var(--dashboard-muted)', fontSize: 12 }} />
              <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={{ fill: 'var(--dashboard-muted)', fontSize: 12 }} />
              <Tooltip
                formatter={(value) => [`${formatDashboardScore(Number(value))}/10`, 'Điểm']}
                labelFormatter={(label) => `Ngày ${String(label)}`}
                contentStyle={{ background: 'var(--dashboard-card)', borderColor: 'var(--dashboard-border)', borderRadius: 10 }}
              />
              <Area type="monotone" dataKey="score" fill="var(--dashboard-accent)" fillOpacity={0.08} stroke="none" isAnimationActive={false} />
              <Line
                type="monotone"
                dataKey="score"
                stroke="var(--dashboard-accent)"
                strokeWidth={3}
                dot={{ r: 4.5, fill: 'var(--dashboard-card)', strokeWidth: 2.5 }}
                activeDot={{ r: 6 }}
                isAnimationActive={false}
              />
              {highestPoint && <ReferenceDot x={highestPoint.dateLabel} y={highestPoint.score} r={6.5} fill="var(--dashboard-strength)" stroke="var(--dashboard-card)" strokeWidth={2.5} />}
              {latestPoint && <ReferenceDot x={latestPoint.dateLabel} y={latestPoint.score} r={6.5} fill="var(--dashboard-primary)" stroke="var(--dashboard-card)" strokeWidth={2.5} />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="dashboard-chart-summary">{summary}</p>
      {points.length > 0 && (
        <details className="dashboard-data-details">
          <summary>Xem dữ liệu biểu đồ</summary>
          <ol>
            {points.map((point) => (
              <li key={point.attemptId}>
                <time dateTime={point.submittedAt}>{point.dateLabel}</time>: {point.title} — {formatDashboardScore(point.score)}/10
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}

function DashboardInsightItem({ item, interactive = false }: { item: LearningInsight; interactive?: boolean }) {
  const caution = insightCaution(item);
  return (
    <li className={`dashboard-insight-item dashboard-insight-${item.status}`}>
      <div className="dashboard-insight-topline">
        <div className="dashboard-insight-name">
          <h3>{interactive && item.practiceRoute
            ? <Link className="dashboard-topic-link" to={item.practiceRoute}>{item.label}</Link>
            : item.label}</h3>
          <span className={`dashboard-status dashboard-status-${item.status}`}>
            <DashboardStatusIcon status={item.status} />
            {statusLabels[item.status]}
          </span>
        </div>
        <div className="dashboard-insight-result">
          <strong className={`dashboard-accuracy dashboard-accuracy-${item.status}`}>{item.accuracy.toLocaleString('vi-VN')}%</strong>
          {interactive && item.practiceRoute && <ArrowRight aria-hidden="true" />}
        </div>
      </div>
      <div
        className={`dashboard-meter dashboard-meter-${item.status}`}
        role="progressbar"
        aria-label={`Độ chính xác ${item.label}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={item.accuracy}
      >
        <span style={{ width: `${item.accuracy}%` }} />
      </div>
      <p className="dashboard-insight-meta">{item.correctUnits}/{item.totalUnits} ý · {item.attemptCount} bài · {confidenceLabels[item.confidence]}</p>
      {caution && <p className="dashboard-caution">{caution}</p>}
    </li>
  );
}

function DashboardInsightSection({ vm }: { vm: PersonalLearningDashboardViewModel }) {
  if (vm.strengths.length === 0 && vm.weaknesses.length === 0) {
    return (
      <section className="dashboard-card dashboard-empty-section dashboard-insight-insufficient" aria-labelledby="dashboard-insight-title">
        <span className="dashboard-empty-icon"><CircleHelp aria-hidden="true" /></span>
        <p className="dashboard-section-kicker">Phân tích chủ đề</p>
        <h2 id="dashboard-insight-title">Điểm mạnh và nội dung cần cải thiện</h2>
        <p>Chưa đủ dữ liệu để gắn nhãn. Cần ít nhất 8 ý trả lời trong ít nhất 2 bài.</p>
      </section>
    );
  }
  return (
    <section className="dashboard-card dashboard-insight-surface" aria-labelledby="dashboard-insight-title">
      <div className="dashboard-section-heading dashboard-insight-heading">
        <div>
          <p className="dashboard-section-kicker">Phân tích chủ đề</p>
          <h2 id="dashboard-insight-title">Điểm mạnh và nội dung cần cải thiện</h2>
          <p className="dashboard-section-description">Những chủ đề nổi bật và phần nên ưu tiên trong lượt ôn tiếp theo.</p>
        </div>
      </div>
      <div className="dashboard-two-column dashboard-insight-grid" data-card-alignment="start">
        <div className="dashboard-insight-group dashboard-insight-group-strength">
          <h3><span><CheckCircle2 aria-hidden="true" />Điểm mạnh</span><small>{vm.strengths.length} chủ đề · từ 80%</small></h3>
          {vm.strengths.length ? <ul>{vm.strengths.map((item) => <DashboardInsightItem key={item.key} item={item} />)}</ul> : <p>Chưa có chủ đề đạt ngưỡng.</p>}
        </div>
        <div className="dashboard-insight-group dashboard-insight-group-weakness">
          <h3><span><AlertTriangle aria-hidden="true" />Cần cải thiện</span><small>{vm.weaknesses.length} chủ đề · dưới 60%</small></h3>
          {vm.weaknesses.length ? (
            <>
              <ul>{vm.weaknesses.map((item) => <DashboardInsightItem key={item.key} item={item} interactive />)}</ul>
              {vm.weaknesses[0].practiceRoute && (
                <Link className="dashboard-weakness-action" to={vm.weaknesses[0].practiceRoute}>
                  Ôn các chủ đề yếu<ArrowRight aria-hidden="true" />
                </Link>
              )}
            </>
          ) : <p>Chưa xác định được chủ đề yếu.</p>}
        </div>
      </div>
    </section>
  );
}

function QuestionTypeItem({ item }: { item: QuestionTypePerformance }) {
  const status = statusFromAccuracy(item.accuracy);
  const summary = item.type === 'mcq'
    ? `${item.correctUnits}/${item.totalUnits} câu đúng · ${item.blankUnits} câu bỏ trống`
    : `${item.correctUnits}/${item.totalUnits} mệnh đề đúng · ${item.blankUnits} bỏ trống · ${item.partialQuestionCount}/${item.totalQuestionCount} câu làm dở`;
  return (
    <li className={`dashboard-performance-item dashboard-performance-${status}`}>
      <div className="dashboard-performance-title">
        <div className="dashboard-performance-name">
          <span>{item.type === 'mcq' ? <FileQuestion aria-hidden="true" /> : <ListChecks aria-hidden="true" />}</span>
          <h3>{item.label}</h3>
        </div>
        <strong className={`dashboard-accuracy dashboard-accuracy-${status}`}>{item.accuracy === null ? '—' : `${item.accuracy.toLocaleString('vi-VN')}%`}</strong>
      </div>
      <div
        className={`dashboard-meter dashboard-meter-${status}`}
        role="progressbar"
        aria-label={`Độ chính xác ${item.label}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={item.accuracy ?? undefined}
      ><span style={{ width: `${item.accuracy ?? 0}%` }} /></div>
      <p>{summary}</p>
    </li>
  );
}

function DashboardQuestionTypePerformance({ items }: { items: QuestionTypePerformance[] }) {
  return (
    <section className="dashboard-card dashboard-performance-card dashboard-question-type-card" aria-labelledby="dashboard-question-type-title">
      <div className="dashboard-section-heading">
        <div>
          <p className="dashboard-section-kicker">Chi tiết năng lực</p>
          <h2 id="dashboard-question-type-title">Hiệu suất theo dạng câu</h2>
          <p className="dashboard-section-description">So sánh độ chính xác giữa hai cấu trúc câu hỏi trong bài thi.</p>
        </div>
      </div>
      {items.length ? <ul>{items.map((item) => <QuestionTypeItem key={item.type} item={item} />)}</ul> : <p>Chưa có dữ liệu chi tiết theo dạng câu.</p>}
    </section>
  );
}

function CognitiveItem({ item }: { item: CognitivePerformance }) {
  const hasSmallSample = item.confidence === 'low' || item.status === 'insufficient-data';
  return (
    <li className={`dashboard-performance-item dashboard-performance-${item.status}`}>
      <div className="dashboard-performance-title">
        <h3>{item.label}</h3>
        <span className={`dashboard-status dashboard-status-${item.status}`}>
          <DashboardStatusIcon status={item.status} />
          {statusLabels[item.status]}
        </span>
      </div>
      <div
        className={`dashboard-meter dashboard-meter-${item.status}`}
        role="progressbar"
        aria-label={`Độ chính xác ${item.label}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={item.accuracy ?? undefined}
      ><span style={{ width: `${item.accuracy ?? 0}%` }} /></div>
      <p><strong className={`dashboard-accuracy dashboard-accuracy-${item.status}`}>{item.accuracy === null ? '—' : `${item.accuracy.toLocaleString('vi-VN')}%`}</strong> · {item.correctUnits}/{item.totalUnits} ý</p>
      <p>{item.attemptCount} bài · {confidenceLabels[item.confidence]}</p>
      {hasSmallSample && <p className="dashboard-caution">Mẫu dữ liệu còn ít.</p>}
    </li>
  );
}

function DashboardCognitivePerformance({ items }: { items: CognitivePerformance[] }) {
  return (
    <section className="dashboard-card dashboard-performance-card dashboard-cognitive-card" aria-labelledby="dashboard-cognitive-title">
      <div className="dashboard-rail-heading">
        <span><Brain aria-hidden="true" /></span>
        <div><p className="dashboard-section-kicker">Năng lực tư duy</p><h2 id="dashboard-cognitive-title">Mức nhận thức</h2></div>
      </div>
      {items.length ? <ul>{items.map((item) => <CognitiveItem key={item.level} item={item} />)}</ul> : <p>Chưa có dữ liệu chi tiết theo mức nhận thức.</p>}
    </section>
  );
}

function detailStatusLabel(status: RecentAttemptItem['detailStatus']) {
  if (status === 'full') return 'Đủ dữ liệu chi tiết';
  if (status === 'summary-only') return 'Chỉ có dữ liệu tổng quan';
  return 'Không có dữ liệu chi tiết';
}

function DashboardRecentAttemptItem({ attempt }: { attempt: RecentAttemptItem }) {
  return (
    <li>
      <article className="dashboard-attempt-row">
        <strong className="dashboard-attempt-score">{formatDashboardScore(attempt.score)}<small>/10</small></strong>
        <div className="dashboard-attempt-copy">
          <h3>{attempt.title}</h3>
          <p>{attempt.modeLabel} · <time dateTime={attempt.submittedAt}>{attempt.submittedLabel}</time></p>
          <p>{formatDashboardDuration(attempt.durationSeconds)} · {attempt.totalQuestions} câu · {detailStatusLabel(attempt.detailStatus)}</p>
        </div>
        {attempt.resultRoute
          ? <Link className="dashboard-attempt-action" aria-label={`Xem lại bài làm: ${attempt.title}`} to={attempt.resultRoute}>Xem lại<ArrowRight aria-hidden="true" /></Link>
          : <span className="dashboard-attempt-action dashboard-attempt-action-disabled" aria-label="Không có dữ liệu xem lại an toàn">Chỉ tổng quan</span>}
      </article>
    </li>
  );
}

function DashboardRecentAttempts({ items }: { items: RecentAttemptItem[] }) {
  const shown = items.slice(0, 5);
  return (
    <section className="dashboard-card dashboard-history" aria-labelledby="dashboard-history-title">
      <div className="dashboard-section-heading">
        <div><p className="dashboard-section-kicker">{shown.length} bài gần nhất</p><h2 id="dashboard-history-title">Lịch sử gần đây</h2></div>
        <Link className="dashboard-text-link" to="/exams/lich-su">Xem toàn bộ lịch sử<ArrowRight aria-hidden="true" /></Link>
      </div>
      {shown.length ? <ul>{shown.map((item) => <DashboardRecentAttemptItem key={item.attemptId} attempt={item} />)}</ul> : <p>Chưa có bài thi nào.</p>}
    </section>
  );
}

function DashboardQuickActions({ vm, embedded = false }: { vm: PersonalLearningDashboardViewModel; embedded?: boolean }) {
  const topicRoute = vm.recommendations.find((item) => item.topicKey)?.actionRoute
    ?? vm.weaknesses.find((item) => item.practiceRoute)?.practiceRoute;
  const actions = [
    { label: 'Duyệt kho đề', description: 'Chọn một đề thi phù hợp', route: '/exams/browse', icon: <BookOpen aria-hidden="true" /> },
    { label: 'Tạo đề tùy chọn', description: 'Tự chọn cấu trúc bài thi', route: '/exams/tao-de', icon: <SlidersHorizontal aria-hidden="true" /> },
    ...(topicRoute ? [{ label: 'Ôn chủ đề yếu', description: 'Luyện phần cần cải thiện', route: topicRoute, icon: <Target aria-hidden="true" /> }] : []),
    { label: 'Xem toàn bộ lịch sử', description: 'Mở danh sách bài đã làm', route: '/exams/lich-su', icon: <History aria-hidden="true" /> },
  ];
  const unique = actions.filter((item, index) => actions.findIndex((candidate) => candidate.route === item.route) === index);
  return (
    <nav className={`dashboard-card dashboard-quick-actions${embedded ? ' dashboard-actions-card' : ''}`} aria-labelledby="dashboard-actions-title">
      <div className="dashboard-rail-heading">
        <span><Target aria-hidden="true" /></span>
        <div><p className="dashboard-section-kicker">Tiếp tục học</p><h2 id="dashboard-actions-title">Bước tiếp theo</h2></div>
      </div>
      <ul>{unique.map((action) => (
        <li key={action.route}>
          <Link to={action.route}>
            <span className="dashboard-action-icon">{action.icon}</span>
            <span className="dashboard-action-copy"><strong>{action.label}</strong><span>{action.description}</span></span>
            <ArrowRight className="dashboard-action-arrow" aria-hidden="true" />
          </Link>
        </li>
      ))}</ul>
    </nav>
  );
}

function DashboardUtilityRail({ vm }: { vm: PersonalLearningDashboardViewModel }) {
  const coverage = vm.coverage;
  return (
    <aside
      className="dashboard-utility dashboard-utility-surface"
      aria-label="Tóm tắt và hành động nhanh"
      data-scroll-behavior="document-flow"
      data-scroll-owner="app-scroll-container"
    >
      <section className="dashboard-card dashboard-activity-card" aria-labelledby="dashboard-utility-title">
        <div className="dashboard-rail-heading">
          <span><Activity aria-hidden="true" /></span>
          <div><p className="dashboard-section-kicker">Hoạt động trong kỳ</p><h2 id="dashboard-utility-title">Nhịp học tập</h2></div>
        </div>
        <div className="dashboard-activity-stats">
          <article><CalendarDays aria-hidden="true" /><strong>{vm.summary.activeDays}</strong><span>ngày hoạt động</span></article>
          <article><Clock3 aria-hidden="true" /><strong>{formatDashboardDuration(vm.summary.totalDurationSeconds)}</strong><span>tổng thời gian</span></article>
        </div>
        <p className="dashboard-rail-note">Số ngày có bài thi trong kỳ đã chọn.</p>
      </section>
      <DashboardCognitivePerformance items={vm.cognitivePerformance} />
      <section className="dashboard-card dashboard-coverage" aria-labelledby="dashboard-coverage-title">
        <div className="dashboard-rail-heading">
          <span><Gauge aria-hidden="true" /></span>
          <div><p className="dashboard-section-kicker">Nguồn số liệu</p><h2 id="dashboard-coverage-title">Phạm vi dữ liệu</h2></div>
        </div>
        <dl>
          <div><dt>Tổng bài</dt><dd>{coverage.totalKnownAttempts}</dd></div>
          <div><dt>Đủ dữ liệu chi tiết</dt><dd>{coverage.detailedAttemptCount}</dd></div>
          <div><dt>Bài nguồn biểu đồ</dt><dd>{vm.scoreTrend.sourceAttemptCount}</dd></div>
          <div><dt>Điểm trên biểu đồ</dt><dd>{vm.scoreTrend.points.length}</dd></div>
        </dl>
        <p className="dashboard-coverage-note">Điểm phục vụ mục đích học tập, chưa được máy chủ chấm lại.</p>
      </section>
      <DashboardQuickActions vm={vm} embedded />
    </aside>
  );
}

function DashboardLoadingState() {
  return (
    <main className="dashboard-content" aria-busy="true">
      <p className="dashboard-live-status" role="status">Đang tải thống kê học tập…</p>
      <div className="dashboard-skeleton dashboard-skeleton-layout" aria-hidden="true">
        <div className="dashboard-skeleton-main">
          <div className="dashboard-skeleton-recommendation" />
          <div className="dashboard-skeleton-kpis">{Array.from({ length: 4 }, (_, index) => <div key={index} className="dashboard-skeleton-card" />)}</div>
          <div className="dashboard-skeleton-chart" />
          <div className="dashboard-skeleton-insight" />
          <div className="dashboard-skeleton-question" />
          <div className="dashboard-skeleton-history" />
        </div>
        <aside className="dashboard-skeleton-utility">
          <div className="dashboard-skeleton-utility-card" />
          <div className="dashboard-skeleton-cognitive" />
          <div className="dashboard-skeleton-coverage" />
          <div className="dashboard-skeleton-actions" />
        </aside>
      </div>
    </main>
  );
}

function DashboardErrorState({ vm, onRetry }: { vm: PersonalLearningDashboardViewModel; onRetry: () => void }) {
  const notice = vm.notices.find((item) => item.type === 'error');
  return (
    <main className="dashboard-content dashboard-state-content">
      <section className="dashboard-card dashboard-state-card dashboard-error-state" role="alert" aria-labelledby="dashboard-error-title">
        <h2 id="dashboard-error-title">{notice?.title ?? 'Không thể tải thống kê học tập'}</h2>
        <p>{notice?.message ?? 'Dữ liệu thống kê hiện không khả dụng. Hãy thử tải lại hoặc tiếp tục với một đề thi mới.'}</p>
        <div className="dashboard-state-actions">
          <button className="dashboard-primary-action" type="button" onClick={onRetry}>Thử lại</button>
          <Link className="dashboard-secondary-action" to={notice?.actionRoute ?? '/exams/browse'}>
            {notice?.actionLabel ?? 'Duyệt kho đề'}
          </Link>
        </div>
      </section>
    </main>
  );
}

function DashboardEmptyState({ vm }: { vm: PersonalLearningDashboardViewModel }) {
  const recommendation = vm.recommendations[0];
  const isAnonymous = vm.notices.some((notice) => notice.id === 'authentication-required');
  const nonDuplicateNotices = vm.notices.filter((notice) => (
    notice.id !== 'empty-state' && notice.id !== 'authentication-required'
  ));
  return (
    <main className="dashboard-content dashboard-state-content">
      {nonDuplicateNotices.map((notice) => <DashboardNoticeBanner key={notice.id} notice={notice} />)}
      <section className="dashboard-card dashboard-state-card" aria-labelledby="dashboard-empty-title">
        <h2 id="dashboard-empty-title">
          {isAnonymous ? 'Đăng nhập để xem thống kê học tập' : 'Chưa có bài thi nào'}
        </h2>
        <p>{isAnonymous
          ? 'Không có kết quả anonymous đã được xác nhận trên thiết bị này. Đăng nhập để xem dữ liệu đã lưu trên máy chủ.'
          : 'Hoàn thành một đề thi thử để bắt đầu theo dõi kết quả học tập.'}</p>
        {recommendation && <Link className="dashboard-primary-action" to={recommendation.actionRoute}>{recommendation.actionLabel}</Link>}
      </section>
      <DashboardQuickActions vm={vm} />
    </main>
  );
}

function DashboardReadyState({ vm, onRetry }: {
  vm: PersonalLearningDashboardViewModel;
  onRetry: () => void;
}) {
  const notices = readyNotices(vm);
  const isLocalFallback = vm.scope.source === 'local-fallback';
  return (
    <main className="dashboard-content">
      {notices.length > 0 && <div className="dashboard-notice-stack">{notices.map((notice) => <DashboardNoticeBanner key={notice.id} notice={notice} />)}</div>}
      {isLocalFallback && (
        <div className="dashboard-fallback-actions">
          <button className="dashboard-secondary-action" type="button" onClick={onRetry}>
            Thử kết nối máy chủ lại
          </button>
        </div>
      )}
      <div className="dashboard-layout">
        <div className="dashboard-main-column">
          <DashboardRecommendationCard vm={vm} />
          <DashboardKpiGrid vm={vm} />
          <DashboardScoreTrend vm={vm} />
          <DashboardInsightSection vm={vm} />
          <DashboardQuestionTypePerformance items={vm.questionTypePerformance} />
          <DashboardRecentAttempts items={vm.recentAttempts} />
        </div>
        <DashboardUtilityRail vm={vm} />
      </div>
    </main>
  );
}

interface PersonalLearningDashboardPageProps {
  initialViewModel?: PersonalLearningDashboardViewModel;
  requestDashboard?: DashboardAnalyticsRequest;
  fixtureLoader?: DashboardDevelopmentFixtureLoader | null;
  localStorageProvider?: DashboardLocalStorageProvider;
}

export default function PersonalLearningDashboardPage({
  initialViewModel,
  requestDashboard,
  fixtureLoader,
  localStorageProvider,
}: PersonalLearningDashboardPageProps = {}) {
  const location = useLocation();
  const { currentUser, isAuthenticated, isLoading } = useAuth();
  const isDarkPreview = import.meta.env.DEV && new URLSearchParams(location.search).get('theme') === 'dark';
  const { viewModel: vm, range, setRange, retry, announcement } = usePersonalLearningDashboard({
    auth: {
      isLoading,
      isAuthenticated,
      ownerKey: currentUser?.id ?? null,
    },
    search: location.search,
    initialViewModel,
    requestDashboard,
    fixtureLoader,
    localStorageProvider,
  });

  return (
    <div className={`dashboard-page${isDarkPreview ? ' dashboard-theme-dark' : ''}`}>
      <DashboardPageHeader vm={vm} range={range} onRangeChange={setRange} />
      <p className="dashboard-visually-hidden" aria-live="polite">{announcement}</p>
      {vm.state === 'loading' && <DashboardLoadingState />}
      {vm.state === 'error' && <DashboardErrorState vm={vm} onRetry={retry} />}
      {vm.state === 'empty' && <DashboardEmptyState vm={vm} />}
      {vm.state === 'ready' && <DashboardReadyState vm={vm} onRetry={retry} />}
    </div>
  );
}
