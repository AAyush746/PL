// Instanced droplet particles. Two behaviours:
//  - splash burst: a ball of glossy droplets shot upward/outward at the hook
//    impact point, falling back on gravity, bouncing off the water surface
//  - drips: continuous vertical droplets raining off the wet catch while it
//    ascends, each creating a micro-impulse (secondary ripple) on landing
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { POND, WATER_Y, TIP, MENISCUS_OFFSET } from './constants';

const POOL = 340;
const G = 15.5;
const MAX_LIFE = 2.2;
const BOUNCE_RESTORE = 0.28;
const BURST_COUNT = 160;
const DRIP_COUNT = 9;

function makePool() {
  const pos = new Float32Array(POOL * 3);
  const vel = new Float32Array(POOL * 3);
  const life = new Float32Array(POOL);
  const bounces = new Uint8Array(POOL);
  const active = new Uint8Array(POOL);
  return { pos, vel, life, bounces, active, next: 0 };
}

export default function Droplets({ dir, droppedImpacts, waterApi }) {
  const meshRef = useRef(null);
  const pool = useMemo(makePool, []);

  useFrame((_state, delta) => {
    const d = delta > 0 ? Math.min(delta, 0.033) : 0.016;
    const p = pool;

    // splash burst on impact
    if (dir.burst) {
      for (let i = 0; i < BURST_COUNT; i++) {
        const k = (p.next = (p.next + 1) % POOL);
        const a = Math.random() * Math.PI * 2;
        const r = 0.1 + Math.random() * 0.5;
        const up = 1.1 + Math.random() * 2.4;
        p.pos[k * 3] = (Math.random() - 0.5) * 0.15;
        p.pos[k * 3 + 1] = WATER_Y + 0.01;
        p.pos[k * 3 + 2] = (Math.random() - 0.5) * 0.15;
        p.vel[k * 3] = Math.cos(a) * r * 2.1;
        p.vel[k * 3 + 1] = up;
        p.vel[k * 3 + 2] = Math.sin(a) * r * 2.1;
        p.life[k] = 0;
        p.bounces[k] = 0;
        p.active[k] = 1;
      }
      dir.burst = false;
    }

    // continuous drips off the rising catch
    const bottom = dir.hookY - TIP + MENISCUS_OFFSET;
    const emitting = bottom > WATER_Y + 0.015 && (dir.phase === 'reel' || dir.phase === 'exit');
    if (emitting) {
      for (let i = 0; i < DRIP_COUNT; i++) {
        const k = (p.next = (p.next + 1) % POOL);
        p.pos[k * 3] = (Math.random() - 0.5) * 0.66;
        p.pos[k * 3 + 1] = bottom + (Math.random() - 0.5) * 0.05;
        p.pos[k * 3 + 2] = (Math.random() - 0.5) * 0.66;
        p.vel[k * 3] = (Math.random() - 0.5) * 0.5;
        p.vel[k * 3 + 1] = -0.35 - Math.random() * 0.85;
        p.vel[k * 3 + 2] = (Math.random() - 0.5) * 0.5;
        p.life[k] = 0;
        p.bounces[k] = 0;
        p.active[k] = 1;
      }
    }

    // integrate — no visible walls; droplets fade in open water
    const surf = waterApi.surfaceAt ? waterApi.surfaceAt : () => WATER_Y;
    for (let k = 0; k < POOL; k++) {
      if (!p.active[k]) continue;
      p.life[k] += d;
      if (p.life[k] > MAX_LIFE) {
        p.active[k] = 0;
        continue;
      }
      p.vel[k * 3 + 1] -= G * d;
      p.pos[k * 3] += p.vel[k * 3] * d;
      p.pos[k * 3 + 1] += p.vel[k * 3 + 1] * d;
      p.pos[k * 3 + 2] += p.vel[k * 3 + 2] * d;

      const x = p.pos[k * 3];
      const z = p.pos[k * 3 + 2];
      const y = p.pos[k * 3 + 1];

      if (p.bounces[k] < 3) {
        const sy = surf(x, z);
        if (p.vel[k * 3 + 1] < 0 && y <= sy) {
          p.pos[k * 3 + 1] = sy;
          p.vel[k * 3 + 1] *= -BOUNCE_RESTORE;
          p.vel[k * 3] *= 0.55;
          p.vel[k * 3 + 2] *= 0.55;
          p.bounces[k]++;
          // secondary ripple
          droppedImpacts.push({ x, z, force: 0.9 });
        } else if (y < POND.botY - 0.2) {
          p.active[k] = 0;
        }
      }
      if (p.bounces[k] >= 3) p.active[k] = 0;
    }

    // write matrices (scale = life fade)
    const mesh = meshRef.current;
    if (!mesh) return;
    const m = mesh.instanceMatrix;
    let written = 0;
    for (let k = 0; k < POOL; k++) {
      if (!p.active[k]) continue;
      const fade = 1 - p.life[k] / MAX_LIFE;
      const scale = 0.5 + 0.5 * fade;
      const f = p.bounces[k] ? scale * 0.72 : scale;
      const i = written++;
      const o = i * 16;
      const px = p.pos[k * 3];
      const py = p.pos[k * 3 + 1];
      const pz = p.pos[k * 3 + 2];
      m.array[o] = f;
      m.array[o + 1] = 0;
      m.array[o + 2] = 0;
      m.array[o + 3] = 0;
      m.array[o + 4] = 0;
      m.array[o + 5] = f;
      m.array[o + 6] = 0;
      m.array[o + 7] = 0;
      m.array[o + 8] = 0;
      m.array[o + 9] = 0;
      m.array[o + 10] = f;
      m.array[o + 11] = 0;
      m.array[o + 12] = px;
      m.array[o + 13] = py;
      m.array[o + 14] = pz;
      m.array[o + 15] = 1;
    }
    mesh.count = written;
    m.needsUpdate = true;
    mesh.visible = written > 0;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, POOL]} frustumCulled={false}>
      <sphereGeometry args={[0.016, 6, 6]} />
      <meshStandardMaterial
        color="#e4f7ff"
        roughness={0.22}
        metalness={0.1}
        emissive="#7dd3fc"
        emissiveIntensity={0.35}
        transparent
        opacity={0.95}
      />
    </instancedMesh>
  );
}