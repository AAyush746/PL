import { useState } from 'react';
import { Send, Plus, Pencil, Trash2, RefreshCw, ShieldCheck, Database } from 'lucide-react';
import {
  getSendingProfiles,
  createSendingProfile,
  updateSendingProfile,
  deleteSendingProfile,
  testSendingProfile,
} from '../lib/api';
import { useAuth } from '../App';
import { useAsync, Spinner, EmptyState, PageHeader, Modal, cn } from '../components/ui';

const EMPTY_FORM = {
  name: '',
  host: '',
  port: 587,
  username: '',
  password: '',
  from_name: '',
  from_email: '',
  use_tls: false,
  simulate: true,
};

export default function SendingProfiles() {
  const { token } = useAuth();
  const { data, loading, error, reload } = useAsync(() => getSendingProfiles(token), [token]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [testBusy, setTestBusy] = useState('');
  const [testTo, setTestTo] = useState('');
  const [testMsg, setTestMsg] = useState('');

  const set = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [field]: value }));
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setSaveError('');
    setOpen(true);
  };

  const openEdit = (p) => {
    setEditing(p);
    setForm({
      name: p.name,
      host: p.host || '',
      port: p.port,
      username: p.username || '',
      password: '',
      from_name: p.from_name || '',
      from_email: p.from_email || '',
      use_tls: p.use_tls,
      simulate: p.simulate,
    });
    setSaveError('');
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaveError('');
    setSaving(true);
    try {
      const payload = { ...form };
      if (!payload.password) delete payload.password;
      if (editing) {
        await updateSendingProfile(token, editing.id, payload);
      } else {
        await createSendingProfile(token, payload);
      }
      setOpen(false);
      reload();
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p) => {
    if (!confirm(`Delete sending profile "${p.name}"?`)) return;
    try {
      await deleteSendingProfile(token, p.id);
      reload();
    } catch (err) {
      alert(err.message);
    }
  };

  const testSend = async (p) => {
    const target = testTo.trim();
    if (!target) {
      setTestMsg('Enter a recipient email to test against.');
      return;
    }
    setTestBusy(p.id);
    setTestMsg('');
    try {
      const result = await testSendingProfile(token, p.id, target);
      setTestMsg(result.message || 'Test message sent');
    } catch (err) {
      setTestMsg(err.message);
    } finally {
      setTestBusy('');
    }
  };

  if (loading) return <Spinner label="Loading sending profiles…" />;

  return (
    <div>
      <PageHeader
        title="Sending Profiles"
        subtitle="Per-organization SMTP relays. Each profile can simulate (outbox only) or send for real — pick one per campaign."
        actions={
          <button onClick={openCreate} className="btn-primary">
            <Plus size={16} />
            New profile
          </button>
        }
      />

      {error && <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>}

      {(data || []).length === 0 ? (
        <div className="glass-panel">
          <EmptyState
            icon={Send}
            title="No sending profiles yet"
            hint="Profiles hold SMTP relay details and credentials. Leave simulate on to keep campaigns outbox-only."
            action={
              <button onClick={openCreate} className="btn-primary">
                <Plus size={16} /> New profile
              </button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(data || []).map((p) => (
            <div key={p.id} className="glass-card flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display text-base font-semibold text-slate-900">{p.name}</h3>
                <span
                  className={cn(
                    'badge border shrink-0',
                    p.simulate
                      ? 'border-sky-500/25 bg-sky-500/10 text-sky-700'
                      : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700'
                  )}
                >
                  {p.simulate ? 'Simulated' : 'Real relay'}
                </span>
              </div>

              <div className="mt-3 space-y-1.5 text-xs text-slate-600">
                <p className="flex items-center gap-2">
                  <Database size={13} className="text-slate-400" />
                  {p.host || '—'}:{p.port}
                  {p.use_tls ? ' (TLS)' : ' (STARTTLS)'}
                </p>
                <p className="flex items-center gap-2 truncate">
                  <Send size={13} className="text-slate-400" />
                  {p.from_email || p.username || '—'}
                </p>
                <p className="flex items-center gap-2">
                  <ShieldCheck size={13} className="text-slate-400" />
                  Password: {p.has_password ? 'saved (encrypted)' : 'not set'}
                </p>
              </div>

              <div className="mt-4 flex flex-col gap-2">
                <label className="flex items-center gap-2">
                  <input
                    className="input !py-1.5 !text-xs"
                    placeholder="test@recipient.com"
                    value={testTo}
                    onChange={(e) => setTestTo(e.target.value)}
                  />
                  <button
                    onClick={() => testSend(p)}
                    disabled={testBusy === p.id}
                    className="btn-ghost !px-3 !py-1.5 !text-xs"
                  >
                    <RefreshCw size={13} className={cn(testBusy === p.id && 'animate-spin')} />
                    {testBusy === p.id ? 'Sending…' : 'Test'}
                  </button>
                </label>
                {testMsg && testBusy !== p.id && (
                  <p className="text-[11px] text-slate-500">{testMsg}</p>
                )}
                <div className="mt-1 flex gap-2">
                  <button onClick={() => openEdit(p)} className="btn-ghost flex-1 !py-2 !text-xs">
                    <Pencil size={13} /> Edit
                  </button>
                  <button onClick={() => remove(p)} className="btn-danger !px-3 !py-2 !text-xs">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit sending profile' : 'New sending profile'} wide>
        <form onSubmit={submit} className="space-y-4">
          {saveError && <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{saveError}</div>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Profile name</span>
              <input className="input" value={form.name} onChange={set('name')} placeholder="e.g. Corporate Mailgun relay" required />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">SMTP host</span>
              <input className="input" value={form.host} onChange={set('host')} placeholder="smtp.provider.com" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Port</span>
              <input className="input" type="number" value={form.port} onChange={set('port')} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Username</span>
              <input className="input" value={form.username} onChange={set('username')} placeholder="postmaster@…" autoComplete="off" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Password</span>
              <input
                className="input"
                type="password"
                value={form.password}
                onChange={set('password')}
                placeholder={editing?.has_password ? 'Leave blank to keep current password' : 'SMTP password (encrypted at rest)'}
                autoComplete="new-password"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">From name</span>
              <input className="input" value={form.from_name} onChange={set('from_name')} placeholder="e.g. Acme IT Security" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">From email</span>
              <input className="input" value={form.from_email} onChange={set('from_email')} placeholder="it-security@…" />
            </label>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.use_tls} onChange={set('use_tls')} className="h-4 w-4" />
              Use implicit TLS (SMTPS, port 465)
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.simulate} onChange={set('simulate')} className="h-4 w-4" />
              Simulate only (record to outbox, never send)
            </label>
          </div>
          {!form.simulate && (
            <p className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
              Turning this off will deliver real messages through {form.host || 'the configured host'}. Only do this with an
              approved relay and verified sending domain.
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-black/10 pt-4">
            <button type="button" onClick={() => setOpen(false)} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : editing ? 'Save changes' : 'Create profile'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
