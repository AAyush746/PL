import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, LayoutDashboard, LogOut, Mail, Building2, Sparkles, ShieldCheck } from 'lucide-react';
import { useAuth } from '../App';

function planLabel(tier) {
  if (!tier || tier === 'free') return 'Free plan';
  const names = { starter: 'Starter', growth: 'Growth', enterprise: 'Enterprise' };
  return `${names[tier] || tier} plan`;
}

export default function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const firstName = user?.firstName || 'User';
  const initial = (firstName[0] || 'U').toUpperCase();

  const handleLogout = () => {
    setOpen(false);
    logout();
    navigate('/');
  };

  return (
    <div
      ref={ref}
      className="relative after:absolute after:inset-x-0 after:-bottom-2 after:h-2 after:content-['']"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full p-1 transition-colors hover:bg-white/10"
        aria-haspopup="menu"
        aria-expanded={open}
        title={firstName}
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-600 text-sm font-bold text-white shadow-lg shadow-orange-500/30 ring-2 ring-white/10">
          {initial}
        </span>
        <ChevronDown size={16} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl shadow-black/20"
        >
          <div className="border-b border-black/10 bg-gradient-to-br from-orange-500/10 to-amber-500/5 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-600 text-base font-bold text-white">
                {initial}
              </span>
              <div className="min-w-0">
                <p className="truncate font-display font-semibold text-slate-900">{firstName}</p>
                <p className="truncate text-xs text-slate-500">{user?.email}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-orange-700">
              {user?.role === 'platform_admin' ? (
                <>
                  <ShieldCheck size={13} className="text-orange-500" />
                  Developer admin · full access
                </>
              ) : (
                <>
                  <Sparkles size={13} className="text-orange-500" />
                  {planLabel(user?.subscriptionTier)}
                </>
              )}
            </div>
          </div>

          <div className="space-y-1 px-2 py-2">
            <div className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700">
              <Building2 size={15} className="shrink-0 text-slate-400" />
              <span className="truncate">{user?.orgName}</span>
            </div>
            <div className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700">
              <Mail size={15} className="shrink-0 text-slate-400" />
              <span className="truncate">{user?.email}</span>
            </div>
          </div>

          <div className="border-t border-black/10 p-2">
            <Link
              to="/dashboard"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-black/5 hover:text-slate-900"
            >
              <LayoutDashboard size={16} className="text-orange-500" />
              Go to dashboard
            </Link>
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-rose-500/10 hover:text-rose-600"
            >
              <LogOut size={16} className="text-rose-500" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
