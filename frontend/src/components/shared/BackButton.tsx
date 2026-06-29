import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface BackButtonProps {
  /** Fallback route when no browser history exists (direct URL access). Default: '/home' */
  fallback?: string;
  /** Override button label. Default: 'Cội Nguồn' */
  label?: string;
  /** Additional className appended to the button */
  className?: string;
}

/**
 * Context-aware back navigation button.
 *
 * Uses `window.history.length` to detect direct URL access (new tab, no app
 * history) — falls back to `fallback` route. Otherwise calls `navigate(-1)`
 * to preserve the actual browser history.
 *
 * Styled as a subtle secondary navigation element matching the lsvn3d
 * museum design language.
 */
export default function BackButton({ fallback = '/home', label = 'Cội Nguồn', className = '' }: BackButtonProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (window.history.length <= 1) {
      navigate(fallback);
    } else {
      navigate(-1);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`inline-flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider text-stone-400 hover:text-red-900 transition-colors ${className}`}
    >
      <ArrowLeft className="h-3 w-3" />
      {label}
    </button>
  );
}
