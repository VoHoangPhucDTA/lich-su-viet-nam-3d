import {
  flattenExamQuestions,
  isMCQQuestion,
  isTFQuestion,
  type CognitiveLevel,
  type DifficultyLevel,
  type ExamFile,
  type ExamResultV2,
  type Question,
  type QuestionResult,
  type QuestionType,
} from '@/types/exam';

export type AnalysisGroupKind = 'topic' | 'questionType' | 'cognitiveLevel' | 'difficulty';

export interface WeaknessBucket {
  key: string;
  label: string;
  total: number;
  correct: number;
  wrong: number;
  blank: number;
  partial: number;
  pointsEarned: number;
  maxPoints: number;
  accuracy: number;
}

export interface WeaknessSuggestion {
  title: string;
  detail: string;
  action?: 'retryWrong' | 'browse' | 'history';
}

export interface WeaknessAnalysis {
  totalQuestions: number;
  analyzedQuestions: number;
  missingQuestions: number;
  hasWeakness: boolean;
  weakestTopic?: WeaknessBucket;
  weakestQuestionType?: WeaknessBucket;
  weakestCognitiveLevel?: WeaknessBucket;
  weakestDifficulty?: WeaknessBucket;
  byTopic: WeaknessBucket[];
  byQuestionType: WeaknessBucket[];
  byCognitiveLevel: WeaknessBucket[];
  byDifficulty: WeaknessBucket[];
  suggestions: WeaknessSuggestion[];
}

const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  mcq: 'MCQ',
  true_false: 'Đúng/Sai',
};

const COGNITIVE_LABEL: Record<CognitiveLevel, string> = {
  knowledge: 'Nhận biết',
  comprehension: 'Thông hiểu',
  application: 'Vận dụng',
};

const DIFFICULTY_LABEL: Record<DifficultyLevel, string> = {
  easy: 'Dễ',
  medium: 'Trung bình',
  hard: 'Khó',
};

function makeBucket(key: string, label: string): WeaknessBucket {
  return {
    key,
    label,
    total: 0,
    correct: 0,
    wrong: 0,
    blank: 0,
    partial: 0,
    pointsEarned: 0,
    maxPoints: 0,
    accuracy: 0,
  };
}

function getBucket(map: Map<string, WeaknessBucket>, key: string, label = key): WeaknessBucket {
  const safeKey = key?.trim() || 'unknown';
  const safeLabel = label?.trim() || 'Chưa phân loại';
  const existing = map.get(safeKey);
  if (existing) return existing;
  const bucket = makeBucket(safeKey, safeLabel);
  map.set(safeKey, bucket);
  return bucket;
}

function isBlank(result: QuestionResult): boolean {
  if (result.questionType === 'mcq') return result.mcq?.selected == null;
  if (!result.tf?.selected) return true;
  return Object.values(result.tf.selected).every((value) => value == null);
}

function isPartial(result: QuestionResult): boolean {
  return result.questionType === 'true_false' && !result.isCorrect && (result.tf?.correctCount ?? 0) > 0;
}

function getMaxPoints(question: Question): number {
  if (isMCQQuestion(question)) return 0.25;
  if (isTFQuestion(question)) return 1;
  return 0;
}

function addToBucket(bucket: WeaknessBucket, result: QuestionResult, maxPoints: number): void {
  const blank = isBlank(result);
  bucket.total += 1;
  bucket.pointsEarned += result.pointsEarned ?? 0;
  bucket.maxPoints += maxPoints;
  if (result.isCorrect) bucket.correct += 1;
  else if (blank) bucket.blank += 1;
  else bucket.wrong += 1;
  if (isPartial(result)) bucket.partial += 1;
}

function finalizeBuckets(map: Map<string, WeaknessBucket>): WeaknessBucket[] {
  return Array.from(map.values())
    .map((bucket) => ({
      ...bucket,
      pointsEarned: Math.round(bucket.pointsEarned * 100) / 100,
      maxPoints: Math.round(bucket.maxPoints * 100) / 100,
      accuracy: bucket.total > 0 ? Math.round((bucket.correct / bucket.total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => {
      const aIssues = a.wrong + a.blank;
      const bIssues = b.wrong + b.blank;
      if (bIssues !== aIssues) return bIssues - aIssues;
      if (a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
      return b.total - a.total;
    });
}

function pickWeakest(buckets: WeaknessBucket[]): WeaknessBucket | undefined {
  return buckets.find((bucket) => bucket.wrong + bucket.blank > 0);
}

function buildSuggestions(analysis: Omit<WeaknessAnalysis, 'suggestions'>): WeaknessSuggestion[] {
  if (!analysis.hasWeakness) {
    return [
      {
        title: 'Duy trì phong độ',
        detail: 'Bạn làm rất tốt bài này. Hãy thử làm thêm đề khác để duy trì phong độ.',
        action: 'browse',
      },
    ];
  }

  const suggestions: WeaknessSuggestion[] = [
    {
      title: 'Ôn lại câu sai ngay',
      detail: 'Bắt đầu từ các câu sai hoặc bỏ trống để sửa đúng lỗ hổng vừa xuất hiện trong bài.',
      action: 'retryWrong',
    },
  ];

  if (analysis.weakestTopic) {
    suggestions.push({
      title: `Ôn lại chủ đề: ${analysis.weakestTopic.label}`,
      detail: `Chủ đề này có ${analysis.weakestTopic.wrong + analysis.weakestTopic.blank}/${analysis.weakestTopic.total} câu cần xem lại.`,
    });
  }

  const tfBucket = analysis.byQuestionType.find((bucket) => bucket.key === 'true_false');
  const mcqBucket = analysis.byQuestionType.find((bucket) => bucket.key === 'mcq');
  if (tfBucket && (tfBucket.wrong + tfBucket.blank) >= Math.max(2, (mcqBucket?.wrong ?? 0))) {
    suggestions.push({
      title: 'Luyện thêm dạng Đúng/Sai',
      detail: 'Phần Đúng/Sai đang có nhiều ý chưa chắc. Khi ôn, hãy tự giải thích từng mệnh đề trước khi chọn.',
    });
  }

  if (analysis.weakestCognitiveLevel?.key === 'application') {
    suggestions.push({
      title: 'Tăng cường câu vận dụng',
      detail: 'Nhóm vận dụng đang là điểm yếu nổi bật. Nên đọc kỹ dữ kiện, mốc thời gian và quan hệ nguyên nhân - kết quả.',
    });
  }

  if (analysis.weakestDifficulty) {
    suggestions.push({
      title: `Ưu tiên mức độ: ${analysis.weakestDifficulty.label}`,
      detail: `Mức này có độ chính xác ${analysis.weakestDifficulty.accuracy}%, thấp hơn các nhóm còn lại trong bài.`,
    });
  }

  suggestions.push({
    title: 'Làm thêm đề khác',
    detail: 'Sau khi ôn lại, làm một đề khác sẽ giúp kiểm tra xem điểm yếu đã giảm chưa.',
    action: 'browse',
  });

  return suggestions.slice(0, 5);
}

export function analyzeWeaknesses(result: ExamResultV2, exam: ExamFile): WeaknessAnalysis {
  const questions = new Map(flattenExamQuestions(exam).map((question) => [question.id, question]));
  const byTopic = new Map<string, WeaknessBucket>();
  const byQuestionType = new Map<string, WeaknessBucket>();
  const byCognitiveLevel = new Map<string, WeaknessBucket>();
  const byDifficulty = new Map<string, WeaknessBucket>();
  let missingQuestions = 0;
  let analyzedQuestions = 0;

  for (const questionResult of result.questions ?? []) {
    const question = questions.get(questionResult.questionId);
    if (!question) {
      missingQuestions += 1;
      continue;
    }

    analyzedQuestions += 1;
    const maxPoints = getMaxPoints(question);
    addToBucket(getBucket(byTopic, question.topic, question.topic), questionResult, maxPoints);
    addToBucket(getBucket(byQuestionType, question.questionType, QUESTION_TYPE_LABEL[question.questionType]), questionResult, maxPoints);
    addToBucket(
      getBucket(byCognitiveLevel, question.cognitiveLevel, COGNITIVE_LABEL[question.cognitiveLevel] ?? question.cognitiveLevel),
      questionResult,
      maxPoints
    );
    addToBucket(getBucket(byDifficulty, question.difficulty, DIFFICULTY_LABEL[question.difficulty] ?? question.difficulty), questionResult, maxPoints);
  }

  const topicBuckets = finalizeBuckets(byTopic);
  const questionTypeBuckets = finalizeBuckets(byQuestionType);
  const cognitiveBuckets = finalizeBuckets(byCognitiveLevel);
  const difficultyBuckets = finalizeBuckets(byDifficulty);
  const hasWeakness = topicBuckets.some((bucket) => bucket.wrong + bucket.blank > 0);

  const baseAnalysis: Omit<WeaknessAnalysis, 'suggestions'> = {
    totalQuestions: result.questions?.length ?? 0,
    analyzedQuestions,
    missingQuestions,
    hasWeakness,
    weakestTopic: pickWeakest(topicBuckets),
    weakestQuestionType: pickWeakest(questionTypeBuckets),
    weakestCognitiveLevel: pickWeakest(cognitiveBuckets),
    weakestDifficulty: pickWeakest(difficultyBuckets),
    byTopic: topicBuckets,
    byQuestionType: questionTypeBuckets,
    byCognitiveLevel: cognitiveBuckets,
    byDifficulty: difficultyBuckets,
  };

  return {
    ...baseAnalysis,
    suggestions: buildSuggestions(baseAnalysis),
  };
}
