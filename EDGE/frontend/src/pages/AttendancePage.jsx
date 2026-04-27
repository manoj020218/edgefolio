/**
 * AttendancePage.jsx - Employee Attendance Management
 * Features: Check-in/out, daily register, face recognition UI
 */

import React, { useState } from 'react';
import { Clock, Camera, AlertCircle, CheckCircle, Download, Filter } from 'lucide-react';
import { Button, Card, Table, Badge, Alert, Spinner } from '../components/atomic';
import { mockAttendance, mockEmployees, getAttendanceByDate, getAttendanceStats } from '../utils/mockData';

export const AttendancePage = () => {
  const [selectedDate, setSelectedDate] = useState('2026-04-24');
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkInTime, setCheckInTime] = useState(null);
  const [checkOutTime, setCheckOutTime] = useState(null);
  const [showFaceRecognition, setShowFaceRecognition] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all'); // all, present, absent, leave

  // Simulate attendance for today
  const todayAttendance = getAttendanceByDate(selectedDate);
  const attendanceStats = getAttendanceStats();

  // Simulate check-in
  const handleCheckIn = async () => {
    setIsCheckingIn(true);
    setShowFaceRecognition(true);
    
    // Simulate face recognition
    setTimeout(() => {
      setCheckInTime(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setIsCheckingIn(false);
      setShowFaceRecognition(false);
    }, 2000);
  };

  // Simulate check-out
  const handleCheckOut = async () => {
    setIsCheckingOut(true);
    setShowFaceRecognition(true);
    
    setTimeout(() => {
      setCheckOutTime(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setIsCheckingOut(false);
      setShowFaceRecognition(false);
    }, 2000);
  };

  // Filter attendance data
  const filteredAttendance = filterStatus === 'all' 
    ? todayAttendance 
    : todayAttendance.filter(att => att.status === filterStatus);

  // Map attendance with employee names
  const attendanceWithNames = filteredAttendance.map(att => {
    const employee = mockEmployees.find(emp => emp.id === att.memberId);
    return {
      ...att,
      employeeName: employee?.name || 'Unknown',
      department: employee?.department || 'N/A'
    };
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Attendance Management</h1>
          <p className="text-slate-400 mt-1">Track employee check-in/out and face recognition</p>
        </div>
        <Button icon={Download} variant="secondary">
          Export Report
        </Button>
      </div>

      {/* Quick Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <div className="space-y-2">
            <p className="text-slate-400 text-sm font-medium">Total Present</p>
            <p className="text-3xl font-bold text-green-400">{attendanceStats.present}</p>
            <p className="text-xs text-slate-500">of {attendanceStats.total} employees</p>
          </div>
        </Card>
        
        <Card>
          <div className="space-y-2">
            <p className="text-slate-400 text-sm font-medium">Absent</p>
            <p className="text-3xl font-bold text-red-400">{attendanceStats.absent}</p>
            <p className="text-xs text-slate-500">Not marked present</p>
          </div>
        </Card>

        <Card>
          <div className="space-y-2">
            <p className="text-slate-400 text-sm font-medium">On Leave</p>
            <p className="text-3xl font-bold text-amber-400">{attendanceStats.leave}</p>
            <p className="text-xs text-slate-500">Approved leaves</p>
          </div>
        </Card>

        <Card>
          <div className="space-y-2">
            <p className="text-slate-400 text-sm font-medium">Attendance %</p>
            <p className="text-3xl font-bold text-sky-400">{attendanceStats.percentage}%</p>
            <p className="text-xs text-slate-500">Today's average</p>
          </div>
        </Card>
      </div>

      {/* Check-in/Out Section */}
      <Card className="bg-gradient-to-r from-slate-800 to-slate-700">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-100">Your Attendance</h2>
              <p className="text-slate-400 text-sm">Mark your attendance using face recognition</p>
            </div>
            {showFaceRecognition && (
              <Spinner />
            )}
          </div>

          {/* Check-in/Out Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
              <p className="text-slate-400 text-sm mb-2">Check-In Time</p>
              {checkInTime ? (
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-6 h-6 text-green-400" />
                  <p className="text-2xl font-bold text-green-400">{checkInTime}</p>
                </div>
              ) : (
                <p className="text-xl font-semibold text-slate-300">Not checked in</p>
              )}
            </div>

            <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
              <p className="text-slate-400 text-sm mb-2">Check-Out Time</p>
              {checkOutTime ? (
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-6 h-6 text-blue-400" />
                  <p className="text-2xl font-bold text-blue-400">{checkOutTime}</p>
                </div>
              ) : (
                <p className="text-xl font-semibold text-slate-300">Not checked out</p>
              )}
            </div>
          </div>

          {/* Check-in/Out Buttons */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Button 
              variant="primary" 
              isFullWidth 
              icon={Clock}
              isLoading={isCheckingIn}
              onClick={handleCheckIn}
              isDisabled={checkInTime && !checkOutTime}
            >
              {checkInTime ? 'Checked In ✓' : 'Check In'}
            </Button>
            <Button 
              variant={checkOutTime ? 'secondary' : 'tertiary'}
              isFullWidth 
              icon={Clock}
              isLoading={isCheckingOut}
              onClick={handleCheckOut}
              isDisabled={!checkInTime || checkOutTime}
            >
              {checkOutTime ? 'Checked Out ✓' : 'Check Out'}
            </Button>
          </div>

          {/* Face Recognition Placeholder */}
          {showFaceRecognition && (
            <div className="bg-slate-900 p-8 rounded-lg border-2 border-sky-500 flex flex-col items-center justify-center space-y-3">
              <Camera className="w-12 h-12 text-sky-400 animate-pulse" />
              <p className="text-slate-200 font-medium">Scanning face...</p>
              <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                <div className="h-full bg-sky-500 animate-pulse" style={{ width: '70%' }}></div>
              </div>
              <p className="text-xs text-slate-500">Please look at the camera</p>
            </div>
          )}
        </div>
      </Card>

      {/* Attendance Register */}
      <Card>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-100">Daily Attendance Register</h2>
              <p className="text-slate-400 text-sm">Today's check-in and check-out records</p>
            </div>
          </div>

          {/* Date & Filter Controls */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-sm text-slate-400 mb-1 block">Select Date</label>
              <input 
                type="date" 
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div className="flex items-end gap-2">
              <Button icon={Filter} variant="secondary" isFullWidth>
                Quick Filters
              </Button>
            </div>

            <div className="flex items-end gap-2">
              <div className="flex gap-2">
                {['all', 'present', 'absent', 'leave'].map((status) => (
                  <button
                    key={status}
                    onClick={() => setFilterStatus(status)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      filterStatus === status
                        ? 'bg-sky-500 text-white'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Attendance Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-3 px-4 text-slate-400 font-semibold">Employee</th>
                  <th className="text-left py-3 px-4 text-slate-400 font-semibold">Department</th>
                  <th className="text-center py-3 px-4 text-slate-400 font-semibold">Check-In</th>
                  <th className="text-center py-3 px-4 text-slate-400 font-semibold">Check-Out</th>
                  <th className="text-center py-3 px-4 text-slate-400 font-semibold">Hours</th>
                  <th className="text-center py-3 px-4 text-slate-400 font-semibold">Status</th>
                  <th className="text-center py-3 px-4 text-slate-400 font-semibold">Face Match</th>
                </tr>
              </thead>
              <tbody>
                {attendanceWithNames.length > 0 ? (
                  attendanceWithNames.map((record, idx) => (
                    <tr key={record.eventId} className={idx % 2 === 0 ? 'bg-slate-900/50' : ''}>
                      <td className="py-3 px-4 text-slate-100 font-medium">{record.employeeName}</td>
                      <td className="py-3 px-4 text-slate-400">{record.department}</td>
                      <td className="py-3 px-4 text-center">
                        {record.checkIn ? (
                          <span className="text-green-400 font-medium">{record.checkIn}</span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {record.checkOut ? (
                          <span className="text-blue-400 font-medium">{record.checkOut}</span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {record.hoursWorked > 0 ? (
                          <span className="text-slate-300">{record.hoursWorked.toFixed(2)}h</span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge variant={
                          record.status === 'present' ? 'success' : 
                          record.status === 'absent' ? 'danger' : 
                          'warning'
                        }>
                          {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {record.faceMatch > 0 ? (
                          <span className={record.faceMatch > 95 ? 'text-green-400' : 'text-amber-400'}>
                            {record.faceMatch}%
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" className="py-8 text-center text-slate-400">
                      No attendance records found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4 border-t border-slate-700">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Total Employees:</span>
              <span className="font-bold text-slate-100">{mockEmployees.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Records Shown:</span>
              <span className="font-bold text-slate-100">{attendanceWithNames.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Attendance Rate:</span>
              <span className="font-bold text-green-400">{attendanceStats.percentage}%</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Absence Alert */}
      {attendanceStats.absent > 0 && (
        <Alert 
          variant="warning" 
          title="Absences Recorded"
          message={`${attendanceStats.absent} employee(s) marked absent today. Review and take necessary action.`}
        />
      )}
    </div>
  );
};

export default AttendancePage;
