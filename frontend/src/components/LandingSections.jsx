import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Crosshair,
  GraduationCap,
  LineChart,
  Mail,
  MailCheck,
  Radar,
  ShieldCheck,
  MapPin,
  Phone,
  Send,
  CheckCircle2,
  Infinity as InfinityIcon,
} from 'lucide-react';
import Logo from './Logo';
import { prefersReducedMotion } from '../lib/motion';

// the 3D tank scene is code-split so the landing page loads fast
const HookScene3D = lazy(() => import('./hook3d/index.jsx'));

function HookScene() {
  const [reduced] = useState(() => prefersReducedMotion());
  return (
    <Suspense
      fallback={
        <div className="relative mx-auto h-[420px] w-full overflow-visible sm:h-[500px]" aria-hidden="true" />
      }
    >
      <HookScene3D reduced={reduced} />
    </Suspense>
  );
}

const FEATURES = [
  {
    icon: Crosshair,
    title: 'Realistic simulations',
    body: 'Craft believable phishing campaigns with templates that mirror the real attacks your team faces every day.',
  },
  {
    icon: Radar,
    title: 'Live human-risk radar',
    body: 'A live risk posture across every employee and department, updated with every open, click, and report.',
  },
  {
    icon: GraduationCap,
    title: 'Instant micro-learning',
    body: 'The moment someone takes the bait, a 90-second awareness module lands in their inbox — while the lesson is fresh.',
  },
  {
    icon: LineChart,
    title: 'Measurable progress',
    body: 'Watch click rates fall and reporting rates climb with trend charts, funnels, and department breakdowns.',
  },
];

const STATS = [
  { value: '68%', label: 'fewer clicks after 6 months' },
  { value: '4×', label: 'faster training adoption' },
  { value: '24/7', label: 'automated coverage' },
  { value: '0', label: 'data leaves your org' },
];

export default function LandingSections({ onStartTrial }) {
  const [sent, setSent] = useState(false);

  return (
    <>
      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-[#0a0a0a] text-white">
        <div className="pointer-events-none absolute -left-40 top-10 h-[30rem] w-[30rem] rounded-full bg-orange-600/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-40 bottom-0 h-[28rem] w-[28rem] rounded-full bg-amber-500/10 blur-3xl" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(249,115,22,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(249,115,22,0.6) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }}
        />

        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:py-20">
          <div className="anim-fade-up">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-orange-400/30 bg-orange-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-orange-300">
              <ShieldCheck size={13} />
              Human risk platform
            </p>
            <h1 className="font-display text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
              Reel in risky
              <br />
              behavior <span className="gradient-text">before attackers do.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">
              Phishloop runs realistic phishing simulations, catches the employees who take the
              bait, and retrains them instantly — so your real defenses stay one cast ahead.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button onClick={onStartTrial} className="btn-primary px-6 py-3 text-base">
                Start free trial <ArrowRight size={18} />
              </button>
              <a
                href="#training"
                className="btn-ghost border-white/15 bg-white/5 px-6 py-3 text-base text-slate-200 hover:border-white/25 hover:bg-white/10"
              >
                See how it works
              </a>
            </div>
            <p className="mt-6 flex items-center gap-2 text-sm text-slate-400">
              <CheckCircle2 size={15} className="text-orange-400" />
              No credit card · set up in under 5 minutes
            </p>
          </div>

          <div className="anim-fade-up-1">
            <HookScene />
          </div>
        </div>

        {/* ── stats strip ──────────────────────────────────────────── */}
        <div className="relative border-t border-white/10">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-5 py-8 sm:px-8 lg:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label}>
                <p className="font-display text-3xl font-bold text-orange-400">{s.value}</p>
                <p className="mt-1 text-sm text-slate-400">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Training ───────────────────────────────────────────────── */}
      <section id="training" className="scroll-mt-24 py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="mb-12 max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-600">Training</p>
            <h2 className="mt-2 font-display text-3xl font-bold text-slate-900 sm:text-4xl">
              Training that hooks attention,
              <br className="hidden sm:block" /> not just clicks.
            </h2>
            <p className="mt-3 text-base text-slate-600">
              Everything you need to turn your people from the biggest attack surface into your
              strongest layer of defense.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="glass-card p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 shadow-lg shadow-orange-500/25">
                  <Icon className="text-white" size={24} />
                </div>
                <h3 className="font-display text-lg font-semibold text-slate-900">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── About ──────────────────────────────────────────────────── */}
      <section id="about" className="scroll-mt-24 bg-[#efe6d3] py-20">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-600">About</p>
            <h2 className="mt-2 font-display text-3xl font-bold text-slate-900 sm:text-4xl">
              Built to outthink the hook.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-slate-700">
              Phishloop started with a simple observation: firewalls stop malware, but they can't
              stop the moment someone trusts a fake email. We build simulations that feel real, so
              the lesson sticks — and reporting becomes a reflex, not a chore.
            </p>
            <p className="mt-3 text-base leading-relaxed text-slate-700">
              Every campaign, every click, and every completed micro-lesson feeds a live risk
              score for your organization, your departments, and each person in them.
            </p>
            <div className="mt-6 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 shadow-lg shadow-orange-500/25">
                <InfinityIcon className="text-white" size={26} />
              </div>
              <p className="text-sm text-slate-600">
                Continuous defense — <span className="font-semibold text-slate-800">no phish is ever the last one.</span>
              </p>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            {[
              { icon: MailCheck, title: 'Report, don\u2019t react', body: 'One-click reporting turns every simulated phish into a teaching moment.' },
              { icon: Radar, title: 'Always-on radar', body: 'Risk posture updates in real time, from a single campaign to the whole org.' },
              { icon: GraduationCap, title: 'Learn in 90 seconds', body: 'Short, targeted lessons delivered the moment someone clicks the bait.' },
              { icon: ShieldCheck, title: 'Privacy first', body: 'Your data stays yours. No employee data ever leaves your organization.' },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="glass-card p-6">
                <Icon className="mb-3 text-orange-600" size={26} />
                <h3 className="font-display font-semibold text-slate-900">{title}</h3>
                <p className="mt-1.5 text-sm text-slate-600">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Contact ────────────────────────────────────────────────── */}
      <section id="contact" className="scroll-mt-24 py-20">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-600">Contact</p>
            <h2 className="mt-2 font-display text-3xl font-bold text-slate-900 sm:text-4xl">
              Let's talk human risk.
            </h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-slate-600">
              Questions about a pilot, a demo, or pricing? Drop us a line — we usually reply within
              one business day.
            </p>
            <div className="mt-8 space-y-4">
              {[
                { icon: Mail, text: 'hello@phishloop.com' },
                { icon: Phone, text: '+977 1 555 0142' },
                { icon: MapPin, text: 'Kathmandu · also remote everywhere' },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-3 text-sm text-slate-700">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-orange-500/25 bg-orange-500/10">
                    <Icon className="text-orange-600" size={18} />
                  </span>
                  {text}
                </div>
              ))}
            </div>
          </div>

          <div className="glass-panel p-8">
            {sent ? (
              <div className="flex h-full flex-col items-center justify-center py-12 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 shadow-lg shadow-orange-500/25">
                  <MailCheck className="text-white" size={30} />
                </div>
                <h3 className="font-display text-xl font-bold text-slate-900">Message sent!</h3>
                <p className="mt-2 max-w-sm text-sm text-slate-600">
                  Thanks for reaching out — the Phishloop team will be in touch shortly.
                </p>
              </div>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  setSent(true);
                }}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">Name</span>
                    <input className="input" required placeholder="Ada Lovelace" />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">Work email</span>
                    <input className="input" type="email" required placeholder="ada@company.com" />
                  </label>
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">Organization</span>
                  <input className="input" placeholder="Acme Corp Pvt. Ltd." />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">Message</span>
                  <textarea className="input min-h-28 resize-y" required placeholder="Tell us about your security awareness program…" />
                </label>
                <button type="submit" className="btn-primary w-full py-3">
                  Send message <Send size={16} />
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className="border-t border-white/10 bg-[#0a0a0a] text-slate-400">
        <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
          <div className="grid gap-10 md:grid-cols-4">
            <div className="md:col-span-2">
              <div className="flex items-center gap-3">
                <Logo size="sm" />
                <span className="font-display text-lg font-bold text-white">Phishloop</span>
              </div>
              <p className="mt-4 max-w-sm text-sm leading-relaxed">
                Simulated phishing, instant micro-learning, and live human-risk analytics —
                continuous defense against the attacks that always find a way in.
              </p>
            </div>
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-orange-400">Explore</p>
              <ul className="space-y-2 text-sm">
                <li><a href="#top" className="hover:text-orange-300">Home</a></li>
                <li><a href="#training" className="hover:text-orange-300">Training</a></li>
                <li><a href="#about" className="hover:text-orange-300">About</a></li>
                <li><a href="#contact" className="hover:text-orange-300">Contact</a></li>
              </ul>
            </div>
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-orange-400">Get started</p>
              <ul className="space-y-2 text-sm">
                <li><Link to="/login" className="hover:text-orange-300">Sign in</Link></li>
                <li><Link to="/login" className="hover:text-orange-300">Create account</Link></li>
                <li><Link to="/admin/login" className="hover:text-orange-300">Admin</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs sm:flex-row">
            <p>© 2026 Phishloop. All rights reserved.</p>
            <p className="flex items-center gap-1.5">
              <InfinityIcon size={13} className="text-orange-400" />
              Built to outthink the hook.
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
