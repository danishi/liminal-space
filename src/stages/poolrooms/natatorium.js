import * as THREE from 'three';
import { FLOOR, WALL, WATER, DOORWAY, HOLE, GeoBuilder, SIDES } from '../../core/grid.js';
import { photo } from '../../core/assets.js';
import { mesh } from '../common.js';
import * as P from '../../props/library.js';
import { WATER_Y, HALL_H } from './constants.js';
import { skylightTexture, deckLabel } from './textures.js';
import { startingBlock, poolLadder, backstrokeFlags, paceClock, laneRopes } from './props.js';
import { giantDuck, littleDuck } from './entities.js';

// The natatorium: a block of rooms beside the one you arrive in, merged into a
// tall skylit hall around a 25 m lap pool with a giant duck afloat in it.

const PI = Math.PI;
const LEN = 13; // pool length in cells (26 m)
const WID = 6; // pool width in cells: five 2.4 m lanes
const LANE = WID / 5;
// the pool floor from the shallow end: a wading shelf, then two steps down
// (each within a stride, so you can walk out the way you came)
const ZONES = [[2, -0.5, '0.4 m'], [6, -0.95, '0.8 m'], [LEN, -1.35, '1.2 m']];
const zoneOf = (k) => ZONES.find(([end]) => k < end);
const DEEP = ZONES[ZONES.length - 1][1];

const yawOf = ([dx, dz]) => Math.atan2(dx, dz);
const neg = ([dx, dz]) => [-dx, -dz];

/**
 * Picks the hall's rooms (3×2 or 2×3, touching the spawn room) and the pool's
 * place in it. Hall coordinates: a runs along the hall, b across it; pool
 * coordinates: k runs from the shallow end to the deep end, l across (cells).
 */
export function planHall(rng, rooms, spawn, { RX, RS, cs }) {
  const horiz = rng.chance(0.5);
  const [cw, ch] = horiz ? [3, 2] : [2, 3];
  const spots = [];
  for (let ry = 0; ry + ch <= RX; ry++) {
    for (let rx = 0; rx + cw <= RX; rx++) {
      const gx = Math.max(rx - spawn.rx, 0, spawn.rx - (rx + cw - 1));
      const gy = Math.max(ry - spawn.ry, 0, spawn.ry - (ry + ch - 1));
      if (gx + gy === 1) spots.push([rx, ry]);
    }
  }
  const [rx0, ry0] = rng.pick(spots);
  const members = new Set(rooms.filter((r) => r.rx >= rx0 && r.rx < rx0 + cw && r.ry >= ry0 && r.ry < ry0 + ch));
  const i0 = 1 + rx0 * (RS + 1);
  const j0 = 1 + ry0 * (RS + 1);
  const A = (horiz ? cw : ch) * (RS + 1) - 1;
  const B = (horiz ? ch : cw) * (RS + 1) - 1;
  const aStart = rng.pick([3, 4]);
  const bStart = rng.pick([3, 4]);
  const deepHigh = rng.chance(0.5);
  const cellAB = (a, b) => (horiz ? [i0 + a, j0 + b] : [i0 + b, j0 + a]);
  const at = (a, b) => (horiz ? { x: (i0 + a) * cs, z: (j0 + b) * cs } : { x: (i0 + b) * cs, z: (j0 + a) * cs });
  const s = deepHigh ? 1 : -1;
  const hall = {
    rooms: members,
    // the member room that shares a wall with the spawn room
    door: [...members].find((r) => Math.abs(r.rx - spawn.rx) + Math.abs(r.ry - spawn.ry) === 1),
    i0, j0, i1: i0 + (horiz ? A : B) - 1, j1: j0 + (horiz ? B : A) - 1, A, B, bStart, deepHigh,
    cellAB,
    at,
    // pool cell (k, l) and pool point (k, l)
    cell: (k, l) => cellAB(deepHigh ? aStart + k : aStart + LEN - 1 - k, bStart + l),
    pt: (k, l) => at(deepHigh ? aStart + k : aStart + LEN - k, bStart + l),
    along: horiz ? [s, 0] : [0, s], // shallow → deep
    across: horiz ? [0, 1] : [1, 0], // +l
    poolCells: new Set(),
    reserved: new Set(), // cells the prop scatter keeps clear
  };
  hall.contains = (i, j) => i >= hall.i0 && i <= hall.i1 && j >= hall.j0 && j <= hall.j1;
  hall.drain = hall.cell(LEN - 1, 2);
  return hall;
}

/** Opens up the hall and sinks the pool; `waterLevel` gets its surface per cell. */
export function carveHall(g, hall, waterLevel) {
  g.fillRect(hall.i0, hall.j0, hall.i1, hall.j1, FLOOR);
  for (let k = 0; k < LEN; k++) {
    for (let l = 0; l < WID; l++) {
      const [i, j] = hall.cell(k, l);
      g.set(i, j, WATER);
      g.setHeight(i, j, zoneOf(k)[1]);
      waterLevel[j * g.w + i] = WATER_Y;
      hall.poolCells.add(j * g.w + i);
    }
  }
  // keep floating clutter out of the duck and its ducklings
  for (let k = 6; k < LEN; k++) {
    for (let l = 1; l < WID - 1; l++) {
      const [i, j] = hall.cell(k, l);
      hall.reserved.add(j * g.w + i);
    }
  }
}

/**
 * Roof, pool fittings and deck furniture. Call after buildShell (and before
 * the prop scatter, which keeps clear of `hall.reserved`). Returns update(t).
 */
export function buildHall(world, kit, hall, murk) {
  const g = world.grid;
  const cs = g.cs;
  const { at, pt, along, across, A, B, bStart } = hall;
  const v3 = (p, y) => [p.x, y, p.z];
  const reserve = (p) => {
    const [i, j] = g.cellOf(p.x, p.z);
    hall.reserved.add(j * g.w + i);
  };
  const G = () => new THREE.Group();

  // ---- roof: steel trusses and frosted skylights over the water
  const beam = kit.std(0xdfe4e4, 0.55, 0.3);
  for (let a = 2; a < A; a += 2) {
    const tr = G();
    kit.box(tr, 0.22, 0.45, B * cs, beam, 0, -0.225, 0);
    const p = at(a, B / 2);
    kit.add(tr, p.x, p.z, yawOf(across), { y: HALL_H });
  }
  const sky = new THREE.MeshBasicMaterial({ map: skylightTexture(), color: new THREE.Color(1.25, 1.32, 1.36).lerp(new THREE.Color(0.5, 0.53, 0.55), murk), side: THREE.DoubleSide });
  const daylight = new THREE.Color(0.96, 1, 1.02).lerp(new THREE.Color(0.7, 0.74, 0.76), murk);
  const glass = new GeoBuilder();
  const frame = kit.std(0x6f7b80, 0.5, 0.4);
  const a0 = 1.5;
  const a1 = A - 1.5;
  for (const b of [B / 2 - 3, B / 2, B / 2 + 3]) {
    const c = [at(a0, b - 0.4), at(a1, b - 0.4), at(a1, b + 0.4), at(a0, b + 0.4)].map((p) => v3(p, HALL_H - 0.03));
    const n = a1 - a0; // one texture bay per 2 m cell
    glass.quad(c[0], c[1], c[2], c[3], [0, -1, 0], [0, 0], [0, n], [1, n], [1, 0]);
    for (const e of [-0.42, 0.42]) {
      const fr = G();
      kit.box(fr, 0.1, 0.12, (a1 - a0) * cs, frame, 0, -0.06, 0);
      const p = at((a0 + a1) / 2, b + e);
      kit.add(fr, p.x, p.z, yawOf(along), { y: HALL_H });
    }
    for (let a = 2; a <= A - 2; a += 2) {
      const p = at(a, b);
      world.bakeSources.push({ pos: new THREE.Vector3(p.x, 3.8, p.z), color: daylight, intensity: 22 * (1 - murk * 0.6), dir: new THREE.Vector3(0, -1, 0), range: 12 });
    }
  }
  const glassMesh = new THREE.Mesh(glass.build(), sky);
  world.root.add(glassMesh);
  // light off the water and the white tiles, up into the roof
  for (let a = 3; a < A; a += 4) {
    const p = at(a, B / 2);
    world.bakeSources.push({ pos: new THREE.Vector3(p.x, 6.8, p.z), color: daylight, intensity: 7 * (1 - murk * 0.6), range: 14 });
  }

  // ---- the pool: coping, waterline tiles, lane markings, ropes
  const c0 = pt(0, 0);
  const c1 = pt(LEN, WID);
  const x0 = Math.min(c0.x, c1.x);
  const x1 = Math.max(c0.x, c1.x);
  const z0 = Math.min(c0.z, c1.z);
  const z1 = Math.max(c0.z, c1.z);
  const coping = kit.std(0xe9e5d9, 0.6);
  const rim = G();
  // 0.3 m on the deck, overhanging the water by 6 cm
  for (const z of [z0 - 0.12, z1 + 0.12]) kit.box(rim, x1 - x0 + 0.6, 0.05, 0.36, coping, (x0 + x1) / 2, 0.025, z);
  for (const x of [x0 - 0.12, x1 + 0.12]) kit.box(rim, 0.36, 0.05, z1 - z0, coping, x, 0.025, (z0 + z1) / 2);
  kit.add(rim, 0, 0, 0);

  const band = new GeoBuilder();
  for (const key of hall.poolCells) {
    const i = key % g.w;
    const j = (key / g.w) | 0;
    for (const [dx, dy, side] of SIDES) {
      if (hall.poolCells.has((j + dy) * g.w + i + dx)) continue;
      band.vface(i + dx, j + dy, side ^ 1, cs, -0.36, -0.02, 2, 2, 0.008);
    }
  }
  mesh(world, band.build(), photo('long_white_tiles', { uvScale: 1, roughness: 0.3, color: new THREE.Color(0.24, 0.48, 0.82) }));

  // lane lines and wall targets, just proud of the tiles
  const lines = new GeoBuilder();
  const rect = (pts, n) => {
    const [a, b, , d] = pts;
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    lines.quadPts(cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] > 0 ? pts : [pts[0], pts[3], pts[2], pts[1]], 2);
  };
  const overHole = (k, l) => {
    const p = pt(k, l);
    return g.get(...g.cellOf(p.x, p.z)) === HOLE;
  };
  const flat = (k0, k1, l0, l1, y) => {
    const e = 0.01; // test just inside the corners, not on cell boundaries
    if (overHole(k0 + e, l0 + e) || overHole(k1 - e, l0 + e) || overHole(k1 - e, l1 - e) || overHole(k0 + e, l1 - e)) return;
    rect([pt(k0, l0), pt(k1, l0), pt(k1, l1), pt(k0, l1)].map((p) => v3(p, y + 0.004)), [0, 1, 0]);
  };
  const upright = (k, l0, l1, y0, y1, n) => rect([v3(pt(k, l0), y0), v3(pt(k, l1), y0), v3(pt(k, l1), y1), v3(pt(k, l0), y1)], n);
  const w = 0.0625; // half a line's width, in cells
  for (let n = 0; n < 5; n++) {
    const lc = (n + 0.5) * LANE;
    let k = 1;
    for (const [end, y] of ZONES) {
      const k1 = Math.min(end, LEN - 1);
      if (k < k1) flat(k, k1, lc - w, lc + w, y);
      if (end < LEN) upright(end + 0.004, lc - w, lc + w, zoneOf(end)[1], y, [along[0], 0, along[1]]);
      k = Math.max(k, end);
    }
    for (const kc of [1, LEN - 1]) flat(kc - w, kc + w, lc - 0.25, lc + 0.25, zoneOf(kc)[1]);
    // target on the deep end wall
    const back = [-along[0], 0, -along[1]];
    upright(LEN - 0.004, lc - w, lc + w, DEEP, -0.44, back);
    upright(LEN - 0.004, lc - 0.25, lc + 0.25, -0.74, -0.62, back);
  }
  mesh(world, lines.build(), kit.std(0x173a68, 0.5, 0, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));

  // two lane ropes; the middle two are gone (the duck needs the room)
  const rope = (l) => [pt(0, l), pt(LEN, l)].map((p) => new THREE.Vector3(p.x, WATER_Y, p.z));
  const ropes = laneRopes([rope(LANE), rope(4 * LANE)]);
  world.root.add(ropes);

  // ---- on the deck
  const flagYaw = Math.atan2(-across[1], across[0]); // local x across the pool
  for (const k of [2.5, LEN - 2.5]) {
    const p = pt(k, WID / 2);
    kit.add(backstrokeFlags(kit, (WID + 1) * cs), p.x, p.z, flagYaw);
    for (const l of [-0.5, WID + 0.5]) {
      const q = pt(k, l);
      world.addBox(q.x - 0.15, q.z - 0.15, q.x + 0.15, q.z + 0.15);
      reserve(q);
    }
  }
  for (let n = 0; n < 5; n++) {
    const p = pt(LEN + 0.15, (n + 0.5) * LANE);
    kit.add(startingBlock(kit, n + 1), p.x, p.z, yawOf(neg(along)), { collide: [0.5, 0.6] });
    reserve(p);
  }
  for (const [l, into] of [[0, across], [WID, neg(across)]]) {
    const p = pt(LEN - 0.8, l);
    kit.add(poolLadder(kit, -DEEP), p.x, p.z, yawOf(into));
    reserve(p);
  }
  const chair = pt(LEN / 2, -1.1);
  kit.add(P.lifeguardChair.build(kit, world.rng), chair.x, chair.z, yawOf(across), { collide: P.lifeguardChair.fp });
  reserve(chair);

  // depth markings on the deck, read facing the water
  const label = (text, color, p, toward) => {
    const m = kit.mat(`pool-deck:${text}`, () => new THREE.MeshStandardMaterial({ map: deckLabel(text, color), transparent: true, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    const lg = G();
    kit.plane(lg, 0.8, 0.3, m, 0, 0.004, 0, -PI / 2, 0, PI);
    kit.add(lg, p.x, p.z, yawOf(toward));
  };
  let kStart = 0;
  for (const [end, , text] of ZONES) {
    const k = (kStart + end) / 2;
    label(text, '#1d4f7a', pt(k, -0.35), across);
    label(text, '#1d4f7a', pt(k, WID + 0.35), neg(across));
    kStart = end;
  }
  label('NO DIVING', '#b8231f', pt(-0.35, WID / 2), along);

  // a pace clock high on the deep end wall, if there's wall to hang it on
  let clock = null;
  const aWall = hall.deepHigh ? A : -1;
  const bC = bStart + WID / 2;
  if ([bC - 1, bC].every((b) => [WALL, DOORWAY].includes(g.get(...hall.cellAB(aWall, b))))) {
    const pc = paceClock(kit);
    const p = at(hall.deepHigh ? A : 0, bC);
    kit.add(pc.g, p.x - along[0] * 0.06, p.z - along[1] * 0.06, yawOf(neg(along)), { y: 3.9 });
    const [i, j] = g.cellOf(p.x - along[0], p.z - along[1]);
    clock = { hand: pc.hand, q0: null, dir: world.unease(i, j) > 0.8 ? 1 : -1 };
  }

  const qz = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);
  return (t) => {
    ropes.position.y = Math.sin(t * 0.9) * 0.008;
    if (clock) {
      // one sweep a minute (backwards, where things are wrong)
      if (!clock.q0) clock.q0 = clock.hand.quaternion.clone();
      clock.hand.quaternion.copy(clock.q0).multiply(qz.setFromAxisAngle(zAxis, clock.dir * ((t / 60) % 1) * PI * 2));
    }
  };
}

/** The Giant Duck in the deep end, looking up the pool, with ducklings in its wake. */
export function hallResidents(world, hall) {
  const { pt, along } = hall;
  const p = pt(9, WID / 2);
  const yaw = yawOf(neg(along));
  world.add(giantDuck(world, new THREE.Vector3(p.x, WATER_Y - 0.45, p.z), yaw));
  for (let n = 0; n < 3; n++) {
    const q = pt(11.1 + n * 0.6, WID / 2 + (n % 2 ? 0.12 : -0.12));
    world.add(littleDuck(world, new THREE.Vector3(q.x, WATER_Y - 0.06, q.z), yaw, { spin: 0 }));
  }
}
