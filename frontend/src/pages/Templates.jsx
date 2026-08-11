import { useState } from 'react';
import { FileText, Plus, Eye, Trash2, EyeOff } from 'lucide-react';
import { getTemplates, createTemplate, deleteTemplate } from '../lib/api';
import { useAuth } from '../App';
import { useAsync, Spinner, EmptyState, PageHeader, Modal, DifficultyDots, cn } from '../components/ui';

const CATEGORY_HINTS = [
  { label: 'Credential harvest', subject: 'Password expiry — action required', body: '<p style="font-family:sans-serif">Hi {{NAME}},</p>\n<p>Your mailbox password expires today. Keep it and <a href="{{TRACKING_LINK}}">confirm here</a>.</p>' },
  { label: 'Invoice / billing', subject: 'Overdue invoice INV-1024', body: '<p style="font-family:sans-serif">Hi {{NAME}},</p>\n<p>A payment of $1,240.00 is marked overdue. <a href="{{TRACKING_LINK}}">Review invoice</a>.</p>' },
  { label: 'Meeting / calendar', subject: 'Re: Meeting invite — urgent reschedule', body: '<p style="font-family:sans-serif">Hi {{NAME}},</p>\n<p>Your manager needs to move tomorrow\u2019s meeting. <a href="{{TRACKING_LINK}}">Pick a new slot</a>.</p>' },
  { label: 'Package delivery', subject: 'Your delivery is on hold', body: '<p style="font-family:sans-serif">Hi {{NAME}},</p>\n<p>We couldn\u2019t deliver your parcel. <a href="{{TRACKING_LINK}}">Reschedule delivery</a>.</p>' },
];

const DEFAULT_BODY = `<p style="font-family:sans-serif">Hi {{NAME}},</p>
<p>We noticed unusual activity on your account. Please review the details and confirm within 24 hours.</p>
<p><a href="{{TRACKING_LINK}}" style="background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Review details</a></p>
<p style="font-size:12px;color:#666">Sent by the IT Security team.</p>`;

export default function Templates() {
  const { token } = useAuth();
  const { data, loading, error, reload } = useAsync(() => getTemplates(token), [token]);

  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [subject, setSubject] = useState('');
  const [difficulty, setDifficulty] = useState(2);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const applyHint = (hint) => {
    setCategory(hint.label);
    setSubject(hint.subject);
    setBody(hint.body);
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaveError('');
    setSaving(true);
    try {
      if (!name.trim() || !subject.trim() || !body.trim()) throw new Error('Name, subject, and HTML body are required');
      await createTemplate(token, { name: name.trim(), category: category || 'General', subject_line: subject.trim(), difficulty, html_body: body });
      setOpen(false);
      setName('');
      setSubject('');
      setBody(DEFAULT_BODY);
      setDifficulty(2);
      reload();
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (t) => {
    if (!confirm(`Delete template "${t.name}"?`)) return;
    try {
      await deleteTemplate(token, t.id);
      reload();
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) return <Spinner label="Loading templates…" />;

  return (
    <div>
      <PageHeader
        title="Phishing Templates"
        subtitle="Reusable, on-brand simulations. {{NAME}} and {{TRACKING_LINK}} are replaced at send time."
        actions={
          <button onClick={() => setOpen(true)} className="btn-primary">
            <Plus size={16} />
            New template
          </button>
        }
      />

      {error && <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>}

      {(data || []).length === 0 ? (
        <div className="glass-panel">
          <EmptyState
            icon={FileText}
            title="No templates yet"
            hint="Create a template to start building simulations."
            action={
              <button onClick={() => setOpen(true)} className="btn-primary">
                <Plus size={16} /> New template
              </button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(data || []).map((t) => (
            <div key={t.id} className="glass-card group flex flex-col p-5">
              <div className="flex items-center justify-between">
                <span className="chip border border-black/10 bg-black/5 text-slate-600">{t.category || 'General'}</span>
                <DifficultyDots level={t.difficulty_level ?? 2} />
              </div>
              <h3 className="mt-3 font-display text-base font-semibold text-slate-900">{t.name}</h3>
              <p className="mt-1 line-clamp-1 text-xs text-slate-500">{t.subject_line}</p>
              <p className="mt-3 text-[11px] uppercase tracking-wider text-slate-600">
                {t.org_id ? 'Custom' : 'Built-in template'}
              </p>
              <div className="mt-4 flex gap-2">
                <button onClick={() => setPreview(t)} className="btn-ghost flex-1 !py-2 !text-xs">
                  <Eye size={14} /> Preview
                </button>
                {t.org_id && (
                  <button onClick={() => remove(t)} className="btn-danger !px-3 !py-2 !text-xs" title="Delete template">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Create template" wide>
        <form onSubmit={submit} className="space-y-4">
          {saveError && <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{saveError}</div>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Template name</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Vendor invoice follow-up" required />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Category</span>
              <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Credential harvest" />
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Subject line</span>
            <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject shown to the target" required />
          </label>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Difficulty</span>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDifficulty(d)}
                  className={cn('flex h-9 w-9 items-center justify-center rounded-lg border text-sm font-semibold transition-colors', d <= difficulty ? 'border-amber-400/40 bg-amber-500/15 text-amber-700' : 'border-black/10 text-slate-500 hover:border-black/30')}
                >
                  {d}
                </button>
              ))}
              <span className="ml-2 text-xs text-slate-500">1 = easy to spot, 5 = very convincing</span>
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">HTML body</span>
              <span className="text-[11px] text-slate-500">Use {'{{NAME}}'} and {'{{TRACKING_LINK}}'}</span>
            </div>
            <textarea className="input min-h-[200px] font-mono !text-xs leading-relaxed" value={body} onChange={(e) => setBody(e.target.value)} />
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Start from a pattern</span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {CATEGORY_HINTS.map((h) => (
                <button
                  key={h.label}
                  type="button"
                  onClick={() => applyHint(h)}
                  className="rounded-xl border border-black/10 bg-black/[0.03] p-3 text-left transition-colors hover:border-orange-400/30"
                >
                  <p className="text-sm font-medium text-slate-800">{h.label}</p>
                  <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">{h.subject}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-black/10 pt-4">
            <button type="button" onClick={() => setOpen(false)} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Create template'}</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview?.name} wide>
        {preview && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
              <span className="chip border border-black/10 bg-black/5">{preview.category || 'General'}</span>
              <DifficultyDots level={preview.difficulty_level ?? 2} />
              <span className="text-slate-500">{preview.subject_line}</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              <EyeOff size={14} />
              This preview shows how the email looks to your employees — {{TRACKING_LINK}} becomes a clickable link at send time.
            </div>
            <iframe title={preview.name} srcDoc={preview.html_body} className="h-[420px] w-full rounded-xl border border-black/10 bg-white" sandbox="" />
          </div>
        )}
      </Modal>
    </div>
  );
}
