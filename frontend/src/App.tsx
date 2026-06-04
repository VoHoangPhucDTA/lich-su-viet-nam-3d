import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import ProtectedRoute from './auth/ProtectedRoute';
import RoleGuard from './auth/RoleGuard';
import { HeaderProvider } from './components/layout/HeaderContext';
import AppHeader from './components/layout/AppHeader';
import { ThemeProvider } from './theme/ThemeContext';

// Existing pages
import MapPage from './pages/MapPage';
import EventDetailPage from './pages/EventDetailPage';

// Auth pages
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';

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

// Quiz / AI-RAG pages (public – guest or authenticated)
import QuizHomePage from './pages/quiz/QuizHomePage';
import QuizGeneratePage from './pages/quiz/QuizGeneratePage';
import QuizSessionPage from './pages/quiz/QuizSessionPage';
import QuizResultPage from './pages/quiz/QuizResultPage';
import QuizHistoryPage from './pages/quiz/QuizHistoryPage';

// Exams pages (public – guest or authenticated)
import ExamHomePage from './pages/exams/ExamHomePage';
import ExamCreatePage from './pages/exams/ExamCreatePage';
import ExamSessionPage from './pages/exams/ExamSessionPage';
import ExamResultPage from './pages/exams/ExamResultPage';
import ExamHistoryPage from './pages/exams/ExamHistoryPage';

function AppContent() {
  const location = useLocation();
  // Do not show global header on specific interactive session pages that have their own full-screen custom headers
  const hideHeaderRoutes = ['/quiz/session', '/exams/session'];
  const shouldHideHeader = hideHeaderRoutes.some(path => location.pathname.startsWith(path));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      {!shouldHideHeader && <AppHeader />}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <Routes>
          {/* === Public routes === */}
          <Route path="/" element={<MapPage />} />
          <Route path="/events/:slug" element={<EventDetailPage />} />

          {/* === Auth routes (public) === */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* === Quiz / AI-RAG routes (public – guest allowed) === */}
          <Route path="/quiz" element={<QuizHomePage />} />
          <Route path="/quiz/generate" element={<QuizGeneratePage />} />
          <Route path="/quiz/session/:sessionId" element={<QuizSessionPage />} />
          <Route path="/quiz/result/:sessionId" element={<QuizResultPage />} />
          <Route path="/quiz/history" element={<QuizHistoryPage />} />

          {/* === Exams routes (public - guest allowed) === */}
          <Route path="/exams" element={<ExamHomePage />} />
          <Route path="/exams/create" element={<ExamCreatePage />} />
          <Route path="/exams/session/:examId" element={<ExamSessionPage />} />
          <Route path="/exams/result/:examId" element={<ExamResultPage />} />
          <Route path="/exams/history" element={<ExamHistoryPage />} />

          {/* === Profile routes (protected, any authenticated user) === */}
          <Route path="/profile" element={<Navigate to="/profile/dashboard" replace />} />
          <Route path="/profile/dashboard" element={
            <ProtectedRoute><ProfileDashboardPage /></ProtectedRoute>
          } />
          <Route path="/profile/history" element={
            <ProtectedRoute><LearningHistoryPage /></ProtectedRoute>
          } />
          <Route path="/profile/scores" element={
            <ProtectedRoute><ScoresPage /></ProtectedRoute>
          } />
          <Route path="/profile/settings" element={
            <ProtectedRoute><ProfileSettingsPage /></ProtectedRoute>
          } />

          {/* === Admin routes (protected + admin role required) === */}
          <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="/admin/dashboard" element={
            <ProtectedRoute>
              <RoleGuard requiredRole="admin"><AdminDashboardPage /></RoleGuard>
            </ProtectedRoute>
          } />
          <Route path="/admin/users" element={
            <ProtectedRoute>
              <RoleGuard requiredRole="admin"><AdminUsersPage /></RoleGuard>
            </ProtectedRoute>
          } />
          <Route path="/admin/events" element={
            <ProtectedRoute>
              <RoleGuard requiredRole="admin"><AdminEventsPage /></RoleGuard>
            </ProtectedRoute>
          } />
          <Route path="/admin/questions" element={
            <ProtectedRoute>
              <RoleGuard requiredRole="admin"><AdminQuestionsPage /></RoleGuard>
            </ProtectedRoute>
          } />
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

