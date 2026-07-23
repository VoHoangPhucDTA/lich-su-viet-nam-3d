import { useAuth } from '../../auth/AuthContext';
import ProfileLayout from '../../layouts/ProfileLayout';
import StatsCard from '../../components/profile/StatsCard';
import RecommendationCard from '../../components/profile/RecommendationCard';
import {
  WeeklyScoreChart,
  CategoryChart,
  GradeProgressChart,
} from '../../components/profile/ProgressChart';
import {
  mockStats,
  mockWeeklyScores,
  mockCategoryScores,
  mockProgressByGrade,
  mockRecommendations,
  mockRecentEvents,
} from '../../data/mockLearningStats';
import { Link } from 'react-router-dom';
import {
  Eye,
  FileText,
  Star,
  Flame,
  Clock,
  ArrowRight,
  ChevronRight,
  User,
  Swords,
  Landmark,
  Coins,
  BookOpenText,
  Shield,
  Zap,
} from 'lucide-react';

const strengths = mockCategoryScores.filter(c => c.correctRate >= 75);
const weaknesses = mockCategoryScores.filter(c => c.correctRate < 70);

/**
 * Displays a personalized welcome section with learning progress highlights.
 *
 * @param firstName - The first name shown in the greeting.
 * @returns The rendered welcome section.
 */
function WelcomeHero({ firstName }: { firstName: string }) {
  return (
    <section className="relative overflow-hidden rounded-2xl bg-white border border-stone-200/60 p-6 sm:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-red-50 text-red-900 flex items-center justify-center shrink-0 border border-red-100">
            <User size={24} strokeWidth={1.5} />
          </div>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-sans text-2xl sm:text-3xl font-black text-stone-900 tracking-tight">
                Xin chào, {firstName}!
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-sans font-bold uppercase tracking-wider bg-red-50 text-red-900 border border-red-200/60">
                <Star size={10} strokeWidth={2} className="text-amber-500" />
                Top {mockStats.rankPercentile}%
              </span>
            </div>
            <p className="text-sm text-stone-500 mt-1">
              Tiếp tục hành trình học lịch sử hôm nay
            </p>
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200/60">
          <Flame size={22} strokeWidth={1.5} className="text-amber-600" />
          <div className="text-right">
            <div className="font-sans text-2xl font-bold text-amber-600">{mockStats.streakDays}</div>
            <div className="text-[8px] font-sans font-bold uppercase tracking-wider text-stone-400">Ngày liên tiếp</div>
          </div>
        </div>
      </div>

      <div className="mt-6 pt-5 border-t border-stone-100 grid grid-cols-3 gap-6">
        <div className="space-y-0.5">
          <span className="block font-sans text-2xl font-bold text-red-900">{mockStats.eventsViewed}</span>
          <span className="text-[9px] font-sans font-bold uppercase tracking-wider text-stone-400">Sự kiện đã xem</span>
        </div>
        <div className="space-y-0.5">
          <span className="block font-sans text-2xl font-bold text-amber-600">{mockStats.quizzesCompleted}</span>
          <span className="text-[9px] font-sans font-bold uppercase tracking-wider text-stone-400">Bài trắc nghiệm</span>
        </div>
        <div className="space-y-0.5">
          <span className="block font-sans text-2xl font-bold text-emerald-600">{mockStats.weeklyMinutes}'</span>
          <span className="text-[9px] font-sans font-bold uppercase tracking-wider text-stone-400">Phút tuần này</span>
        </div>
      </div>
    </section>
  );
}

/* ─── Stats Grid ────────────────────────────────────────────────────────────── */
function StatsGrid() {
  const items = [
    { icon: <Eye size={16} strokeWidth={1.5} />, label: 'Sự kiện', value: mockStats.eventsViewed, sub: 'đã xem', color: 'var(--accent)' },
    { icon: <FileText size={16} strokeWidth={1.5} />, label: 'Trắc nghiệm', value: mockStats.quizzesCompleted, sub: 'hoàn thành', color: 'var(--warning)' },
    { icon: <Star size={16} strokeWidth={1.5} />, label: 'Điểm TB', value: mockStats.averageScore, sub: '/10', color: 'var(--success)' },
    { icon: <Flame size={16} strokeWidth={1.5} />, label: 'Chuỗi học', value: `${mockStats.streakDays} ngày`, sub: 'đang duy trì', color: 'var(--accent)' },
    { icon: <Clock size={16} strokeWidth={1.5} />, label: 'Tuần này', value: `${mockStats.weeklyMinutes}p`, sub: `tổng ${mockStats.totalMinutes}p`, color: 'var(--text-muted)' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {items.map((s, i) => (
        <StatsCard key={i} icon={s.icon} label={s.label} value={s.value} sub={s.sub} color={s.color} />
      ))}
    </div>
  );
}

/**
 * Displays weekly scores, topic accuracy, and progress by grade in chart panels.
 */
function ChartsGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
      <div className="rounded-2xl bg-white border border-stone-200/60 p-5 relative">
        <span className="absolute top-3 right-3 text-[9px] font-sans text-stone-300 font-bold">03</span>
        <div className="space-y-1 mb-4">
          <span className="font-sans text-[9px] font-bold uppercase tracking-wider text-red-900">Tiến độ</span>
          <h3 className="font-sans text-lg font-bold text-stone-900">Tiến độ theo lớp</h3>
        </div>
        <GradeProgressChart data={mockProgressByGrade} />
      </div>
    </div>
  );
}

/* ─── Strengths & Weaknesses ────────────────────────────────────────────────── */
const categoryIcon: Record<string, React.ReactNode> = {
  military: <Swords size={12} strokeWidth={2} />,
  political: <Landmark size={12} strokeWidth={2} />,
  economic: <Coins size={12} strokeWidth={2} />,
  cultural: <BookOpenText size={12} strokeWidth={2} />,
};

/**
 * Displays the learner's strongest and weakest study categories.
 *
 * Shows category labels with their correct-answer rates, or an appropriate
 * message when either category group has no data.
 */
function StrengthsWeaknesses() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="rounded-2xl bg-white border border-stone-200/60 p-5 relative">
        <span className="absolute top-3 right-3 text-[9px] font-sans text-stone-300 font-bold">04</span>
        <div className="space-y-1 mb-4">
          <span className="font-sans text-[9px] font-bold uppercase tracking-wider text-emerald-600">Điểm mạnh</span>
          <h3 className="font-sans text-lg font-bold text-stone-900">Chủ đề làm tốt nhất</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {strengths.length === 0 ? (
            <p className="text-sm text-stone-400 italic font-sans">Chưa có dữ liệu</p>
          ) : (
            strengths.map(c => (
              <div key={c.category} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold cursor-default"
                style={{ background: `${c.color}12`, color: c.color, border: `1px solid ${c.color}25` }}>
                {categoryIcon[c.category] ?? null}
                <span>{c.label}</span>
                <span className="opacity-60 font-normal">({c.correctRate}%)</span>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="rounded-2xl bg-white border border-stone-200/60 p-5 relative">
        <span className="absolute top-3 right-3 text-[9px] font-sans text-stone-300 font-bold">05</span>
        <div className="space-y-1 mb-4">
          <span className="font-sans text-[9px] font-bold uppercase tracking-wider text-red-900">Cần cải thiện</span>
          <h3 className="font-sans text-lg font-bold text-stone-900">Chủ đề cần ôn luyện</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {weaknesses.length === 0 ? (
            <p className="text-sm text-stone-400 italic font-sans">Tuyệt vời, không có điểm yếu!</p>
          ) : (
            weaknesses.map(c => (
              <div key={c.category} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold cursor-default"
                style={{ background: 'rgba(139,30,30,0.08)', color: '#dc2626', border: '1px solid rgba(139,30,30,0.18)' }}>
                {categoryIcon[c.category] ?? null}
                <span>{c.label}</span>
                <span className="opacity-60 font-normal">({c.correctRate}%)</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Continue Learning ─────────────────────────────────────────────────────── */
const eventIcons: Record<string, React.ReactNode> = {
  'Chiến thắng Điện Biên Phủ (1954)': <Swords size={20} strokeWidth={1.5} />,
  'Nhà Trần và ba lần kháng Nguyên Mông': <Shield size={20} strokeWidth={1.5} />,
  'Khởi nghĩa Lam Sơn (1418–1427)': <Zap size={20} strokeWidth={1.5} />,
};

/**
 * Displays recent learning activities with progress and actions to continue or review them.
 *
 * @returns The rendered continue-learning panel
 */
function ContinueLearning() {
  return (
    <div className="rounded-2xl bg-white border border-stone-200/60 p-5 relative">
      <span className="absolute top-3 right-3 text-[9px] font-sans text-stone-300 font-bold">06</span>
      <div className="space-y-1 mb-4">
        <span className="font-sans text-[9px] font-bold uppercase tracking-wider text-red-900">Học tập</span>
        <h3 className="font-sans text-lg font-bold text-stone-900">Tiếp tục học</h3>
      </div>
      <div className="flex flex-col gap-2.5">
        {mockRecentEvents.map(ev => {
          return (
            <div key={ev.id} className="rounded-xl flex items-center gap-3.5 p-3.5 bg-stone-50 border border-stone-200/60">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-red-50 text-red-900">
                {eventIcons[ev.title] ?? <BookOpenText size={20} strokeWidth={1.5} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-sans text-sm font-bold text-stone-900 truncate">{ev.title}</div>
                <div className="flex gap-3 text-xs text-stone-400 mt-0.5">
                  <span>{ev.topic}</span>
                  <span>Lớp {ev.grade}</span>
                </div>
              </div>
              <div className="w-24 shrink-0 hidden sm:block">
                <div className="flex justify-between text-[10px] mb-1 text-stone-400">
                  <span>{ev.progress}%</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden bg-stone-200">
                  <div className="h-full rounded-full transition-[width] duration-500"
                    style={{ width: `${ev.progress}%`, background: ev.progress === 100 ? '#3D8361' : '#8b1e1e' }} />
                </div>
              </div>
              <button type="button" className="profile-action shrink-0 rounded-lg px-3 py-1.5 text-xs font-sans font-bold uppercase tracking-wider bg-red-50 text-red-900 border border-red-200/60 hover:bg-red-100">
                <span className="flex items-center gap-1">
                  {ev.progress === 100 ? 'Ôn lại' : 'Tiếp tục'}
                  <ArrowRight size={12} strokeWidth={2.5} />
                </span>
              </button>
            </div>
          );
        })}
      </div>
      <div className="mt-3 text-right">
        <Link to="/profile/history" className="profile-action inline-flex items-center gap-1 rounded text-xs font-sans font-bold uppercase tracking-wider text-red-900 hover:text-red-700">
          Xem lịch sử
          <ChevronRight size={13} strokeWidth={2.5} />
        </Link>
      </div>
    </div>
  );
}

/**
 * Renders the authenticated user's learning dashboard.
 *
 * Displays personalized welcome information, learning statistics, progress charts,
 * strengths and weaknesses, recent learning activity, and study recommendations.
 */
export default function ProfileDashboardPage() {
  const { currentUser } = useAuth();
  const name = currentUser?.fullName ?? 'Học sinh';
  const firstName = name.split(' ').pop() ?? name;

  return (
    <ProfileLayout>
      <div className="space-y-8 lg:space-y-10 animate-fade-in">
        <WelcomeHero firstName={firstName} />
        <StatsGrid />
        <ChartsGrid />
        <StrengthsWeaknesses />
        <ContinueLearning />

        <div className="rounded-2xl bg-white border border-stone-200/60 p-5 relative">
          <span className="absolute top-3 right-3 text-[9px] font-sans text-stone-300 font-bold">07</span>
          <div className="space-y-1 mb-4">
            <span className="font-sans text-[9px] font-bold uppercase tracking-wider text-red-900">Đề xuất</span>
            <h3 className="font-sans text-lg font-bold text-stone-900">Gợi ý ôn tập</h3>
          </div>
          <div className="flex flex-col gap-3">
            {mockRecommendations.map(r => (
              <RecommendationCard key={r.id} item={r} />
            ))}
          </div>
        </div>
      </div>
    </ProfileLayout>
  );
}
