import { act, render, screen } from '@testing-library/react';
import {
  createMemoryRouter,
  MemoryRouter,
  Route,
  RouterProvider,
  Routes,
} from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResultSnapshotV2 } from '@/types/examApi';
import ExamV2ResultPage from '../ExamV2ResultPage';

const mocks = vi.hoisted(() => ({
  readApiResult: vi.fn(),
  fetchBackendAttemptDetail: vi.fn(),
  resultFromAttemptDetail: vi.fn(),
}));

vi.mock('@/lib/exam/useApiTimedSession', () => ({
  readApiResult: mocks.readApiResult,
}));

vi.mock('@/lib/exam/examAttemptSync', () => ({
  fetchBackendAttemptDetail: mocks.fetchBackendAttemptDetail,
  resultFromAttemptDetail: mocks.resultFromAttemptDetail,
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
    mocks.fetchBackendAttemptDetail.mockReset().mockResolvedValue(null);
    mocks.resultFromAttemptDetail.mockReset().mockReturnValue(null);
  });

  it('renders diagnosis directly from a cached Snapshot V2 without backend or legacy loaders', async () => {
    mocks.readApiResult.mockReturnValue(reviewedSnapshot('cached-v2'));

    renderResult('cached-v2');

    await expectSnapshotDiagnosis('cached-v2');
    expect(mocks.readApiResult).toHaveBeenCalledWith('cached-v2');
    expect(mocks.fetchBackendAttemptDetail).not.toHaveBeenCalled();
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
    expect(mocks.fetchBackendAttemptDetail).toHaveBeenCalledWith('backend-v2');
    expect(mocks.resultFromAttemptDetail).not.toHaveBeenCalled();
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

  it('does not resurrect a legacy local result without a backend or cached Snapshot V2', async () => {
    localStorage.setItem('v2_result_legacy-local', JSON.stringify({
      sessionId: 'legacy-local',
      correctOptionId: 'B',
      answerKey: { correctOptionId: 'B' },
    }));

    renderResult('legacy-local');

    expect(await screen.findByRole('heading', { level: 2, name: 'Không tìm thấy kết quả' })).toBeInTheDocument();
    expect(screen.getByText('Kết quả đã bị xóa hoặc liên kết không hợp lệ.')).toBeInTheDocument();
    expect(mocks.fetchBackendAttemptDetail).toHaveBeenCalledWith('legacy-local');
  });
});
