export function PresetCard({ title, desc, onClick }: { title: string; desc: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: 'left',
        padding: '1rem',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '0.75rem',
        cursor: 'pointer',
        transition: 'all 0.2s',
        fontFamily: 'inherit',
        flex: 1,
        minWidth: '200px',
        boxShadow: 'var(--shadow)'
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-surface)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-card)'; e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem', fontSize: '0.95rem' }}>{title}</div>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{desc}</div>
    </button>
  );
}

export default function ExamPresetCards({ onApplyPreset }: { onApplyPreset: (presetName: string) => void }) {
  return (
    <section>
        <div style={{ marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 0.25rem 0', color: 'var(--text-primary)' }}>Chọn nhanh bản mẫu</h2>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Click để điền nhanh các tuỳ chọn phổ biến.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <PresetCard title="⚡ Ôn nhanh 10 phút" desc="10 câu ngẫu nhiên, nhẹ nhàng." onClick={() => onApplyPreset('fast')} />
            <PresetCard title="🎓 Thi thử THPT" desc="40 câu chuẩn, 50 phút, tổng hợp." onClick={() => onApplyPreset('mock')} />
            <PresetCard title="🛡️ Chống liệt lớp 12" desc="Tập trung 100% chương trình 12." onClick={() => onApplyPreset('grade12')} />
            <PresetCard title="⚕️ Ôn phần yếu" desc="Ôn tập dựa trên các câu điểm yếu." onClick={() => onApplyPreset('weakness')} />
        </div>
    </section>
  );
}
