import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import Logo from '../components/Logo';
import LandingSections from '../components/LandingSections';
import { useAuth } from '../App';

const NAV = [
  { href: '#top', label: 'Home' },
  { href: '#training', label: 'Training' },
  { href: '#about', label: 'About' },
  { href: '#contact', label: 'Contact' },
];

export default function Landing() {
  const { token } = useAuth();
  const navigate = useNavigate();

  const onStartTrial = () => {
    if (token) {
      navigate('/home');
    } else {
      navigate('/login', { state: { from: '/home' } });
    }
  };

  return (
    <div id="top" className="min-h-screen bg-[#f3ebdb] text-slate-800">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8 sm:py-5">
          <a href="#top" className="flex items-center gap-3 sm:gap-3.5">
            <Logo size="xl" />
            <span className="font-display text-xl font-bold text-white sm:text-2xl">Phishloop</span>
          </a>
          <nav className="hidden items-center gap-8 md:flex">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                className="text-base font-medium text-slate-300 transition-colors hover:text-orange-300"
              >
                {n.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2.5">
            <Link
              to="/login"
              className="btn-ghost border-white/15 bg-white/5 px-5 py-2.5 text-base text-slate-200 hover:border-white/25 hover:bg-white/10"
            >
              Sign in
            </Link>
            <Link
              to="/login"
              className="btn-primary hidden px-5 py-2.5 sm:inline-flex"
            >
              Create account
            </Link>
          </div>
        </div>
      </header>

      <LandingSections onStartTrial={onStartTrial} />
    </div>
  );
}
