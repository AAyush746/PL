// Shared mutable "director" state for the 3D hook scene. The choreography
// loop writes hook position/velocity/phase every frame; the water, droplets,
// and floater systems read from it. No react state — just a plain object.

export function createDirector() {
  return {
    hookY: HOOK_ENTRY_Y,
    velY: 0,
    phase: 'wait', // wait | enter | pause | dive | catch | reel | exit
    resetTick: 0,
    t: 0,
    reduced: false,
    opacity: 0,
    under: false,
    burst: false,
    impact: null,
    wake: null,
    menu: 0,
    splashCrown: false,
  };
}

/* world units: 1 unit ≈ 100 px */
export const POND = {
  w: 8.5,
  d: 6.5,
  botY: -1.5,
};

export const WATER_Y = 0;
export const SUBMERGE_DEPTH = 0.32;
export const SUBMERGE_BASE = WATER_Y - SUBMERGE_DEPTH;

export const HOOK_ENTRY_Y = 6.6;
export const HOOK_EXIT_Y = 7.0;
export const HOOK_PAUSE_Y = 1.65;
export const HOOK_TOP = HOOK_PAUSE_Y;
export const TIP = 0.86;
export const MAX_DEPTH = -0.72;
export const MENISCUS_OFFSET = 0.55;

export const CHOREO = {
  g: 5.2,
  airTerm: 2.4,
  waterTerm: 0.48,
  waterDrag: 4.0,
  waterEntryDamp: 0.24,
  waterBuoyancy: 2.2,
  riseTerm: 0.88,
  riseDrag: 2.2,
  airRiseAccel: 5.0,
  airRiseTerm: 3.2,
  wait: 2.2,
  pause: 0.65,
  catchHold: 0.85,
};

export function submergedY(index, initial) {
  const wave = (index % 5) * 0.038 + (Math.abs(initial.x * 0.7 + initial.z * 0.5) % 1) * 0.05;
  return SUBMERGE_BASE - wave;
}

export const ATTACH = [
  { dx: -0.62, dy: 0.08 },
  { dx: -0.34, dy: -0.1 },
  { dx: -0.08, dy: 0.16 },
  { dx: 0.16, dy: -0.08 },
  { dx: 0.42, dy: 0.12 },
  { dx: 0.64, dy: -0.02 },
  { dx: 0.04, dy: -0.3 },
  { dx: 0.28, dy: 0.28 },
];

export const FLOATERS = [
  { icon: 'mail', label: 'phish', x: -1.25, z: -0.55 },
  { icon: 'mouse', label: 'click', x: -0.7, z: 0.75 },
  { icon: 'key', label: 'credentials', x: -0.15, z: -0.8 },
  { icon: 'scan', label: 'identity', x: 0.4, z: 0.6 },
  { icon: 'eye', label: 'spyware', x: 0.95, z: -0.5 },
  { icon: 'userx', label: 'scam', x: 1.5, z: 0.35 },
  { icon: 'fingerprint', label: 'MFA', x: -0.5, z: 0.15 },
  { icon: 'globe', label: 'recon', x: 0.9, z: 0.95 },
];

export const CARD = { w: 0.46, h: 0.58 };
