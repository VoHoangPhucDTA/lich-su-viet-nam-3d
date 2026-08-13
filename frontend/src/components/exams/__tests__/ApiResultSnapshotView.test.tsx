import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { NormalizedExamResult, NormalizedReviewedQuestion } from '@/lib/exam/resultAdapters';
import ApiResultSnapshotView from '../ApiResultSnapshotView';

const TOPIC_META = { periodSlug: null, periodTitle: null };

function mcqReview({
  id,
  selected,
  correct = 'A',
  cognitiveLevel = 'knowledge',
  topics = [],
  explanation = null,
}: {
  id: string;
  selected: 'A' | 'B' | 'C' | 'D' | null;
  correct?: 'A' | 'B' | 'C' | 'D';
  cognitiveLevel?: string | null;
  topics?: Array<{ slug: string; title: string }>;
  explanation?: string | null;
}): NormalizedReviewedQuestion {
  return {
    questionInstanceId: `instance-${id}`,
    publicQuestionId: id,
    question: {
      questionType: 'mcq',
      questionText: `Nội dung ${id}`,
      difficulty: 'medium',
      cognitiveLevel,
      options: [
        { id: 'A', text: 'Phương án A' },
        { id: 'B', text: 'Phương án B' },
        { id: 'C', text: 'Phương án C' },
        { id: 'D', text: 'Phương án D' },
      ],
    },
    userAnswer: selected,
    correctAnswer: correct,
    correctness: selected !== null && selected === correct,
    points: selected === correct ? 0.25 : 0,
    completionState: selected === null ? 'BLANK' : 'COMPLETE',
    explanation,
    topicRefs: topics.map((topic) => ({ ...topic, ...TOPIC_META })),
  };
}

function tfReview({
  id,
  selected,
  cognitiveLevel = 'application',
  topics = [],
  explanation = null,
}: {
  id: string;
  selected: Record<'a' | 'b' | 'c' | 'd', boolean | null>;
  cognitiveLevel?: string | null;
  topics?: Array<{ slug: string; title: string }>;
  explanation?: string | null;
}): NormalizedReviewedQuestion {
  const correct = { a: true, b: true, c: true, d: true };
  const answered = Object.values(selected).filter((value) => value !== null).length;
  const correctCount = Object.entries(selected).filter(([key, value]) => value !== null && value === correct[key as keyof typeof correct]).length;
  return {
    questionInstanceId: `instance-${id}`,
    publicQuestionId: id,
    question: {
      questionType: 'true_false',
      questionText: `Nội dung ${id}`,
      difficulty: 'hard',
      cognitiveLevel,
      statements: [
        { id: 'a', text: 'Mệnh đề a' },
        { id: 'b', text: 'Mệnh đề b' },
        { id: 'c', text: 'Mệnh đề c' },
        { id: 'd', text: 'Mệnh đề d' },
      ],
    },
    userAnswer: selected,
    correctAnswer: correct,
    correctness: correctCount === 4,
    points: 0,
    completionState: answered === 0 ? 'BLANK' : answered === 4 ? 'COMPLETE' : 'PARTIAL',
    explanation,
    topicRefs: topics.map((topic) => ({ ...topic, ...TOPIC_META })),
  };
}

function resultWith(questions: NormalizedReviewedQuestion[], overrides: Partial<NormalizedExamResult> = {}): NormalizedExamResult {
  return {
    source: 'snapshot_v2',
    sessionId: 'attempt-2026',
    title: 'Đề thi chẩn đoán',
    mode: 'TIMED_ORIGINAL',
    submittedAt: 1_754_703_000_000,
    totalScore: 6.75,
    totalQuestions: questions.length,
    authority: {
      scoreAuthority: 'BACKEND',
      timingAuthority: 'SERVER',
      submissionOrigin: 'SERVER_ON_TIME',
    },
    questions,
    ...overrides,
  };
}

function renderView(result: NormalizedExamResult) {
  return render(
    <MemoryRouter>
      <ApiResultSnapshotView result={result} />
    </MemoryRouter>,
  );
}

describe('ApiResultSnapshotView diagnosis UX', () => {
  it('orders diagnosis before review, limits priority topics, and links the encoded canonical slug', () => {
    const result = resultWith([
      tfReview({
        id: 'tf-priority',
        selected: { a: true, b: false, c: false, d: false },
        topics: [{ slug: 'chu de/1945', title: 'Chủ đề 1945' }],
      }),
      mcqReview({
        id: 'mcq-overlap',
        selected: 'B',
        topics: [
          { slug: 'topic-b', title: 'Chủ đề B' },
          { slug: 'topic-c', title: 'Chủ đề C' },
          { slug: 'topic-d', title: 'Chủ đề D' },
        ],
      }),
    ]);

    renderView(result);

    const summaryHeading = screen.getByRole('heading', { name: 'Kết quả bài làm' });
    const topicsHeading = screen.getByRole('heading', { name: 'Bạn nên ôn gì tiếp theo?' });
    const reviewHeading = screen.getByRole('heading', { name: 'Xem lại bài làm' });
    expect(summaryHeading.compareDocumentPosition(topicsHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(topicsHeading.compareDocumentPosition(reviewHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(screen.queryByRole('heading', { name: 'Chẩn đoán bài làm' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Chủ đề cần ưu tiên' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Kết quả theo dạng câu hỏi' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Kết quả theo mức nhận thức' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Review chi tiết từng câu' })).not.toBeInTheDocument();

    // Các helper paragraph giải thích thuật toán và copy kỹ thuật đã bị loại khỏi Result.
    expect(screen.queryByText(/Trắc nghiệm tính theo câu; Đúng\/Sai tính theo từng ý\./)).not.toBeInTheDocument();
    expect(screen.queryByText(/Trong bài này, bạn có/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sắp xếp theo số câu\/ý sai trong bài này/)).not.toBeInTheDocument();
    expect(screen.queryByText(/mỗi câu trắc nghiệm nhiều lựa chọn được tính là 1 đơn vị/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Đơn vị sai')).not.toBeInTheDocument();
    expect(screen.queryByText('Đơn vị bỏ trống')).not.toBeInTheDocument();

    expect(screen.getAllByRole('link', { name: /^Ôn chủ đề / })).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'Ôn chủ đề Chủ đề 1945' }))
      .toHaveAttribute('href', '/exams/on-chu-de/chu%20de%2F1945');
    expect(screen.getByRole('link', { name: 'Ôn lại câu cần cải thiện' }))
      .toHaveAttribute('href', '/exams/on-lai/attempt-2026');
  });

  it('presents correct, wrong, blank, and partial statuses while retaining answer review content', () => {
    renderView(resultWith([
      mcqReview({ id: 'mcq-correct', selected: 'A', explanation: 'Giải thích câu đúng.' }),
      mcqReview({ id: 'mcq-wrong', selected: 'B' }),
      mcqReview({ id: 'mcq-blank', selected: null }),
      tfReview({ id: 'tf-partial', selected: { a: true, b: true, c: false, d: null }, explanation: 'Giải thích câu Đúng/Sai.' }),
      tfReview({ id: 'tf-correct', selected: { a: true, b: true, c: true, d: true } }),
      tfReview({ id: 'tf-wrong', selected: { a: false, b: false, c: false, d: false } }),
      tfReview({ id: 'tf-blank', selected: { a: null, b: null, c: null, d: null } }),
    ]));

    // Default filter = "Cần xem lại"; chuyển sang "Tất cả" để xem đủ 7 câu.
    fireEvent.click(screen.getByRole('button', { name: 'Tất cả 7' }));
    const articles = [1, 2, 3, 4, 5, 6, 7].map((number) => screen.getByRole('heading', { name: `Câu ${number}` }).closest('article'));
    expect(articles.every(Boolean)).toBe(true);
    expect(within(articles[0]!).getByText('Đúng', { selector: 'span' })).toBeInTheDocument();
    expect(within(articles[1]!).getByText('Sai', { selector: 'span' })).toBeInTheDocument();
    expect(within(articles[2]!).getByText('Chưa trả lời', { selector: 'span' })).toBeInTheDocument();
    expect(within(articles[3]!).getByText('Đúng một phần', { selector: 'span' })).toBeInTheDocument();
    expect(within(articles[4]!).getByText('Đúng hoàn toàn', { selector: 'span' })).toBeInTheDocument();
    expect(within(articles[5]!).getByText('Sai', { selector: 'span' })).toBeInTheDocument();
    expect(within(articles[6]!).getByText('Chưa trả lời', { selector: 'span' })).toBeInTheDocument();
    expect(within(articles[0]!).getByText('Phương án A')).toBeInTheDocument();
    // Per-question point badge đã bị bỏ khỏi UI.
    expect(within(articles[0]!).queryByText(/Điểm câu này:/)).toBeNull();

    const firstDetails = within(articles[0]!).getByText('Giải thích đáp án').closest('details') as HTMLElement | null;
    expect(firstDetails).not.toBeNull();
    expect(firstDetails).not.toHaveAttribute('open');
    fireEvent.click(firstDetails!.querySelector('summary') as HTMLElement);
    expect(firstDetails).toHaveAttribute('open');
    expect(within(articles[0]!).getByText('Giải thích câu đúng.')).toBeInTheDocument();

    expect(within(articles[3]!).getByText('Mệnh đề d')).toBeInTheDocument();
    const fourthDetails = within(articles[3]!).getByText('Giải thích đáp án').closest('details') as HTMLElement;
    fireEvent.click(fourthDetails.querySelector('summary') as HTMLElement);
    expect(within(articles[3]!).getByText('Giải thích câu Đúng/Sai.')).toBeInTheDocument();
  });

  it('does not render an explanation disclosure for questions without an explanation', () => {
    const explainedArticle = renderView(resultWith([
      mcqReview({ id: 'has-explanation', selected: 'A', explanation: 'Có giải thích.' }),
      mcqReview({ id: 'no-explanation', selected: 'B' }),
    ])).container;
    // Default filter = needsReview → has-explanation (đúng) bị ẩn; bật Tất cả để xem cả hai.
    fireEvent.click(within(explainedArticle as HTMLElement).getByRole('button', { name: 'Tất cả 2' }));

    expect(explainedArticle.querySelectorAll('details > summary')).toHaveLength(1);
    expect(explainedArticle.textContent).toContain('Có giải thích.');
    expect(explainedArticle.textContent).not.toContain('Chưa có giải thích');
  });

  it('renders a visible explanation disclosure for non-empty MCQ and true/false explanations', () => {
    const mcqExplanation = 'Explanation contract for MCQ.';
    const trueFalseExplanation = 'Explanation contract for true/false.';
    renderView(resultWith([
      mcqReview({ id: 'mcq-explanation-contract', selected: 'B', explanation: mcqExplanation }),
      tfReview({
        id: 'tf-explanation-contract',
        selected: { a: false, b: false, c: false, d: false },
        explanation: trueFalseExplanation,
      }),
    ]));

    const mcqArticle = screen.getByRole('heading', { name: 'Câu 1' }).closest('article') as HTMLElement;
    const trueFalseArticle = screen.getByRole('heading', { name: 'Câu 2' }).closest('article') as HTMLElement;

    for (const [article, explanation] of [
      [mcqArticle, mcqExplanation],
      [trueFalseArticle, trueFalseExplanation],
    ] as const) {
      const summary = within(article).getByText('Giải thích đáp án');
      const disclosure = summary.closest('details') as HTMLDetailsElement;
      expect(summary).toBeVisible();
      expect(disclosure).not.toHaveAttribute('open');

      fireEvent.click(summary);

      expect(disclosure).toHaveAttribute('open');
      expect(within(disclosure).getByText(explanation)).toBeVisible();
    }
  });

  it('does not render an explanation disclosure for null, empty, or whitespace-only values', () => {
    renderView(resultWith([
      mcqReview({ id: 'null-explanation', selected: 'B', explanation: null }),
      mcqReview({ id: 'empty-explanation', selected: 'B', explanation: '' }),
      tfReview({
        id: 'whitespace-explanation',
        selected: { a: false, b: false, c: false, d: false },
        explanation: ' \n\t ',
      }),
    ]));

    for (const number of [1, 2, 3]) {
      const article = screen.getByRole('heading', { name: `Câu ${number}` }).closest('article') as HTMLElement;
      expect(within(article).queryByText('Giải thích đáp án')).not.toBeInTheDocument();
      expect(article.querySelector('details.exam-explanation-disclosure')).toBeNull();
    }
  });

  it('uses a positive perfect state without negative diagnosis or retry actions', () => {
    renderView(resultWith([
      mcqReview({ id: 'perfect', selected: 'A', topics: [{ slug: 'asean', title: 'ASEAN' }] }),
    ], { totalScore: 10 }));

    expect(screen.getByText('Bạn đã hoàn thành tốt bài này.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Bạn nên ôn gì tiếp theo?' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ôn lại câu cần cải thiện' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Trong bài này, bạn có/)).not.toBeInTheDocument();
    expect(screen.queryByText('Câu/ý sai')).not.toBeInTheDocument();
    expect(screen.queryByText('Câu/ý bỏ trống')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Làm đề thi thử khác' })).toHaveAttribute('href', '/exams/browse');
    // Perfect result có totalQuestions cần xem lại = 0 → filter toggle không render.
    expect(screen.queryByRole('group', { name: 'Lọc câu hỏi để xem lại' })).not.toBeInTheDocument();
  });

  it('does not render the authority metadata in the result header', () => {
    renderView(resultWith([
      mcqReview({ id: 'clean', selected: 'A' }),
    ]));

    expect(screen.queryByText('Kết quả chính thức đúng hạn')).not.toBeInTheDocument();
    expect(screen.queryByText('Được chấm bởi hệ thống - thời gian nộp chưa được xác minh')).not.toBeInTheDocument();
    expect(screen.queryByText('Được hệ thống chấm lại từ phiên cục bộ')).not.toBeInTheDocument();
    expect(screen.queryByText('Kết quả cục bộ - chưa được hệ thống xác minh')).not.toBeInTheDocument();
    expect(screen.queryByText('Kết quả legacy')).not.toBeInTheDocument();
  });

  it('degrades safely when topic metadata is missing', () => {
    renderView(resultWith([
      mcqReview({ id: 'missing-metadata', selected: 'B', cognitiveLevel: null, topics: [] }),
    ]));

    expect(screen.getByText('Chưa có dữ liệu chủ đề để gợi ý nội dung ôn tập cho bài này.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Ôn chủ đề / })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Xem lại bài làm' })).toBeInTheDocument();
    expect(screen.getByText('Nội dung missing-metadata')).toBeInTheDocument();
  });

  it('strips technical title artifacts so the raw registry slug never appears', () => {
    renderView(resultWith([
      mcqReview({ id: 'single', selected: 'A' }),
    ], {
      title: 'Đề thi Lịch sử – thuvienhoclieu.com-De-KSCL-thi-TN-THPT-2026-mon-LICH-SU-Cum-truong-Bac-Ninh-2026-Lan-1',
    }));
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).not.toMatch(/thuvienhoclieu\.com/i);
    expect(heading.textContent).not.toMatch(/\.json$/i);
    expect(heading.textContent).toContain('Bắc Ninh');
  });

  it('renders only contextual metadata in the header (no duplicate correct metric)', () => {
    renderView(resultWith([
      mcqReview({ id: 'header-only', selected: 'A' }),
    ]));

    // Câu/ý đúng đã bị bỏ khỏi header. Scope rìa query tới header <dl> để tránh
    // nhầm với <dt> của "Kết quả bài làm" phía dưới.
    const headerDt = Array.from(document.querySelectorAll('header dl dt')).map((term) => term.textContent);
    expect(headerDt).toContain('Số câu hỏi');
    expect(headerDt).toContain('Thời điểm nộp');
    expect(headerDt).not.toContain('Câu/ý đúng');
    // Diagnosis section vẫn giữ Câu/ý đúng cho Kết quả bài làm.
    expect(screen.getByRole('heading', { name: 'Kết quả bài làm' })).toBeInTheDocument();
    const diagnosisSection = screen.getByRole('heading', { name: 'Kết quả bài làm' }).closest('section') as HTMLElement;
    const diagnosisDt = Array.from(diagnosisSection.querySelectorAll('dl dt')).map((term) => term.textContent);
    expect(diagnosisDt).toContain('Câu/ý đúng');
  });

  it('renders only the first topic CTA in primary tone, ranks #2/#3 as secondary', () => {
    const result = resultWith([
      mcqReview({ id: 't-first', selected: 'B', topics: [{ slug: 'topic-first', title: 'Chủ đề ưu tiên nhất' }] }),
      mcqReview({ id: 't-second', selected: 'B', topics: [{ slug: 'topic-second', title: 'Chủ đề củng cố' }] }),
      mcqReview({ id: 't-third', selected: 'B', topics: [{ slug: 'topic-third', title: 'Chủ đề vẫn cần xem lại' }] }),
    ]);
    renderView(result);

    const cards = Array.from(document.querySelectorAll('article[data-topic-rank]')) as HTMLElement[];
    expect(cards.map((card) => card.getAttribute('data-topic-rank'))).toEqual(['1', '2', '3']);
    expect(cards.map((card) => card.getAttribute('data-topic-tone'))).toEqual(['primary', 'secondary', 'secondary']);
    // Differentiated copy theo rank, không phải cùng một sentence.
    expect(cards[0]).toHaveTextContent('Trong bài này, đây là nội dung bạn cần ưu tiên ôn lại nhất.');
    expect(cards[1]).toHaveTextContent('Đây cũng là nội dung bạn nên củng cố thêm.');
    expect(cards[2]).toHaveTextContent('Nội dung này vẫn còn nhiều câu/ý cần xem lại.');
  });

  it('renders the retry-wrong action as secondary and history navigation as text link', () => {
    renderView(resultWith([
      mcqReview({ id: 'has-issues', selected: 'B' }),
    ]));

    const retry = screen.getByRole('link', { name: 'Ôn lại câu cần cải thiện' });
    expect(retry).toHaveAttribute('href', '/exams/on-lai/attempt-2026');
    // Hành vi mới: retry-wrong là secondary tone (không phải primary nữa).
    const browse = screen.getByRole('link', { name: 'Làm đề thi thử khác' });
    expect(retry).not.toHaveStyle({ background: 'var(--accent)' });
    expect(browse).not.toHaveStyle({ background: 'var(--accent)' });
  });

  it('renders the review filter toggle with the correct counts and default to needs-review', () => {
    renderView(resultWith([
      mcqReview({ id: 'mcq-correct', selected: 'A' }),
      mcqReview({ id: 'mcq-wrong', selected: 'B' }),
      mcqReview({ id: 'mcq-blank', selected: null }),
      tfReview({ id: 'tf-partial', selected: { a: true, b: true, c: false, d: null } }),
    ]));

    const needsReviewButton = screen.getByRole('button', { name: 'Cần xem lại 3' });
    const allButton = screen.getByRole('button', { name: 'Tất cả 4' });
    expect(needsReviewButton).toHaveAttribute('aria-pressed', 'true');
    expect(allButton).toHaveAttribute('aria-pressed', 'false');

    // Default chỉ render 3 câu cần xem lại (mcq-wrong, mcq-blank, tf-partial).
    expect(screen.queryByRole('heading', { name: 'Câu 1' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Câu 2' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Câu 3' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Câu 4' })).toBeInTheDocument();

    // Toggle sang "Tất cả" hiển thị đủ cả 4 câu.
    fireEvent.click(allButton);
    expect(allButton).toHaveAttribute('aria-pressed', 'true');
    expect(needsReviewButton).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('heading', { name: 'Câu 1' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Câu 2' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Câu 3' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Câu 4' })).toBeInTheDocument();
  });

  it('does not render the review filter when no question needs review or all do', () => {
    renderView(resultWith([
      mcqReview({ id: 'all-correct', selected: 'A' }),
    ], { totalScore: 10 }));
    // Perfect → không có câu nào cần xem lại, không render toggle.
    expect(screen.queryByRole('group', { name: 'Lọc câu hỏi để xem lại' })).not.toBeInTheDocument();
  });
});
