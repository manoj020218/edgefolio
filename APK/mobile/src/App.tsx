import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { getBaseUrl } from './lib/api';
import { useAuth } from './lib/auth';
import ServerSetupPage from './pages/ServerSetupPage';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import AdminShell from './pages/admin/AdminShell';
import LiveFeedPage from './pages/admin/LiveFeedPage';
import EmployeesPage from './pages/admin/EmployeesPage';
import AssignmentsPage from './pages/admin/AssignmentsPage';
import AlertsPage from './pages/admin/AlertsPage';
import AnalyticsPage from './pages/admin/AnalyticsPage';
import BroadcastPage from './pages/admin/BroadcastPage';
import PasswordResetsPage from './pages/admin/PasswordResetsPage';

export default function App() {
  const { user, loading } = useAuth();
  const [baseUrl, setBaseUrlState] = useState<string | null | 'loading'>('loading');

  useEffect(() => {
    getBaseUrl().then(setBaseUrlState);
  }, []);

  if (loading || baseUrl === 'loading') {
    return (
      <div className="flex min-h-full items-center justify-center">
        <p className="text-slate-400">Loading…</p>
      </div>
    );
  }

  if (!baseUrl) {
    return <ServerSetupPage onDone={setBaseUrlState} />;
  }

  // Forced gate — intercepts every route until the temp password is replaced.
  // Applies regardless of role/path; ChangePasswordPage clears this via
  // markPasswordChanged() on success, which re-renders past this check.
  if (user?.passwordMustChange) {
    return <ChangePasswordPage />;
  }

  const isAdmin = user?.role === 'hr-admin' || user?.role === 'owner';

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />

      <Route
        path="/"
        element={!user ? <Navigate to="/login" replace /> : isAdmin ? <Navigate to="/admin" replace /> : <HomePage />}
      />

      <Route
        path="/admin"
        element={user && isAdmin ? <AdminShell /> : <Navigate to="/" replace />}
      >
        <Route index element={<LiveFeedPage />} />
        <Route path="employees" element={<EmployeesPage />} />
        <Route path="assignments" element={<AssignmentsPage />} />
        <Route path="alerts" element={<AlertsPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="broadcast" element={<BroadcastPage />} />
        <Route path="password-resets" element={<PasswordResetsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
