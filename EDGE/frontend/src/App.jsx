import React, { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
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

  const handleLoginSuccess = (userData) => {
    setUser(userData)
    setIsAuthenticated(true)
  }

  const handleLogout = () => {
    setUser(null)
    setIsAuthenticated(false)
  }

  if (!isAuthenticated) {
    return (
      <BrowserRouter>
        <UpdateBanner />
        <LoginPage onLoginSuccess={handleLoginSuccess} />
      </BrowserRouter>
    )
  }

  return (
    <BrowserRouter>
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
    </BrowserRouter>
  )
}

export default App
