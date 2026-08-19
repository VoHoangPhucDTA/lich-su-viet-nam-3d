import { useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import ApiPracticeSessionPage from './ApiPracticeSessionPage';

export function ApiFreePracticeRoutePage() {
  const { examId } = useParams<{ examId: string }>();
  const request = useMemo(() => examId ? { mode: 'FREE_PRACTICE' as const, examId } : null, [examId]);
  return <ApiPracticeSessionPage routeKey={`FREE_PRACTICE:${examId ?? ''}`} request={request} title="Luyện tập tự do" modeLabel="Luyện tập tự do" backTo="/exams/browse" backLabel="Quay lại danh sách đề" />;
}

export function ApiTopicPracticeRoutePage() {
  const { topicSlug } = useParams<{ topicSlug: string }>();
  const [searchParams] = useSearchParams();
  const scopeType: 'topic' | 'period' = searchParams.get('scope') === 'period' ? 'period' : 'topic';
  const request = useMemo(() => topicSlug ? { mode: 'TOPIC_PRACTICE' as const, questionCount: 30, scopeType, scopeSlug: topicSlug } : null, [scopeType, topicSlug]);
  const routeKey = scopeType === 'period' ? `TOPIC_PRACTICE:period:${topicSlug ?? ''}` : `TOPIC_PRACTICE:${topicSlug ?? ''}`;
  return <ApiPracticeSessionPage routeKey={routeKey} request={request} title="Ôn theo chủ đề" modeLabel="Ôn theo chủ đề" backTo="/exams/on-chu-de" backLabel="Quay lại danh sách chủ đề" />;
}

export function ApiRetryWrongRoutePage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const request = useMemo(() => sessionId ? { mode: 'RETRY_WRONG' as const, sourceAttemptId: sessionId } : null, [sessionId]);
  return <ApiPracticeSessionPage routeKey={`RETRY_WRONG:${sessionId ?? ''}`} request={request} title="Ôn lại câu sai" modeLabel="Ôn lại câu sai" backTo={sessionId ? `/exams/ket-qua/${sessionId}` : '/exams/lich-su'} backLabel="Quay lại kết quả" />;
}
