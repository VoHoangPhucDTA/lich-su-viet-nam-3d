import { useState } from 'react';
import ProfileLayout from '../../layouts/ProfileLayout';
import ActivityList from '../../components/profile/ActivityList';
import { mockHistory, type ActivityType, type GradeLevel } from '../../data/mockLearningStats';

const TYPE_FILTERS: { value: ActivityType | 'all'; label: string }[] = [
  { value: 'all',        label: 'Tất cả' },
  { value: 'view_event', label: 'Xem sự kiện' },
  { value: 'quiz',       label: 'Trắc nghiệm' },
  { value: 'exam',       label: 'Đề thi' },
];

const GRADE_FILTERS: { value: GradeLevel | 'all'; label: string }[] = [
  { value: 'all', label: 'Mọi lớp' },
  { value: 10,    label: 'Lớp 10' },
  { value: 11,    label: 'Lớp 11' },
  { value: 12,    label: 'Lớp 12' },
];

function FilterBtn({
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
      style={{
        padding: '0.375rem 0.875rem',
        borderRadius: '9999px',
        fontSize: '0.78rem',
        fontWeight: active ? 700 : 500,
        color: active ? 'var(--accent)' : 'var(--text-muted)',
        background: active ? 'var(--accent-soft)' : 'var(--bg-app)',
        border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
        cursor: 'pointer',
        transition: 'all 0.15s',
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={e => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-surface)';
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent-soft)';
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-app)';
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
        }
      }}
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
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
          📜 Lịch sử học tập
        </h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
          Theo dõi toàn bộ hoạt động học tập của bạn — {mockHistory.length} hoạt động ghi nhận.
        </p>
      </div>

      {/* Filters */}
      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: '1rem',
          padding: '1rem 1.25rem',
          marginBottom: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}
      >
        <div>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Loại hoạt động
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {TYPE_FILTERS.map(f => (
              <FilterBtn key={f.value} active={typeFilter === f.value} onClick={() => setTypeFilter(f.value as ActivityType | 'all')}>
                {f.label}
              </FilterBtn>
            ))}
          </div>
        </div>

        <div>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Lớp học
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {GRADE_FILTERS.map(f => (
              <FilterBtn key={f.value} active={gradeFilter === f.value} onClick={() => setGradeFilter(f.value as GradeLevel | 'all')}>
                {f.label}
              </FilterBtn>
            ))}
          </div>
        </div>

        {/* Result count */}
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: '0.625rem' }}>
          Hiển thị <strong style={{ color: 'var(--text-primary)' }}>{filtered.length}</strong> / {mockHistory.length} hoạt động
        </div>
      </div>

      {/* Activity list wrapper */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '1rem',
          padding: '1.25rem',
        }}
      >
        <ActivityList activities={filtered} />
      </div>
    </ProfileLayout>
  );
}
