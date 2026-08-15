// Risk cards start fully submerged. They drift underwater until the hook
// scoops them, then ride up and fade out as the hook exits the viewport.
import * as THREE from 'three';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { __iconNode as mailNode } from 'lucide-react/dist/esm/icons/mail.mjs';
import { __iconNode as mouseNode } from 'lucide-react/dist/esm/icons/mouse-pointer-click.mjs';
import { __iconNode as keyNode } from 'lucide-react/dist/esm/icons/key-round.mjs';
import { __iconNode as scanNode } from 'lucide-react/dist/esm/icons/scan-face.mjs';
import { __iconNode as eyeNode } from 'lucide-react/dist/esm/icons/eye.mjs';
import { __iconNode as userXNode } from 'lucide-react/dist/esm/icons/user-x.mjs';
import { __iconNode as fingerprintNode } from 'lucide-react/dist/esm/icons/fingerprint-pattern.mjs';
import { __iconNode as globeNode } from 'lucide-react/dist/esm/icons/globe.mjs';
import { ATTACH, CARD, FLOATERS, WATER_Y, submergedY } from './constants';
import { makeCardTexture } from './iconTexture';

const NODE_FOR = {
  mail: mailNode,
  mouse: mouseNode,
  key: keyNode,
  scan: scanNode,
  eye: eyeNode,
  userx: userXNode,
  fingerprint: fingerprintNode,
  globe: globeNode,
};

const SPRING_K = 8.5;
const UNDER_DAMP = 2.8;
const MAX_SURFACE = WATER_Y - 0.08;

function Card({ icon, label, initial, index, ctrl, dir }) {
  const bodyRef = useRef(null);
  const visualRef = useRef(null);
  const [tex, setTex] = useState(null);
  const start = useMemo(
    () => new THREE.Vector3(initial.x, submergedY(index, initial), initial.z),
    [initial, index],
  );
  const st = useRef({ scale: 1, attach: ATTACH[index] });

  useEffect(() => {
    let alive = true;
    makeCardTexture(NODE_FOR[icon], label).then((t) => {
      if (alive) setTex(t);
    });
    return () => {
      alive = false;
    };
  }, [icon, label]);

  useEffect(() => {
    ctrl.reset = () => {
      const body = bodyRef.current;
      if (!body) return;
      body.setTranslation({ x: start.x, y: start.y, z: start.z }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      body.wakeUp();
      st.current.scale = 1;
    };
    return () => {
      ctrl.reset = null;
    };
  }, [ctrl, start]);

  useFrame((state, delta) => {
    const body = bodyRef.current;
    if (!body) return;
    const d = Math.min(delta || 0.016, 0.033);
    const t = state.clock.elapsedTime;
    const s = st.current;
    const phase = dir.phase;

    if (phase === 'catch' || phase === 'reel' || phase === 'exit') {
      const { dx, dy } = s.attach;
      const pos = body.translation();
      body.setLinvel(
        {
          x: (dx - pos.x) * SPRING_K,
          y: (dir.hookY + dy - pos.y) * SPRING_K,
          z: -pos.z * SPRING_K,
        },
        true,
      );
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      const vis = phase === 'exit' ? dir.opacity : 1;
      s.scale = THREE.MathUtils.damp(s.scale, vis, 14, d);
      if (visualRef.current) visualRef.current.scale.setScalar(s.scale);
      return;
    }

    // submerged idle — slow underwater drift, never break the surface
    const pos = body.translation();
    const v = body.linvel();
    const fx = Math.sin(t * 0.38 + initial.x * 2.4) * 0.14;
    const fz = Math.cos(t * 0.31 + initial.z * 2.1) * 0.14;
    const fy = Math.sin(t * 0.55 + index) * 0.06;
    let nx = v.x * (1 - UNDER_DAMP * d) + fx * d;
    let ny = v.y * (1 - UNDER_DAMP * d) + fy * d;
    let nz = v.z * (1 - UNDER_DAMP * d) + fz * d;
    if (pos.y > MAX_SURFACE) ny -= (pos.y - MAX_SURFACE) * 18 * d;
    body.setLinvel({ x: nx, y: ny, z: nz }, true);
    s.scale = THREE.MathUtils.damp(s.scale, 1, 8, d);
    if (visualRef.current) visualRef.current.scale.setScalar(s.scale);
  });

  return (
    <RigidBody
      ref={bodyRef}
      type="dynamic"
      colliders={false}
      position={[start.x, start.y, start.z]}
      linearDamping={0.35}
      angularDamping={0.65}
      lockRotations
    >
      <CuboidCollider args={[CARD.w / 2.6, CARD.h / 3.2, 0.03]} />
      <group ref={visualRef}>
        <mesh>
          <planeGeometry args={[CARD.w, CARD.h]} />
          {tex ? (
            <meshBasicMaterial map={tex} transparent depthWrite={false} side={2} />
          ) : (
            <meshStandardMaterial color="#0e1a20" transparent opacity={0} depthWrite={false} />
          )}
        </mesh>
      </group>
    </RigidBody>
  );
}

export default function Floaters({ dir }) {
  const ctrls = useRef(FLOATERS.map(() => ({})));
  const lastTick = useRef(dir.resetTick);

  useFrame(() => {
    if (dir.resetTick !== lastTick.current) {
      lastTick.current = dir.resetTick;
      for (const c of ctrls.current) c.reset?.();
    }
  }, -50);

  return (
    <group>
      {FLOATERS.map((f, i) => (
        <Card
          key={f.label}
          icon={f.icon}
          label={f.label}
          initial={f}
          index={i}
          ctrl={ctrls.current[i]}
          dir={dir}
        />
      ))}
    </group>
  );
}
