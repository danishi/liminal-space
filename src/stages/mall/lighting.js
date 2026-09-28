import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ceilingFixtures } from '../common.js';
import { Z } from './constants.js';

/** Ceiling fixtures and their rods, the environment, and what the floor sounds like. */
export function lighting(world, lvl) {
  const { depth, g, K, escSet, ceilAt, zoneOf } = lvl;
  // ---- lights ------------------------------------------------------------------------------
  world.root.add(new THREE.HemisphereLight(0xfff4e2, 0x8a7a66, 0.55));
  const fixY = (i, j) => Math.min(ceilAt(i, j), Math.max(0, g.heightOf(i, j)) + 4.6) - 0.02;
  const fixture = (c, i, j) => {
    if (g.ramp[K(i, j)] || escSet.has(K(i, j))) return false;
    const z = zoneOf(i, j);
    if (z === Z.SHOP) return i % 2 === 1 && j % 2 === 1;
    if (z === Z.SERV || z === Z.REST || z === Z.OFFICE) return (i + j) % 3 === 0;
    if (i <= 3) return i === 2 && j === 15;
    if (j === 10 || j === 11) return j === 10 && i % 4 === 3;
    if (j >= 19) return i % 3 === 1 && j % 2 === 0;
    return (j === 13 || j === 17) && i % 3 === 1;
  };
  world.ceilAt = (i, j) => fixY(i, j) + 0.02;
  const lp = ceilingFixtures(world, {
    type: 'rect', every: 1, offset: 0, size: [1.2, 0.6], color: 0xfff0dc, panelColor: [2.0, 1.95, 1.8], intensity: 9, distance: 12,
    flicker: 0.03, dead: 0.03, filter: fixture, housing: new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.5 }),
  });
  world.ceilAt = ceilAt;
  // pendant rods up to the atrium roof
  const rodMat = new THREE.MeshStandardMaterial({ color: 0x8a8c90, roughness: 0.4, metalness: 0.8 });
  const rods = [];
  for (const f of lp.fixtures) {
    const [i, j] = g.cellOf(f.pos.x, f.pos.z);
    const top = ceilAt(i, j);
    if (top - f.pos.y < 0.4) continue;
    for (const s of [-0.45, 0.45]) {
      const r = new THREE.CylinderGeometry(0.008, 0.008, top - f.pos.y, 4);
      r.translate(f.pos.x + s, (top + f.pos.y) / 2, f.pos.z);
      rods.push(r);
    }
  }
  if (rods.length) world.root.add(new THREE.Mesh(mergeGeometries(rods), rodMat));

  // ---- environment ----------------------------------------------------------------------------
  Object.assign(world.env, {
    background: 0xd8d0c4,
    fog: new THREE.FogExp2(new THREE.Color(0xd8ccb8).lerp(new THREE.Color(0x8a8680), Math.min(1, depth * 0.15)), 0.0055 + depth * 0.003),
    exposure: 1.05,
    postfx: { bloom: 0.35, bloomThreshold: 0.9, bloomRadius: 0.6, grain: 0.05, vignette: 0.32, chroma: 0.0014, scan: 0.025, tint: [1.03, 1.0, 0.95] },
    ao: 1,
    envIntensity: 0.7,
    ambience: 'mall',
    reverb: [3.5, 2.2],
    flashlight: false,
    bake: { hemi: 0.6, dynamic: 0.5, bounce: 0.4, fixtureScale: 0.55, radius: 11, tess: 0.9 },
  });
  world.surfaceFn = (x, z) => {
    const [i, j] = g.cellOf(x, z);
    if (!g.inBounds(i, j)) return 'tile';
    if (escSet.has(K(i, j))) return 'stone';
    const zn = zoneOf(i, j);
    return zn === Z.SHOP ? 'wood' : zn === Z.SERV ? 'stone' : zn === Z.OFFICE ? 'soft' : 'tile';
  };
}
