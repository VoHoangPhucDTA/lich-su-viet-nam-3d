import { useState } from 'react';
import ProfileLayout from '../../layouts/ProfileLayout';
import ActivityList from '../../components/profile/ActivityList';
import { mockHistory, type ActivityType, type GradeLevel } from '../../data/mockLearningStats';
import { SlidersHorizontal } from 'lucide-react';

const TYPE_FILTERS: { value: ActivityType | 'all'; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'view_event', label: 'Xem sự kiện' },
  { value: 'quiz', label: 'Trắc nghiệm' },
  { value: 'exam', label: 'Đề thi' },
];

const GRADE_FILTERS: { value: GradeLevel | 'all'; label: string }[] = [
  { value: 'all', label: 'Mọi lớp' },
  { value: 10, label: 'Lớp 10' },
  { value: 11, label: 'Lớp 11' },
  { value: 12, label: 'Lớp 12' },
];

/* ─── Filter chip ───────────────────────────────────────────────────────────── */
function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-mono font-bold whitespace-nowrap transition-all duration-200 ${
        active
          ? 'bg-red-900 text-white border border-red-900'
          : 'bg-stone-100 text-stone-400 border border-stone-200 hover:bg-white hover:border-stone-300'
      }`}
    >
      {children}
    </button>
  );
}

export default function LearningHistoryPage() {
  const [typeFilter, setTypeFilter] = useState<ActivityType | 'all'>('all');
  const [gradeFilter, setGradeFilter] = useState<GradeLevel | 'all'>('all');

  const filtered = mockHistory.filter(a => {
    const typeOk = typeFilter === 'all' || a.type === typeFilter;
    const gradeOk = gradeFilter === 'all' || a.grade === gradeFilter;
    return typeOk && gradeOk;
  });

  return (
    <ProfileLayout>
      <div className="space-y-8 lg:space-y-10 animate-fade-in">
        {/* Page header */}
        <div className="space-y-2">
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-red-900">Lịch sử hoạt động</span>
          <h1 className="font-serif text-2xl sm:text-3xl font-black text-stone-900 leading-tight tracking-tight">
            Lịch sử học tập
          </h1>
          <p className="text-sm text-stone-500">
            {mockHistory.length} hoạt động ghi nhận.
          </p>
          <div className="h-px w-10 bg-amber-400 rounded-full" />
        </div>

        {/* Filters */}
        <div className="rounded-2xl bg-white border border-stone-200/60 p-5">
          <div className="flex items-center gap-2 mb-4">
            <SlidersHorizontal size={14} strokeWidth={1.5} className="text-stone-400" />
            <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-stone-400">Bộ lọc</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <p className="font-mono text-[8px] font-bold uppercase tracking-wider text-stone-400 mb-2">Loại</p>
              <div className="flex gap-1.5 flex-wrap">
                {TYPE_FILTERS.map(f => (
                  <FilterChip key={f.value} active={typeFilter === f.value} onClick={() => setTypeFilter(f.value as ActivityType | 'all')}>
                    {f.label}
                  </FilterChip>
                ))}
              </div>
            </div>
            <div>
              <p className="font-mono text-[8px] font-bold uppercase tracking-wider text-stone-400 mb-2">Lớp</p>
              <div className="flex gap-1.5 flex-wrap">
                {GRADE_FILTERS.map(f => (
                  <FilterChip key={f.value} active={gradeFilter === f.value} onClick={() => setGradeFilter(f.value as GradeLevel | 'all')}>
                    {f.label}
                  </FilterChip>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 text-xs text-stone-400 border-t border-stone-100">
            Hiển thị <strong className="text-stone-900">{filtered.length}</strong> / {mockHistory.length} hoạt động
          </div>
        </div>

        {/* Activity list */}
        <div className="rounded-2xl bg-white border border-stone-200/60 p-5 relative">
          <span className="absolute top-3 right-3 text-[9px] font-mono text-stone-300 font-bold">01</span>
          <div className="space-y-1 mb-4">
            <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-red-900">Hoạt động</span>
            <h3 className="font-serif text-lg font-bold text-stone-900">Dòng thời gian</h3>
          </div>
          <ActivityList activities={filtered} />
        </div>
      </div>
    </ProfileLayout>
  );
}
