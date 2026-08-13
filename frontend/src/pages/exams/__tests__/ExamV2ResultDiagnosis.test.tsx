import { act, render, screen } from '@testing-library/react';
import {
  createMemoryRouter,
  MemoryRouter,
  Route,
  RouterProvider,
  Routes,
} from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomQuestionSnapshot, ExamResultV2 } from '@/types/exam';
import type { ResultSnapshotV2 } from '@/types/examApi';
import ExamV2ResultPage from '../ExamV2ResultPage';

const mocks = vi.hoisted(() => ({
  readApiResult: vi.fn(),
  readResultFromLS: vi.fn(),
  fetchBackendAttemptDetail: vi.fn(),
  resultFromAttemptDetail: vi.fn(),
  loadExam: vi.fn(),
}));

vi.mock('@/lib/exam/useApiTimedSession', () => ({
  readApiResult: mocks.readApiResult,
}));

vi.mock('@/lib/exam/useSessionV2', () => ({
  readResultFromLS: mocks.readResultFromLS,
}));

vi.mock('@/lib/exam/examAttemptSync', () => ({
  fetchBackendAttemptDetail: mocks.fetchBackendAttemptDetail,
  resultFromAttemptDetail: mocks.resultFromAttemptDetail,
}));

vi.mock('@/lib/exam/examLoader', () => ({
  loadExam: mocks.loadExam,
}));

function reviewedSnapshot(sessionId: string): ResultSnapshotV2 {
  return {
    snapshotSchemaVersion: 2,
    sessionId,
    mode: 'TIMED_ORIGINAL',
    title: 'Đề chẩn đoán tích hợp',
    datasetVersion: 'test-v2',
    examContentHash: 'hash-v2',
    scoringVersion: 'thpt-2025-v1',
    scoreAuthority: 'BACKEND',
    timingAuthority: 'SERVER',
    submissionOrigin: 'SERVER_ON_TIME',
    startedAtServer: 1_754_700_000_000,
    submittedAtServer: 1_754_703_000_000,
    summary: {
      totalScore: 5.75,
      mcqScore: 0.25,
      tfScore: 0.5,
      totalQuestions: 4,
      correctMCQ: 1,
      wrongMCQ: 1,
      blankMCQ: 1,
      tfBreakdown: [0, 0, 1, 0, 0],
    },
    questions: [
      {
        questionInstanceId: 'instance-mcq-wrong',
        publicQuestionId: 'mcq-wrong',
        questionType: 'mcq',
        question: {
          questionType: 'mcq',
          questionText: 'Sự kiện nào mở đầu Tổng khởi nghĩa tháng Tám?',
          difficulty: 'hard',
          cognitiveLevel: 'application',
          options: [
            { id: 'A', text: 'Khởi nghĩa Bắc Sơn' },
            { id: 'B', text: 'Khởi nghĩa từng phần' },
            { id: 'C', text: 'Quốc dân Đại hội Tân Trào' },
            { id: 'D', text: 'Nhật đảo chính Pháp' },
          ],
        },
        userAnswer: 'B',
        correctAnswer: 'C',
        correctness: false,
        points: 0,
        completionState: 'COMPLETE',
        explanation: 'Quốc dân Đại hội Tân Trào tạo tiền đề trực tiếp cho Tổng khởi nghĩa.',
        sources: [],
        topicRefs: [{
          slug: 'cach-mang-thang-tam',
          title: 'Cách mạng tháng Tám',
          periodSlug: 'viet-nam-1919-1945',
          periodTitle: 'Việt Nam 1919-1945',
        }],
      },
      {
        questionInstanceId: 'instance-tf-partial',
        publicQuestionId: 'tf-partial',
        questionType: 'true_false',
        question: {
          questionType: 'true_false',
          questionText: 'Đánh giá các nhận định về thời cơ Tổng khởi nghĩa.',
          difficulty: 'hard',
          cognitiveLevel: 'application',
          statements: [
            { id: 'a', text: 'Nhật đầu hàng Đồng minh.' },
            { id: 'b', text: 'Quân Đồng minh đã vào Đông Dương.' },
            { id: 'c', text: 'Chính quyền tay sai hoang mang.' },
            { id: 'd', text: 'Lực lượng cách mạng đã sẵn sàng.' },
          ],
        },
        userAnswer: { a: true, b: true, c: true, d: null },
        correctAnswer: { a: true, b: false, c: true, d: true },
        correctness: false,
        points: 0.5,
        completionState: 'PARTIAL',
        explanation: 'Thời cơ xuất hiện trước khi quân Đồng minh kéo vào Đông Dương.',
        sources: [],
        topicRefs: [{
          slug: 'cach-mang-thang-tam',
          title: 'Cách mạng tháng Tám',
          periodSlug: 'viet-nam-1919-1945',
          periodTitle: 'Việt Nam 1919-1945',
        }],
      },
      {
        questionInstanceId: 'instance-mcq-blank',
        publicQuestionId: 'mcq-blank',
        questionType: 'mcq',
        question: {
          questionType: 'mcq',
          questionText: 'Biểu hiện nào thuộc trật tự hai cực Ianta?',
          difficulty: 'medium',
          cognitiveLevel: 'knowledge',
          options: [
            { id: 'A', text: 'Hai siêu cường đối đầu' },
            { id: 'B', text: 'Mọi thuộc địa độc lập' },
            { id: 'C', text: 'Liên minh châu Âu ra đời' },
            { id: 'D', text: 'Toàn cầu hóa kết thúc' },
          ],
        },
        userAnswer: null,
        correctAnswer: 'A',
        correctness: false,
        points: 0,
        completionState: 'BLANK',
        explanation: null,
        sources: [],
        topicRefs: [{
          slug: 'chien-tranh-lanh',
          title: 'Chiến tranh lạnh',
          periodSlug: 'lich-su-the-gioi-khu-vuc',
          periodTitle: 'Lịch sử thế giới / khu vực',
        }],
      },
      {
        questionInstanceId: 'instance-mcq-correct',
        publicQuestionId: 'mcq-correct',
        questionType: 'mcq',
        question: {
          questionType: 'mcq',
          questionText: 'ASEAN được thành lập vào năm nào?',
          difficulty: 'easy',
          cognitiveLevel: 'knowledge',
          options: [
            { id: 'A', text: '1945' },
            { id: 'B', text: '1954' },
            { id: 'C', text: '1967' },
            { id: 'D', text: '1975' },
          ],
        },
        userAnswer: 'C',
        correctAnswer: 'C',
        correctness: true,
        points: 0.25,
        completionState: 'COMPLETE',
        explanation: 'ASEAN được thành lập ngày 8/8/1967.',
        sources: [],
        topicRefs: [{
          slug: 'asean',
          title: 'ASEAN',
          periodSlug: 'lich-su-the-gioi-khu-vuc',
          periodTitle: 'Lịch sử thế giới / khu vực',
        }],
      },
    ],
  };
}

const legacyQuestion: CustomQuestionSnapshot = {
  id: 'legacy-question',
  orderInExam: 1,
  questionType: 'mcq',
  questionText: 'Câu hỏi local legacy',
  explanation: 'Giải thích local legacy',
  difficulty: 'easy',
  topic: 'ASEAN',
  cognitiveLevel: 'knowledge',
  hasImage: false,
  sourceRefs: [],
  options: [
    { id: 'A', text: 'Đáp án A' },
    { id: 'B', text: 'Đáp án B' },
    { id: 'C', text: 'Đáp án C' },
    { id: 'D', text: 'Đáp án D' },
  ],
  correctOptionId: 'A',
  sourceExamId: 'legacy-exam',
  originalQuestionId: 'legacy-question',
};

const legacyLocalResult: ExamResultV2 = {
  sessionId: 'legacy-local',
  mode: 'custom_mock',
  title: 'Đề local legacy',
  isCustom: true,
  questionSnapshots: [legacyQuestion],
  totalScore: 10,
  mcqScore: 10,
  tfScore: 0,
  totalQuestions: 1,
  correctMCQ: 1,
  wrongMCQ: 0,
  blankMCQ: 0,
  tfBreakdown: [0, 0, 0, 0, 0],
  durationSeconds: 90,
  submittedAt: 1_754_703_000_000,
  questions: [{
    questionId: 'legacy-question',
    questionType: 'mcq',
    isCorrect: true,
    pointsEarned: 1,
    mcq: { selected: 'A', correct: 'A' },
  }],
};

function renderResult(sessionId: string) {
  return render(
    <MemoryRouter initialEntries={[`/exams/ket-qua/${sessionId}`]}>
      <Routes>
        <Route path="/exams/ket-qua/:sessionId" element={<ExamV2ResultPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function expectSnapshotDiagnosis(sessionId: string) {
  // Tiêu đề đi qua formatExamTitle ở phase B (raw registry-cleanup) nên viết thường chữ đầu.
  expect(await screen.findByRole('heading', { level: 1, name: 'đề chẩn đoán tích hợp' })).toBeInTheDocument();
  // Task H (Phase B): Result page copy simplified — "Kết quả bài làm" / "Bạn nên ôn gì tiếp theo?" / "Xem lại bài làm".
  // Question-type & cognitive sections đã được lược bỏ khỏi Result; chỉ còn khi render legacy.
  expect(screen.getByRole('heading', { name: 'Kết quả bài làm' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Bạn nên ôn gì tiếp theo?' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Xem lại bài làm' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Chẩn đoán bài làm' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Chủ đề cần ưu tiên' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Kết quả theo dạng câu hỏi' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Kết quả theo mức nhận thức' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Review chi tiết từng câu' })).not.toBeInTheDocument();
  expect(screen.getAllByText('Cách mạng tháng Tám').length).toBeGreaterThan(0);
  expect(screen.getByText('Đúng một phần')).toBeInTheDocument();
  expect(screen.getByText('Chưa trả lời')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Ôn lại câu cần cải thiện' }))
    .toHaveAttribute('href', `/exams/on-lai/${sessionId}`);
}

describe('ExamV2ResultPage Snapshot V2 diagnosis data paths', () => {
  beforeEach(() => {
    mocks.readApiResult.mockReset().mockReturnValue(null);
    mocks.readResultFromLS.mockReset().mockReturnValue(null);
    mocks.fetchBackendAttemptDetail.mockReset().mockResolvedValue(null);
    mocks.resultFromAttemptDetail.mockReset().mockReturnValue(null);
    mocks.loadExam.mockReset();
  });

  it('renders diagnosis directly from a cached Snapshot V2 without backend or legacy loaders', async () => {
    mocks.readApiResult.mockReturnValue(reviewedSnapshot('cached-v2'));

    renderResult('cached-v2');

    await expectSnapshotDiagnosis('cached-v2');
    expect(mocks.readApiResult).toHaveBeenCalledWith('cached-v2');
    expect(mocks.readResultFromLS).not.toHaveBeenCalled();
    expect(mocks.fetchBackendAttemptDetail).not.toHaveBeenCalled();
    expect(mocks.loadExam).not.toHaveBeenCalled();
  });

  it('renders the same diagnosis from a backend attempt detail Snapshot V2', async () => {
    const snapshot = reviewedSnapshot('backend-v2');
    mocks.fetchBackendAttemptDetail.mockResolvedValue({
      sessionId: 'backend-v2',
      mode: 'TIMED_ORIGINAL',
      title: snapshot.title,
      totalQuestions: snapshot.summary.totalQuestions,
      totalScore: snapshot.summary.totalScore,
      submittedAt: snapshot.submittedAtServer,
      result: snapshot,
    });

    renderResult('backend-v2');

    await expectSnapshotDiagnosis('backend-v2');
    expect(mocks.readApiResult).toHaveBeenCalledWith('backend-v2');
    expect(mocks.readResultFromLS).toHaveBeenCalledWith('backend-v2');
    expect(mocks.fetchBackendAttemptDetail).toHaveBeenCalledWith('backend-v2');
    expect(mocks.resultFromAttemptDetail).not.toHaveBeenCalled();
    expect(mocks.loadExam).not.toHaveBeenCalled();
  });

  it('keeps legacy local results on the legacy renderer without Snapshot diagnosis', async () => {
    mocks.readResultFromLS.mockReturnValue(legacyLocalResult);

    renderResult('legacy-local');

    expect(await screen.findByRole('heading', { level: 1, name: 'Kết quả luyện thi' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Phân tích điểm yếu' })).toBeInTheDocument();
    // Task H (Phase B): legacy renderer vẫn dùng "Review chi tiết từng câu" vì đây là nhánh legacy không thuộc scope Phase B.
    expect(screen.getByRole('heading', { name: 'Review chi tiết từng câu' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Chẩn đoán bài làm' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Bạn nên ôn gì tiếp theo?' })).not.toBeInTheDocument();
    expect(mocks.fetchBackendAttemptDetail).not.toHaveBeenCalled();
    expect(mocks.loadExam).not.toHaveBeenCalled();
  });

  it('keeps the deep-link entry in browser history', async () => {
    mocks.readApiResult.mockReturnValue(reviewedSnapshot('history-v2'));
    const router = createMemoryRouter([
      { path: '/origin', element: <p>Trang trước kết quả</p> },
      { path: '/exams/ket-qua/:sessionId', element: <ExamV2ResultPage /> },
    ], {
      initialEntries: ['/origin', '/exams/ket-qua/history-v2'],
      initialIndex: 1,
    });
    render(<RouterProvider router={router} />);

    await expectSnapshotDiagnosis('history-v2');
    await act(async () => {
      await router.navigate(-1);
    });
    expect(await screen.findByText('Trang trước kết quả')).toBeInTheDocument();
  });
});
