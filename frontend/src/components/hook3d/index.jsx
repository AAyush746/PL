// Phishloop 3D hook hero — open pond, realistic chrome hook drops from above,
// splashes into water, scoops submerged risk cards, and vanishes at the top.
import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  CHOREO,
  HOOK_ENTRY_Y,
  HOOK_EXIT_Y,
  HOOK_PAUSE_Y,
  MAX_DEPTH,
  TIP,
  WATER_Y,
  createDirector,
} from './constants';
import OpenWater from './Pond.jsx';
import Hook from './Hook.jsx';
import Floaters from './Floaters.jsx';
import Water from './Water.jsx';
import Droplets from './Droplets.jsx';
import FX from './FX.jsx';

function Env() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = new RoomEnvironment();
    const tex = pmrem.fromScene(env, 0.04).texture;
    pmrem.dispose();
    env.dispose();
    scene.environment = tex;
    scene.environmentIntensity = 1.15;
    return () => {
      scene.environment = null;
      tex.dispose();
    };
  }, [gl, scene]);
  return null;
}

function Lights() {
  return (
    <>
      <directionalLight position={[2.8, 6, 3.5]} intensity={2.8} color="#fff8f0" castShadow />
      <directionalLight position={[-4.5, 3, -2]} intensity={1.6} color="#7dd3fc" />
      <directionalLight position={[4, 1.5, -2.5]} intensity={0.9} color="#fde68a" />
      <pointLight position={[0, 2.5, 2]} intensity={0.6} color="#e0f2fe" />
      <ambientLight intensity={0.18} />
    </>
  );
}

function CameraSway() {
  useFrame(({ camera }) => {
    const t = performance.now() / 1000;
    camera.position.x = Math.sin(t * 0.09) * 0.12;
    camera.position.y = 1.35 + Math.sin(t * 0.11) * 0.05;
    camera.lookAt(0, -0.12, 0);
  });
  return null;
}

function Choreography({ dir, hookApi, waterApi, reduced }) {
  useFrame((state) => {
    if (reduced) return;
    const dt = Math.min(state.clock.getDelta() || 0.016, 0.033);
    dir.t += dt;
    const s = dir;
    const tip = s.hookY - TIP;
    const under = tip < WATER_Y;

    if (under && !s.under) {
      const impactForce = Math.min(11, Math.abs(s.velY) * 3.0);
      s.impact = { x: 0, z: 0, force: impactForce };
      s.burst = true;
      s.velY *= CHOREO.waterEntryDamp;
      s.splashCrown = true;
      waterApi.spawnIn?.();
    } else if (!under && s.under) {
      waterApi.spawnOut?.();
    }
    s.under = under;

    if (under && (s.phase === 'dive' || s.phase === 'reel')) {
      s.wake = { force: Math.abs(s.velY) * 0.55 };
    } else {
      s.wake = null;
    }

    switch (s.phase) {
      case 'wait':
        s.opacity = 0;
        s.hookY = HOOK_ENTRY_Y;
        s.velY = 0;
        s.t += dt;
        if (s.t >= CHOREO.wait) {
          s.phase = 'enter';
          s.t = 0;
          s.velY = -0.9;
        }
        break;

      case 'enter':
        s.velY = Math.max(-CHOREO.airTerm, s.velY - CHOREO.g * dt);
        s.hookY += s.velY * dt;
        s.opacity = THREE.MathUtils.clamp((HOOK_ENTRY_Y - s.hookY) / 2.8, 0, 1);
        if (s.hookY <= HOOK_PAUSE_Y) {
          s.hookY = HOOK_PAUSE_Y;
          s.velY = 0;
          s.opacity = 1;
          s.phase = 'pause';
          s.t = 0;
        }
        break;

      case 'pause':
        s.t += dt;
        if (s.t >= CHOREO.pause) {
          s.phase = 'dive';
          s.t = 0;
        }
        break;

      case 'dive':
        if (tip > WATER_Y) {
          s.velY = Math.max(-CHOREO.airTerm, s.velY - CHOREO.g * dt);
        } else {
          s.velY += CHOREO.waterDrag * (-CHOREO.waterTerm - s.velY) * dt;
          s.velY += CHOREO.waterBuoyancy * dt * 0.12;
        }
        s.hookY += s.velY * dt;
        if (tip <= MAX_DEPTH) {
          s.hookY = MAX_DEPTH + TIP;
          s.velY = 0;
          s.phase = 'catch';
          s.t = 0;
        }
        break;

      case 'catch':
        s.t += dt;
        if (s.t >= CHOREO.catchHold) {
          s.phase = 'reel';
          s.t = 0;
        }
        break;

      case 'reel':
        if (tip <= WATER_Y) {
          s.velY += CHOREO.riseDrag * (CHOREO.riseTerm - s.velY) * dt;
        } else {
          s.velY = Math.min(CHOREO.airRiseTerm, s.velY + CHOREO.airRiseAccel * dt);
        }
        s.hookY += s.velY * dt;
        if (s.hookY >= HOOK_PAUSE_Y + 0.35) {
          s.phase = 'exit';
          s.t = 0;
        }
        break;

      case 'exit':
        s.velY = Math.min(CHOREO.airRiseTerm, s.velY + CHOREO.airRiseAccel * dt);
        s.hookY += s.velY * dt;
        s.opacity = THREE.MathUtils.clamp(
          1 - (s.hookY - HOOK_PAUSE_Y) / (HOOK_EXIT_Y - HOOK_PAUSE_Y),
          0,
          1,
        );
        if (s.hookY >= HOOK_EXIT_Y || s.opacity <= 0.02) {
          s.opacity = 0;
          s.resetTick += 1;
          s.phase = 'wait';
          s.hookY = HOOK_ENTRY_Y;
          s.velY = 0;
          s.t = 0;
          s.under = false;
        }
        break;

      default:
        s.phase = 'wait';
        break;
    }

    const body = hookApi.current;
    if (body) {
      try {
        body.setNextKinematicTranslation({ x: 0, y: s.hookY, z: 0 }, true);
      } catch {
        /* physics body not ready yet */
      }
    }
  }, -100);
  return null;
}

export default function HookScene3D({ reduced = false }) {
  const dir = useMemo(() => {
    const d = createDirector();
    d.reduced = reduced;
    return d;
  }, [reduced]);
  const hookApi = useRef(null);
  const waterApi = useRef({});
  const droppedImpacts = useMemo(() => [], []);

  if (typeof window === 'undefined') return null;

  return (
    <div className="pointer-events-none relative h-[420px] w-full overflow-visible sm:h-[500px]">
      <Canvas
        dpr={[1, 1.75]}
        gl={{ antialias: true, powerPreference: 'high-performance', alpha: true }}
        camera={{ position: [0, 1.2, 7.8], fov: 38, near: 0.1, far: 40 }}
        style={{ position: 'absolute', inset: 0, background: 'transparent' }}
      >
        <Env />
        <Lights />
        <CameraSway />
        <OpenWater />
        <Physics timeStep={1 / 60} gravity={[0, -9.81, 0]}>
          <Hook dir={dir} hookApi={hookApi} />
          <Floaters dir={dir} />
          <Choreography dir={dir} hookApi={hookApi} waterApi={waterApi} reduced={reduced} />
        </Physics>
        <Water dir={dir} droppedImpacts={droppedImpacts} waterApi={waterApi} />
        <Droplets dir={dir} droppedImpacts={droppedImpacts} waterApi={waterApi} />
        <FX enabled={false} />
      </Canvas>
    </div>
  );
}
