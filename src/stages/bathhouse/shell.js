import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WALL, WATER, DOORWAY, VOID, HOLE, DIRS, PIT_DEPTH, SIDES, GeoBuilder, buildWallFaces, buildCellQuads, buildFloors, buildStairs } from '../../core/grid.js';
import { waterNormalMap } from '../../core/surfaces.js';
import { mesh } from '../common.js';
import { W, H, BAND, Y_RIM, BATH_CEIL, Z_GENKAN, Z_DRESS, Z_BATH, Z_GAP, Z_ALLEY, Z_TERR, outdoor } from './constants.js';
import { canvasTex } from './textures.js';

/** Walls, floors, risers, stairs and ceilings indoors; facades, bare walls and fences outdoors. */
export function shell(world, lvl) {
  const { g, N, K, zoneAt, isOpen, floorOf, ceilOf, interiorCell, lowTop, bathKind, wclass, bh } = lvl;
  const { tileFloor, basin, rimMat, tileWall, tileBand, upperBath, bathCeil, woodFloor, genkanFloor, plaster, wainscot, woodCeil, riserWood, street, paving, facade, facadeLow, backWall, fence, terrFloor, nightGlass } = lvl;

  // ---- shell: walls by zone
  const wall = (opts, mat) => {
    const geo = buildWallFaces(g, opts);
    if (geo.attributes.position.count) mesh(world, geo, mat);
  };
  const inZone = (z) => (c, i, j) => isOpen(c) && zoneAt(i, j) === z;
  // interior walls of rooms (low partitions and the bandai count as open so the wall runs behind them)
  const openInterior = (z) => (c, i, j) => zoneAt(i, j) === z && c !== WALL;
  for (const [z, band, lower, upper] of [[Z_GENKAN, 1.0, wainscot, plaster], [Z_DRESS, 1.1, wainscot, plaster]]) {
    wall({ solid: (c) => c === WALL, open: openInterior(z), y0: (i, j) => floorOf(i, j) - 0.02, y1: (i, j) => Math.min(ceilOf(i, j), floorOf(i, j) + band), uScale: 1.4, vScale: 1.4 }, lower);
    wall({ solid: (c) => c === WALL, open: openInterior(z), y0: (i, j) => floorOf(i, j) + band, y1: (i, j) => ceilOf(i, j), uScale: 2, vScale: 2 }, upper);
    // a dark trim rail where the wood panelling stops
    wall({ solid: (c) => c === WALL, open: inZone(z), y0: (i, j) => floorOf(i, j) + band - 0.02, y1: (i, j) => floorOf(i, j) + band + 0.05, inset: 0.012, uScale: 1, vScale: 1 }, riserWood);
  }
  wall({ solid: (c) => c === WALL, open: openInterior(Z_BATH), y0: (i, j) => floorOf(i, j) - 0.02, y1: (i, j) => Math.min(ceilOf(i, j), BAND), uScale: 1.6, vScale: 1.6 }, tileBand);
  wall({ solid: (c) => c === WALL, open: openInterior(Z_BATH), y0: (i, j) => BAND, y1: (i, j) => Math.min(ceilOf(i, j), 2.3), uScale: 1.6, vScale: 1.6 }, tileWall);
  wall({ solid: (c) => c === WALL, open: openInterior(Z_BATH), y0: () => 2.3, y1: (i, j) => ceilOf(i, j), uScale: 2, vScale: 2 }, upperBath);
  // low partitions and islands
  const lowNb = new Float32Array(N);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      let t = 0;
      for (const [dx, dy] of DIRS) if (g.inBounds(i + dx, j + dy)) t = Math.max(t, lowTop[K(i + dx, j + dy)]);
      lowNb[K(i, j)] = t;
    }
  }
  const lowSolid = (c, i, j) => c === VOID && lowTop[K(i, j)] > 0;
  wall({ solid: lowSolid, open: inZone(Z_BATH), y0: (i, j) => floorOf(i, j) - 0.02, y1: (i, j) => BAND, uScale: 1.6, vScale: 1.6 }, tileBand);
  wall({ solid: lowSolid, open: inZone(Z_BATH), y0: (i, j) => BAND, y1: (i, j) => lowNb[K(i, j)], uScale: 1.6, vScale: 1.6 }, tileWall);
  wall({ solid: lowSolid, open: inZone(Z_DRESS), y0: (i, j) => floorOf(i, j) - 0.02, y1: (i, j) => floorOf(i, j) + 1.1, uScale: 1.4, vScale: 1.4 }, wainscot);
  wall({ solid: lowSolid, open: inZone(Z_DRESS), y0: (i, j) => floorOf(i, j) + 1.1, y1: (i, j) => lowNb[K(i, j)], uScale: 2, vScale: 2 }, plaster);
  const capGeo = buildCellQuads(g, lowSolid, (i, j) => lowTop[K(i, j)] + 0.001, true, 1.6);
  mesh(world, capGeo, tileWall);

  // ---- floors, bath basins, risers, stairs
  const floorQ = (pred, uv, mat) => {
    const geo = buildFloors(g, (c, i, j) => c !== WALL && c !== VOID && c !== HOLE && pred(c, i, j), uv);
    if (geo.attributes.position.count) mesh(world, geo, mat);
  };
  floorQ((c, i, j) => zoneAt(i, j) === Z_GENKAN && c !== DOORWAY, 2, genkanFloor);
  floorQ((c, i, j) => zoneAt(i, j) === Z_GENKAN && c === DOORWAY, 2, genkanFloor);
  floorQ((c, i, j) => zoneAt(i, j) === Z_DRESS, 2, woodFloor);
  floorQ((c, i, j) => zoneAt(i, j) === Z_BATH && c !== WATER && Math.abs(floorOf(i, j) - Y_RIM) > 0.01, 1.4, tileFloor);
  floorQ((c, i, j) => zoneAt(i, j) === Z_BATH && c !== WATER && Math.abs(floorOf(i, j) - Y_RIM) <= 0.01, 1.5, rimMat);
  floorQ((c, i, j) => c === WATER && bathKind[K(i, j)] !== 3, 1.2, basin);
  floorQ((c, i, j) => zoneAt(i, j) === Z_ALLEY, 1.6, paving);
  floorQ((c, i, j) => zoneAt(i, j) === Z_GAP, 2, street);
  floorQ((c, i, j) => zoneAt(i, j) === Z_TERR && c !== WATER, 2.2, terrFloor);
  floorQ((c, i, j) => c === WATER && bathKind[K(i, j)] === 3, 2.2, terrFloor);
  const pits = buildCellQuads(g, (c) => c === HOLE, PIT_DEPTH, true, 2);
  if (pits.attributes.position.count) mesh(world, pits, new THREE.MeshBasicMaterial({ color: 0x041418 }));
  const stairGeos = buildStairs(g);
  if (stairGeos.length) mesh(world, mergeGeometries(stairGeos), street);
  // risers: material from the higher side
  const riserQ = new Map();
  const riserMat = (i, j) => {
    const z = zoneAt(i, j);
    if (z === Z_BATH) return g.get(i, j) === DOORWAY ? riserWood : tileWall;
    if (z === Z_DRESS) return riserWood;
    if (z === Z_TERR) return terrFloor;
    if (z === Z_GENKAN) return genkanFloor;
    return street;
  };
  const lowEnd = (i, j) => {
    const k = K(i, j);
    return g.ramp[k] ? g.heightOf(i, j) + Math.min(0, g.rise[k]) : null;
  };
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      if (!isOpen(g.get(i, j))) continue;
      for (const [dx, dy, s] of SIDES) {
        const oi = i + dx;
        const oj = j + dy;
        if (!g.inBounds(oi, oj) || !isOpen(g.get(oi, oj))) continue;
        const hi = lowEnd(i, j) ?? g.edgeHeight(i, j, dx, dy);
        const lo = lowEnd(oi, oj) ?? g.edgeHeight(oi, oj, -dx, -dy);
        if (hi <= lo + 0.02) continue;
        const lowC = g.get(oi, oj);
        const mat = (lowC === WATER || lowC === HOLE) && bathKind[K(oi, oj)] !== 3 ? basin : riserMat(i, j);
        if (!riserQ.has(mat)) riserQ.set(mat, new GeoBuilder());
        const sc = mat === riserWood ? 1 : 1.6;
        riserQ.get(mat).vface(i, j, s, 1, lo, hi, sc, sc);
      }
    }
  }
  for (const [mat, q] of riserQ) mesh(world, q.build(), mat);

  // ---- ceilings and the steps between them (the raised bath-hall roof has windows)
  const ceilPred = (z) => (c, i, j) => interiorCell(i, j) && zoneAt(i, j) === z;
  mesh(world, buildCellQuads(g, ceilPred(Z_GENKAN), (i, j) => ceilOf(i, j), false, 1), woodCeil);
  mesh(world, buildCellQuads(g, ceilPred(Z_DRESS), (i, j) => ceilOf(i, j), false, 1), woodCeil);
  mesh(world, buildCellQuads(g, ceilPred(Z_BATH), (i, j) => ceilOf(i, j), false, 2), bathCeil);
  const dropQ = new Map();
  const clerestory = new GeoBuilder();
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      if (!interiorCell(i, j)) continue;
      const a = ceilOf(i, j);
      for (const [dx, dy, s] of SIDES) {
        const oi = i + dx;
        const oj = j + dy;
        if (!g.inBounds(oi, oj) || !interiorCell(oi, oj)) continue;
        const b = ceilOf(oi, oj);
        if (b <= a + 1e-3) continue;
        const z = zoneAt(oi, oj);
        if (z === Z_BATH && zoneAt(i, j) === Z_BATH && a >= BATH_CEIL - 0.01) {
          clerestory.vface(i, j, s, 1, a, b, 1.2, 1.2);
          continue;
        }
        const mat = z === Z_BATH ? (a < 2.3 ? tileWall : upperBath) : plaster;
        if (!dropQ.has(mat)) dropQ.set(mat, new GeoBuilder());
        const q = dropQ.get(mat);
        if (z === Z_BATH && a < 2.3) {
          q.vface(i, j, s, 1, a, 2.3, 1.6, 1.6);
          if (!dropQ.has(upperBath)) dropQ.set(upperBath, new GeoBuilder());
          dropQ.get(upperBath).vface(i, j, s, 1, 2.3, b, 2, 2);
        } else {
          const sc = mat === plaster ? 2 : 1.6;
          q.vface(i, j, s, 1, a, b, sc, sc);
        }
      }
    }
  }
  for (const [mat, q] of dropQ) if (!q.empty) mesh(world, q.build(), mat);
  const windowTex = canvasTex('bath-clerestory', 256, 256, (c, w, h) => {
    c.fillStyle = '#0c1626';
    c.fillRect(0, 0, w, h);
    const gr = c.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(60,80,120,0.5)');
    gr.addColorStop(1, 'rgba(20,30,50,0)');
    c.fillStyle = gr;
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#d8dcd6';
    c.fillRect(0, 0, w, 14);
    c.fillRect(0, h - 14, w, 14);
    c.fillRect(0, 0, 10, h);
    c.fillRect(w / 2 - 5, 0, 10, h);
  }, { repeat: true });
  nightGlass.map = windowTex;
  nightGlass.emissiveMap = windowTex;
  if (!clerestory.empty) mesh(world, clerestory.build(), nightGlass);

  // ---- outdoor walls: facades on the alley, bare concrete in the passages, fences around the roof
  const outH = new Float32Array(N);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      if (!outdoor(zoneAt(i, j))) continue;
      let t = 0;
      for (const [dx, dy] of DIRS) if (g.inBounds(i + dx, j + dy) && wclass[K(i + dx, j + dy)] === 1) t = Math.max(t, bh[K(i + dx, j + dy)]);
      outH[K(i, j)] = t;
    }
  }
  const outOpen = (z) => (c, i, j) => zoneAt(i, j) === z;
  // doorways only get the wall above their lintel
  const facadeSolid = (c, i, j) => c === WALL && wclass[K(i, j)] === 1;
  const lintelSolid = (c, i, j) => c === DOORWAY && wclass[K(i, j)] === 1 && !outdoor(zoneAt(i, j));
  wall({ solid: facadeSolid, open: outOpen(Z_ALLEY), y0: (i, j) => floorOf(i, j) - 0.02, y1: (i, j) => floorOf(i, j) + 0.9, uScale: 1.4, vScale: 1.4 }, facadeLow);
  wall({ solid: facadeSolid, open: outOpen(Z_ALLEY), y0: (i, j) => floorOf(i, j) + 0.9, y1: (i, j) => outH[K(i, j)], uScale: 2, vScale: 2 }, facade);
  for (const z of [Z_GAP, Z_TERR]) wall({ solid: facadeSolid, open: outOpen(z), y0: (i, j) => floorOf(i, j) - 0.02, y1: (i, j) => outH[K(i, j)], uScale: 2, vScale: 2 }, backWall);
  wall({ solid: lintelSolid, open: outOpen(Z_ALLEY), y0: () => 2.3, y1: (i, j) => outH[K(i, j)], uScale: 2, vScale: 2 }, facade);
  wall({ solid: lintelSolid, open: outOpen(Z_GAP), y0: () => 2.1, y1: (i, j) => outH[K(i, j)], uScale: 2, vScale: 2 }, backWall);
  wall({ solid: (c, i, j) => c === WALL && wclass[K(i, j)] === 2, open: (c, i, j) => outdoor(zoneAt(i, j)), y0: (i, j) => floorOf(i, j) - 0.02, y1: (i, j) => Math.max(0, lowEnd(i, j) ?? floorOf(i, j)) + 2.3, uScale: 2, vScale: 2 }, fence);
}

/** Water surfaces, one material per kind of bath. */
export function water(world, lvl) {
  const { g, K, bathKind, isWet, surfOf, u } = lvl;

  // ---- water
  const nMap = waterNormalMap();
  const waterMats = {
    1: new THREE.MeshPhysicalMaterial({ color: 0x9fe0d6, transparent: true, opacity: 0.5 + u * 0.2, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.06, normalMap: nMap, normalScale: new THREE.Vector2(0.25, 0.25), depthWrite: false }),
    4: new THREE.MeshPhysicalMaterial({ color: 0xa8e8f0, transparent: true, opacity: 0.45, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.05, normalMap: nMap, normalScale: new THREE.Vector2(0.35, 0.35), depthWrite: false }),
    2: new THREE.MeshPhysicalMaterial({ color: 0xe8e090, transparent: true, opacity: 0.62, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.1, normalMap: nMap, normalScale: new THREE.Vector2(0.2, 0.2), depthWrite: false }),
    3: new THREE.MeshPhysicalMaterial({ color: 0x6a9a98, transparent: true, opacity: 0.72, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.05, normalMap: nMap, normalScale: new THREE.Vector2(0.3, 0.3), depthWrite: false }),
  };
  for (const kind of [1, 2, 3, 4]) {
    const geo = buildCellQuads(g, (c, i, j) => isWet(i, j) && bathKind[K(i, j)] === kind, surfOf, true, 3);
    if (!geo.attributes.position.count) continue;
    const wm = mesh(world, geo, waterMats[kind]);
    wm.renderOrder = 2;
    wm.userData.noBake = true;
  }

  Object.assign(lvl, { nMap });
}
