import type { CognitiveLevel, DifficultyLevel, QuestionType, TopicIndex, TopicIndexEntry } from '@/types/exam';

export interface TopicSummary {
  title: string;
  slug: string;
  total: number;
  mcqCount: number;
  tfCount: number;
  cognitiveLevels: CognitiveLevel[];
  difficulties: DifficultyLevel[];
  topics: string[];
  refs: TopicIndexEntry[];
  description: string;
}

export interface PeriodGroup {
  title: string;
  slug: string;
  keywords: string[];
  description: string;
}

export const PERIOD_GROUPS: PeriodGroup[] = [
  {
    title: 'Lịch sử Việt Nam trước 1858',
    slug: 'lich-su-viet-nam-truoc-1858',
    keywords: ['co trung dai', 'phong kien', 'bac thuoc', 'tay son', 'dai viet'],
    description: 'Các nội dung Việt Nam cổ, trung đại và thời phong kiến.',
  },
  {
    title: 'Việt Nam 1858-1918',
    slug: 'viet-nam-1858-1918',
    keywords: ['1858', '1918', 'yeu nuoc dau the ky', 'phan boi chau', 'phan chau trinh'],
    description: 'Phong trào yêu nước và chuyển biến xã hội đầu thế kỉ XX.',
  },
  {
    title: 'Việt Nam 1919-1945',
    slug: 'viet-nam-1919-1945',
    keywords: ['1919', '1930', '1939', '1945', 'nguyen ai quoc', 'dang cong san', 'cach mang thang tam'],
    description: 'Từ phong trào dân tộc dân chủ đến Cách mạng tháng Tám.',
  },
  {
    title: 'Việt Nam 1945-1954',
    slug: 'viet-nam-1945-1954',
    keywords: ['1945-1946', '1945 1946', '1945-1954', '1945 1954', 'chong phap'],
    description: 'Xây dựng chính quyền cách mạng và kháng chiến chống Pháp.',
  },
  {
    title: 'Việt Nam 1954-1975',
    slug: 'viet-nam-1954-1975',
    keywords: ['1954-1975', '1954 1975', 'chong my', 'mien bac', 'mien nam'],
    description: 'Xây dựng miền Bắc, đấu tranh thống nhất đất nước.',
  },
  {
    title: 'Việt Nam sau 1975',
    slug: 'viet-nam-sau-1975',
    keywords: ['sau 1975', '1975-1986', '1975 1986', 'doi moi', '1986', 'bien dao', 'doi ngoai'],
    description: 'Thống nhất đất nước, Đổi mới, hội nhập và bảo vệ chủ quyền.',
  },
  {
    title: 'Lịch sử thế giới / khu vực',
    slug: 'lich-su-the-gioi-khu-vuc',
    keywords: ['the gioi', 'chien tranh lanh', 'asean', 'dong nam a', 'lien xo', 'trung quoc', 'lien hop quoc', 'nhat ban', 'tay au', 'toan cau'],
    description: 'Lịch sử thế giới hiện đại, khu vực và quan hệ quốc tế.',
  },
  {
    title: 'Chủ đề khác',
    slug: 'chu-de-khac',
    keywords: [],
    description: 'Các nội dung chưa xếp chắc vào một giai đoạn cụ thể.',
  },
];

export function normalizeTopicText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/[-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slugifyTopic(value: string): string {
  const slug = normalizeTopicText(value).replace(/\s+/g, '-');
  return slug || 'chu-de-khac';
}

export function groupTopicByPeriod(topic: string): PeriodGroup {
  const normalized = normalizeTopicText(topic);
  return (
    PERIOD_GROUPS.find((group) =>
      group.keywords.some((keyword) => normalized.includes(keyword))
    ) ?? PERIOD_GROUPS[PERIOD_GROUPS.length - 1]
  );
}

function summarizeRefs(title: string, refs: TopicIndexEntry[], topics: string[], description: string): TopicSummary {
  const uniqueRefs = new Map<string, TopicIndexEntry>();
  for (const ref of refs) uniqueRefs.set(`${ref.examId}:${ref.questionId}`, ref);
  const deduped = Array.from(uniqueRefs.values());

  return {
    title,
    slug: slugifyTopic(title),
    total: deduped.length,
    mcqCount: deduped.filter((ref) => ref.questionType === 'mcq').length,
    tfCount: deduped.filter((ref) => ref.questionType === 'true_false').length,
    cognitiveLevels: Array.from(new Set(deduped.map((ref) => ref.cognitiveLevel))),
    difficulties: Array.from(new Set(deduped.map((ref) => ref.difficulty))),
    topics,
    refs: deduped,
    description,
  };
}

export function buildTopicSummaries(index: TopicIndex): TopicSummary[] {
  return Object.entries(index)
    .map(([topic, refs]) =>
      summarizeRefs(topic, refs, [topic], `Luyện các câu hỏi liên quan đến ${topic}.`)
    )
    .sort((a, b) => b.total - a.total || a.title.localeCompare(b.title, 'vi'));
}

export function buildPeriodSummaries(index: TopicIndex): TopicSummary[] {
  const bucket = new Map<string, { group: PeriodGroup; refs: TopicIndexEntry[]; topics: string[] }>();

  for (const [topic, refs] of Object.entries(index)) {
    const group = groupTopicByPeriod(topic);
    const current = bucket.get(group.slug) ?? { group, refs: [], topics: [] };
    current.refs.push(...refs);
    current.topics.push(topic);
    bucket.set(group.slug, current);
  }

  return Array.from(bucket.values())
    .map(({ group, refs, topics }) => ({
      ...summarizeRefs(group.title, refs, topics, group.description),
      slug: group.slug,
    }))
    .sort((a, b) => b.total - a.total || a.title.localeCompare(b.title, 'vi'));
}

export function findSummaryBySlug(index: TopicIndex, slug: string): TopicSummary | null {
  const all = [...buildTopicSummaries(index), ...buildPeriodSummaries(index)];
  return all.find((summary) => summary.slug === slug) ?? null;
}

export function filterRefs(
  refs: TopicIndexEntry[],
  questionType: QuestionType | 'all',
  cognitiveLevel: CognitiveLevel | 'all'
): TopicIndexEntry[] {
  return refs.filter((ref) => {
    if (questionType !== 'all' && ref.questionType !== questionType) return false;
    if (cognitiveLevel !== 'all' && ref.cognitiveLevel !== cognitiveLevel) return false;
    return true;
  });
}
