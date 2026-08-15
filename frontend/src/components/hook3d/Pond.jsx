// Soft open-water volume — radial falloff only, no rectangular edges visible.
import { useMemo } from 'react';
import * as THREE from 'three';
import { WATER_Y } from './constants';

const DISC_R = 5.2;

const VOL_VERT = /* glsl */ `
  varying vec2 vUv;
  varying float vDepth;
  void main() {
    vUv = uv;
    vDepth = position.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const VOL_FRAG = /* glsl */ `
  varying vec2 vUv;
  varying float vDepth;
  uniform float uRadius;

  void main() {
    vec2 c = vUv - 0.5;
    float r = length(c) * 2.0;
    float radial = 1.0 - smoothstep(0.25, 1.0, r);
    float depth = smoothstep(-1.4, 0.0, vDepth);
    float a = radial * depth * 0.28;
    vec3 col = mix(vec3(0.02, 0.28, 0.38), vec3(0.08, 0.62, 0.72), depth);
    gl_FragColor = vec4(col, a);
  }
`;

export default function OpenWater() {
  const uniforms = useMemo(() => ({ uRadius: { value: DISC_R } }), []);

  return (
    <group>
      {/* volumetric underwater tint — circular, fades to nothing at edges */}
      <mesh position={[0, WATER_Y - 0.55, 0]}>
        <cylinderGeometry args={[DISC_R, DISC_R * 1.08, 1.1, 64, 1, true]} />
        <shaderMaterial
          vertexShader={VOL_VERT}
          fragmentShader={VOL_FRAG}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          side={2}
        />
      </mesh>
    </group>
  );
}
