interface SectionHeaderProps {
  eyebrow: string;
  title: string;
  subtitle?: string;
}

/**
 * Renders a styled section header with an eyebrow label, title, optional subtitle, and decorative dividers.
 *
 * @param eyebrow - The short label displayed above the title
 * @param title - The main section heading
 * @param subtitle - Optional supporting text displayed below the title
 * @returns The rendered section header
 */
export default function SectionHeader({
  eyebrow,
  title,
  subtitle,
}: SectionHeaderProps) {
  return (
    <div className="space-y-2.5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <span
          className="font-sans text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] shrink-0"
          style={{ color: 'var(--danger)' }}
        >
          {eyebrow}
        </span>
        {eyebrow && (
          <span
            aria-hidden
            className="hidden sm:block h-px w-12"
            style={{ background: 'var(--admin-accent)' }}
          />
        )}
      </div>
      <h2
        className="font-sans text-xl sm:text-2xl lg:text-3xl font-black leading-tight tracking-[-0.01em]"
        style={{ color: 'var(--text-primary)' }}
      >
        {title}
      </h2>
      {subtitle && (
        <p
          className="text-xs sm:text-sm leading-relaxed max-w-xl"
          style={{ color: 'var(--text-muted)' }}
        >
          {subtitle}
        </p>
      )}
      <div
        className="h-[2px] w-10 rounded-full"
        style={{ background: 'var(--admin-accent)' }}
      />
    </div>
  );
}
