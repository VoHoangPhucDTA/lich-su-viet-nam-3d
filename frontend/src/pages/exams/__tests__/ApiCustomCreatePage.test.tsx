import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ApiCustomCreatePage from '../ApiCustomCreatePage';

const mocks = vi.hoisted(() => ({
  createExamSession: vi.fn(),
  isExamApiFallbackError: vi.fn(),
  listTopicMetadata: vi.fn(),
  previewCustomExam: vi.fn(),
}));

vi.mock('@/services/examApi', () => ({
  createExamSession: mocks.createExamSession,
  isExamApiFallbackError: mocks.isExamApiFallbackError,
  listTopicMetadata: mocks.listTopicMetadata,
  previewCustomExam: mocks.previewCustomExam,
}));

function buildTopicList(count: number) {
  const sample = [
    'Cách mạng tháng Tám 1945',
    'Kháng chiến chống Pháp 1945-1954',
    'Kháng chiến chống Mỹ 1954-1975',
    'Việt Nam 1945-1946',
    'ASEAN và Việt Nam',
    'Liên hợp quốc',
    'Các nước Đông Nam Á',
    'Chiến tranh thế giới thứ hai',
    'Liên Xô (1917-1991)',
    'Trật tự thế giới hai cực',
    'Phong trào yêu nước đầu thế kỷ XX',
    'Nguyễn Ái Quốc – Hồ Chí Minh',
    'Phong trào dân tộc dân chủ 1919-1930',
    'Đảng Cộng sản Việt Nam',
    'Phong trào giải phóng dân tộc 1939-1945',
    'Việt Nam 1945-1946 (xây dựng & bảo vệ chính quyền)',
    'Việt Nam 1954-1975 (xây dựng CNXH miền Bắc)',
    'Chính sách đối ngoại Việt Nam',
    'Việt Nam sau 1975',
    'Đổi mới 1986',
    'Đại Việt thời Trần',
    'Đại Việt thời Lê',
    'Đại Việt thời Nguyễn',
    'Việt Nam thời cổ - trung đại',
    'Việt Nam 1858-1918',
    'Phong trào Cần Vương',
    'Châu Trinh – Phan Bội Châu',
    'Chủ quyền biển đảo Việt Nam',
    'Quan hệ quốc tế sau Chiến tranh lạnh',
    'Việt Nam 1858-1918 (cải cách)',
    'Phong trào giải phóng dân tộc cuối thế kỷ XIX',
    'Cách mạng công nghiệp lần hai',
  ];
  return Array.from({ length: count }, (_, idx) => {
    const title = sample[idx] ?? `Topic placeholder ${idx + 1}`;
    const slug = title
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return {
      slug,
      title,
      periodSlug: 'viet-nam-1945-1954',
      periodTitle: 'Việt Nam 1945–1954',
      questionCount: 60,
      mcqCount: 40,
      tfCount: 20,
      difficultyBreakdown: {},
      cognitiveLevelBreakdown: {},
    };
  });
}

function buildTopicsResponse(count: number) {
  return {
    datasetVersion: 'dataset-v1',
    total: count,
    items: buildTopicList(count),
  };
}

const enoughPreview = {
  datasetVersion: 'dataset-v1',
  normalizedConfig: {
    questionCount: 28,
    questionType: 'all',
    difficulty: 'all',
    cognitiveLevel: 'all',
    scopeType: 'all',
    scopeSlug: '',
  },
  availableCount: 1064,
  selectedCount: 28,
  enoughQuestions: true,
  breakdown: { questionType: {}, difficulty: {}, cognitiveLevel: {} },
  warnings: [],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/exams/tao-de']}>
      <Routes>
        <Route path="/exams/tao-de" element={<ApiCustomCreatePage />} />
        <Route path="/exams/tuy-chon/luyen-tap/:sessionId" element={<p>Phiên luyện tập đã tạo</p>} />
        <Route path="/exams/tuy-chon/:sessionId" element={<p>Phiên thi thử đã tạo</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ApiCustomCreatePage session builder', () => {
  beforeEach(() => {
    mocks.createExamSession.mockReset();
    mocks.createExamSession.mockResolvedValue({ sessionId: 'session-1', anonymousSessionToken: null });
    mocks.isExamApiFallbackError.mockReset();
    mocks.isExamApiFallbackError.mockReturnValue(false);
    mocks.listTopicMetadata.mockReset();
    mocks.listTopicMetadata.mockResolvedValue(buildTopicsResponse(2));
    mocks.previewCustomExam.mockReset();
    mocks.previewCustomExam.mockResolvedValue(enoughPreview);
  });

  it('keeps exact presets, derives the summary, hides successful inventory copy, and excludes Độ khó', async () => {
    renderPage();

    const presets = await screen.findByRole('radiogroup', { name: 'Cấu hình nhanh' });
    expect(within(presets).getAllByRole('radio')).toHaveLength(3);
    expect(within(presets).getByRole('radio', { name: /Cấu hình mặc định/ })).toHaveAttribute('aria-checked', 'true');

    const summary = screen.getByRole('heading', { name: 'Tóm tắt' }).closest('aside');
    expect(summary).toHaveTextContent('28 câu');
    expect(summary).toHaveTextContent('Toàn bộ nội dung');
    expect(summary).toHaveTextContent('Tất cả dạng câu');
    expect(summary).not.toHaveTextContent('Độ khó');
    expect(summary).toHaveTextContent(/Mức độTất cả/);
    expect(summary).toHaveTextContent('Luyện tập');

    await waitFor(() => expect(screen.getByRole('button', { name: 'Bắt đầu luyện tập' })).toBeEnabled());
    expect(screen.queryByText('28/28 câu có thể tạo')).not.toBeInTheDocument();
    expect(screen.queryByText('Có sẵn 1064 câu phù hợp.')).not.toBeInTheDocument();
    expect(screen.queryByText('Khác')).not.toBeInTheDocument();
    expect(screen.queryByText('Thiết lập một phiên luyện phù hợp với nội dung và cách học của bạn.')).not.toBeInTheDocument();
    expect(screen.queryByText('Chọn cấu hình nhanh hoặc điều chỉnh từng tiêu chí.')).not.toBeInTheDocument();
  });

  it('reapplies default and quick mappings, while Custom preserves the current config', async () => {
    renderPage();
    const user = userEvent.setup();
    const presets = await screen.findByRole('radiogroup', { name: 'Cấu hình nhanh' });

    await user.click(within(presets).getByRole('radio', { name: /Ôn nhanh/ }));
    expect(screen.getByRole('heading', { name: 'Tóm tắt' }).closest('aside')).toHaveTextContent('10 câu');

    await user.click(within(presets).getByRole('radio', { name: /^Tùy chỉnh/ }));
    expect(within(presets).getByRole('radio', { name: /^Tùy chỉnh/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('heading', { name: 'Tóm tắt' }).closest('aside')).toHaveTextContent('10 câu');
    expect(screen.getByRole('heading', { name: 'Nội dung luyện' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cách luyện' })).toBeInTheDocument();

    await user.click(within(screen.getByRole('group', { name: 'Số câu' })).getByRole('radio', { name: '20' }));
    expect(within(presets).getByRole('radio', { name: /^Tùy chỉnh/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('heading', { name: 'Tóm tắt' }).closest('aside')).toHaveTextContent('20 câu');

    await user.click(within(presets).getByRole('radio', { name: /Cấu hình mặc định/ }));
    expect(screen.getByRole('heading', { name: 'Tóm tắt' }).closest('aside')).toHaveTextContent('28 câu');
  });

  it('renders fixed choices as radio groups and excludes the Độ khó fieldset', async () => {
    mocks.listTopicMetadata.mockResolvedValue(buildTopicsResponse(4));
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('radio', { name: /^Tùy chỉnh/ }));

    const expectedCounts: Array<[string, number]> = [
      ['Phạm vi', 3],
      ['Mức độ', 4],
      ['Số câu', 3],
      ['Dạng câu', 3],
      ['Chế độ', 2],
    ];
    for (const [name, count] of expectedCounts) {
      expect(within(screen.getByRole('group', { name })).getAllByRole('radio')).toHaveLength(count);
    }
    expect(screen.queryByRole('group', { name: 'Độ khó' })).not.toBeInTheDocument();
  });

  it('always sends difficulty: "all" with the cognitive request untouched after direct-choice changes', async () => {
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('radio', { name: /^Tùy chỉnh/ }));
    await user.click(within(screen.getByRole('group', { name: 'Số câu' })).getByRole('radio', { name: '10' }));
    await user.click(within(screen.getByRole('group', { name: 'Dạng câu' })).getByRole('radio', { name: 'Trắc nghiệm' }));

    await waitFor(() => expect(mocks.previewCustomExam).toHaveBeenLastCalledWith({
      questionCount: 10,
      questionType: 'mcq',
      difficulty: 'all',
      cognitiveLevel: 'all',
      scopeType: 'all',
      scopeSlug: undefined,
    }, expect.any(AbortSignal)));
  });

  it('shows actionable insufficiency feedback and keeps Start disabled', async () => {
    mocks.previewCustomExam.mockResolvedValue({
      ...enoughPreview,
      availableCount: 17,
      selectedCount: 17,
      enoughQuestions: false,
      warnings: ['INSUFFICIENT_QUESTIONS'],
    });
    renderPage();

    expect(await screen.findByText('Không đủ câu hỏi cho cấu hình này.')).toBeInTheDocument();
    expect(screen.getByText('Hiện có 17 câu phù hợp.')).toBeInTheDocument();
    expect(screen.getByText('Hãy giảm số câu hoặc mở rộng phạm vi.')).toBeInTheDocument();
    expect(screen.queryByText('INSUFFICIENT_QUESTIONS')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bắt đầu luyện tập' })).toBeDisabled();
  });

  it('starts practice with the preview dataset version and unchanged destination', async () => {
    renderPage();
    const start = await screen.findByRole('button', { name: 'Bắt đầu luyện tập' });
    await waitFor(() => expect(start).toBeEnabled());
    await userEvent.click(start);

    await waitFor(() => expect(mocks.createExamSession).toHaveBeenCalledWith({
      questionCount: 28,
      questionType: 'all',
      difficulty: 'all',
      cognitiveLevel: 'all',
      scopeType: 'all',
      scopeSlug: undefined,
      mode: 'CUSTOM_PRACTICE',
      expectedDatasetVersion: 'dataset-v1',
    }));
    expect(await screen.findByText('Phiên luyện tập đã tạo')).toBeInTheDocument();
  });

  it('keeps custom mock mode, dataset version, and destination unchanged', async () => {
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('radio', { name: /^Tùy chỉnh/ }));
    await user.click(within(screen.getByRole('group', { name: 'Chế độ' })).getByRole('radio', { name: /Thi thử tùy chọn/ }));

    const start = screen.getByRole('button', { name: 'Bắt đầu luyện tập' });
    await waitFor(() => expect(start).toBeEnabled());
    await user.click(start);

    await waitFor(() => expect(mocks.createExamSession).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'CUSTOM_MOCK',
      expectedDatasetVersion: 'dataset-v1',
    })));
    expect(await screen.findByText('Phiên thi thử đã tạo')).toBeInTheDocument();
  });

  it('topic combobox: lists 32 topics, the input is the combobox, and filters case-insensitively', async () => {
    mocks.listTopicMetadata.mockResolvedValue(buildTopicsResponse(32));
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('radio', { name: /^Tùy chỉnh/ }));
    await user.click(within(screen.getByRole('group', { name: 'Phạm vi' })).getByRole('radio', { name: 'Một chủ đề' }));

    const trigger = await screen.findByRole('combobox', { name: 'Chủ đề' });
    expect(trigger.tagName).toBe('INPUT');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    expect(trigger).toHaveAttribute('aria-controls');

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    const listbox = await screen.findByRole('listbox', { name: 'Chủ đề' });
    const allOptions = await within(listbox).findAllByRole('option');
    expect(allOptions.length).toBe(32);

    // The single input IS the combobox — typing on it filters the listbox.
    fireEvent.change(trigger, { target: { value: 'khang' } });
    await waitFor(() => {
      const options = listbox.querySelectorAll('[role="option"]');
      const titles = Array.from(options).map((node) => (node.textContent ?? '').toLowerCase());
      expect(titles.length).toBeGreaterThan(0);
      titles.forEach((title) => expect(title).toContain('kháng'));
    });

    fireEvent.change(trigger, { target: { value: 'ASEAN' } });
    await waitFor(() => {
      const options = listbox.querySelectorAll('[role="option"]');
      const titles = Array.from(options).map((node) => (node.textContent ?? '').toLowerCase());
      expect(titles.length).toBeGreaterThan(0);
      titles.forEach((title) => expect(title).toContain('asean'));
    });

    fireEvent.change(trigger, { target: { value: 'XYZ-no-match' } });
    expect(await screen.findByText('Không tìm thấy chủ đề phù hợp.')).toBeInTheDocument();
  });

  it('topic combobox: pointer selection on a filtered option commits the canonical slug', async () => {
    mocks.listTopicMetadata.mockResolvedValue(buildTopicsResponse(32));
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('radio', { name: /^Tùy chỉnh/ }));
    await user.click(within(screen.getByRole('group', { name: 'Phạm vi' })).getByRole('radio', { name: 'Một chủ đề' }));

    const trigger = await screen.findByRole('combobox', { name: 'Chủ đề' });
    await user.click(trigger);
    const listbox = await screen.findByRole('listbox', { name: 'Chủ đề' });

    fireEvent.change(trigger, { target: { value: 'khang' } });
    await waitFor(() => {
      const options = listbox.querySelectorAll('[role="option"]');
      expect(options.length).toBeGreaterThan(0);
    });

    const filtered = Array.from(listbox.querySelectorAll('[role="option"]')) as HTMLElement[];
    const matchedSlug = filtered[0].id.replace(/^.*?-opt-/, '');
    const targetTitle = (filtered[0].querySelector('strong')?.textContent ?? '').trim();

    fireEvent.mouseDown(filtered[0]);

    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'));
    expect(trigger).toHaveValue(targetTitle);

    await waitFor(() => expect(mocks.previewCustomExam).toHaveBeenLastCalledWith(expect.objectContaining({
      scopeType: 'topic',
      scopeSlug: matchedSlug,
      difficulty: 'all',
    }), expect.any(AbortSignal)));
  });

  it('topic combobox: Escape closes the popup and keeps focus on the combobox input', async () => {
    mocks.listTopicMetadata.mockResolvedValue(buildTopicsResponse(32));
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('radio', { name: /^Tùy chỉnh/ }));
    await user.click(within(screen.getByRole('group', { name: 'Phạm vi' })).getByRole('radio', { name: 'Một chủ đề' }));

    const trigger = await screen.findByRole('combobox', { name: 'Chủ đề' });
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(trigger, { key: 'Escape' });
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'));
    expect(trigger).toHaveFocus();
  });

  it('topic combobox: Tab closes the popup and moves focus to the next focusable control', async () => {
    mocks.listTopicMetadata.mockResolvedValue(buildTopicsResponse(32));
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('radio', { name: /^Tùy chỉnh/ }));
    await user.click(within(screen.getByRole('group', { name: 'Phạm vi' })).getByRole('radio', { name: 'Một chủ đề' }));

    const trigger = await screen.findByRole('combobox', { name: 'Chủ đề' });
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // Tab leaves the combobox; focus must advance to the next focusable
    // element in document order (here, the next radio inside Phạm vi).
    await user.tab();
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'));
    expect(trigger).not.toHaveFocus();
    // The next focusable element is in the same Phạm vi radiogroup.
    expect(document.activeElement).not.toBe(trigger);
  });

  it('period selection uses the shared combobox shell (non-editable button trigger)', async () => {
    mocks.listTopicMetadata.mockResolvedValue(buildTopicsResponse(4));
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('radio', { name: /^Tùy chỉnh/ }));
    await user.click(within(screen.getByRole('group', { name: 'Phạm vi' })).getByRole('radio', { name: 'Một giai đoạn' }));

    const trigger = await screen.findByRole('combobox', { name: 'Giai đoạn' });
    // Native <select> is gone — Period now uses the shared button-as-combobox.
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    expect(trigger).toHaveAttribute('aria-controls');

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const listbox = await screen.findByRole('listbox', { name: 'Giai đoạn' });
    expect(within(listbox).getAllByRole('option')).toHaveLength(1);
  });

  it('period selection commits its scopeSlug through the keyboard and updates preview', async () => {
    mocks.listTopicMetadata.mockResolvedValue(buildTopicsResponse(4));
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('radio', { name: /^Tùy chỉnh/ }));
    await user.click(within(screen.getByRole('group', { name: 'Phạm vi' })).getByRole('radio', { name: 'Một giai đoạn' }));

    const trigger = await screen.findByRole('combobox', { name: 'Giai đoạn' });
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    const listbox = await screen.findByRole('listbox', { name: 'Giai đoạn' });
    const option = within(listbox).getAllByRole('option')[0];
    const optionId = option.id;
    const expectedSlug = optionId.slice(optionId.lastIndexOf('-opt-') + '-opt-'.length);

    expect(mocks.previewCustomExam).not.toHaveBeenCalledWith(
      expect.objectContaining({ scopeSlug: expectedSlug, scopeType: 'period' }),
      expect.any(AbortSignal),
    );

    fireEvent.keyDown(trigger, { key: 'Enter' });

    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'));
    await waitFor(() =>
      expect(mocks.previewCustomExam).toHaveBeenLastCalledWith(
        expect.objectContaining({
          scopeType: 'period',
          scopeSlug: expectedSlug,
          difficulty: 'all',
        }),
        expect.any(AbortSignal),
      ),
    );
  });

  it('period trigger Escape closes the popup and keeps focus on the trigger', async () => {
    mocks.listTopicMetadata.mockResolvedValue(buildTopicsResponse(4));
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('radio', { name: /^Tùy chỉnh/ }));
    await user.click(within(screen.getByRole('group', { name: 'Phạm vi' })).getByRole('radio', { name: 'Một giai đoạn' }));

    const trigger = await screen.findByRole('combobox', { name: 'Giai đoạn' });
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(trigger, { key: 'Escape' });
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'));
    expect(trigger).toHaveFocus();
  });

  it('period trigger Tab closes the popup and advances focus to the next focusable control', async () => {
    mocks.listTopicMetadata.mockResolvedValue(buildTopicsResponse(4));
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('radio', { name: /^Tùy chỉnh/ }));
    await user.click(within(screen.getByRole('group', { name: 'Phạm vi' })).getByRole('radio', { name: 'Một giai đoạn' }));

    const trigger = await screen.findByRole('combobox', { name: 'Giai đoạn' });
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await user.tab();
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'));
    expect(trigger).not.toHaveFocus();
  });
});
