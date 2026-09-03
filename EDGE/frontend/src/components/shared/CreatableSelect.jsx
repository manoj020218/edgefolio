import React, { useState } from 'react';
import { Button } from '../atomic';

// A <Select> that can also create a brand-new option inline — used for
// Department/Designation pickers so HR never has to leave the form (or
// leave Settings out of sync) just to add a value that doesn't exist yet.
// `options` is [{ value, label }]; `onCreate(name)` must return the created
// row (any shape with a `.name`) and is responsible for actually persisting
// it (e.g. createDepartment/createDesignation) so it shows up everywhere
// else this same list is used.
export function CreatableSelect({
  label, value, onChange, options = [], onCreate, createLabel = '+ Create New', placeholder = '— Select —',
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setSaving(true); setErr('');
    try {
      const created = await onCreate(name);
      onChange(created.name);
      setCreating(false); setNewName('');
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="w-full">
      {label && <label className="block mb-2 text-sm font-medium text-slate-100">{label}</label>}
      {!creating ? (
        <select
          value={value || ''}
          onChange={(e) => {
            if (e.target.value === '__new__') { setCreating(true); setNewName(''); setErr(''); }
            else onChange(e.target.value);
          }}
          className="w-full px-4 py-2 bg-slate-800 text-slate-100 border border-slate-700 rounded-lg
            focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm"
        >
          <option value="">{placeholder}</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          <option value="__new__">{createLabel}</option>
        </select>
      ) : (
        <div className="space-y-1.5">
          {err && <p className="text-red-400 text-xs">{err}</p>}
          <div className="flex gap-2">
            <input
              autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              placeholder="New name"
              className="flex-1 bg-slate-800 border border-sky-600 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none"
            />
            <Button size="sm" variant="primary" isLoading={saving} onClick={handleCreate}>Add</Button>
            <Button size="sm" variant="secondary" onClick={() => { setCreating(false); setNewName(''); }}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
