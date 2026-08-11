import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ShieldCheck,
  Loader2,
  Mail,
  Lock,
  Building2,
  KeyRound,
  UserPlus,
  LogIn,
  Fingerprint,
  ScanFace,
  Eye,
  Globe,
  CheckCircle2,
  Radar,
  ArrowRight,
} from 'lucide-react';
import { login, register } from '../lib/api';
import { useAuth } from '../App';
import Logo from '../components/Logo';

const SHIELD_PATH =
  'polygon(50% 0%, 92% 8%, 92% 62%, 74% 88%, 50% 100%, 26% 88%, 8% 62%, 8% 8%)';

const FLOATERS = [
  { Icon: Fingerprint, delay: 0.9, dur: '8s', label: 'Biometric MFA' },
  { Icon: Lock, delay: 1.2, dur: '7s', label: 'Encryption' },
  { Icon: Mail, delay: 1.5, dur: '6.5s', label: 'Phish alerts' },
  { Icon: KeyRound, delay: 1.8, dur: '7.5s', label: 'Access keys' },
  { Icon: Eye, delay: 2.1, dur: '7s', label: 'Threat watch' },
  { Icon: ScanFace, delay: 2.4, dur: '8.5s', label: 'Identity scan' },
];

const FEATURES = [
  'Realistic phishing simulations',
  'Human-risk analytics dashboard',
  'Automated security awareness training',
  'Zero-config onboarding',
];

export default function Login() {
  const { login: setToken } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState('login');
  const [orgName, setOrgName] = useState('Acme Corp Pvt. Ltd.');
  const [email, setEmail] = useState('admin@demo.com');
  const [password, setPassword] = useState('demo1234');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [popped, setPopped] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setPopped(true), 150);
    return () => clearTimeout(t);
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'register') {
        if (password !== confirm) throw new Error('Passwords do not match');
        await register({ org_name: orgName, email, password });
      }
      const data = await login({ org_name: orgName, email, password });
      setToken(data.access_token);
      navigate(location.state?.from || '/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4 sm:p-8">
      <div className="pointer-events-none absolute -left-32 top-20 h-96 w-96 rounded-full bg-orange-500/10 blur-3xl anim-float" />
      <div className="pointer-events-none absolute -right-32 bottom-10 h-96 w-96 rounded-full bg-amber-600/10 blur-3xl anim-float" style={{ animationDelay: '2s' }} />

      {/* ── Outer frame: large rounded beige rectangle ─────────────────── */}
      <div className="relative grid w-full max-w-6xl overflow-hidden rounded-[2rem] border border-[#e0d2b2] bg-[#f2ead8] shadow-2xl shadow-black/30 lg:min-h-[82vh] lg:grid-cols-2">
        {/* ── Left: animated security visual ───────────────────────────── */}
        <div className="relative hidden min-h-full flex-col justify-between overflow-hidden border-r border-white/5 bg-[#0a0a0c] lg:flex">
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{
              background: 'linear-gradient(-45deg, #1a0d03, #120804, #200f05, #0c0603)',
              backgroundSize: '400% 400%',
              animation: 'gradientMove 16s ease infinite',
            }}
          />
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(249,115,22,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(249,115,22,0.6) 1px, transparent 1px)',
              backgroundSize: '44px 44px',
              animation: 'gridShift 6s linear infinite',
            }}
          />
          <div
            className="pointer-events-none absolute -left-32 top-10 h-96 w-96 rounded-full bg-orange-500/20 blur-3xl"
            style={{ animation: 'orbPulse 8s ease-in-out infinite' }}
          />
          <div
            className="pointer-events-none absolute -right-24 bottom-10 h-[28rem] w-[28rem] rounded-full bg-amber-600/20 blur-3xl"
            style={{ animation: 'orbPulse 10s ease-in-out 2s infinite' }}
          />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-500/10 blur-3xl" />

          {/* Brand */}
          <div className="relative z-10 flex items-center gap-3 px-10 pt-10">
            <Logo size="md" />
            <div>
              <p className="font-display text-lg font-bold text-white">Phishloop</p>
              <p className="text-[11px] font-medium uppercase tracking-widest text-orange-400/80">
                Human Risk Platform
              </p>
            </div>
          </div>

          {/* Radar scene */}
          <div className="relative z-10 flex flex-1 items-center justify-center">
            <div className="relative flex h-[26rem] w-[26rem] items-center justify-center">
              <div
                className="absolute inset-0 rounded-full border border-dashed border-orange-400/25"
                style={{ animation: 'spinSlow 40s linear infinite' }}
              />
              <div
                className="absolute inset-10 rounded-full border border-white/5"
                style={{ animation: 'spinSlowReverse 60s linear infinite' }}
              />
              {[0, 1.4, 2.8].map((delay) => (
                <div
                  key={delay}
                  className="absolute h-60 w-60 rounded-full border border-orange-400/25"
                  style={{ animation: `radarRing 4s ease-out ${delay}s infinite` }}
                />
              ))}

              {/* Scan beam */}
              <div className="pointer-events-none absolute inset-12 overflow-hidden rounded-full opacity-50">
                <div
                  className="absolute left-0 right-0 h-20 bg-gradient-to-b from-transparent via-orange-400/30 to-transparent"
                  style={{ animation: 'scanBeam 5s linear infinite' }}
                />
              </div>

              {/* Floating icons — pop out from behind the shield, orbit the ring */}
              {FLOATERS.map(({ Icon, delay, dur, label }, i) => {
                const orbitDelay = -((40 * i) / 6);
                return (
                  <div
                    key={label}
                    className="absolute inset-0"
                    style={{ animation: `spinSlow 40s linear infinite ${orbitDelay}s` }}
                  >
                    <div
                      className="absolute"
                      style={{
                        top: popped ? '0%' : '50%',
                        left: '50%',
                        transform: `translate(-50%, -50%) scale(${popped ? 1 : 0.15})`,
                        opacity: popped ? 1 : 0,
                        transition:
                          'top 1.3s cubic-bezier(0.22, 1, 0.36, 1), transform 1.3s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.7s ease',
                        transitionDelay: `${delay}s`,
                      }}
                    >
                      <div style={{ animation: `spinSlowReverse 40s linear infinite ${orbitDelay}s` }}>
                        <div
                          className="flex flex-col items-center gap-1.5"
                          style={{ animation: `drift ${dur}s ease-in-out infinite` }}
                        >
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-orange-400/25 bg-slate-900/70 shadow-lg shadow-orange-500/10 backdrop-blur-md">
                            <Icon className="text-orange-300" size={22} />
                          </div>
                          <span className="rounded-full border border-white/10 bg-slate-950/70 px-2 py-0.5 text-[10px] font-medium text-slate-300 backdrop-blur-sm">
                            {label}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Shield — rendered on top so elements emerge from behind it */}
              <div className="relative z-20 flex flex-col items-center">
                <div className="relative">
                  <div
                    className="absolute -inset-3"
                    style={{ clipPath: SHIELD_PATH, background: 'rgba(249,115,22,0.14)', filter: 'blur(20px)' }}
                  />
                  <div
                    className="relative flex h-52 w-48 items-center justify-center"
                    style={{
                      clipPath: SHIELD_PATH,
                      background:
                        'linear-gradient(160deg, rgba(249,115,22,0.38), rgba(194,65,12,0.24) 45%, rgba(10,10,12,0.6))',
                      animation: 'shieldPulse 3.2s ease-in-out infinite',
                    }}
                  >
                    <ShieldCheck className="text-orange-300" size={72} strokeWidth={1.4} />
                  </div>
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{ clipPath: SHIELD_PATH, boxShadow: 'inset 0 0 0 1px rgba(249,115,22,0.4)' }}
                  />
                  <svg viewBox="0 0 40 40" className="absolute -bottom-1 -right-2 z-10 h-11 w-11">
                    <circle cx="20" cy="20" r="19" className="fill-emerald-500/25" />
                    <path
                      d="M12 21l5 5 11-13"
                      fill="none"
                      stroke="#34d399"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray="26"
                      strokeDashoffset="26"
                      style={{ animation: 'drawCheck 1s ease-out 0.4s forwards' }}
                    />
                  </svg>
                  <span className="absolute right-3 top-4 z-10 flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400" style={{ animation: 'dotPing 1.8s ease-out infinite' }} />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom copy */}
          <div className="relative z-10 px-10 pb-10">
            <div className="mb-6 flex items-center gap-2 text-orange-300">
              <Radar className="text-orange-400" size={16} />
              <p className="text-sm font-semibold">Your organization's first line of defense</p>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {FEATURES.map((feature, i) => (
                <div
                  key={feature}
                  className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5 text-sm text-slate-300"
                  style={{ animation: `fadeUp 0.5s ease-out ${0.2 + i * 0.1}s both` }}
                >
                  <CheckCircle2 className="shrink-0 text-emerald-400" size={16} />
                  {feature}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right: form ──────────────────────────────────────────────── */}
        <div className="panel-dark relative flex items-center justify-center bg-[#0e0e11] px-6 py-12 sm:px-10">
          <div className="pointer-events-none absolute -left-20 top-16 h-72 w-72 rounded-full bg-orange-500/10 blur-3xl anim-float lg:hidden" />
          <div className="w-full max-w-md anim-fade-up">
            <div className="mb-8 flex flex-col items-center text-center lg:hidden">
              <Logo size="lg" />
              <h1 className="font-display text-3xl font-bold text-white">Phishloop</h1>
              <p className="mt-2 text-sm text-slate-400">
                Phishing simulation training &amp; human-risk analytics.
              </p>
            </div>

            <div className="mb-8 hidden lg:block">
              <h2 className="font-display text-2xl font-bold text-white">
                Welcome back <span className="gradient-text">to command</span>
              </h2>
              <p className="mt-1.5 text-sm text-slate-400">
                {mode === 'register'
                  ? 'Create your workspace and start securing your team in minutes.'
                  : 'Sign in to your organization to manage phishing simulations and human risk.'}
              </p>
            </div>

            <div className="panel-dark rounded-2xl border border-white/10 bg-[#141418]/85 p-8 shadow-2xl shadow-black/50 backdrop-blur-xl">
              <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl border border-white/5 bg-slate-950/60 p-1">
                {[
                  { key: 'login', label: 'Sign in', icon: LogIn },
                  { key: 'register', label: 'Create org', icon: UserPlus },
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
                <Field icon={Building2} label={mode === 'register' ? 'Organization name' : 'Your organization'}>
                  <input
                    className="input"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="Acme Corp Pvt. Ltd."
                    required
                  />
                </Field>
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
                {mode === 'register' && (
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
                    : mode === 'register'
                      ? 'Create account & sign in'
                      : 'Sign in to dashboard'}
                  {!loading && <ArrowRight size={16} />}
                </button>
              </form>

              <p className="mt-6 rounded-xl border border-white/5 bg-slate-950/40 px-4 py-3 text-center text-xs leading-relaxed text-slate-500">
                Demo workspace: <span className="font-mono text-slate-400">Acme Corp Pvt. Ltd.</span> ·{' '}
                <span className="font-mono text-slate-400">admin@demo.com</span> ·{' '}
                <span className="font-mono text-slate-400">demo1234</span>
              </p>
            </div>

            <p className="mt-6 hidden items-center justify-center gap-1.5 text-center text-xs text-slate-500 lg:flex">
              <Globe size={12} className="text-orange-400" />
              AI-powered phishing defense, built for Nepal.
            </p>
          </div>
        </div>
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
