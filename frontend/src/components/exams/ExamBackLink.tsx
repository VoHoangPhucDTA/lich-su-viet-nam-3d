import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export default function ExamBackLink({ to, children, ariaLabel }: { to: string; children: ReactNode; ariaLabel?: string }) {
  return <Link to={to} aria-label={ariaLabel} className="exam-focusable exam-back-link"><ArrowLeft aria-hidden="true" size={16} />{children}</Link>;
}
