import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiCandidateDetail } from '@/types/aiCandidate';
import { ApiRequestError } from '@/services/apiClient';

const api = vi.hoisted(() => ({
  getAiCandidate: vi.fn(), getAiCandidateAudit: vi.fn(), getAiPublishTargets: vi.fn(),
  submitAiCandidate: vi.fn(), approveAiCandidate: vi.fn(), rejectAiCandidate: vi.fn(),
  publishAiCandidate: vi.fn(), updateAiCandidate: vi.fn(), createAiCandidateRevision: vi.fn(),
  searchAiCandidateSources: vi.fn(), remapAiCandidateSources: vi.fn(),
}));
const auth = vi.hoisted(() => ({
  currentUser: { id: 'admin-2', fullName: 'Admin', role: 'admin', roles: ['admin'], permissions: ['AI_CANDIDATE_CREATE', 'AI_CANDIDATE_VIEW', 'AI_CANDIDATE_EDIT', 'AI_CANDIDATE_SUBMIT', 'AI_CANDIDATE_REVIEW', 'AI_CANDIDATE_PUBLISH', 'AI_CANDIDATE_AUDIT_VIEW'] },
}));
vi.mock('@/services/aiCandidateApi', () => api);
vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ currentUser: auth.currentUser, logout: vi.fn() }),
}));

import AdminAiCandidateDetailPage from '../AdminAiCandidateDetailPage';

const detail: AiCandidateDetail = {
  id: 'candidate-1', status: 'DRAFT', questionText: 'Câu hỏi hiện tại?', explanation: 'Giải thích hiện tại',
  difficulty: 'MEDIUM', grade: 12, lessonNumber: 6, topic: 'Cách mạng tháng Tám', createdBy: 'admin-1',
  reviewedBy: null, warningCount: 1, sourceCount: 1, version: 0, createdAt: '2026-07-20T08:00:00',
  updatedAt: '2026-07-20T08:00:00', originalQuestionText: 'Câu hỏi AI ban đầu?',
  originalExplanation: 'Giải thích AI', originalCorrectOptionId: 'A', generationQuery: 'Cách mạng tháng Tám',
  requestedCount: 1, generationRequestId: 'request-1', generationModel: 'gemini-2.5-flash',
  embeddingModel: 'gemini-embedding-2', embeddingDimension: 768, promptVersion: 'prompt-v1', schemaVersion: 'schema-v1',
  corpusSha256: 'a'.repeat(64), collectionName: 'sgk_kntt_history_gemini_v1', validationStatus: 'PASSED_WITH_WARNINGS',
  validationWarnings: [], generationWarnings: ['MANUAL_REVIEW_RECOMMENDED'], submittedBy: null, publishedBy: null,
  submittedAt: null, reviewedAt: null, publishedAt: null, rejectionReason: null, reviewNote: null,
  officialQuestionId: null, selfReviewOverrideUsed: false, selfReviewOverrideReason: null,
  options: [
    { id: 'A', text: 'Đáp án A', correct: true, displayOrder: 1, originalText: 'Đáp án A' },
    { id: 'B', text: 'Đáp án B', correct: false, displayOrder: 2, originalText: 'Đáp án B' },
    { id: 'C', text: 'Đáp án C', correct: false, displayOrder: 3, originalText: 'Đáp án C' },
    { id: 'D', text: 'Đáp án D', correct: false, displayOrder: 4, originalText: 'Đáp án D' },
  ],
  sources: [{ chunkId: 'chunk-1', documentId: 'doc-1', grade: 12, lessonNumber: 6, lessonTitle: 'Bài 6', sectionTitle: 'Mục I', pageStart: 35, pageEnd: 36, chunkHash: 'b'.repeat(64), displayOrder: 1 }],
};

function renderPage() {
  return render(<MemoryRouter initialEntries={['/admin/exams/ai-candidates/candidate-1']}><Routes>
    <Route path="/admin/exams/ai-candidates/:id" element={<AdminAiCandidateDetailPage />} />
  </Routes></MemoryRouter>);
}

describe('AdminAiCandidateDetailPage', () => {
  beforeEach(() => {
    auth.currentUser = { id: 'admin-2', fullName: 'Admin', role: 'admin', roles: ['admin'], permissions: ['AI_CANDIDATE_CREATE', 'AI_CANDIDATE_VIEW', 'AI_CANDIDATE_EDIT', 'AI_CANDIDATE_SUBMIT', 'AI_CANDIDATE_REVIEW', 'AI_CANDIDATE_PUBLISH', 'AI_CANDIDATE_AUDIT_VIEW'] };
    Object.values(api).forEach(mock => mock.mockReset());
    api.getAiCandidate.mockResolvedValue(detail);
    api.getAiCandidateAudit.mockResolvedValue([{ id: 1, eventType: 'CREATED', actorId: 'admin-1', fromStatus: null, toStatus: 'DRAFT', changedFields: [], note: null, createdAt: detail.createdAt, requestId: 'request-1' }]);
    api.getAiPublishTargets.mockResolvedValue([{ datasetId: 'dataset-1', definitionId: 'definition-1', sectionId: 'section-1', label: 'Ngân hàng thử nghiệm' }]);
  });

  it('renders provenance, neutral warning, sources and audit then submits separately', async () => {
    const user = userEvent.setup();
    api.submitAiCandidate.mockResolvedValue({ ...detail, status: 'PENDING_REVIEW', version: 1 });
    renderPage();

    expect(await screen.findByDisplayValue('Câu hỏi hiện tại?')).toBeEnabled();
    expect(screen.getByText('Câu hỏi AI ban đầu?')).toBeInTheDocument();
    expect(screen.getByText(/Cần đối chiếu thủ công/)).toBeInTheDocument();
    expect(screen.getByText('chunk-1')).toBeInTheDocument();
    expect(screen.getByText('CREATED')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Gửi duyệt' }));
    await waitFor(() => expect(api.submitAiCandidate).toHaveBeenCalledWith('candidate-1', 0, ''));
    expect(api.approveAiCandidate).not.toHaveBeenCalled();
    expect(api.publishAiCandidate).not.toHaveBeenCalled();
  });

  it('requires an explicit publish confirmation', async () => {
    const user = userEvent.setup();
    api.getAiCandidate.mockResolvedValue({ ...detail, status: 'APPROVED', version: 2 });
    api.publishAiCandidate.mockResolvedValue({ ...detail, status: 'PUBLISHED', version: 3, officialQuestionId: 'official-1' });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Xuất bản tường minh' }));
    expect(api.publishAiCandidate).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Xuất bản' }));
    await waitFor(() => expect(api.publishAiCandidate).toHaveBeenCalledTimes(1));
  });

  it('keeps published candidate content immutable', async () => {
    api.getAiCandidate.mockResolvedValue({ ...detail, status: 'PUBLISHED', version: 4, officialQuestionId: 'official-1' });
    renderPage();
    expect(await screen.findByDisplayValue('Câu hỏi hiện tại?')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Lưu chỉnh sửa' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gửi duyệt' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xuất bản tường minh' })).not.toBeInTheDocument();
  });

  it('lets another teacher review but never renders publish without permission', async () => {
    auth.currentUser = { id: 'teacher-2', fullName: 'Teacher', role: 'teacher', roles: ['teacher'], permissions: ['AI_CANDIDATE_VIEW', 'AI_CANDIDATE_REVIEW'] };
    api.getAiCandidate.mockResolvedValue({ ...detail, status: 'PENDING_REVIEW', version: 1 });
    renderPage();
    expect(await screen.findByRole('button', { name: 'Phê duyệt' })).toBeInTheDocument();

    api.getAiCandidate.mockResolvedValue({ ...detail, status: 'APPROVED', version: 2 });
    renderPage();
    expect(await screen.findAllByDisplayValue('Câu hỏi hiện tại?')).not.toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Xuất bản tường minh' })).not.toBeInTheDocument();
  });

  it('hides normal approval from the creator and shows the explicit admin override only to admin', async () => {
    auth.currentUser = { id: 'admin-1', fullName: 'Creator', role: 'admin', roles: ['admin'], permissions: ['AI_CANDIDATE_VIEW', 'AI_CANDIDATE_REVIEW'] };
    api.getAiCandidate.mockResolvedValue({ ...detail, status: 'PENDING_REVIEW', version: 1 });
    renderPage();
    expect(await screen.findByText(/self-review override dành riêng cho admin/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Phê duyệt' })).not.toBeInTheDocument();
  });

  it('surfaces a forbidden command response without trusting stale UI permissions', async () => {
    api.getAiCandidate.mockResolvedValue({ ...detail, status: 'PENDING_REVIEW', version: 1 });
    api.approveAiCandidate.mockRejectedValue(new Error('Bạn không có quyền duyệt candidate.'));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Phê duyệt' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Bạn không có quyền duyệt candidate.');
  });

  it('creates a revision only from an immutable published candidate', async () => {
    const user = userEvent.setup();
    const published = { ...detail, status: 'PUBLISHED' as const, version: 4, officialQuestionId: 'official-1',
      revision: { originType: 'GENERATED' as const, parentCandidateId: null, rootOfficialQuestionId: 'official-1', baseOfficialQuestionId: 'official-1', revisionNumber: 1, revisionReason: null, baseContentHash: 'c'.repeat(64), baseQuestionText: detail.questionText, baseExplanation: detail.explanation, baseDifficulty: detail.difficulty, baseTopic: detail.topic, baseDatasetId: 'dataset-1', baseDefinitionId: 'definition-1', baseSectionId: 'section-1', openRevisionCandidateId: null, baseOptions: detail.options, baseSources: [] } };
    api.getAiCandidate.mockResolvedValue(published);
    api.createAiCandidateRevision.mockResolvedValue({ ...published, id: 'revision-2', status: 'DRAFT' });
    renderPage();
    await user.type(await screen.findByLabelText('Lý do tạo bản sửa đổi'), 'Sửa dữ kiện');
    await user.click(screen.getByRole('button', { name: 'Tạo bản sửa đổi' }));
    await waitFor(() => expect(api.createAiCandidateRevision).toHaveBeenCalledWith('candidate-1', 'Sửa dữ kiện'));
    expect(screen.queryByRole('button', { name: 'Lưu chỉnh sửa' })).not.toBeInTheDocument();
  });

  it('shows the open revision instead of allowing a duplicate', async () => {
    api.getAiCandidate.mockResolvedValue({ ...detail, status: 'PUBLISHED', officialQuestionId: 'official-1',
      revision: { originType: 'GENERATED', parentCandidateId: null, rootOfficialQuestionId: 'official-1', baseOfficialQuestionId: 'official-1', revisionNumber: 1, revisionReason: null, baseContentHash: null, baseQuestionText: null, baseExplanation: null, baseDifficulty: null, baseTopic: null, baseDatasetId: 'dataset-1', baseDefinitionId: 'definition-1', baseSectionId: 'section-1', openRevisionCandidateId: 'revision-open', baseOptions: [], baseSources: [] } });
    renderPage();
    expect(await screen.findByRole('link', { name: 'Xem bản sửa đổi đang xử lý' })).toHaveAttribute('href', '/admin/exams/ai-candidates/revision-open');
    expect(screen.queryByRole('button', { name: 'Tạo bản sửa đổi' })).not.toBeInTheDocument();
  });

  it('shows a sanitized head conflict instead of database details', async () => {
    const user = userEvent.setup();
    api.getAiCandidate.mockResolvedValue({ ...detail, status: 'PUBLISHED', officialQuestionId: 'official-1',
      revision: { originType: 'GENERATED', parentCandidateId: null, rootOfficialQuestionId: 'official-1', baseOfficialQuestionId: 'official-1', revisionNumber: 1, revisionReason: null, baseContentHash: null, baseQuestionText: null, baseExplanation: null, baseDifficulty: null, baseTopic: null, baseDatasetId: 'dataset-1', baseDefinitionId: 'definition-1', baseSectionId: 'section-1', openRevisionCandidateId: null, baseOptions: [], baseSources: [] } });
    api.createAiCandidateRevision.mockRejectedValue(new ApiRequestError('AI_REVISION_HEAD_CONFLICT', 'SQL constraint uq_internal', 409));
    renderPage();
    await user.type(await screen.findByLabelText('Lý do tạo bản sửa đổi'), 'reason');
    await user.click(screen.getByRole('button', { name: 'Tạo bản sửa đổi' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Bản official gốc không còn là revision hiện hành');
    expect(screen.getByRole('alert')).not.toHaveTextContent('SQL');
  });

  it('compares the base snapshot and remaps only explicitly selected canonical chunks', async () => {
    const user = userEvent.setup();
    const revision = { ...detail, id: 'revision-2', status: 'DRAFT' as const, version: 5,
      revision: { originType: 'REVISION' as const, parentCandidateId: 'candidate-1', rootOfficialQuestionId: 'official-1', baseOfficialQuestionId: 'official-1', revisionNumber: 2, revisionReason: 'Sửa dữ kiện', baseContentHash: 'c'.repeat(64), baseQuestionText: 'Câu hỏi official nền?', baseExplanation: 'Giải thích nền', baseDifficulty: 'MEDIUM', baseTopic: 'Chủ đề nền', baseDatasetId: 'dataset-1', baseDefinitionId: 'definition-1', baseSectionId: 'section-1', openRevisionCandidateId: 'revision-2', baseOptions: detail.options, baseSources: detail.sources } };
    api.getAiCandidate.mockResolvedValue(revision);
    api.searchAiCandidateSources.mockResolvedValue([{ chunkId: 'canonical-2', chunkHash: 'd'.repeat(64), documentId: 'doc-2', grade: 12, lessonNumber: 6, lessonTitle: 'Bài 6', sectionTitle: 'Mục II', pageStart: 37, pageEnd: 37, excerpt: '<script>không được thực thi</script>', distance: 0.12 }]);
    api.remapAiCandidateSources.mockResolvedValue({ ...revision, version: 6 });
    renderPage();
    expect(await screen.findByText('Câu hỏi official nền?')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Truy vấn tìm nguồn'), 'nguồn đúng');
    await user.click(screen.getByRole('button', { name: 'Tìm nguồn' }));
    expect(await screen.findByText('<script>không được thực thi</script>')).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
    await user.click(screen.getByRole('checkbox'));
    await user.type(screen.getByLabelText('Lý do remap nguồn'), 'Đổi sang nguồn canonical đúng');
    await user.click(screen.getByRole('button', { name: 'Remap nguồn đã chọn' }));
    await waitFor(() => expect(api.remapAiCandidateSources).toHaveBeenCalledWith('revision-2', 5, [{ chunkId: 'canonical-2', chunkHash: 'd'.repeat(64) }], 'Đổi sang nguồn canonical đúng'));
  });
});
