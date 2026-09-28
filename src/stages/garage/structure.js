import * as THREE from 'three';
import { WALL, HOLE, VOID, buildCellQuads, buildRisers } from '../../core/grid.js';
import { pbr, paint } from '../../core/surfaces.js';
import { mesh, buildShell } from '../common.js';
import { PropKit } from '../../props/kit.js';
import { photo } from '../../core/assets.js';
import { CS, H, P6, P7, W, PI, BAY_ROWS, LANES, CROSS, SEGS } from './constants.js';
import { lineTex, hazardTex, arrowTex, floorText, oilTex, trackTex, numAtlas, numUV, zoneAtlas, zoneUV } from './textures.js';
import { mBox, flatGeo, wallGeo, pipeGeo, slopeGeos, curbGeo, stairGeo } from './geometry.js';
import { missingPoster } from './props.js';

/** The concrete shell, the prop kit and its materials, pillars, beams, services and floor paint. */
export function structure(world, lvl) {
  const { rng, g, K, carRamp, stairs, isCarRamp, deckY, bays } = lvl;

  // ---- shell --------------------------------------------------------------
  const ceilAt = (i, j) => {
    const k = K(i, j);
    return g.hgt[k] + (g.ramp[k] ? Math.max(0, g.rise[k]) : 0) + H;
  };
  const wallMat = photo('concrete_wall_004', { uvScale: 2, color: 0xb4ada2 });
  const ceilMat = photo('concrete_wall_004', { uvScale: 2, color: 0x8c877e, normalScale: 0.7 });
  const floorMat = photo('garage_floor', { uvScale: 2, color: 0xa29c92, roughness: 0.9 });
  const stripe = (key, rgb) => pbr(paint(key, rgb, { rough: 0.55, grain: 0.1 }));
  buildShell(world, {
    height: H,
    ceil: ceilAt,
    wall: { mat: wallMat, u: 2, v: 2 },
    trims: [
      { mat: stripe('s-garage-skirt', [44, 46, 48]), y0: 0, y1: 0.12, inset: 0.012 },
      { mat: stripe('s-garage-band', [214, 132, 38]), y0: 1.0, y1: 1.28, inset: 0.012 },
    ],
  });
  world.ceilAt = ceilAt;
  const solidish = (c) => c === WALL || c === VOID;
  mesh(world, buildCellQuads(g, (c) => !solidish(c) && c !== HOLE, (i, j) => g.hgt[K(i, j)], true, 2), floorMat);
  const risers = buildRisers(g, { pred: (c) => !solidish(c), uScale: 2, vScale: 2 });
  if (risers.attributes.position.count) mesh(world, risers, wallMat);
  const rampCells = [...carRamp].map((k) => [k % W, (k / W) | 0]);
  const [slopeF, slopeC] = slopeGeos(g, rampCells, 2);
  mesh(world, slopeF, floorMat);
  mesh(world, slopeC, ceilMat);
  mesh(world, curbGeo(g, rampCells), new THREE.MeshStandardMaterial({ map: hazardTex(), roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -1 }));
  mesh(world, stairGeo(g, stairs), photo('concrete_wall_004', { uvScale: 1.5, color: 0x9c968c }));
  mesh(world, buildCellQuads(g, (c, i, j) => !solidish(c) && !isCarRamp(i, j), ceilAt, false, 2), ceilMat);
  const drops = buildRisers(g, { pred: (c, i, j) => !solidish(c) && !isCarRamp(i, j), ceil: ceilAt, uScale: 2, vScale: 2 });
  if (drops.attributes.position.count) mesh(world, drops, ceilMat);

  const kit = new PropKit(world);
  const M = {
    concrete: kit.mat('concrete', () => photo('concrete_wall_004', { uvScale: 2, color: 0xa8a298 })),
    beam: kit.mat('beam', () => photo('concrete_wall_004', { uvScale: 2, color: 0x8f8a80 })),
    hazard: kit.mat('hazard', () => new THREE.MeshStandardMaterial({ map: hazardTex(), roughness: 0.7 })),
    line: kit.mat('line', () => new THREE.MeshStandardMaterial({ map: lineTex(), alphaTest: 0.4, color: 0xdedbd2, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })),
    yline: kit.mat('yline', () => new THREE.MeshStandardMaterial({ map: lineTex(), alphaTest: 0.4, color: 0xd8a820, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })),
    nums: kit.mat('nums', () => new THREE.MeshStandardMaterial({ map: numAtlas(), alphaTest: 0.4, color: 0xdedbd2, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })),
    arrow: kit.mat('arrow', () => new THREE.MeshStandardMaterial({ map: arrowTex(), alphaTest: 0.4, color: 0xdedbd2, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })),
    oil: kit.mat('oil', () => new THREE.MeshStandardMaterial({ map: oilTex(), transparent: true, depthWrite: false, roughness: 0.12, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })),
    track: kit.mat('track', () => new THREE.MeshStandardMaterial({ map: trackTex(), transparent: true, opacity: 0.4, depthWrite: false, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })),
    zone: kit.mat('zone', () => new THREE.MeshStandardMaterial({ map: zoneAtlas(), roughness: 0.65 })),
    stop: kit.std(0x8a857c, 0.9),
    stopY: kit.std(0xc8a020, 0.7),
    red: kit.std(0x8e1a14, 0.45, 0.2),
    grey: kit.std(0x6e7072, 0.5, 0.35),
    yellow: kit.std(0xc4a024, 0.5, 0.2),
    duct: kit.std(0xa2a7ac, 0.42, 0.85),
    steel: kit.std(0x505458, 0.45, 0.7),
    dark: kit.std(0x2a2c2e, 0.6, 0.3),
  };
  const floorPaint = (text, color = '#fff') => kit.mat(`ft:${text}:${color}`, () => new THREE.MeshStandardMaterial({ map: floorText(text, color), alphaTest: 0.4, roughness: 0.6, color: 0xdedbd2, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const decals = new THREE.Group();

  // ---- pillars, beams, services -------------------------------------------
  const pillarX = [];
  for (const s of SEGS) for (let k = 0; k <= 6; k++) pillarX.push(s + 3 * k);
  for (const row of BAY_ROWS) {
    const front = row.lane > 0 ? (row.j + 2) * CS : row.j * CS;
    const z = front - row.lane * 0.45;
    for (const i of pillarX) {
      const y = deckY(i, row.j);
      if (g.get(i, row.j) === HOLE || g.get(i - 1, row.j) === HOLE) continue;
      const p = new THREE.Group();
      const off = [rng.float(0, 5), rng.float(0, 5)];
      kit.mesh(p, mBox(0.6, H, 0.6, { segs: [1, 6, 1], off }), M.concrete, 0, H / 2, 0);
      kit.mesh(p, mBox(0.62, 0.9, 0.62, { s: 0.7 }), M.hazard, 0, 0.45, 0);
      for (let s = 0; s < 4; s++) {
        const a = (s * PI) / 2;
        kit.mesh(p, wallGeo(0.46, 0.575, zoneUV(row.zone)), M.zone, Math.sin(a) * 0.311, 1.72, Math.cos(a) * 0.311, 0, a, 0);
      }
      kit.add(p, i * CS, z, 0, { y, collide: [0.62, 0.62] });
      // the odd poster taped to a pillar
      if (rng.chance(0.08)) {
        const u = world.unease(i, row.j);
        const post = missingPoster.build(kit, rng, { mood: u });
        const a = rng.pick([0, PI / 2, PI, -PI / 2]);
        kit.add(post, i * CS + Math.sin(a) * 0.3, z + Math.cos(a) * 0.3, a, { y: y + 1.2 });
      }
    }
  }
  // downstand beams and services under each deck's slab
  for (const [z0, z1, y] of [[1 * CS, 17 * CS, P6], [24 * CS, 34 * CS, P7]]) {
    const len = z1 - z0;
    for (const i of pillarX) kit.mesh(decals, mBox(0.5, 0.5, len, { segs: [1, 1, Math.ceil(len / 1.2)] }), M.beam, i * CS, y + H - 0.25, (z0 + z1) / 2);
    for (const row of BAY_ROWS) {
      if (deckY(3, row.j) !== y) continue;
      const front = row.lane > 0 ? (row.j + 2) * CS : row.j * CS;
      const xl = 42 * CS;
      kit.mesh(decals, mBox(xl, 0.4, 0.4, { segs: [Math.ceil(xl / 1.2), 1, 1] }), M.beam, 1 * CS + xl / 2, y + H - 0.2, front - row.lane * 0.45);
    }
    // pipes along the lanes: sprinkler main (red), drain (grey), gas (yellow)
    for (const L of LANES) {
      if (deckY(3, L) !== y) continue;
      const zc = (L + 1) * CS;
      const x0 = 1 * CS + 0.2;
      const len = 42 * CS - 0.4;
      // (they run through the downstand beams, as they do)
      kit.mesh(decals, pipeGeo(0.055, len), M.red, x0 + len / 2, y + H - 0.2, zc - 1.9);
      kit.mesh(decals, pipeGeo(0.08, len), M.grey, x0 + len / 2, y + H - 0.24, zc + 2.1);
      kit.mesh(decals, pipeGeo(0.03, len), M.yellow, x0 + len / 2, y + H - 0.12, zc + 2.35);
      for (let x = x0 + 1; x < x0 + len; x += 3) {
        kit.cyl(decals, 0.01, 0.01, 0.16, M.steel, x, y + H - 0.08, zc - 1.9, 0, 0, 0, 5);
        kit.cyl(decals, 0.014, 0.02, 0.07, M.red, x + 1.5, y + H - 0.28, zc - 1.9, 0, 0, 0, 6);
      }
    }
    // a big ventilation duct over each back-to-back double row
    for (const jb of y === P6 ? [7, 13] : [28]) {
      const zc = jb * CS;
      const x0 = 3 * CS;
      const len = 38 * CS;
      kit.mesh(decals, mBox(len, 0.4, 0.9, { segs: [Math.ceil(len / 1.2), 1, 1] }), M.duct, x0 + len / 2, y + H - 0.72, zc);
      for (let x = x0 + 2; x < x0 + len; x += 6) kit.box(decals, 0.4, 0.05, 0.5, M.dark, x, y + H - 0.94, zc);
    }
  }

  // ---- floor markings ---------------------------------------------------------
  for (const row of BAY_ROWS) {
    const y = deckY(3, row.j) + 0.004;
    const zc = (row.j + 1) * CS;
    for (const s of SEGS) {
      for (let i = s; i <= s + 18; i++) {
        if (g.get(i, row.j) === HOLE && g.get(i - 1, row.j) === HOLE) continue;
        kit.mesh(decals, flatGeo(0.12, 2 * CS - 0.3, null, 1, 8), M.line, i * CS, y, zc - row.lane * 0.1);
      }
    }
  }
  for (const b of bays) {
    if (b.shaft) continue;
    const yaw = b.row.lane > 0 ? 0 : PI;
    kit.mesh(decals, flatGeo(1.0, 0.5, numUV(b.row.zone, b.n), 2, 1), M.nums, b.x, b.y + 0.005, b.front - b.row.lane * 0.55, 0, yaw, 0);
    // wheel stops
    const back = b.front - b.row.lane * 2 * CS;
    kit.mesh(decals, mBox(1.5, 0.12, 0.16, { s: 1 }), rng.chance(0.3) ? M.stopY : M.stop, b.x, b.y + 0.06, back + b.row.lane * 0.65);
    if (rng.chance(0.7)) {
      const v = rng.int(0, 2);
      const sz = rng.float(0.9, 1.7);
      kit.mesh(decals, flatGeo(sz, sz * rng.float(0.7, 1.2), [v / 3, 0, (v + 1) / 3, 1], 2, 2), M.oil, b.x + rng.float(-0.4, 0.4), b.y + 0.003, b.z + rng.float(-1.2, 1.2), 0, rng.float(0, PI * 2), 0);
    }
  }
  // lanes: worn wheel tracks and one-way arrows
  const laneDir = { 3: -1, 9: 1, 15: -1, 24: 1, 30: -1 };
  for (const L of LANES) {
    const y = deckY(3, L) + 0.002;
    const zc = (L + 1) * CS;
    for (const off of [-0.8, 0.8]) kit.mesh(decals, flatGeo(42 * CS, 0.6, [0, 0, 42, 1], 60, 1), M.track, 22 * CS, y, zc + off);
    for (let x = 6; x < 42; x += 7) kit.mesh(decals, flatGeo(0.9, 2.2, null, 1, 3), M.arrow, (x + 0.5) * CS, y + 0.002, zc, 0, laneDir[L] > 0 ? -PI / 2 : PI / 2, 0);
  }
  for (const c of CROSS) {
    const xc = (c + 1) * CS;
    for (const [j0, j1] of [[1, 16], [24, 33]]) {
      for (let j = j0 + 2; j < j1; j += 6) kit.mesh(decals, flatGeo(0.9, 2.2, null, 1, 3), M.arrow, xc, deckY(c, j) + 0.004, (j + 0.5) * CS, 0, c === 41 ? 0 : PI, 0);
    }
  }
  // SLOW at the ramp heads, a stop line before the barrier
  for (const c of [1, 21]) {
    kit.mesh(decals, flatGeo(2.4, 1.2, null, 2, 1), floorPaint('SLOW'), (c + 1) * CS, 0.006, 15.6 * CS, 0, PI, 0);
    kit.mesh(decals, flatGeo(2.4, 1.2, null, 2, 1), floorPaint('P7', '#f0c030'), (c + 1) * CS, P7 + 0.006, 25.2 * CS, 0, PI, 0);
  }
  kit.mesh(decals, flatGeo(2.4, 1.2, null, 2, 1), floorPaint('P5'), 42 * CS, 0.006, 15.6 * CS, 0, PI, 0);
  kit.mesh(decals, flatGeo(0.3, 2 * CS, null, 1, 4), M.line, 42.7 * CS, 0.005, 4 * CS);
  kit.mesh(decals, flatGeo(2.2, 1.1, null, 2, 1), floorPaint('STOP'), 43.9 * CS, 0.006, 3.5 * CS, 0, PI / 2, 0);
  // yellow hatching in front of the service doors
  for (const [i, j] of [[8, 16], [26, 16], [31, 16]]) {
    for (let k = -3; k <= 3; k++) kit.mesh(decals, flatGeo(0.1, 1.9, null, 1, 2), M.yline, (i + 0.5) * CS + k * 0.35, 0.005, (j + 0.55) * CS, 0, PI / 4, 0);
  }
  kit.add(decals, 0, 0, 0);

  Object.assign(lvl, { kit, M, decals });
}
