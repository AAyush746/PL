import { useEffect, useRef, useState } from 'react';
import {
  Mail,
  MousePointerClick,
  KeyRound,
  ScanFace,
  Eye,
  UserX,
  Fingerprint,
  Globe,
} from 'lucide-react';

const WATER_TOP = 0.52;

const FLOATERS = [
  { Icon: Mail, label: 'phish', left: 84, top: 58 },
  { Icon: MousePointerClick, label: 'click', left: 70, top: 76 },
  { Icon: KeyRound, label: 'credentials', left: 50, top: 82 },
  { Icon: ScanFace, label: 'identity', left: 30, top: 76 },
  { Icon: Eye, label: 'spyware', left: 16, top: 58 },
  { Icon: UserX, label: 'scam', left: 24, top: 68 },
  { Icon: Fingerprint, label: 'MFA', left: 76, top: 68 },
  { Icon: Globe, label: 'recon', left: 50, top: 62 },
];

const ATTACH = [
  { dx: -62, dy: 8 },
  { dx: -34, dy: -10 },
  { dx: -8, dy: 16 },
  { dx: 16, dy: -8 },
  { dx: 42, dy: 12 },
  { dx: 64, dy: -2 },
  { dx: 4, dy: -30 },
  { dx: 28, dy: 28 },
];

const SPLASH = [
  { dx: -64, dy: -40 },
  { dx: -42, dy: -56 },
  { dx: -18, dy: -70 },
  { dx: 2, dy: -52 },
  { dx: 26, dy: -72 },
  { dx: 50, dy: -54 },
  { dx: 72, dy: -38 },
];
const SPLASH_OUT = [
  { dx: -24, dy: -26 },
  { dx: 6, dy: -18 },
  { dx: 30, dy: -24 },
];
const RIPPLE_IN_DELAYS = [0, 0.12, 0.24];
const RIPPLE_OUT_DELAYS = [0, 0.12];

const CHAIN = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='42' viewBox='0 0 24 42'><defs><linearGradient id='m' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='%23fde68a'/><stop offset='0.35' stop-color='%23f97316'/><stop offset='0.8' stop-color='%239a3412'/><stop offset='1' stop-color='%23431407'/></linearGradient></defs><rect x='3' y='1' width='14' height='22' rx='7' fill='url(%23m)'/><rect x='6.5' y='4.5' width='7' height='15' rx='3.5' fill='%230a0a0c'/><rect x='10' y='21' width='14' height='22' rx='7' fill='url(%23m)'/><rect x='13.5' y='24.5' width='7' height='15' rx='3.5' fill='%230a0a0c'/></svg>")`;
const BUBBLES = [
  { left: 18, delay: 0, dur: 6 },
  { left: 42, delay: 2.5, dur: 7.5 },
  { left: 70, delay: 5, dur: 6.5 },
  { left: 88, delay: 1.4, dur: 8 },
];

/* ── physics (px, px/s, px/s²) ──────────────────────────────────────────── */
const TIP = 86; // hook svg top → the catch point at the barb
// Quadratic drag (drag ∝ v²): free-fall in air, then a sharp jolt on entry
// and a slow, drag-limited creep down to the middle of the water.
const G = 2600; // gravity
const AIR_TERMINAL = 1500; // max free-fall speed
const WATER_TERMINAL = 100; // slow terminal sink speed in water
const WATER_DRAG = G / (WATER_TERMINAL * WATER_TERMINAL); // c in a = g - c·v²
const WINCH = 500; // winch accel when reeling
const WATER_RISE_TERMINAL = 130; // slow terminal rise speed in water
const WATER_RISE_DRAG = WINCH / (WATER_RISE_TERMINAL * WATER_RISE_TERMINAL); // c in a = -W - c·v²
const AIR_RISE_ACCEL = 2600; // quick accel back up through the air
const AIR_RISE_TERMINAL = 1600;
const DEPTH_RATIO = 0.6; // how far below the surface the tip sinks (0.6 = mid-water)
const AIR_IDLE = 0.7; // pause at the surface before diving
const CATCH_HOLD = 0.55; // hold at depth while every element latches on
const FLYOFF_HOLD = 0.6; // hold at top while the haul flies off

function Ripple({ anim, delay, dur, stroke }) {
  return (
    <svg
      width="170"
      height="86"
      viewBox="-85 -43 170 86"
      className="absolute overflow-visible"
      style={{
        left: '50%',
        top: `${WATER_TOP * 100}%`,
        translate: '-50% -50%',
        animation: `${anim} ${dur}s ease-out ${delay}s both`,
        filter: 'drop-shadow(0 0 6px rgba(103,232,249,0.6))',
      }}
    >
      <ellipse cx="0" cy="0" rx="72" ry="34" fill="rgba(103,232,249,0.08)" />
      <ellipse cx="0" cy="0" rx="72" ry="34" fill="none" stroke={stroke} strokeWidth="2.5" />
    </svg>
  );
}

export default function HookScene() {
  const boxRef = useRef(null);
  const chainRef = useRef(null);
  const hookRef = useRef(null);
  const floaterRefs = useRef([]);
  const [fx, setFx] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const m = { h: 420, w: 560, waterY: 420 * WATER_TOP, maxDepth: 0 };
    const s = { y: 0, v: 0, phase: 'top', t: 0, under: false };
    let raf = 0;
    let last = performance.now();
    let fxTimer = 0;

    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      m.h = r.height || 420;
      m.w = r.width || 560;
      m.waterY = m.h * WATER_TOP;
      m.maxDepth = m.waterY + (m.h - m.waterY) * DEPTH_RATIO;
    });
    if (boxRef.current) ro.observe(boxRef.current);

    const fireFx = (kind) => {
      setFx({ kind, id: Date.now() });
      clearTimeout(fxTimer);
      fxTimer = setTimeout(() => setFx(null), 1400);
    };

    const snapFloaters = () => {
      floaterRefs.current.forEach((el, i) => {
        if (!el) return;
        el.classList.add('is-caught');
        el.style.transition =
          'left 0.32s cubic-bezier(0.34, 1.4, 0.5, 1), top 0.32s cubic-bezier(0.34, 1.4, 0.5, 1), transform 0.32s ease-out, opacity 0.32s ease-out';
        el.style.left = `${m.w / 2 + ATTACH[i].dx}px`;
        el.style.top = `${s.y + TIP + ATTACH[i].dy}px`;
        el.style.opacity = '1';
        el.style.transform = 'translate(-50%, -50%) scale(0.34)';
      });
      setTimeout(() => {
        floaterRefs.current.forEach((el) => {
          if (el) el.style.transition = 'none';
        });
      }, 340);
    };

    const flyFloaters = () => {
      floaterRefs.current.forEach((el) => {
        if (!el) return;
        el.classList.remove('is-caught');
        el.classList.add('is-away');
        el.style.transition =
          'left 0.45s ease-in, top 0.45s ease-in, transform 0.45s ease-in, opacity 0.45s ease-in';
        el.style.left = '50%';
        el.style.top = '-150px';
        el.style.opacity = '0';
        el.style.transform = 'translate(-50%, -50%) scale(0.15)';
      });
    };

    const resetFloaters = () => {
      floaterRefs.current.forEach((el, i) => {
        if (!el) return;
        el.classList.remove('is-away');
        el.style.transition = 'none';
        el.style.left = `${FLOATERS[i].left}%`;
        el.style.top = `${FLOATERS[i].top}%`;
        el.style.opacity = '1';
        el.style.transform = 'translate(-50%, -50%) scale(1)';
      });
    };

    const applyDOM = () => {
      if (chainRef.current) chainRef.current.style.height = `${s.y}px`;
      if (hookRef.current) hookRef.current.style.transform = `translate(-50%, ${s.y}px)`;
      if (s.phase === 'reel' || s.phase === 'catch') {
        const tipY = s.y + TIP;
        floaterRefs.current.forEach((el, i) => {
          if (!el) return;
          el.style.left = `${m.w / 2 + ATTACH[i].dx}px`;
          el.style.top = `${tipY + ATTACH[i].dy}px`;
        });
      }
    };

    const step = (now) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const tip = s.y + TIP;
      const under = tip >= m.waterY;

      if (under && !s.under) fireFx('in');
      else if (!under && s.under) fireFx('out');
      s.under = under;

      switch (s.phase) {
        case 'top':
          s.t += dt;
          if (s.t >= AIR_IDLE) {
            s.phase = 'dive';
            s.t = 0;
            s.v = 0;
          }
          break;

        case 'dive':
          if (tip < m.waterY) {
            // free-fall in air: constant gravity, terminal velocity cap
            s.v = Math.min(AIR_TERMINAL, s.v + G * dt);
          } else {
            // water drag (∝ v²): velocity slams toward a slow sink speed.
            // clamping keeps the stiff equation stable frame-to-frame.
            s.v += (G - WATER_DRAG * s.v * Math.abs(s.v)) * dt;
            s.v = Math.max(WATER_TERMINAL, s.v);
          }
          s.y += s.v * dt;
          if (tip >= m.maxDepth) {
            s.y = m.maxDepth - TIP;
            s.v = 0;
            s.phase = 'catch';
            s.t = 0;
            snapFloaters();
          }
          break;

        case 'catch':
          s.t += dt;
          if (s.t >= CATCH_HOLD) {
            s.phase = 'reel';
            s.t = 0;
          }
          break;

        case 'reel':
          if (tip >= m.waterY) {
            // slow, drag-limited rise through the water
            s.v += (-WINCH - WATER_RISE_DRAG * s.v * Math.abs(s.v)) * dt;
            if (s.v < -WATER_RISE_TERMINAL) s.v = -WATER_RISE_TERMINAL;
          } else {
            // quick acceleration back up through the air
            s.v = Math.max(-AIR_RISE_TERMINAL, s.v - AIR_RISE_ACCEL * dt);
          }
          s.y += s.v * dt;
          if (s.y <= 0) {
            s.y = 0;
            s.v = 0;
            s.phase = 'flyoff';
            s.t = 0;
            flyFloaters();
          }
          break;

        case 'flyoff':
          s.t += dt;
          if (s.t >= FLYOFF_HOLD) {
            resetFloaters();
            s.phase = 'top';
            s.t = 0;
          }
          break;
      }

      applyDOM();
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(fxTimer);
      ro.disconnect();
    };
  }, []);

  return (
    <div ref={boxRef} className="relative mx-auto h-[420px] w-full max-w-[560px] sm:h-[500px]">
      {/* ── pond water ──────────────────────────────────────────────── */}
      <div className="absolute inset-x-0 bottom-0" style={{ top: `${WATER_TOP * 100}%` }}>
        <div className="h-full w-full bg-gradient-to-b from-cyan-400/15 via-cyan-500/5 to-transparent" />
        <div
          className="absolute inset-x-4 top-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent shadow-[0_0_14px_rgba(103,232,249,0.55)]"
          style={{ animation: 'surfaceShimmer 4s ease-in-out infinite' }}
        />
      </div>

      {/* rising bubbles (ambience) */}
      {BUBBLES.map((b, i) => (
        <div
          key={i}
          className="absolute h-1.5 w-1.5 rounded-full bg-cyan-200/40"
          style={{
            left: `${b.left}%`,
            bottom: '6%',
            animation: `bubbleRise ${b.dur}s ease-in ${b.delay}s infinite`,
          }}
        />
      ))}

      {/* ── sonar rings ────────────────────────────────────────────── */}
      {[0, 1.4, 2.8].map((delay) => (
        <div
          key={delay}
          className="absolute left-1/2 top-1/2 h-[70%] w-[72%] rounded-full border border-cyan-300/20"
          style={{ translate: '-50% -50%', animation: `radarRing 4s ease-out ${delay}s infinite` }}
        />
      ))}

      {/* ── floating risk elements (underwater) ────────────────────── */}
      {FLOATERS.map(({ Icon, label, left, top }, i) => (
        <div
          key={label}
          ref={(el) => {
            floaterRefs.current[i] = el;
          }}
          className="hook-floater absolute"
          style={{
            left: `${left}%`,
            top: `${top}%`,
            '--dur': `${6 + i * 0.5}s`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div className="drift flex flex-col items-center gap-1.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/25 bg-[#0e1a20]/85 shadow-lg shadow-cyan-500/10 backdrop-blur-md">
              <Icon className="text-cyan-300" size={22} />
            </div>
            <span className="rounded-full border border-cyan-200/15 bg-[#0a1216]/80 px-2 py-0.5 text-[10px] font-medium text-cyan-100/80 backdrop-blur-sm">
              {label}
            </span>
          </div>
        </div>
      ))}

      {/* ── water tint above the elements ──────────────────────────── */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0" style={{ top: `${WATER_TOP * 100}%` }}>
        <div className="h-full w-full bg-gradient-to-b from-cyan-500/10 to-cyan-900/15" />
      </div>

      {/* ── entry / exit ripples + splash (physics-triggered) ──────── */}
      {fx && (
        <div key={fx.id} className="pointer-events-none absolute inset-0">
          {fx.kind === 'in' ? (
            <>
              {RIPPLE_IN_DELAYS.map((delay) => (
                <Ripple key={`in-${delay}`} anim="ripple3dIn" delay={delay} dur={1.1} stroke="rgba(165,243,252,0.85)" />
              ))}
              {SPLASH.map((d, i) => (
                <div
                  key={`in-drop-${i}`}
                  className="absolute h-2 w-2 rounded-full bg-cyan-100 shadow-[0_0_8px_rgba(165,243,252,0.9)]"
                  style={{
                    left: '50%',
                    top: `${WATER_TOP * 100}%`,
                    '--dx': `${d.dx}px`,
                    '--dy': `${d.dy}px`,
                    translate: '-50% -50%',
                    animation: `splashIn 1.1s ease-out ${i * 0.07}s both`,
                  }}
                />
              ))}
            </>
          ) : (
            <>
              {RIPPLE_OUT_DELAYS.map((delay) => (
                <Ripple key={`out-${delay}`} anim="ripple3dOut" delay={delay} dur={0.95} stroke="rgba(165,243,252,0.55)" />
              ))}
              {SPLASH_OUT.map((d, i) => (
                <div
                  key={`out-drop-${i}`}
                  className="absolute h-1.5 w-1.5 rounded-full bg-cyan-200/80"
                  style={{
                    left: '50%',
                    top: `${WATER_TOP * 100}%`,
                    '--dx': `${d.dx}px`,
                    '--dy': `${d.dy}px`,
                    translate: '-50% -50%',
                    animation: `splashOut 0.95s ease-out ${i * 0.05}s both`,
                  }}
                />
              ))}
            </>
          )}
        </div>
      )}

      {/* ── the hook chain ─────────────────────────────────────────── */}
      <div
        ref={chainRef}
        className="absolute left-1/2 top-0 w-6"
        style={{
          translate: 'calc(-50% - 14px) 0',
          height: '0px',
          backgroundImage: CHAIN,
          backgroundRepeat: 'repeat-y',
          backgroundSize: '24px 42px',
          backgroundPosition: 'center top',
          filter: 'drop-shadow(0 2px 8px rgba(249,115,22,0.45))',
        }}
      />

      {/* ── the hook ───────────────────────────────────────────────── */}
      <div ref={hookRef} className="absolute left-1/2 top-0" style={{ transform: 'translate(-50%, 0px)' }}>
        <svg
          width="52"
          height="128"
          viewBox="0 0 52 128"
          fill="none"
          style={{
            filter: 'drop-shadow(0 6px 18px rgba(103,232,249,0.35))',
            animation: 'hookWobble 2s ease-in-out infinite',
          }}
        >
          <circle cx="12" cy="14" r="6.5" stroke="#f8fafc" strokeWidth="5" />
          <line x1="12" y1="20.5" x2="12" y2="66" stroke="#f8fafc" strokeWidth="5" strokeLinecap="round" />
          <path
            d="M12 66 C 12 96, 22 98, 30 98 C 38 98, 44 92, 44 84"
            stroke="#fb923c"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <path d="M44 78 L39 84 L49 84 Z" fill="#f97316" />
          <circle cx="47" cy="88" r="3.5" fill="#fbbf24" />
        </svg>
      </div>
    </div>
  );
}
