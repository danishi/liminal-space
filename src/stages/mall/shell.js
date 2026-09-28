import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WALL, VOID, HOLE, PIT_DEPTH, buildWallFaces, buildFloors, buildRisers, buildStairs, buildCellQuads } from '../../core/grid.js';
import { paint, pbr, ceilingTile } from '../../core/surfaces.js';
import { mesh } from '../common.js';
import { photo } from '../../core/assets.js';
import { Z } from './constants.js';

/** Walls, skirting, floors and ceilings per zone, then risers, stairs and the hole shafts. */
export function shell(world, lvl) {
  const { g, zones, ceilArr, K, escCells, holes } = lvl;
  // ---- materials -----------------------------------------------------------
  const offWhite = new THREE.Color(1.3, 1.26, 1.18);
  const tiles = pbr(ceilingTile(), { normalScale: 0.8, color: new THREE.Color(1.08, 1.08, 1.08) });
  const mats = {
    [Z.PUB]: {
      wall: { mat: photo('beige_wall_001', { uvScale: 3, color: offWhite }), u: 3, v: 3 },
      floor: { mat: photo('terrazzo_tiles', { uvScale: 2, roughness: 0.55, color: new THREE.Color(1.08, 1.04, 0.98) }), uv: 2 },
      ceil: { mat: pbr(paint('s-mall-ceil', [236, 232, 222], { rough: 0.8 })), uv: 3 },
      base: { mat: pbr(paint('s-mall-base', [96, 82, 70], { rough: 0.35 })), h: 0.12 },
    },
    [Z.SHOP]: {
      wall: { mat: pbr(paint('s-mall-shop', [228, 222, 210], { rough: 0.7 })), u: 2, v: 2 },
      floor: { mat: photo('old_wooden_floor_02', { uvScale: 2, color: 0xe0d0c0 }), uv: 2 },
      ceil: { mat: tiles, uv: 1.2 },
      base: { mat: pbr(paint('s-mall-shopbase', [60, 52, 46], { rough: 0.4 })), h: 0.1 },
    },
    [Z.SERV]: {
      wall: { mat: photo('concrete_wall_004', { uvScale: 2, color: new THREE.Color(1.25, 1.24, 1.18) }), u: 2, v: 2 },
      floor: { mat: photo('concrete_floor_02', { uvScale: 2, color: 0xb8b4aa }), uv: 2 },
      ceil: { mat: pbr(paint('s-mall-servceil', [170, 170, 164], { rough: 0.9 })), uv: 2 },
      base: { mat: pbr(paint('s-mall-servbase', [64, 70, 66], { rough: 0.5 })), h: 0.15 },
    },
    [Z.OFFICE]: {
      wall: { mat: pbr(paint('s-mall-office', [214, 206, 188], { rough: 0.75 })), u: 2, v: 2 },
      floor: { mat: photo('linoleum_brown', { uvScale: 2, color: 0xd8ccb8 }), uv: 2 },
      ceil: { mat: tiles, uv: 1.2 },
      base: { mat: pbr(paint('s-mall-officebase', [70, 58, 48], { rough: 0.4 })), h: 0.1 },
    },
    [Z.REST]: {
      wall: { mat: photo('square_tiled_wall', { uvScale: 2, roughness: 0.4, color: new THREE.Color(1.15, 1.12, 1.02) }), u: 2, v: 2 },
      floor: { mat: photo('terrazzo_tiles', { uvScale: 2, roughness: 0.55 }), uv: 2 },
      ceil: { mat: tiles, uv: 1.2 },
    },
  };
  mats[Z.REST].floor.mat = mats[Z.PUB].floor.mat;

  // ---- shell ---------------------------------------------------------------
  const ceilAt = (i, j) => ceilArr[K(i, j)];
  world.ceilAt = ceilAt;
  const zoneOf = (i, j) => zones[K(i, j)];
  const open = (c) => c !== WALL && c !== VOID;
  for (const [zk, s] of Object.entries(mats)) {
    const zi = +zk;
    const inZone = (c, i, j) => open(c) && zoneOf(i, j) === zi;
    mesh(world, buildWallFaces(g, { y0: (i, j) => g.heightOf(i, j) - 0.02, y1: ceilAt, uScale: s.wall.u, vScale: s.wall.v, open: inZone }), s.wall.mat);
    if (s.base) {
      mesh(world, buildWallFaces(g, {
        y0: (i, j) => g.heightOf(i, j), y1: (i, j) => g.heightOf(i, j) + s.base.h, uScale: 1, vScale: 1, inset: 0.012,
        open: (c, i, j) => inZone(c, i, j) && c !== HOLE && !g.ramp[K(i, j)],
      }), s.base.mat);
    }
    mesh(world, buildFloors(g, (c, i, j) => inZone(c, i, j) && c !== HOLE, s.floor.uv), s.floor.mat);
    mesh(world, buildCellQuads(g, inZone, ceilAt, false, s.ceil.uv), s.ceil.mat);
  }
  const wallPub = mats[Z.PUB].wall.mat;
  mesh(world, buildRisers(g, { pred: (c) => open(c) && c !== HOLE, uScale: 3, vScale: 3 }), wallPub);
  // the missing floor: a raw concrete shaft going down into the dark
  if (holes.length) {
    const rim = (i, j) => {
      let y = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (g.standable(i + dx, j + dy)) y = g.heightOf(i + dx, j + dy);
      return y;
    };
    mesh(world, buildWallFaces(g, { y0: PIT_DEPTH, y1: rim, uScale: 2, vScale: 2, solid: (c) => open(c) && c !== HOLE, open: (c) => c === HOLE }), new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 0.95 }));
  }
  mesh(world, buildRisers(g, { pred: open, ceil: ceilAt, uScale: 3, vScale: 3 }), wallPub);
  // stairs (the escalators get their own treads)
  const saved = g.ramp.slice();
  for (const k of escCells) g.ramp[k] = 0;
  const stairGeos = buildStairs(g);
  g.ramp.set(saved);
  if (stairGeos.length) mesh(world, mergeGeometries(stairGeos), mats[Z.PUB].floor.mat);
  if (holes.length) mesh(world, buildCellQuads(g, (c) => c === HOLE, PIT_DEPTH, true, 2), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  Object.assign(lvl, { ceilAt, zoneOf });
}
