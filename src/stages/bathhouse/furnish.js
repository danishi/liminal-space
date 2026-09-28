import * as THREE from 'three';
import { rngFn as rng32 } from '../../core/rng.js';
import { PropKit } from '../../props/kit.js';
import { modelSize } from '../../core/assets.js';
import { PI } from './constants.js';
import { Batch, modelParts, matAt } from './geometry.js';
import { bathBucketParts } from './parts.js';
import { Pokeables } from './entities.js';
import { genkan, bandai, changingRoom, bathHall, hallLights, hallMural } from './rooms.js';
import { frontage, sideLamps } from './frontage.js';

/** The prop kit, instanced batches, the light fixture list and the lists of pokeable things. */
export function furnish(world, lvl) {
  const { at } = lvl;

  // ---- props
  const kit = new PropKit(world);
  const batch = new Batch(world);
  const poke = new Pokeables(world);
  const bakeSources = world.bakeSources;
  const place = (grp, m, s, lx, lz, yaw = 0, y = 0, collide = null) => {
    const p = at(m, s, lx, lz, yaw);
    kit.add(grp, p.x, p.z, p.yaw, { y, collide });
    return p;
  };
  const fixtures = [];
  const fixture = (x, y, z, { intensity = 1, color = null, visible = true, rot = 0 } = {}) => fixtures.push({ x, y, z, intensity, color, visible, rot });

  const buckets = [];
  const stoolWood = modelParts('wooden_stool_01', 0.55);
  const stoolSize = modelSize('wooden_stool_01').clone().multiplyScalar(0.55);
  const basketParts = modelParts('wicker_basket_01', 0.9);
  const addBucket = (m, s, x, y, z, yaw, upside = false, key = 'b') => {
    const mat4 = upside ? matAt(x, y + 0.115, z, yaw, 1, PI) : matAt(x, y, z, yaw);
    const ref = batch.add(`bucket:${m ? m.idx : 't'}:${key}`, bathBucketParts(), mat4);
    const b = { ref, pos: new THREE.Vector3(x, y + 0.06, z), base: mat4.clone(), m, s, hop: 0, tower: false, upside };
    buckets.push(b);
    return b;
  };

  const clock = (m, s, lx, lz, yaw, y) => {
    const grp = new THREE.Group();
    kit.model(grp, 'wall_clock', 0, 0, 0, 0, 0.9);
    place(grp, m, s, lx, lz, yaw, y);
  };

  const massageChairs = [];
  const yuzus = [];
  const yuzuMat = new THREE.MeshStandardMaterial({ color: 0xf0b020, roughness: 0.5 });
  const yuzuGeo = new THREE.SphereGeometry(0.045, 12, 9);
  yuzuGeo.scale(1, 0.85, 1);
  const yuzuParts = [{ geo: yuzuGeo, mat: yuzuMat, m: new THREE.Matrix4() }];
  world.onDispose.push(() => yuzuGeo.dispose());
  const scales = [];
  const fridges = [];

  Object.assign(lvl, { kit, batch, poke, bakeSources, place, fixtures, fixture, buckets, stoolWood, stoolSize, basketParts, addBucket, clock, massageChairs, yuzus, yuzuParts, scales, fridges });
}

/**
 * Every bathhouse, room by room. Each bathhouse has its own random stream (r2),
 * which its rooms draw from in this order.
 */
export function bathhouses(world, lvl) {
  const { mods } = lvl;

  for (const m of mods) {
    const mu = m.u;
    const r2 = rng32(m.idx * 97 + 3);
    genkan(world, lvl, m, mu, r2);
    bandai(world, lvl, m);
    // ---------------- both sides: changing room and bath hall
    for (const s of [0, 1]) {
      changingRoom(world, lvl, m, s, mu, r2);
      bathHall(world, lvl, m, s, mu, r2);
    }
    hallLights(world, lvl, m);
    hallMural(world, lvl, m);
    frontage(world, lvl, m);
    sideLamps(world, lvl, m);
  }
}
