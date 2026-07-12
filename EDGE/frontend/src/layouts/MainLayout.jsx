import React, { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Clock,
  Users,
  DollarSign,
  BarChart3,
  CalendarDays,
  Settings,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Wifi,
  WifiOff,
  Bell,
  Menu,
} from 'lucide-react'
import { getDisputeCount } from '../services/api'
import { LicenseBanner } from '../components/common/LicenseBanner'

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/attendance', label: 'Attendance', icon: Clock },
  { path: '/employees', label: 'Employees', icon: Users },
  { path: '/payroll', label: 'Payroll', icon: DollarSign },
  { path: '/reports', label: 'Reports', icon: BarChart3 },
  { path: '/leave', label: 'Leave', icon: CalendarDays },
  { path: '/cashbook', label: 'Cashbook', icon: BookOpen },
  { path: '/settings', label: 'Settings', icon: Settings },
]

export function MainLayout({ children, user, onLogout }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [openDisputeCount, setOpenDisputeCount] = useState(0)
  const location = useLocation()
  const isOnline = navigator.onLine

  useEffect(() => {
    const poll = () => getDisputeCount().then((r) => setOpenDisputeCount(r.data?.open || 0)).catch(() => {})
    poll()
    const t = setInterval(poll, 30000)
    return () => clearInterval(t)
  }, [])

  const currentPage = navItems.find((n) => n.path === location.pathname)?.label || 'EDGEFOLIO'

  return (
    <div className="flex h-screen bg-slate-900 overflow-hidden">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:relative z-30 flex flex-col h-full bg-slate-800 border-r border-slate-700
          transition-all duration-300 ease-in-out
          ${collapsed ? 'w-16' : 'w-64'}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Logo */}
        <div className="flex items-center h-16 px-4 border-b border-slate-700">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-sm">EF</span>
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-white font-bold text-sm truncate">EDGEFOLIO</p>
                <p className="text-slate-400 text-xs truncate">Edge Payroll</p>
              </div>
            )}
          </div>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="ml-auto p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700 hidden lg:flex"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 overflow-y-auto scrollbar-thin">
          {navItems.map(({ path, label, icon: Icon }) => {
            const isPayroll = path === '/payroll'
            const showBadge = isPayroll && openDisputeCount > 0
            return (
              <NavLink
                key={path}
                to={path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-2.5 mx-2 mb-0.5 rounded-lg text-sm font-medium transition-all
                  ${isActive
                    ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700/60'
                  }`
                }
                onClick={() => setMobileOpen(false)}
                title={collapsed ? label : ''}
              >
                <div className="relative flex-shrink-0">
                  <Icon className="w-5 h-5" />
                  {showBadge && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white text-[9px] font-bold flex items-center justify-center leading-none">
                      {openDisputeCount > 9 ? '9+' : openDisputeCount}
                    </span>
                  )}
                </div>
                {!collapsed && (
                  <span className="flex-1 flex items-center justify-between">
                    {label}
                    {showBadge && (
                      <span className="text-xs bg-red-500 text-white rounded-full px-1.5 py-0.5 leading-none font-bold">
                        {openDisputeCount}
                      </span>
                    )}
                  </span>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* User */}
        <div className="border-t border-slate-700 p-3">
          <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
            <div className="w-8 h-8 rounded-full bg-primary-500/20 border border-primary-500/30 flex items-center justify-center flex-shrink-0">
              <span className="text-primary-400 text-xs font-bold">
                {user?.email?.[0]?.toUpperCase() ?? 'A'}
              </span>
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-slate-200 text-xs font-medium truncate">
                  {user?.email ?? 'admin@edgefolio.com'}
                </p>
                <p className="text-slate-500 text-xs">Master Admin</p>
              </div>
            )}
            {!collapsed && (
              <button
                onClick={onLogout}
                className="p-1 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top nav */}
        <header className="h-16 flex items-center gap-4 px-6 border-b border-slate-700 bg-slate-800/50 flex-shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded"
          >
            <Menu className="w-5 h-5" />
          </button>

          <h1 className="text-slate-100 font-semibold text-lg">{currentPage}</h1>

          <div className="ml-auto flex items-center gap-3">
            {/* Online status */}
            <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full
              ${isOnline ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}
            >
              {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              <span>{isOnline ? 'Online' : 'Offline'}</span>
            </div>

            {/* Notification bell */}
            <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg relative">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-primary-500 rounded-full" />
            </button>

            {/* Date */}
            <span className="text-slate-400 text-xs hidden sm:block">
              {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>
        </header>

        {/* License banner (expiring / grace / readonly) */}
        <LicenseBanner />

        {/* Page content */}
        <main className="flex-1 min-h-0 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
