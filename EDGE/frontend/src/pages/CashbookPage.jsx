import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Plus, Trash2, RefreshCw, Download } from 'lucide-react';
import { Button, Card, Badge, Alert, Modal, Input, Select } from '../components/atomic';
import { getExpenses, getCashbookSummary, createExpense, approveExpense, deleteExpense } from '../services/api';

const PRESET_CATEGORIES = [
  'Raw Materials', 'Utilities', 'Transport', 'Maintenance',
  'Office', 'Salaries', 'Income / Receipt', 'Other',
];

export const CashbookPage = () => {
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState({ today: 0, thisMonth: 0, byCategory: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterCategory, setFilterCategory] = useState('all');
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    category: '', customCategory: '', amount: '', description: '', vendor: '',
  });

  const fetchAll = () => {
    setLoading(true);
    Promise.all([getExpenses(), getCashbookSummary()])
      .then(([expRes, sumRes]) => {
        setExpenses(expRes.data || []);
        setSummary(sumRes.data || { today: 0, thisMonth: 0, byCategory: [] });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, []);

  // All unique categories from presets + data
  const allCategories = [...new Set([
    ...PRESET_CATEGORIES,
    ...expenses.map((e) => e.category).filter(Boolean),
  ])].sort();

  const filteredExpenses = filterCategory === 'all'
    ? expenses
    : expenses.filter((e) => e.category === filterCategory);

  const effectiveCategory = formData.category === '__custom'
    ? formData.customCategory.trim()
    : formData.category;

  const handleAddExpense = async () => {
    if (!effectiveCategory || !formData.amount || !formData.description) {
      setError('Category, amount and description are required'); return;
    }
    setSaving(true);
    try {
      await createExpense({
        date:        formData.date,
        category:    effectiveCategory,
        amount:      Number(formData.amount),
        description: formData.description,
        vendor:      formData.vendor || 'N/A',
      });
      setIsModalOpen(false);
      setFormData({
        date: new Date().toISOString().split('T')[0],
        category: '', customCategory: '', amount: '', description: '', vendor: '',
      });
      fetchAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (id) => {
    try { await approveExpense(id); fetchAll(); }
    catch (err) { setError(err.message); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this expense?')) return;
    try { await deleteExpense(id); fetchAll(); }
    catch (err) { setError(err.message); }
  };

  const handleExportXLS = () => {
    const rows = filteredExpenses.map((e) => ({
      Date:        e.date,
      Description: e.description,
      Category:    e.category,
      Vendor:      e.vendor || '',
      Amount:      Number(e.amount),
      Status:      e.status,
    }));
    // Add totals row
    rows.push({
      Date: '',
      Description: 'TOTAL',
      Category: '',
      Vendor: '',
      Amount: rows.reduce((s, r) => s + r.Amount, 0),
      Status: '',
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    // Set column widths
    ws['!cols'] = [{ wch: 12 }, { wch: 35 }, { wch: 16 }, { wch: 20 }, { wch: 12 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cashbook');
    const dateStr = new Date().toISOString().slice(0, 10);
    const suffix  = filterCategory !== 'all' ? `-${filterCategory}` : '';
    XLSX.writeFile(wb, `cashbook${suffix}-${dateStr}.xlsx`);
  };

  const pendingAmount = expenses.filter((e) => e.status === 'pending').reduce((s, e) => s + Number(e.amount), 0);
  const pendingCount  = expenses.filter((e) => e.status === 'pending').length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Cashbook</h1>
          <p className="text-slate-400 mt-1">Track and manage business expenses</p>
        </div>
        <div className="flex gap-2">
          <Button icon={RefreshCw} variant="secondary" onClick={fetchAll}>Refresh</Button>
          <Button icon={Download} variant="secondary" onClick={handleExportXLS}>Export XLS</Button>
          <Button icon={Plus} variant="primary" onClick={() => setIsModalOpen(true)}>Add Expense</Button>
        </div>
      </div>

      {error && <Alert variant="danger" message={error} onClose={() => setError('')} />}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><div className="space-y-2">
          <p className="text-slate-400 text-sm font-medium">Today's Expenses</p>
          <p className="text-3xl font-bold text-sky-400">₹{Number(summary.today || 0).toLocaleString()}</p>
        </div></Card>
        <Card><div className="space-y-2">
          <p className="text-slate-400 text-sm font-medium">This Month</p>
          <p className="text-3xl font-bold text-green-400">₹{Number(summary.thisMonth || 0).toLocaleString()}</p>
          <p className="text-xs text-slate-500">{expenses.length} transactions</p>
        </div></Card>
        <Card><div className="space-y-2">
          <p className="text-slate-400 text-sm font-medium">Pending Approval</p>
          <p className="text-3xl font-bold text-amber-400">₹{pendingAmount.toLocaleString()}</p>
          <p className="text-xs text-slate-500">{pendingCount} awaiting</p>
        </div></Card>
      </div>

      {(summary.byCategory || []).length > 0 && (
        <Card>
          <h2 className="text-xl font-bold text-slate-100 mb-4">By Category</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {summary.byCategory.map((cat) => (
              <div key={cat.category} className="bg-slate-900 p-3 rounded-lg border border-slate-700 text-center">
                <p className="text-sm text-slate-400 mb-1">{cat.category}</p>
                <p className="text-lg font-bold text-sky-400">₹{(Number(cat.amount) / 1000).toFixed(1)}K</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-slate-100">Expenses</h2>
              <p className="text-slate-400 text-sm">Showing {filteredExpenses.length} of {expenses.length}</p>
            </div>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm focus:border-sky-500 focus:outline-none"
            >
              <option value="all">All Categories</option>
              {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {loading ? (
            <div className="py-6 text-center text-slate-400">Loading expenses...</div>
          ) : (
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
                        <td className="py-3 px-4"><Badge variant="info">{exp.category}</Badge></td>
                        <td className="py-3 px-4 text-slate-400">{exp.vendor}</td>
                        <td className="py-3 px-4 text-right font-semibold text-slate-300">₹{Number(exp.amount).toLocaleString()}</td>
                        <td className="py-3 px-4 text-center">
                          <Badge variant={exp.status === 'approved' ? 'success' : 'warning'}>
                            {exp.status?.charAt(0).toUpperCase() + exp.status?.slice(1)}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex justify-center gap-2">
                            {exp.status === 'pending' && (
                              <button onClick={() => handleApprove(exp.expenseId)}
                                className="text-green-400 hover:bg-slate-700 px-2 py-1 rounded text-xs">
                                Approve
                              </button>
                            )}
                            <button onClick={() => handleDelete(exp.expenseId)}
                              className="text-red-400 hover:bg-slate-700 p-1 rounded">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="7" className="py-8 text-center text-slate-400">No expenses found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer totals */}
          {filteredExpenses.length > 0 && (
            <div className="flex justify-between items-center pt-3 border-t border-slate-700 text-sm">
              <span className="text-slate-400">{filteredExpenses.length} records</span>
              <span className="text-slate-100 font-bold">
                Total: ₹{filteredExpenses.reduce((s, e) => s + Number(e.amount), 0).toLocaleString()}
              </span>
            </div>
          )}
        </div>
      </Card>

      {/* Add Expense Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Add Expense / Income" size="lg">
        <div className="space-y-4">
          <Input label="Date" type="date" value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })} />

          {/* Category — preset or custom */}
          <div>
            <label className="block text-sm font-medium text-slate-100 mb-2">Category</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value, customCategory: '' })}
              className="w-full px-4 py-2 bg-slate-800 text-slate-100 border border-slate-700 rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
            >
              <option value="">Select category…</option>
              {PRESET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              <option value="__custom">+ Custom category…</option>
            </select>
          </div>
          {formData.category === '__custom' && (
            <Input label="Custom Category Name" placeholder="e.g. Festival Bonus, Site Rent…"
              value={formData.customCategory}
              onChange={(e) => setFormData({ ...formData, customCategory: e.target.value })} />
          )}

          <Input label="Amount (₹)" type="number" placeholder="0.00" value={formData.amount}
            onChange={(e) => setFormData({ ...formData, amount: e.target.value })} />
          <Input label="Description" placeholder="What is this expense for?"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
          <Input label="Vendor / Party Name (Optional)" placeholder="Supplier or party name"
            value={formData.vendor}
            onChange={(e) => setFormData({ ...formData, vendor: e.target.value })} />
        </div>
        <div className="flex gap-2 mt-6">
          <Button variant="secondary" onClick={() => setIsModalOpen(false)} isFullWidth>Cancel</Button>
          <Button variant="primary" onClick={handleAddExpense} isLoading={saving} isFullWidth>Save Entry</Button>
        </div>
      </Modal>
    </div>
  );
};

export default CashbookPage;
