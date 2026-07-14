import { formatExamTitle } from '@/lib/exam/examDisplay';
import type { SourceRef } from '@/types/exam';

export default function QuestionSourceBlock({ sourceRefs }: { sourceRefs?: SourceRef[] }) {
  const refs = sourceRefs?.map((ref) => ({
    title: ref.title.trim(),
    location: /^câu\s+\d+$/iu.test(ref.location.trim()) ? '' : ref.location.trim(),
  })).filter((ref) => ref.title || ref.location) ?? [];
  if (refs.length === 0) return null;
  return (
    <aside className="exam-question-sources" aria-label="Nguồn câu hỏi">
      <strong>Nguồn câu hỏi:</strong>
      {refs.map((ref, index) => (
        <cite key={`${ref.title}-${ref.location}-${index}`}>
          <span>{formatExamTitle({ title: ref.title })}</span>
          {ref.location && <small>{ref.location}</small>}
        </cite>
      ))}
    </aside>
  );
}
