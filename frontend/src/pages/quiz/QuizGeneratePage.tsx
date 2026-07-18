import {
  BookOpen,
  BrainCircuit,
  Flag,
  GraduationCap,
  Layers3,
  Network,
  Settings2,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import PublicPageHeader from '../../components/public/PublicPageHeader';
import MuseumSelect, { type MuseumSelectOption } from '../../components/shared/MuseumSelect';
import QuizGenerationLoading from '../../components/quiz/QuizGenerationLoading';
import QuizSelectionCard from '../../components/quiz/QuizSelectionCard';
import * as quizService from '../../services/quizService';
import type {
  CognitiveLevel,
  QuizConfig,
  QuizGrade,
  QuizSourceMode,
} from '../../types/quiz';

const SCOPE_OPTIONS: Array<{
  value: QuizSourceMode;
  label: string;
  description: string;
  icon: typeof Layers3;
}> = [
  { value: 'mixed', label: 'Nội dung tổng hợp', description: 'Trộn nhiều phạm vi kiến thức', icon: Layers3 },
  { value: 'event', label: 'Theo sự kiện', description: 'Tập trung vào một sự kiện', icon: Flag },
  { value: 'topic', label: 'Theo chủ đề', description: 'Ôn theo chuyên đề lịch sử', icon: BookOpen },
  { value: 'period', label: 'Theo giai đoạn', description: 'Chọn một thời kỳ lịch sử', icon: Network },
  { value: 'grade', label: 'Theo lớp học', description: 'Bám sát chương trình 10–12', icon: GraduationCap },
];

const TOPICS = [
  'Cách mạng tháng Tám 1945',
  'Chiến dịch Điện Biên Phủ 1954',
  'ASEAN',
  'Trật tự hai cực I-an-ta',
  'Văn minh Đại Việt',
  'Biển Đông',
];

const PERIODS = ['Cổ - trung đại', 'Cận đại', 'Hiện đại', '1945–1954', '1954–1975', '1975–nay'];
const PRESET_COUNTS = [5, 10, 15, 20];

const COGNITIVE_OPTIONS: Array<{ value: CognitiveLevel; label: string }> = [
  { value: 'knowledge', label: 'Nhận biết' },
  { value: 'comprehension', label: 'Thông hiểu' },
  { value: 'application', label: 'Vận dụng' },
  { value: 'mixed', label: 'Trộn mức độ' },
];

const TOPIC_OPTIONS: MuseumSelectOption<string>[] = [
  { value: '', label: 'Chọn nội dung' },
  ...TOPICS.map(value => ({ value, label: value })),
];

const PERIOD_OPTIONS: MuseumSelectOption<string>[] = [
  { value: '', label: 'Chọn giai đoạn lịch sử' },
  ...PERIODS.map(value => ({ value, label: value })),
];

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="quiz-form-section">
      <div className="mb-4">
        <h2 className="serif-heading text-2xl font-bold text-[var(--text-primary)]">{title}</h2>
        {description && <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export default function QuizGeneratePage() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [sourceMode, setSourceMode] = useState<QuizSourceMode>('mixed');
  const [grade, setGrade] = useState<QuizGrade>('all');
  const [selectedTopic, setSelectedTopic] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [questionCount, setQuestionCount] = useState<number | string>(10);
  const [cognitiveLevel, setCognitiveLevel] = useState<CognitiveLevel>('mixed');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setError(null);
    const count = typeof questionCount === 'string' ? Number.parseInt(questionCount, 10) : questionCount;
    if (!Number.isFinite(count) || count < 1 || count > 100) {
      setError('Số lượng câu hỏi phải nằm trong khoảng từ 1 đến 100.');
      return;
    }

    setIsGenerating(true);
    try {
      const config: QuizConfig = {
        questionCount: count,
        difficulty: 'mixed',
        sourceMode,
        grade: grade === 'all' ? undefined : grade,
        topic: selectedTopic || undefined,
        cognitiveLevel,
        source: 'textbook',
        timeLimitMinutes: 15,
      };
      const session = await quizService.generateQuiz(config, currentUser?.id ?? 'guest');
      navigate(`/quiz/session/${session.sessionId}`);
    } catch (requestError) {
      setError(requestError instanceof Error
        ? requestError.message
        : 'Không thể tạo bài trắc nghiệm. Hãy thử một phạm vi rộng hơn.');
    } finally {
      setIsGenerating(false);
    }
  };

  const count = typeof questionCount === 'string' ? questionCount || 'Tùy chỉnh' : questionCount;
  const scopeLabel = SCOPE_OPTIONS.find(option => option.value === sourceMode)?.label ?? sourceMode;
  const detailLabel = selectedTopic || selectedPeriod || (grade === 'all' ? 'Tất cả khối lớp' : `Lớp ${grade}`);
  const cognitiveLabel = COGNITIVE_OPTIONS.find(option => option.value === cognitiveLevel)?.label ?? cognitiveLevel;

  return (
    <div className="public-shell quiz-shell">
      <main className="public-content space-y-7">
        <PublicPageHeader
          eyebrow="Tạo bài luyện tập"
          title="Tạo bài trắc nghiệm lịch sử"
          description="Chọn phạm vi kiến thức, số lượng câu hỏi và mức độ nhận thức phù hợp với mục tiêu ôn tập."
          showBack
          backFallback="/quiz"
        />

        <div className="quiz-create-layout">
          <div className="space-y-5">
            {error && (
              <div className="quiz-alert" role="alert">
                <span className="quiz-alert-icon"><BrainCircuit size={18} aria-hidden="true" /></span>
                <span>{error}</span>
              </div>
            )}

            <FormSection title="Phạm vi câu hỏi" description="Bạn muốn ôn tập theo nhóm kiến thức nào?">
              <div className="quiz-selection-grid">
                {SCOPE_OPTIONS.map(option => (
                  <QuizSelectionCard
                    key={option.value}
                    title={option.label}
                    description={option.description}
                    icon={option.icon}
                    selected={sourceMode === option.value}
                    onClick={() => setSourceMode(option.value)}
                  />
                ))}
              </div>

              <div className="mt-4">
                {sourceMode === 'grade' && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {(['all', 10, 11, 12] as QuizGrade[]).map(value => (
                      <QuizSelectionCard
                        key={value}
                        title={value === 'all' ? 'Tất cả' : `Lớp ${value}`}
                        selected={grade === value}
                        onClick={() => setGrade(value)}
                        compact
                      />
                    ))}
                  </div>
                )}
                {(sourceMode === 'topic' || sourceMode === 'event') && (
                  <MuseumSelect
                    value={selectedTopic}
                    options={TOPIC_OPTIONS}
                    onValueChange={setSelectedTopic}
                    label={sourceMode === 'event' ? 'Chọn sự kiện' : 'Chọn chủ đề'}
                  />
                )}
                {sourceMode === 'period' && (
                  <MuseumSelect
                    value={selectedPeriod}
                    options={PERIOD_OPTIONS}
                    onValueChange={setSelectedPeriod}
                    label="Chọn giai đoạn lịch sử"
                  />
                )}
              </div>
            </FormSection>

            <div className="grid gap-5 lg:grid-cols-2">
              <FormSection title="Số lượng câu hỏi" description="Chọn quy mô bài luyện tập của bạn.">
                <div className="flex flex-wrap gap-2">
                  {PRESET_COUNTS.map(value => (
                    <button
                      key={value}
                      type="button"
                      className={`quiz-count-button ${questionCount === value ? 'quiz-count-button-selected' : ''}`}
                      onClick={() => setQuestionCount(value)}
                    >
                      {value} câu
                    </button>
                  ))}
                  <label className="quiz-number-input">
                    <span className="sr-only">Số câu tùy chỉnh</span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={typeof questionCount === 'string' ? questionCount : ''}
                      onChange={event => setQuestionCount(event.target.value)}
                      placeholder="Khác"
                    />
                  </label>
                </div>
              </FormSection>

              <FormSection title="Mức độ nhận thức" description="Chọn yêu cầu tư duy phù hợp với mục tiêu luyện tập.">
                <div className="grid grid-cols-2 gap-2">
                  {COGNITIVE_OPTIONS.map(({ value, label }) => (
                    <QuizSelectionCard
                      key={value}
                      title={label}
                      selected={cognitiveLevel === value}
                      onClick={() => setCognitiveLevel(value)}
                      compact
                    />
                  ))}
                </div>
              </FormSection>
            </div>
          </div>

          <aside className="quiz-config-sidebar">
            <section className="quiz-form-section">
              <div className="flex items-center gap-3">
                <span className="quiz-preview-icon"><Settings2 size={20} aria-hidden="true" /></span>
                <div>
                  <p className="public-eyebrow">Cấu hình hiện tại</p>
                  <h2 className="serif-heading text-2xl font-bold">Bài luyện tập của bạn</h2>
                </div>
              </div>
              <dl className="quiz-config-list">
                <div><dt>Phạm vi</dt><dd>{scopeLabel}</dd></div>
                <div><dt>Nội dung</dt><dd>{detailLabel}</dd></div>
                <div><dt>Số câu</dt><dd>{count}</dd></div>
                <div><dt>Mức độ</dt><dd>{cognitiveLabel}</dd></div>
                <div><dt>Thời gian</dt><dd>15 phút</dd></div>
              </dl>
              <button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={isGenerating}
                className="public-primary-button mt-5 w-full"
              >
                <BrainCircuit size={17} aria-hidden="true" />
                Tạo bài trắc nghiệm
              </button>
            </section>

          </aside>
        </div>
      </main>
      {isGenerating && <QuizGenerationLoading />}
    </div>
  );
}
