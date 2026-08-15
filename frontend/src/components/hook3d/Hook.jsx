// Orange-tip / white-shank fishing hook on a bold rigid metal chain.
import * as THREE from 'three';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BallCollider, CuboidCollider, RigidBody } from '@react-three/rapier';

const CHAIN_LINKS = 16;

function WhiteMetal() {
  return (
    <meshPhysicalMaterial
      color="#f4f7fb"
      metalness={1}
      roughness={0.14}
      clearcoat={1}
      clearcoatRoughness={0.05}
      envMapIntensity={2.2}
    />
  );
}

function OrangeMetal() {
  return (
    <meshPhysicalMaterial
      color="#ff7511"
      metalness={0.98}
      roughness={0.22}
      clearcoat={1}
      clearcoatRoughness={0.08}
      envMapIntensity={2.0}
    />
  );
}

function RigidChain({ dir }) {
  const groupRef = useRef(null);

  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    const eyeY = dir.hookY - 0.12;
    const topY = eyeY + 5.2;
    const span = Math.max(0.2, topY - eyeY);
    const spacing = span / CHAIN_LINKS;
    for (let i = 0; i < CHAIN_LINKS; i++) {
      const link = g.children[i];
      if (!link) continue;
      link.position.set(0, eyeY + (i + 0.5) * spacing, 0);
      link.rotation.y = (i % 2) * (Math.PI / 2);
      link.rotation.x = (i % 3) * 0.04;
    }
  });

  return (
    <group ref={groupRef}>
      {Array.from({ length: CHAIN_LINKS }).map((_, i) => (
        <mesh key={i} castShadow>
          <torusGeometry args={[0.068, 0.024, 12, 24]} />
          <meshStandardMaterial
            color="#e8650a"
            metalness={0.97}
            roughness={0.26}
            envMapIntensity={1.9}
          />
        </mesh>
      ))}
    </group>
  );
}

function HookMesh() {
  const eyelet = useMemo(() => new THREE.TorusGeometry(0.088, 0.028, 16, 32), []);
  const shank = useMemo(() => new THREE.CylinderGeometry(0.024, 0.028, 0.44, 18), []);
  const jPath = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.5, 0),
      new THREE.Vector3(0.012, -0.77, 0),
      new THREE.Vector3(0.052, -0.99, 0),
      new THREE.Vector3(0.118, -1.15, 0),
      new THREE.Vector3(0.218, -1.24, 0),
      new THREE.Vector3(0.328, -1.245, 0),
      new THREE.Vector3(0.398, -1.17, 0),
      new THREE.Vector3(0.428, -1.08, 0),
      new THREE.Vector3(0.428, -1.0, 0),
    ]);
    return new THREE.TubeGeometry(curve, 56, 0.032, 14, false);
  }, []);

  return (
    <group>
      {/* white upper shank */}
      <mesh geometry={shank} position={[0, -0.34, 0]}>
        <WhiteMetal />
      </mesh>
      <mesh position={[0, -0.34, 0]}>
        <sphereGeometry args={[0.046, 16, 16]} />
        <WhiteMetal />
      </mesh>
      <mesh geometry={eyelet} position={[0, -0.12, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <WhiteMetal />
      </mesh>
      {/* orange curve + tip */}
      <mesh geometry={jPath}>
        <OrangeMetal />
      </mesh>
      <mesh position={[0.428, -1.0, 0]} rotation={[0, 0, Math.PI]}>
        <coneGeometry args={[0.05, 0.12, 14]} />
        <OrangeMetal />
      </mesh>
      <mesh position={[0.355, -1.115, 0]}>
        <sphereGeometry args={[0.026, 12, 12]} />
        <OrangeMetal />
      </mesh>
    </group>
  );
}

export default function Hook({ dir, hookApi }) {
  const rigRef = useRef(null);

  useFrame(() => {
    const g = rigRef.current;
    if (!g) return;
    const a = dir.opacity;
    g.visible = a > 0.015;
    g.traverse((obj) => {
      if (!obj.material) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        m.transparent = a < 0.995;
        m.opacity = a;
        m.depthWrite = a > 0.35;
      }
    });
  });

  return (
    <group ref={rigRef}>
      <RigidChain dir={dir} />
      <RigidBody ref={hookApi} type="kinematicPosition" colliders={false} name="phish-hook">
        <group>
          <HookMesh />
          <BallCollider args={[0.07]} position={[0, -0.4, 0]} />
          <BallCollider args={[0.07]} position={[0.2, -1.1, 0]} />
          <BallCollider args={[0.06]} position={[0.42, -1.0, 0]} />
          <CuboidCollider args={[0.05, 0.35, 0.05]} position={[0, -0.62, 0]} />
        </group>
      </RigidBody>
    </group>
  );
}
