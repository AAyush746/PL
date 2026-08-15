import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import {
  BadgeCheck,
  Building2,
  CalendarClock,
  Check,
  Loader2,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react';
import MemberHeader from '../components/MemberHeader';
import { useAuth } from '../App';
import { initiateEsewa } from '../lib/api';
import { findPlan, planPrice } from '../lib/plans';

export default function Payment() {
  const { token, user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const plan = findPlan(searchParams.get('plan'));
  const result = searchParams.get('result');
  const employeeCount = user?.employeeCount ?? 0;
  const total = planPrice(plan?.id, employeeCount);
  const annual = plan?.id === 'enterprise';
  const billingLabel = annual ? 'Annual billing' : 'Monthly billing';

  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    if (result === 'success') {
      refreshUser().finally(() => setPaid(true));
    } else if (result === 'failed') {
      setError('The payment was not completed. You can try again below.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  useEffect(() => {
    if (!paid) return;
    const t = setTimeout(() => navigate('/dashboard', { replace: true }), 1600);
    return () => clearTimeout(t);
  }, [paid, navigate]);

  if (!plan) return <Navigate to="/start-trial" replace />;

  const checkout = async () => {
    setError('');
    setProcessing(true);
    try {
      const { action_url: actionUrl, form } = await initiateEsewa(token, plan.id);
      const formEl = document.createElement('form');
      formEl.method = 'POST';
      formEl.action = actionUrl;
      for (const [name, value] of Object.entries(form)) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = value;
        formEl.appendChild(input);
      }
      document.body.appendChild(formEl);
      formEl.submit();
    } catch (err) {
      setError(err.message || 'Could not start the payment. Please try again.');
      setProcessing(false);
    }
  };

  const amount = total != null ? `NPR ${total.toLocaleString('en-IN')}` : plan.price;
  const enterpriseOnly = total == null;
  const noEmployees = total != null && total <= 0;
  const cannotPay = enterpriseOnly || noEmployees;

  return (
    <div className="min-h-screen bg-[#f3ebdb] text-slate-800">
      <MemberHeader />

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-40 top-0 h-80 w-80 rounded-full bg-orange-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -right-40 top-20 h-80 w-80 rounded-full bg-amber-500/10 blur-3xl" />

        <div className="relative mx-auto max-w-5xl px-5 py-12 sm:px-8 sm:py-14">
          {paid ? (
            <div className="mx-auto max-w-lg">
              <div className="glass-panel p-10 text-center anim-fade-up">
                <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/30">
                  <BadgeCheck size={38} className="text-white" />
                </div>
                <h1 className="font-display text-2xl font-bold text-slate-900">Payment successful!</h1>
                <p className="mt-2 text-sm text-slate-600">
                  Your <span className="font-semibold capitalize">{plan.name}</span> plan is now
                  active. Your command center is unlocked — opening it now…
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-8 lg:grid-cols-5">
              {/* ── Order summary ─────────────────────────────────────── */}
              <div className="lg:col-span-2">
                <div className="glass-panel overflow-hidden">
                  <div className="border-b border-black/10 bg-gradient-to-br from-orange-500/10 to-amber-500/5 px-6 py-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-600">Order summary</p>
                    <h1 className="mt-1 font-display text-xl font-bold text-slate-900 capitalize">{plan.name} plan</h1>
                    <p className="text-sm text-slate-600">{plan.range}</p>
                  </div>
                  <div className="space-y-3 px-6 py-5 text-sm">
                    <div className="flex items-center gap-2.5 text-slate-700">
                      <Building2 size={15} className="shrink-0 text-orange-500" />
                      <span className="truncate">{user?.orgName}</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-slate-700">
                      <Users size={15} className="shrink-0 text-orange-500" />
                      {employeeCount} employees
                    </div>
                    <div className="flex items-center gap-2.5 text-slate-700">
                      <CalendarClock size={15} className="shrink-0 text-orange-500" />
                      {billingLabel}
                    </div>
                    <div className="border-t border-black/10 pt-3">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">{plan.price} × {employeeCount} employees{annual ? ' / year' : ' / month'}</span>
                        <span className="font-semibold text-slate-900">{amount}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between border-t border-black/10 pt-2">
                        <span className="font-medium text-slate-700">Total due today</span>
                        <span className="font-display text-lg font-bold text-orange-600">{amount}</span>
                      </div>
                    </div>
                    <ul className="space-y-2 pt-1">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-slate-700">
                          <Check size={14} className="mt-0.5 shrink-0 text-emerald-600" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              {/* ── eSewa checkout ────────────────────────────────────── */}
              <div className="lg:col-span-3">
                <div className="glass-panel p-8">
                  <div className="mb-6 flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/25">
                      <Wallet className="text-white" size={20} />
                    </div>
                    <div>
                      <h2 className="font-display text-lg font-semibold text-slate-900">Pay with eSewa</h2>
                      <p className="text-xs text-slate-500">eSewa ePay · secure digital wallet</p>
                    </div>
                  </div>

                  {error && (
                    <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700">
                      {error}
                    </div>
                  )}

                  {enterpriseOnly && (
                    <div className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-800">
                      Enterprise has custom pricing. Contact{' '}
                      <span className="font-semibold">sales@phishloop.dev</span> to get a tailored
                      quote for your organization.
                    </div>
                  )}

                  {noEmployees && (
                    <div className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-800">
                      Your workspace has no employees yet, so there is nothing to bill. Add employees
                      first, then come back to subscribe.
                    </div>
                  )}

                  {!cannotPay && (
                    <>
                      <div className="mb-5 space-y-3 rounded-xl border border-black/10 bg-white/50 p-4 text-sm text-slate-600">
                        <div className="flex items-center justify-between">
                          <span>Plan</span>
                          <span className="font-semibold capitalize text-slate-900">{plan.name}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Seats</span>
                          <span className="font-semibold text-slate-900">{employeeCount} employees</span>
                        </div>
                        <div className="flex items-center justify-between border-t border-black/10 pt-2">
                          <span className="font-medium text-slate-700">Total payable</span>
                          <span className="font-display text-lg font-bold text-emerald-600">{amount}</span>
                        </div>
                      </div>

                      <button onClick={checkout} disabled={processing} className="btn-primary w-full py-3.5">
                        {processing ? (
                          <>
                            <Loader2 className="animate-spin" size={17} />
                            Redirecting to eSewa…
                          </>
                        ) : (
                          <>
                            <Wallet size={15} />
                            Pay {amount} with eSewa
                          </>
                        )}
                      </button>

                      <p className="mt-3 text-center text-xs text-slate-500">
                        You'll be taken to eSewa to approve the payment, then returned here.
                      </p>
                    </>
                  )}

                  <div className="mt-5 flex items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-xs text-emerald-700">
                    <ShieldCheck size={14} className="shrink-0" />
                    eSewa ePay UAT sandbox — use the test eSewaId and the OTP token{' '}
                    <span className="font-semibold">123456</span> to complete the payment.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
