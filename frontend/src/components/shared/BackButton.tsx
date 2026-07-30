import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface BackButtonProps {
  /** Explicit destination. When provided, navigation never depends on browser history. */
  to?: string;
  /** Fallback route when no browser history exists (direct URL access). Default: '/home' */
  fallback?: string;
  /** Visible destination-oriented label. */
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
export default function BackButton({ to, fallback = '/home', label = 'Quay lại', className = '' }: BackButtonProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (to) {
      navigate(to);
      return;
    }
    if (window.history.length <= 1) {
      navigate(fallback);
    } else {
      navigate(-1);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`public-back-button ${className}`}
    >
      <ArrowLeft size={16} aria-hidden="true" />
      {label}
    </button>
  );
}
