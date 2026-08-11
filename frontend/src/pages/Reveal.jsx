import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Flag,
  GraduationCap,
  Sparkles,
  ArrowRight,
  MailQuestion,
  LockKeyhole,
  Link2,
} from 'lucide-react';
import { completeTraining, reportPhishing } from '../lib/api';
import Logo from '../components/Logo';

const RED_FLAGS = [
  { icon: MailQuestion, title: 'Unexpected sender', detail: 'The message came from an address that looks slightly off, or a person you don\u2019t normally hear from.' },
  { icon: AlertTriangle, title: 'Urgency or pressure', detail: '“Expires today”, “Immediate action required”, “Your account is suspended” — pressure is the phisher\u2019s favourite tool.' },
  { icon: Link2, title: 'A link where it shouldn\u2019t be', detail: 'A login prompt that arrives by email. Real platforms rarely ask you to enter credentials from an emailed link.' },
  { icon: LockKeyhole, title: 'Requests for credentials', detail: 'Legitimate services never ask for your password over email. If it asks, it\u2019s fishing.' },
];

export default function Reveal() {
  const [params] = useSearchParams();
  const trackingToken = params.get('t') || '';
  const campaignId = params.get('cid');

  const [disclosed, setDisclosed] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | done | error
  const [busy, setBusy] = useState(false);
  const [reported, setReported] = useState(false);
  const [reporting, setReporting] = useState(false);

  const isReal = useMemo(() => !!trackingToken && /^[0-9a-fA-F-]{36}$/.test(trackingToken), [trackingToken]);

  const report = async () => {
    if (!trackingToken || reported) return;
    setReporting(true);
    try {
      await reportPhishing(trackingToken);
      setReported(true);
    } catch {
      // keep the page usable even if the report endpoint is unreachable
    } finally {
      setReporting(false);
    }
  };

  const complete = async () => {
    if (!trackingToken) return;
    setBusy(true);
    try {
      await completeTraining(trackingToken);
      setStatus('done');
    } catch {
      setStatus('error');
    } finally {
      setBusy(false);
    }
  };

  if (status === 'done') {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 py-12">
        <div className="glass-panel max-w-md p-10 text-center anim-fade-up">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
            <CheckCircle2 size={34} />
          </div>
          <h1 className="font-display text-2xl font-bold text-white">Lesson complete!</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            Nice work spotting the telltale signs. Your training record has been updated — your
            security team can see that you completed the micro-lesson.
          </p>
          <div className="mt-6 rounded-xl border border-white/5 bg-slate-950/40 p-4 text-left text-sm text-slate-300">
            <p className="mb-2 font-medium text-slate-200">3-second habit to build:</p>
            <ol className="list-decimal space-y-1 pl-5 text-xs text-slate-400">
              <li>Hover the sender address — does it match the company?</li>
              <li>Hover every link before clicking.</li>
              <li>If in doubt, navigate to the site yourself and never re-use passwords.</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center justify-center gap-3">
          <Logo size="sm" />
          <span className="font-display text-lg font-bold text-white">Phishloop</span>
        </div>

        <div className="glass-panel overflow-hidden anim-fade-up">
          <div className="border-b border-white/5 bg-gradient-to-r from-orange-500/10 to-amber-500/10 px-8 py-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-400">
              <Eye size={28} />
            </div>
            <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">
              You just clicked a simulated phishing email.
            </h1>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-slate-300">
              Don\u2019t worry — this was a safe, controlled test sent by your organization to help
              everyone recognize attacks. Nothing was compromised, no data was collected, and no one
              is in trouble.
            </p>
            {isReal && campaignId && (
              <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1 text-xs text-orange-300">
                <ShieldCheck size={13} /> Part of a training campaign
              </span>
            )}
          </div>

          <div className="space-y-6 p-8">
            <section>
              <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-slate-100">
                <ShieldAlert className="text-rose-400" size={19} />
                The red flags in that email
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {RED_FLAGS.map(({ icon: Icon, title, detail }) => (
                  <div key={title} className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
                    <div className="flex items-center gap-2">
                      <Icon size={16} className="text-amber-400" />
                      <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{detail}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-white/5 bg-slate-950/40 p-5">
              <h2 className="mb-3 flex items-center gap-2 font-display text-base font-semibold text-slate-100">
                <Flag className="text-emerald-400" size={17} />
                Honest check-in
              </h2>
              <p className="text-xs text-slate-500">
                No judgement — the data helps your team focus training where it matters. Be honest:
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => setDisclosed(true)}
                  className={disclosed === true ? 'btn-primary !text-xs' : 'btn-ghost !text-xs'}
                >
                  Yes, I would have entered my details
                </button>
                <button
                  onClick={() => setDisclosed(false)}
                  className={disclosed === false ? 'btn-primary !text-xs' : 'btn-ghost !text-xs'}
                >
                  No — something felt off
                </button>
              </div>
              {disclosed === true && (
                <p className="mt-3 flex items-center gap-2 text-xs text-amber-300">
                  <AlertTriangle size={14} />
                  Thanks for the honesty — that\u2019s exactly who this training is for. The next email will be a lot easier to spot.
                </p>
              )}
            </section>

            {status === 'error' && (
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                We couldn\u2019t verify this training link. If you clicked from your real inbox, it may have expired.
              </div>
            )}

            {reported ? (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-200">
                <CheckCircle2 size={18} className="shrink-0" />
                Reported — nice work! Your security team has been notified and can now follow up. This
                is exactly the habit to build in your real inbox too.
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 border-t border-white/5 pt-6">
                <button
                  onClick={report}
                  disabled={reporting || !isReal}
                  className="btn-ghost !text-xs"
                  title={isReal ? 'Flag this email as phishing' : 'No tracking token — nothing to report'}
                >
                  <Flag size={14} className="text-emerald-400" />
                  {reporting ? 'Reporting…' : 'Report this email as phishing'}
                </button>
                <p className="text-[11px] text-slate-600">
                  Reporting a simulation (even after clicking) is always the right move — it\u2019s never penalized.
                </p>
              </div>
            )}

            <div className="flex flex-col items-center gap-3 border-t border-white/5 pt-6">
              <button onClick={complete} disabled={busy} className="btn-primary w-full py-3 sm:w-auto sm:px-8">
                {busy ? 'Recording…' : (
                  <>
                    <GraduationCap size={17} />
                    Complete the 2-minute micro-lesson
                    <ArrowRight size={15} />
                  </>
                )}
              </button>
              <p className="flex items-center gap-1.5 text-[11px] text-slate-600">
                <Sparkles size={12} />
                Completing this marks you as trained on this simulation
              </p>
            </div>
          </div>
        </div>

        <p className="mt-8 flex items-center justify-center gap-2 text-center text-xs text-slate-600">
          <EyeOff size={13} />
          A real phishing email would not show this page — it would lead to a fake login. That difference is the whole point.
        </p>
      </div>
    </div>
  );
}
