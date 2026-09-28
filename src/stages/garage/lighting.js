import * as THREE from 'three';
import { HOLE } from '../../core/grid.js';
import { decorate } from '../common.js';
import { LightPool } from '../../core/lights.js';
import { keep } from '../../props/kit.js';
import * as P from '../../props/library.js';
import { CS, H, P7, PI, BAY_ROWS, LANES, CROSS, SEGS } from './constants.js';
import { tyreStack, hoseBox, missingPoster, noIdling } from './props.js';

/** Sodium lamps and cold tubes, then the set dressing, and the kit's static meshes are merged. */
export function lighting(world, lvl) {
  const { rng, g, K, laneOf, crossOf, room, kit, M, decals, blocked, Mdl } = lvl;

  // ---- lights: sodium lamps on a lattice over the lanes, a few cold tubes ------------
  const lampAt = [];
  for (const L of LANES) for (const s of SEGS) for (let k = 0; k < 6; k++) lampAt.push([(s + 1.5 + 3 * k) * CS, (L + 1) * CS]);
  for (const c of CROSS) for (const row of BAY_ROWS) lampAt.push([(c + 1) * CS, (row.j + 1) * CS]);
  for (const c of [1, 21]) for (const k of [1.5, 5]) lampAt.push([(c + 1) * CS, (17 + k) * CS]);
  lampAt.push([42 * CS, 18.5 * CS], [45 * CS, 3 * CS]);
  const pool = new LightPool(world.root, world.lightCount, { color: 0xff9a40, intensity: 7, distance: 13, decay: 1.5 });
  world.lightPool = pool;
  const lens = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.05, 0.22), new THREE.MeshBasicMaterial({ color: 0xffffff }), lampAt.length);
  const housing = new THREE.InstancedMesh(new THREE.BoxGeometry(0.62, 0.14, 0.3), new THREE.MeshStandardMaterial({ color: 0x3a3a38, roughness: 0.5, metalness: 0.5 }), lampAt.length);
  pool.baseColor.setRGB(1.7, 0.72, 0.16);
  const mtx = new THREE.Matrix4();
  const col = new THREE.Color();
  lampAt.forEach(([x, z], n) => {
    const [i, j] = g.cellOf(x, z);
    const top = world.floorAt(x, z) + H;
    const y = top - 0.52;
    const rot = crossOf(i) !== undefined && laneOf(j) === undefined ? PI / 2 : 0;
    mtx.makeRotationY(rot).setPosition(x, y, z);
    lens.setMatrixAt(n, mtx);
    lens.setColorAt(n, col.setRGB(1.7, 0.72, 0.16));
    mtx.makeRotationY(rot).setPosition(x, y + 0.09, z);
    housing.setMatrixAt(n, mtx);
    for (const s of [-0.22, 0.22]) kit.cyl(decals, 0.008, 0.008, 0.44, M.steel, x + (rot ? 0 : s), y + 0.38, z + (rot ? s : 0), 0, 0, 0, 5);
    const u = world.unease(i, j);
    const safe = x > 40 * CS && z < 8 * CS;
    const dead = !safe && rng.chance(0.05 + u * 0.28);
    pool.add({ pos: new THREE.Vector3(x, y - 0.05, z), color: 0xff9a40, flicker: !dead && rng.chance(0.06 + u * 0.3) ? rng.float(0.05, 0.25 + u * 0.2) : 0, dead, instance: n });
  });
  pool.mesh = lens;
  world.root.add(lens, housing);
  const tubes = [];
  const tubeAt = [[32 * CS, 18.5 * CS, 0, 0], [32 * CS, 22 * CS, P7, PI / 2], [8.5 * CS, 19.5 * CS, 0, 0], [26.8 * CS, 19.5 * CS, 0, 0], [31.5 * CS, 16.6 * CS, 0, 0], [31.5 * CS, 24.6 * CS, P7, 0]];
  for (const [x, z, y0, rot] of tubeAt) {
    const [i, j] = g.cellOf(x, z);
    const y = y0 + H - 0.06;
    const tb = new THREE.Group();
    kit.box(tb, 1.3, 0.05, 0.16, kit.std(0xdcdcd6, 0.5, 0.2), 0, 0.02, 0);
    const tubeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 2.0, 2.1) });
    keep(kit.cyl(tb, 0.018, 0.018, 1.2, tubeMat, 0, -0.025, 0, 0, 0, PI / 2, 8)).userData.noBake = true;
    kit.add(tb, x, z, rot, { y });
    const u = world.unease(i, j);
    const dead = rng.chance(0.03 + u * 0.15);
    const fx = pool.add({ pos: new THREE.Vector3(x, y - 0.1, z), color: 0xd8ecff, intensity: 5, flicker: !dead && rng.chance(0.3 + u * 0.3) ? rng.float(0.1, 0.3) : 0, dead });
    tubes.push({ mat: tubeMat, fx });
  }
  world.root.add(new THREE.HemisphereLight(0x6a5a48, 0x1a140c, 0.35));

  // ---- set dressing along the walls (the prop table follows unease) --------------
  decorate(world, kit, {
    density: { wall: 0.1, high: 0.07, floor: 0, clutter: 0.03, ceil: 0.03 },
    keepClear: (i, j) => blocked.has(K(i, j)) || room(i, j) || i >= 43 || (i >= 41 && j >= 17) || g.get(i, j) === HOLE,
    wall: [
      { p: P.extinguisher, w: 1.5 }, { p: hoseBox, w: 0.8 }, { p: P.modelProp('utility_box_01'), w: 1 },
      { p: Mdl.bin, w: 0.8 }, { p: tyreStack, w: 0.6, min: 0.2 }, { p: P.modelProp('trashbag', { jitter: 3 }), w: 0.8, min: 0.35 },
      { p: P.modelProp('cardboard_box_01', { jitter: 0.4 }), w: 0.3, min: 0.3 }, { p: P.modelProp('hand_truck'), w: 0.4, min: 0.4 },
    ],
    high: [
      { p: P.modelProp('security_camera_01', { place: 'high', collide: false }), w: 1.2, o: {} },
      { p: P.modelProp('power_box_01', { place: 'high', collide: false }), w: 0.4 }, { p: noIdling, w: 1.2 },
      { p: missingPoster, w: 0.8, min: 0.4 }, { p: P.wallVent, w: 0.6 },
    ],
    clutter: [
      { p: P.paperScatter, w: 1 }, { p: P.bottles, w: 0.8 }, { p: P.trafficCone, w: 0.6, min: 0.2 },
      { p: P.lostShoe, w: 0.5, min: 0.5 },
    ],
    ceil: [{ p: P.hangingWires, w: 1, min: 0.45 }],
  });
  kit.finish();

  Object.assign(lvl, { tubes });
}
