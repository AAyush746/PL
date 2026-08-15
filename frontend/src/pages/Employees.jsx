import { useRef, useState } from 'react';
import { Users, Plus, Search, Upload, Pencil, Trash2, FileSpreadsheet, PauseCircle } from 'lucide-react';
import { getEmployees, getDepartments, createEmployee, updateEmployee, deleteEmployee, importEmployees } from '../lib/api';
import { useAuth } from '../App';
import { useAsync, Spinner, EmptyState, PageHeader, Modal, cn, riskBg, ProgressBar } from '../components/ui';

export default function Employees() {
  const { token } = useAuth();
  const { data, loading, reload } = useAsync(() => getEmployees(token), [token]);
  const depts = useAsync(() => getDepartments(token), [token]);

  const [query, setQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', department: '' });
  const [csvText, setCsvText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const fileRef = useRef(null);

  const departments = depts.data || [];

  const filtered = (data || []).filter((e) => {
    if (deptFilter !== 'all' && e.department !== deptFilter) return false;
    if (query && !`${e.first_name} ${e.last_name} ${e.email} ${e.department}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const openAdd = () => {
    setEditing(null);
    setForm({ first_name: '', last_name: '', email: '', department: '' });
    setAddOpen(true);
  };

  const openEdit = (e) => {
    setEditing(e);
    setForm({ first_name: e.first_name, last_name: e.last_name, email: e.email, department: e.department || '' });
    setAddOpen(true);
  };

  const submit = async (ev) => {
    ev.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      if (editing) await updateEmployee(token, editing.id, form);
      else await createEmployee(token, form);
      setAddOpen(false);
      reload();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (e) => {
    if (!confirm(`Remove ${e.first_name} ${e.last_name}?`)) return;
    try {
      await deleteEmployee(token, e.id);
      reload();
    } catch (err) {
      alert(err.message);
    }
  };

  const toggleLeave = async (e) => {
    try {
      await updateEmployee(token, e.id, { on_leave: !e.on_leave });
      reload();
    } catch (err) {
      alert(err.message);
    }
  };

  const onImportFile = (file) => {
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result || ''));
    reader.readAsText(file);
  };

  const runImport = async () => {
    setBusy(true);
    setMessage('');
    try {
      const res = await importEmployees(token, csvText);
      setMessage(`Created ${res.created} employee(s).${res.errors?.length ? ` ${res.errors.length} row(s) failed.` : ''}`);
      setCsvText('');
      reload();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Spinner label="Loading employees…" />;

  return (
    <div>
      <PageHeader
        title="Employee Directory"
        subtitle="Everyone enrolled in phishing simulation and micro-learning."
        actions={
          <>
            <button onClick={() => setImportOpen(true)} className="btn-ghost">
              <Upload size={15} /> Import CSV
            </button>
            <button onClick={openAdd} className="btn-primary">
              <Plus size={16} /> Add employee
            </button>
          </>
        }
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:w-72">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input className="input pl-10" placeholder="Search name, email, department…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setDeptFilter('all')} className={cn('rounded-lg px-3 py-1.5 text-xs font-medium', deptFilter === 'all' ? 'bg-orange-500/15 text-orange-300' : 'text-slate-600 hover:bg-black/5')}>All</button>
          {departments.map((d) => (
            <button key={d.name} onClick={() => setDeptFilter(d.name)} className={cn('rounded-lg px-3 py-1.5 text-xs font-medium', deptFilter === d.name ? 'bg-orange-500/15 text-orange-300' : 'text-slate-600 hover:bg-black/5')}>
              {d.name}
            </button>
          ))}
        </div>
      </div>

      {message && (
        <div className={cn('mb-4 rounded-xl border px-4 py-3 text-sm', message.startsWith('Created') ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200' : 'border-rose-500/20 bg-rose-500/10 text-rose-200')}>
          {message}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="glass-panel">
          <EmptyState
            icon={Users}
            title={data && data.length === 0 ? 'No employees yet' : 'No employees match'}
            hint={
              data && data.length === 0
                ? 'Your organization starts with an empty directory. Add people manually or import a CSV (headers: first_name,last_name,email,department) — they will appear in the list below.'
                : 'No employees match the current search or department filter.'
            }
            action={
              data && data.length === 0 ? (
                <div className="flex gap-2">
                  <button onClick={() => setImportOpen(true)} className="btn-ghost"><Upload size={15} /> Import CSV</button>
                  <button onClick={openAdd} className="btn-primary"><Plus size={16} /> Add employee</button>
                </div>
              ) : (
                <button onClick={openAdd} className="btn-primary"><Plus size={16} /> Add employee</button>
              )
            }
          />
        </div>
      ) : (
        <div className="table-container">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/10 text-xs uppercase tracking-wider text-slate-500">
                <th className="px-6 py-3.5 font-medium">Employee</th>
                <th className="px-6 py-3.5 font-medium">Department</th>
                <th className="px-6 py-3.5 font-medium">Fails</th>
                <th className="px-6 py-3.5 font-medium">Training</th>
                <th className="px-6 py-3.5 font-medium">Risk</th>
                <th className="px-6 py-3.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} className="table-row">
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-600 to-slate-800 text-xs font-bold text-slate-800">
                        {e.first_name?.[0]}{e.last_name?.[0]}
                      </div>
                      <div>
                        <p className="flex items-center gap-2 font-medium text-slate-800">
                          {e.first_name} {e.last_name}
                          {e.on_leave && <span className="chip border border-amber-500/20 bg-amber-500/10 text-amber-700">On leave</span>}
                        </p>
                        <p className="text-xs text-slate-500">{e.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3.5">
                    <span className="chip border border-black/10 bg-black/5 text-slate-700">{e.department || '—'}</span>
                  </td>
                  <td className="px-6 py-3.5 text-slate-700">{e.fails ?? 0}</td>
                  <td className="px-6 py-3.5">
                    <span className={cn('chip border', e.training_completed ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700' : 'border-slate-500/20 bg-slate-500/10 text-slate-600')}>
                      {e.training_completed ? 'Completed' : 'Due'}
                    </span>
                  </td>
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-2">
                      <ProgressBar value={e.risk_score ?? 0} className="w-20" color={e.risk_score < 25 ? 'bg-emerald-400' : e.risk_score < 45 ? 'bg-amber-400' : e.risk_score < 70 ? 'bg-orange-400' : 'bg-rose-500'} />
                      <span className={cn('font-semibold', riskBg(e.risk_score))}>{e.risk_score ?? '—'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3.5">
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => toggleLeave(e)} title={e.on_leave ? 'Mark back to work' : 'Put on leave'} className="btn-ghost !px-2.5 !py-1.5 !text-xs">
                        <PauseCircle size={13} />
                      </button>
                      <button onClick={() => openEdit(e)} title="Edit" className="btn-ghost !px-2.5 !py-1.5 !text-xs">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => remove(e)} title="Remove" className="btn-danger !px-2.5 !py-1.5 !text-xs">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={editing ? 'Edit employee' : 'Add employee'}>
        {message && <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{message}</div>}
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">First name</span>
              <input className="input" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} required />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Last name</span>
              <input className="input" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} required />
            </label>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Email</span>
            <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Department</span>
            <input className="input" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="e.g. Engineering" list="dept-list" />
            <datalist id="dept-list">
              {departments.map((d) => <option key={d.name} value={d.name} />)}
            </datalist>
          </label>
          <div className="flex justify-end gap-2 border-t border-black/10 pt-4">
            <button type="button" onClick={() => setAddOpen(false)} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={busy} className="btn-primary">{busy ? 'Saving…' : editing ? 'Save changes' : 'Add employee'}</button>
          </div>
        </form>
      </Modal>

      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Import employees (CSV)" wide>
        <div className="space-y-4">
          <div className="rounded-xl border border-black/10 bg-slate-50/50 p-4">
            <p className="text-sm text-slate-700">Paste CSV or upload a file.</p>
            <p className="mt-1 font-mono text-xs text-slate-500">Headers: first_name,last_name,email,department</p>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-black/40 p-3 text-xs leading-relaxed text-slate-600">
first_name,last_name,email,department{'\n'}Sita,Poudel,sita.poudel@acme.local,Finance{'\n'}Kiran,Sharma,kiran.sharma@acme.local,Operations
            </pre>
          </div>

          <div className="flex items-center gap-3">
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onImportFile(e.target.files?.[0])} />
            <button onClick={() => fileRef.current?.click()} className="btn-ghost">
              <FileSpreadsheet size={15} /> Choose file
            </button>
            <span className="text-xs text-slate-500">{csvText ? `${csvText.trim().split(/\r?\n/).length - 1} data row(s) loaded` : 'No file chosen'}</span>
          </div>

          <textarea
            className="input min-h-[160px] font-mono !text-xs"
            placeholder="…or paste CSV here"
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
          />

          {message && (
            <div className={cn('rounded-xl border px-4 py-3 text-sm', message.startsWith('Created') ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200' : 'border-rose-500/20 bg-rose-500/10 text-rose-200')}>
              {message}
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-black/10 pt-4">
            <button onClick={() => setImportOpen(false)} className="btn-ghost">Done</button>
            <button onClick={runImport} disabled={busy || !csvText.trim()} className="btn-primary">
              {busy ? 'Importing…' : 'Import'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
