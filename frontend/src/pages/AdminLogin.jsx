import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  Loader2,
  Mail,
  Lock,
  KeyRound,
  User,
  LogIn,
  UserPlus,
  ArrowLeft,
  ArrowRight,
  Globe,
} from 'lucide-react';
import { login, registerAdmin } from '../lib/api';
import { useAuth } from '../App';
import Logo from '../components/Logo';

export default function AdminLogin() {
  const { login: setToken } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('signin');
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('admin@phishloop.dev');
  const [password, setPassword] = useState('admin1234');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setError('');
    if (mode === 'signin') {
      setEmail('admin@phishloop.dev');
      setPassword('admin1234');
    } else {
      setPassword('');
      setConfirm('');
    }
  }, [mode]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'signup') {
        if (password !== confirm) throw new Error('Passwords do not match');
        const data = await registerAdmin({ first_name: firstName, email, password });
        setToken(data.access_token);
      } else {
        const data = await login({ org_name: 'Acme Corp Pvt. Ltd.', email, password });
        if (data.role !== 'platform_admin') {
          throw new Error('This is the developer portal. Sign in with a developer admin account.');
        }
        setToken(data.access_token);
      }
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0a0a0c] px-4 py-12 sm:px-8">
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          background: 'linear-gradient(-45deg, #1a0d03, #120804, #200f05, #0c0603)',
          backgroundSize: '400% 400%',
          animation: 'gradientMove 16s ease infinite',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(249,115,22,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(249,115,22,0.6) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
        }}
      />
      <div className="pointer-events-none absolute -left-32 top-20 h-96 w-96 rounded-full bg-orange-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-10 h-96 w-96 rounded-full bg-amber-600/15 blur-3xl" />

      <div className="relative w-full max-w-md">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-slate-200"
        >
          <ArrowLeft size={15} />
          Back to site
        </Link>

        <div className="panel-dark rounded-2xl border border-white/10 bg-[#141418]/85 p-8 shadow-2xl shadow-black/50 backdrop-blur-xl anim-fade-up">
          <div className="mb-8 flex flex-col items-center text-center">
            <Logo size="lg" />
            <h1 className="mt-4 font-display text-2xl font-bold text-white">
              Phishloop <span className="gradient-text">Developer Portal</span>
            </h1>
            <p className="mt-1.5 max-w-xs text-sm text-slate-400">
              Restricted access. Only developer admins with full visibility can sign in here.
            </p>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl border border-white/5 bg-slate-950/60 p-1">
            {[
              { key: 'signin', label: 'Sign in', icon: LogIn },
              { key: 'signup', label: 'Sign up', icon: UserPlus },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => {
                  setMode(key);
                  setError('');
                }}
                className={
                  mode === key
                    ? 'flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-orange-500 to-amber-600 px-3 py-2 text-sm font-semibold text-white shadow-md shadow-orange-500/20'
                    : 'flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 hover:text-slate-200'
                }
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          )}

          <form className="space-y-4" onSubmit={submit}>
            {mode === 'signup' && (
              <Field icon={User} label="Full name">
                <input
                  className="input"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Aayush"
                  required
                />
              </Field>
            )}
            <Field icon={Mail} label="Email address">
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                required
              />
            </Field>
            <Field icon={Lock} label="Password">
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </Field>
            {mode === 'signup' && (
              <Field icon={KeyRound} label="Confirm password">
                <input
                  className="input"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </Field>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full py-3">
              {loading ? <Loader2 className="animate-spin" size={18} /> : <ShieldCheck size={18} />}
              {loading
                ? 'Please wait…'
                : mode === 'signup'
                  ? 'Create developer account'
                  : 'Enter developer console'}
              {!loading && <ArrowRight size={16} />}
            </button>
          </form>

          {mode === 'signin' ? (
            <p className="mt-6 rounded-xl border border-orange-500/20 bg-orange-500/10 px-4 py-3 text-center text-xs leading-relaxed text-orange-200">
              Developer access: <span className="font-mono text-orange-300">admin@phishloop.dev</span> ·{' '}
              <span className="font-mono text-orange-300">admin1234</span>
            </p>
          ) : (
            <p className="mt-6 rounded-xl border border-white/5 bg-slate-950/40 px-4 py-3 text-center text-xs leading-relaxed text-slate-500">
              Don&apos;t have an account yet? Create one above. It will be linked to the demo workspace
              with full (unpaywalled) visibility.
            </p>
          )}
        </div>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-500">
          <Globe size={12} className="text-orange-400" />
          AI-powered phishing defense, built for Nepal.
        </p>
      </div>
    </div>
  );
}

function Field({ icon: Icon, label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-300">{label}</span>
      <div className="relative">
        <Icon size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <div className="[&>input]:pl-10">{children}</div>
      </div>
    </label>
  );
}
