import { Grid, FLOOR, WALL, HOLE } from '../../core/grid.js';
import { PI, CS, W, HH, UP, ATRIUM, SHOP_H, PIT, FOOD, DOCK, Z, ESC } from './constants.js';

/** Carve the grid, set the spawn and pick the missing floor; returns the state later phases share. */
export function layout(world) {
  const rng = world.rng;
  const depth = world.depth;
  const g = (world.grid = new Grid(W, HH, CS, WALL));
  const zones = new Uint8Array(W * HH);
  const ceilArr = new Float32Array(W * HH).fill(ATRIUM);
  const K = (i, j) => j * W + i;
  const area = (i0, j0, i1, j1, zone, ceil, y = 0) => {
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        g.set(i, j, FLOOR);
        g.setHeight(i, j, y);
        zones[K(i, j)] = zone;
        ceilArr[K(i, j)] = ceil;
      }
    }
  };

  // ---- layout ------------------------------------------------------------
  area(4, 12, 51, 18, Z.PUB, ATRIUM); // lower concourse
  area(4, 10, 51, 11, Z.PUB, ATRIUM, UP); // upper concourse
  area(1, 14, 3, 16, Z.PUB, 4.2); // entrance vestibule
  area(21, 19, 27, 23, Z.PUB, ATRIUM); // fountain court
  area(41, 19, 51, 25, Z.PUB, ATRIUM); // food court
  // sunken fountain court, steps down on two sides
  for (let j = 16; j <= 20; j++) {
    for (let i = 23; i <= 25; i++) g.setHeight(i, j, PIT);
    g.setRamp(22, j, 1, PIT, -PIT);
    g.setRamp(26, j, 0, PIT, -PIT);
  }
  // food court seating pit
  for (let j = 21; j <= 23; j++) for (let i = 43; i <= 49; i++) g.setHeight(i, j, FOOD);
  for (let i = 43; i <= 49; i++) {
    g.setRamp(i, 20, 3, FOOD, -FOOD);
    g.setRamp(i, 24, 2, FOOD, -FOOD);
  }
  // stopped escalators up to the mezzanine
  const escCells = [];
  for (const i0 of ESC) {
    for (const i of [i0, i0 + 1]) {
      g.setRamp(i, 13, 3, 0, UP / 2);
      g.setRamp(i, 12, 3, UP / 2, UP / 2);
      escCells.push(K(i, 12), K(i, 13));
    }
  }
  // shops: 3 cells wide, 4 deep, one wall cell between neighbours
  const slotX = (k) => 5 + k * 4;
  const shops = [];
  for (const k of [0, 1, 2, 3, 6, 7, 8]) shops.push({ side: 'S', i0: slotX(k), open: k === 1 || (k !== 0 && rng.chance(0.55)) });
  for (let k = 0; k < 12; k++) if (k !== 6) shops.push({ side: 'N', i0: slotX(k), open: rng.chance(0.45) });
  for (const s of shops) {
    if (!s.open) continue;
    if (s.side === 'S') area(s.i0, 19, s.i0 + 2, 22, Z.SHOP, SHOP_H);
    else area(s.i0, 6, s.i0 + 2, 9, Z.SHOP, UP + SHOP_H, UP);
  }
  // back of house
  area(24, 24, 24, 26, Z.REST, 3.0); // restrooms corridor
  area(6, 27, 48, 27, Z.SERV, 2.9); // service corridor
  area(5, 24, 8, 26, Z.SERV, 2.9); // stockroom
  area(48, 26, 48, 26, Z.SERV, 2.9); // staff door from the food court
  area(30, 29, 36, 31, Z.SERV, DOCK + 4.2, DOCK); // loading dock
  area(33, 28, 33, 28, Z.SERV, 2.9);
  g.setRamp(33, 28, 3, DOCK, -DOCK);
  // upstairs: a corridor to the management office and nowhere in particular
  area(30, 4, 30, 9, Z.OFFICE, UP + 2.8, UP);
  area(18, 3, 46, 3, Z.OFFICE, UP + 2.8, UP);
  area(34, 1, 38, 2, Z.OFFICE, UP + 2.8, UP);

  const sp = g.center(3, 15);
  world.spawn = { x: sp.x, z: sp.z, yaw: -PI / 2 };
  world.finalizeLayout();
  const dist = world.distFromSpawn;

  // missing floor further out, more of it the deeper you are; each behind a wet-floor sign
  const escSet = new Set(escCells);
  const holeOk = (i, j) => {
    const k = K(i, j);
    if (g.get(i, j) !== FLOOR || g.ramp[k] || escSet.has(k) || zones[k] === Z.SHOP || g.countSolidNeighbors(i, j) === 2) return false;
    if (i === 30 && j >= 4) return false;
    // not where the islands, courts, desk and escalator landings go
    if (j >= 14 && j <= 17 && i <= 51) return false;
    if ((i >= 21 && i <= 27 && j >= 15 && j <= 23) || (i >= 41 && j >= 19 && j <= 25) || (i <= 8 && j >= 12 && j <= 18)) return false;
    if (ESC.some((e) => i >= e - 1 && i <= e + 2 && (j <= 11 || j === 14))) return false;
    const y = g.heightOf(i, j);
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!g.standable(i + di, j + dj)) continue;
        if (g.ramp[K(i + di, j + dj)] || Math.abs(g.heightOf(i + di, j + dj) - y) > 0.01) return false;
      }
    }
    return true;
  };
  const holes = world.pickFarCells(Math.min(8, 1 + depth * 2), { minFrac: 0.45, spacing: 7, filter: holeOk });
  for (const [i, j] of holes) g.set(i, j, HOLE);
  return { rng, depth, g, zones, ceilArr, K, escCells, slotX, shops, dist, escSet, holes };
}
