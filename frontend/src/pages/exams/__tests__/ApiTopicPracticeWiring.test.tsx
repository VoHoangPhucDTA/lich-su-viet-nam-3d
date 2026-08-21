import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ApiTopicListPage from '../ApiTopicListPage';
import { ApiFreePracticeRoutePage, ApiRetryWrongRoutePage, ApiTopicPracticeRoutePage } from '../ApiPracticeRoutePages';
import { ApiCustomMockSessionRoutePage, ApiCustomPracticeSessionRoutePage } from '../ApiCustomSessionRoutePages';

const testState = vi.hoisted(() => ({
  listTopicMetadata: vi.fn(),
  isExamApiFallbackError: vi.fn(),
  sessionProps: vi.fn(),
  timedProps: vi.fn(),
}));

vi.mock('@/services/examApi', () => ({
  listTopicMetadata: testState.listTopicMetadata,
  isExamApiFallbackError: testState.isExamApiFallbackError,
}));

vi.mock('../ApiPracticeSessionPage', () => ({
  default: (props: unknown) => {
    testState.sessionProps(props);
    return <div>API practice session</div>;
  },
}));

vi.mock('../ExamV2SessionPage', () => ({
  default: (props: unknown) => {
    testState.timedProps(props);
    return <div>API timed session</div>;
  },
}));

const topicMetadataResponse = {
  datasetVersion: 'test-version',
  total: 2,
  items: [
    {
      slug: 'topic-one',
      title: 'Topic One',
      periodSlug: 'period-one',
      periodTitle: 'Period One',
      questionCount: 12,
      mcqCount: 8,
      tfCount: 4,
      difficultyBreakdown: {},
      cognitiveLevelBreakdown: {},
    },
    {
      slug: 'topic-two',
      title: 'Topic Two',
      periodSlug: 'period-one',
      periodTitle: 'Period One',
      questionCount: 9,
      mcqCount: 6,
      tfCount: 3,
      difficultyBreakdown: {},
      cognitiveLevelBreakdown: {},
    },
  ],
};

function renderTopicList() {
  render(
    <MemoryRouter>
      <ApiTopicListPage />
    </MemoryRouter>,
  );
}

function renderPracticeRoute(initialEntry: string) {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/exams/on-chu-de/:topicSlug" element={<ApiTopicPracticeRoutePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderFreePracticeRoute(initialEntry: string) {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/exams/luyen-tap/:examId" element={<ApiFreePracticeRoutePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('topic and period practice wiring', () => {
  beforeEach(() => {
    testState.listTopicMetadata.mockReset();
    testState.listTopicMetadata.mockResolvedValue(topicMetadataResponse);
    testState.isExamApiFallbackError.mockReset();
    testState.isExamApiFallbackError.mockReturnValue(false);
    testState.sessionProps.mockReset();
    testState.timedProps.mockReset();
  });

  it('keeps topic cards on the existing topic deep link', async () => {
    renderTopicList();

    const heading = await screen.findByRole('heading', { name: 'Topic One' });
    const card = heading.closest('article');

    expect(card).not.toBeNull();
    expect(within(card!).getByRole('link', { name: 'Bắt đầu ôn' })).toHaveAttribute(
      'href',
      '/exams/on-chu-de/topic-one',
    );
  });

  it('marks period card links with the period scope', async () => {
    const user = userEvent.setup();
    renderTopicList();

    await screen.findByRole('heading', { name: 'Topic One' });
    await user.click(screen.getByRole('button', { name: 'Theo giai đoạn' }));

    const heading = screen.getByRole('heading', { name: 'Period One' });
    const card = heading.closest('article');

    expect(card).not.toBeNull();
    expect(within(card!).getByRole('link', { name: 'Bắt đầu ôn' })).toHaveAttribute(
      'href',
      '/exams/on-chu-de/period-one?scope=period',
    );
  });

  it('creates a topic-scoped request for existing deep links', () => {
    renderPracticeRoute('/exams/on-chu-de/topic-one');

    expect(testState.sessionProps).toHaveBeenLastCalledWith(expect.objectContaining({
      routeKey: 'TOPIC_PRACTICE:topic-one',
      request: {
        mode: 'TOPIC_PRACTICE',
        questionCount: 30,
        scopeType: 'topic',
        scopeSlug: 'topic-one',
      },
    }));
  });

  it('creates a free-practice request from an exam deep link', () => {
    renderFreePracticeRoute('/exams/luyen-tap/exam-2026');

    expect(testState.sessionProps).toHaveBeenLastCalledWith(expect.objectContaining({
      routeKey: 'FREE_PRACTICE:exam-2026',
      request: { mode: 'FREE_PRACTICE', examId: 'exam-2026' },
    }));
  });

  it('creates a period-scoped request when the period query is present', () => {
    renderPracticeRoute('/exams/on-chu-de/period-one?scope=period');

    expect(testState.sessionProps).toHaveBeenLastCalledWith(expect.objectContaining({
      routeKey: 'TOPIC_PRACTICE:period:period-one',
      request: {
        mode: 'TOPIC_PRACTICE',
        questionCount: 30,
        scopeType: 'period',
        scopeSlug: 'period-one',
      },
    }));
  });

  it('creates a real retry-wrong session request from the source attempt', () => {
    render(
      <MemoryRouter initialEntries={['/exams/on-lai/attempt-2026']}>
        <Routes>
          <Route path="/exams/on-lai/:sessionId" element={<ApiRetryWrongRoutePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(testState.sessionProps).toHaveBeenLastCalledWith(expect.objectContaining({
      routeKey: 'RETRY_WRONG:attempt-2026',
      request: {
        mode: 'RETRY_WRONG',
        sourceAttemptId: 'attempt-2026',
      },
    }));
  });

  it('resumes custom practice through the API session route', () => {
    render(
      <MemoryRouter initialEntries={['/exams/tuy-chon/luyen-tap/session-practice']}>
        <Routes>
          <Route path="/exams/tuy-chon/luyen-tap/:sessionId" element={<ApiCustomPracticeSessionRoutePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(testState.sessionProps).toHaveBeenLastCalledWith(expect.objectContaining({
      routeKey: 'CUSTOM_PRACTICE:session-practice',
      initialSessionId: 'session-practice',
      request: null,
    }));
  });

  it('resumes custom mock through the timed API session route', () => {
    render(
      <MemoryRouter initialEntries={['/exams/tuy-chon/session-mock']}>
        <Routes>
          <Route path="/exams/tuy-chon/:sessionId" element={<ApiCustomMockSessionRoutePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(testState.timedProps).toHaveBeenLastCalledWith({ initialSessionId: 'session-mock' });
  });
});
