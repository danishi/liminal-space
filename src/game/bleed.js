import * as THREE from 'three';
import { buildWallFaces, buildCellQuads, WALL, VOID, HOLE, WATER } from '../core/grid.js';
import { noise3 } from '../core/sculpt.js';
import { decorate } from '../stages/common.js';
import { PropKit } from '../props/kit.js';
import { pbr, paint } from '../core/surfaces.js';

// Crossed signals. The deeper you drift, the more likely a level is to have
// a patch of another level you passed through bleeding into it: its walls,
// floor and ceiling show through in corrupted blocks, its props turn up, a
// resident wanders in looking confused, and its ambience leaks over this one.
// Stages describe what bleeds with an optional `bleed` block:
//   { ambience, surfaces() → { wall, floor, ceil? }, props: decorate spec, stray(world, pos) → entity }

/** Which earlier levels (indices) bleed into the next one, if any. */
export function pickBleed(history, next, depth, rng = Math.random) {
  if (depth < 1) return [];
  const chance = Math.min(0.75, 0.1 + depth * 0.13);
  if (rng() > chance) return [];
  const seen = [...new Set(history)].filter((i) => i !== next);
  if (!seen.length) return [];
  // recent levels bleed more readily
  const recent = seen.slice(-4);
  const out = [recent[Math.floor(rng() * recent.length)]];
  if (depth >= 5 && recent.length > 1 && rng() < 0.4) {
    const other = recent.filter((i) => i !== out[0]);
    out.push(other[Math.floor(rng() * other.length)]);
  }
  return out;
}

/** An irregular blob of cells around (ci, cj), grown over walkable floor. */
function growZone(g, ci, cj, radius, seed) {
  const W = g.w;
  const dist = new Int16Array(W * g.h).fill(-1);
  const zone = new Uint8Array(W * g.h);
  const q = [[ci, cj]];
  dist[cj * W + ci] = 0;
  while (q.length) {
    const [i, j] = q.shift();
    const d = dist[j * W + i];
    const n = noise3(i * 0.35 + seed, j * 0.35, seed * 0.7);
    if (d > radius * (0.55 + n * 0.8)) continue;
    zone[j * W + i] = 1;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + dx;
      const b = j + dy;
      if (!g.inBounds(a, b) || dist[b * W + a] >= 0 || g.solid(a, b)) continue;
      dist[b * W + a] = d + 1;
      q.push([a, b]);
    }
  }
  return zone;
}

/** Distance (in cells) outside a zone, for fading effects in. */
function outsideDistance(g, zone) {
  const W = g.w;
  const d = new Float32Array(W * g.h).fill(99);
  const q = [];
  for (let k = 0; k < zone.length; k++) {
    if (zone[k]) {
      d[k] = 0;
      q.push(k);
    }
  }
  while (q.length) {
    const k = q.shift();
    const i = k % W;
    const j = (k / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + dx;
      const b = j + dy;
      if (!g.inBounds(a, b)) continue;
      const kk = b * W + a;
      if (d[kk] <= d[k] + 1) continue;
      d[kk] = d[k] + 1;
      q.push(kk);
    }
  }
  return d;
}

/** How far each zone cell is from the zone's edge, as a texture (1 = edge, 0 = deep inside). */
function edgeTexture(g, zone) {
  const W = g.w;
  const inside = new Float32Array(W * g.h).fill(0);
  const q = [];
  for (let k = 0; k < zone.length; k++) {
    if (!zone[k]) continue;
    const i = k % W;
    const j = (k / W) | 0;
    let edge = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!zone[(j + dy) * W + i + dx] && !g.solid(i + dx, j + dy)) edge = true;
    inside[k] = edge ? 1 : 99;
    if (edge) q.push(k);
  }
  while (q.length) {
    const k = q.shift();
    const i = k % W;
    const j = (k / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const kk = (j + dy) * W + i + dx;
      if (!zone[kk] || inside[kk] <= inside[k] + 1) continue;
      inside[kk] = inside[k] + 1;
      q.push(kk);
    }
  }
  const data = new Uint8Array(W * g.h * 4);
  const val = (k) => Math.max(0, 1 - (inside[k] - 1) / 3);
  for (let k = 0; k < zone.length; k++) {
    let v = 1;
    if (zone[k]) v = val(k);
    else {
      // walls sit between texels, so solid cells take their zone neighbour's value
      const i = k % W;
      const j = (k / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const kk = (j + dy) * W + i + dx;
        if (g.inBounds(i + dx, j + dy) && zone[kk] && g.solid(i, j)) v = Math.min(v, val(kk));
      }
    }
    data[k * 4] = v * 255;
    data[k * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, W, g.h);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Makes a donor material glitch: blocks near the zone's edge drop out to
 * show the level underneath, flicker, and now and then flash a corrupt colour.
 */
function glitchify(mat, uniforms) {
  const m = mat.clone();
  m.polygonOffset = true;
  m.polygonOffsetFactor = -2;
  m.polygonOffsetUnits = -2;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vGWorld;
uniform float uGTime;
uniform sampler2D tGEdge;
uniform vec2 uGSize;
float gHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }`)
      .replace('void main() {', `void main() {
  float gEdge = texture2D(tGEdge, vGWorld.xz / uGSize).r;
  vec3 gBlock = floor(vGWorld * vec3(3.0, 2.0, 3.0));
  float gN = gHash(gBlock + floor(uGTime * 7.0));
  float gSlow = gHash(gBlock * 0.37 + floor(uGTime * 0.8));
  if (gN < gEdge * 0.85 || gSlow > 0.992) discard;`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
  if (gHash(gBlock + floor(uGTime * 3.0) + 9.1) > 0.9965) gl_FragColor.rgb = mix(vec3(1.0, 0.1, 0.9), vec3(0.1, 1.0, 0.4), step(0.5, gHash(gBlock)));`);
  };
  const key = m.customProgramCacheKey?.bind(m);
  m.customProgramCacheKey = () => `${key ? key() : ''}|glitch`;
  m.userData.shared = false;
  return m;
}

/** Plain stand-ins for a donor that doesn't describe itself. */
function fallbackSurfaces(stage) {
  const c = new THREE.Color(stage.tint || 0xffffff);
  const rgb = [c.r * 200, c.g * 200, c.b * 200].map((v) => Math.round(v));
  const m = pbr(paint(`s-bleed-${stage.id}`, rgb, { rough: 0.6 }));
  return { wall: m, floor: m, ceil: null };
}

/**
 * Builds the bleed zones for world.bleedStages. Runs after the stage has
 * built its level and before lighting is baked.
 */
export function applyBleed(world) {
  const g = world.grid;
  const rng = world.rng;
  world.bleedZones = [];
  const size = new THREE.Vector2(g.w * g.cs, g.h * g.cs);
  const avoid = [];
  for (const stage of world.bleedStages) {
    const [cell] = world.pickFarCells(1, { minFrac: 0.3, spacing: 8, avoid, filter: (i, j) => g.standable(i, j) && g.countSolidNeighbors(i, j) <= 1 });
    if (!cell) continue;
    avoid.push(cell);
    const zone = growZone(g, cell[0], cell[1], rng.int(5, 8), rng.float(0, 100));
    const uniforms = { uGTime: { value: 0 }, tGEdge: { value: edgeTexture(g, zone) }, uGSize: { value: size } };
    const b = stage.bleed || {};
    const raw = b.surfaces ? b.surfaces(world) : fallbackSurfaces(stage);
    // each surface is a material or { mat, uv } (metres per UV unit, as the donor builds it)
    const S = (x) => (!x ? null : x.mat ? { uv: 2, ...x } : { mat: x, uv: 2 });
    const surf = { wall: S(raw.wall), floor: S(raw.floor), ceil: S(raw.ceil) };
    const inZone = (i, j) => g.inBounds(i, j) && zone[j * g.w + i] === 1;
    const ceil = world.ceilAt || (() => world.env.height || 2.7);
    const add = (geo, mat) => {
      if (!geo.attributes.position.count) return;
      const mesh = new THREE.Mesh(geo, glitchify(mat, uniforms));
      mesh.receiveShadow = true;
      world.root.add(mesh);
    };
    add(buildCellQuads(g, (c, i, j) => inZone(i, j) && c !== HOLE && c !== WATER, (i, j) => g.heightOf(i, j) + 0.005, true, surf.floor.uv), surf.floor.mat);
    add(buildWallFaces(g, {
      open: (c, i, j) => inZone(i, j) && c !== WALL && c !== VOID,
      y0: (i, j) => g.heightOf(i, j) - 0.01,
      y1: (i, j) => ceil(i, j) - 0.01,
      uScale: surf.wall.uv, vScale: surf.wall.uv, inset: 0.008,
    }), surf.wall.mat);
    if (surf.ceil) add(buildCellQuads(g, (c, i, j) => inZone(i, j) && c !== HOLE, (i, j) => ceil(i, j) - 0.008, false, surf.ceil.uv), surf.ceil.mat);
    // the donor's things
    if (b.props) {
      const kit = new PropKit(world);
      decorate(world, kit, { ...b.props, density: { wall: 0.35, high: 0.3, floor: 0.25, clutter: 0.3, ceil: 0.1, ...(b.props.density || {}) }, keepClear: (i, j) => !inZone(i, j) });
      kit.finish();
    }
    // someone who came through with it
    const centre = g.center(...cell);
    if (b.stray && !world.attract) {
      const e = b.stray(world, new THREE.Vector3(centre.x, g.heightOf(...cell), centre.z));
      if (e) world.add(e);
    }
    world.bleedZones.push({ stage, zone, dist: outsideDistance(g, zone), uniforms, cell, noticed: false });
  }
}

/**
 * Per frame: animates the glitch, and returns how strongly the nearest
 * bleeding level is felt where the player stands (0..1) and which one.
 */
export function updateBleed(world, dt, pos) {
  let best = 0;
  let stage = null;
  const g = world.grid;
  for (const z of world.bleedZones || []) {
    z.uniforms.uGTime.value += dt;
    const [i, j] = g.cellOf(pos.x, pos.z);
    if (!g.inBounds(i, j)) continue;
    const d = z.dist[j * g.w + i];
    const v = Math.max(0, 1 - d / 6);
    if (v > best) {
      best = v;
      stage = z;
    }
  }
  return { level: best, zone: stage };
}
