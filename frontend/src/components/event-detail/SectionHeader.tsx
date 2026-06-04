interface SectionHeaderProps {
  index: string;
  title: string;
  subtitle?: string;
}

/**
 * Museum-exhibit style section header.
 * Mẫu: "01  Tổng quan ─────────"
 */
export default function SectionHeader({ index, title, subtitle }: SectionHeaderProps) {
  return (
    <>
      <header className="mb-6 flex items-baseline gap-4 pl-1">
        <span
          className="flex-shrink-0 font-mono text-sm font-bold tracking-[0.2em]"
          style={{ color: 'var(--admin-accent)' }}
        >
          {index}
        </span>
        <h2
          className="text-[1.625rem] md:text-3xl font-bold leading-tight tracking-[-0.01em]"
          style={{ color: 'var(--text-primary)' }}
        >
          {title}
        </h2>
        <span
          aria-hidden
          className="flex-1 h-px self-center"
          style={{
            background:
              'linear-gradient(to right, var(--border), transparent)',
          }}
        />
      </header>
      {subtitle && (
        <p
          className="-mt-4 mb-6 pl-9 text-sm"
          style={{ color: 'var(--text-muted)' }}
        >
          {subtitle}
        </p>
      )}
    </>
  );
}
