import { Grid, FLOOR, WALL, WATER, DOORWAY, VOID, HOLE } from '../../core/grid.js';
import { PI, MW, MD, NX, GAP, ALLEY, W, ROW_A, ALLEY0, ROW_B, H, Y_GENKAN, Y_WOOD, Y_BATH, Y_RIM, Y_BENCH, Y_DEEP, Y_SURF, Y_ALLEY, Y_TERR, TERR_POOL, BATH_CEIL, BATH_CEIL_HI, Z_GENKAN, Z_DRESS, Z_BATH, Z_GAP, Z_ALLEY, Z_TERR, outdoor, NAMES } from './constants.js';

/**
 * Carves the grid (two rows of bathhouses across an alley, the passages between
 * them, the roof terrace), spawns, finalizes the layout and works out how wrong
 * each bathhouse is. Returns `lvl`, the state later build phases share.
 */
export function layout(world) {
  const rng = world.rng;
  const g = (world.grid = new Grid(W, H, 1, WALL));
  const N = W * H;
  const zone = new Uint8Array(N);
  const modAt = new Int8Array(N).fill(-1);
  const lowTop = new Float32Array(N);
  const bathKind = new Uint8Array(N); // 1 hot, 2 herbal, 3 open-air
  const wclass = new Uint8Array(N); // outdoor wall faces: 1 building, 2 fence
  const bh = new Float32Array(N); // building height of wall cells
  const K = (i, j) => j * W + i;
  const zoneAt = (i, j) => (g.inBounds(i, j) ? zone[K(i, j)] : 0);

  // ---- bathhouses: two rows facing each other across the alley
  const mods = [];
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < NX; col++) {
      mods.push({ idx: mods.length, row, col, ox: col * (MW + GAP), oz: row ? ROW_B : ROW_A, rot: row === 0 });
    }
  }
  // local (cell) → world cell, and local metres → world metres
  const cellL = (m, li, lj) => (m.rot ? [m.ox + MW - 1 - li, m.oz + MD - 1 - lj] : [m.ox + li, m.oz + lj]);
  const at = (m, s, lx, lz, yaw = 0) => {
    if (s === 1) {
      lx = MW - lx;
      yaw = -yaw;
    }
    return m.rot ? { x: m.ox + MW - lx, z: m.oz + MD - lz, yaw: yaw + PI } : { x: m.ox + lx, z: m.oz + lz, yaw };
  };

  for (const m of mods) {
    const set = (li, lj, type, h, z) => {
      const [i, j] = cellL(m, li, lj);
      g.set(i, j, type);
      g.setHeight(i, j, h);
      const k = K(i, j);
      zone[k] = z;
      modAt[k] = m.idx;
    };
    for (let lj = 1; lj <= 3; lj++) for (let li = 4; li <= 12; li++) set(li, lj, FLOOR, Y_GENKAN, Z_GENKAN);
    for (let li = 7; li <= 9; li++) set(li, 0, DOORWAY, Y_GENKAN, Z_GENKAN);
    for (const s of [0, 1]) {
      const L = (li) => (s ? MW - 1 - li : li);
      for (const li of [5, 6]) set(L(li), 4, DOORWAY, Y_WOOD, Z_DRESS, s);
      for (const li of [3, 4]) set(L(li), 13, DOORWAY, Y_WOOD, Z_DRESS, s);
      for (let lj = 5; lj <= 12; lj++) for (let li = 1; li <= 7; li++) set(L(li), lj, FLOOR, Y_WOOD, Z_DRESS, s);
      for (let lj = 14; lj <= 25; lj++) for (let li = 1; li <= 7; li++) set(L(li), lj, FLOOR, Y_BATH, Z_BATH, s);
      for (let lj = 16; lj <= 19; lj++) {
        set(L(4), lj, VOID, Y_BATH, Z_BATH, s);
        lowTop[K(...cellL(m, L(4), lj))] = 1.85;
      }
      for (let li = 1; li <= 7; li++) set(L(li), 20, FLOOR, Y_RIM, Z_BATH, s);
      for (let lj = 21; lj <= 25; lj++) {
        for (let li = 1; li <= 7; li++) {
          if (li === 5) {
            set(L(li), lj, FLOOR, Y_RIM, Z_BATH, s);
            continue;
          }
          set(L(li), lj, WATER, lj === 21 ? Y_BENCH : Y_DEEP, Z_BATH, s);
          bathKind[K(...cellL(m, L(li), lj))] = li < 5 ? 1 : s ? 4 : 2;
        }
      }
    }
    // bandai booth between the changing rooms, and the low partition walls
    for (let li = 7; li <= 9; li++) for (let lj = 5; lj <= 6; lj++) set(li, lj, VOID, Y_WOOD, Z_DRESS);
    for (let lj = 7; lj <= 12; lj++) {
      set(8, lj, VOID, Y_WOOD, Z_DRESS);
      lowTop[K(...cellL(m, 8, lj))] = Y_WOOD + 2.1;
    }
    for (let lj = 14; lj <= 25; lj++) {
      set(8, lj, VOID, Y_BATH, Z_BATH);
      lowTop[K(...cellL(m, 8, lj))] = 2.2;
    }
    // building heights: the bath hall rises behind the lower front
    for (let lj = 0; lj < MD; lj++) {
      for (let li = 0; li < MW; li++) {
        const [i, j] = cellL(m, li, lj);
        const k = K(i, j);
        if (modAt[k] < 0) modAt[k] = m.idx;
        if (g.get(i, j) === WALL || g.get(i, j) === DOORWAY) {
          wclass[k] = 1;
          bh[k] = lj >= 13 ? 7.2 : 4.8;
        }
      }
    }
  }

  // ---- outdoor: the alley, the passages between bathhouses, the roof terrace
  for (let j = ALLEY0; j < ALLEY0 + ALLEY; j++) {
    for (let i = 1; i < W - 1; i++) {
      g.set(i, j, FLOOR);
      g.setHeight(i, j, Y_ALLEY);
      zone[K(i, j)] = Z_ALLEY;
    }
  }
  const gapCols = [];
  for (let c = 0; c < NX - 1; c++) gapCols.push(c * (MW + GAP) + MW);
  for (const c0 of gapCols) {
    for (let i = c0; i < c0 + GAP; i++) {
      for (let j = ROW_A; j < ALLEY0; j++) {
        g.set(i, j, FLOOR);
        zone[K(i, j)] = Z_GAP;
        // stairs up to the roof terrace at the far end
        if (j === ROW_A) g.setHeight(i, j, Y_TERR);
        else if (j <= ROW_A + 5) g.setRamp(i, j, 3, Y_TERR - (j - ROW_A) * (Y_TERR / 5), Y_TERR / 5);
      }
      for (let j = ROW_B; j < H - 1; j++) {
        g.set(i, j, FLOOR);
        zone[K(i, j)] = Z_GAP;
      }
    }
  }
  const T0 = gapCols[0] - 2;
  const T1 = gapCols[gapCols.length - 1] + GAP + 1;
  for (let j = 1; j < ROW_A; j++) {
    for (let i = T0; i <= T1; i++) {
      g.set(i, j, FLOOR);
      g.setHeight(i, j, Y_TERR);
      zone[K(i, j)] = Z_TERR;
    }
  }
  // the open-air bath: a rounded pool in the middle of the terrace
  const rcx = (T0 + T1 + 1) / 2;
  const rcz = 4.6;
  for (let j = 2; j <= 7; j++) {
    for (let i = T0 + 3; i <= T1 - 3; i++) {
      const dx = (i + 0.5 - rcx) / 7.5;
      const dz = (j + 0.5 - rcz) / 2.9;
      if (dx * dx + dz * dz > 1) continue;
      g.set(i, j, WATER);
      g.setHeight(i, j, Y_TERR + TERR_POOL);
      bathKind[K(i, j)] = 3;
    }
  }
  // border walls of the outdoor areas are fences; the alley ends are buildings
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const k = K(i, j);
      if (g.get(i, j) !== WALL || wclass[k]) continue;
      const nearAlley = j >= ALLEY0 && j < ALLEY0 + ALLEY;
      wclass[k] = nearAlley ? 1 : 2;
      bh[k] = nearAlley ? 4.8 : 0;
    }
  }
  // side doors from the genkan and bath halls into the passages
  for (const m of mods) {
    for (const [li, lj, out] of [[0, 16, -1], [16, 16, 17]]) {
      const [i, j] = cellL(m, li, lj);
      const [oi, oj] = cellL(m, out, lj);
      if (zoneAt(oi, oj) !== Z_GAP) continue;
      g.set(i, j, DOORWAY);
      g.setHeight(i, j, 0);
      zone[K(i, j)] = lj < 5 ? Z_GENKAN : Z_BATH;
      if (!m.doors) m.doors = [];
      m.doors.push({ li, lj, i, j });
    }
  }

  const spawnMod = mods[1];
  const sp = at(spawnMod, 0, 8.5, 1.7);
  world.spawn = { x: sp.x, z: sp.z, yaw: sp.yaw + PI };
  world.finalizeLayout();

  // how wrong each bathhouse is, from how far it is from where you came in
  for (const m of mods) {
    const [i, j] = cellL(m, 8, 2);
    m.u = world.unease(i, j);
    m.name = m === spawnMod ? NAMES[0] : NAMES[Math.min(NAMES.length - 1, Math.floor(m.u * 5 + rng.float(0, 1.5)))];
    m.variant = m.u < 0.3 ? 'classic' : m.u < 0.5 ? rng.pick(['classic', 'two']) : m.u < 0.7 ? rng.pick(['two', 'flood']) : m.u < 0.9 ? rng.pick(['flood', 'upside']) : rng.pick(['upside', 'figure']);
    if (m === spawnMod) m.variant = 'classic';
  }
  // deep ends: some baths go down further than the building does
  const deep = new Set();
  for (const m of mods) {
    for (const s of [0, 1]) {
      if (m === spawnMod || !rng.chance(0.15 + world.depth * 0.12 + m.u * 0.3)) continue;
      const L = (li) => (s ? MW - 1 - li : li);
      for (const li of [2, 3]) {
        const [i, j] = cellL(m, L(li), 25);
        g.set(i, j, HOLE);
        deep.add(K(i, j));
      }
    }
  }
  if (world.depth >= 1 && rng.chance(0.3 + world.depth * 0.15)) {
    const i = Math.floor(rcx);
    const j = 4;
    if (g.get(i, j) === WATER) {
      g.set(i, j, HOLE);
      deep.add(K(i, j));
    }
  }

  // ---- heights of things
  const floorOf = (i, j) => g.heightOf(i, j);
  const isOpen = (c) => c !== WALL && c !== VOID;
  const interiorCell = (i, j) => {
    const z = zoneAt(i, j);
    const c = g.get(i, j);
    return z > 0 && !outdoor(z) && c !== WALL;
  };
  const ceilOf = (i, j) => {
    const k = K(i, j);
    const z = zone[k];
    const c = g.cells[k];
    if (outdoor(z)) return 40;
    if (c === DOORWAY) {
      const lj = (() => {
        const m = mods[modAt[k]];
        return m ? (m.rot ? m.oz + MD - 1 - j : j - m.oz) : 0;
      })();
      if (lj === 0) return 2.3;
      if (lj === 2 || lj === 16) return 2.1;
      return Y_WOOD + 2.0;
    }
    if (z === Z_GENKAN) return 3.0;
    if (z === Z_DRESS) return 3.5;
    if (z === Z_BATH) {
      const m = mods[modAt[k]];
      const li = m.rot ? m.ox + MW - 1 - i : i - m.ox;
      return li >= 5 && li <= 11 ? BATH_CEIL_HI : BATH_CEIL;
    }
    return 3;
  };
  world.ceilAt = (i, j) => (g.inBounds(i, j) ? ceilOf(i, j) : 3);
  const isWet = (i, j) => bathKind[K(i, j)] && (g.get(i, j) === WATER || deep.has(K(i, j)));
  const surfOf = (i, j) => (bathKind[K(i, j)] === 3 ? Y_TERR - 0.1 : Y_SURF);

  return { rng, g, N, zone, modAt, lowTop, bathKind, wclass, bh, K, zoneAt, mods, cellL, at, gapCols, T0, T1, rcx, rcz, spawnMod, deep, floorOf, isOpen, interiorCell, ceilOf, isWet, surfOf };
}
