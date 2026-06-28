interface SectionHeaderProps {
  index: string;
  title: string;
  subtitle?: string;
}

/**
 * Museum-exhibit style section header — Đông Sơn inspired.
 * Mẫu: "01  Tổng quan ◆━━━━━"
 */
export default function SectionHeader({ index, title, subtitle }: SectionHeaderProps) {
  return (
    <>
      <header className="mb-6 flex items-baseline gap-4 pl-1">
        <span
          className="flex-shrink-0 text-sm font-bold tracking-[0.2em]"
          style={{
            fontFamily: 'var(--font-mono)',
            color: 'var(--admin-accent)',
          }}
        >
          {index}
        </span>
        <h2
          className="text-[1.5rem] md:text-[1.75rem] font-bold leading-tight tracking-[-0.01em]"
          style={{
            fontFamily: 'var(--font-serif)',
            color: 'var(--text-primary)',
          }}
        >
          {title}
        </h2>
        {/* Đông Sơn geometric divider — diamond-repeat motif */}
        <span
          aria-hidden
          className="flex-1 h-1.5 self-center mt-1 opacity-30"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='14' height='6' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 3 L7 6 L14 3 L7 0 Z' fill='%23C49A45'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'repeat-x',
            backgroundPosition: 'center',
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
