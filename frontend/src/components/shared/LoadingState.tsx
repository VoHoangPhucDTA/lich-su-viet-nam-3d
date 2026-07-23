import { LoaderCircle } from 'lucide-react';

/**
 * Renders a loading status message with an optional spinner.
 *
 * @param label - The status message to display
 * @param textOnly - Whether to omit the spinner
 */
export default function LoadingState({ label = 'Đang tải...', textOnly = false }: { label?: string; textOnly?: boolean }) {
  return (
    <div className="public-state" role="status" aria-live="polite">
      {!textOnly && <LoaderCircle size={28} aria-hidden="true" className="animate-spin text-[var(--accent)]" />}
      <p className="font-medium">{label}</p>
    </div>
  );
}
