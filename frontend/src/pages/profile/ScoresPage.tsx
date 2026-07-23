import ProfileLayout from '../../layouts/ProfileLayout';
import ScoreTable from '../../components/profile/ScoreTable';
import {
  WeeklyScoreChart,
  CategoryChart,
} from '../../components/profile/ProgressChart';
import {
  mockScores,
  mockWeeklyScores,
  mockCategoryScores,
} from '../../data/mockLearningStats';
import {
  Star,
  Target,
  TrendingUp,
  BarChart3,
} from 'lucide-react';

/**
 * Renders a summary KPI card with an icon, label, value, and accent color.
 *
 * @param icon - The icon displayed in the card.
 * @param label - The KPI label.
 * @param value - The KPI value displayed prominently.
 * @param color - The accent color applied to the card.
 */
function SummaryKPI({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white border border-stone-200/60 p-4 sm:p-5">
      <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-2xl"
        style={{ background: `linear-gradient(to right, ${color}, transparent)` }} />
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: `${color}10`, color }}>
          {icon}
        </div>
        <span className="text-[9px] font-sans font-bold uppercase tracking-wider text-stone-400">{label}</span>
      </div>
      <div className="font-sans text-2xl font-black leading-none tracking-tight" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

/**
 * Renders the scores page with learning performance summaries, charts, and completed assessment details.
 */
export default function ScoresPage() {
  const avg = (mockScores.reduce((s, r) => s + r.score, 0) / mockScores.length).toFixed(1);
  const totalCorrect = mockScores.reduce((s, r) => s + r.correct, 0);
  const totalQ = mockScores.reduce((s, r) => s + r.total, 0);
  const pct = Math.round((totalCorrect / totalQ) * 100);
  const best = Math.max(...mockScores.map(s => s.score)).toFixed(1);

  return (
    <ProfileLayout>
      <div className="space-y-8 lg:space-y-10 animate-fade-in">
        {/* Page header */}
        <div className="space-y-2">
          <span className="font-sans text-[10px] font-bold uppercase tracking-wider text-red-900">Kết quả học tập</span>
          <h1 className="font-sans text-2xl sm:text-3xl font-black text-stone-900 leading-tight tracking-tight">
            Điểm số
          </h1>
          <p className="text-sm text-stone-500">
            Tổng hợp {mockScores.length} bài trắc nghiệm và đề thi đã hoàn thành.
          </p>
          <div className="h-px w-10 bg-amber-400 rounded-full" />
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryKPI icon={<Star size={16} strokeWidth={1.5} />} label="Điểm TB" value={avg} color="#8b1e1e" />
          <SummaryKPI icon={<Target size={16} strokeWidth={1.5} />} label="Tỉ lệ đúng" value={`${pct}%`} color="#3D8361" />
          <SummaryKPI icon={<TrendingUp size={16} strokeWidth={1.5} />} label="Cao nhất" value={best} color="#c5a059" />
          <SummaryKPI icon={<BarChart3 size={16} strokeWidth={1.5} />} label="Đã làm" value={String(mockScores.length)} color="#78716c" />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-white border border-stone-200/60 p-5 relative">
            <span className="absolute top-3 right-3 text-[9px] font-sans text-stone-300 font-bold">01</span>
            <div className="space-y-1 mb-4">
              <span className="font-sans text-[9px] font-bold uppercase tracking-wider text-red-900">Thống kê</span>
              <h3 className="font-sans text-lg font-bold text-stone-900">Điểm theo tuần</h3>
            </div>
            <WeeklyScoreChart data={mockWeeklyScores} />
          </div>
          <div className="rounded-2xl bg-white border border-stone-200/60 p-5 relative">
            <span className="absolute top-3 right-3 text-[9px] font-sans text-stone-300 font-bold">02</span>
            <div className="space-y-1 mb-4">
              <span className="font-sans text-[9px] font-bold uppercase tracking-wider text-red-900">Phân tích</span>
              <h3 className="font-sans text-lg font-bold text-stone-900">Tỉ lệ đúng theo chủ đề</h3>
            </div>
            <CategoryChart data={mockCategoryScores} />
          </div>
        </div>

        {/* All scores */}
        <div className="rounded-2xl bg-white border border-stone-200/60 p-5 relative">
          <span className="absolute top-3 right-3 text-[9px] font-sans text-stone-300 font-bold">03</span>
          <div className="space-y-1 mb-4">
            <span className="font-sans text-[9px] font-bold uppercase tracking-wider text-red-900">Chi tiết</span>
            <h3 className="font-sans text-lg font-bold text-stone-900">Tất cả bài đã làm</h3>
          </div>
          <ScoreTable scores={mockScores} />
        </div>
      </div>
    </ProfileLayout>
  );
}
