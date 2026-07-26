import { ApiRequestError } from '../../services/apiClient';

export const PUBLISHED_EVENT_MUTATION_MESSAGE =
  'Sự kiện đang được xuất bản. Hãy gỡ xuất bản trước khi thực hiện thay đổi có thể làm dữ liệu không hoàn chỉnh.';

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
