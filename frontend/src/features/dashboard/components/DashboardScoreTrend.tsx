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
import { DASHBOARD_TREND_LIMIT } from '../dashboardAnalyticsPolicy';
import { formatDashboardScore } from '../dashboardFormatters';
import { formatExamTitle } from '@/lib/exam/examDisplay';
import type { PersonalLearningDashboardViewModel } from '../dashboardTypes';

export function DashboardScoreTrend({ vm }: { vm: PersonalLearningDashboardViewModel }) {
  const { points, sourceAttemptCount, isComplete } = vm.scoreTrend;
  const highestPoint = points.reduce<(typeof points)[number] | null>((highest, point) => (
    highest === null || point.score > highest.score ? point : highest
  ), null);
  const latestPoint = points.at(-1) ?? null;
  const ariaSummary = points.length === 0
    ? 'Chưa có điểm để hiển thị.'
    : points.length === 1
      ? `Một điểm ${formatDashboardScore(points[0].score)} trên 10; chưa đủ dữ liệu để nhận xét xu hướng.`
      : '';
  const summaryText = points.length === 1
    ? `Một điểm ${formatDashboardScore(points[0].score)} trên 10; chưa đủ dữ liệu để nhận xét xu hướng.`
    : null;
  return (
    <section className="dashboard-card dashboard-chart-card" aria-labelledby="dashboard-trend-title">
      <div className="dashboard-section-heading">
        <div>
          <p className="dashboard-section-kicker">Điểm số</p>
          <h2 id="dashboard-trend-title">Xu hướng điểm</h2>
        </div>
        {points.length > 1 && (
          <div className="dashboard-chart-highlights" aria-label="Điểm nổi bật trên biểu đồ">
            <span><small>Cao nhất</small><strong>{formatDashboardScore(highestPoint?.score ?? null)}</strong></span>
            <span><small>Gần nhất</small><strong>{formatDashboardScore(latestPoint?.score ?? null)}</strong></span>
          </div>
        )}
      </div>
      {!isComplete && points.length > 0 && (
        <p className="dashboard-inline-warning">
          {points.length >= DASHBOARD_TREND_LIMIT
            ? `Biểu đồ hiển thị ${DASHBOARD_TREND_LIMIT} bài gần nhất trong tổng số ${sourceAttemptCount} bài.`
            : 'Chuỗi điểm chưa bao phủ toàn bộ dữ liệu nguồn.'}
        </p>
      )}
      {points.length === 0 ? (
        <div className="dashboard-chart-empty">Chưa có dữ liệu điểm trong khoảng thời gian này.</div>
      ) : points.length === 1 ? (
        <div className="dashboard-one-point" aria-label={ariaSummary}>
          <span aria-hidden="true" />
          <strong>{formatDashboardScore(points[0].score)}/10</strong>
          <p>Chưa đủ dữ liệu để nhận xét xu hướng.</p>
        </div>
      ) : (
        <div className="dashboard-chart" role="img" aria-label={`Biểu đồ xu hướng điểm. ${ariaSummary}`}>
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
      {summaryText && <p className="dashboard-chart-summary">{summaryText}</p>}
      {points.length > 0 && (
        <details className="dashboard-data-details">
          <summary>Xem dữ liệu biểu đồ</summary>
          <ol>
            {points.map((point) => {
              const displayTitle = formatExamTitle({ title: point.title });
              return (
                <li key={point.attemptId}>
                  <time dateTime={point.submittedAt}>{point.dateLabel}</time>: {displayTitle} — {formatDashboardScore(point.score)}/10
                </li>
              );
            })}
          </ol>
        </details>
      )}
    </section>
  );
}
