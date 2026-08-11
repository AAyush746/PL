import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Rocket, Search, Users, MailOpen, MousePointerClick, Flag, GraduationCap } from 'lucide-react';
import { getCampaign, launchCampaign, exportCampaignCsv } from '../lib/api';
import { useAuth } from '../App';
import { useAsync, StatusBadge, Spinner, ProgressBar, cn } from '../components/ui';

export default function CampaignDetail() {
  const { id } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();

  const { data, loading, error, reload } = useAsync(() => getCampaign(token, id), [token, id]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  if (loading) return <Spinner label="Loading campaign…" />;

  if (error || !data) {
    return (
      <div className="glass-panel p-10 text-center">
        <p className="text-slate-700">{error || 'Campaign not found'}</p>
        <Link to="/campaigns" className="mt-4 inline-block text-sm font-medium text-orange-300">Back to campaigns</Link>
      </div>
    );
  }

  const onLaunch = async () => {
    setBusy(true);
    setNotice('');
    try {
      const res = await launchCampaign(token, id);
      setNotice(`Launched — ${res.recipients} recipients.`);
      reload();
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusy(false);
    }
  };

  const results = (data.results || []).filter((r) => {
    if (!query) return true;
    return `${r.employee_name} ${r.employee_email} ${r.department}`.toLowerCase().includes(query.toLowerCase());
  });

  const stats = [
    { label: 'Delivered', value: data.delivered, icon: MailOpen, accent: 'text-orange-400' },
    { label: 'Opened', value: data.opened, icon: MailOpen, accent: 'text-blue-400' },
    { label: 'Clicked', value: data.clicked, icon: MousePointerClick, accent: 'text-amber-400' },
    { label: 'Reported', value: data.reported, icon: Flag, accent: 'text-emerald-400' },
    { label: 'Trained', value: data.trained, icon: GraduationCap, accent: 'text-rose-400' },
  ];

  return (
    <div>
      <button onClick={() => navigate('/campaigns')} className="mb-6 flex items-center gap-2 text-sm text-slate-600 transition-colors hover:text-slate-800">
        <ArrowLeft size={16} /> Back to campaigns
      </button>

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-bold text-slate-900">{data.name}</h1>
            <StatusBadge status={data.status} />
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Template: <span className="text-slate-700">{data.template_name}</span> · Audience:{' '}
            {(data.target_departments || []).join(', ')} · {data.total} targets
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => exportCampaignCsv(token, id, data.name)} className="btn-ghost">
            <Download size={15} /> Export CSV
          </button>
          {data.status === 'draft' && (
            <button onClick={onLaunch} disabled={busy} className="btn-primary">
              {busy ? '…' : <Rocket size={15} />}
              Launch now
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div className={cn('mb-4 rounded-xl border px-4 py-3 text-sm', notice.includes('Launched') ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200' : 'border-rose-500/20 bg-rose-500/10 text-rose-200')}>
          {notice}
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="glass-card p-4">
            <s.icon size={18} className={s.accent} />
            <p className="mt-2 font-display text-2xl font-bold text-slate-50">{s.value}</p>
            <p className="text-xs text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="mb-6 glass-panel p-6">
        <h2 className="section-title mb-3">Click conversion</h2>
        <ProgressBar value={(data.click_rate ?? 0)} color="bg-gradient-to-r from-orange-400 to-amber-600" className="h-2.5" />
        <p className="mt-2 text-xs text-slate-500">{data.click_rate ?? 0}% of opened emails led to a click. Industry median is ~30%.</p>
      </div>

      <div className="mb-6 glass-panel p-6">
        <h2 className="section-title mb-3">Report rate</h2>
        <ProgressBar value={(data.report_rate ?? 0)} color="bg-gradient-to-r from-emerald-400 to-teal-600" className="h-2.5" />
        <p className="mt-2 text-xs text-slate-500">
          {data.report_rate ?? 0}% of delivered emails were flagged as phishing — the behavior you want to encourage.
          {data.sending_profile_name ? ` Sent via ${data.sending_profile_name}.` : ''}
        </p>
      </div>

      <div className="table-container">
        <div className="flex flex-col gap-3 border-b border-black/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="section-title flex items-center gap-2"><Users size={16} className="text-slate-600" /> Results ({results.length})</h2>
          <div className="relative sm:w-64">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input className="input py-2 pl-9 text-sm" placeholder="Search employees…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/10 text-xs uppercase tracking-wider text-slate-500">
                <th className="px-6 py-3 font-medium">Employee</th>
                <th className="px-6 py-3 font-medium">Department</th>
                <th className="px-6 py-3 font-medium">Delivered</th>
                <th className="px-6 py-3 font-medium">Opened</th>
                <th className="px-6 py-3 font-medium">Clicked</th>
                <th className="px-6 py-3 font-medium">Reported</th>
                <th className="px-6 py-3 font-medium">Training</th>
                <th className="px-6 py-3 font-medium">First interaction</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.id} className="table-row">
                  <td className="px-6 py-3.5">
                    <p className="font-medium text-slate-800">{r.employee_name}</p>
                    <p className="text-xs text-slate-500">{r.employee_email}</p>
                  </td>
                  <td className="px-6 py-3.5 text-slate-600">{r.department}</td>
                  {['is_delivered', 'is_opened', 'is_clicked', 'is_reported'].map((key) => (
                    <td key={key} className="px-6 py-3.5">
                      <span className={cn('inline-flex h-2 w-2 rounded-full', r[key] ? 'bg-emerald-400' : 'bg-black/10')} />
                    </td>
                  ))}
                  <td className="px-6 py-3.5">
                    <span className={cn('chip border', r.training_completed ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700' : 'border-slate-500/20 bg-slate-500/10 text-slate-600')}>
                      {r.training_completed ? 'Done' : 'Due'}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-xs text-slate-500">
                    {r.clicked_at ? new Date(r.clicked_at).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
