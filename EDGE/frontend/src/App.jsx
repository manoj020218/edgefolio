import React, { useState, useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { LoginPage } from './pages/LoginPage'
import { ActivationPage } from './pages/ActivationPage'
import { DashboardPage } from './pages/DashboardPage'
import { AttendancePage } from './pages/AttendancePage'
import { EmployeesPage } from './pages/EmployeesPage'
import { PayrollPage } from './pages/PayrollPage'
import { ReportsPage } from './pages/ReportsPage'
import { LeaveManagementPage } from './pages/LeaveManagementPage'
import { SettingsPage } from './pages/SettingsPage'
import { CashbookPage } from './pages/CashbookPage'
import { MainLayout } from './layouts/MainLayout'
import { UpdateBanner } from './components/common/UpdateBanner'
import { AnnouncementBanner } from './components/common/AnnouncementBanner'
import { getLicenseStatus } from './services/api'

// Boot order: license check → activation | (auth setup | login) | main app
// licenseState: 'checking' | 'unlicensed' | 'blocked' | 'ok' | 'backend-unreachable'
function App() {
  const [licenseState, setLicenseState] = useState('checking')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  // Step 1: Check license on boot (public endpoint, no token needed). The local backend
  // starts before the window loads, but a transient hiccup (e.g. antivirus briefly
  // locking freshly-written files right after install) can still make the very first
  // request fail — retry a few times before concluding the backend is genuinely down,
  // rather than silently falling through to a login screen that can't actually work.
  const checkLicense = (attempt = 1) => {
    getLicenseStatus()
      .then((res) => {
        const state = res.data?.state
        if (state === 'unlicensed' || state === 'blocked') {
          setLicenseState(state === 'blocked' ? 'blocked' : 'unlicensed')
        } else {
          setLicenseState('ok')
        }
      })
      .catch(() => {
        if (attempt < 5) {
          setTimeout(() => checkLicense(attempt + 1), 1500)
        } else {
          setLicenseState('backend-unreachable')
        }
      })
  }
  useEffect(() => { checkLicense() }, [])

  // Step 2: Restore session from localStorage (runs in parallel with license check)
  useEffect(() => {
    const token = localStorage.getItem('ef_token')
    const savedUser = localStorage.getItem('ef_user')
    if (token && savedUser) {
      try {
        setUser(JSON.parse(savedUser))
        setIsAuthenticated(true)
      } catch {
        localStorage.removeItem('ef_token')
        localStorage.removeItem('ef_user')
      }
    }
    setIsLoading(false)
  }, [])

  // Global 401 handler — the API interceptor dispatches this when a request fails
  // with 401 on a non-auth endpoint, meaning the session has expired or been revoked.
  useEffect(() => {
    const onUnauthorized = () => {
      setUser(null)
      setIsAuthenticated(false)
    }
    window.addEventListener('ef:unauthorized', onUnauthorized)
    return () => window.removeEventListener('ef:unauthorized', onUnauthorized)
  }, [])

  const handleLoginSuccess = (userData, token) => {
    localStorage.setItem('ef_token', token)
    localStorage.setItem('ef_user', JSON.stringify(userData))
    setUser(userData)
    setIsAuthenticated(true)
  }

  const handleLogout = () => {
    localStorage.removeItem('ef_token')
    localStorage.removeItem('ef_user')
    setUser(null)
    setIsAuthenticated(false)
  }

  const handleActivated = () => {
    setLicenseState('ok')
  }

  // Loading: wait for both license check and session restore
  if (licenseState === 'checking' || isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400 text-sm">Loading EDGEFOLIO...</div>
      </div>
    )
  }

  // Backend genuinely unreachable after retries — show a real error, not a broken login form
  if (licenseState === 'backend-unreachable') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-bold text-slate-100 mb-2">Could not start EDGEFOLIO</h1>
          <p className="text-slate-400 text-sm mb-6">
            The local server didn't respond. This can happen if antivirus software is scanning
            the app right after install — please try closing and reopening EDGEFOLIO. If this
            keeps happening, contact support on WhatsApp: +91 72402 26566.
          </p>
          <button
            onClick={() => { setLicenseState('checking'); checkLicense() }}
            className="px-4 py-2 bg-sky-500 text-white rounded-lg text-sm font-medium hover:bg-sky-600"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  // License gate: unlicensed or blocked → show activation screen
  if (licenseState === 'unlicensed' || licenseState === 'blocked') {
    return (
      <HashRouter>
        <ActivationPage onActivated={handleActivated} />
      </HashRouter>
    )
  }

  // Not authenticated → login / setup flow
  if (!isAuthenticated) {
    return (
      <HashRouter>
        <UpdateBanner />
        <AnnouncementBanner />
        <LoginPage onLoginSuccess={handleLoginSuccess} />
      </HashRouter>
    )
  }

  return (
    <HashRouter>
      <UpdateBanner />
      <AnnouncementBanner />
      <MainLayout user={user} onLogout={handleLogout}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/attendance" element={<AttendancePage />} />
          <Route path="/employees" element={<EmployeesPage />} />
          <Route path="/payroll" element={<PayrollPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/leave" element={<LeaveManagementPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/cashbook" element={<CashbookPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </MainLayout>
    </HashRouter>
  )
}

export default App
