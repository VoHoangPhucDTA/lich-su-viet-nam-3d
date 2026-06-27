interface SectionHeaderProps {
  index: string;
  title: string;
  subtitle?: string;
}

/**
 * Section header matching CoiNguonPage design language.
 * Red-900 accent numbering (font-mono) + serif heading + stone gradient divider.
 */
export default function SectionHeader({ index, title, subtitle }: SectionHeaderProps) {
  return (
    <>
      <header className="flex items-baseline gap-4 mb-6">
        <span
          className="flex-shrink-0 font-mono text-sm font-bold tracking-[0.2em]"
          style={{ color: 'var(--accent)' }}
        >
          {index}
        </span>
        <h2
          className="font-serif text-[1.625rem] md:text-3xl font-bold leading-tight tracking-[-0.01em]"
          style={{ color: 'var(--text-primary)' }}
        >
          {title}
        </h2>
        <span
          aria-hidden
          className="flex-1 h-px self-center hidden sm:block"
          style={{ background: 'linear-gradient(to right, var(--border), transparent)' }}
        />
      </header>
      {subtitle && (
        <p
          className="-mt-4 mb-6 text-sm"
          style={{ color: 'var(--text-muted)' }}
        >
          {subtitle}
        </p>
      )}
    </>
  );
}
