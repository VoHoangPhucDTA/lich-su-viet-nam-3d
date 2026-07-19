import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AuthProvider } from './auth/AuthContext';
import ProtectedRoute from './auth/ProtectedRoute';
import RoleGuard from './auth/RoleGuard';
import { HeaderProvider } from './components/layout/HeaderContext';
import AppHeader from './components/layout/AppHeader';
import { ThemeProvider } from './theme/ThemeContext';
import { APP_SCROLL_ROOT_ID } from './hooks/useActiveSection';

// Pages
import CoiNguonPage from './pages/CoiNguonPage';
import MapPage from './pages/MapPage';
import EventDetailPage from './pages/EventDetailPage';
import AllEventsPage from './pages/AllEventsPage';
import HistoricalPeriodsPage from './pages/HistoricalPeriodsPage';

// Auth pages
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import VerifyEmailPage from './pages/auth/VerifyEmailPage';

// Profile pages
import ProfileDashboardPage from './pages/profile/ProfileDashboardPage';
import LearningHistoryPage from './pages/profile/LearningHistoryPage';
import ScoresPage from './pages/profile/ScoresPage';
import ProfileSettingsPage from './pages/profile/ProfileSettingsPage';

// Admin pages
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import AdminUsersPage from './pages/admin/AdminUsersPage';
import AdminEventsPage from './pages/admin/AdminEventsPage';

// Quiz pages
import QuizHomePage from './pages/quiz/QuizHomePage';
import QuizGeneratePage from './pages/quiz/QuizGeneratePage';
import QuizSessionPage from './pages/quiz/QuizSessionPage';
import QuizResultPage from './pages/quiz/QuizResultPage';
import QuizHistoryPage from './pages/quiz/QuizHistoryPage';

// Exams pages
import { legacyExamSessionPath } from './lib/exam/legacyExamRedirect';
import { loadExamV2SessionPage } from './lib/exam/examRoutePreload';

const ExamHomePage = lazy(() => import('./pages/exams/ExamHomePage'));
const ExamBrowsePage = lazy(() => import('./pages/exams/ExamBrowsePage'));
const ExamV2SessionPage = lazy(loadExamV2SessionPage);
const ExamV2ResultPage = lazy(() => import('./pages/exams/ExamV2ResultPage'));
const ExamV2HistoryPage = lazy(() => import('./pages/exams/ExamV2HistoryPage'));
const ApiTopicListPage = lazy(() => import('./pages/exams/ApiTopicListPage'));
const ApiCustomCreatePage = lazy(() => import('./pages/exams/ApiCustomCreatePage'));
const ApiCustomMockSessionRoutePage = lazy(() => import('./pages/exams/ApiCustomSessionRoutePages').then((module) => ({ default: module.ApiCustomMockSessionRoutePage })));
const ApiCustomPracticeSessionRoutePage = lazy(() => import('./pages/exams/ApiCustomSessionRoutePages').then((module) => ({ default: module.ApiCustomPracticeSessionRoutePage })));
const ApiFreePracticeRoutePage = lazy(() => import('./pages/exams/ApiPracticeRoutePages').then((module) => ({ default: module.ApiFreePracticeRoutePage })));
const ApiRetryWrongRoutePage = lazy(() => import('./pages/exams/ApiPracticeRoutePages').then((module) => ({ default: module.ApiRetryWrongRoutePage })));
const ApiTopicPracticeRoutePage = lazy(() => import('./pages/exams/ApiPracticeRoutePages').then((module) => ({ default: module.ApiTopicPracticeRoutePage })));

function AppContent() {
  const location = useLocation();
  const hideHeaderRoutes = [
    '/quiz/session',
    '/exams/session',
    '/exams/de',
    '/admin',
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
    '/verify-email',
  ];
  const examPracticeRoute = /^\/exams\/(?:luyen-tap\/[^/]+|on-lai\/[^/]+|tuy-chon\/[^/]+|on-chu-de\/[^/]+)$/;
  const shouldHideHeader = hideHeaderRoutes.some(path => location.pathname.startsWith(path))
    || examPracticeRoute.test(location.pathname);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-stone-50">
      {!shouldHideHeader && <AppHeader />}
      <div id={APP_SCROLL_ROOT_ID} className="flex-1 overflow-y-auto">
        <Suspense fallback={<div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Đang tải...</div>}>
        <Routes>
          {/* === Public routes === */}
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<CoiNguonPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/browse" element={<AllEventsPage />} />
          <Route path="/periods" element={<HistoricalPeriodsPage />} />
          <Route path="/events/:slug" element={<EventDetailPage />} />

          {/* === Auth routes === */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* === Quiz routes === */}
          <Route path="/quiz" element={<QuizHomePage />} />
          <Route path="/quiz/generate" element={<QuizGeneratePage />} />
          <Route path="/quiz/session/:sessionId" element={<QuizSessionPage />} />
          <Route path="/quiz/result/:sessionId" element={<QuizResultPage />} />
          <Route path="/quiz/history" element={<QuizHistoryPage />} />

          {/* === Exams routes === */}
          <Route path="/exams" element={<ExamHomePage />} />
          <Route path="/exams/create" element={<Navigate to="/exams/tao-de" replace />} />
          <Route path="/exams/session/:examId" element={<LegacyExamSessionRedirect />} />
          <Route path="/exams/result/:examId" element={<Navigate to="/exams/lich-su" replace />} />
          <Route path="/exams/history" element={<Navigate to="/exams/lich-su" replace />} />
          <Route path="/exams/browse" element={<ExamBrowsePage />} />
          <Route path="/exams/tao-de" element={<ApiCustomCreatePage />} />
          <Route path="/exams/tuy-chon/luyen-tap/:sessionId" element={<ApiCustomPracticeSessionRoutePage />} />
          <Route path="/exams/tuy-chon/:sessionId" element={<ApiCustomMockSessionRoutePage />} />
          <Route path="/exams/de/:examId" element={<ExamV2SessionPage />} />
          <Route path="/exams/luyen-tap/:examId" element={<ApiFreePracticeRoutePage />} />
          <Route path="/exams/on-chu-de" element={<ApiTopicListPage />} />
          <Route path="/exams/on-chu-de/:topicSlug" element={<ApiTopicPracticeRoutePage />} />
          <Route path="/exams/ket-qua/:sessionId" element={<ExamV2ResultPage />} />
          <Route path="/exams/on-lai/:sessionId" element={<ApiRetryWrongRoutePage />} />
          <Route path="/exams/lich-su" element={<ExamV2HistoryPage />} />
          <Route path="/exams/lich-su-v2" element={<ExamV2HistoryPage />} />

          {/* === Profile routes === */}
          <Route path="/profile" element={<Navigate to="/profile/dashboard" replace />} />
          <Route path="/profile/dashboard" element={<ProtectedRoute><ProfileDashboardPage /></ProtectedRoute>} />
          <Route path="/profile/history" element={<ProtectedRoute><LearningHistoryPage /></ProtectedRoute>} />
          <Route path="/profile/scores" element={<ProtectedRoute><ScoresPage /></ProtectedRoute>} />
          <Route path="/profile/settings" element={<ProtectedRoute><ProfileSettingsPage /></ProtectedRoute>} />

          {/* === Admin routes === */}
          <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="/admin/dashboard" element={<ProtectedRoute><RoleGuard requiredRole="admin"><AdminDashboardPage /></RoleGuard></ProtectedRoute>} />
          <Route path="/admin/users" element={<ProtectedRoute><RoleGuard requiredRole="admin"><AdminUsersPage /></RoleGuard></ProtectedRoute>} />
          <Route path="/admin/events" element={<ProtectedRoute><RoleGuard requiredRole="admin"><AdminEventsPage /></RoleGuard></ProtectedRoute>} />
          <Route path="/admin/questions" element={<Navigate to="/admin/events" replace />} />
        </Routes>
        </Suspense>
      </div>
    </div>
  );
}

function LegacyExamSessionRedirect() {
  const { examId } = useParams<{ examId: string }>();
  return <Navigate to={legacyExamSessionPath(examId)} replace />;
}

function App() {
  return (
    <Router>
      <ThemeProvider>
        <AuthProvider>
          <HeaderProvider>
            <AppContent />
          </HeaderProvider>
        </AuthProvider>
      </ThemeProvider>
    </Router>
  );
}

export default App;
