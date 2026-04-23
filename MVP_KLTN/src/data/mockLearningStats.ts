// ─── Types ───────────────────────────────────────────────────────────────────

export type ActivityType = 'view_event' | 'quiz' | 'exam';
export type EventCategory = 'military' | 'political' | 'economic' | 'cultural';
export type GradeLevel = 10 | 11 | 12;

export interface LearningStats {
  eventsViewed: number;
  quizzesCompleted: number;
  averageScore: number;
  streakDays: number;
  weeklyMinutes: number;
  totalMinutes: number;
  rankPercentile: number; // top X% of users
}

export interface LearningActivity {
  id: string;
  date: string; // ISO
  type: ActivityType;
  title: string;
  topic: string;
  grade: GradeLevel;
  durationMinutes: number;
  score?: number; // 0-10, only for quiz/exam
  correct?: number;
  total?: number;
}

export interface ScoreRecord {
  id: string;
  date: string;
  title: string;
  type: 'quiz' | 'exam';
  topic: string;
  grade: GradeLevel;
  score: number; // 0-10
  correct: number;
  total: number;
  durationMinutes: number;
  difficulty: 'easy' | 'medium' | 'hard';
  category: EventCategory;
}

export interface WeeklyScorePoint {
  week: string; // e.g. "T2 W1"
  score: number;
}

export interface CategoryScore {
  category: EventCategory;
  label: string;
  correctRate: number; // 0-100
  color: string;
  icon: string;
}

export interface RecommendationItem {
  id: string;
  title: string;
  reason: string;
  type: 'review' | 'new' | 'challenge';
  topic: string;
  estimatedMinutes: number;
  icon: string;
}

export interface ProgressByGrade {
  grade: GradeLevel;
  eventsTotal: number;
  eventsViewed: number;
  averageScore: number;
}

// ─── Mock Stats ───────────────────────────────────────────────────────────────

export const mockStats: LearningStats = {
  eventsViewed: 34,
  quizzesCompleted: 18,
  averageScore: 7.8,
  streakDays: 6,
  weeklyMinutes: 245,
  totalMinutes: 1820,
  rankPercentile: 15,
};

// ─── Learning History ─────────────────────────────────────────────────────────

export const mockHistory: LearningActivity[] = [
  {
    id: 'h1',
    date: '2025-04-21T09:15:00Z',
    type: 'view_event',
    title: 'Chiến thắng Điện Biên Phủ (1954)',
    topic: 'Kháng chiến chống Pháp',
    grade: 12,
    durationMinutes: 18,
  },
  {
    id: 'h2',
    date: '2025-04-21T10:05:00Z',
    type: 'quiz',
    title: 'Trắc nghiệm: Kháng chiến chống Pháp',
    topic: 'Kháng chiến chống Pháp',
    grade: 12,
    durationMinutes: 12,
    score: 8.5,
    correct: 17,
    total: 20,
  },
  {
    id: 'h3',
    date: '2025-04-20T14:30:00Z',
    type: 'view_event',
    title: 'Cách mạng tháng Tám 1945',
    topic: 'Cách mạng Việt Nam',
    grade: 12,
    durationMinutes: 22,
  },
  {
    id: 'h4',
    date: '2025-04-20T15:10:00Z',
    type: 'quiz',
    title: 'Trắc nghiệm: Cách mạng tháng Tám',
    topic: 'Cách mạng Việt Nam',
    grade: 12,
    durationMinutes: 10,
    score: 7.0,
    correct: 14,
    total: 20,
  },
  {
    id: 'h5',
    date: '2025-04-19T16:00:00Z',
    type: 'exam',
    title: 'Đề thi thử: Lịch sử Việt Nam hiện đại',
    topic: 'Ôn thi THPT',
    grade: 12,
    durationMinutes: 45,
    score: 6.5,
    correct: 26,
    total: 40,
  },
  {
    id: 'h6',
    date: '2025-04-19T08:00:00Z',
    type: 'view_event',
    title: 'Khởi nghĩa Hai Bà Trưng (năm 40)',
    topic: 'Thời kỳ Bắc thuộc',
    grade: 10,
    durationMinutes: 15,
  },
  {
    id: 'h7',
    date: '2025-04-18T09:30:00Z',
    type: 'view_event',
    title: 'Chiến thắng Bạch Đằng (938)',
    topic: 'Thoát Bắc thuộc, dựng nền độc lập',
    grade: 10,
    durationMinutes: 20,
  },
  {
    id: 'h8',
    date: '2025-04-18T10:15:00Z',
    type: 'quiz',
    title: 'Trắc nghiệm: Thời kỳ Bắc thuộc',
    topic: 'Thời kỳ Bắc thuộc',
    grade: 10,
    durationMinutes: 8,
    score: 9.0,
    correct: 9,
    total: 10,
  },
  {
    id: 'h9',
    date: '2025-04-17T14:00:00Z',
    type: 'view_event',
    title: 'Nhà Trần và ba lần kháng Nguyên Mông',
    topic: 'Nhà Trần',
    grade: 11,
    durationMinutes: 25,
  },
  {
    id: 'h10',
    date: '2025-04-17T15:30:00Z',
    type: 'quiz',
    title: 'Trắc nghiệm: Chế độ phong kiến Việt Nam',
    topic: 'Nhà Trần',
    grade: 11,
    durationMinutes: 15,
    score: 6.0,
    correct: 12,
    total: 20,
  },
  {
    id: 'h11',
    date: '2025-04-16T09:00:00Z',
    type: 'view_event',
    title: 'Khởi nghĩa Lam Sơn (1418–1427)',
    topic: 'Thời kỳ kháng Minh',
    grade: 11,
    durationMinutes: 30,
  },
  {
    id: 'h12',
    date: '2025-04-15T11:00:00Z',
    type: 'exam',
    title: 'Đề thi thử: Lịch sử phong kiến Việt Nam',
    topic: 'Ôn tập lớp 11',
    grade: 11,
    durationMinutes: 40,
    score: 7.25,
    correct: 29,
    total: 40,
  },
];

// ─── Score Records ────────────────────────────────────────────────────────────

export const mockScores: ScoreRecord[] = [
  {
    id: 's1',
    date: '2025-04-21T10:05:00Z',
    title: 'Trắc nghiệm: Kháng chiến chống Pháp',
    type: 'quiz',
    topic: 'Kháng chiến chống Pháp',
    grade: 12,
    score: 8.5,
    correct: 17,
    total: 20,
    durationMinutes: 12,
    difficulty: 'medium',
    category: 'military',
  },
  {
    id: 's2',
    date: '2025-04-21T09:00:00Z',
    title: 'Trắc nghiệm: Cách mạng tháng Tám',
    type: 'quiz',
    topic: 'Cách mạng Việt Nam',
    grade: 12,
    score: 7.0,
    correct: 14,
    total: 20,
    durationMinutes: 10,
    difficulty: 'medium',
    category: 'political',
  },
  {
    id: 's3',
    date: '2025-04-19T16:00:00Z',
    title: 'Đề thi thử: Lịch sử Việt Nam hiện đại',
    type: 'exam',
    topic: 'Ôn thi THPT',
    grade: 12,
    score: 6.5,
    correct: 26,
    total: 40,
    durationMinutes: 45,
    difficulty: 'hard',
    category: 'political',
  },
  {
    id: 's4',
    date: '2025-04-18T10:15:00Z',
    title: 'Trắc nghiệm: Thời kỳ Bắc thuộc',
    type: 'quiz',
    topic: 'Thời kỳ Bắc thuộc',
    grade: 10,
    score: 9.0,
    correct: 9,
    total: 10,
    durationMinutes: 8,
    difficulty: 'easy',
    category: 'military',
  },
  {
    id: 's5',
    date: '2025-04-17T15:30:00Z',
    title: 'Trắc nghiệm: Chế độ phong kiến',
    type: 'quiz',
    topic: 'Nhà Trần',
    grade: 11,
    score: 6.0,
    correct: 12,
    total: 20,
    durationMinutes: 15,
    difficulty: 'medium',
    category: 'economic',
  },
  {
    id: 's6',
    date: '2025-04-15T11:00:00Z',
    title: 'Đề thi thử: Lịch sử phong kiến',
    type: 'exam',
    topic: 'Ôn tập lớp 11',
    grade: 11,
    score: 7.25,
    correct: 29,
    total: 40,
    durationMinutes: 40,
    difficulty: 'hard',
    category: 'cultural',
  },
  {
    id: 's7',
    date: '2025-04-13T08:30:00Z',
    title: 'Trắc nghiệm: Văn hoá Đại Việt',
    type: 'quiz',
    topic: 'Văn hoá thời Lý – Trần',
    grade: 11,
    score: 8.0,
    correct: 16,
    total: 20,
    durationMinutes: 13,
    difficulty: 'easy',
    category: 'cultural',
  },
  {
    id: 's8',
    date: '2025-04-11T10:00:00Z',
    title: 'Trắc nghiệm: Kinh tế thời Nguyễn',
    type: 'quiz',
    topic: 'Triều Nguyễn',
    grade: 11,
    score: 5.0,
    correct: 10,
    total: 20,
    durationMinutes: 11,
    difficulty: 'hard',
    category: 'economic',
  },
];

// ─── Weekly Score Points ──────────────────────────────────────────────────────

export const mockWeeklyScores: WeeklyScorePoint[] = [
  { week: 'T2', score: 6.0 },
  { week: 'T3', score: 6.5 },
  { week: 'T4', score: 7.25 },
  { week: 'T5', score: 7.0 },
  { week: 'T6', score: 8.0 },
  { week: 'T7', score: 8.5 },
  { week: 'CN', score: 7.8 },
];

// ─── Category Scores ─────────────────────────────────────────────────────────

export const mockCategoryScores: CategoryScore[] = [
  { category: 'military',  label: 'Quân sự',       correctRate: 82, color: '#ef4444', icon: '⚔️' },
  { category: 'political', label: 'Chính trị',     correctRate: 68, color: '#3b82f6', icon: '🏛️' },
  { category: 'economic',  label: 'Kinh tế',       correctRate: 55, color: '#f59e0b', icon: '💰' },
  { category: 'cultural',  label: 'Văn hoá – XH',  correctRate: 75, color: '#10b981', icon: '🎭' },
];

// ─── Progress by Grade ────────────────────────────────────────────────────────

export const mockProgressByGrade: ProgressByGrade[] = [
  { grade: 10, eventsTotal: 28, eventsViewed: 10, averageScore: 8.2 },
  { grade: 11, eventsTotal: 35, eventsViewed: 14, averageScore: 7.0 },
  { grade: 12, eventsTotal: 30, eventsViewed: 10, averageScore: 7.5 },
];

// ─── Recommendations ──────────────────────────────────────────────────────────

export const mockRecommendations: RecommendationItem[] = [
  {
    id: 'r1',
    title: 'Ôn tập: Kinh tế thời Nguyễn',
    reason: 'Điểm chủ đề Kinh tế còn thấp (55%). Ôn lại để tăng điểm.',
    type: 'review',
    topic: 'Triều Nguyễn',
    estimatedMinutes: 20,
    icon: '💰',
  },
  {
    id: 'r2',
    title: 'Ôn tập: Chính sách đối ngoại nhà Nguyễn',
    reason: 'Chủ đề Chính trị cần cải thiện (68%). Học sâu hơn về ngoại giao.',
    type: 'review',
    topic: 'Triều Nguyễn',
    estimatedMinutes: 15,
    icon: '🏛️',
  },
  {
    id: 'r3',
    title: 'Thử thách: Đề thi THPT Quốc gia 2024',
    reason: 'Bạn đã đạt điểm TB 7.8 — sẵn sàng thử sức với đề khó!',
    type: 'challenge',
    topic: 'Ôn thi THPT',
    estimatedMinutes: 50,
    icon: '🏆',
  },
];

// ─── Recent Events (continue learning) ───────────────────────────────────────
export const mockRecentEvents = [
  {
    id: 're1',
    title: 'Chiến thắng Điện Biên Phủ (1954)',
    topic: 'Kháng chiến chống Pháp',
    grade: 12,
    progress: 100,
    icon: '⚔️',
  },
  {
    id: 're2',
    title: 'Nhà Trần và ba lần kháng Nguyên Mông',
    topic: 'Nhà Trần',
    grade: 11,
    progress: 65,
    icon: '🛡️',
  },
  {
    id: 're3',
    title: 'Khởi nghĩa Lam Sơn (1418–1427)',
    topic: 'Thời kỳ kháng Minh',
    grade: 11,
    progress: 40,
    icon: '⚡',
  },
];
