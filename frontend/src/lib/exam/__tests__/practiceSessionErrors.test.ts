import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '@/services/apiClient';
import { getPracticeSessionLoadErrorMessage } from '../useApiPracticeSession';

describe('practice session errors', () => {
  it('explains why a legacy retry cannot safely use the current answer key', () => {
    const error = new ApiRequestError('RETRY_SOURCE_UNSUPPORTED', 'unsupported', 409);

    expect(getPracticeSessionLoadErrorMessage(error)).toContain('không có đủ dữ liệu câu hỏi bất biến');
    expect(getPracticeSessionLoadErrorMessage(error)).toContain('không dùng đáp án của đề hiện tại');
  });
});
