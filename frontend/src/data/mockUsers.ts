import type { User } from '../types/auth';

export interface MockUserRecord {
  user: User;
  password: string; // plain text for mock only
}

export const MOCK_USERS: MockUserRecord[] = [
  {
    user: {
      id: 'user-student-001',
      fullName: 'Nguyễn Văn An',
      email: 'student@demo.com',
      role: 'student',
      grade: '11',
      school: 'THPT Nguyễn Huệ',
      avatarUrl: '',
      createdAt: '2025-09-01T08:00:00Z',
    },
    password: '123456',
  },
  {
    user: {
      id: 'user-admin-001',
      fullName: 'Admin Hệ Thống',
      email: 'admin@demo.com',
      role: 'admin',
      grade: undefined,
      school: undefined,
      avatarUrl: '',
      createdAt: '2025-01-01T00:00:00Z',
    },
    password: 'admin123',
  },
];
