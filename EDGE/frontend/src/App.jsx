import React, { useState, useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { LoginPage } from './pages/LoginPage'
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

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400 text-sm">Loading EDGEFOLIO...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <HashRouter>
        <UpdateBanner />
        <LoginPage onLoginSuccess={handleLoginSuccess} />
      </HashRouter>
    )
  }

  return (
    <HashRouter>
      <UpdateBanner />
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
