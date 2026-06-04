import type { ExamMode, ExamDifficulty } from '../../types/exam';
import ExamModeSelector, { SelectionCard } from './ExamModeSelector';

export function SectionHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 0.25rem 0', color: 'var(--text-primary)' }}>{title}</h2>
      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>{desc}</p>
    </div>
  );
}

interface FormProps {
  mode: ExamMode;
  setMode: (v: ExamMode) => void;
  gradeScope: (10 | 11 | 12 | 'all')[];
  setGradeScope: (v: (10 | 11 | 12 | 'all')[]) => void;
  topicMode: 'all' | 'specific';
  setTopicMode: (v: 'all' | 'specific') => void;
  selectedTopic: string;
  setSelectedTopic: (v: string) => void;
  questionCount: number;
  setQuestionCount: (v: number) => void;
  customCount: string;
  setCustomCount: (v: string) => void;
  timeLimitMinutes: number;
  setTimeLimitMinutes: (v: number) => void;
  customTime: string;
  setCustomTime: (v: string) => void;
  difficulty: ExamDifficulty;
  setDifficulty: (v: ExamDifficulty) => void;
  shuffleQuestions: boolean;
  setShuffleQuestions: (v: boolean) => void;
  shuffleOptions: boolean;
  setShuffleOptions: (v: boolean) => void;
}

const MOCK_TOPICS = ['Cách mạng tháng Tám', 'Kháng chiến chống Pháp', 'Kháng chiến chống Mỹ', 'Đổi mới', 'Trật tự thế giới sau Chiến tranh lạnh', 'Văn minh Đại Việt'];

export default function ExamCreateForm(props: FormProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
        {/* A. Chế độ đề */}
        <ExamModeSelector mode={props.mode} setMode={props.setMode} />

        {/* B. Phạm vi lớp */}
        <section>
            <SectionHeader title="B. Phạm vi lớp" desc="Chọn các lớp kiến thức sẽ xuất hiện" />
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <SelectionCard label="Tổng hợp 10-12" selected={props.gradeScope.includes('all')} onClick={() => props.setGradeScope(['all'])} />
                <SelectionCard label="Lớp 12" selected={props.gradeScope.includes(12) && !props.gradeScope.includes('all')} onClick={() => props.setGradeScope([12])} />
                <SelectionCard label="Lớp 11" selected={props.gradeScope.includes(11) && !props.gradeScope.includes('all')} onClick={() => props.setGradeScope([11])} />
                <SelectionCard label="Lớp 10" selected={props.gradeScope.includes(10) && !props.gradeScope.includes('all')} onClick={() => props.setGradeScope([10])} />
            </div>
        </section>

        {/* C. Chủ đề / Giai đoạn */}
        <section>
            <SectionHeader title="C. Chủ đề / Giai đoạn" desc="Hệ thống sẽ bốc câu hỏi theo phạm vi bạn chỉ định" />
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <SelectionCard label="Trộn toàn bộ" selected={props.topicMode === 'all'} onClick={() => props.setTopicMode('all')} />
              <SelectionCard label="Chỉ định chủ đề cụ thể" selected={props.topicMode === 'specific'} onClick={() => props.setTopicMode('specific')} />
            </div>
            {props.topicMode === 'specific' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {MOCK_TOPICS.map(t => (
                        <button key={t} onClick={() => props.setSelectedTopic(t)} style={{ padding: '0.4rem 0.8rem', borderRadius: '2rem', border: props.selectedTopic === t ? '1px solid var(--accent)' : '1px solid var(--border)', background: props.selectedTopic === t ? 'var(--accent-soft)' : 'var(--bg-surface)', color: props.selectedTopic === t ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem' }}>{t}</button>
                    ))}
                </div>
            )}
        </section>

        {/* D & E. Count & Time */}
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
            <section style={{ flex: 1 }}>
                <SectionHeader title="D. Số câu hỏi" desc="Số lượng câu cho đề thi" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    {[10, 20, 30, 40].map(c => (
                        <SelectionCard key={c} label={`${c} câu`} selected={props.questionCount === c} onClick={() => props.setQuestionCount(c)} />
                    ))}
                    <SelectionCard label="Tự chọn" selected={props.questionCount === -1} onClick={() => props.setQuestionCount(-1)} />
                </div>
                {props.questionCount === -1 && (
                    <input type="number" placeholder="Nhập số câu (vd: 15)" value={props.customCount} onChange={e => props.setCustomCount(e.target.value)} style={{ marginTop: '0.5rem', width: '100%', padding: '0.75rem', borderRadius: '0.5rem', background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', outline: 'none' }} min={1} max={120} />
                )}
            </section>

            <section style={{ flex: 1 }}>
                <SectionHeader title="E. Thời gian làm bài" desc="Giới hạn thời gian (Phút)" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    {[10, 15, 30, 50].map(t => (
                        <SelectionCard key={t} label={`${t} phút`} selected={props.timeLimitMinutes === t} onClick={() => props.setTimeLimitMinutes(t)} />
                    ))}
                    <SelectionCard label="Tự chọn" selected={props.timeLimitMinutes === -1} onClick={() => props.setTimeLimitMinutes(-1)} />
                </div>
                {props.timeLimitMinutes === -1 && (
                    <input type="number" placeholder="Phút (vd: 45)" value={props.customTime} onChange={e => props.setCustomTime(e.target.value)} style={{ marginTop: '0.5rem', width: '100%', padding: '0.75rem', borderRadius: '0.5rem', background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', outline: 'none' }} min={1} max={180} />
                )}
            </section>
        </div>

        {/* F & G & H. Difficulty & Options */}
        <section>
            <SectionHeader title="F. Tuỳ chọn độ khó & Bổ sung" desc="Cấu trúc nâng cao" />
            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Độ khó:</div>
                    <select value={props.difficulty} onChange={e => props.setDifficulty(e.target.value as ExamDifficulty)} style={{ padding: '0.75rem 1rem', borderRadius: '0.5rem', background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', outline: 'none', width: '200px' }}>
                        <option value="easy" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>Dễ (Nhận biết)</option>
                        <option value="medium" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>Trung bình (Thông hiểu)</option>
                        <option value="hard" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>Khó (Vận dụng)</option>
                        <option value="mixed" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>Trộn hoàn toàn</option>
                    </select>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1.5rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={props.shuffleQuestions} onChange={e => props.setShuffleQuestions(e.target.checked)} style={{ width: '1.2rem', height: '1.2rem', accentColor: 'var(--accent)' }} /> Xáo trộn thứ tự câu hỏi
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={props.shuffleOptions} onChange={e => props.setShuffleOptions(e.target.checked)} style={{ width: '1.2rem', height: '1.2rem', accentColor: 'var(--accent)' }} /> Xáo trộn các lựa chọn A/B/C/D
                    </label>
                </div>
            </div>
        </section>
    </div>
  );
}
