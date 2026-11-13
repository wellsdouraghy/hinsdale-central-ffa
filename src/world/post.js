// Post-processing chain (postprocessing + n8ao). Low quality renders straight to the canvas.
import * as THREE from 'three';
import {
  EffectComposer, RenderPass, EffectPass, Pass, BloomEffect, SMAAEffect, SMAAPreset, ToneMappingEffect, ToneMappingMode,
  VignetteEffect, BrightnessContrastEffect, HueSaturationEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';

export const POST_PRESETS = {
  low: { composer: false, ao: false, bloom: false, smaa: false, pixelRatio: 1.0 },
  medium: { composer: true, ao: false, bloom: true, smaa: true, pixelRatio: 1.25 },
  high: { composer: true, ao: true, bloom: true, smaa: true, pixelRatio: 1.5 },
};

// Draws the first-person overlay scene on top of the world inside the composer (so it gets tone mapping,
// bloom and anti-aliasing like everything else) after clearing depth.
class OverlayPass extends Pass {
  constructor() { super('OverlayPass'); this.needsSwap = false; this.overlayScene = null; this.overlayCamera = null; }
  render(renderer, inputBuffer) {
    if (!this.overlayScene || !this.overlayCamera) return;
    renderer.setRenderTarget(this.renderToScreen ? null : inputBuffer);
    const ac = renderer.autoClear; renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.overlayScene, this.overlayCamera);
    renderer.autoClear = ac;
  }
}

export function createPost({ renderer, scene, camera, quality }) {
  const preset = POST_PRESETS[quality] || POST_PRESETS.high;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;   // only applies when rendering straight to the canvas
  renderer.toneMappingExposure = 0.86;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset.pixelRatio));

  let composer = null, overlayPass = null, aoPass = null;
  const size = new THREE.Vector2();
  if (preset.composer) {
    try {
      composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
      composer.addPass(new RenderPass(scene, camera));
      renderer.getDrawingBufferSize(size);
      if (preset.ao) {
        aoPass = new N8AOPostPass(scene, camera, size.x, size.y);
        const c = aoPass.configuration;
        c.aoRadius = 1.6; c.distanceFalloff = 1.0; c.intensity = 2.4; c.aoSamples = 8; c.denoiseSamples = 4; c.denoiseRadius = 10;
        c.halfRes = true; c.depthAwareUpsampling = true; c.gammaCorrection = false; c.color = new THREE.Color(0x0a0d14);
        composer.addPass(aoPass);
      }
      overlayPass = new OverlayPass();
      composer.addPass(overlayPass);
      const effects = [];
      if (preset.bloom) effects.push(new BloomEffect({ mipmapBlur: true, luminanceThreshold: 1.15, luminanceSmoothing: 0.25, intensity: 0.35, radius: 0.7 }));
      const tm = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
      effects.push(tm);
      effects.push(new HueSaturationEffect({ saturation: 0.06 }));
      effects.push(new BrightnessContrastEffect({ brightness: 0.0, contrast: 0.06 }));
      effects.push(new VignetteEffect({ darkness: 0.32, offset: 0.32 }));
      composer.addPass(new EffectPass(camera, ...effects));
      if (preset.smaa) composer.addPass(new EffectPass(camera, new SMAAEffect({ preset: SMAAPreset.HIGH })));
    } catch (e) {
      console.warn('[world] post-processing unavailable, falling back to direct rendering', e);
      composer = null;
    }
  }

  function render(overlayScene, overlayCamera, dt) {
    if (composer) {
      overlayPass.overlayScene = overlayScene || null; overlayPass.overlayCamera = overlayCamera || null;
      composer.render(dt);
    } else {
      renderer.setRenderTarget(null);
      renderer.autoClear = true;
      renderer.render(scene, camera);
      if (overlayScene && overlayCamera) {
        renderer.autoClear = false; renderer.clearDepth();
        renderer.render(overlayScene, overlayCamera);
        renderer.autoClear = true;
      }
    }
  }
  function setSize(w, h) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset.pixelRatio));
    renderer.setSize(w, h);
    if (composer) composer.setSize(w, h);
  }
  return { render, setSize, composer, preset, dispose() { if (composer) composer.dispose(); } };
}
