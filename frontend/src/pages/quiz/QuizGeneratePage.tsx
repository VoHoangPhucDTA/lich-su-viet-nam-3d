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

const PRESET_COUNTS: CountMode[] = ['1', '3', '5'];
const PRESET_TOPICS = [
  { id: 'august-revolution-1945', label: 'Cách mạng tháng Tám', query: 'Cách mạng tháng Tám năm 1945' },
  { id: 'dien-bien-phu-1954', label: 'Điện Biên Phủ 1954', query: 'Chiến thắng Điện Biên Phủ năm 1954' },
  { id: 'anti-us-resistance', label: 'Kháng chiến chống Mỹ', query: 'Kháng chiến chống Mỹ cứu nước' },
  { id: 'asean', label: 'ASEAN', query: 'ASEAN và quan hệ quốc tế' },
  { id: 'dai-viet-civilization', label: 'Văn minh Đại Việt', query: 'Văn minh Đại Việt' },
  { id: 'doi-moi-1986', label: 'Đổi mới 1986', query: 'Công cuộc Đổi mới từ năm 1986' },
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
  const [countMode, setCountMode] = useState<CountMode>('3');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const submittingRef = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);

  const questionCount = resolveQuestionCount(countMode);
  const timeLimitMinutes = questionCount == null ? null : derivePracticeTimeLimitMinutes(questionCount);
  const trimmedQuery = query.trim();
  const queryError = !trimmedQuery
    ? 'Hãy nhập chủ đề hoặc yêu cầu để tạo câu hỏi.'
    : query.length > 1000
      ? 'Chủ đề hoặc yêu cầu không được vượt quá 1.000 ký tự.'
      : null;
  const disabledReason = queryError ?? (questionCount == null ? 'Số câu không hợp lệ.' : null);
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
        <PublicPageHeader title="Tạo bài luyện tập bằng AI" />

        {error && (
          <div ref={errorRef} className="quiz-alert quiz-error-panel" role="alert" tabIndex={-1}>
            <strong>Chưa thể tạo bài luyện tập</strong>
            <span>{error}</span>
          </div>
        )}

        <section className="public-card quiz-generate-card">
          <div className="quiz-generate-section-heading">
            <h2>Nội dung</h2>
          </div>

          <div className="quiz-topic-picker">
            <p id="quiz-suggestions-label" className="quiz-topic-suggestions-label">Gợi ý cho bạn</p>
            <div
              className="quiz-suggestion-list"
              role="group"
              aria-labelledby="quiz-suggestions-label"
            >
              {PRESET_TOPICS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="quiz-suggestion-chip"
                  onClick={() => {
                    setSelectedPresetId(preset.id);
                    setQuery(preset.query);
                    setError(null);
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="quiz-query-field">
            <label htmlFor="quiz-query">Bạn muốn ôn tập nội dung gì?</label>
            <div className="form-control-wrap"><textarea
              id="quiz-query"
              className="form-control"
              rows={3}
              value={query}
              aria-describedby="quiz-query-count"
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
            /></div>
            <div className="quiz-field-helper">
              <span id="quiz-query-count" className={query.length > 1000 ? 'quiz-field-invalid' : ''}>{query.length}/1000</span>
            </div>
          </div>

          <div className="quiz-generate-options quiz-config-grid">
            <fieldset className="quiz-option-field quiz-difficulty-field">
              <legend>Độ khó</legend>
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

            <fieldset className="quiz-option-field quiz-count-field">
              <legend>Số câu</legend>
              <div className="quiz-count-picker" role="radiogroup" aria-label="Số câu">
                {PRESET_COUNTS.map((mode) => (
                  <label key={mode} className={`quiz-count-button ${countMode === mode ? 'quiz-count-button-selected' : ''}`}>
                    <input
                      type="radio"
                      name="quiz-count"
                      value={mode}
                      checked={countMode === mode}
                      onChange={() => setCountMode(mode)}
                    />
                    <span>{mode} câu</span>
                  </label>
                ))}
              </div>
              <p className="quiz-count-time" aria-live="polite">
                Thời gian: <strong>{timeLimitMinutes ?? '—'}</strong> phút
              </p>
            </fieldset>
          </div>

          <div className="quiz-generate-footer">
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={!canGenerate}
              className="public-primary-button quiz-generate-cta"
            >
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
