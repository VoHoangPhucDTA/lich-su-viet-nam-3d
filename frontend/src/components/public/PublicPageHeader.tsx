import type { ReactNode } from 'react';
import BackButton from '../shared/BackButton';

interface PublicPageHeaderProps {
  eyebrow: string;
  title: string;
  description?: string;
  showBack?: boolean;
  backFallback?: string;
  action?: ReactNode;
}

/**
 * Renders a public page header with optional navigation, description, and action content.
 *
 * @param eyebrow - The text displayed above the page title
 * @param title - The page title
 * @param description - Optional supporting text displayed below the title
 * @param showBack - Whether to display a back button
 * @param backFallback - The fallback path used by the back button
 * @param action - Optional content displayed beside the header text
 * @returns The rendered public page header
 */
export default function PublicPageHeader({
  eyebrow,
  title,
  description,
  showBack = false,
  backFallback = '/home',
  action,
}: PublicPageHeaderProps) {
  return (
    <header className="public-page-header">
      {showBack && (
        <div className="public-page-back-row">
          <BackButton fallback={backFallback} />
        </div>
      )}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="public-eyebrow">{eyebrow}</p>
          <h1 className="app-heading mt-2 text-4xl font-bold tracking-tight text-[var(--text-primary)] sm:text-5xl">
            {title}
          </h1>
          {description && (
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
              {description}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  );
}
