import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Clock,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  GraduationCap,
} from 'lucide-react';
import { useAuth } from '../App';
import { getRemediations, resendRemediation } from '../lib/api';
import { cn } from '../components/ui';

const FAILURE_LABELS = {
  'credential-phishing': 'Credential phishing',
  'malware-link': 'Malicious link / attachment',
  'urgency-bait': 'Urgency & bait',
  'phishing-basics': 'Phishing basics',
};

function daysLeft(deadline) {
  if (!deadline) return null;
  return Math.ceil((new Date(deadline) - new Date()) / 86400000);
}

function fmt(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function StatusBadge({ status }) {
  if (status === 'assigned') {
    return <span className="chip border border-orange-500/25 bg-orange-500/10 text-orange-700">In remediation</span>;
  }
  if (status === 'expired') {
    return <span className="chip border border-rose-500/25 bg-rose-500/10 text-rose-700">Deadline missed</span>;
  }
  return <span className="chip border border-emerald-500/25 bg-emerald-500/10 text-emerald-700">Completed</span>;
}

export default function Remediation() {
  const { token } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    getRemediations(token)
      .then(setRows)
      .catch((err) => setError(err.message || 'Could not load remediations.'))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const { open, expired, followUp, completed } = useMemo(() => {
    const today = new Date();
    const list = rows.filter((r) => r.status === 'assigned');
    const over = rows.filter((r) => r.status === 'expired');
    const retest = rows.filter(
      (r) => r.status === 'completed' && r.follow_up_due_at && !r.follow_up_campaign_id && new Date(r.follow_up_due_at) <= today
    );
    const done = rows.filter((r) => r.status === 'completed');
    return { open: list, expired: over, followUp: retest, completed: done };
  }, [rows]);

  const resend = async (id) => {
    setSending(id);
    setError('');
    try {
      await resendRemediation(token, id);
      await load();
    } catch (err) {
      setError(err.message || 'Could not resend the training email.');
    } finally {
      setSending('');
    }
  };

  const renderRow = (r) => (
    <tr key={r.id} className="table-row">
      <td className="px-6 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-600 to-slate-800 text-xs font-bold text-slate-800">
            {r.employee_name.split(' ').map((p) => p?.[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="font-medium text-slate-800">{r.employee_name}</p>
            <p className="text-xs text-slate-500">{r.employee_email}</p>
          </div>
        </div>
      </td>
      <td className="px-6 py-3.5">
        <span className="chip border border-black/10 bg-black/5 text-slate-700">{r.department || '—'}</span>
      </td>
      <td className="px-6 py-3.5 text-slate-700">{FAILURE_LABELS[r.failure_type] || r.failure_type}</td>
      <td className="px-6 py-3.5 text-xs text-slate-600">from “{r.campaign_name || 'a campaign'}”</td>
      <td className="px-6 py-3.5">
        <StatusBadge status={r.status} />
      </td>
      <td className="px-6 py-3.5 text-xs text-slate-600">
        {r.status === 'assigned' && (
          <span className={cn('flex items-center gap-1 font-medium', (daysLeft(r.deadline) ?? 99) <= 2 ? 'text-rose-600' : 'text-slate-700')}>
            <Clock size={12} />
            {daysLeft(r.deadline) > 0 ? `${daysLeft(r.deadline)}d left (${fmt(r.deadline)})` : 'due today'}
          </span>
        )}
        {r.status === 'expired' && <span className="text-rose-600">missed {fmt(r.deadline)}</span>}
        {r.status === 'completed' && r.follow_up_due_at && (
          <span className="text-slate-600">
            retest due {fmt(r.follow_up_due_at)}
            {r.follow_up_campaign_id && <span className="text-emerald-600"> · sent</span>}
          </span>
        )}
      </td>
      <td className="px-6 py-3.5">
        <div className="flex justify-end gap-1.5">
          {r.status === 'assigned' && (
            <button
              onClick={() => resend(r.id)}
              disabled={sending === r.id}
              className="btn-ghost !px-3 !py-1.5 !text-xs"
              title="Re-email the training link + deadline"
            >
              {sending === r.id ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Resend
            </button>
          )}
          <a href={r.training_link} target="_blank" rel="noreferrer" className="btn-ghost !px-3 !py-1.5 !text-xs">
            Open lesson
          </a>
        </div>
      </td>
    </tr>
  );

  return (
    <div className="space-y-6">
      <div className="anim-fade-up">
        <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-600/90">
          Phishloop · Remediation
        </p>
        <h1 className="font-display text-2xl font-bold text-slate-900">Remediation & follow-up queue</h1>
        <p className="mt-1 text-sm text-slate-600">
          Employees who clicked a simulated phish are auto-assigned a micro-lesson with a 7-day deadline,
          then queued for a follow-up simulation in the coming weeks.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="glass-panel flex items-center gap-4 p-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500/15 text-orange-600">
            <ShieldAlert size={20} />
          </div>
          <div>
            <p className="font-display text-2xl font-bold text-slate-900">{open.length}</p>
            <p className="text-xs text-slate-500">Open remediations</p>
          </div>
        </div>
        <div className="glass-panel flex items-center gap-4 p-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-500/15 text-rose-600">
            <AlertTriangle size={20} />
          </div>
          <div>
            <p className="font-display text-2xl font-bold text-slate-900">{expired.length}</p>
            <p className="text-xs text-slate-500">Deadlines missed</p>
          </div>
        </div>
        <div className="glass-panel flex items-center gap-4 p-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600">
            <GraduationCap size={20} />
          </div>
          <div>
            <p className="font-display text-2xl font-bold text-slate-900">{followUp.length}</p>
            <p className="text-xs text-slate-500">Follow-up retests due</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="glass-panel flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
          <Loader2 size={18} className="animate-spin text-orange-500" /> Loading remediation queue…
        </div>
      ) : rows.length === 0 ? (
        <div className="glass-panel py-16 text-center">
          <ShieldCheck size={28} className="mx-auto text-emerald-500" />
          <p className="mt-3 font-display text-lg font-semibold text-slate-900">No remediations yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            The moment someone clicks a simulated phish, they are auto-enrolled here and emailed a training link with a deadline.
          </p>
        </div>
      ) : (
        <>
          <section className="glass-panel overflow-hidden">
            <div className="border-b border-black/10 px-6 py-4">
              <h2 className="section-title flex items-center gap-2">
                <Clock size={16} className="text-orange-500" /> Open remediations ({open.length})
              </h2>
            </div>
            {open.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-slate-500">Everyone is up to date.</p>
            ) : (
              <div className="table-container">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-black/10 text-xs uppercase tracking-wider text-slate-500">
                      <th className="px-6 py-3.5 font-medium">Employee</th>
                      <th className="px-6 py-3.5 font-medium">Department</th>
                      <th className="px-6 py-3.5 font-medium">Lesson</th>
                      <th className="px-6 py-3.5 font-medium">Triggered by</th>
                      <th className="px-6 py-3.5 font-medium">Status</th>
                      <th className="px-6 py-3.5 font-medium">Deadline</th>
                      <th className="px-6 py-3.5 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>{open.map(renderRow)}</tbody>
                </table>
              </div>
            )}
          </section>

          {expired.length > 0 && (
            <section className="glass-panel overflow-hidden">
              <div className="border-b border-black/10 px-6 py-4">
                <h2 className="section-title flex items-center gap-2">
                  <AlertTriangle size={16} className="text-rose-500" /> Missed deadlines ({expired.length})
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  These employees never completed their lesson. Consider one-on-one coaching or re-sending the reminder.
                </p>
              </div>
              <div className="table-container">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-black/10 text-xs uppercase tracking-wider text-slate-500">
                      <th className="px-6 py-3.5 font-medium">Employee</th>
                      <th className="px-6 py-3.5 font-medium">Department</th>
                      <th className="px-6 py-3.5 font-medium">Lesson</th>
                      <th className="px-6 py-3.5 font-medium">Triggered by</th>
                      <th className="px-6 py-3.5 font-medium">Status</th>
                      <th className="px-6 py-3.5 font-medium">Deadline</th>
                      <th className="px-6 py-3.5 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>{expired.map(renderRow)}</tbody>
                </table>
              </div>
            </section>
          )}

          <section className="glass-panel overflow-hidden">
            <div className="border-b border-black/10 px-6 py-4">
              <h2 className="section-title flex items-center gap-2">
                <GraduationCap size={16} className="text-emerald-500" /> Follow-up retests due ({followUp.length})
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Remediated employees awaiting a similar simulation to verify the behavior changed. Launching any campaign that
                includes them automatically counts as their retest.
              </p>
            </div>
            {followUp.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-slate-500">
                No retests due right now. {completed.length > 0 && `${completed.length} remediation${completed.length > 1 ? 's' : ''} completed.`}
              </p>
            ) : (
              <div className="table-container">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-black/10 text-xs uppercase tracking-wider text-slate-500">
                      <th className="px-6 py-3.5 font-medium">Employee</th>
                      <th className="px-6 py-3.5 font-medium">Department</th>
                      <th className="px-6 py-3.5 font-medium">Lesson</th>
                      <th className="px-6 py-3.5 font-medium">Triggered by</th>
                      <th className="px-6 py-3.5 font-medium">Status</th>
                      <th className="px-6 py-3.5 font-medium">Retest due</th>
                      <th className="px-6 py-3.5 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>{followUp.map(renderRow)}</tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
