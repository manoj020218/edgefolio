/**
 * CashbookPage.jsx - Expense Tracking & Management
 * Features: Add expenses, categorize, track by date
 */

import React, { useState } from 'react();
import { Plus, Edit2, Trash2, Filter } from 'lucide-react';
import { Button, Card, Table, Badge, Modal, Input, Select } from '../components/atomic';
import { mockExpenses, expenseCategories, getExpenseSummary } from '../utils/mockData';

export const CashbookPage = () => {
  const [expenses, setExpenses] = useState(mockExpenses);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filterCategory, setFilterCategory] = useState('all');
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    category: '',
    amount: '',
    description: '',
    vendor: ''
  });

  const summary = getExpenseSummary();

  const handleAddExpense = () => {
    if (!formData.category || !formData.amount || !formData.description) {
      alert('Please fill all required fields');
      return;
    }

    const newExpense = {
      expenseId: `EXP-${expenses.length + 1}`,
      date: formData.date,
      category: formData.category,
      amount: Number(formData.amount),
      description: formData.description,
      vendor: formData.vendor || 'N/A',
      receipt: 'receipt.pdf',
      status: 'pending'
    };

    setExpenses([...expenses, newExpense]);
    setIsModalOpen(false);
    setFormData({
      date: new Date().toISOString().split('T')[0],
      category: '',
      amount: '',
      description: '',
      vendor: ''
    });
  };

  const handleDeleteExpense = (id) => {
    setExpenses(expenses.filter(exp => exp.expenseId !== id));
  };

  const handleApproveExpense = (id) => {
    setExpenses(expenses.map(exp => 
      exp.expenseId === id ? { ...exp, status: 'approved' } : exp
    ));
  };

  const filteredExpenses = filterCategory === 'all' 
    ? expenses 
    : expenses.filter(exp => exp.category === filterCategory);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Cashbook</h1>
          <p className="text-slate-400 mt-1">Track and manage business expenses</p>
        </div>
        <Button icon={Plus} variant="primary" onClick={() => setIsModalOpen(true)}>
          Add Expense
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="space-y-2">
            <p className="text-slate-400 text-sm font-medium">Today's Expenses</p>
            <p className="text-3xl font-bold text-sky-400">₹{summary.today.toLocaleString()}</p>
            <p className="text-xs text-slate-500">{expenses.filter(e => e.date === new Date().toISOString().split('T')[0]).length} transactions</p>
          </div>
        </Card>

        <Card>
          <div className="space-y-2">
            <p className="text-slate-400 text-sm font-medium">This Month</p>
            <p className="text-3xl font-bold text-green-400">₹{summary.thisMonth.toLocaleString()}</p>
            <p className="text-xs text-slate-500">{expenses.length} total transactions</p>
          </div>
        </Card>

        <Card>
          <div className="space-y-2">
            <p className="text-slate-400 text-sm font-medium">Pending Approval</p>
            <p className="text-3xl font-bold text-amber-400">₹{expenses.filter(e => e.status === 'pending').reduce((sum, e) => sum + e.amount, 0).toLocaleString()}</p>
            <p className="text-xs text-slate-500">{expenses.filter(e => e.status === 'pending').length} awaiting</p>
          </div>
        </Card>
      </div>

      {/* Category Breakdown */}
      <Card>
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-slate-100">Expenses by Category</h2>
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {summary.byCategory.map(cat => (
              <div key={cat.category} className="bg-slate-900 p-3 rounded-lg border border-slate-700 text-center">
                <p className="text-sm text-slate-400 mb-1">{cat.category}</p>
                <p className="text-lg font-bold text-sky-400">₹{(cat.amount / 1000).toFixed(1)}K</p>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Expenses Table */}
      <Card>
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-slate-100">Recent Expenses</h2>
              <p className="text-slate-400 text-sm">Showing {filteredExpenses.length} of {expenses.length} expenses</p>
            </div>
            
            <Select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              options={[
                { value: 'all', label: 'All Categories' },
                ...expenseCategories.map(cat => ({ value: cat, label: cat }))
              ]}
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-3 px-4 text-slate-400 font-semibold">Date</th>
                  <th className="text-left py-3 px-4 text-slate-400 font-semibold">Description</th>
                  <th className="text-left py-3 px-4 text-slate-400 font-semibold">Category</th>
                  <th className="text-left py-3 px-4 text-slate-400 font-semibold">Vendor</th>
                  <th className="text-right py-3 px-4 text-slate-400 font-semibold">Amount</th>
                  <th className="text-center py-3 px-4 text-slate-400 font-semibold">Status</th>
                  <th className="text-center py-3 px-4 text-slate-400 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.length > 0 ? (
                  filteredExpenses.map((exp, idx) => (
                    <tr key={exp.expenseId} className={idx % 2 === 0 ? 'bg-slate-900/50' : ''}>
                      <td className="py-3 px-4 text-slate-400">{exp.date}</td>
                      <td className="py-3 px-4 text-slate-100 font-medium">{exp.description}</td>
                      <td className="py-3 px-4">
                        <Badge variant="info">{exp.category}</Badge>
                      </td>
                      <td className="py-3 px-4 text-slate-400">{exp.vendor}</td>
                      <td className="py-3 px-4 text-right font-semibold text-slate-300">₹{exp.amount.toLocaleString()}</td>
                      <td className="py-3 px-4 text-center">
                        <Badge variant={exp.status === 'approved' ? 'success' : 'warning'}>
                          {exp.status.charAt(0).toUpperCase() + exp.status.slice(1)}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex justify-center gap-2">
                          {exp.status === 'pending' && (
                            <button
                              onClick={() => handleApproveExpense(exp.expenseId)}
                              className="text-green-400 hover:bg-slate-700 p-1 rounded text-xs"
                            >
                              Approve
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteExpense(exp.expenseId)}
                            className="text-red-400 hover:bg-slate-700 p-1 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" className="py-8 text-center text-slate-400">
                      No expenses found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* Add Expense Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add Expense"
        size="lg"
      >
        <div className="space-y-4">
          <Input
            label="Date"
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
          />

          <Select
            label="Category"
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            options={expenseCategories.map(cat => ({ value: cat, label: cat }))}
          />

          <Input
            label="Amount"
            type="number"
            placeholder="0.00"
            value={formData.amount}
            onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
          />

          <Input
            label="Description"
            placeholder="What is this expense for?"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />

          <Input
            label="Vendor/Supplier (Optional)"
            placeholder="Company name"
            value={formData.vendor}
            onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
          />
        </div>

        <div className="flex gap-2 mt-6">
          <Button variant="secondary" onClick={() => setIsModalOpen(false)} isFullWidth>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleAddExpense} isFullWidth>
            Add Expense
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default CashbookPage;
