import type { ExamQuestion } from '../types/exam';

export const MOCK_EXAM_QUESTIONS: ExamQuestion[] = Array.from({ length: 35 }).map((_, idx) => {
  const grade = (10 + (idx % 3)) as 10 | 11 | 12; // Cycle through 10, 11, 12
  const difficulty = idx % 4 === 0 ? 'hard' : idx % 3 === 0 ? 'medium' : 'easy';
  const topics = ['Lịch sử thế giới thời nguyên thủy', 'Phong kiến phương Đông', 'Phong kiến phương Tây', 'Việt Nam thời Bắc thuộc', 'Kháng chiến chống Pháp', 'Kháng chiến chống Mỹ'];
  const topic = topics[idx % topics.length];
  
  return {
    id: `exam-q-mock-${idx + 1}`,
    questionText: `[Mock Question] Dữ kiện mô phỏng câu hỏi số ${idx + 1} về chủ đề ${topic}?`,
    options: [
      { id: 'A', text: 'Nội dung phương án A (Mô phỏng)' },
      { id: 'B', text: 'Nội dung phương án B (Mô phỏng)' },
      { id: 'C', text: 'Nội dung phương án C (Mô phỏng)' },
      { id: 'D', text: 'Nội dung phương án D (Mô phỏng)' },
    ],
    correctOptionId: ['A', 'B', 'C', 'D'][idx % 4] as 'A' | 'B' | 'C' | 'D',
    explanation: `Giải thích chi tiết cho câu hỏi số ${idx + 1}. Đáp án đúng là ${['A', 'B', 'C', 'D'][idx % 4]} vì dữ kiện lịch sử chỉ ra như vậy.`,
    difficulty: difficulty,
    grade: grade,
    topic: topic,
    sourceRefs: [
      {
        title: `SGK Lịch sử ${grade}`,
        location: `Trang ${10 + idx * 2}`,
      }
    ],
    cognitiveLevel: 'knowledge'
  };
});
