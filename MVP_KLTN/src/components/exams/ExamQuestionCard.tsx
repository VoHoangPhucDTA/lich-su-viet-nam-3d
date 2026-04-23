import type { ExamQuestion } from '../../types/exam';
import ExamOptionCard from './ExamOptionCard';

interface QuestionCardProps {
  question: ExamQuestion;
  index: number;
  total: number;
  selectedOptionId: 'A' | 'B' | 'C' | 'D' | null;
  onSelectOption: (id: 'A' | 'B' | 'C' | 'D') => void;
}

export default function ExamQuestionCard({ question, index, total, selectedOptionId, onSelectOption }: QuestionCardProps) {
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: '1.25rem', padding: '2rem', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
        
        {/* Header Badges */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Câu {index + 1} <span style={{ color: 'var(--text-muted)', fontSize: '1rem', fontWeight: 600 }}>/ {total}</span>
            </div>
            
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ padding: '0.2rem 0.6rem', background: 'var(--bg-surface)', color: 'var(--text-secondary)', borderRadius: '0.5rem', fontSize: '0.75rem', fontWeight: 600 }}>Lớp {question.grade}</span>
                <span style={{ padding: '0.2rem 0.6rem', background: 'var(--bg-surface)', color: 'var(--text-secondary)', borderRadius: '0.5rem', fontSize: '0.75rem', fontWeight: 600 }}>{question.difficulty === 'easy' ? 'Dễ' : question.difficulty === 'medium' ? 'Trung bình' : 'Khó'}</span>
                {question.cognitiveLevel && (
                    <span style={{ padding: '0.2rem 0.6rem', background: 'var(--accent-soft)', color: 'var(--accent)', borderRadius: '0.5rem', fontSize: '0.75rem', fontWeight: 600 }}>
                        {question.cognitiveLevel === 'knowledge' ? 'Nhận biết' : question.cognitiveLevel === 'comprehension' ? 'Thông hiểu' : 'Vận dụng'}
                    </span>
                )}
            </div>
        </div>

        {/* Question Text */}
        <h2 style={{ fontSize: '1.2rem', lineHeight: 1.6, color: 'var(--text-primary)', fontWeight: 600, margin: '0 0 2rem 0' }}>
            {question.questionText}
        </h2>

        {/* Options Grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {question.options.map(opt => (
                <ExamOptionCard 
                  key={opt.id} 
                  id={opt.id} 
                  text={opt.text} 
                  selected={selectedOptionId === opt.id} 
                  onClick={() => onSelectOption(opt.id)} 
                />
            ))}
        </div>
    </div>
  );
}
