import * as THREE from 'three';
import { PI, W, H } from './constants.js';
import { puffTexture } from './textures.js';

/** Steam puffs over the water; `lvl.updateSteam(dt, ctx)` moves them each frame. */
export function bathSteam(world, lvl) {
  const { K, bathKind, isWet, surfOf } = lvl;

  // ---- steam over the baths
  const wet = [];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (isWet(i, j)) wet.push([i, j]);
  const SN = 320;
  const sPos = new Float32Array(SN * 3);
  const sAlpha = new Float32Array(SN);
  const sSize = new Float32Array(SN);
  const sLife = [];
  const respawn = (n, t0 = Math.random()) => {
    const [i, j] = wet[(Math.random() * wet.length) | 0];
    sPos[n * 3] = i + Math.random();
    sPos[n * 3 + 1] = surfOf(i, j) + 0.05;
    sPos[n * 3 + 2] = j + Math.random();
    sLife[n] = { dim: bathKind[K(i, j)] === 3 ? 0.35 : 1, t: t0 * 8, max: 6 + Math.random() * 5, vx: (Math.random() - 0.5) * 0.12, vz: (Math.random() - 0.5) * 0.12, vy: 0.18 + Math.random() * 0.2 };
    sSize[n] = 2.0 + Math.random() * 2.0;
  };
  for (let n = 0; n < SN; n++) respawn(n);
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  sGeo.setAttribute('aAlpha', new THREE.BufferAttribute(sAlpha, 1));
  sGeo.setAttribute('aSize', new THREE.BufferAttribute(sSize, 1));
  const steamMat = new THREE.ShaderMaterial({
    uniforms: { tex: { value: puffTexture() }, uScale: { value: 600 }, uColor: { value: new THREE.Color(0.95, 0.97, 1.0) } },
    vertexShader: /* glsl */ `
        attribute float aAlpha;
        attribute float aSize;
        uniform float uScale;
        varying float vA;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = min(aSize * uScale / max(0.5, -mv.z), 220.0);
          vA = aAlpha * smoothstep(1.0, 4.0, -mv.z);
        }`,
    fragmentShader: /* glsl */ `
        uniform sampler2D tex;
        uniform vec3 uColor;
        varying float vA;
        void main() {
          float a = texture2D(tex, gl_PointCoord).a * vA;
          if (a < 0.004) discard;
          gl_FragColor = vec4(uColor, a);
        }`,
    transparent: true,
    depthWrite: false,
  });
  const steam = new THREE.Points(sGeo, steamMat);
  steam.frustumCulled = false;
  steam.renderOrder = 3;
  world.root.add(steam);

  const updateSteam = (dt, ctx) => {
    const sz = ctx.game.renderer?.domElement?.height || 720;
    steamMat.uniforms.uScale.value = sz * 0.55;
    for (let n = 0; n < SN; n++) {
      const L = sLife[n];
      L.t += dt;
      if (L.t > L.max) {
        respawn(n, 0);
        continue;
      }
      sPos[n * 3] += L.vx * dt;
      sPos[n * 3 + 1] += L.vy * dt;
      sPos[n * 3 + 2] += L.vz * dt;
      const f = L.t / L.max;
      sAlpha[n] = Math.sin(f * PI) * 0.055 * L.dim;
      sSize[n] += dt * 0.12;
    }
    sGeo.attributes.position.needsUpdate = true;
    sGeo.attributes.aAlpha.needsUpdate = true;
    sGeo.attributes.aSize.needsUpdate = true;
  };

  Object.assign(lvl, { updateSteam });
}
