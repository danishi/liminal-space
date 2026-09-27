import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';

// Final "camcorder" pass: grain, vignette, chromatic aberration, scanlines
// and a fear-driven wobble. Runs after tone mapping, in display space.
const TapeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.06 },
    uVignette: { value: 0.35 },
    uChroma: { value: 0.0015 },
    uFear: { value: 0 },
    uScan: { value: 0.04 },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uStatic: { value: 0 },
    uDesat: { value: 0 },
    uFlash: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uGrain, uVignette, uChroma, uFear, uScan, uStatic, uDesat, uFlash;
    uniform vec3 uTint;
    uniform vec2 uRes;
    varying vec2 vUv;

    float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }

    void main() {
      vec2 uv = vUv;
      // fear wobble: slow horizontal tape warble
      float wob = uFear * 0.004 * sin(uv.y * 24.0 + uTime * 5.0) + uStatic * 0.02 * (rand(vec2(floor(uv.y * 60.0), uTime)) - 0.5);
      uv.x += wob;
      vec2 c = uv - 0.5;
      float d = dot(c, c);
      float ca = uChroma * (1.0 + uFear * 3.0) * (0.3 + d * 3.0);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ca).b;
      col *= uTint;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(l), clamp(uDesat, 0.0, 1.0));
      // scanlines
      col *= 1.0 - uScan * (0.5 + 0.5 * sin(vUv.y * uRes.y * 1.5));
      // grain
      float g = rand(vUv * uRes + fract(uTime * 13.37)) - 0.5;
      col += g * (uGrain + uFear * 0.05);
      // static bursts
      float s = rand(vUv * uRes * 0.5 + uTime);
      col = mix(col, vec3(s), clamp(uStatic, 0.0, 1.0) * 0.8);
      // vignette (tightens with fear)
      float v = smoothstep(0.85, 0.2, d * (1.0 + uFear * 1.2) * 2.2);
      col *= mix(1.0 - uVignette, 1.0, v);
      col += uFlash;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(scene, camera);
    this.gtao = new GTAOPass(scene, camera, 512, 512);
    this.gtao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 12 });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 10 });
    this.gtao.blendIntensity = 0.9;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.6, 0.85);
    this.output = new OutputPass();
    this.tape = new ShaderPass(TapeShader);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.gtao);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.output);
    this.composer.addPass(this.tape);
    this.u = this.tape.uniforms;
    this.reduce = false;
  }

  setScene(scene, camera) {
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.gtao.scene = scene;
    this.gtao.camera = camera;
  }

  setSize(w, h, pr) {
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w * pr * 0.5, h * pr * 0.5);
    this.u.uRes.value.set(w * pr, h * pr);
  }

  configure({ bloom = 0.4, bloomThreshold = 0.85, bloomRadius = 0.5, grain = 0.05, vignette = 0.35, chroma = 0.0015, scan = 0.03, tint = [1, 1, 1] } = {}, bloomEnabled = true, ao = 0) {
    this.bloom.enabled = bloomEnabled && bloom > 0;
    this.gtao.enabled = ao > 0;
    this.gtao.blendIntensity = ao;
    this.bloom.strength = bloom;
    this.bloom.threshold = bloomThreshold;
    this.bloom.radius = bloomRadius;
    this.base = { grain, vignette, chroma, scan };
    this.u.uTint.value.setRGB(...tint);
    this.apply();
  }

  apply() {
    const b = this.base;
    this.u.uGrain.value = b.grain;
    this.u.uVignette.value = b.vignette;
    this.u.uChroma.value = this.reduce ? 0 : b.chroma;
    this.u.uScan.value = b.scan;
  }

  update(t, fear, extra = {}) {
    this.u.uTime.value = t;
    this.u.uFear.value = this.reduce ? fear * 0.3 : fear;
    this.u.uStatic.value = this.reduce ? Math.min(0.15, extra.static || 0) : extra.static || 0;
    this.u.uDesat.value = extra.desat || 0;
    this.u.uFlash.value = extra.flash || 0;
  }

  render(dt) {
    this.composer.render(dt);
  }
}
