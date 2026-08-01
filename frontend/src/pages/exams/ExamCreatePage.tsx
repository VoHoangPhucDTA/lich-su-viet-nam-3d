/**
 * ExamCreatePage – Form configuration for creating a new THPT exam.
 */

import { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import * as examService from '../../services/examService';
import type { ExamConfig, ExamMode, ExamDifficulty } from '../../types/exam';

import ExamPresetCards from '../../components/exams/ExamPresetCards';
import ExamCreateForm from '../../components/exams/ExamCreateForm';
import ExamConfigPreview from '../../components/exams/ExamConfigPreview';
import ExamGenerationLoading from '../../components/exams/ExamGenerationLoading';

interface PresetConfig {
  mode: ExamMode;
  gradeScope: (10 | 11 | 12 | 'all')[];
  questionCount: number;
  difficulty: ExamDifficulty;
  topicMode: 'all' | 'specific';
  timeLimitMinutes: number;
}

function getPresetConfig(presetName: string | null): PresetConfig {
  if (presetName === 'fast') {
    return {
      mode: 'practice',
      gradeScope: ['all'],
      questionCount: 10,
      difficulty: 'mixed',
      topicMode: 'all',
      timeLimitMinutes: 10,
    };
  }
  if (presetName === 'mock') {
    return {
      mode: 'thpt_mock',
      gradeScope: ['all'],
      questionCount: 40,
      difficulty: 'mixed',
      topicMode: 'all',
      timeLimitMinutes: 50,
    };
  }
  if (presetName === 'weakness') {
    return {
      mode: 'custom',
      gradeScope: ['all'],
      questionCount: 20,
      difficulty: 'medium',
      topicMode: 'specific',
      timeLimitMinutes: 30,
    };
  }
  if (presetName === 'grade12') {
    return {
      mode: 'practice',
      gradeScope: [12],
      questionCount: 30,
      difficulty: 'hard',
      topicMode: 'all',
      timeLimitMinutes: 45,
    };
  }
  return {
    mode: 'practice',
    gradeScope: ['all'],
    questionCount: 20,
    difficulty: 'medium',
    topicMode: 'all',
    timeLimitMinutes: 30,
  };
}

export default function ExamCreatePage() {
  const [searchParams] = useSearchParams();
  const initialPreset = searchParams.get('preset');

  return (
    <ExamCreatePageContent
      key={initialPreset ?? 'default'}
      initialPreset={initialPreset}
    />
  );
}

function ExamCreatePageContent({
  initialPreset,
}: {
  initialPreset: string | null;
}) {
  const navigate = useNavigate();
  const initialConfig = getPresetConfig(initialPreset);

  const [loading, setLoading] = useState(false);

  // Form states
  const [mode, setMode] = useState<ExamMode>(initialConfig.mode);
  const [gradeScope, setGradeScope] = useState<(10 | 11 | 12 | 'all')[]>(
    initialConfig.gradeScope,
  );
  const [questionCount, setQuestionCount] = useState<number>(
    initialConfig.questionCount,
  );
  const [customCount, setCustomCount] = useState('');
  const [difficulty, setDifficulty] = useState<ExamDifficulty>(
    initialConfig.difficulty,
  );
  const [topicMode, setTopicMode] = useState<'all' | 'specific'>(
    initialConfig.topicMode,
  );
  const [selectedTopic, setSelectedTopic] = useState('Kháng chiến chống Mỹ'); 
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number>(
    initialConfig.timeLimitMinutes,
  );
  const [customTime, setCustomTime] = useState('');
  
  // Options
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleOptions, setShuffleOptions] = useState(true);

  // Apply Presets
  const applyPreset = (presetName: string) => {
    const preset = getPresetConfig(presetName);
    setMode(preset.mode);
    setGradeScope(preset.gradeScope);
    setQuestionCount(preset.questionCount);
    setDifficulty(preset.difficulty);
    setTopicMode(preset.topicMode);
    setTimeLimitMinutes(preset.timeLimitMinutes);
  };

  const handleCreate = async () => {
    setLoading(true);
    try {
      const finalCount = questionCount === -1 ? parseInt(customCount) || 10 : questionCount;
      const finalTime = timeLimitMinutes === -1 ? parseInt(customTime) || 15 : timeLimitMinutes;

      const config: ExamConfig = {
        title: mode === 'thpt_mock' ? 'Kỳ thi THPT Quốc Gia (Mô phỏng)' : mode === 'practice' ? 'Đề luyện tập Lịch Sử' : 'Đề kiểm tra tùy chỉnh',
        mode,
        gradeScope,
        questionCount: finalCount,
        difficulty,
        timeLimitMinutes: finalTime,
        topics: topicMode === 'specific' ? [selectedTopic] : undefined,
        shuffleQuestions,
        shuffleOptions
      };
      
      const session = await examService.createExam(config);
      navigate(`/exams/de/${session.examId}`);
    } catch {
      alert('Có lỗi tạo đề thi. Vui lòng thử lại.');
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>
      
      {/* ── Topbar ── */}
      <header style={{ height: '3.5rem', background: 'var(--bg-app)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 1.5rem', position: 'sticky', top: 0, zIndex: 10 }}>
        <Link to="/exams" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.85rem' }}>← Thoát</Link>
        <span style={{ marginLeft: '1rem', fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>Khởi tạo đề thi</span>
      </header>

      {/* ── Main Layout ── */}
      <main style={{ maxWidth: '80rem', margin: '0 auto', padding: '2rem 1.5rem', display: 'flex', gap: '2rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          
         {/* Form Left Side */}
         <div style={{ flex: '1 1 500px', display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
             
             {/* Presets */}
             <ExamPresetCards onApplyPreset={applyPreset} />

             <hr style={{ border: 'none', borderTop: '1px solid var(--border)' }} />

             {/* Main Configuration Form Component */}
             <ExamCreateForm 
               mode={mode} setMode={setMode}
               gradeScope={gradeScope} setGradeScope={setGradeScope}
               topicMode={topicMode} setTopicMode={setTopicMode}
               selectedTopic={selectedTopic} setSelectedTopic={setSelectedTopic}
               questionCount={questionCount} setQuestionCount={setQuestionCount}
               customCount={customCount} setCustomCount={setCustomCount}
               timeLimitMinutes={timeLimitMinutes} setTimeLimitMinutes={setTimeLimitMinutes}
               customTime={customTime} setCustomTime={setCustomTime}
               difficulty={difficulty} setDifficulty={setDifficulty}
               shuffleQuestions={shuffleQuestions} setShuffleQuestions={setShuffleQuestions}
               shuffleOptions={shuffleOptions} setShuffleOptions={setShuffleOptions}
             />
         </div>

         {/* Right Sidebar: Preview Panel */}
         <div style={{ flex: '0 0 350px', position: 'sticky', top: '5.5rem' }}>
             <ExamConfigPreview 
               mode={mode}
               questionCount={questionCount} customCount={customCount}
               timeLimitMinutes={timeLimitMinutes} customTime={customTime}
               difficulty={difficulty}
               topicMode={topicMode} selectedTopic={selectedTopic}
               loading={loading} onConfirm={handleCreate}
             />
         </div>
      </main>

      {/* Loading Overlay */}
      {loading && <ExamGenerationLoading />}
    </div>
  );
}
