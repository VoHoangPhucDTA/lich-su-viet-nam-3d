import { useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import type { DashboardAnalyticsRequest } from '@/services/dashboardAnalyticsApi';
import { DashboardPageHeader } from './components/DashboardPageHeader';
import {
  DashboardEmptyState,
  DashboardErrorState,
  DashboardLoadingState,
  DashboardReadyState,
} from './components/DashboardStates';
import type { DashboardDevelopmentFixtureLoader } from './dashboardFixtures';
import type { DashboardLocalStorageProvider } from './localAnalytics/localDashboardSource';
import type {
  DashboardRange,
  PersonalLearningDashboardViewModel,
} from './dashboardTypes';
import { usePersonalLearningDashboard } from './usePersonalLearningDashboard';
import './personalLearningDashboard.css';

interface PersonalLearningDashboardPageProps {
  initialViewModel?: PersonalLearningDashboardViewModel;
  requestDashboard?: DashboardAnalyticsRequest;
  fixtureLoader?: DashboardDevelopmentFixtureLoader | null;
  localStorageProvider?: DashboardLocalStorageProvider;
  now?: () => Date;
}

export default function PersonalLearningDashboardPage({
  initialViewModel,
  requestDashboard,
  fixtureLoader,
  localStorageProvider,
  now,
}: PersonalLearningDashboardPageProps = {}) {
  const location = useLocation();
  const { currentUser, isAuthenticated, isLoading } = useAuth();
  const isDarkPreview = import.meta.env.DEV && new URLSearchParams(location.search).get('theme') === 'dark';
  const { viewModel: vm, range, setRange, retry, announcement } = usePersonalLearningDashboard({
    auth: {
      isLoading,
      isAuthenticated,
      ownerKey: currentUser?.id ?? null,
    },
    search: location.search,
    initialViewModel,
    requestDashboard,
    fixtureLoader,
    localStorageProvider,
    now,
  });
  const contentRef = useRef<HTMLDivElement>(null);
  const focusAfterSettle = useRef(false);
  const handleRetry = useCallback(() => {
    focusAfterSettle.current = true;
    retry();
  }, [retry]);
  const handleRangeChange = useCallback((next: DashboardRange) => {
    focusAfterSettle.current = true;
    setRange(next);
  }, [setRange]);

  useEffect(() => {
    if (vm.state === 'loading' || !focusAfterSettle.current) return;
    focusAfterSettle.current = false;
    contentRef.current?.focus();
  }, [vm.state]);

  return (
    <div className={`dashboard-page${isDarkPreview ? ' dashboard-theme-dark' : ''}`}>
      <DashboardPageHeader vm={vm} range={range} onRangeChange={handleRangeChange} />
      <p className="dashboard-visually-hidden" aria-live="polite" aria-atomic="true">{announcement}</p>
      <div ref={contentRef} tabIndex={-1} className="dashboard-focus-target">
        {vm.state === 'loading' && <DashboardLoadingState />}
        {vm.state === 'error' && <DashboardErrorState vm={vm} onRetry={handleRetry} />}
        {vm.state === 'empty' && <DashboardEmptyState vm={vm} />}
        {vm.state === 'ready' && <DashboardReadyState vm={vm} onRetry={handleRetry} />}
      </div>
    </div>
  );
}
