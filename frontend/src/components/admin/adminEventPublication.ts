import { ApiRequestError } from '../../services/apiClient';

export const PUBLISHED_EVENT_MUTATION_MESSAGE =
  'Sự kiện đang được xuất bản. Hãy gỡ xuất bản trước khi thực hiện thay đổi có thể làm dữ liệu không hoàn chỉnh.';

export const PUBLISHED_EVENT_MUTATION_UPLOAD_MESSAGE =
  'Sự kiện đang xuất bản chưa đáp ứng điều kiện cần thiết để ghi nhận ảnh mới. Hãy gỡ xuất bản, sửa các điều kiện rồi tải lại ảnh.';

/**
 * Returns the operator-friendly Vietnamese message for an
 * {@code PUBLISHED_EVENT_WOULD_BECOME_INVALID} error. Falls back to the
 * generic publication mutation copy when no payload is attached, so the
 * legacy sections outside the managed image upload flow keep their
 * phrasing.
 */
export function publishedEventMutationError(error: unknown): string | null {
  return error instanceof ApiRequestError
    && error.code === 'PUBLISHED_EVENT_WOULD_BECOME_INVALID'
    ? PUBLISHED_EVENT_MUTATION_MESSAGE
    : null;
}

export function publicationIssueTargetId(section: string) {
  return ({
    CONTENT: 'admin-event-content',
    CHRONOLOGY: 'admin-event-chronology',
    CLASSIFICATION: 'admin-event-classification',
    MEDIA: 'admin-event-media',
    GEOGRAPHY: 'admin-event-geography',
  } as Record<string, string>)[section] ?? 'admin-event-completeness';
}
