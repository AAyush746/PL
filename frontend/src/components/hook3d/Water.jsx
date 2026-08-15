// Dynamic water: a CPU spring-physics heightfield (2D grid of damped springs
// with neighbour coupling = 1D wave propagation, so an impact impulse spreads
// outward, reflects off the pond edges and damps out) drives the vertex
// positions of a high-detail plane. The surface is lit by a custom GLSL
// shader (fresnel env reflections, glossy sun specular, foam on crests,
// subtle animated shimmer) and the pond floor gets animated caustics that
// react to how agitated the water is.
import * as THREE from 'three';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { POND, WATER_Y, TIP, MENISCUS_OFFSET } from './constants';

const NX = 92; // grid resolution (cells)
const NZ = 66;
const K = 55; // spring constant 1/s²
const COUPLING = 205; // neighbour coupling 1/s²
const DAMP = 6.5; // viscosity 1/s
const IMPACT_RADIUS = 1.15;
const WAKE_RADIUS = 0.55;
const MENISCUS_RADIUS = 0.42;
const RING_LIFE = 1.7;
const RING_LIFE_OUT = 1.4;

// ── heightfield simulation ────────────────────────────────────────────────
function createHeightfield() {
  const nx = NX + 1;
  const nz = NZ + 1;
  const pts = new Float32Array(nx * nz);
  const vel = new Float32Array(nx * nz);
  const li = new Int32Array(nx * nz);
  const ri = new Int32Array(nx * nz);
  const ui = new Int32Array(nx * nz);
  const di = new Int32Array(nx * nz);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const k = i * nz + j;
      li[k] = Math.max(i - 1, 0) * nz + j;
      ri[k] = Math.min(i + 1, nx - 1) * nz + j;
      ui[k] = i * nz + Math.max(j - 1, 0);
      di[k] = i * nz + Math.min(j + 1, nz - 1);
    }
  }
  return { nx, nz, pts, vel, li, ri, ui, di };
}

function stepHeightfield(f, dt, t, dir, droppedImpacts) {
  const { pts, vel, li, ri, ui, di, nx, nz } = f;
  const n = nx * nz;
  const swell = 0.008 * Math.sin(t * 0.8);

  for (let k = 0; k < n; k++) {
    const p = pts[k];
    const neigh = (pts[li[k]] + pts[ri[k]] + pts[ui[k]] + pts[di[k]]) * 0.25;
    const amb = swell + 0.012 * Math.sin(t * 0.9 + k * 0.013);
    let a = -K * (p - amb) + COUPLING * (neigh - p) - DAMP * vel[k];
    if (k < nx || k >= n - nx || k % nz === 0 || (k + 1) % nz === 0) a *= 0.94;
    vel[k] += a * dt;
    pts[k] += vel[k] * dt;
  }

  if (!dir) return;

  // impact splash impulse (once per crossing)
  if (dir.impact) {
    const { force } = dir.impact;
    const cx = NX / 2;
    const cz = NZ / 2;
    const rIdx = Math.ceil(IMPACT_RADIUS / (POND.w / NX));
    for (let i = Math.max(0, cx - rIdx); i <= Math.min(nx - 1, cx + rIdx); i++) {
      const dxp = (i - cx) * (POND.w / NX);
      for (let j = Math.max(0, cz - rIdx); j <= Math.min(nz - 1, cz + rIdx); j++) {
        const dzp = (j - cz) * (POND.d / NZ);
        const dist = Math.hypot(dxp, dzp);
        if (dist < IMPACT_RADIUS) vel[i * nz + j] += force * (1 - dist / IMPACT_RADIUS);
      }
    }
    dir.impact = null;
  }

  // upward crown splash ring on hook entry
  if (dir.splashCrown) {
    const cx = NX / 2;
    const cz = NZ / 2;
    const rIdx = Math.ceil(1.4 / (POND.w / NX));
    for (let i = Math.max(0, cx - rIdx); i <= Math.min(nx - 1, cx + rIdx); i++) {
      const dxp = (i - cx) * (POND.w / NX);
      for (let j = Math.max(0, cz - rIdx); j <= Math.min(nz - 1, cz + rIdx); j++) {
        const dzp = (j - cz) * (POND.d / NZ);
        const dist = Math.hypot(dxp, dzp);
        if (dist < 1.4) {
          const k = i * nz + j;
          vel[k] += 2.2 * (1 - dist / 1.4);
          pts[k] += 0.04 * (1 - dist / 1.4);
        }
      }
    }
    dir.splashCrown = false;
  }

  // continuous wake while the hook moves underwater
  if (dir.wake) {
    const cx = NX / 2;
    const cz = NZ / 2;
    const rIdx = Math.ceil(WAKE_RADIUS / (POND.w / NX));
    const wf = dir.wake.force * dt * 18;
    for (let i = Math.max(0, cx - rIdx); i <= Math.min(nx - 1, cx + rIdx); i++) {
      const dxp = (i - cx) * (POND.w / NX);
      for (let j = Math.max(0, cz - rIdx); j <= Math.min(nz - 1, cz + rIdx); j++) {
        const dzp = (j - cz) * (POND.d / NZ);
        const dist = Math.hypot(dxp, dzp);
        if (dist < WAKE_RADIUS) vel[i * nz + j] += wf * (1 - dist / WAKE_RADIUS);
      }
    }
  }

  // surface-tension meniscus: water bends up around the catch while it's
  // about to break the surface (strength 0..1 computed by the director)
  if (dir.menu > 0.005) {
    const str = dir.menu * 1.9;
    const cx = NX / 2;
    const cz = NZ / 2;
    const rIdx = Math.ceil(MENISCUS_RADIUS / (POND.w / NX));
    for (let i = Math.max(0, cx - rIdx); i <= Math.min(nx - 1, cx + rIdx); i++) {
      const dxp = (i - cx) * (POND.w / NX);
      for (let j = Math.max(0, cz - rIdx); j <= Math.min(nz - 1, cz + rIdx); j++) {
        const dzp = (j - cz) * (POND.d / NZ);
        const dist = Math.hypot(dxp, dzp);
        if (dist < MENISCUS_RADIUS) {
          const fall = 1 - dist / MENISCUS_RADIUS;
          const k = i * nz + j;
          vel[k] -= str * fall * dt * 1.6;
          pts[k] -= str * fall * dt * 0.9;
        }
      }
    }
  }

  // micro-impulses from landing droplets (secondary ripples)
  if (droppedImpacts && droppedImpacts.length) {
    for (const imp of droppedImpacts) {
      const cx = ((imp.x + POND.w / 2) / POND.w) * NX;
      const cz = ((imp.z + POND.d / 2) / POND.d) * NZ;
      const i = Math.max(0, Math.min(nx - 1, Math.round(cx)));
      const j = Math.max(0, Math.min(nz - 1, Math.round(cz)));
      vel[i * nz + j] += -imp.force;
    }
    droppedImpacts.length = 0;
  }
}

function surfaceHeightAt(f, x, z) {
  const gx = (x + POND.w / 2) / POND.w;
  const gz = (z + POND.d / 2) / POND.d;
  const fx = Math.max(0, Math.min(1, gx)) * (f.nx - 1);
  const fz = Math.max(0, Math.min(1, gz)) * (f.nz - 1);
  const i0 = Math.floor(fx);
  const j0 = Math.floor(fz);
  const ti = Math.min(i0 + 1, f.nx - 1);
  const tj = Math.min(j0 + 1, f.nz - 1);
  const ix = fx - i0;
  const iz = fz - j0;
  const a = f.pts[i0 * f.nz + j0];
  const b = f.pts[ti * f.nz + j0];
  const c = f.pts[i0 * f.nz + tj];
  const d = f.pts[ti * f.nz + tj];
  return a + (b - a) * ix + (c - a) * iz + (a + d - b - c) * ix * iz;
}

function buildGeom() {
  const nx = NX + 1;
  const nz = NZ + 1;
  const positions = new Float32Array(nx * nz * 3);
  const indices = [];
  let k = 0;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++, k++) {
      positions[k * 3] = (i / NX) * POND.w - POND.w / 2;
      positions[k * 3 + 2] = (j / NZ) * POND.d - POND.d / 2;
    }
  }
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NZ; j++) {
      const a = i * nz + j;
      const b = a + nz;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geom.setIndex(indices);
  return geom;
}

const WATER_VERT = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const WATER_FRAG = /* glsl */ `
  uniform samplerCube uEnv;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uSkyTop;
  uniform vec3 uSkyBottom;
  uniform vec3 uSunDir;
  uniform float uRadius;
  uniform float uTime;
  uniform float uEnergy;

  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  // procedural sky used wherever the cubemap has nothing to reflect, so the
  // surface always reads as open water under a soft studio sky.
  vec3 skyColor(vec3 d) {
    float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 c = mix(uSkyBottom, uSkyTop, h);
    float glow = pow(max(dot(normalize(d), uSunDir), 0.0), 240.0);
    c += vec3(1.0, 0.96, 0.86) * glow * 1.6;
    return c;
  }

  void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(vViewDir);
    vec3 r = reflect(-v, n);

    float radial = length(vWorldPos.xz) / uRadius;
    float edgeFade = 1.0 - smoothstep(0.5, 1.0, radial);

    // reflection: the live cubemap (hook, floaters, lights) adds on top of the
    // procedural sky so empty areas still read as open water under a soft sky.
    vec3 cubeRefl = textureCube(uEnv, r).rgb;
    vec3 refl = skyColor(r) + cubeRefl * 0.75;

    // depth-graded body colour (deeper water = darker teal)
    float depth = clamp(0.5 - vWorldPos.y * 2.6, 0.0, 1.0);
    vec3 body = mix(uShallow, uDeep, depth);
    body = mix(body, vec3(0.03, 0.27, 0.34), clamp(-vWorldPos.y * 1.4, 0.0, 0.45));

    // Fresnel: glancing angles become near-mirror, looking straight down is clear
    float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 4.0);
    vec3 col = mix(body, refl, fres);

    // sharp sun glint (Blinn-Phong)
    vec3 hvec = normalize(uSunDir + v);
    float spec = pow(max(dot(n, hvec), 0.0), 240.0);
    col += vec3(1.0, 0.97, 0.9) * spec * 4.6;

    // foam riding the wave crests, stronger while the pond is agitated
    float crest = abs(vWorldPos.y);
    float foam = smoothstep(0.018, 0.105, crest) * (0.5 + uEnergy * 0.6);
    col = mix(col, vec3(0.96, 0.99, 1.0), foam * 0.8);

    // bright meniscus exactly at the waterline
    float waterline = 1.0 - smoothstep(0.0, 0.028, abs(vWorldPos.y));
    col += vec3(0.72, 0.95, 1.0) * waterline * 0.55;

    // soft animated caustics shimmering just under the surface
    float caust = sin(vWorldPos.x * 16.0 + uTime * 1.3) * sin(vWorldPos.z * 19.0 - uTime * 1.05);
    col += vec3(0.02, 0.06, 0.08) * caust * caust * depth;

    col *= edgeFade;
    gl_FragColor = vec4(col, 0.9 * edgeFade);
  }
`;

let ringSeq = 0;

export default function Water({ dir, droppedImpacts, waterApi }) {
  const meshRef = useRef(null);
  const matRef = useRef(null);
  const energyRef = useRef(0.3);
  const [rings, setRings] = useState([]);
  const surfaceRadius = useMemo(() => POND.w * 0.52, []);

  const sim = useMemo(() => {
    const f = createHeightfield();
    const geom = buildGeom();
    return { f, geom };
  }, []);

  // real-time cube reflection: render the scene into a cubemap every frame so
  // the water mirrors the chrome hook, the floaters and the studio lighting.
  const cubeRT = useMemo(
    () => new THREE.WebGLCubeRenderTarget(256, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter }),
    [],
  );
  const cubeCam = useMemo(() => new THREE.CubeCamera(0.1, 100, cubeRT), [cubeRT]);
  useEffect(() => () => cubeRT.dispose(), [cubeRT]);

  // expose the spawn API used by the choreography (entry/exit rings)
  useEffect(() => {
    if (!waterApi) return;
    waterApi.spawnIn = () => {
      const id = ++ringSeq;
      setRings((r) => [...r, { id, kind: 'in', age: 0, life: RING_LIFE }]);
    };
    waterApi.spawnOut = () => {
      const id = ++ringSeq;
      setRings((r) => [...r, { id, kind: 'out', age: 0, life: RING_LIFE_OUT }]);
    };
  }, [waterApi]);

  useFrame((state, delta) => {
    const d = delta > 0 ? Math.min(delta, 0.033) : 0.016;
    const t = state.clock.elapsedTime;

    // capture the scene into a cubemap for real reflections (hide the water
    // surface itself to avoid feedback while it's captured)
    if (meshRef.current) meshRef.current.visible = false;
    cubeCam.position.set(0, WATER_Y + 0.6, 0);
    cubeCam.update(state.gl, state.scene);
    if (meshRef.current) meshRef.current.visible = true;

    // meniscus strength: grows while the catch nears the surface, snaps to 0
    // once it breaks through
    let menu = 0;
    if (dir.phase === 'reel') {
      const bottom = dir.hookY - TIP + MENISCUS_OFFSET;
      const dist = bottom - WATER_Y;
      if (dist < -0.012 && dist > -0.2) menu = Math.min(1, (-dist - 0.012) / 0.16);
      else if (dist >= -0.012) menu = 0;
    }
    dir.menu = menu;

    energyRef.current = THREE.MathUtils.damp(
      energyRef.current,
      menu > 0 ? 0.95 : dir.impact ? 0.85 : 0.3,
      3.0,
      d,
    );

    stepHeightfield(sim.f, d, t, dir, droppedImpacts);

    // push heights into the geometry + recompute normals
    const pos = sim.geom.attributes.position;
    const arr = pos.array;
    const { pts, nz } = sim.f;
    for (let k = 0; k < sim.f.nx * nz; k++) arr[k * 3 + 1] = pts[k];
    pos.needsUpdate = true;
    sim.geom.computeVertexNormals();

    const m = matRef.current;
    if (m) {
      m.uniforms.uTime.value = t;
      m.uniforms.uEnergy.value = energyRef.current;
      m.uniforms.uEnv.value = cubeRT.texture;
    }

    // expire finished rings
    let expired = false;
    for (const r of rings) r.age += d;
    for (const r of rings) {
      if (r.age >= r.life) {
        expired = true;
        break;
      }
    }
    if (expired) setRings((rs) => rs.filter((r) => r.age < r.life));
  });

  // export the read-only surface probe used by droplets
  useEffect(() => {
    if (!waterApi) return;
    waterApi.surfaceAt = (x, z) => surfaceHeightAt(sim.f, x, z);
  }, [waterApi, sim]);

  return (
    <group>
      {/* cubemap capture rig for real reflections */}
      <primitive object={cubeCam} position={[0, WATER_Y + 0.6, 0]} />

      {/* the water surface */}
      <mesh ref={meshRef} geometry={sim.geom}>
        <shaderMaterial
          ref={matRef}
          vertexShader={WATER_VERT}
          fragmentShader={WATER_FRAG}
          transparent
          depthWrite={false}
          uniforms={{
            uEnv: { value: null },
            uDeep: { value: new THREE.Color('#053246') },
            uShallow: { value: new THREE.Color('#4cc9d6') },
            uSkyTop: { value: new THREE.Color('#bfe9ff') },
            uSkyBottom: { value: new THREE.Color('#e9f6ff') },
            uSunDir: { value: new THREE.Vector3(-0.5, 0.88, 0.38).normalize() },
            uRadius: { value: surfaceRadius },
            uTime: { value: 0 },
            uEnergy: { value: 0.3 },
          }}
        />
      </mesh>

      {/* expanding foam rings at the impact points */}
      {rings.map((r) => {
        const k = Math.min(r.age / r.life, 1);
        const scale = 0.4 + k * 2.35;
        return (
          <mesh
            key={r.id}
            position={[0, WATER_Y + 0.016, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            scale={[scale, scale, 1]}
          >
            <torusGeometry args={[0.42, 0.011, 6, 64]} />
            <meshBasicMaterial
              transparent
              opacity={(1 - k) * (r.kind === 'in' ? 0.75 : 0.45)}
              color={r.kind === 'in' ? '#a5f3fc' : '#7dd3fc'}
              depthWrite={false}
            />
          </mesh>
        );
      })}
    </group>
  );
}