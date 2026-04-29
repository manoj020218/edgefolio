import React, { useState, useEffect } from 'react';
import { Card, Button, Badge, Table, Avatar, Alert } from '../components/atomic';
import {
  Users, Clock, DollarSign, TrendingUp, AlertCircle,
  CheckCircle2, Calendar, BarChart3, Download, RefreshCw,
} from 'lucide-react';
import { getDashboard, getAttendance } from '../services/api';

const KPICard = ({ label, value, change, icon: Icon, color }) => {
  const isPositive = String(change).startsWith('+');
  return (
    <Card className="relative overflow-hidden">
      <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${color} opacity-10 rounded-full -mr-12 -mt-12`} />
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium text-slate-400">{label}</span>
          <div className={`p-2 rounded-lg bg-gradient-to-br ${color} bg-opacity-20`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
        </div>
        <div className="mb-4">
          <h3 className="text-2xl font-bold text-slate-100">{value}</h3>
          {change && (
            <p className={`text-xs font-medium mt-1 ${isPositive ? 'text-green-400' : 'text-red-400'}`}>{change}</p>
          )}
        </div>
        <div className="w-full bg-slate-700 rounded-full h-1">
          <div className="bg-gradient-to-r from-sky-500 to-blue-500 h-1 rounded-full w-3/4" />
        </div>
      </div>
    </Card>
  );
};

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
  const [dashboard, setDashboard] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = () => {
    setLoading(true);
    setError(null);
    Promise.all([getDashboard(), getAttendance()])
      .then(([dashRes, attRes]) => {
        setDashboard(dashRes.data);
        setAttendance(attRes.data || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const d = dashboard;

  const kpis = [
    { label: 'Total Employees', value: d ? String(d.employees?.total ?? 0) : '—', icon: Users, color: 'from-blue-600 to-blue-400' },
    { label: 'Present Today',   value: d ? String(d.attendance?.present ?? 0) : '—', icon: Clock, color: 'from-green-600 to-green-400' },
    { label: 'Monthly Payroll', value: d?.payroll ? `₹${(d.payroll.totalAmount / 100000).toFixed(1)}L` : '₹0', icon: DollarSign, color: 'from-purple-600 to-purple-400' },
    { label: 'Pending Leaves',  value: d ? String(d.leaves?.pending ?? 0) : '—', icon: AlertCircle, color: 'from-orange-600 to-orange-400' },
  ];

  const attendanceColumns = [
    {
      key: 'employeeName',
      label: 'Employee',
      render: (value, row) => (
        <div className="flex items-center gap-3">
          <Avatar initials={(value || 'EMP').split(' ').map(n => n[0]).join('').slice(0, 2)} size="sm" />
          <div className="text-left">
            <p className="font-medium text-slate-100">{value}</p>
            <p className="text-xs text-slate-400">{row.department}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'checkIn',
      label: 'Check In',
      render: (v) => <span className="text-slate-200">{v || '—'}</span>,
    },
    {
      key: 'checkOut',
      label: 'Check Out',
      render: (v) => <span className="text-slate-200">{v || '—'}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (v) => (
        <Badge variant={v === 'present' ? 'success' : 'danger'} size="sm">
          {v === 'present' ? '✓ Present' : '✗ Absent'}
        </Badge>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Dashboard</h1>
          <p className="text-slate-400 mt-1">Welcome back! Here's today's overview.</p>
        </div>
        <Button icon={RefreshCw} iconPosition="right" variant="secondary" onClick={fetchData}>
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="danger" title="Connection Error" message={error} />
      )}

      {d?.leaves?.pending > 0 && (
        <Alert
          variant="warning"
          title="⚠️ Action Required"
          message={`${d.leaves.pending} pending leave request(s) awaiting approval`}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpis.map((kpi, i) => <KPICard key={i} {...kpi} />)}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          icon={TrendingUp}
          label="Attendance Rate"
          value={d && d.employees?.total > 0
            ? ((d.attendance?.present / d.employees.total) * 100).toFixed(1)
            : '0'}
          unit="%"
          subtext="Today"
        />
        <StatCard
          icon={Clock}
          label="Absent Today"
          value={d ? String(d.attendance?.absent ?? 0) : '0'}
          unit=""
          subtext="Not marked present"
        />
        <StatCard
          icon={Calendar}
          label="Active Employees"
          value={d ? String(d.employees?.active ?? 0) : '0'}
          unit=""
          subtext="Currently working"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card
            header={
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-100">Today's Attendance</h2>
                <span className="text-xs text-slate-400">{attendance.length} records</span>
              </div>
            }
          >
            <Table columns={attendanceColumns} data={attendance.slice(0, 10)} />
          </Card>
        </div>

        <div className="space-y-6">
          {d?.payroll && (
            <Card header={<h3 className="text-lg font-semibold text-slate-100">Payroll Status</h3>}>
              <div className="p-3 bg-slate-900 rounded-lg border border-slate-700">
                <p className="font-medium text-slate-100">{d.payroll.monthKey}</p>
                <p className="text-xs text-slate-400 mt-1">
                  ₹{(d.payroll.totalAmount / 100000).toFixed(1)}L
                </p>
                <Badge
                  variant={d.payroll.status === 'completed' ? 'success' : 'warning'}
                  size="sm"
                  className="mt-2"
                >
                  {d.payroll.status}
                </Badge>
              </div>
            </Card>
          )}

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
                <span className="text-slate-400">Backend</span>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${error ? 'bg-red-500' : 'bg-green-500'}`} />
                  <span className="text-slate-200">{error ? 'Error' : 'Running'}</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Card
        header={
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-100">Attendance Trends</h2>
            <Button variant="tertiary" size="sm" icon={BarChart3}>View Details</Button>
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
