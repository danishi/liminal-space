import * as THREE from 'three';
import { WATER } from '../../core/grid.js';
import { hdri } from '../../core/assets.js';
import { Z_DRESS, Z_BATH } from './constants.js';

export function mood(world, lvl) {
  const { g, zone, K, u } = lvl;

  // ---- surfaces and mood
  world.speedFn = (x, z) => (world.isWater(x, z) ? 0.6 : 1);
  world.surfaceFn = (x, z) => {
    const [i, j] = g.cellOf(x, z);
    if (!g.inBounds(i, j)) return 'stone';
    const c = g.get(i, j);
    const zn = zone[K(i, j)];
    if (c === WATER) return 'water';
    if (zn === Z_DRESS) return 'wood';
    if (zn === Z_BATH) return 'tile';
    return 'stone';
  };
  Object.assign(world.env, {
    background: 0x0b0f18,
    backgroundTex: hdri('qwantani_night_puresky'),
    backgroundIntensity: 0.14,
    fog: new THREE.FogExp2(new THREE.Color(0x8c9aa4).lerp(new THREE.Color(0x4a5258), u), 0.028 + world.depth * 0.003),
    exposure: 1.05,
    postfx: { bloom: 0.45, bloomThreshold: 0.78, bloomRadius: 0.6, grain: 0.045, vignette: 0.3, chroma: 0.0012, scan: 0.02, tint: [1.0, 1.01, 1.03] },
    ao: 0.8,
    envIntensity: 0.75,
    ambience: 'bath',
    reverb: [3.5, 3],
    flashlight: false,
    bake: { fixtureScale: 0.3, bounce: 0.5, hemi: 0.5, dynamic: 0.45, radius: 8, tess: 0.8 },
  });
}
