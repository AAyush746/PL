import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, CreditCard, Sparkles, Users } from 'lucide-react';
import MemberHeader from '../components/MemberHeader';
import { useAuth } from '../App';
import { PLANS, recommendedFor } from '../lib/plans';
import { cn } from '../components/ui';

export default function Plans() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selected, setSelected] = useState(() =>
    ['starter', 'growth', 'enterprise'].includes(user?.subscriptionTier)
      ? user.subscriptionTier
      : recommendedFor(user?.employeeCount ?? 0)
  );

  const employeeCount = user?.employeeCount ?? 0;
  const active = ['starter', 'growth', 'enterprise'].includes(user?.subscriptionTier)
    ? user.subscriptionTier
    : null;

  return (
    <div className="min-h-screen bg-[#f3ebdb] text-slate-800">
      <MemberHeader />

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-40 top-0 h-80 w-80 rounded-full bg-orange-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -right-40 top-20 h-80 w-80 rounded-full bg-amber-500/10 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-16">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-600">Start your free trial</p>
            <h1 className="mt-2 font-display text-3xl font-bold text-slate-900 sm:text-4xl">
              Pick the plan that fits your team.
            </h1>
            <p className="mt-3 text-base text-slate-600">
              Choose a plan below, then complete a secure eSewa payment to unlock the full
              command center for your organization's HR.
            </p>
          </div>

          <div className="mx-auto mt-6 flex max-w-xl items-center justify-center gap-2 rounded-2xl border border-orange-500/25 bg-orange-500/10 px-5 py-3 text-sm text-orange-800">
            <Users size={16} className="shrink-0 text-orange-600" />
            Your workspace has <span className="font-semibold">{employeeCount} employees</span> —
            we recommend the{' '}
            <span className="font-semibold capitalize">{recommendedFor(employeeCount)} plan</span>.
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {PLANS.map((plan) => {
              const isSelected = selected === plan.id;
              const isActive = active === plan.id;
              return (
                <div
                  key={plan.id}
                  onClick={() => setSelected(plan.id)}
                  className={cn(
                    'relative cursor-pointer rounded-2xl border bg-white/70 p-7 shadow-xl shadow-black/5 backdrop-blur-sm transition-all',
                    isSelected
                      ? 'border-orange-500 ring-2 ring-orange-500/40'
                      : 'border-black/10 hover:border-orange-400/50'
                  )}
                >
                  {isSelected && (
                    <span className="absolute -top-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-gradient-to-r from-orange-500 to-amber-600 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow-lg shadow-orange-500/30">
                      <Sparkles size={11} />
                      Recommended
                    </span>
                  )}

                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-600">{plan.name}</p>
                  <h3 className="mt-1 font-display text-lg font-semibold text-slate-900">{plan.range}</h3>

                  <div className="mt-4 flex items-baseline gap-1.5">
                    <span className="font-display text-3xl font-bold text-slate-900">{plan.price}</span>
                    {plan.per && <span className="text-xs text-slate-500">{plan.per}</span>}
                  </div>

                  <ul className="mt-5 space-y-2.5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-slate-700">
                        <Check size={15} className="mt-0.5 shrink-0 text-emerald-600" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelected(plan.id);
                      navigate(`/payment?plan=${plan.id}`);
                    }}
                    className={cn(
                      'btn-primary mt-7 w-full py-3',
                      isSelected ? '' : 'bg-slate-800 hover:bg-slate-700'
                    )}
                  >
                    <CreditCard size={15} />
                    {isActive ? 'Manage plan' : `Start free trial · ${plan.price}`}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mx-auto mt-8 flex max-w-lg items-center gap-2 text-xs text-slate-500">
            <CreditCard size={13} className="shrink-0 text-orange-500" />
            <span>Selecting a plan takes you to a secure eSewa payment. Your dashboard unlocks
            immediately after the payment is confirmed.</span>
          </div>
        </div>
      </section>
    </div>
  );
}
