import type { LearningActivity } from '../../data/mockLearningStats';
import { Eye, FileEdit, ScrollText, Clock, BookOpen, GraduationCap } from 'lucide-react';

const typeConfig = {
  view_event: { icon: Eye, label: 'Xem sự kiện', color: '#8b1e1e' },
  quiz: { icon: FileEdit, label: 'Trắc nghiệm', color: '#3D8361' },
  exam: { icon: ScrollText, label: 'Đề thi', color: '#c5a059' },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 8 ? '#3D8361' : score >= 6.5 ? '#c5a059' : '#8b1e1e';
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold"
      style={{ background: `${color}10`, color, border: `1px solid ${color}20` }}>
      {score.toFixed(1)}
    </span>
  );
}

export default function ActivityList({ activities }: { activities: LearningActivity[] }) {
  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-stone-100 flex items-center justify-center mb-4">
          <Clock size={24} strokeWidth={1.5} className="text-stone-400" />
        </div>
        <p className="font-sans text-base font-bold text-stone-900">Chưa có hoạt động nào</p>
        <p className="text-sm text-stone-400 mt-1.5 max-w-xs">Hãy bắt đầu học để theo dõi tiến trình của bạn!</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {activities.map((a) => {
        const cfg = typeConfig[a.type];
        const Icon = cfg.icon;

        return (
          <div key={a.id} className="rounded-xl flex items-center gap-3.5 p-3.5 bg-stone-50 border border-stone-200/60">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: `${cfg.color}10`, color: cfg.color }}>
              <Icon size={17} strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-sans text-sm font-bold text-stone-900 truncate">{a.title}</div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-400 mt-0.5">
                <span className="font-sans text-[9px] font-bold uppercase tracking-wider"
                  style={{ color: cfg.color }}>{cfg.label}</span>
                <span className="flex items-center gap-1">
                  <BookOpen size={11} strokeWidth={1.5} />
                  {a.topic}
                </span>
                <span className="flex items-center gap-1">
                  <GraduationCap size={11} strokeWidth={1.5} />
                  Lớp {a.grade}
                </span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              {a.score !== undefined && <ScoreBadge score={a.score} />}
              <span className="text-[11px] text-stone-400 whitespace-nowrap">{formatDate(a.date)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
