import { Grid, FLOOR, WALL, HOLE } from '../../core/grid.js';
import { CS, P6, P7, W, HH, PI, BAY_ROWS, LANES, CROSS, SEGS } from './constants.js';

/** Carves the decks, ramps, stairwell and back rooms, then lays out the bays and open shafts. */
export function layout(world) {
  const rng = world.rng;
  const g = (world.grid = new Grid(W, HH, CS, WALL));
  const K = (i, j) => j * W + i;

  // ---- layout ------------------------------------------------------------
  // P6 deck, and the entrance lane off its north-east corner
  g.fillRect(1, 1, 42, 16, FLOOR);
  g.fillRect(43, 2, 46, 4, FLOOR);
  g.fillRect(43, 5, 45, 5, FLOOR);
  // P7, one storey down
  g.fillRect(1, 24, 42, 33, FLOOR);
  g.heightRect(1, 24, 42, 33, P7);
  // two long car ramps down (3 m over seven bays)
  const carRamp = new Set();
  const rr = (P6 - P7) / 7;
  for (const c of [1, 21]) {
    for (let k = 0; k < 7; k++) {
      for (const i of [c, c + 1]) {
        g.set(i, 17 + k, FLOOR);
        g.setRamp(i, 17 + k, 3, P6 - (k + 1) * rr, rr);
        carRamp.add(K(i, 17 + k));
      }
    }
  }
  // and one up to P5, which is full
  for (let k = 0; k < 3; k++) {
    for (const i of [41, 42]) {
      g.set(i, 17 + k, FLOOR);
      g.setRamp(i, 17 + k, 2, k * 0.45, 0.45);
      carRamp.add(K(i, 17 + k));
    }
  }
  g.fillRect(41, 20, 42, 20, FLOOR);
  g.heightRect(41, 20, 42, 20, 1.35);
  // stairwell: a lobby on P6, two steep flights, a landing on P7
  g.set(31, 17, FLOOR);
  g.fillRect(31, 18, 32, 18, FLOOR);
  const stairs = [[31, 19], [31, 20]];
  g.set(31, 19, FLOOR);
  g.setRamp(31, 19, 3, -1.5, 1.5);
  g.set(31, 20, FLOOR);
  g.setRamp(31, 20, 3, P7, 1.5);
  g.fillRect(31, 21, 32, 23, FLOOR);
  g.heightRect(31, 21, 32, 23, P7);
  // the attendants' office and a machine room off the south lane
  g.set(8, 17, FLOOR);
  g.fillRect(6, 18, 10, 20, FLOOR);
  g.set(26, 17, FLOOR);
  g.fillRect(25, 18, 28, 20, FLOOR);

  const sp = { x: 46.3 * CS, z: 3.7 * CS };
  world.spawn = { x: sp.x, z: sp.z, yaw: PI / 2 };
  world.finalizeLayout();

  const isCarRamp = (i, j) => carRamp.has(K(i, j));
  const laneOf = (j) => LANES.find((l) => j === l || j === l + 1);
  const crossOf = (i) => CROSS.find((c) => i === c || i === c + 1);
  const room = (i, j) => (i >= 6 && i <= 10 && j >= 17 && j <= 20) || (i >= 25 && i <= 28 && j >= 17 && j <= 20) || (i >= 31 && i <= 32 && j >= 17 && j <= 23);
  const deckY = (i, j) => g.hgt[K(i, j)];

  // ---- bays ------------------------------------------------------------
  const bays = [];
  for (const row of BAY_ROWS) {
    let n = 1;
    for (const s of SEGS) {
      for (let i = s; i < s + 18; i++, n++) {
        const front = row.lane > 0 ? (row.j + 2) * CS : row.j * CS;
        bays.push({ i, row, n, x: (i + 0.5) * CS, z: (row.j + 1) * CS, front, y: deckY(i, row.j), u: world.unease(i, row.lane > 0 ? row.j + 1 : row.j) });
      }
    }
  }
  // open service shafts in the far bays, more the deeper you drift
  const d = world.distFromSpawn;
  const shafts = [];
  const shaftCands = rng.shuffle(bays.filter((b) => (b.i - (b.i >= 23 ? 23 : 3)) % 2 === 0 && d[K(b.i, b.row.j)] > world.maxDist * 0.55));
  for (const b of shaftCands) {
    if (shafts.length >= 1 + Math.min(3, world.depth)) break;
    if (shafts.some((s) => Math.abs(s.i - b.i) + Math.abs(s.row.j - b.row.j) < 8)) continue;
    shafts.push(b);
  }
  for (const b of shafts) {
    g.fillRect(b.i, b.row.j, b.i + 1, b.row.j + 1, HOLE);
    b.shaft = true;
    bays.find((o) => o.row === b.row && o.i === b.i + 1).shaft = true;
  }

  return { rng, g, K, carRamp, stairs, sp, isCarRamp, laneOf, crossOf, room, deckY, bays, d, shafts };
}
