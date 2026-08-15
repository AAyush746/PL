import { Link, NavLink } from 'react-router-dom';
import { LayoutDashboard } from 'lucide-react';
import Logo from './Logo';
import UserMenu from './UserMenu';
import { cn } from './ui';

const NAV = [
  { to: '/home', label: 'Home', end: true },
  { to: '/training', label: 'Training' },
  { to: '/home#about', label: 'About' },
  { to: '/home#contact', label: 'Contact' },
];

export default function MemberHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8 sm:py-4">
        <Link to="/home" className="flex items-center gap-3 sm:gap-3.5">
          <Logo size="xl" />
          <span className="font-display text-xl font-bold text-white sm:text-2xl">Phishloop</span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'text-base font-medium transition-colors hover:text-orange-300',
                  isActive ? 'text-orange-300' : 'text-slate-300'
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
          <NavLink
            to="/dashboard"
            className="flex items-center gap-2 rounded-xl border border-orange-400/30 bg-orange-500/10 px-4 py-2 text-sm font-semibold text-orange-300 transition-colors hover:bg-orange-500/20 hover:text-orange-200"
          >
            <LayoutDashboard size={16} />
            Dashboard
          </NavLink>
        </nav>

        <div className="flex items-center gap-3">
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
