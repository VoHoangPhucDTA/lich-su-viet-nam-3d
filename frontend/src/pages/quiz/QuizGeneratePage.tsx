import { ChevronDown, SlidersHorizontal, Sparkles } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import PublicPageHeader from '../../components/public/PublicPageHeader';
import QuizGenerationLoading from '../../components/quiz/QuizGenerationLoading';
import {
  derivePracticeTimeLimitMinutes,
  resolveQuestionCount,
  type CountMode,
} from '../../components/quiz/practiceConfig';
import * as quizService from '../../services/quizService';
import { getQuizAiErrorMessage } from '../../services/quizAiApi';
import type { QuizConfig, QuizDifficulty } from '../../types/quiz';

const PRESET_COUNTS: CountMode[] = ['3', '5', '10'];
const PRESET_TOPICS = [
  { id: 'august-revolution-1945', query: 'Cách mạng tháng Tám năm 1945' },
  { id: 'dien-bien-phu-1954', query: 'Chiến thắng Điện Biên Phủ năm 1954' },
  { id: 'anti-us-resistance', query: 'Kháng chiến chống Mỹ cứu nước' },
  { id: 'asean', query: 'ASEAN và quan hệ quốc tế' },
  { id: 'dai-viet-civilization', query: 'Văn minh Đại Việt' },
  { id: 'doi-moi-1986', query: 'Công cuộc Đổi mới từ năm 1986' },
];
const DIFFICULTY_LABELS: Record<Exclude<QuizDifficulty, 'mixed'>, string> = {
  easy: 'Dễ',
  medium: 'Trung bình',
  hard: 'Khó',
};

export default function QuizGeneratePage() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '');
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<Exclude<QuizDifficulty, 'mixed'>>('medium');
  const [countMode, setCountMode] = useState<CountMode>('5');
  const [customCount, setCustomCount] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const submittingRef = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);

  const questionCount = resolveQuestionCount(countMode, customCount);
  const timeLimitMinutes = questionCount == null ? null : derivePracticeTimeLimitMinutes(questionCount);
  const trimmedQuery = query.trim();
  const queryError = !trimmedQuery
    ? 'Hãy nhập chủ đề hoặc yêu cầu để tạo câu hỏi.'
    : query.length > 1000
      ? 'Chủ đề hoặc yêu cầu không được vượt quá 1.000 ký tự.'
      : null;
  const countError = questionCount == null ? 'Số câu phải là số nguyên từ 1 đến 10.' : null;
  const disabledReason = queryError ?? countError;
  const canGenerate = !isGenerating && disabledReason == null;
  const selectedPreset = PRESET_TOPICS.find((preset) => preset.id === selectedPresetId);

  function normalizeQuery(value: string) {
    return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi-VN');
  }

  function showError(message: string) {
    setError(message);
    window.requestAnimationFrame(() => errorRef.current?.focus());
  }

  async function handleGenerate() {
    if (submittingRef.current || !canGenerate || questionCount == null || timeLimitMinutes == null) {
      if (disabledReason) showError(disabledReason);
      return;
    }
    submittingRef.current = true;
    setError(null);
    setIsGenerating(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const config: QuizConfig = {
        query: trimmedQuery,
        difficulty,
        questionCount,
        timeLimitMinutes,
      };
      const session = await quizService.generateQuiz(config, currentUser?.id ?? 'guest', controller.signal);
      navigate(`/quiz/session/${session.sessionId}`);
    } catch (requestError) {
      if (!(requestError instanceof DOMException && requestError.name === 'AbortError')) {
        showError(getQuizAiErrorMessage(requestError));
      }
    } finally {
      abortRef.current = null;
      submittingRef.current = false;
      setIsGenerating(false);
    }
  }

  return (
    <div className="public-shell quiz-shell">
      <main className="public-content-narrow space-y-7">
        <PublicPageHeader
          eyebrow="Tạo bài luyện tập"
          title="Câu hỏi tạo bởi AI từ nguồn SGK"
          description="Nhập chủ đề bạn muốn ôn tập. Hệ thống sẽ tìm trong toàn bộ SGK Lịch sử lớp 10–12 và tạo câu hỏi có giải thích, trích nguồn."
          showBack
          backTo="/quiz"
          backFallback="/quiz"
          backLabel="Về trang trắc nghiệm"
        />

        {error && (
          <div ref={errorRef} className="quiz-alert quiz-error-panel" role="alert" tabIndex={-1}>
            <strong>Chưa thể tạo bài luyện tập</strong>
            <span>{error}</span>
          </div>
        )}

        <section className="public-card quiz-generate-card">
          <div className="quiz-generate-section-heading">
            <span className="quiz-preview-icon">
              <SlidersHorizontal size={19} aria-hidden="true" data-quiz-icon="setup" />
            </span>
            <div>
              <h2>Thiết lập bài tự luyện</h2>
              <p>Câu hỏi được tạo từ nguồn SGK và chỉ được lưu trong trình duyệt của bạn.</p>
            </div>
          </div>

          <div className="quiz-topic-picker">
            <label htmlFor="quiz-topic-preset">Gợi ý chủ đề</label>
            <p id="quiz-topic-helper" className="quiz-control-helper">
              Chọn một gợi ý để điền nhanh vào ô bên dưới. Bạn có thể chỉnh sửa lại nội dung.
            </p>
            <div className="quiz-topic-select-wrap">
              <select
                id="quiz-topic-preset"
                value={selectedPresetId ?? ''}
                aria-describedby="quiz-topic-helper"
                onChange={(event) => {
                  const preset = PRESET_TOPICS.find((candidate) => candidate.id === event.target.value);
                  setSelectedPresetId(preset?.id ?? null);
                  if (preset) setQuery(preset.query);
                  setError(null);
                }}
              >
                <option value="">Chọn nhanh một chủ đề…</option>
                {PRESET_TOPICS.map((preset) => <option key={preset.id} value={preset.id}>{preset.query}</option>)}
              </select>
              <ChevronDown size={16} aria-hidden="true" />
            </div>
          </div>

          <div className="quiz-query-field">
            <label htmlFor="quiz-query">Bạn muốn ôn tập nội dung gì?</label>
            <textarea
              id="quiz-query"
              value={query}
              aria-describedby="quiz-query-helper quiz-query-count"
              aria-invalid={query.length > 1000}
              onChange={(event) => {
                const nextQuery = event.target.value;
                setQuery(nextQuery);
                if (selectedPreset && normalizeQuery(nextQuery) !== normalizeQuery(selectedPreset.query)) {
                  setSelectedPresetId(null);
                }
                setError(null);
              }}
              placeholder="Ví dụ: Phân tích nguyên nhân thắng lợi của Cách mạng tháng Tám năm 1945"
            />
            <div className="quiz-field-helper">
              <span id="quiz-query-helper">Tìm kiếm trên SGK Lịch sử lớp 10–12</span>
              <span id="quiz-query-count" className={query.length > 1000 ? 'quiz-field-invalid' : ''}>{query.length}/1000</span>
            </div>
          </div>

          <div className="quiz-generate-options quiz-config-grid">
            <fieldset className="quiz-option-field quiz-difficulty-field">
              <legend>Độ khó</legend>
              <p className="quiz-control-helper">Dễ: nhận biết · Trung bình: thông hiểu · Khó: phân tích, vận dụng</p>
              <div className="quiz-segmented-control">
                {(['easy', 'medium', 'hard'] as const).map((value) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="quiz-difficulty"
                      value={value}
                      checked={difficulty === value}
                      onChange={() => setDifficulty(value)}
                    />
                    <span>{DIFFICULTY_LABELS[value]}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="quiz-option-field">
              <legend>Số câu</legend>
              <p className="quiz-control-helper">Tối đa 10 câu cho mỗi bài tự luyện.</p>
              <div className="quiz-count-picker">
                {PRESET_COUNTS.map((mode) => (
                  <label key={mode} className={`quiz-count-button ${countMode === mode ? 'quiz-count-button-selected' : ''}`}>
                    <input type="radio" name="quiz-count" checked={countMode === mode} onChange={() => setCountMode(mode)} />
                    <span>{mode} câu</span>
                  </label>
                ))}
                <label className={`quiz-count-button ${countMode === 'custom' ? 'quiz-count-button-selected' : ''}`}>
                  <input type="radio" name="quiz-count" checked={countMode === 'custom'} onChange={() => setCountMode('custom')} />
                  <span>Khác</span>
                </label>
              </div>
              {countMode === 'custom' && (
                <div className="quiz-custom-count">
                  <label htmlFor="quiz-custom-count">Nhập số câu (1–10)</label>
                  <input
                    id="quiz-custom-count"
                    type="number"
                    min={1}
                    max={10}
                    step={1}
                    value={customCount}
                    aria-invalid={countError != null}
                    onChange={(event) => setCustomCount(event.target.value)}
                  />
                </div>
              )}
            </fieldset>
          </div>

          <div className="quiz-generate-footer">
            <div>
              <p className="quiz-config-summary">
                {DIFFICULTY_LABELS[difficulty]} • {questionCount ?? '—'} câu • {timeLimitMinutes ?? '—'} phút
              </p>
              {disabledReason && <p id="quiz-generate-disabled-reason" className="quiz-disabled-reason">{disabledReason}</p>}
            </div>
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={!canGenerate}
              aria-describedby={disabledReason ? 'quiz-generate-disabled-reason' : undefined}
              className="public-primary-button quiz-generate-cta"
            >
              <Sparkles size={17} aria-hidden="true" data-quiz-icon="generate" />
              Tạo {questionCount ?? ''} câu hỏi
            </button>
          </div>
        </section>
      </main>
      {isGenerating && questionCount != null && (
        <QuizGenerationLoading
          questionCount={questionCount}
          onStopWaiting={() => abortRef.current?.abort()}
        />
      )}
    </div>
  );
}
