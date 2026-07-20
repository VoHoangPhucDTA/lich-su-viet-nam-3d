import { BookOpen, BrainCircuit, ChevronDown } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import PublicPageHeader from '../../components/public/PublicPageHeader';
import QuizGenerationLoading from '../../components/quiz/QuizGenerationLoading';
import * as quizService from '../../services/quizService';
import { getQuizAiErrorMessage } from '../../services/quizAiApi';
import type { QuizConfig, QuizDifficulty } from '../../types/quiz';

const PRESET_COUNTS = [3, 5, 10];
const PRESET_TOPICS = [
  { label: 'Cách mạng tháng Tám năm 1945', value: 'Cách mạng tháng Tám năm 1945' },
  { label: 'Chiến thắng Điện Biên Phủ năm 1954', value: 'Chiến thắng Điện Biên Phủ năm 1954' },
  { label: 'Kháng chiến chống Mỹ cứu nước', value: 'Kháng chiến chống Mỹ cứu nước' },
  { label: 'ASEAN và quan hệ quốc tế', value: 'ASEAN và quan hệ quốc tế' },
  { label: 'Văn minh Đại Việt', value: 'Văn minh Đại Việt' },
  { label: 'Công cuộc Đổi mới từ năm 1986', value: 'Công cuộc Đổi mới từ năm 1986' },
];

export default function QuizGeneratePage() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get('q')?.slice(0, 1000) ?? '');
  const [difficulty, setDifficulty] = useState<QuizDifficulty>('medium');
  const [questionCount, setQuestionCount] = useState<number | string>(5);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleGenerate = async () => {
    if (isGenerating) return;
    const count = typeof questionCount === 'string' ? Number.parseInt(questionCount, 10) : questionCount;
    if (!query.trim() || query.length > 1000) { setError('Chủ đề hoặc yêu cầu phải có từ 1 đến 1.000 ký tự.'); return; }
    if (!Number.isInteger(count) || count < 1 || count > 10) { setError('Số câu phải nằm trong khoảng từ 1 đến 10.'); return; }
    setError(null);
    setIsGenerating(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const config: QuizConfig = { query: query.trim(), difficulty, questionCount: count, timeLimitMinutes: 15 };
      const session = await quizService.generateQuiz(config, currentUser?.id ?? 'guest', controller.signal);
      navigate(`/quiz/session/${session.sessionId}`);
    } catch (requestError) {
      if (!(requestError instanceof DOMException && requestError.name === 'AbortError')) setError(getQuizAiErrorMessage(requestError));
    } finally {
      abortRef.current = null;
      setIsGenerating(false);
    }
  };

  return (
    <div className="public-shell quiz-shell">
      <main className="public-content-narrow space-y-7">
        <PublicPageHeader eyebrow="Tạo bài luyện tập" title="Câu hỏi tạo bởi AI từ nguồn SGK"
          description="Nhập chủ đề bạn muốn ôn tập. Hệ thống sẽ tìm trong toàn bộ SGK Lịch sử lớp 10–12 và tạo câu hỏi có giải thích, trích nguồn."
          showBack backFallback="/quiz" />
        {error && <div className="quiz-alert" role="alert"><span>{error}</span></div>}
        <section className="public-card quiz-generate-card">
          <div className="quiz-generate-section-heading">
            <span className="quiz-preview-icon"><BookOpen size={19} aria-hidden="true" /></span>
            <div>
              <h2>Chủ đề hoặc yêu cầu</h2>
              <p>Chọn một chủ đề gợi ý hoặc viết yêu cầu riêng để AI tìm trong nguồn SGK.</p>
            </div>
          </div>
          <div className="quiz-topic-picker">
            <label htmlFor="quiz-topic-preset">Chủ đề có sẵn <span>(không bắt buộc)</span></label>
            <div className="quiz-topic-select-wrap">
              <select id="quiz-topic-preset" value={PRESET_TOPICS.some(topic => topic.value === query) ? query : ''}
                onChange={event => event.target.value && setQuery(event.target.value)}>
                <option value="">Chọn nhanh một chủ đề…</option>
                {PRESET_TOPICS.map(topic => <option key={topic.value} value={topic.value}>{topic.label}</option>)}
              </select>
              <ChevronDown size={16} aria-hidden="true" />
            </div>
          </div>
          <div className="quiz-query-field">
            <label htmlFor="quiz-query">Nội dung muốn ôn tập</label>
            <textarea id="quiz-query" value={query} maxLength={1000} onChange={event => setQuery(event.target.value)}
              placeholder="Ví dụ: Phân tích nguyên nhân thắng lợi của Cách mạng tháng Tám năm 1945" />
            <div className="quiz-field-helper"><span>AI sẽ tìm kiếm trên SGK Lịch sử lớp 10–12</span><span>{query.length}/1000</span></div>
          </div>
          <div className="quiz-generate-options">
            <div className="quiz-option-field">
              <label htmlFor="quiz-difficulty">Độ khó</label>
              <select id="quiz-difficulty" value={difficulty} onChange={event => setDifficulty(event.target.value as QuizDifficulty)}>
                <option value="easy">Dễ</option><option value="medium">Trung bình</option><option value="hard">Khó</option>
              </select>
            </div>
            <div className="quiz-option-field">
              <span>Số câu</span>
              <div className="quiz-count-picker">
                {PRESET_COUNTS.map(value => <button key={value} type="button" className={`quiz-count-button ${questionCount === value ? 'quiz-count-button-selected' : ''}`} onClick={() => setQuestionCount(value)}>{value} câu</button>)}
                <input aria-label="Số câu tùy chỉnh" type="number" min={1} max={10} value={typeof questionCount === 'string' ? questionCount : ''} placeholder="Khác" onChange={event => setQuestionCount(event.target.value)} />
              </div>
            </div>
          </div>
          <div className="quiz-generate-footer">
            <p><strong>15 phút</strong><span>Thời gian làm bài cố định</span></p>
            <button type="button" onClick={() => void handleGenerate()} disabled={isGenerating || !query.trim()} className="public-primary-button">
              <BrainCircuit size={17} aria-hidden="true" /> Tạo bài luyện tập
            </button>
          </div>
        </section>
      </main>
      {isGenerating && <QuizGenerationLoading onCancel={() => abortRef.current?.abort()} />}
    </div>
  );
}
