export interface QuizShortcutItem {
  keyLabel: string;
  description: string;
}

export const AI_SELF_PRACTICE_SHORTCUTS: QuizShortcutItem[] = [
  { keyLabel: '← / →', description: 'Chuyển đến câu trước hoặc câu tiếp theo' },
  { keyLabel: '↑ / ↓', description: 'Chọn phương án trước hoặc tiếp theo' },
  { keyLabel: 'Home / End', description: 'Chọn phương án đầu tiên hoặc cuối cùng' },
  { keyLabel: 'A–D / 1–4', description: 'Chọn nhanh phương án A–D' },
  { keyLabel: 'Delete', description: 'Xóa phương án đang chọn' },
  { keyLabel: 'Shift + F', description: 'Đánh dấu hoặc bỏ đánh dấu câu hiện tại' },
  { keyLabel: 'Ctrl + Enter', description: 'Mở xác nhận nộp bài' },
  { keyLabel: '?', description: 'Mở hướng dẫn làm bài' },
];
