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
// licenseState: 'checking' | 'unlicensed' | 'blocked' | 'ok'
function App() {
  const [licenseState, setLicenseState] = useState('checking')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  // Step 1: Check license on boot (public endpoint, no token needed)
  useEffect(() => {
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
        // Backend offline — allow login flow to continue; enforcement will re-check
        setLicenseState('ok')
      })
  }, [])

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
