import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import ProtectedRoute from './auth/ProtectedRoute';
import RoleGuard from './auth/RoleGuard';
import { HeaderProvider } from './components/layout/HeaderContext';
import AppHeader from './components/layout/AppHeader';
import { ThemeProvider } from './theme/ThemeContext';

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
import AdminQuestionsPage from './pages/admin/AdminQuestionsPage';

// Quiz pages
import QuizHomePage from './pages/quiz/QuizHomePage';
import QuizGeneratePage from './pages/quiz/QuizGeneratePage';
import QuizSessionPage from './pages/quiz/QuizSessionPage';
import QuizResultPage from './pages/quiz/QuizResultPage';
import QuizHistoryPage from './pages/quiz/QuizHistoryPage';

// Exams pages
import ExamHomePage from './pages/exams/ExamHomePage';
import ExamCreatePage from './pages/exams/ExamCreatePage';
import ExamSessionPage from './pages/exams/ExamSessionPage';
import ExamResultPage from './pages/exams/ExamResultPage';
import ExamHistoryPage from './pages/exams/ExamHistoryPage';
import ExamBrowsePage from './pages/exams/ExamBrowsePage';
import ExamV2SessionPage from './pages/exams/ExamV2SessionPage';
import ExamV2ResultPage from './pages/exams/ExamV2ResultPage';
import ExamV2HistoryPage from './pages/exams/ExamV2HistoryPage';

function AppContent() {
  const location = useLocation();
  const hideHeaderRoutes = ['/quiz/session', '/exams/session', '/exams/de'];
  const shouldHideHeader = hideHeaderRoutes.some(path => location.pathname.startsWith(path));

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-stone-50">
      {!shouldHideHeader && <AppHeader />}
      <div className="flex-1 overflow-y-auto">
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
          <Route path="/exams/create" element={<ExamCreatePage />} />
          <Route path="/exams/session/:examId" element={<ExamSessionPage />} />
          <Route path="/exams/result/:examId" element={<ExamResultPage />} />
          <Route path="/exams/history" element={<ExamHistoryPage />} />
          <Route path="/exams/browse" element={<ExamBrowsePage />} />
          <Route path="/exams/de/:examId" element={<ExamV2SessionPage />} />
          <Route path="/exams/ket-qua/:sessionId" element={<ExamV2ResultPage />} />
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
          <Route path="/admin/questions" element={<ProtectedRoute><RoleGuard requiredRole="admin"><AdminQuestionsPage /></RoleGuard></ProtectedRoute>} />
        </Routes>
      </div>
    </div>
  );
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
