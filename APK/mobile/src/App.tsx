import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { apiGet, getBaseUrl } from './lib/api';
import { useAuth } from './lib/auth';
import ServerSetupPage from './pages/ServerSetupPage';
import LoginPage from './pages/LoginPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import AttendancePage from './pages/AttendancePage';
import AdminShell from './pages/admin/AdminShell';
import LiveFeedPage from './pages/admin/LiveFeedPage';
import EmployeesPage from './pages/admin/EmployeesPage';
import AssignmentsPage from './pages/admin/AssignmentsPage';
import AlertsPage from './pages/admin/AlertsPage';
import AnalyticsPage from './pages/admin/AnalyticsPage';
import BroadcastPage from './pages/admin/BroadcastPage';
import PasswordResetsPage from './pages/admin/PasswordResetsPage';
import EmployeeShell from './pages/employee/EmployeeShell';
import HomePage from './pages/employee/HomePage';
import WorkPage from './pages/employee/WorkPage';
import NewVisitPage from './pages/employee/NewVisitPage';
import VisitDetailPage from './pages/employee/VisitDetailPage';
import RequestsPage from './pages/employee/RequestsPage';
import NewRequestPage from './pages/employee/NewRequestPage';
import ProfilePage from './pages/employee/ProfilePage';
import DetailProfilePage from './pages/employee/DetailProfilePage';
import PaySettingsPage from './pages/employee/PaySettingsPage';
import DocumentsPage from './pages/employee/DocumentsPage';
import HelpSupportPage from './pages/employee/HelpSupportPage';
import FaceEnrollPage from './pages/employee/FaceEnrollPage';

function ChangePasswordRoute() {
  const navigate = useNavigate();
  return <ChangePasswordPage onDone={() => navigate('/profile')} />;
}

// AttendancePage needs to know today's workType (tour/wfh) before it can render —
// fetch it here rather than making the page itself route-aware.
function AttendanceRoute() {
  const navigate = useNavigate();
  const [workType, setWorkType] = useState<'tour' | 'wfh' | null | 'error'>(null);

  useEffect(() => {
    apiGet<{ workType: string }>('/today-status')
      .then((s) => setWorkType(s.workType === 'tour' || s.workType === 'wfh' ? s.workType : 'error'))
      .catch(() => setWorkType('error'));
  }, []);

  if (workType === null) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <p className="text-slate-400">Loading…</p>
      </div>
    );
  }
  if (workType === 'error') {
    return <Navigate to="/" replace />;
  }
  return <AttendancePage workType={workType} onBack={() => navigate('/')} />;
}

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
        element={!user ? <Navigate to="/login" replace /> : isAdmin ? <Navigate to="/admin" replace /> : <EmployeeShell />}
      >
        <Route index element={<HomePage />} />
        <Route path="work" element={<WorkPage />} />
        <Route path="requests" element={<RequestsPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>

      {/* Full-screen employee sub-flows — outside EmployeeShell, no bottom nav */}
      <Route path="/attendance" element={user && !isAdmin ? <AttendanceRoute /> : <Navigate to="/" replace />} />
      <Route path="/change-password" element={user ? <ChangePasswordRoute /> : <Navigate to="/login" replace />} />
      <Route path="/requests/new/:type" element={user && !isAdmin ? <NewRequestPage /> : <Navigate to="/" replace />} />
      <Route path="/work/new-visit" element={user && !isAdmin ? <NewVisitPage /> : <Navigate to="/" replace />} />
      <Route path="/work/visits/:id" element={user && !isAdmin ? <VisitDetailPage /> : <Navigate to="/" replace />} />
      <Route path="/profile/detail" element={user && !isAdmin ? <DetailProfilePage /> : <Navigate to="/" replace />} />
      <Route path="/profile/face-id" element={user && !isAdmin ? <FaceEnrollPage /> : <Navigate to="/" replace />} />
      <Route path="/profile/pay" element={user && !isAdmin ? <PaySettingsPage /> : <Navigate to="/" replace />} />
      <Route path="/profile/documents" element={user && !isAdmin ? <DocumentsPage /> : <Navigate to="/" replace />} />
      <Route path="/profile/help" element={user && !isAdmin ? <HelpSupportPage /> : <Navigate to="/" replace />} />

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
