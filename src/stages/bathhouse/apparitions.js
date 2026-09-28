import * as THREE from 'three';
import { Watcher, Follower, Peeker, StrayCat } from '../../entities/creatures.js';
import { PI, MW } from './constants.js';
import { footprintTexture } from './textures.js';

/** Bucket towers, wet footprints and the ones who watch; their per-frame part is in update.js. */
export function apparitions(world, lvl) {
  const { rng, mods, cellL, at } = lvl;

  // ---- apparitions (never lethal) and small wrong things
  const hum = { panner: null, fridge: null, chair: null };
  const towers = [];
  for (const m of mods) {
    for (const s of [0, 1]) {
      const [i, j] = cellL(m, s ? MW - 1 - 3 : 3, 17);
      if (world.unease(i, j) < 0.75 && world.depth < 4) continue;
      const p = at(m, s, 6.2, 14.6);
      towers.push({ m, s, x: p.x, z: p.z, n: 0, cool: 3 });
    }
  }
  const prints = [];
  const footMat = new THREE.MeshStandardMaterial({ color: 0x6a7c84, roughness: 0.02, metalness: 0.3, transparent: true, opacity: 0, map: footprintTexture(), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  for (let n = 0; n < 16; n++) {
    const fm = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.3), footMat.clone());
    fm.rotation.x = -PI / 2;
    fm.visible = false;
    fm.userData.noBake = true;
    world.root.add(fm);
    prints.push({ mesh: fm, age: 99 });
  }
  const walk = { active: false, timer: rng.float(20, 40), step: 0, n: 0, from: new THREE.Vector3(), dir: new THREE.Vector3(), panner: null };

  if (!world.attract) {
    world.add(new Watcher(world, { look: { body: 0xc8c0b8, eyes: 0x202020, height: 2.3 }, speed: 1.2 }));
    if (world.depth >= 1) world.add(new Follower(world));
    if (world.depth >= 1) world.add(new Peeker(world, { look: { body: 0xc8c0b8, eyes: 0x202020 } }));
    if (rng.chance(0.3)) world.add(new StrayCat(world));
  }

  Object.assign(lvl, { hum, towers, prints, walk });
}
