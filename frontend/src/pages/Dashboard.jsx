import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  Crosshair,
  MousePointerClick,
  GraduationCap,
  ShieldAlert,
  TrendingDown,
  Activity,
  ArrowRight,
  Flag,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { getOrgSummary, getCampaigns, getEmployees, getDepartments } from '../lib/api';
import { useAuth } from '../App';
import { useAsync, KpiCard, StatusBadge, ProgressBar, riskBg, cn } from '../components/ui';

export default function Dashboard() {
  const { token } = useAuth();
  const summary = useAsync(() => getOrgSummary(token), [token]);
  const campaigns = useAsync(() => getCampaigns(token), [token]);
  const employees = useAsync(() => getEmployees(token), [token]);
  const depts = useAsync(() => getDepartments(token), [token]);

  const trendData = useMemo(() => {
    const now = Date.now();
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(now - (13 - i) * 86400000);
      const risk = Math.max(8, 30 + Math.round(Math.sin(i / 2) * 6) - i * 0.6);
      return {
        day: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        risk,
      };
    });
  }, []);

  const deptRisk = useMemo(() => {
    if (!employees.data || !depts.data) return [];
    const byDept = new Map();
    for (const e of employees.data) {
      const key = e.department || 'Other';
      const entry = byDept.get(key) || { count: 0, sum: 0 };
      entry.count += 1;
      entry.sum += e.risk_score ?? 0;
      byDept.set(key, entry);
    }
    return [...byDept.entries()]
      .map(([name, { count, sum }]) => ({ name, risk: Math.round(sum / count) }))
      .sort((a, b) => b.risk - a.risk);
  }, [employees.data, depts.data]);

  const vulnerable = useMemo(
    () =>
      (employees.data || [])
        .filter((e) => (e.risk_score ?? 0) >= 60)
        .sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0))
        .slice(0, 5),
    [employees.data]
  );

  const funnel = useMemo(() => {
    let delivered = 0;
    let opened = 0;
    let clicked = 0;
    let reported = 0;
    let trained = 0;
    for (const c of campaigns.data || []) {
      delivered += c.delivered ?? 0;
      opened += c.opened ?? 0;
      clicked += c.clicked ?? 0;
      reported += c.reported ?? 0;
      trained += c.trained ?? 0;
    }
    return [
      { label: 'Delivered', value: delivered, tint: 'from-orange-500/80 to-amber-600/80' },
      { label: 'Opened', value: opened, tint: 'from-orange-500/80 to-amber-600/80' },
      { label: 'Clicked', value: clicked, tint: 'from-orange-500/80 to-amber-600/80' },
      { label: 'Reported as phish', value: reported, tint: 'from-emerald-500/80 to-teal-600/80' },
      { label: 'Training completed', value: trained, tint: 'from-orange-500/80 to-amber-600/80' },
    ];
  }, [campaigns.data]);

  if (summary.loading || campaigns.loading) return <div className="py-24 text-center text-slate-600">Loading command center…</div>;

  const s = summary.data || {};

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="anim-fade-up">
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-600/90">
            Phishloop · Command center
          </p>
          <h1 className="font-display text-2xl font-bold text-slate-900">{s.name || 'Your organization'}</h1>
          <p className="mt-1 text-sm text-slate-600">
            Human risk posture, live phishing results, and training progress at a glance.
          </p>
        </div>
        <div className="anim-fade-up">
          <Link to="/campaigns/new" className="btn-primary">
            <Crosshair size={16} />
            New campaign
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard icon={Users} label="Employees" value={s.employees ?? 0} accent="cyan" sub="under active simulation" />
        <KpiCard icon={Crosshair} label="Active campaigns" value={s.activeCampaigns ?? 0} accent="indigo" sub={`${s.completedCampaigns ?? 0} completed`} />
        <KpiCard icon={MousePointerClick} label="Click rate" value={`${s.clickRate ?? 0}%`} accent="amber" sub="across all campaigns" />
        <KpiCard icon={Flag} label="Report rate" value={`${s.reportRate ?? 0}%`} accent="emerald" sub="flagged simulated phish" />
        <KpiCard icon={GraduationCap} label="Training done" value={`${s.trainingCompletionRate ?? 0}%`} accent="rose" sub="after simulated click" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="glass-panel p-6 xl:col-span-2 anim-fade-up-1">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="section-title flex items-center gap-2">
                <Activity className="text-orange-400" size={18} />
                Funnel across campaigns
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">Every step of the simulation, summed.</p>
            </div>
            <span className="badge border border-orange-500/25 bg-orange-500/10 text-orange-700">Live</span>
          </div>

          <div className="space-y-4">
            {funnel.map((step) => {
              const pct = funnel[0].value ? Math.round((step.value / funnel[0].value) * 100) : 0;
              return (
                <div key={step.label} className="flex items-center gap-4">
                  <span className="w-40 shrink-0 text-sm text-slate-600">{step.label}</span>
                  <div className="h-8 flex-1 overflow-hidden rounded-lg bg-black/5">
                    <div
                      className={`flex h-full items-center rounded-lg bg-gradient-to-r ${step.tint} pl-3 transition-all duration-700`}
                      style={{ width: `${Math.max(pct > 0 ? 6 : 0, pct)}%` }}
                    >
                      <span className="whitespace-nowrap text-xs font-semibold text-white">{step.value}</span>
                    </div>
                  </div>
                  <span className="w-12 text-right text-xs text-slate-500">{pct}%</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="glass-panel p-6 anim-fade-up-1">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="section-title flex items-center gap-2">
              <ShieldAlert className="text-rose-600" size={18} />
              Risk score
            </h2>
            <span className="chip border border-black/10 bg-black/5 text-slate-700">{s.riskScore ?? 0}/100</span>
          </div>
          <div className="mb-2 flex items-end justify-between">
            <span className={cn('font-display text-4xl font-bold', s.riskScore < 25 ? 'text-emerald-600' : s.riskScore < 45 ? 'text-amber-600' : s.riskScore < 70 ? 'text-orange-600' : 'text-rose-600')}>
              {s.riskScore ?? '—'}
            </span>
            <span className="flex items-center gap-1 text-xs text-emerald-600">
              <TrendingDown size={14} />
              lower is better
            </span>
          </div>
          <ProgressBar value={s.riskScore ?? 0} color={s.riskScore < 25 ? 'bg-emerald-400' : s.riskScore < 45 ? 'bg-amber-400' : s.riskScore < 70 ? 'bg-orange-400' : 'bg-rose-500'} />
          <p className="mt-2 text-xs text-slate-500">
            {s.riskScore < 25
              ? 'Excellent posture — employees are spotting simulated phishes.'
              : s.riskScore < 45
                ? 'Moderate posture — a few employees need a refresher.'
                : s.riskScore < 70
                  ? 'Elevated risk — several employees have clicked simulated phishes.'
                  : 'High risk — run a campaign and assign micro-learning now.'}
          </p>

          <div className="mt-6">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">14-day risk trend</h3>
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
                  <defs>
                    <linearGradient id="riskFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f97316" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(41,37,36,0.08)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: '#78716c', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#78716c', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: '#fffdf7', border: '1px solid rgba(201,183,150,0.5)', borderRadius: 12, fontSize: 12 }}
                    labelStyle={{ color: '#44403c' }}
                    itemStyle={{ color: '#ea580c' }}
                  />
                  <Area type="monotone" dataKey="risk" stroke="#fb923c" strokeWidth={2} fill="url(#riskFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="glass-panel p-6 xl:col-span-2 anim-fade-up-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="section-title">Department risk profile</h2>
            <Link to="/employees" className="flex items-center gap-1 text-xs font-medium text-orange-600 hover:text-orange-500">
              View all <ArrowRight size={13} />
            </Link>
          </div>
          <div className="space-y-3">
            {deptRisk.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No department data yet.</p>}
            {deptRisk.map((d) => {
              const color = d.risk < 25 ? 'bg-emerald-400' : d.risk < 45 ? 'bg-amber-400' : d.risk < 70 ? 'bg-orange-400' : 'bg-rose-500';
              return (
                <div key={d.name} className="flex items-center gap-4">
                  <span className="w-40 truncate text-sm text-slate-700">{d.name}</span>
                  <ProgressBar value={d.risk} color={color} />
                  <span className="w-12 text-right text-sm font-semibold text-slate-800">{d.risk}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="glass-panel p-6 anim-fade-up-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="section-title">Recent campaigns</h2>
            <Link to="/campaigns" className="flex items-center gap-1 text-xs font-medium text-orange-600 hover:text-orange-500">
              All <ArrowRight size={13} />
            </Link>
          </div>
          <div className="space-y-3">
            {(campaigns.data || []).slice(0, 5).map((c) => (
              <Link
                key={c.id}
                to={`/campaigns/${c.id}`}
                className="block rounded-xl border border-black/10 bg-black/[0.03] p-3.5 transition-colors hover:bg-black/[0.06]"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium text-slate-800">{c.name}</p>
                  <StatusBadge status={c.status} />
                </div>
                <p className="mt-1.5 text-xs text-slate-500">
                  {c.total ?? 0} targets · {c.click_rate ?? 0}% click rate
                </p>
              </Link>
            ))}
            {(campaigns.data || []).length === 0 && (
              <p className="py-8 text-center text-sm text-slate-500">No campaigns yet.</p>
            )}
          </div>
        </section>
      </div>

      {vulnerable.length > 0 && (
        <section className="glass-panel overflow-hidden anim-fade-up-3">
          <div className="border-b border-black/10 px-6 py-4">
            <h2 className="section-title flex items-center gap-2">
              <ShieldAlert className="text-rose-600" size={18} />
              Most at-risk employees
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-3 font-medium">Employee</th>
                  <th className="px-6 py-3 font-medium">Department</th>
                  <th className="px-6 py-3 font-medium">Clicks</th>
                  <th className="px-6 py-3 font-medium">Training</th>
                  <th className="px-6 py-3 text-right font-medium">Risk</th>
                </tr>
              </thead>
              <tbody>
                {vulnerable.map((e) => (
                  <tr key={e.id} className="table-row">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-slate-600 to-slate-800 text-xs font-bold text-white">
                          {e.first_name?.[0]}
                          {e.last_name?.[0]}
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">{e.first_name} {e.last_name}</p>
                          <p className="text-xs text-slate-500">{e.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-slate-600">{e.department}</td>
                    <td className="px-6 py-3">
                      <span className="chip border border-rose-500/20 bg-rose-500/10 text-rose-700">{e.total_clicks ?? 0}</span>
                    </td>
                    <td className="px-6 py-3">
                      <span className={cn('chip border', e.training_completed ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700' : 'border-amber-500/20 bg-amber-500/10 text-amber-700')}>
                        {e.training_completed ? 'Done' : 'Due'}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <span className={cn('badge border', riskBg(e.risk_score))}>{e.risk_score}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
