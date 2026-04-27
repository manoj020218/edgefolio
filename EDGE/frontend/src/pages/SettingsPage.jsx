/**
 * SettingsPage.jsx - Configuration & Company Settings
 * Features: Company info, working hours, shifts, holidays, deductions
 */

import React, { useState } from 'react';
import { Settings, Plus, Edit2, Trash2 } from 'lucide-react';
import { Button, Card, Input, Select, Modal } from '../components/atomic';
import { mockCompanySettings, mockWorkingHours, mockShifts, mockHolidays, mockDeductions } from '../utils/mockData';

export const SettingsPage = () => {
  const [activeTab, setActiveTab] = useState('company');
  const [shifts, setShifts] = useState(mockShifts);
  const [holidays, setHolidays] = useState(mockHolidays);
  const [deductions, setDeductions] = useState(mockDeductions);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState('');

  const tabs = ['company', 'working-hours', 'shifts', 'holidays', 'deductions'];

  const handleAddShift = () => {
    alert('Shift added successfully');
    setIsModalOpen(false);
  };

  const handleDeleteShift = (id) => {
    setShifts(shifts.filter(s => s.shiftId !== id));
  };

  const handleDeleteHoliday = (id) => {
    setHolidays(holidays.filter(h => h.holidayId !== id));
  };

  const handleAddHoliday = () => {
    alert('Holiday added successfully');
    setIsModalOpen(false);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-2">
            <Settings className="w-8 h-8" /> Settings
          </h1>
          <p className="text-slate-400 mt-1">Configure company settings and policies</p>
        </div>
      </div>

      {/* Tabs */}
      <Card>
        <div className="flex flex-wrap gap-2 mb-6">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-sky-500 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {tab.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
            </button>
          ))}
        </div>
      </Card>

      {/* Company Settings Tab */}
      {activeTab === 'company' && (
        <Card>
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-100">Company Information</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Company Name"
                defaultValue={mockCompanySettings.companyName}
              />
              <Input
                label="Email"
                type="email"
                defaultValue={mockCompanySettings.email}
              />
              <Input
                label="Phone"
                defaultValue={mockCompanySettings.phone}
              />
              <Input
                label="GST Number"
                defaultValue={mockCompanySettings.gstNumber}
              />
            </div>

            <Input
              label="Address"
              defaultValue={mockCompanySettings.address}
            />

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Input
                label="City"
                defaultValue={mockCompanySettings.city}
              />
              <Input
                label="State"
                defaultValue={mockCompanySettings.state}
              />
              <Input
                label="Country"
                defaultValue={mockCompanySettings.country}
              />
              <Input
                label="Pincode"
                defaultValue={mockCompanySettings.pincode}
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button variant="secondary">Discard</Button>
              <Button variant="primary">Save Changes</Button>
            </div>
          </div>
        </Card>
      )}

      {/* Working Hours Tab */}
      {activeTab === 'working-hours' && (
        <Card>
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-100">Working Hours</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                label="Start Time"
                type="time"
                defaultValue={mockWorkingHours.startTime}
              />
              <Input
                label="End Time"
                type="time"
                defaultValue={mockWorkingHours.endTime}
              />
              <Input
                label="Break Duration (minutes)"
                type="number"
                defaultValue={mockWorkingHours.breakDuration}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Working Days Per Week"
                type="number"
                defaultValue={mockWorkingHours.daysPerWeek}
              />
              <Input
                label="Hours Per Day"
                type="number"
                defaultValue={mockWorkingHours.hoursPerDay}
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button variant="secondary">Discard</Button>
              <Button variant="primary">Save Changes</Button>
            </div>
          </div>
        </Card>
      )}

      {/* Shifts Tab */}
      {activeTab === 'shifts' && (
        <Card>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-100">Work Shifts</h2>
              <Button 
                icon={Plus} 
                variant="primary" 
                size="sm"
                onClick={() => {
                  setModalType('shift');
                  setIsModalOpen(true);
                }}
              >
                Add Shift
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {shifts.map(shift => (
                <div key={shift.shiftId} className="bg-slate-900 p-4 rounded-lg border border-slate-700">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="font-semibold text-slate-100">{shift.shiftName}</p>
                      <p className="text-sm text-slate-400">{shift.startTime} - {shift.endTime}</p>
                    </div>
                    <button
                      onClick={() => handleDeleteShift(shift.shiftId)}
                      className="text-red-400 hover:bg-slate-800 p-1 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-sm text-slate-400">Employees: {shift.employees}</p>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Holidays Tab */}
      {activeTab === 'holidays' && (
        <Card>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-100">Holidays</h2>
              <Button 
                icon={Plus} 
                variant="primary" 
                size="sm"
                onClick={() => {
                  setModalType('holiday');
                  setIsModalOpen(true);
                }}
              >
                Add Holiday
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {holidays.map(holiday => (
                <div key={holiday.holidayId} className="bg-slate-900 p-4 rounded-lg border border-slate-700 flex justify-between items-center">
                  <div>
                    <p className="font-semibold text-slate-100">{holiday.name}</p>
                    <p className="text-sm text-slate-400">{holiday.date}</p>
                  </div>
                  <button
                    onClick={() => handleDeleteHoliday(holiday.holidayId)}
                    className="text-red-400 hover:bg-slate-800 p-1 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Deductions Tab */}
      {activeTab === 'deductions' && (
        <Card>
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-100">Salary Deductions</h2>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-3 px-4 text-slate-400 font-semibold">Deduction</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-semibold">Type</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-semibold">Percentage</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {deductions.map((ded, idx) => (
                    <tr key={ded.deductionId} className={idx % 2 === 0 ? 'bg-slate-900/50' : ''}>
                      <td className="py-3 px-4 text-slate-100 font-medium">{ded.name}</td>
                      <td className="py-3 px-4 text-center capitalize text-slate-400">{ded.type}</td>
                      <td className="py-3 px-4 text-center text-slate-300">{ded.percentage}%</td>
                      <td className="py-3 px-4 text-center">
                        <button className="text-blue-400 hover:text-blue-300 mr-2">
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

export default SettingsPage;
