import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiCandidateDetail } from '@/types/aiCandidate';

const api = vi.hoisted(() => ({
  getAiCandidate: vi.fn(), getAiCandidateAudit: vi.fn(), getAiPublishTargets: vi.fn(),
  submitAiCandidate: vi.fn(), approveAiCandidate: vi.fn(), rejectAiCandidate: vi.fn(),
  publishAiCandidate: vi.fn(), updateAiCandidate: vi.fn(),
}));
vi.mock('@/services/aiCandidateApi', () => api);
vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ currentUser: { fullName: 'Admin', roles: ['admin'] }, logout: vi.fn() }),
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
  officialQuestionId: null,
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
});
