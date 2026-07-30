import { lazy, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { getAdminRouteMatch } from './lib/adminRoutes';
import { hasCapability } from './lib/permissions';
import { useAdminAuthStore } from './stores/authStore';
import { ToastContainer } from './components/ToastContainer';

// Pages
import LoginPage from './pages/LoginPage';
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const JobsPage = lazy(() => import('./pages/JobsPage'));
const QuestionsPage = lazy(() => import('./pages/QuestionsPage'));
const QuestionEditPage = lazy(() => import('./pages/QuestionEditPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const UserDetailPage = lazy(() => import('./pages/UserDetailPage'));
const MatchesPage = lazy(() => import('./pages/MatchesPage'));
const MatchDetailPage = lazy(() => import('./pages/MatchDetailPage'));
const CategoriesPage = lazy(() => import('./pages/CategoriesPage'));
const BansPage = lazy(() => import('./pages/BansPage'));
const TournamentsPage = lazy(() => import('./pages/TournamentsPage'));
const TournamentDetailPage = lazy(() => import('./pages/TournamentDetailPage'));
const SeasonsPage = lazy(() => import('./pages/SeasonsPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const RankTiersPage = lazy(() => import('./pages/RankTiersPage'));
const HomeControlPage = lazy(() => import('./pages/HomeControlPage'));
const AuditLogPage = lazy(() => import('./pages/AuditLogPage'));
const GameSettingsPage = lazy(() => import('./pages/GameSettingsPage'));
const ReferralCodesPage = lazy(() => import('./pages/ReferralCodesPage'));
const AiQuestionGenerationPage = lazy(() => import('./pages/AiQuestionGenerationPage'));

// Layout
import AdminLayout from './components/layout/AdminLayout';

// Types
type AdminLevel = 'admin' | 'super_admin';

// Protected route wrapper with optional RBAC
interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredLevel?: AdminLevel;
}

function ProtectedRoute({ children, requiredLevel }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, admin } = useAdminAuthStore();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const matchedRoute = getAdminRouteMatch(location.pathname);
  const routeRequires = matchedRoute?.requiredCapabilities || [];
  const lacksCapability = routeRequires.some((capability) => !hasCapability(admin?.capabilities, capability));

  if (lacksCapability) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="text-center bg-white p-8 rounded-xl shadow-lg max-w-md">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M4.93 19h14.14c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.2 16c-.77 1.333.192 3 1.73 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Access Restricted</h2>
          <p className="text-slate-600">
            Your admin session does not include the capability required for {matchedRoute?.label || 'this page'}.
          </p>
          <button
            onClick={() => window.history.back()}
            className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // Check admin level if required
  if (requiredLevel === 'super_admin' && admin?.adminLevel !== 'super_admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="text-center bg-white p-8 rounded-xl shadow-lg max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Access Denied</h2>
          <p className="text-slate-600">Super Admin access required for this page.</p>
          <button
            onClick={() => window.history.back()}
            className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function App() {
  const { checkSession, isLoading } = useAdminAuthStore();
  const didInitSessionCheck = useRef(false);

  useEffect(() => {
    if (didInitSessionCheck.current) return;
    didInitSessionCheck.current = true;

    // Check for existing session on app load
    void checkSession();
  }, [checkSession]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-slate-600">Initializing...</p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Public route */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected routes with admin layout */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="jobs" element={<JobsPage />} />
          <Route path="questions" element={<QuestionsPage />} />
          <Route path="questions/new" element={<QuestionEditPage />} />
          <Route path="questions/:id" element={<QuestionEditPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="users/:id" element={<UserDetailPage />} />
          <Route path="matches" element={<MatchesPage />} />
          <Route path="matches/:id" element={<MatchDetailPage />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="bans" element={<BansPage />} />
          <Route path="tournaments" element={<TournamentsPage />} />
          <Route path="tournaments/:id" element={<TournamentDetailPage />} />
          <Route path="seasons" element={<SeasonsPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="rank-tiers" element={<RankTiersPage />} />
          <Route path="home-control" element={<HomeControlPage />} />
          <Route path="audit-log" element={<AuditLogPage />} />
          <Route path="game-settings" element={<GameSettingsPage />} />
          <Route path="referral-codes" element={<ReferralCodesPage />} />
          <Route path="ai-questions" element={<AiQuestionGenerationPage />} />
        </Route>

        {/* Catch all */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      <ToastContainer />
    </BrowserRouter>
  );
}

export default App;
