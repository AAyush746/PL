import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Loader2 } from 'lucide-react';

export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

export function riskColor(score) {
  if (score == null) return 'text-slate-600';
  if (score < 25) return 'text-emerald-600';
  if (score < 45) return 'text-amber-600';
  if (score < 70) return 'text-orange-600';
  return 'text-rose-600';
}

export function riskBg(score) {
  if (score == null) return 'bg-slate-500/15 text-slate-700';
  if (score < 25) return 'bg-emerald-500/15 text-emerald-700';
  if (score < 45) return 'bg-amber-500/15 text-amber-700';
  if (score < 70) return 'bg-orange-500/15 text-orange-700';
  return 'bg-rose-500/15 text-rose-700';
}

export function riskBarColor(score) {
  if (score < 25) return 'bg-emerald-400';
  if (score < 45) return 'bg-amber-400';
  if (score < 70) return 'bg-orange-400';
  return 'bg-rose-500';
}

const STATUS_STYLES = {
  draft: 'bg-slate-500/15 text-slate-700 border-slate-500/20',
  scheduled: 'bg-orange-500/15 text-orange-700 border-orange-500/20',
  active: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/20',
  completed: 'bg-amber-500/15 text-amber-700 border-amber-500/20',
};

const STATUS_DOTS = {
  draft: 'bg-slate-400',
  scheduled: 'bg-orange-400',
  active: 'bg-emerald-400 animate-pulse',
  completed: 'bg-amber-400',
};

export function StatusBadge({ status }) {
  const key = String(status || 'draft').toLowerCase();
  return (
    <span className={cn('badge border', STATUS_STYLES[key] || STATUS_STYLES.draft)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOTS[key] || STATUS_DOTS.draft)} />
      {status}
    </span>
  );
}

export function DifficultyDots({ level }) {
  const colors = {
    1: 'bg-emerald-400',
    2: 'bg-lime-400',
    3: 'bg-amber-400',
    4: 'bg-orange-400',
    5: 'bg-rose-400',
  };
  return (
    <span className="inline-flex items-center gap-1" title={`Difficulty ${level}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            i <= level ? colors[level] || 'bg-amber-400' : 'bg-white/10'
          )}
        />
      ))}
    </span>
  );
}

export function Modal({ open, onClose, title, children, wide }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className={cn(
          'glass-panel w-full overflow-hidden anim-fade-up',
          wide ? 'max-w-4xl' : 'max-w-lg'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-black/10 px-6 py-4">
          <h3 className="font-display text-lg font-semibold text-slate-900">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-black/10 hover:text-slate-900"
          >
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-slate-400">
      <Loader2 className="animate-spin text-orange-400" size={22} />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, hint, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {Icon && (
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-black/10 bg-black/5">
          <Icon className="text-slate-600" size={28} />
        </div>
      )}
      <h3 className="font-display text-lg font-semibold text-slate-900">{title}</h3>
      {hint && <p className="mt-1 max-w-sm text-sm text-slate-600">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function KpiCard({ icon: Icon, label, value, delta, sub, accent = 'cyan' }) {
  const accents = {
    cyan: 'from-orange-500/20 to-transparent text-orange-400',
    indigo: 'from-amber-500/20 to-transparent text-amber-400',
    emerald: 'from-emerald-500/20 to-transparent text-emerald-400',
    rose: 'from-rose-500/20 to-transparent text-rose-400',
    amber: 'from-amber-500/20 to-transparent text-amber-400',
  };
  return (
    <div className="kpi-card anim-fade-up">
      <div
        className={cn(
          'pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-bl opacity-40 blur-2xl',
          accents[accent]
        )}
      />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-600">{label}</p>
          <p className="mt-2 font-display text-3xl font-bold text-slate-900">{value}</p>
        </div>
        {Icon && <div className={cn('rounded-xl border border-black/10 bg-black/5 p-2.5', accents[accent])}><Icon size={20} /></div>}
      </div>
      {(delta != null || sub) && (
        <div className="mt-3 text-xs text-slate-600">
          {delta != null && <span className={cn('font-medium', delta >= 0 ? 'text-emerald-600' : 'text-rose-600')}>{delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}%</span>}
          {sub && <span className="text-slate-500"> {sub}</span>}
        </div>
      )}
    </div>
  );
}

export function ProgressBar({ value, color = 'bg-orange-400', className }) {
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-black/10', className)}>
      <div
        className={cn('h-full rounded-full transition-all duration-700', color)}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export function ErrorNotice({ error }) {
  if (!error) return null;
  return (
    <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
      {error}
    </div>
  );
}

export function useAsync(loader, deps) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    loaderRef.current()
      .then((result) => {
        if (alive) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (alive) {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  return { data, loading, error, reload };
}
