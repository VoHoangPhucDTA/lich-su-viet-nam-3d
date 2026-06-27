import type { RecommendationItem } from '../../data/mockLearningStats';
import { ArrowRight, Clock, BookOpen, Coins, Landmark, Trophy } from 'lucide-react';

const typeConfig = {
  review: { label: 'Ôn tập', color: '#c5a059' },
  new: { label: 'Mới', color: '#3D8361' },
  challenge: { label: 'Thử thách', color: '#8b1e1e' },
};

const recIcon: Record<string, React.ReactNode> = {
  '💰': <Coins size={20} strokeWidth={1.5} />,
  '🏛️': <Landmark size={20} strokeWidth={1.5} />,
  '🏆': <Trophy size={20} strokeWidth={1.5} />,
};

export default function RecommendationCard({ item }: { item: RecommendationItem }) {
  const cfg = typeConfig[item.type];

  return (
    <div className="group relative overflow-hidden rounded-xl transition-all duration-200 hover:shadow-sm hover:-translate-y-0.5"
      style={{
        background: '#fafaf9',
        border: '1px solid #e7e5e4',
        borderLeft: `3px solid ${cfg.color}`,
        padding: '1rem 1.25rem',
        display: 'flex',
        gap: '1rem',
        alignItems: 'flex-start',
      }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `${cfg.color}10`, color: cfg.color, border: `1px solid ${cfg.color}18` }}>
        {recIcon[item.icon] ?? <BookOpen size={20} strokeWidth={1.5} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2.5 mb-1 flex-wrap">
          <h4 className="font-serif text-base font-bold text-stone-900">{item.title}</h4>
          <span className="font-mono text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
            style={{ background: `${cfg.color}10`, color: cfg.color, border: `1px solid ${cfg.color}18` }}>
            {cfg.label}
          </span>
        </div>
        <p className="text-sm text-stone-500 leading-relaxed mb-2">{item.reason}</p>
        <div className="flex items-center gap-4 text-xs text-stone-400">
          <span className="flex items-center gap-1.5">
            <BookOpen size={12} strokeWidth={1.5} />
            {item.topic}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock size={12} strokeWidth={1.5} />
            {item.estimatedMinutes} phút
          </span>
        </div>
      </div>
      <button className="shrink-0 rounded-lg px-3.5 py-2 text-xs font-mono font-bold uppercase tracking-wider transition-all duration-200 flex items-center gap-1.5"
        style={{
          background: `${cfg.color}10`,
          color: cfg.color,
          border: `1px solid ${cfg.color}18`,
          fontFamily: 'inherit',
        }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '0.75')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
        Bắt đầu
        <ArrowRight size={12} strokeWidth={2.5} />
      </button>
    </div>
  );
}
