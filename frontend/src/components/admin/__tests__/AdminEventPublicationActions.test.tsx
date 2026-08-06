import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AdminEventPublicationActions from '../AdminEventPublicationActions';
import {
  updateAdminEventPublication,
  type AdminEventDetail,
} from '../../../services/adminApi';
import { ApiRequestError } from '../../../services/apiClient';

vi.mock('../../../services/adminApi', async () => {
  const actual = await vi.importActual<typeof import('../../../services/adminApi')>(
    '../../../services/adminApi',
  );
  return { ...actual, updateAdminEventPublication: vi.fn() };
});

const version = '2026-07-26T03:00:00.123456Z';
const nextVersion = '2026-07-26T03:00:01.654321Z';
const detail = {
  core: { id: 'event-1', slug: 'event-1', title: 'Event', shortTitle: null },
  publication: {
    status: 'published',
    flags: { showOnHomepage: false, showOnTimeline: false, featured: false },
    publishedAt: '2026-07-26T03:00:01Z',
    createdAt: '2026-07-25T03:00:00Z',
    updatedAt: nextVersion,
  },
  completeness: { complete: true, issueCount: 0, issues: [] },
} as unknown as AdminEventDetail;

describe('AdminEventPublicationActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(updateAdminEventPublication).mockResolvedValue(detail);
  });

  it('renders only actions allowed for each status and never renders hard delete', () => {
    const { rerender } = render(
      <AdminEventPublicationActions
        eventId="event-1" status="draft" version={version} onUpdated={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Xuất bản' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu trữ' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /xóa/i })).not.toBeInTheDocument();

    rerender(
      <AdminEventPublicationActions
        eventId="event-1" status="published" version={version} onUpdated={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Gỡ xuất bản' })).toBeInTheDocument();

    rerender(
      <AdminEventPublicationActions
        eventId="event-1" status="archived" version={version} onUpdated={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Khôi phục' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xuất bản' })).not.toBeInTheDocument();
  });

  it('forwards the exact opaque version and replaces state from the server response', async () => {
    const onUpdated = vi.fn();
    render(
      <AdminEventPublicationActions
        eventId="event-1" status="draft" version={version} onUpdated={onUpdated}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Xuất bản' }));

    await waitFor(() => expect(updateAdminEventPublication).toHaveBeenCalledWith(
      'event-1',
      { expectedUpdatedAt: version, action: 'publish' },
      expect.any(AbortSignal),
    ));
    expect(onUpdated).toHaveBeenCalledWith(detail);
  });

  it('requires confirmation for unpublish and archive', async () => {
    const { rerender } = render(
      <AdminEventPublicationActions
        eventId="event-1" status="published" version={version} onUpdated={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Gỡ xuất bản' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Gỡ xuất bản sự kiện?');
    expect(updateAdminEventPublication).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog'))
      .getByRole('button', { name: 'Gỡ xuất bản' }));
    await waitFor(() => expect(updateAdminEventPublication).toHaveBeenCalledWith(
      'event-1',
      { expectedUpdatedAt: version, action: 'unpublish' },
      expect.any(AbortSignal),
    ));

    rerender(
      <AdminEventPublicationActions
        eventId="event-1" status="draft" version={version} onUpdated={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Lưu trữ' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Lưu trữ sự kiện?');
  });

  it('shows only bounded publish blockers and links them to editor sections', async () => {
    const issue = {
      code: 'MISSING_CORE_CONTENT',
      section: 'CONTENT',
      severity: 'ERROR' as const,
      fields: ['canonicalSummary'],
    };
    vi.mocked(updateAdminEventPublication).mockRejectedValue(
      new ApiRequestError(
        'EVENT_PUBLISH_BLOCKED',
        'blocked',
        409,
        [],
        [issue, { ...issue, code: 'MISSING_THUMBNAIL', severity: 'WARNING' }],
      ),
    );
    const onIssueSelect = vi.fn();
    render(
      <AdminEventPublicationActions
        eventId="event-1"
        status="draft"
        version={version}
        onUpdated={vi.fn()}
        onIssueSelect={onIssueSelect}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Xuất bản' }));

    const blocker = await screen.findByRole('button', {
      name: /MISSING_CORE_CONTENT.*canonicalSummary/,
    });
    expect(screen.queryByText('MISSING_THUMBNAIL')).not.toBeInTheDocument();
    fireEvent.click(blocker);
    expect(onIssueSelect).toHaveBeenCalledWith(issue);
  });

  it('requires reload on conflict and does not render AbortError', async () => {
    const onReload = vi.fn();
    vi.mocked(updateAdminEventPublication).mockRejectedValueOnce(
      new ApiRequestError('EVENT_UPDATE_CONFLICT', 'conflict', 409),
    );
    const { rerender } = render(
      <AdminEventPublicationActions
        eventId="event-1" status="draft" version={version}
        onUpdated={vi.fn()} onReload={onReload}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Xuất bản' }));
    fireEvent.click(await screen.findByRole('button', { name: /Tải lại để xem phiên bản mới/ }));
    expect(onReload).toHaveBeenCalledTimes(1);

    vi.mocked(updateAdminEventPublication).mockRejectedValueOnce(
      new DOMException('aborted', 'AbortError'),
    );
    rerender(
      <AdminEventPublicationActions
        eventId="event-1" status="draft" version={nextVersion}
        onUpdated={vi.fn()} onReload={onReload}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Xuất bản' }));
    await waitFor(() => expect(updateAdminEventPublication).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/aborted/i)).not.toBeInTheDocument();
  });
});
