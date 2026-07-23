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
 * Renders a button that navigates to the previous page or a fallback route.
 *
 * @param fallback - Route to use when browser history has no previous entry
 * @param label - Text displayed in the button
 * @param className - Additional CSS classes applied to the button
 */
export default function BackButton({ fallback = '/home', label = 'Quay lại', className = '' }: BackButtonProps) {
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
      className={`inline-flex items-center text-xs font-sans font-bold uppercase tracking-wider text-stone-400 hover:text-red-900 transition-colors ${className}`}
    >
      {label}
    </button>
  );
}
