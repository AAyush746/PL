import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Eye, Loader2, Sparkles } from 'lucide-react';
import { getTemplates, getDepartments, getSendingProfiles, createCampaign } from '../lib/api';
import { useAuth } from '../App';
import { useAsync, Spinner, DifficultyDots, Modal, cn } from '../components/ui';

const PRESETS = [
  { name: 'Mid-month invoice', difficulty: 3, depts: ['Finance', 'Operations', 'HR'] },
  { name: 'Urgent IT password reset', difficulty: 2, depts: ['IT', 'All'] },
  { name: 'Q4 Board Room booking review', difficulty: 4, depts: ['Leadership', 'HR'] },
];

export default function CampaignNew() {
  const { token } = useAuth();
  const navigate = useNavigate();

  const templates = useAsync(() => getTemplates(token), [token]);
  const depts = useAsync(() => getDepartments(token), [token]);
  const profiles = useAsync(() => getSendingProfiles(token), [token]);

  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [sendingProfileId, setSendingProfileId] = useState('');
  const [departments, setDepartments] = useState(['All']);
  const [schedule, setSchedule] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [previewId, setPreviewId] = useState(null);

  const applyPreset = (preset) => {
    const t = (templates.data || []).find((x) =>
      (x.category || '').toLowerCase().includes(preset.name.split(' ')[0].toLowerCase())
    );
    setTemplateId(t?.id || '');
    setDepartments(preset.depts);
    setName(preset.name);
  };

  const toggleDept = (d) => {
    if (d === 'All') {
      setDepartments(['All']);
      return;
    }
    setDepartments((prev) => {
      const next = prev.filter((x) => x !== 'All');
      return next.includes(d) ? next.filter((x) => x !== d) : [...next, d];
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (!name.trim()) throw new Error('Give the campaign a name');
      if (!templateId) throw new Error('Pick a phishing template');
      const payload = {
        name: name.trim(),
        template_id: templateId,
        target_departments: departments,
        scheduled_start: schedule || new Date().toISOString(),
        ...(sendingProfileId ? { sending_profile_id: sendingProfileId } : {}),
      };
      const created = await createCampaign(token, payload);
      navigate(`/campaigns/${created.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const preview = (templates.data || []).find((t) => t.id === previewId);

  if (templates.loading) return <Spinner label="Loading templates…" />;

  return (
    <div className="mx-auto max-w-5xl">
      <button onClick={() => navigate('/campaigns')} className="mb-6 flex items-center gap-2 text-sm text-slate-600 transition-colors hover:text-slate-800">
        <ArrowLeft size={16} /> Back to campaigns
      </button>

      <form onSubmit={submit}>
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900">Create campaign</h1>
            <p className="mt-1 text-sm text-slate-600">Configure who receives the simulation and which template it uses.</p>
          </div>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
            {saving ? 'Creating…' : 'Create campaign'}
          </button>
        </div>

        {error && <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <section className="glass-panel p-6">
              <h2 className="section-title mb-4">1 · Basic details</h2>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Campaign name</span>
                <input className="input" placeholder="e.g. Q3 Invoice Drill" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
            </section>

            <section className="glass-panel p-6">
              <h2 className="section-title mb-2">2 · Choose template</h2>
              <p className="mb-4 text-xs text-slate-500">Or start from a preset based on common attack vectors.</p>

              <div className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {PRESETS.map((p) => (
                  <button
                    type="button"
                    key={p.name}
                    onClick={() => applyPreset(p)}
                    className="rounded-xl border border-black/10 bg-black/[0.03] p-3 text-left transition-colors hover:border-orange-400/30 hover:bg-orange-500/5"
                  >
                    <p className="text-sm font-medium text-slate-800">{p.name}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <DifficultyDots level={p.difficulty} />
                      <span className="text-[11px] text-slate-500">{p.depts.length} dept(s)</span>
                    </div>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {(templates.data || []).map((t) => (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => setTemplateId(t.id)}
                    className={cn(
                      'relative rounded-xl border p-4 text-left transition-all',
                      templateId === t.id
                        ? 'border-orange-400/50 bg-orange-500/10 shadow-lg shadow-orange-500/10'
                        : 'border-black/10 bg-black/[0.03] hover:border-black/25'
                    )}
                  >
                    {templateId === t.id && (
                      <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-orange-400 text-slate-50">
                        <Check size={12} strokeWidth={3} />
                      </span>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <span className="chip border border-black/10 bg-black/5 text-slate-600">{t.category || 'General'}</span>
                      <DifficultyDots level={t.difficulty_level ?? 3} />
                    </div>
                    <p className="mt-2 pr-6 text-sm font-semibold text-slate-900">{t.name}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">{t.subject_line}</p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewId(t.id);
                      }}
                      className="mt-3 flex items-center gap-1 text-xs font-medium text-orange-300 hover:text-orange-200"
                    >
                      <Eye size={13} /> Preview email
                    </button>
                  </button>
                ))}
              </div>
            </section>

            <section className="glass-panel p-6">
              <h2 className="section-title mb-4">3 · Target audience</h2>
              {depts.loading ? (
                <p className="text-sm text-slate-500">Loading departments…</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {['All', ...(depts.data || [])].map((d) => (
                    <button
                      type="button"
                      key={d}
                      onClick={() => toggleDept(d)}
                      className={cn(
                        'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                        departments.includes(d)
                          ? 'border-orange-400/40 bg-orange-500/15 text-orange-200'
                          : 'border-black/10 text-slate-600 hover:border-black/30'
                      )}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-3 text-xs text-slate-500">
                {departments.includes('All') ? 'All departments' : departments.length ? `Selected: ${departments.join(', ')}` : 'No departments selected (nothing will be sent)'}
              </p>
            </section>
          </div>

          <div className="space-y-6">
            <section className="glass-panel p-6">
              <h2 className="section-title mb-4">4 · Sending profile</h2>
              <p className="mb-3 text-xs text-slate-500">
                Which relay should deliver this campaign? Simulated profiles record to the mailbox only.
              </p>
              <div className="space-y-2">
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-black/10 bg-black/[0.03] p-3 transition-colors hover:border-black/25">
                  <input
                    type="radio"
                    name="profile"
                    checked={!sendingProfileId}
                    onChange={() => setSendingProfileId('')}
                    className="h-4 w-4 accent-orange-500"
                  />
                  <span className="text-sm font-medium text-slate-800">Default (env config)</span>
                </label>
                {(profiles.data || []).map((p) => (
                  <label key={p.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-black/10 bg-black/[0.03] p-3 transition-colors hover:border-black/25">
                    <input
                      type="radio"
                      name="profile"
                      checked={sendingProfileId === p.id}
                      onChange={() => setSendingProfileId(p.id)}
                      className="h-4 w-4 accent-orange-500"
                    />
                    <span className="flex-1 text-sm font-medium text-slate-800">{p.name}</span>
                    <span className={cn(
                      'badge border',
                      p.simulate ? 'border-sky-500/25 bg-sky-500/10 text-sky-700' : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700'
                    )}>
                      {p.simulate ? 'Simulated' : 'Real'}
                    </span>
                  </label>
                ))}
                {!profiles.loading && (profiles.data || []).length === 0 && (
                  <p className="text-xs text-slate-500">
                    No profiles yet — campaigns fall back to the global env config. Create one in Sending.
                  </p>
                )}
              </div>
            </section>

            <section className="glass-panel p-6">
              <h2 className="section-title mb-4">5 · Schedule</h2>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Launch time (optional)</span>
                <input
                  type="datetime-local"
                  className="input"
                  value={schedule}
                  onChange={(e) => setSchedule(e.target.value)}
                />
              </label>
              <p className="mt-2 text-xs text-slate-500">Leave empty to launch manually from the campaigns list.</p>
            </section>

            <section className="glass-panel p-6">
              <h2 className="section-title mb-4">Summary</h2>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Name</dt>
                  <dd className="font-medium text-slate-800">{name || '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Template</dt>
                  <dd className="max-w-[160px] truncate font-medium text-slate-800">
                    {(templates.data || []).find((t) => t.id === templateId)?.name || '—'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Audience</dt>
                  <dd className="max-w-[160px] text-right font-medium text-slate-800">
                    {departments.includes('All') ? 'Everyone' : departments.join(', ') || 'None'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Sending</dt>
                  <dd className="max-w-[160px] text-right font-medium text-slate-800">
                    {(profiles.data || []).find((p) => p.id === sendingProfileId)?.name || 'Default (env config)'}
                  </dd>
                </div>
              </dl>
            </section>
          </div>
        </div>
      </form>

      <Modal open={!!preview} onClose={() => setPreviewId(null)} title={preview?.name} wide>
        {preview && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
              <span className="chip border border-black/10 bg-black/5">{preview.category || 'General'}</span>
              <DifficultyDots level={preview.difficulty_level ?? 3} />
              <span className="text-slate-500">{preview.subject_line}</span>
            </div>
            <iframe title={preview.name} srcDoc={preview.html_body} className="h-[420px] w-full rounded-xl border border-black/10 bg-white" sandbox="" />
          </div>
        )}
      </Modal>
    </div>
  );
}
