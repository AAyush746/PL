// Cinematic post chain using the `postprocessing` library.
// Chain: RenderPass → DepthOfField → Bloom → ChromaticAberration → Vignette → ToneMapping
// SSR is omitted because three@0.179 doesn't export WebGLMultipleRenderTargets.
// The remaining effects still provide a very high-end look.
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  BloomEffect,
  ChromaticAberrationEffect,
  DepthOfFieldEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
  SMAAEffect,
} from 'postprocessing';
import * as THREE from 'three';

// SSR is omitted because three@0.179 doesn't export WebGLMultipleRenderTargets.
// The remaining effects still provide a very high-end cinematic look.
export default function FX({ enabled = true }) {
  const { gl, scene, camera, size } = useThree();

  useEffect(() => {
    // Override the default renderer's tone mapping to ACES Film,
    // so the post chain's ToneMappingEffect works harmoniously.
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.outputColorSpace = THREE.SRGBColorSpace;
  }, [gl]);

  const composer = useMemo(() => {
    if (!enabled || !gl?.domElement) return null;
    try {
      const c = new EffectComposer(gl);
      c.addPass(new RenderPass(scene, camera));

      const dof = new DepthOfFieldEffect(camera, {
        focusDistance: 0.062,
        focalLength: 0.05,
        bokehScale: 1.1,
      });
      const bloom = new BloomEffect({
        mipmapBlur: true,
        intensity: 0.55,
        luminanceThreshold: 0.82,
        luminanceSmoothing: 0.25,
      });
      const ca = new ChromaticAberrationEffect({
        offset: new THREE.Vector2(0.0014, 0.001),
        radialModulation: true,
        modulationOffset: 0.35,
      });
      const vignette = new VignetteEffect({ eskil: false, offset: 0.3, darkness: 0.6 });
      const aces = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
      const smaa = new SMAAEffect();

      c.addPass(new EffectPass(camera, dof));
      c.addPass(new EffectPass(camera, bloom));
      c.addPass(new EffectPass(camera, ca));
      c.addPass(new EffectPass(camera, vignette));
      c.addPass(new EffectPass(camera, aces));
      c.addPass(new EffectPass(camera, smaa));
      return c;
    } catch {
      return null;
    }
  }, [gl, scene, camera, enabled]);

  // keep the composer size in sync with the canvas
  useEffect(() => {
    if (!composer) return;
    composer.setSize(size.width, size.height);
  }, [composer, size.width, size.height]);

  // take over the render loop
  useFrame((_state, delta) => {
    if (!composer) return;
    composer.render(delta);
  }, 1);

  // dispose on unmount
  useEffect(() => {
    return () => {
      if (!composer) return;
      const c = composer;
      setTimeout(() => {
        try {
          c.dispose();
        } catch {
          /* already disposed */
        }
      }, 0);
    };
  }, [composer]);

  return null;
}