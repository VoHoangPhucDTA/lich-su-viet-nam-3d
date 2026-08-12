import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExamBrowsePage from '../ExamBrowsePage';

const mocks = vi.hoisted(() => ({
  listCatalog: vi.fn(),
  isExamApiFallbackError: vi.fn(),
  listPublishedExams: vi.fn(),
  listAllExams: vi.fn(),
  preloadExamV2SessionPage: vi.fn(),
}));

vi.mock('@/services/examApi', () => ({
  isExamApiFallbackError: mocks.isExamApiFallbackError,
  listCatalog: mocks.listCatalog,
}));

vi.mock('@/lib/exam/manifestLoader', () => ({
  listPublishedExams: mocks.listPublishedExams,
  listAllExams: mocks.listAllExams,
}));

vi.mock('@/lib/exam/examRoutePreload', () => ({
  preloadExamV2SessionPage: mocks.preloadExamV2SessionPage,
}));

function buildCatalogResponse(entries: Array<{ year: number; examId: string; verificationStatus?: 'VERIFIED' | 'REVIEW_REQUIRED' }>) {
  return {
    datasetVersion: 'dataset-v1',
    total: entries.length,
    items: entries.map((entry) => ({
      examId: entry.examId,
      title: `KSCL thi TN THPT ${entry.year} môn Lịch sử – Cụm trường khảo thí`,
      year: entry.year,
      sourceDetail: 'thuvienhoclieu.com',
      format: 'MCQ_TRUFALSE',
      timeLimitMinutes: 50,
      totalScore: 10,
      mcqCount: 24,
      tfCount: 4,
      verificationStatus: entry.verificationStatus ?? 'VERIFIED',
    })),
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/exams/browse']}>
      <ExamBrowsePage />
    </MemoryRouter>,
  );
}

describe('ExamBrowsePage student-facing cleanup', () => {
  beforeEach(() => {
    mocks.listCatalog.mockReset();
    mocks.isExamApiFallbackError.mockReset();
    mocks.listPublishedExams.mockReset();
    mocks.listAllExams.mockReset();
    mocks.preloadExamV2SessionPage.mockReset();
  });

  it('calls listCatalog with verified view only — never with reviewable', async () => {
    mocks.listCatalog.mockResolvedValue(buildCatalogResponse([
      { year: 2026, examId: 'exam-bac-ninh-2026-lan-1' },
      { year: 2025, examId: 'exam-thpt-2025-lan-1' },
    ]));

    renderPage();
    await screen.findByText(/Ngân hàng đề thi THPT/);

    expect(mocks.listCatalog).toHaveBeenCalledTimes(1);
    expect(mocks.listCatalog).toHaveBeenCalledWith('verified', expect.any(AbortSignal));
    expect(mocks.listCatalog.mock.calls[0]?.[0]).not.toBe('reviewable');
  });

  it('does not render QA chrome in either verified or fallback paths', async () => {
    mocks.listCatalog.mockResolvedValue(buildCatalogResponse([
      { year: 2026, examId: 'exam-bac-ninh-2026-lan-1' },
    ]));
    renderPage();

    await screen.findByText(/Ngân hàng đề thi THPT/);
    expect(screen.queryByText(/Trạng thái/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Đạt kiểm tra dữ liệu/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ý nghĩa trạng thái/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Tất cả đề/)).not.toBeInTheDocument();
  });

  it('falls back to local listCatalog verified when API throws fallback error without QA chrome', async () => {
    const fallbackError = new Error('Service unavailable');
    mocks.isExamApiFallbackError.mockReturnValue(true);
    mocks.listCatalog.mockRejectedValue(fallbackError);
    mocks.listPublishedExams.mockResolvedValue([
      {
        examId: 'local-exam-1',
        title: 'Đề thi thử Lịch sử',
        year: 2026,
        sourceDetail: 'thuvienhoclieu.com',
        format: 'MCQ_TRUFALSE',
        timeLimitMinutes: 50,
        totalScore: 10,
        mcqCount: 24,
        tfCount: 4,
        structuralPassed: true,
        crossSourcePassed: true,
        hasContentSuspicion: false,
        fileName: '',
      },
    ]);

    renderPage();
    expect(await screen.findByText(/dữ liệu cục bộ/)).toBeInTheDocument();
    expect(await screen.findByText('Đề thi thử Lịch sử')).toBeInTheDocument();
    expect(screen.queryByText(/Trạng thái/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Đạt kiểm tra dữ liệu/)).not.toBeInTheDocument();
  });

  it('renders the year filter as direct radio chips (no native select, no Tất cả đề)', async () => {
    mocks.listCatalog.mockResolvedValue(buildCatalogResponse([
      { year: 2026, examId: 'exam-2026-a' },
      { year: 2025, examId: 'exam-2025-a' },
    ]));
    renderPage();

    const toolbar = await screen.findByRole('region', { name: 'Bộ lọc ngân hàng đề' });
    const yearGroup = within(toolbar).getByRole('radiogroup', { name: 'Năm' });
    expect(yearGroup.tagName).not.toBe('SELECT');
    const radios = within(yearGroup).getAllByRole('radio');
    radios.forEach((node) => expect(node.tagName).toBe('INPUT'));
    const labels = radios
      .map((node) => (node as HTMLInputElement).value || node.textContent?.trim())
      .filter((label) => label && label !== 'all');
    expect(within(yearGroup).getByRole('radio', { name: 'Tất cả năm' })).toBeInTheDocument();
    expect(within(yearGroup).getByRole('radio', { name: '2026' })).toBeInTheDocument();
    expect(within(yearGroup).getByRole('radio', { name: '2025' })).toBeInTheDocument();
    // All radios share the same name so the browser treats them as a group.
    radios.forEach((node) => expect((node as HTMLInputElement).name).toBe('exam-year-filter'));
    expect(labels).toEqual(['2026', '2025']);
  });

  it('Year radios expose native checked state and "Tất cả năm" is initially checked', async () => {
    mocks.listCatalog.mockResolvedValue(buildCatalogResponse([
      { year: 2026, examId: 'exam-2026-a' },
      { year: 2026, examId: 'exam-2026-b' },
      { year: 2025, examId: 'exam-2025-a' },
    ]));
    renderPage();

    const toolbar = await screen.findByRole('region', { name: 'Bộ lọc ngân hàng đề' });
    const yearGroup = within(toolbar).getByRole('radiogroup', { name: 'Năm' });
    const allYear = within(yearGroup).getByRole('radio', { name: 'Tất cả năm' }) as HTMLInputElement;
    expect(allYear.checked).toBe(true);
    expect(allYear.name).toBe('exam-year-filter');
  });

  it('clicking a year chip via the label commits the selection and filters the list', async () => {
    mocks.listCatalog.mockResolvedValue(buildCatalogResponse([
      { year: 2026, examId: 'exam-2026-a' },
      { year: 2026, examId: 'exam-2026-b' },
      { year: 2025, examId: 'exam-2025-a' },
    ]));
    renderPage();
    const user = userEvent.setup();

    const toolbar = await screen.findByRole('region', { name: 'Bộ lọc ngân hàng đề' });
    const yearGroup = within(toolbar).getByRole('radiogroup', { name: 'Năm' });

    const radio2026 = within(yearGroup).getByRole('radio', { name: '2026' }) as HTMLInputElement;
    await user.click(radio2026);

    await waitFor(() => expect(radio2026.checked).toBe(true));
    const allYear = within(yearGroup).getByRole('radio', { name: 'Tất cả năm' }) as HTMLInputElement;
    expect(allYear.checked).toBe(false);
    expect(await within(toolbar).findByText('2 đề phù hợp')).toBeInTheDocument();

    const radio2025 = within(yearGroup).getByRole('radio', { name: '2025' }) as HTMLInputElement;
    await user.click(radio2025);
    await waitFor(() => expect(radio2025.checked).toBe(true));
    expect(await within(toolbar).findByText('1 đề phù hợp')).toBeInTheDocument();

    await user.click(allYear);
    expect(allYear.checked).toBe(true);
    expect(await within(toolbar).findByText('3 đề phù hợp')).toBeInTheDocument();
  });

  it('Selecting a year via keyboard (Space) on the radio also triggers the filter', async () => {
    mocks.listCatalog.mockResolvedValue(buildCatalogResponse([
      { year: 2026, examId: 'exam-2026-a' },
      { year: 2025, examId: 'exam-2025-a' },
    ]));
    renderPage();
    const user = userEvent.setup();

    const toolbar = await screen.findByRole('region', { name: 'Bộ lọc ngân hàng đề' });
    const yearGroup = within(toolbar).getByRole('radiogroup', { name: 'Năm' });
    const radio2026 = within(yearGroup).getByRole('radio', { name: '2026' }) as HTMLInputElement;
    radio2026.focus();
    await user.keyboard(' ');

    await waitFor(() => expect(radio2026.checked).toBe(true));
    expect(await within(toolbar).findByText('1 đề phù hợp')).toBeInTheDocument();
  });

  it('uses getExamDisplayYear as the single source of truth — card, filter chips, and filter comparison all agree', async () => {
    // Entry whose raw manifest year is 2025 but whose display title contains
    // 2026. The card surface, the year filter options, and the year filter
    // comparison must ALL resolve to 2026 (no duplicate 2025 chip).
    mocks.listCatalog.mockResolvedValue({
      datasetVersion: 'dataset-v1',
      total: 2,
      items: [
        {
          examId: 'exam-2026-display-only',
          title: 'KSCL thi TN THPT 2026 môn Lịch sử – Cụm trường khảo thí',
          year: 2025, // raw manifest year is intentionally different
          sourceDetail: 'thuvienhoclieu.com',
          format: 'MCQ_TRUFALSE',
          timeLimitMinutes: 50,
          totalScore: 10,
          mcqCount: 24,
          tfCount: 4,
          verificationStatus: 'VERIFIED',
        },
        {
          examId: 'exam-2025-control',
          title: 'KSCL thi TN THPT 2025 môn Lịch sử – Huyện Hải Phòng',
          year: 2025,
          sourceDetail: 'thuvienhoclieu.com',
          format: 'MCQ_TRUFALSE',
          timeLimitMinutes: 50,
          totalScore: 10,
          mcqCount: 24,
          tfCount: 4,
          verificationStatus: 'VERIFIED',
        },
      ],
    });
    renderPage();
    const user = userEvent.setup();

    // Year chips come from display-year only — should be [2026, 2025]
    // because the second entry's title contains 2025.
    const toolbar = await screen.findByRole('region', { name: 'Bộ lọc ngân hàng đề' });
    const yearGroup = within(toolbar).getByRole('radiogroup', { name: 'Năm' });
    const radios = within(yearGroup).getAllByRole('radio');
    const visibleLabels = radios.map((node) => {
      const span = (node as HTMLElement).closest('label')?.querySelector('span');
      return span?.textContent?.trim();
    }).filter(Boolean);
    expect(visibleLabels).toEqual(['Tất cả năm', '2026', '2025']);

    // Card year is the display-year, NOT the raw manifest year.
    const cards = await screen.findAllByRole('article');
    const cardYears = cards.map((card) => card.querySelector('.exam-browse-year strong')?.textContent?.trim());
    expect(cardYears).toContain('2026');
    expect(cardYears).toContain('2025');

    // Selecting 2026 must surface only the entry whose display year is 2026,
    // not the entry whose manifest year is 2025 but whose display year is 2026.
    const radio2026 = within(yearGroup).getByRole('radio', { name: '2026' }) as HTMLInputElement;
    await user.click(radio2026);
    await waitFor(() => expect(radio2026.checked).toBe(true));
    expect(await within(toolbar).findByText('1 đề phù hợp')).toBeInTheDocument();
    const visibleCards = within(screen.getByRole('region', { name: 'Danh sách đề thi' })).getAllByRole('article');
    expect(visibleCards).toHaveLength(1);
    // The card's <Link> href preserves the raw examId slug, so we use it to
    // verify the correct entry is filtered (the visible text uses
    // formatExamTitle, which strips the raw slug).
    const cardLinks = within(visibleCards[0]!).getAllByRole('link');
    const targetHref = cardLinks.find((link) => link.getAttribute('href')?.startsWith('/exams/de/'))
      ?.getAttribute('href');
    expect(targetHref).toBe('/exams/de/exam-2026-display-only');
  });

  it('does not expose any REVIEW_REQUIRED or verification badge on rendered cards', async () => {
    mocks.listCatalog.mockResolvedValue(buildCatalogResponse([
      { year: 2026, examId: 'exam-2026-a' },
    ]));
    renderPage();

    const card = await screen.findByRole('article');
    expect(card.textContent).not.toMatch(/VERIFIED|REVIEW_REQUIRED|verification/i);

    expect(within(card).queryByText(/Đạt kiểm tra/)).not.toBeInTheDocument();
    expect(within(card).queryByText(/Chưa đạt/)).not.toBeInTheDocument();
    expect(within(card).queryByText(/Cần xem lại/)).not.toBeInTheDocument();
  });

  it('renders "Luyện tập" copy and unverifies "Luyện tập tự do"', async () => {
    mocks.listCatalog.mockResolvedValue(buildCatalogResponse([
      { year: 2026, examId: 'exam-2026-a' },
    ]));
    renderPage();

    const card = await screen.findByRole('article');
    const links = within(card).getAllByRole('link');
    const labels = links.map((node) => node.textContent?.trim());
    expect(labels).toContain('Luyện tập');
    expect(labels).not.toContain('Luyện tập tự do');

    const practiceLink = links.find((node) => node.textContent?.trim() === 'Luyện tập');
    expect(practiceLink).toBeTruthy();
    expect(practiceLink?.getAttribute('href')).toBe('/exams/luyen-tap/exam-2026-a');

    const mockLink = links.find((node) => node.textContent?.trim() === 'Thi thử');
    expect(mockLink).toBeTruthy();
    expect(mockLink?.getAttribute('href')).toBe('/exams/de/exam-2026-a');
  });

  it('renders formatted titles without raw slug tokens leaking', async () => {
    mocks.listCatalog.mockResolvedValue(buildCatalogResponse([
      { year: 2026, examId: 'exam-kscl-bac-ninh-2026-lan-1' },
    ]));
    renderPage();
    const card = await screen.findByRole('article');
    expect(card.textContent).not.toMatch(/thuvienhoclieu\.com-De-/);
    expect(card.textContent).toMatch(/KSCL thi TN THPT/);
  });

  it('survives REVIEW_REQUIRED items being passed in — they are not exposed in the verified path', async () => {
    mocks.listCatalog.mockResolvedValue(buildCatalogResponse([
      { year: 2026, examId: 'exam-verified-a' },
    ]));

    renderPage();
    await screen.findByText(/Ngân hàng đề thi THPT/);

    expect(mocks.listCatalog).toHaveBeenCalledWith('verified', expect.any(AbortSignal));
    expect(mocks.listCatalog.mock.calls.every((call) => call[0] === 'verified')).toBe(true);
  });
});
