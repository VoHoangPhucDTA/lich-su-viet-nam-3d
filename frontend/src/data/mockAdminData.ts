// ─── Types ──────────────────────────────────────────────────────────────────

export type AdminUserStatus = 'active' | 'locked';
export type AdminUserRole   = 'student' | 'admin';

export interface AdminUser {
  id: string;
  fullName: string;
  email: string;
  role: AdminUserRole;
  grade?: number;
  school?: string;
  status: AdminUserStatus;
  createdAt: string;
  lastActive: string;
}

export interface AdminEvent {
  id: string;
  title: string;
  grade: 10 | 11 | 12 | null;   // null = all grades
  eventType: 'military' | 'political' | 'economic' | 'cultural';
  geoType: 'single_point' | 'multi_region' | 'nationwide' | 'no_location';
  isVietnam: boolean;            // true = within Vietnam
  hasMap: boolean;
  dataComplete: boolean;
  status: 'published' | 'draft';
  startYear: number;
  endYear?: number;
}

export interface AdminQuestion {
  id: string;
  topic: string;
  grade: 10 | 11 | 12;
  difficulty: 'easy' | 'medium' | 'hard';
  timesAttempted: number;
  correctRate: number;  // 0-100
  status: 'approved' | 'pending' | 'rejected';
  category: 'military' | 'political' | 'economic' | 'cultural';
  createdAt: string;
}

export interface ActivityLogItem {
  id: string;
  user: string;
  action: string;
  time: string;
  icon: string;
}

export interface DailyActivity {
  day: string;
  views: number;
  quizzes: number;
}

// ─── Mock Users ──────────────────────────────────────────────────────────────

export const MOCK_ADMIN_USERS: AdminUser[] = [
  {
    id: 'u001', fullName: 'Nguyễn Văn An', email: 'student@demo.com',
    role: 'student', grade: 11, school: 'THPT Nguyễn Huệ',
    status: 'active', createdAt: '2025-09-01T08:00:00Z', lastActive: '2025-04-21T09:15:00Z',
  },
  {
    id: 'u002', fullName: 'Trần Thị Bảo', email: 'bao.tran@student.edu',
    role: 'student', grade: 12, school: 'THPT Chu Văn An',
    status: 'active', createdAt: '2025-09-02T09:00:00Z', lastActive: '2025-04-20T14:30:00Z',
  },
  {
    id: 'u003', fullName: 'Lê Minh Công', email: 'cong.le@student.edu',
    role: 'student', grade: 10, school: 'THPT Lê Quý Đôn',
    status: 'locked', createdAt: '2025-09-05T10:00:00Z', lastActive: '2025-04-15T08:00:00Z',
  },
  {
    id: 'u004', fullName: 'Phạm Hồng Diệu', email: 'dieu.pham@student.edu',
    role: 'student', grade: 11, school: 'THPT Trần Phú',
    status: 'active', createdAt: '2025-09-10T07:30:00Z', lastActive: '2025-04-21T11:00:00Z',
  },
  {
    id: 'u005', fullName: 'Hoàng Đức Huy', email: 'huy.hoang@student.edu',
    role: 'student', grade: 12, school: 'THPT Nguyễn Trãi',
    status: 'active', createdAt: '2025-09-12T08:45:00Z', lastActive: '2025-04-19T16:00:00Z',
  },
  {
    id: 'u006', fullName: 'Vũ Thị Lan', email: 'lan.vu@student.edu',
    role: 'student', grade: 10, school: 'THPT Lý Tự Trọng',
    status: 'active', createdAt: '2025-09-15T09:20:00Z', lastActive: '2025-04-18T10:15:00Z',
  },
  {
    id: 'u007', fullName: 'Đặng Văn Nam', email: 'nam.dang@student.edu',
    role: 'student', grade: 11, school: 'THPT Phan Đình Phùng',
    status: 'locked', createdAt: '2025-09-18T10:00:00Z', lastActive: '2025-04-10T09:30:00Z',
  },
  {
    id: 'u008', fullName: 'Admin Hệ Thống', email: 'admin@demo.com',
    role: 'admin', grade: undefined, school: undefined,
    status: 'active', createdAt: '2025-01-01T00:00:00Z', lastActive: '2025-04-21T11:45:00Z',
  },
];

// ─── Mock Events ─────────────────────────────────────────────────────────────

export const MOCK_ADMIN_EVENTS: AdminEvent[] = [
  {
    id: 'cmtt-1945', title: 'Cách mạng Tháng Tám 1945',
    grade: 12, eventType: 'political', geoType: 'nationwide',
    isVietnam: true, hasMap: true, dataComplete: true, status: 'published', startYear: 1945,
  },
  {
    id: 'kc-chong-phap', title: 'Kháng chiến chống Pháp (1946-1954)',
    grade: 12, eventType: 'military', geoType: 'multi_region',
    isVietnam: true, hasMap: true, dataComplete: true, status: 'published', startYear: 1946, endYear: 1954,
  },
  {
    id: 'dien-bien-phu', title: 'Chiến dịch Điện Biên Phủ 1954',
    grade: 12, eventType: 'military', geoType: 'single_point',
    isVietnam: true, hasMap: true, dataComplete: true, status: 'published', startYear: 1954,
  },
  {
    id: 'hiep-dinh-geneve', title: 'Hiệp định Genève 1954',
    grade: 12, eventType: 'political', geoType: 'no_location',
    isVietnam: false, hasMap: false, dataComplete: false, status: 'published', startYear: 1954,
  },
  {
    id: 'kc-chong-my', title: 'Kháng chiến chống Mỹ (1954-1975)',
    grade: 12, eventType: 'military', geoType: 'multi_region',
    isVietnam: true, hasMap: true, dataComplete: true, status: 'published', startYear: 1954, endYear: 1975,
  },
  {
    id: 'hai-ba-trung', title: 'Khởi nghĩa Hai Bà Trưng (năm 40)',
    grade: 10, eventType: 'military', geoType: 'multi_region',
    isVietnam: true, hasMap: true, dataComplete: true, status: 'published', startYear: 40,
  },
  {
    id: 'bach-dang-938', title: 'Chiến thắng Bạch Đằng 938',
    grade: 10, eventType: 'military', geoType: 'single_point',
    isVietnam: true, hasMap: true, dataComplete: true, status: 'published', startYear: 938,
  },
  {
    id: 'nha-tran', title: 'Nhà Trần và ba lần kháng Nguyên Mông',
    grade: 11, eventType: 'military', geoType: 'multi_region',
    isVietnam: true, hasMap: true, dataComplete: false, status: 'draft', startYear: 1258, endYear: 1288,
  },
  {
    id: 'lam-son', title: 'Khởi nghĩa Lam Sơn (1418-1427)',
    grade: 11, eventType: 'military', geoType: 'multi_region',
    isVietnam: true, hasMap: false, dataComplete: false, status: 'draft', startYear: 1418, endYear: 1427,
  },
  {
    id: 'kinh-te-nguyen', title: 'Kinh tế thời Nguyễn',
    grade: 11, eventType: 'economic', geoType: 'nationwide',
    isVietnam: true, hasMap: false, dataComplete: false, status: 'draft', startYear: 1802, endYear: 1884,
  },
];

// ─── Mock Questions ───────────────────────────────────────────────────────────

export const MOCK_ADMIN_QUESTIONS: AdminQuestion[] = [
  {
    id: 'q001', topic: 'Cách mạng Tháng Tám', grade: 12,
    difficulty: 'medium', timesAttempted: 320, correctRate: 74,
    status: 'approved', category: 'political', createdAt: '2025-03-01T08:00:00Z',
  },
  {
    id: 'q002', topic: 'Chiến dịch Điện Biên Phủ', grade: 12,
    difficulty: 'hard', timesAttempted: 289, correctRate: 61,
    status: 'approved', category: 'military', createdAt: '2025-03-05T09:00:00Z',
  },
  {
    id: 'q003', topic: 'Kháng chiến chống Pháp', grade: 12,
    difficulty: 'medium', timesAttempted: 215, correctRate: 68,
    status: 'approved', category: 'military', createdAt: '2025-03-08T10:00:00Z',
  },
  {
    id: 'q004', topic: 'Thời kỳ Bắc thuộc', grade: 10,
    difficulty: 'easy', timesAttempted: 180, correctRate: 82,
    status: 'approved', category: 'political', createdAt: '2025-03-12T08:30:00Z',
  },
  {
    id: 'q005', topic: 'Kinh tế thời Nguyễn', grade: 11,
    difficulty: 'hard', timesAttempted: 97, correctRate: 48,
    status: 'pending', category: 'economic', createdAt: '2025-04-01T11:00:00Z',
  },
  {
    id: 'q006', topic: 'Văn hóa thời Lý – Trần', grade: 11,
    difficulty: 'easy', timesAttempted: 145, correctRate: 79,
    status: 'approved', category: 'cultural', createdAt: '2025-03-20T09:00:00Z',
  },
  {
    id: 'q007', topic: 'Chiến dịch Hồ Chí Minh', grade: 12,
    difficulty: 'medium', timesAttempted: 204, correctRate: 71,
    status: 'pending', category: 'military', createdAt: '2025-04-10T10:00:00Z',
  },
  {
    id: 'q008', topic: 'Khởi nghĩa Hai Bà Trưng', grade: 10,
    difficulty: 'easy', timesAttempted: 163, correctRate: 88,
    status: 'rejected', category: 'military', createdAt: '2025-04-15T08:00:00Z',
  },
];

// ─── Activity Log ─────────────────────────────────────────────────────────────

export const MOCK_ACTIVITY_LOG: ActivityLogItem[] = [
  { id: 'a1', user: 'Nguyễn Văn An', action: 'Làm trắc nghiệm: Kháng chiến chống Pháp (8.5 điểm)', time: '2025-04-21T09:15:00Z', icon: '📝' },
  { id: 'a2', user: 'Phạm Hồng Diệu', action: 'Xem sự kiện: Cách mạng Tháng Tám 1945', time: '2025-04-21T08:50:00Z', icon: '👁️' },
  { id: 'a3', user: 'Trần Thị Bảo', action: 'Đăng ký tài khoản mới', time: '2025-04-20T14:30:00Z', icon: '🆕' },
  { id: 'a4', user: 'Hoàng Đức Huy', action: 'Hoàn thành đề thi: Lịch sử hiện đại (7.25 điểm)', time: '2025-04-20T11:00:00Z', icon: '📋' },
  { id: 'a5', user: 'Vũ Thị Lan', action: 'Xem sự kiện: Chiến thắng Bạch Đằng 938', time: '2025-04-19T16:30:00Z', icon: '👁️' },
  { id: 'a6', user: 'Nguyễn Văn An', action: 'Xem sự kiện: Chiến dịch Điện Biên Phủ', time: '2025-04-19T09:00:00Z', icon: '👁️' },
];

// ─── Daily Activity ───────────────────────────────────────────────────────────

export const MOCK_DAILY_ACTIVITY: DailyActivity[] = [
  { day: 'T2',  views: 24, quizzes: 8 },
  { day: 'T3',  views: 31, quizzes: 12 },
  { day: 'T4',  views: 18, quizzes: 6 },
  { day: 'T5',  views: 42, quizzes: 15 },
  { day: 'T6',  views: 38, quizzes: 11 },
  { day: 'T7',  views: 55, quizzes: 20 },
  { day: 'CN',  views: 27, quizzes: 9 },
];

// ─── Summary Stats ────────────────────────────────────────────────────────────

export const ADMIN_SUMMARY = {
  totalUsers: MOCK_ADMIN_USERS.length,
  activeUsers: MOCK_ADMIN_USERS.filter(u => u.status === 'active').length,
  totalEvents: MOCK_ADMIN_EVENTS.length,
  publishedEvents: MOCK_ADMIN_EVENTS.filter(e => e.status === 'published').length,
  totalQuestions: MOCK_ADMIN_QUESTIONS.length,
  pendingQuestions: MOCK_ADMIN_QUESTIONS.filter(q => q.status === 'pending').length,
  todayAttempts: 23,
  newUsersThisWeek: 3,
};
