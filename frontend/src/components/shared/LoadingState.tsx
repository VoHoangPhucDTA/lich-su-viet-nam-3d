import { LoaderCircle } from 'lucide-react';

export default function LoadingState({ label = 'Đang tải...' }: { label?: string }) {
  return (
    <div className="public-state" role="status" aria-live="polite">
      <LoaderCircle size={28} aria-hidden="true" className="animate-spin text-[var(--accent)]" />
      <p className="font-medium">{label}</p>
    </div>
  );
}
