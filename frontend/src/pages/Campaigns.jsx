import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Crosshair, Download, Rocket, Search } from 'lucide-react';
import { getCampaigns, launchCampaign, exportCampaignCsv } from '../lib/api';
import { useAuth } from '../App';
import { useAsync, StatusBadge, Spinner, EmptyState, PageHeader, ProgressBar, cn } from '../components/ui';

export default function Campaigns() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState('');

  const { data, loading, error, reload } = useAsync(() => getCampaigns(token), [token]);

  const filtered = (data || []).filter((c) => {
    if (status !== 'all' && c.status !== status) return false;
    if (query && !`${c.name} ${c.template_name}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const onLaunch = async (c) => {
    setBusyId(c.id);
    setNotice('');
    try {
      const res = await launchCampaign(token, c.id);
      setNotice(`Launched "${c.name}" — ${res.recipients} recipients.`);
      reload();
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const onExport = async (c) => {
    try {
      await exportCampaignCsv(token, c.id, c.name);
    } catch (err) {
      setNotice(err.message);
    }
  };

  if (loading) return <Spinner label="Loading campaigns…" />;

  return (
    <div>
      <PageHeader
        title="Simulation Campaigns"
        subtitle="Design, launch, and measure phishing simulations across your people."
        actions={
          <Link to="/campaigns/new" className="btn-primary">
            <Plus size={16} />
            New campaign
          </Link>
        }
      />

      {notice && (
        <div className={cn('mb-4 rounded-xl border px-4 py-3 text-sm', notice.includes('Launched') ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200' : 'border-rose-500/20 bg-rose-500/10 text-rose-200')}>
          {notice}
        </div>
      )}

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:w-72">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="input pl-10"
            placeholder="Search campaigns…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-1.5">
          {[
            { key: 'all', label: 'All' },
            { key: 'draft', label: 'Draft' },
            { key: 'active', label: 'Active' },
            { key: 'completed', label: 'Completed' },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setStatus(f.key)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                status === f.key ? 'bg-orange-500/15 text-orange-300' : 'text-slate-600 hover:bg-black/5 hover:text-slate-800'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>}

      {filtered.length === 0 ? (
        <div className="glass-panel">
          <EmptyState
            icon={Crosshair}
            title="No campaigns yet"
            hint="Create your first simulation to see how susceptible your team is to phishing."
            action={
              <Link to="/campaigns/new" className="btn-primary">
                <Plus size={16} />
                Create campaign
              </Link>
            }
          />
        </div>
      ) : (
        <div className="table-container">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/10 text-xs uppercase tracking-wider text-slate-500">
                <th className="px-6 py-3.5 font-medium">Campaign</th>
                <th className="px-6 py-3.5 font-medium">Status</th>
                <th className="px-6 py-3.5 font-medium">Progress</th>
                <th className="px-6 py-3.5 font-medium">Recipients</th>
                <th className="px-6 py-3.5 font-medium">Click rate</th>
                <th className="px-6 py-3.5 font-medium">Report rate</th>
                <th className="px-6 py-3.5 font-medium">Training</th>
                <th className="px-6 py-3.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const pct = c.total ? Math.round((c.delivered / c.total) * 100) : 0;
                return (
                  <tr key={c.id} className="table-row">
                    <td className="px-6 py-4">
                      <button onClick={() => navigate(`/campaigns/${c.id}`)} className="text-left">
                        <p className="font-medium text-slate-900 hover:text-orange-300">{c.name}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{c.template_name || '—'}</p>
                      </button>
                    </td>
                    <td className="px-6 py-4"><StatusBadge status={c.status} /></td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <ProgressBar value={pct} className="w-24" color={c.status === 'completed' ? 'bg-amber-400' : c.status === 'active' ? 'bg-emerald-400' : 'bg-slate-500'} />
                        <span className="text-xs text-slate-500">{c.delivered}/{c.total}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-700">{c.total ?? 0}</td>
                    <td className="px-6 py-4 font-semibold text-slate-800">{c.click_rate ?? 0}%</td>
                    <td className="px-6 py-4 font-semibold text-emerald-600">{c.report_rate ?? 0}%</td>
                    <td className="px-6 py-4 text-slate-700">{c.trained ?? 0}</td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-1.5">
                        {c.status === 'draft' && (
                          <button
                            onClick={() => onLaunch(c)}
                            disabled={busyId === c.id}
                            className="btn-primary !px-3 !py-1.5 !text-xs"
                          >
                            {busyId === c.id ? '…' : <Rocket size={13} />}
                            Launch
                          </button>
                        )}
                        <button
                          onClick={() => onExport(c)}
                          title="Export CSV"
                          className="btn-ghost !px-2.5 !py-1.5 !text-xs"
                        >
                          <Download size={13} />
                        </button>
                        <button
                          onClick={() => navigate(`/campaigns/${c.id}`)}
                          className="btn-ghost !px-3 !py-1.5 !text-xs"
                        >
                          View
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
