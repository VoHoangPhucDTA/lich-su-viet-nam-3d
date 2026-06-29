import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  buildCustomExamPreview,
  buildCustomQuestionSnapshots,
  getAllTopicIndexRefs,
  getSourceExamIds,
  pickCustomQuestionRefs,
  type CustomCognitiveLevelFilter,
  type CustomDifficultyFilter,
  type CustomQuestionTypeFilter,
} from '@/lib/exam/customExamBuilder';
import { createCustomSession, saveCustomSession } from '@/lib/exam/customSessionStorage';
import {
  formatCognitiveLevelLabel,
  formatDifficultyLabel,
  formatQuestionTypeLabel,
} from '@/lib/exam/displayLabels';
import { loadExams } from '@/lib/exam/examLoader';
import { loadTopicIndex } from '@/lib/exam/topicIndexLoader';
import {
  buildPeriodSummaries,
  buildTopicSummaries,
  type TopicSummary,
} from '@/lib/exam/topicGrouping';
import type { TopicIndex, TopicIndexEntry } from '@/types/exam';
import type { CustomExamConfig } from '@/types/exam';

type ScopeMode = 'all' | 'topic' | 'period';
type TimeOption = 0 | 15 | 30 | 50;
type PracticeMode = 'practice' | 'mock';

const pageStyle: CSSProperties = {
  minHeight: '100vh',
  background: 'var(--bg-app)',
  color: 'var(--text-primary)',
  padding: '2.5rem 1.5rem',
};

const cardStyle: CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: '1rem',
  padding: '1.25rem',
};

const fieldLabelStyle: CSSProperties = {
  display: 'block',
  marginBottom: '0.5rem',
  color: 'var(--text-primary)',
  fontSize: '0.9rem',
  fontWeight: 900,
};

const hintStyle: CSSProperties = {
  margin: '0.35rem 0 0',
  color: 'var(--text-muted)',
  fontSize: '0.82rem',
  lineHeight: 1.5,
};

function optionButtonStyle(active: boolean): CSSProperties {
  return {
    padding: '0.58rem 0.85rem',
    borderRadius: '0.75rem',
    border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    background: active ? 'var(--accent-soft)' : 'var(--bg-surface)',
    color: active ? 'var(--accent)' : 'var(--text-secondary)',
    fontSize: '0.85rem',
    fontWeight: 800,
    cursor: 'pointer',
  };
}

function selectStyle(): CSSProperties {
  return {
    width: '100%',
    padding: '0.72rem 0.85rem',
    borderRadius: '0.75rem',
    border: '1px solid var(--border)',
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    fontWeight: 700,
    outline: 'none',
  };
}

function FieldGroup({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section>
      <label style={fieldLabelStyle}>{title}</label>
      {children}
      {hint && <p style={hintStyle}>{hint}</p>}
    </section>
  );
}

function ButtonGroup<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem' }}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          onClick={() => onChange(option.value)}
          style={optionButtonStyle(value === option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function StatBox({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'accent' | 'warning' }) {
  const color = tone === 'accent' ? 'var(--accent)' : tone === 'warning' ? 'var(--warning)' : 'var(--text-primary)';
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '0.85rem', padding: '0.85rem 0.95rem' }}>
      <div style={{ color, fontSize: '1.35rem', fontWeight: 900, lineHeight: 1 }}>{value}</div>
      <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.3rem' }}>{label}</div>
    </div>
  );
}

function BreakdownRow({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
      <span>{label}</span>
      <strong style={{ color: 'var(--text-primary)' }}>{value}</strong>
    </div>
  );
}

function formatTime(value: TimeOption): string {
  return value === 0 ? 'Không giới hạn' : `${value} phút`;
}

function getRefsForScope(
  scopeMode: ScopeMode,
  allRefs: TopicIndexEntry[],
  topicSummaries: TopicSummary[],
  periodSummaries: TopicSummary[],
  selectedTopicSlug: string,
  selectedPeriodSlug: string
): TopicIndexEntry[] {
  if (scopeMode === 'topic') {
    return topicSummaries.find((summary) => summary.slug === selectedTopicSlug)?.refs ?? [];
  }
  if (scopeMode === 'period') {
    return periodSummaries.find((summary) => summary.slug === selectedPeriodSlug)?.refs ?? [];
  }
  return allRefs;
}

export default function ExamCustomCreatePage() {
  const navigate = useNavigate();
  const [topicIndex, setTopicIndex] = useState<TopicIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [questionCount, setQuestionCount] = useState<10 | 20 | 28>(28);
  const [questionType, setQuestionType] = useState<CustomQuestionTypeFilter>('all');
  const [difficulty, setDifficulty] = useState<CustomDifficultyFilter>('all');
  const [scopeMode, setScopeMode] = useState<ScopeMode>('all');
  const [selectedTopicSlug, setSelectedTopicSlug] = useState('');
  const [selectedPeriodSlug, setSelectedPeriodSlug] = useState('');
  const [cognitiveLevel, setCognitiveLevel] = useState<CustomCognitiveLevelFilter>('all');
  const [timeLimit, setTimeLimit] = useState<TimeOption>(0);
  const [practiceMode, setPracticeMode] = useState<PracticeMode>('practice');

  useEffect(() => {
    let alive = true;
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const index = await loadTopicIndex();
        if (!alive) return;
        setTopicIndex(index);
      } catch (err) {
        if (!alive) return;
        const detail = err instanceof Error ? err.message : 'Không rõ nguyên nhân.';
        setError(`Chưa tải được dữ liệu chủ đề. ${detail}`);
      } finally {
        if (alive) setLoading(false);
      }
    }
    void loadData();
    return () => {
      alive = false;
    };
  }, []);

  const topicSummaries = useMemo(() => (topicIndex ? buildTopicSummaries(topicIndex) : []), [topicIndex]);
  const periodSummaries = useMemo(() => (topicIndex ? buildPeriodSummaries(topicIndex) : []), [topicIndex]);
  const allRefs = useMemo(() => (topicIndex ? getAllTopicIndexRefs(topicIndex) : []), [topicIndex]);

  useEffect(() => {
    if (!selectedTopicSlug && topicSummaries.length > 0) setSelectedTopicSlug(topicSummaries[0].slug);
  }, [selectedTopicSlug, topicSummaries]);

  useEffect(() => {
    if (!selectedPeriodSlug && periodSummaries.length > 0) setSelectedPeriodSlug(periodSummaries[0].slug);
  }, [selectedPeriodSlug, periodSummaries]);

  const scopedRefs = useMemo(
    () => getRefsForScope(scopeMode, allRefs, topicSummaries, periodSummaries, selectedTopicSlug, selectedPeriodSlug),
    [allRefs, periodSummaries, scopeMode, selectedPeriodSlug, selectedTopicSlug, topicSummaries]
  );

  const preview = useMemo(
    () =>
      buildCustomExamPreview({
        questionCount,
        questionType,
        difficulty,
        cognitiveLevel,
        refs: scopedRefs,
      }),
    [cognitiveLevel, difficulty, questionCount, questionType, scopedRefs]
  );

  const selectedScopeTitle =
    scopeMode === 'topic'
      ? topicSummaries.find((summary) => summary.slug === selectedTopicSlug)?.title
      : scopeMode === 'period'
        ? periodSummaries.find((summary) => summary.slug === selectedPeriodSlug)?.title
        : 'Tất cả chủ đề và giai đoạn';

  const hasNotEnoughQuestions = preview.matchedCount < questionCount;
  const canStartSession = preview.matchedCount > 0 && !loading && !isStarting;

  async function handleStartCustomSession() {
    if (!canStartSession) return;

    setIsStarting(true);
    setStartError(null);
    try {
      const selectedRefs = pickCustomQuestionRefs(preview.refs, questionCount);
      const sourceExamIds = getSourceExamIds(selectedRefs);
      const exams = await loadExams(sourceExamIds);
      const questionSnapshots = buildCustomQuestionSnapshots(selectedRefs, exams);

      if (questionSnapshots.length === 0) {
        setStartError('Chưa tải được câu hỏi phù hợp. Hãy nới bộ lọc hoặc thử lại sau.');
        return;
      }

      const actualRefs = questionSnapshots.map((question) => ({
        examId: question.sourceExamId,
        questionId: question.originalQuestionId,
      }));
      const config: CustomExamConfig = {
        questionCount,
        questionType,
        difficulty,
        cognitiveLevel,
        scopeType: scopeMode,
        scopeSlug: scopeMode === 'topic' ? selectedTopicSlug : scopeMode === 'period' ? selectedPeriodSlug : undefined,
        scopeTitle: selectedScopeTitle,
        durationSeconds: timeLimit > 0 ? timeLimit * 60 : null,
        mode: practiceMode === 'mock' ? 'custom_mock' : 'custom_practice',
      };
      const session = createCustomSession({
        config,
        questionSnapshots,
        questionRefs: actualRefs,
        sourceExamIds: getSourceExamIds(actualRefs),
      });

      saveCustomSession(session);
      navigate(`/exams/tuy-chon/${session.sessionId}`);
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Không rõ nguyên nhân.';
      setStartError(`Chưa tạo được phiên luyện tập. ${detail}`);
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: '74rem', margin: '0 auto', display: 'grid', gap: '1.5rem' }}>
        <header style={{ display: 'grid', gap: '0.65rem' }}>
          <Link to="/exams" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.875rem' }}>
            ← Luyện thi
          </Link>
          <h1 style={{ margin: 0, fontSize: '1.9rem', fontWeight: 900, color: 'var(--text-primary)' }}>
            Tạo đề tùy chọn
          </h1>
          <p style={{ margin: 0, maxWidth: '44rem', color: 'var(--text-muted)', lineHeight: 1.65 }}>
            Chọn số câu, chủ đề, độ khó và thời gian để luyện đúng phần kiến thức bạn cần.
          </p>
        </header>

        {error && (
          <div style={{ ...cardStyle, borderColor: 'rgba(159,29,45,0.28)', background: 'rgba(159,29,45,0.08)', color: 'var(--danger)', lineHeight: 1.6 }}>
            {error}
          </div>
        )}

        {!error && (
          <div className="custom-exam-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(19rem, 0.8fr)', gap: '1.5rem', alignItems: 'start' }}>
            <div style={{ ...cardStyle, display: 'grid', gap: '1.35rem' }}>
              <FieldGroup title="Số câu">
                <ButtonGroup
                  value={questionCount}
                  onChange={(value) => setQuestionCount(value)}
                  options={[
                    { label: '10 câu', value: 10 },
                    { label: '20 câu', value: 20 },
                    { label: '28 câu', value: 28 },
                  ]}
                />
              </FieldGroup>

              <FieldGroup title="Dạng câu">
                <ButtonGroup
                  value={questionType}
                  onChange={setQuestionType}
                  options={[
                    { label: 'Tất cả', value: 'all' },
                    { label: formatQuestionTypeLabel('mcq'), value: 'mcq' },
                    { label: formatQuestionTypeLabel('true_false'), value: 'true_false' },
                  ]}
                />
              </FieldGroup>

              <FieldGroup title="Độ khó">
                <ButtonGroup
                  value={difficulty}
                  onChange={setDifficulty}
                  options={[
                    { label: 'Tất cả', value: 'all' },
                    { label: formatDifficultyLabel('easy'), value: 'easy' },
                    { label: formatDifficultyLabel('medium'), value: 'medium' },
                    { label: formatDifficultyLabel('hard'), value: 'hard' },
                  ]}
                />
              </FieldGroup>

              <FieldGroup title="Chủ đề / giai đoạn" hint={selectedScopeTitle ? `Đang chọn: ${selectedScopeTitle}` : undefined}>
                <ButtonGroup
                  value={scopeMode}
                  onChange={setScopeMode}
                  options={[
                    { label: 'Tất cả', value: 'all' },
                    { label: 'Một chủ đề', value: 'topic' },
                    { label: 'Một giai đoạn', value: 'period' },
                  ]}
                />

                {scopeMode === 'topic' && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <select
                      value={selectedTopicSlug}
                      onChange={(event) => setSelectedTopicSlug(event.target.value)}
                      style={selectStyle()}
                      disabled={topicSummaries.length === 0}
                    >
                      {topicSummaries.map((summary) => (
                        <option key={summary.slug} value={summary.slug}>
                          {summary.title} ({summary.total} câu)
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {scopeMode === 'period' && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <select
                      value={selectedPeriodSlug}
                      onChange={(event) => setSelectedPeriodSlug(event.target.value)}
                      style={selectStyle()}
                      disabled={periodSummaries.length === 0}
                    >
                      {periodSummaries.map((summary) => (
                        <option key={summary.slug} value={summary.slug}>
                          {summary.title} ({summary.total} câu)
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </FieldGroup>

              <FieldGroup title="Mức độ nhận thức">
                <ButtonGroup
                  value={cognitiveLevel}
                  onChange={setCognitiveLevel}
                  options={[
                    { label: 'Tất cả', value: 'all' },
                    { label: formatCognitiveLevelLabel('knowledge'), value: 'knowledge' },
                    { label: formatCognitiveLevelLabel('comprehension'), value: 'comprehension' },
                    { label: formatCognitiveLevelLabel('application'), value: 'application' },
                  ]}
                />
              </FieldGroup>

              <FieldGroup title="Thời gian">
                <ButtonGroup
                  value={timeLimit}
                  onChange={setTimeLimit}
                  options={[
                    { label: 'Không giới hạn', value: 0 },
                    { label: '15 phút', value: 15 },
                    { label: '30 phút', value: 30 },
                    { label: '50 phút', value: 50 },
                  ]}
                />
              </FieldGroup>

              <FieldGroup title="Chế độ luyện">
                <ButtonGroup
                  value={practiceMode}
                  onChange={setPracticeMode}
                  options={[
                    { label: 'Luyện tập', value: 'practice' },
                    { label: 'Thi thử tùy chọn', value: 'mock' },
                  ]}
                />
              </FieldGroup>
            </div>

            <aside className="custom-exam-preview" style={{ ...cardStyle, position: 'sticky', top: '1rem', display: 'grid', gap: '1rem' }}>
              <div>
                <h2 style={{ margin: '0 0 0.35rem', fontSize: '1.1rem', fontWeight: 900 }}>Xem trước cấu hình</h2>
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.55 }}>
                  Preview tự cập nhật theo bộ lọc. Bước này chưa tạo phiên làm bài.
                </p>
              </div>

              {loading ? (
                <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Đang tải dữ liệu chủ đề...
                </div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <StatBox label="Câu phù hợp" value={`${preview.matchedCount}`} tone={preview.matchedCount === 0 ? 'warning' : 'accent'} />
                    <StatBox label="Sẽ lấy" value={`${preview.takeCount}/${questionCount}`} tone={hasNotEnoughQuestions ? 'warning' : 'default'} />
                  </div>

                  {hasNotEnoughQuestions && (
                    <div style={{ border: '1px solid rgba(194,155,75,0.34)', background: 'rgba(194,155,75,0.12)', borderRadius: '0.85rem', padding: '0.85rem 0.95rem', color: 'var(--text-secondary)', lineHeight: 1.55, fontSize: '0.86rem' }}>
                      Bộ lọc hiện chỉ tìm thấy {preview.matchedCount} câu. Hãy chọn thêm chủ đề hoặc bỏ bớt bộ lọc.
                    </div>
                  )}

                  {preview.matchedCount === 0 && (
                    <div style={{ border: '1px solid rgba(159,29,45,0.24)', background: 'rgba(159,29,45,0.08)', borderRadius: '0.85rem', padding: '0.85rem 0.95rem', color: 'var(--danger)', lineHeight: 1.55, fontSize: '0.86rem' }}>
                      Chưa có câu phù hợp với cấu hình này.
                    </div>
                  )}

                  {startError && (
                    <div style={{ border: '1px solid rgba(159,29,45,0.24)', background: 'rgba(159,29,45,0.08)', borderRadius: '0.85rem', padding: '0.85rem 0.95rem', color: 'var(--danger)', lineHeight: 1.55, fontSize: '0.86rem' }}>
                      {startError}
                    </div>
                  )}

                  <div style={{ display: 'grid', gap: '0.55rem' }}>
                    <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 900 }}>Phân bố dạng câu</h3>
                    <BreakdownRow label={formatQuestionTypeLabel('mcq')} value={preview.breakdown.questionType.mcq} />
                    <BreakdownRow label={formatQuestionTypeLabel('true_false')} value={preview.breakdown.questionType.true_false} />
                  </div>

                  <div style={{ display: 'grid', gap: '0.55rem' }}>
                    <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 900 }}>Phân bố độ khó</h3>
                    <BreakdownRow label={formatDifficultyLabel('easy')} value={preview.breakdown.difficulty.easy} />
                    <BreakdownRow label={formatDifficultyLabel('medium')} value={preview.breakdown.difficulty.medium} />
                    <BreakdownRow label={formatDifficultyLabel('hard')} value={preview.breakdown.difficulty.hard} />
                  </div>

                  <div style={{ display: 'grid', gap: '0.55rem' }}>
                    <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 900 }}>Phân bố mức độ</h3>
                    <BreakdownRow label={formatCognitiveLevelLabel('knowledge')} value={preview.breakdown.cognitiveLevel.knowledge} />
                    <BreakdownRow label={formatCognitiveLevelLabel('comprehension')} value={preview.breakdown.cognitiveLevel.comprehension} />
                    <BreakdownRow label={formatCognitiveLevelLabel('application')} value={preview.breakdown.cognitiveLevel.application} />
                  </div>

                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', display: 'grid', gap: '0.45rem', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                      <span>Thời gian</span>
                      <strong style={{ color: 'var(--text-primary)' }}>{formatTime(timeLimit)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                      <span>Chế độ</span>
                      <strong style={{ color: 'var(--text-primary)' }}>{practiceMode === 'practice' ? 'Luyện tập' : 'Thi thử tùy chọn'}</strong>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={!canStartSession}
                    onClick={handleStartCustomSession}
                    style={{
                      padding: '0.78rem 1rem',
                      borderRadius: '0.85rem',
                      border: canStartSession ? '1px solid var(--accent)' : '1px solid var(--border)',
                      background: canStartSession ? 'var(--accent)' : 'var(--bg-surface)',
                      color: canStartSession ? '#fff' : 'var(--text-muted)',
                      fontWeight: 900,
                      cursor: canStartSession ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {isStarting ? 'Đang tạo đề...' : practiceMode === 'practice' ? 'Bắt đầu luyện tập' : 'Bắt đầu thi thử'}
                  </button>
                  {practiceMode === 'mock' ? (
                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.5 }}>
                      Phiên thi thử không hiển thị đúng/sai trước khi nộp. Nếu chọn thời gian, hết giờ sẽ tự nộp bài.
                    </p>
                  ) : preview.matchedCount === 0 ? (
                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.5 }}>
                      Hãy nới bộ lọc để có câu phù hợp trước khi bắt đầu.
                    </p>
                  ) : hasNotEnoughQuestions ? (
                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.5 }}>
                      Có thể bắt đầu với {preview.takeCount} câu hiện có, hoặc nới bộ lọc để đủ {questionCount} câu.
                    </p>
                  ) : (
                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.5 }}>
                      Phiên luyện tập sẽ chỉ lưu trên trình duyệt này và chưa ghi vào lịch sử luyện thi.
                    </p>
                  )}
                </>
              )}
            </aside>
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 900px) {
          .custom-exam-layout {
            grid-template-columns: 1fr !important;
          }
          .custom-exam-preview {
            position: static !important;
          }
        }
      `}</style>
    </div>
  );
}
