import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import TopicCombobox, { type TopicComboboxOption } from '@/components/exams/TopicCombobox';
import PeriodSelector from '@/components/exams/PeriodSelector';
import { createExamSession, isExamApiFallbackError, listTopicMetadata, previewCustomExam } from '@/services/examApi';
import type { CustomPreviewResponse, ExamTopicMetadata } from '@/types/examApi';

type QuestionType = 'all' | 'mcq' | 'true_false';
type Cognitive = 'all' | 'knowledge' | 'comprehension' | 'application';
type Scope = 'all' | 'topic' | 'period';
type Mode = 'practice' | 'mock';

interface CreateExamPreset {
  id: 'custom_default' | 'quick_warmup' | 'custom_full';
  name: string;
  description: string;
  config: {
    questionCount: number;
    questionType: QuestionType;
    cognitiveLevel: Cognitive;
    scopeType: Scope;
    scopeSlug: string;
    mode: Mode;
  };
}

interface ChoiceOption<T extends string | number> {
  value: T;
  label: string;
  description?: string;
}

const CUSTOM_DEFAULT_CONFIG = {
  questionCount: 28,
  questionType: 'all' as QuestionType,
  cognitiveLevel: 'all' as Cognitive,
  scopeType: 'all' as Scope,
  scopeSlug: '',
  mode: 'practice' as Mode,
};

const QUICK_WARMUP_CONFIG = {
  ...CUSTOM_DEFAULT_CONFIG,
  questionCount: 10,
};

const PRESETS: CreateExamPreset[] = [
  {
    id: 'custom_default',
    name: 'Cấu hình mặc định',
    description: '28 câu, toàn bộ nội dung và chế độ luyện tập.',
    config: { ...CUSTOM_DEFAULT_CONFIG },
  },
  {
    id: 'quick_warmup',
    name: 'Ôn nhanh',
    description: '10 câu, toàn bộ nội dung và chế độ luyện tập.',
    config: { ...QUICK_WARMUP_CONFIG },
  },
  {
    id: 'custom_full',
    name: 'Tùy chỉnh',
    description: 'Chọn nội dung, số câu và cách luyện.',
    config: { ...CUSTOM_DEFAULT_CONFIG },
  },
];

const SCOPE_OPTIONS: ChoiceOption<Scope>[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'topic', label: 'Một chủ đề' },
  { value: 'period', label: 'Một giai đoạn' },
];
const COUNT_OPTIONS: ChoiceOption<number>[] = [10, 20, 28].map((value) => ({ value, label: String(value) }));
const QUESTION_TYPE_OPTIONS: ChoiceOption<QuestionType>[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'mcq', label: 'Trắc nghiệm' },
  { value: 'true_false', label: 'Đúng/Sai' },
];
const COGNITIVE_OPTIONS: ChoiceOption<Cognitive>[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'knowledge', label: 'Nhận biết' },
  { value: 'comprehension', label: 'Thông hiểu' },
  { value: 'application', label: 'Vận dụng' },
];
const MODE_OPTIONS: ChoiceOption<Mode>[] = [
  { value: 'practice', label: 'Luyện tập', description: 'Không giới hạn thời gian' },
  { value: 'mock', label: 'Thi thử tùy chọn', description: '50 phút' },
];

const questionTypeLabels: Record<QuestionType, string> = {
  all: 'Tất cả dạng câu',
  mcq: 'Trắc nghiệm',
  true_false: 'Đúng/Sai',
};
const cognitiveLabels: Record<Cognitive, string> = {
  all: 'Tất cả',
  knowledge: 'Nhận biết',
  comprehension: 'Thông hiểu',
  application: 'Vận dụng',
};
const modeLabels: Record<Mode, string> = {
  practice: 'Luyện tập',
  mock: 'Thi thử tùy chọn · 50 phút',
};

function ChoiceGroup<T extends string | number>({
  legend,
  name,
  value,
  options,
  columns,
  onChange,
}: {
  legend: string;
  name: string;
  value: T;
  options: ChoiceOption<T>[];
  columns: 2 | 3 | 4;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="quiz-option-field exam-builder-choice-field">
      <legend>{legend}</legend>
      <div className={`quiz-segmented-control exam-builder-choice-grid exam-builder-choice-grid-${columns}`}>
        {options.map((option) => (
          <label key={String(option.value)}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span className={option.description ? 'exam-builder-mode-choice' : undefined}>
              <strong>{option.label}</strong>
              {option.description && <small>{option.description}</small>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="exam-builder-summary-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export default function ApiCustomCreatePage() {
  const navigate = useNavigate();
  const [topics, setTopics] = useState<ExamTopicMetadata[]>([]);
  const [usingFallback, setUsingFallback] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePresetId, setActivePresetId] = useState<CreateExamPreset['id']>('custom_default');
  const [questionCount, setQuestionCount] = useState(CUSTOM_DEFAULT_CONFIG.questionCount);
  const [questionType, setQuestionType] = useState<QuestionType>(CUSTOM_DEFAULT_CONFIG.questionType);
  const [cognitiveLevel, setCognitiveLevel] = useState<Cognitive>(CUSTOM_DEFAULT_CONFIG.cognitiveLevel);
  const [scopeType, setScopeType] = useState<Scope>(CUSTOM_DEFAULT_CONFIG.scopeType);
  const [scopeSlug, setScopeSlug] = useState('');
  const [mode, setMode] = useState<Mode>(CUSTOM_DEFAULT_CONFIG.mode);
  const [preview, setPreview] = useState<CustomPreviewResponse | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [previewRetryKey, setPreviewRetryKey] = useState(0);
  const [starting, setStarting] = useState(false);

  const periods = useMemo(() => {
    const map = new Map<string, { slug: string; title: string }>();
    for (const topic of topics) {
      if (topic.periodSlug && topic.periodTitle) {
        map.set(topic.periodSlug, { slug: topic.periodSlug, title: topic.periodTitle });
      }
    }
    return [...map.values()].sort((a, b) => a.title.localeCompare(b.title, 'vi'));
  }, [topics]);
  const topicOptions: TopicComboboxOption[] = topics.map((topic) => ({
    slug: topic.slug,
    title: topic.title,
    questionCount: topic.questionCount,
    mcqCount: topic.mcqCount,
    tfCount: topic.tfCount,
  }));
  const periodSelectOptions = periods;
  const request = useMemo(() => ({
    questionCount,
    questionType,
    difficulty: 'all' as const,
    cognitiveLevel,
    scopeType,
    scopeSlug: scopeType === 'all' ? undefined : scopeSlug || undefined,
  }), [cognitiveLevel, questionCount, questionType, scopeSlug, scopeType]);

  const scopeLabel = scopeType === 'all'
    ? 'Toàn bộ nội dung'
    : topics.find((topic) => topic.slug === scopeSlug)?.title
      ?? periods.find((item) => item.slug === scopeSlug)?.title
      ?? (scopeType === 'topic' ? 'Chưa chọn chủ đề' : 'Chưa chọn giai đoạn');
  const canStart = Boolean(preview?.enoughQuestions) && !previewing && !starting;

  useEffect(() => {
    const controller = new AbortController();
    void listTopicMetadata(controller.signal)
      .then((response) => {
        setTopics(response.items);
        setScopeSlug((current) => current || response.items[0]?.slug || '');
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        if (isExamApiFallbackError(loadError)) setUsingFallback(true);
        else setError(loadError instanceof Error ? loadError.message : 'Không thể tải metadata chủ đề.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (scopeType === 'all') return;
    const allowedSlugs = scopeType === 'topic'
      ? topics.map((topic) => topic.slug)
      : periods.map((period) => period.slug);
    if (!allowedSlugs.includes(scopeSlug)) {
      setScopeSlug(allowedSlugs[0] ?? '');
    }
  }, [periods, scopeSlug, scopeType, topics]);

  useEffect(() => {
    if (loading || usingFallback) return;
    if (scopeType !== 'all' && !scopeSlug) {
      setPreview(null);
      setPreviewing(false);
      return;
    }

    const controller = new AbortController();
    setPreview(null);
    setPreviewing(true);
    setPreviewFailed(false);
    setError(null);
    const timeoutId = window.setTimeout(() => {
      void previewCustomExam(request, controller.signal)
        .then((response) => {
          if (!controller.signal.aborted) setPreview(response);
        })
        .catch((previewError: unknown) => {
          if (controller.signal.aborted) return;
          setPreviewFailed(true);
          setError(previewError instanceof Error ? previewError.message : 'Không thể kiểm tra cấu hình đề.');
        })
        .finally(() => {
          if (!controller.signal.aborted) setPreviewing(false);
        });
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [loading, previewRetryKey, request, scopeSlug, scopeType, usingFallback]);

  async function start() {
    if (!preview?.enoughQuestions || starting) return;
    setStarting(true);
    setError(null);
    try {
      const session = await createExamSession({
        ...request,
        mode: mode === 'mock' ? 'CUSTOM_MOCK' : 'CUSTOM_PRACTICE',
        expectedDatasetVersion: preview.datasetVersion,
      });
      if (session.anonymousSessionToken) {
        localStorage.setItem(`exam_session_token_${session.sessionId}`, session.anonymousSessionToken);
      }
      navigate(mode === 'mock' ? `/exams/tuy-chon/${session.sessionId}` : `/exams/tuy-chon/luyen-tap/${session.sessionId}`);
    } catch (startError: unknown) {
      setError(startError instanceof Error ? startError.message : 'Không thể tạo phiên tùy chỉnh.');
    } finally {
      setStarting(false);
    }
  }

  function handleSelectPreset(presetId: CreateExamPreset['id']) {
    if (presetId === 'custom_full') {
      setActivePresetId('custom_full');
      setError(null);
      return;
    }
    const preset = PRESETS.find((entry) => entry.id === presetId);
    if (!preset) return;
    setActivePresetId(preset.id);
    setQuestionCount(preset.config.questionCount);
    setQuestionType(preset.config.questionType);
    setCognitiveLevel(preset.config.cognitiveLevel);
    setScopeType(preset.config.scopeType);
    setScopeSlug(preset.config.scopeSlug);
    setMode(preset.config.mode);
    setError(null);
  }

  function updateCustom<T>(setter: (value: T) => void, value: T) {
    setActivePresetId('custom_full');
    setter(value);
    setError(null);
  }

  function handleSelectTopic(option: TopicComboboxOption) {
    updateCustom(setScopeSlug, option.slug);
  }

  if (usingFallback) {
    return (
      <div className="exam-builder-page">
        <main className="exam-builder-container">
          <Link className="exam-focusable exam-builder-back" to="/exams">← Luyện thi</Link>
          <p role="alert" style={errorStyle}>Không kết nối được máy chủ đề thi. Vui lòng thử lại.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="exam-builder-page">
      <main className="exam-builder-container">
        <Link className="exam-focusable exam-builder-back" to="/exams">← Luyện thi</Link>
        <header className="exam-builder-header">
          <h1>Tạo đề tùy chọn</h1>
        </header>

        {loading ? (
          <p role="status" style={mutedStyle}>Đang tải metadata chủ đề...</p>
        ) : (
          <>
            {error && <p role="alert" style={errorStyle}>{error}</p>}
            <div className="exam-builder-layout">
              <div className="exam-builder-config-column">
                <section className="exam-builder-card" aria-labelledby="builder-config-title">
                  <div>
                    <h2 id="builder-config-title">Cấu hình đề</h2>
                  </div>

                  <div className="exam-builder-subsection">
                    <h3>Cấu hình nhanh</h3>
                    <div role="radiogroup" aria-label="Cấu hình nhanh" className="exam-builder-presets">
                      {PRESETS.map((preset) => {
                        const selected = preset.id === activePresetId;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            className="exam-focusable exam-builder-preset"
                            onClick={() => handleSelectPreset(preset.id)}
                            style={selected ? presetCardSelectedStyle : undefined}
                          >
                            <strong>{preset.name}</strong>
                            <span>{preset.description}</span>
                            {selected && <span className="exam-builder-selected-indicator">Đang chọn</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {activePresetId === 'custom_full' && (
                    <div className="exam-builder-custom-fields">
                      <section className="exam-builder-subsection" aria-labelledby="content-options-title">
                        <div>
                          <h3 id="content-options-title">Nội dung luyện</h3>
                        </div>
                        <ChoiceGroup
                          legend="Phạm vi"
                          name="exam-scope"
                          value={scopeType}
                          options={SCOPE_OPTIONS}
                          columns={3}
                          onChange={(value) => updateCustom(setScopeType, value)}
                        />
                        {scopeType === 'topic' && (
                          <div className="form-control-wrap exam-builder-dynamic-field">
                            <TopicCombobox
                              label="Chủ đề"
                              options={topicOptions}
                              selectedSlug={scopeSlug}
                              onSelect={handleSelectTopic}
                            />
                          </div>
                        )}
                        {scopeType === 'period' && (
                          <div className="form-control-wrap exam-builder-dynamic-field">
                            <PeriodSelector
                              label="Giai đoạn"
                              options={periodSelectOptions}
                              value={scopeSlug}
                              onChange={(slug) => updateCustom(setScopeSlug, slug)}
                            />
                          </div>
                        )}
                        <ChoiceGroup
                          legend="Mức độ"
                          name="exam-cognitive"
                          value={cognitiveLevel}
                          options={COGNITIVE_OPTIONS}
                          columns={4}
                          onChange={(value) => updateCustom(setCognitiveLevel, value)}
                        />
                      </section>

                      <section className="exam-builder-subsection" aria-labelledby="practice-options-title">
                        <div>
                          <h3 id="practice-options-title">Cách luyện</h3>
                        </div>
                        <ChoiceGroup
                          legend="Số câu"
                          name="exam-count"
                          value={questionCount}
                          options={COUNT_OPTIONS}
                          columns={3}
                          onChange={(value) => updateCustom(setQuestionCount, value)}
                        />
                        <ChoiceGroup
                          legend="Dạng câu"
                          name="exam-question-type"
                          value={questionType}
                          options={QUESTION_TYPE_OPTIONS}
                          columns={3}
                          onChange={(value) => updateCustom(setQuestionType, value)}
                        />
                        <ChoiceGroup
                          legend="Chế độ"
                          name="exam-mode"
                          value={mode}
                          options={MODE_OPTIONS}
                          columns={2}
                          onChange={(value) => updateCustom(setMode, value)}
                        />
                      </section>
                    </div>
                  )}
                </section>
              </div>

              <aside className="exam-builder-summary-column" aria-labelledby="builder-summary-title">
                <section className="exam-builder-card exam-builder-summary-card">
                  <h2 id="builder-summary-title">Tóm tắt</h2>
                  <strong className="exam-builder-question-count">{questionCount} câu</strong>
                  <dl className="exam-builder-summary-list">
                    <SummaryRow label="Nội dung">{scopeLabel}</SummaryRow>
                    <SummaryRow label="Dạng câu">{questionTypeLabels[questionType]}</SummaryRow>
                    <SummaryRow label="Mức độ">{cognitiveLabels[cognitiveLevel]}</SummaryRow>
                    <SummaryRow label="Chế độ">{modeLabels[mode]}</SummaryRow>
                  </dl>

                  <div className="exam-builder-availability" aria-live="polite">
                    {previewing && <p role="status">Đang kiểm tra cấu hình…</p>}
                    {!previewing && preview && !preview.enoughQuestions && (
                      <div className="exam-builder-insufficient" role="alert">
                        <strong>Không đủ câu hỏi cho cấu hình này.</strong>
                        <span>Hiện có {preview.availableCount} câu phù hợp.</span>
                        <span>Hãy giảm số câu hoặc mở rộng phạm vi.</span>
                      </div>
                    )}
                    {previewFailed && (
                      <button
                        type="button"
                        className="exam-focusable"
                        onClick={() => setPreviewRetryKey((key) => key + 1)}
                        style={secondaryButtonStyle}
                      >
                        Kiểm tra lại cấu hình
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    className="exam-focusable exam-builder-start"
                    onClick={() => void start()}
                    disabled={!canStart}
                  >
                    {starting ? 'Đang tạo phiên…' : 'Bắt đầu luyện tập'}
                  </button>
                </section>
              </aside>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

const errorStyle: CSSProperties = { margin: 0, color: 'var(--danger)', lineHeight: 1.5 };
const mutedStyle: CSSProperties = { color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 };
const secondaryButtonStyle: CSSProperties = {
  minHeight: '2.75rem',
  padding: '0.65rem 0.9rem',
  borderRadius: '0.7rem',
  border: '1px solid var(--border)',
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  fontWeight: 700,
  cursor: 'pointer',
};
const presetCardSelectedStyle: CSSProperties = {
  borderColor: 'var(--accent)',
  background: 'var(--accent-soft)',
  boxShadow: 'inset 0 0 0 1px var(--accent)',
};
