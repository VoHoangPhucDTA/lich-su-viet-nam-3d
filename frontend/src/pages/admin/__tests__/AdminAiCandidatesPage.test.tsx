import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AdminAiCandidatesPage from '../AdminAiCandidatesPage';
import { listAiCandidates } from '../../../services/aiCandidateApi';

vi.mock('../../../layouts/AdminLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../../services/aiCandidateApi', async () => {
  const actual = await vi.importActual<typeof import('../../../services/aiCandidateApi')>(
    '../../../services/aiCandidateApi',
  );
  return { ...actual, listAiCandidates: vi.fn() };
});

describe('AdminAiCandidatesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listAiCandidates).mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    });
  });

  it('explains the queue and renders a truthful empty state without a fake generator', async () => {
    render(
      <MemoryRouter>
        <AdminAiCandidatesPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Chưa có candidate cần duyệt')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('Candidate là câu hỏi nháp');
    expect(screen.getAllByText(/chức năng sinh candidate chưa được mở/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /sinh candidate/i })).not.toBeInTheDocument();
  });
});
