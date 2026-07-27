import type { ScoreRecord } from '../../data/mockLearningStats';
import { Eye, Swords, Landmark, Coins, BookOpenText, Timer, GraduationCap } from 'lucide-react';

const difficultyConfig = {
  easy: { label: 'Dễ', color: '#3D8361' },
  medium: { label: 'TB', color: '#c5a059' },
  hard: { label: 'Khó', color: '#8b1e1e' },
};

const categoryConfig: Record<string, { label: string; icon: typeof Swords }> = {
  military: { label: 'Quân sự', icon: Swords },
  political: { label: 'Chính trị', icon: Landmark },
  economic: { label: 'Kinh tế', icon: Coins },
  cultural: { label: 'Văn hoá', icon: BookOpenText },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function ScoreCircle({ score }: { score: number }) {
  const color = score >= 8 ? '#3D8361' : score >= 6.5 ? '#c5a059' : '#8b1e1e';
  const pct = (score / 10) * 360;
  return (
    <div className="shrink-0">
      <svg width="42" height="42" viewBox="0 0 42 42" className="block">
        <circle cx="21" cy="21" r="17" fill="none" stroke="#e7e5e4" strokeWidth="3" />
        <circle cx="21" cy="21" r="17" fill="none" stroke={color} strokeWidth="3"
          strokeDasharray={`${(pct / 360) * 106.8} 106.8`} strokeLinecap="round" transform="rotate(-90 21 21)"
          style={{ transition: 'stroke-dasharray 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)' }} />
        <text x="21" y="21" textAnchor="middle" dominantBaseline="central" fill={color}
          fontSize="10" fontWeight="800" fontFamily="var(--font-ui)">{score.toFixed(1)}</text>
      </svg>
    </div>
  );
}

export default function ScoreTable({ scores }: { scores: ScoreRecord[] }) {
  if (scores.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-stone-100 flex items-center justify-center mb-4">
          <Timer size={24} strokeWidth={1.5} className="text-stone-400" />
        </div>
        <p className="font-sans text-base font-bold text-stone-900">Chưa có bài thi nào</p>
        <p className="text-sm text-stone-400 mt-1.5 max-w-xs">Hoàn thành bài kiểm tra để theo dõi kết quả.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {scores.map(s => {
        const diff = difficultyConfig[s.difficulty];
        const cat = categoryConfig[s.category];
        const CatIcon = cat.icon;
        const pct = Math.round((s.correct / s.total) * 100);

        return (
          <div key={s.id} className="rounded-xl flex items-center gap-4 p-3.5 bg-stone-50 border border-stone-200/60">
            <ScoreCircle score={s.score} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap mb-1">
                <h4 className="font-sans text-sm font-bold text-stone-900 truncate">{s.title}</h4>
                <span className="font-sans text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
                  style={{
                    background: s.type === 'exam' ? 'rgba(197,160,89,0.1)' : 'rgba(139,30,30,0.08)',
                    color: s.type === 'exam' ? '#c5a059' : '#8b1e1e',
                    border: `1px solid ${s.type === 'exam' ? 'rgba(197,160,89,0.2)' : 'rgba(139,30,30,0.15)'}`,
                  }}>
                  {s.type === 'exam' ? 'Đề thi' : 'Trắc nghiệm'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-400">
                <span className="flex items-center gap-1">
                  <CatIcon size={11} strokeWidth={1.5} />
                  {cat.label}
                </span>
                <span className="flex items-center gap-1">
                  <GraduationCap size={11} strokeWidth={1.5} />
                  Lớp {s.grade}
                </span>
                <span>{s.correct}/{s.total} ({pct}%)</span>
                <span className="flex items-center gap-1">
                  <Timer size={11} strokeWidth={1.5} />
                  {s.durationMinutes} phút
                </span>
                <span>{formatDate(s.date)}</span>
                <span className="font-sans text-[9px] font-bold px-1.5 py-0.5 rounded"
                  style={{ background: `${diff.color}10`, color: diff.color, border: `1px solid ${diff.color}18` }}>
                  {diff.label}
                </span>
              </div>
            </div>
            <button type="button" className="profile-action shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 bg-white border border-stone-200/60 text-stone-500 hover:bg-stone-50 hover:text-red-900 hover:border-red-200/60">
              <Eye size={13} strokeWidth={1.5} />
              <span className="hidden sm:inline">Chi tiết</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
