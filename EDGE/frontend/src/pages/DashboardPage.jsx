/**
 * EDGEFOLIO - Dashboard Page
 * Main dashboard with KPIs, quick stats, and actionable insights
 */

import React, { useState } from 'react';
import {
  Card,
  Button,
  Badge,
  Table,
  Avatar,
  Alert,
} from '../components/atomic';
import {
  Users,
  Clock,
  DollarSign,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Calendar,
  BarChart3,
  Download,
} from 'lucide-react';

// Mock Data
const mockKPIs = [
  {
    id: 1,
    label: 'Total Employees',
    value: '245',
    change: '+12%',
    icon: Users,
    color: 'from-blue-600 to-blue-400',
  },
  {
    id: 2,
    label: 'Present Today',
    value: '238',
    change: '+5%',
    icon: Clock,
    color: 'from-green-600 to-green-400',
  },
  {
    id: 3,
    label: 'Monthly Payroll',
    value: '₹48.5L',
    change: '-2%',
    icon: DollarSign,
    color: 'from-purple-600 to-purple-400',
  },
  {
    id: 4,
    label: 'Pending Leaves',
    value: '12',
    change: '+3',
    icon: AlertCircle,
    color: 'from-orange-600 to-orange-400',
  },
];

const mockAttendanceToday = [
  {
    id: 'EMP-001',
    name: 'Ramesh Kumar',
    dept: 'Production',
    checkIn: '09:00 AM',
    checkOut: '-',
    status: 'present',
    avatar: 'RK',
  },
  {
    id: 'EMP-002',
    name: 'Priya Singh',
    dept: 'Admin',
    checkIn: '09:15 AM',
    checkOut: '-',
    status: 'present',
    avatar: 'PS',
  },
  {
    id: 'EMP-003',
    name: 'Amit Patel',
    dept: 'Sales',
    checkIn: '-',
    checkOut: '-',
    status: 'absent',
    avatar: 'AP',
  },
  {
    id: 'EMP-004',
    name: 'Neha Sharma',
    dept: 'HR',
    checkIn: '08:45 AM',
    checkOut: '05:30 PM',
    status: 'present',
    avatar: 'NS',
  },
  {
    id: 'EMP-005',
    name: 'Ravi Kumar',
    dept: 'Finance',
    checkIn: '09:20 AM',
    checkOut: '-',
    status: 'present',
    avatar: 'RK',
  },
];

const mockUpcomingPayroll = [
  { id: 1, month: 'April 2024', status: 'processing', employees: 245 },
  { id: 2, month: 'March 2024', status: 'completed', employees: 245 },
  { id: 3, month: 'February 2024', status: 'completed', employees: 240 },
];

// KPI Card Component
const KPICard = ({ kpi }) => {
  const Icon = kpi.icon;
  const isPositive = kpi.change.startsWith('+');

  return (
    <Card className="relative overflow-hidden">
      <div
        className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${kpi.color} opacity-10 rounded-full -mr-12 -mt-12`}
      />
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium text-slate-400">{kpi.label}</span>
          <div className={`p-2 rounded-lg bg-gradient-to-br ${kpi.color} bg-opacity-20`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
        </div>
        <div className="mb-4">
          <h3 className="text-2xl font-bold text-slate-100">{kpi.value}</h3>
          <p className={`text-xs font-medium mt-1 ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
            {kpi.change}
          </p>
        </div>
        <div className="w-full bg-slate-700 rounded-full h-1">
          <div className="bg-gradient-to-r from-sky-500 to-blue-500 h-1 rounded-full w-3/4" />
        </div>
      </div>
    </Card>
  );
};

// Stat Cards
const StatCard = ({ icon: Icon, label, value, unit, subtext }) => (
  <Card className="text-center">
    <Icon className="w-8 h-8 text-sky-400 mx-auto mb-2" />
    <p className="text-sm text-slate-400 mb-2">{label}</p>
    <h4 className="text-3xl font-bold text-slate-100">
      {value}<span className="text-lg text-slate-400">{unit}</span>
    </h4>
    {subtext && <p className="text-xs text-slate-500 mt-2">{subtext}</p>}
  </Card>
);

export const DashboardPage = () => {
  const [dateRange, setDateRange] = useState('today');

  const attendanceColumns = [
    {
      key: 'name',
      label: 'Employee',
      render: (value, row) => (
        <div className="flex items-center gap-3">
          <Avatar initials={row.avatar} size="sm" />
          <div className="text-left">
            <p className="font-medium text-slate-100">{value}</p>
            <p className="text-xs text-slate-400">{row.dept}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'checkIn',
      label: 'Check In',
      render: (value) => <span className="text-slate-200">{value}</span>,
    },
    {
      key: 'checkOut',
      label: 'Check Out',
      render: (value) => <span className="text-slate-200">{value || '-'}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (value) => (
        <Badge
          variant={value === 'present' ? 'success' : 'danger'}
          size="sm"
        >
          {value === 'present' ? '✓ Present' : '✗ Absent'}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Dashboard</h1>
          <p className="text-slate-400 mt-1">Welcome back! Here's today's overview.</p>
        </div>
        <Button icon={Download} iconPosition="right">
          Export Report
        </Button>
      </div>

      {/* Quick Alerts */}
      <Alert
        variant="warning"
        title="⚠️ Action Required"
        message="2 pending leave requests and 1 salary disbursement awaiting approval"
      />

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {mockKPIs.map((kpi) => (
          <KPICard key={kpi.id} kpi={kpi} />
        ))}
      </div>

      {/* Mid-tier Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          icon={TrendingUp}
          label="Average Attendance"
          value="97.2"
          unit="%"
          subtext="vs 96.8% last month"
        />
        <StatCard
          icon={Clock}
          label="Avg Work Hours"
          value="8.5"
          unit="hrs"
          subtext="Target: 8 hours"
        />
        <StatCard
          icon={Calendar}
          label="Total Leave Days"
          value="18"
          unit="days"
          subtext="Used this month"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today's Attendance */}
        <div className="lg:col-span-2">
          <Card
            header={
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-100">Today's Attendance</h2>
                <select
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value)}
                  className="bg-slate-700 border border-slate-600 rounded px-3 py-1 text-sm text-slate-100"
                >
                  <option value="today">Today</option>
                  <option value="week">This Week</option>
                  <option value="month">This Month</option>
                </select>
              </div>
            }
          >
            <Table columns={attendanceColumns} data={mockAttendanceToday} />
            <div className="mt-4 flex justify-between items-center">
              <p className="text-sm text-slate-400">
                Showing 5 of {mockAttendanceToday.length} employees
              </p>
              <Button variant="tertiary" size="sm">
                View All
              </Button>
            </div>
          </Card>
        </div>

        {/* Quick Actions Sidebar */}
        <div className="space-y-6">
          {/* Payroll Status */}
          <Card
            header={<h3 className="text-lg font-semibold text-slate-100">Payroll Status</h3>}
          >
            <div className="space-y-3">
              {mockUpcomingPayroll.map((payroll) => (
                <div
                  key={payroll.id}
                  className="p-3 bg-slate-900 rounded-lg border border-slate-700 hover:border-slate-600 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-slate-100">{payroll.month}</p>
                      <p className="text-xs text-slate-400">{payroll.employees} employees</p>
                    </div>
                    <Badge
                      variant={payroll.status === 'completed' ? 'success' : 'warning'}
                      size="sm"
                    >
                      {payroll.status === 'completed' ? '✓' : '⏳'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
            <Button isFullWidth className="mt-4" variant="secondary" size="sm">
              View Payroll
            </Button>
          </Card>

          {/* Quick Actions */}
          <Card header={<h3 className="text-lg font-semibold text-slate-100">Quick Actions</h3>}>
            <div className="space-y-2">
              <Button isFullWidth variant="secondary" size="sm">
                New Employee
              </Button>
              <Button isFullWidth variant="secondary" size="sm">
                Check In/Out
              </Button>
              <Button isFullWidth variant="secondary" size="sm">
                Process Payroll
              </Button>
              <Button isFullWidth variant="secondary" size="sm">
                Leave Request
              </Button>
            </div>
          </Card>

          {/* System Status */}
          <Card header={<h3 className="text-lg font-semibold text-slate-100">System Status</h3>}>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Database</span>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  <span className="text-slate-200">Connected</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Backup</span>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  <span className="text-slate-200">Last 2h ago</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Sync</span>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full" />
                  <span className="text-slate-200">No internet</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Charts Placeholder */}
      <Card
        header={
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-100">Attendance Trends</h2>
            <Button variant="tertiary" size="sm" icon={BarChart3}>
              View Details
            </Button>
          </div>
        }
      >
        <div className="h-64 bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg flex items-center justify-center border border-slate-700">
          <div className="text-center">
            <BarChart3 className="w-12 h-12 text-slate-600 mx-auto mb-2" />
            <p className="text-slate-400">Chart integration coming soon</p>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default DashboardPage;
