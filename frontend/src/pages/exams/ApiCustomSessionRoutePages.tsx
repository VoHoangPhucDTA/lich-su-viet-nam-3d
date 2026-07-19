import { useParams } from 'react-router-dom';
import ApiPracticeSessionPage from './ApiPracticeSessionPage';
import ExamCustomSessionPage from './ExamCustomSessionPage';
import ExamV2SessionPage from './ExamV2SessionPage';

export function ApiCustomMockSessionRoutePage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  if (!sessionId) return <div>Liên kết phiên tùy chọn không hợp lệ.</div>;
  return <ExamV2SessionPage initialSessionId={sessionId} legacyFallback={<ExamCustomSessionPage />} />;
}

export function ApiCustomPracticeSessionRoutePage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  return <ApiPracticeSessionPage routeKey={`CUSTOM_PRACTICE:${sessionId ?? ''}`} initialSessionId={sessionId} request={null} title="Luyện tập tùy chọn" modeLabel="Luyện tập tùy chọn" backTo="/exams/tao-de" backLabel="Quay lại tạo đề" legacyFallback={<ExamCustomSessionPage />} />;
}
