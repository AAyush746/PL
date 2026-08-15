import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Crosshair,
  FileText,
  Users,
  Inbox,
  Send,
  LogOut,
  ShieldAlert,
  BookOpen,
} from 'lucide-react';
import { useAuth } from '../App';
import { cn } from './ui';
import Logo from './Logo';
import UserMenu from './UserMenu';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/campaigns', label: 'Campaigns', icon: Crosshair },
  { to: '/templates', label: 'Templates', icon: FileText },
  { to: '/employees', label: 'Employees', icon: Users },
  { to: '/remediation', label: 'Remediation', icon: ShieldAlert },
  { to: '/training', label: 'Training', icon: BookOpen },
  { to: '/mailbox', label: 'Mailbox', icon: Inbox },
  { to: '/sending-profiles', label: 'Sending', icon: Send },
];

const TITLES = {
  '/dashboard': 'Command Center',
  '/campaigns': 'Simulation Campaigns',
  '/templates': 'Phishing Templates',
  '/employees': 'Employee Directory',
  '/remediation': 'Remediation & Follow-up',
  '/training': 'Training Library',
  '/mailbox': 'Simulated Mailbox',
  '/sending-profiles': 'Sending Profiles',
};

export default function Shell() {
  const { logout, user } = useAuth();
  const location = useLocation();
  const orgInitials = (user?.orgName || 'Phishloop')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-white/10 bg-[#0c0c0e] lg:flex">
        <div className="flex items-center gap-3 px-6 py-6">
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full">
            <Logo size="md" className="absolute inset-0" />
            <span
              title={user?.orgName || 'Your organization'}
              className="absolute inset-0 flex items-center justify-center rounded-full bg-gradient-to-br from-slate-600 to-slate-800 text-xs font-bold text-white ring-1 ring-white/10"
            >
              {orgInitials}
            </span>
          </div>
          <div>
            <p className="font-display text-base font-bold leading-tight text-white">Phishloop</p>
            <p className="text-[11px] font-medium uppercase tracking-widest text-orange-400/80">Human Risk Platform</p>
          </div>
        </div>

        <nav className="mt-2 flex-1 space-y-1 px-3">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all',
                  isActive
                    ? 'bg-gradient-to-r from-orange-500/15 to-amber-500/10 text-orange-300 shadow-inner'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    size={18}
                    className={cn(
                      'transition-colors',
                      isActive ? 'text-orange-300' : 'text-slate-500 group-hover:text-slate-300'
                    )}
                  />
                  {label}
                  {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-orange-400 shadow-[0_0_8px_rgba(249,115,22,0.8)]" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/5 p-4">
          <div className="mb-3 rounded-xl border border-orange-500/15 bg-orange-500/5 p-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-orange-300">Demo access</p>
            <p className="mt-1 font-mono text-[11px] leading-relaxed text-slate-400">
              Acme Corp Pvt. Ltd. / admin@demo.com / demo1234
            </p>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
          >
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 bg-[#0c0c0e]/95 px-6 py-4 backdrop-blur-xl">
          <div className="flex items-center gap-3 lg:hidden">
            <Logo size="sm" />
            <p className="font-display font-bold text-white">Phishloop</p>
          </div>
          <h2 className="hidden font-display text-lg font-semibold text-slate-200 lg:block">
            {TITLES[location.pathname] || 'Phishloop'}
          </h2>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 sm:flex">
              <span className="chip border border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                Platform online
              </span>
            </span>
            <UserMenu />
          </div>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-white/10 bg-[#0c0c0e] px-4 py-2 lg:hidden">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium',
                  isActive ? 'bg-orange-500/15 text-orange-300' : 'text-slate-400 hover:text-slate-200'
                )
              }
            >
              <Icon size={14} />
              {label}
            </NavLink>
          ))}
        </nav>

        <main className="flex-1 p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
