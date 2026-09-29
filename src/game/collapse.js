import * as THREE from 'three';
import { FLOOR, WALL, VOID, DOORWAY, HOLE, DIRS } from '../core/grid.js';
import { RNG } from '../core/rng.js';
import { Debris } from './debris.js';

// Levels come apart. Any walkable cell can crack, shiver and drop away into
// the void, taking its floor, the walls and ceiling around it and whatever
// stood there with it. Three things set it off:
//  - the signal fading: for its last half minute or so the level crumbles from
//    the far end toward you, and when the signal is gone the floor under you goes;
//  - patches of cracked floor that give way a moment after you step on them;
//  - now and then a rumble, and a stretch of level nearby (usually behind you)
//    drops away.
// Falling is just another way to drift on: nothing here can hurt you.
//
// Rendering: every level material gets a shader patch that looks its cell up
// in a small data texture (R crack, G shiver, B solid, A gone) and discards
// what's gone.
// A stage can opt out with world.env.collapse = false.

const INTACT = 0;
const WARNING = 1;
const GONE = 2;

const EMPTY = new THREE.DataTexture(new Uint8Array(4), 1, 1);
EMPTY.needsUpdate = true;

// One set of uniforms for every patched material: shared materials are
// patched once, so they must follow whichever level is current.
const U = {
  tClps: { value: EMPTY },
  uClpsGrid: { value: new THREE.Vector4(1, 1, 1, 0) }, // cells across, cells down, cell size, height above which nothing is cut
  uClpsOn: { value: 0 },
  uClpsTime: { value: 0 },
};

const DECL = /* glsl */ `
uniform sampler2D tClps;
uniform vec4 uClpsGrid;
uniform float uClpsOn;
uniform float uClpsTime;
varying vec3 vClpsWorld;
varying vec3 vClpsNrm;
vec4 clpsCell(vec3 p) {
  ivec2 c = ivec2(floor(p.xz / uClpsGrid.z));
  if (p.y > uClpsGrid.w || c.x < 0 || c.y < 0 || c.x >= int(uClpsGrid.x) || c.y >= int(uClpsGrid.y)) return vec4(0.0);
  return texelFetch(tClps, c, 0);
}
`;

// world position and normal for the lookup (a surface belongs to the cell it
// faces), and the shiver and sag of a cell that is about to go
const VERT = /* glsl */ `
  vec4 clpsW = vec4(position, 1.0);
  vec3 clpsN = normal;
#ifdef USE_INSTANCING
  clpsW = instanceMatrix * clpsW;
  clpsN = mat3(instanceMatrix) * clpsN;
#endif
  clpsW = modelMatrix * clpsW;
  clpsN = mat3(modelMatrix) * clpsN;
  clpsN = dot(clpsN, clpsN) > 1e-8 ? normalize(clpsN) : vec3(0.0);
  vClpsWorld = clpsW.xyz;
  vClpsNrm = clpsN;
  vec3 clpsOff = vec3(0.0);
  if (uClpsOn > 0.5) {
    vec4 clpsC = clpsCell(clpsW.xyz + clpsN * 0.15);
    float clpsSh = clpsC.g * sin(uClpsTime * 53.0 + clpsW.x * 11.0 + clpsW.z * 7.0) * 0.012;
    clpsOff = vec3(clpsSh * 0.7, clpsSh - clpsC.g * clpsC.r * 0.08 * step(0.5, clpsN.y), clpsSh * 0.5);
  }
`;

const FRAG_FNS = /* glsl */ `
float clpsH1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 clpsH2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
float clpsNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(clpsH1(i), clpsH1(i + vec2(1.0, 0.0)), f.x), mix(clpsH1(i + vec2(0.0, 1.0)), clpsH1(i + vec2(1.0, 1.0)), f.x), f.y);
}
// distance-ish to the nearest Voronoi edge: cracks
float clpsCrack(vec2 x) {
  vec2 n = floor(x);
  vec2 f = fract(x);
  float d1 = 8.0;
  float d2 = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 r = g + clpsH2(n + g) - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
  }
  return sqrt(d2) - sqrt(d1);
}
`;

const FRAG = /* glsl */ `
  float clpsCrackAmt = 0.0;
  float clpsShiver = 0.0;
  float clpsRim = 0.0;
  if (uClpsOn > 0.5) {
    // the lookup wanders with a little noise so broken edges come out ragged
    // (but never into a wall, which has no floor of its own to take along)
    vec3 clpsP = vClpsWorld + vClpsNrm * 0.15;
    vec2 clpsNq = vClpsWorld.xz * 2.7 + vClpsWorld.y * 1.9;
    vec2 clpsJit = vec2(clpsNoise(clpsNq), clpsNoise(clpsNq + 5.2)) * 0.75 + vec2(clpsNoise(clpsNq * 3.7 + 1.3), clpsNoise(clpsNq * 3.7 + 8.1)) * 0.25 - 0.5;
    vec3 clpsJ = clpsP;
    clpsJ.xz += clpsJit * uClpsGrid.z * 0.14;
    vec4 clpsC = clpsCell(clpsJ);
    if (clpsC.b > 0.5) {
      clpsJ = clpsP;
      clpsC = clpsCell(clpsP);
    }
    if (clpsC.a > 0.5) discard;
    // cracked patches show on the floor; walls and ceilings crack once it starts to go
    clpsCrackAmt = clpsC.r * (vClpsNrm.y > 0.5 ? 1.0 : clpsC.g);
    clpsShiver = clpsC.g;
    // darken the broken lip along a neighbour that has gone
    float clpsRw = 0.22 / uClpsGrid.z;
    vec2 clpsF = fract(clpsJ.xz / uClpsGrid.z);
    vec3 clpsDx = vec3(uClpsGrid.z, 0.0, 0.0);
    vec3 clpsDz = vec3(0.0, 0.0, uClpsGrid.z);
    if (clpsF.x < clpsRw && clpsCell(clpsJ - clpsDx).a > 0.5) clpsRim = max(clpsRim, 1.0 - clpsF.x / clpsRw);
    if (clpsF.x > 1.0 - clpsRw && clpsCell(clpsJ + clpsDx).a > 0.5) clpsRim = max(clpsRim, 1.0 - (1.0 - clpsF.x) / clpsRw);
    if (clpsF.y < clpsRw && clpsCell(clpsJ - clpsDz).a > 0.5) clpsRim = max(clpsRim, 1.0 - clpsF.y / clpsRw);
    if (clpsF.y > 1.0 - clpsRw && clpsCell(clpsJ + clpsDz).a > 0.5) clpsRim = max(clpsRim, 1.0 - (1.0 - clpsF.y) / clpsRw);
  }
`;

const FRAG_END = /* glsl */ `
  if (clpsCrackAmt > 0.01) {
    vec3 clpsA = abs(vClpsNrm);
    vec2 clpsQ = clpsA.y > 0.5 ? vClpsWorld.xz : (clpsA.x > clpsA.z ? vClpsWorld.zy : vClpsWorld.xy);
    // warped Voronoi edges read as cracks; they spread and widen as the cell goes
    vec2 clpsWq = clpsQ * 1.1 + (vec2(clpsNoise(clpsQ * 3.1), clpsNoise(clpsQ * 3.1 + 7.1)) - 0.5) * 0.3
      + (vec2(clpsNoise(clpsQ * 13.0), clpsNoise(clpsQ * 13.0 + 3.3)) - 0.5) * 0.07;
    float clpsWd = (0.008 + 0.03 * clpsCrackAmt) * (0.6 + 0.8 * clpsNoise(clpsQ * 5.0 + 1.7));
    float clpsMask = smoothstep(0.62 - clpsCrackAmt * 0.7, 0.8 - clpsCrackAmt * 0.7, clpsNoise(clpsQ * 0.8 + 3.1));
    float clpsK = (1.0 - smoothstep(clpsWd * 0.5, clpsWd, clpsCrack(clpsWq))) * clpsMask;
    clpsK = max(clpsK, (1.0 - smoothstep(clpsWd * 0.25, clpsWd * 0.5, clpsCrack(clpsWq * 3.0 + 5.3))) * smoothstep(0.5, 1.0, clpsCrackAmt));
    gl_FragColor.rgb *= 1.0 - clpsK * 0.8;
  }
  gl_FragColor.rgb *= (1.0 - clpsShiver * (0.08 + 0.08 * sin(uClpsTime * 29.0))) * (1.0 - clpsRim * clpsRim * 0.6);
`;

const MAIN = /void\s+main\s*\(\s*\)\s*\{/;
const patched = new WeakSet();

/** Adds the collapse lookup to a material (once: it follows whichever level is current). */
export function patchCollapse(mat) {
  if (patched.has(mat) || mat.isRawShaderMaterial) return;
  patched.add(mat);
  const prev = mat.onBeforeCompile;
  // the key of the patches already on it, taken before this one wraps them
  const key = `${mat.customProgramCacheKey()}|collapse`;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    if (!MAIN.test(sh.vertexShader) || !MAIN.test(sh.fragmentShader)) return;
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace(MAIN, (m) => `${DECL}\n${m}\n${VERT}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += clpsOff;');
    sh.fragmentShader = sh.fragmentShader
      .replace(MAIN, (m) => `${DECL}${FRAG_FNS}\n${m}\n${FRAG}`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>\n${FRAG_END}`);
  };
  mat.customProgramCacheKey = () => key;
  mat.needsUpdate = true;
}

const IDENTITY = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _irr = new THREE.Vector3();
const _box = new THREE.Box3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _n = new THREE.Vector3();

/**
 * Which material covers each cell's floor, walls and ceiling (by area), so the
 * debris looks like what fell. The commonest few get debris of their own and
 * the rest borrow the commonest of their kind. Level shells are built in world
 * space, so only meshes with an identity transform are read.
 */
function scanSurfaces(world, skip) {
  const g = world.grid;
  const n = g.w * g.h;
  const mats = [];
  const ids = new Map();
  const votes = new Map();
  world.root.updateMatrixWorld(true);
  world.root.traverse((o) => {
    if (skip.has(o) || !o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.userData.noCollapse) return;
    const m = o.material;
    if (Array.isArray(m) || !m.isMeshStandardMaterial || m.transparent || !o.matrixWorld.equals(IDENTITY)) return;
    const pos = o.geometry.attributes.position;
    if (!pos) return;
    let id = ids.get(m);
    if (id === undefined) {
      if (mats.length >= 255) return;
      id = mats.length;
      ids.set(m, id);
      mats.push(m);
    }
    const index = o.geometry.index;
    const tris = Math.floor((index ? index.count : pos.count) / 3);
    const stride = Math.max(1, Math.floor(tris / 20000));
    for (let t = 0; t < tris; t += stride) {
      const i0 = index ? index.getX(t * 3) : t * 3;
      const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      _a.fromBufferAttribute(pos, i0);
      _b.fromBufferAttribute(pos, i1).sub(_a);
      _c.fromBufferAttribute(pos, i2).sub(_a);
      _n.crossVectors(_b, _c);
      const len = _n.length();
      if (len < 1e-5) continue;
      _n.divideScalar(len);
      const kind = _n.y > 0.7 ? 0 : _n.y < -0.7 ? 2 : Math.abs(_n.y) < 0.3 ? 1 : -1;
      if (kind < 0) continue;
      // centroid, nudged into the cell the face looks into
      const ci = Math.floor((_a.x + (_b.x + _c.x) / 3 + _n.x * 0.2) / g.cs);
      const cj = Math.floor((_a.z + (_b.z + _c.z) / 3 + _n.z * 0.2) / g.cs);
      if (!g.inBounds(ci, cj)) continue;
      const key = ((cj * g.w + ci) * 3 + kind) * 256 + id;
      votes.set(key, (votes.get(key) || 0) + len * stride);
    }
  });
  const best = [0, 1, 2].map(() => new Int16Array(n).fill(-1));
  const area = [0, 1, 2].map(() => new Float32Array(n));
  for (const [key, a] of votes) {
    const id = key % 256;
    const ck = (key - id) / 256;
    const kind = ck % 3;
    const k = (ck - kind) / 3;
    if (a > area[kind][k]) {
      area[kind][k] = a;
      best[kind][k] = id;
    }
  }
  const cover = [0, 1, 2].map(() => new Float64Array(mats.length));
  best.forEach((arr, kind) => arr.forEach((id) => id >= 0 && cover[kind][id]++));
  const total = (id) => cover[0][id] + cover[1][id] + cover[2][id];
  const keep = mats.map((_, id) => id).filter((id) => total(id) > 0).sort((x, y) => total(y) - total(x)).slice(0, 6);
  const kept = new Set(keep);
  const fallback = cover.map((c) => keep.reduce((b, id) => (b < 0 || c[id] > c[b] ? id : b), -1));
  const [floor, wall, ceil] = best.map((arr, kind) => arr.map((id) => (id < 0 ? -1 : kept.has(id) ? id : fallback[kind])));
  return { mats, keep: keep.map((id) => mats[id]), floor, wall, ceil };
}

export class Collapse {
  constructor(world) {
    this.world = world;
    const g = (this.grid = world.grid);
    const n = (this.n = g.w * g.h);
    // its own random stream, so the level's stays as it was
    this.rng = new RNG((world.seed ^ 0x2c1b3c6d) >>> 0);
    this.t = 0;
    this.state = new Uint8Array(n);
    this.start = new Float32Array(n);
    this.due = new Float32Array(n);
    this.began = new Uint8Array(n);
    this.base = new Uint8Array(n); // cracks already there (crumbling patches)
    this.pit = new Uint8Array(n); // holes the level was built with
    this.active = [];
    this.fallen = [];
    this.falling = [];
    this.data = new Uint8Array(n * 4);
    for (let k = 0; k < n; k++) {
      if (g.cells[k] === HOLE) this.pit[k] = 1;
      if (g.cells[k] === WALL || g.cells[k] === VOID) this.data[k * 4 + 2] = 255;
    }
    this.tex = new THREE.DataTexture(this.data, g.w, g.h);
    this.tex.magFilter = THREE.NearestFilter;
    this.tex.minFilter = THREE.NearestFilter;
    this.tex.needsUpdate = true;
    this.dirty = false;
    // the deeper you are, the longer the end drags on
    this.window = 24 + Math.min(world.depth, 8) * 1.5;
    this.front = null;
    this.quakeT = -1;
    this.quakeProx = 0;
    this.patchRumble = 0;
    this.soundCool = 0;
    this.creakCool = 0;
    this.dropTimer = 0;
    this.panners = null;
    this.pn = 0;
    this.dropOK = new WeakMap();

    // things that fall whole rather than being cut away with their cell
    const skip = new Set();
    for (const e of world.entities) if (this.canDrop(e)) e.object.traverse((o) => skip.add(o));
    this.protect = this.protectedCells();
    this.surf = scanSurfaces(world, skip);
    this.debris = new Debris(world, this.surf.keep);
    this.indexLights(skip);
    this.choosePatches();
    this.scheduleQuakes();
    this.patchLevel(skip);
    U.tClps.value = this.tex;
    U.uClpsGrid.value.set(g.w, g.h, g.cs, this.ceilingTop());
    U.uClpsOn.value = 1;
    U.uClpsTime.value = 0;
    world.onDispose.push(() => this.dispose());
  }

  standable(k) {
    const c = this.grid.cells[k];
    return c !== WALL && c !== VOID && c !== HOLE;
  }

  /** Small things standing in the level (residents, apparitions, doors) fall whole. */
  canDrop(e) {
    let ok = this.dropOK.get(e);
    if (ok === undefined) {
      ok = false;
      const o = e.object;
      if (o && o.parent === this.world.root) {
        _box.setFromObject(o);
        if (!_box.isEmpty()) {
          _box.getSize(_v);
          ok = Math.max(_v.x, _v.z) < 3.2;
        }
      }
      this.dropOK.set(e, ok);
    }
    return ok;
  }

  /** Where the rumbles and cracked floor leave alone: where you arrive, the doors, the residents. */
  protectedCells() {
    const g = this.grid;
    const out = new Uint8Array(this.n);
    const mark = (x, z) => {
      const [ci, cj] = g.cellOf(x, z);
      for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) if (g.inBounds(i, j)) out[j * g.w + i] = 1;
    };
    mark(this.world.spawn.x, this.world.spawn.z);
    for (const d of this.world.doors) mark(d.pos.x, d.pos.z);
    for (const e of this.world.entities) if (e.conversations && e.object) mark(e.object.position.x, e.object.position.z);
    return out;
  }

  indexLights(skip) {
    const g = this.grid;
    const w = this.world;
    this.fixturesAt = new Map();
    this.lightsAt = new Map();
    const at = (map, x, z, v) => {
      const [i, j] = g.cellOf(x, z);
      if (!g.inBounds(i, j)) return;
      const k = j * g.w + i;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(v);
    };
    for (const f of w.lightPool?.fixtures || []) at(this.fixturesAt, f.pos.x, f.pos.z, f);
    const pooled = new Set(w.lightPool?.lights || []);
    w.root.traverse((o) => {
      if (!o.isLight || pooled.has(o) || skip.has(o) || o.isHemisphereLight || o.isAmbientLight || o.isDirectionalLight || o.isLightProbe) return;
      o.getWorldPosition(_v);
      at(this.lightsAt, _v.x, _v.z, o);
    });
  }

  /** Irregular blob of cells around k0 (≤ r steps, each kept with chance `keep`): [[k, ring], ...]. */
  region(k0, r, ok, keep = 0.8) {
    const g = this.grid;
    const W = g.w;
    const seen = new Map([[k0, 0]]);
    const out = [[k0, 0]];
    const q = [k0];
    while (q.length) {
      const k = q.shift();
      const d = seen.get(k);
      if (d >= r) continue;
      const i = k % W;
      const j = (k / W) | 0;
      for (const [dx, dy] of DIRS) {
        const a = i + dx;
        const b = j + dy;
        if (!g.inBounds(a, b)) continue;
        const kk = b * W + a;
        if (seen.has(kk)) continue;
        seen.set(kk, d + 1);
        if (!ok(kk) || !this.rng.chance(keep)) continue;
        out.push([kk, d + 1]);
        q.push(kk);
      }
    }
    return out;
  }

  /** Cracked floor away from where you arrive; more of it the deeper you are. */
  choosePatches() {
    const w = this.world;
    const g = this.grid;
    const rng = this.rng;
    this.patchOf = new Int16Array(this.n).fill(-1);
    this.patches = [];
    const want = Math.min(6, Math.floor(rng.float(0, 1.3) + w.depth * 0.5));
    if (!want) return;
    const ok = (k) => (g.cells[k] === FLOOR || g.cells[k] === DOORWAY) && !g.ramp[k] && !this.protect[k] && this.patchOf[k] < 0;
    const cands = [];
    for (let k = 0; k < this.n; k++) if (ok(k) && w.distFromSpawn[k] > w.maxDist * 0.3) cands.push(k);
    rng.shuffle(cands);
    const centres = [];
    for (const k of cands) {
      if (this.patches.length >= want) break;
      const i = k % g.w;
      const j = (k / g.w) | 0;
      if (this.patchOf[k] >= 0 || centres.some(([a, b]) => Math.abs(a - i) + Math.abs(b - j) < 6)) continue;
      centres.push([i, j]);
      const id = this.patches.length;
      const r = Math.max(1, Math.round(rng.float(1.5, 3.5) / g.cs));
      const cells = this.region(k, r, ok, 0.7).map(([kk]) => kk);
      for (const kk of cells) {
        this.patchOf[kk] = id;
        this.base[kk] = rng.int(80, 120);
        this.data[kk * 4] = this.base[kk];
      }
      this.patches.push({ cells, fired: false });
    }
  }

  /** Rumbles before the signal starts to go: likelier, and more of them, the deeper you are. */
  scheduleQuakes() {
    const w = this.world;
    const rng = this.rng;
    const span = Math.max(20, w.duration - this.window);
    this.quakes = [];
    if (rng.chance(Math.min(0.9, 0.2 + w.depth * 0.12))) this.quakes.push(rng.float(0.25, 0.55) * span);
    if (w.depth >= 4 && rng.chance(0.5)) this.quakes.push(rng.float(0.6, 0.9) * span);
  }

  /** Height above which nothing is cut away (skies, clouds, things floating overhead). */
  ceilingTop() {
    const w = this.world;
    const g = this.grid;
    const h = w.env.height || 2.7;
    let top = -Infinity;
    for (let k = 0; k < this.n; k++) {
      if (!this.standable(k)) continue;
      const i = k % g.w;
      const j = (k / g.w) | 0;
      top = Math.max(top, w.ceilAt?.(i, j) ?? g.topOf(i, j) + h);
    }
    return (Number.isFinite(top) ? top : h) + 3;
  }

  /** Patches every material in the level, bar things that fall whole and backdrops. */
  patchLevel(skip) {
    const root = this.world.root;
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (skip.has(o) || o.userData.noCollapse || !o.material) return;
      if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return;
      const geo = o.geometry;
      if (geo) {
        if (!geo.boundingSphere) geo.computeBoundingSphere();
        // sky domes and other backdrops
        if (geo.boundingSphere && geo.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis() > 90) return;
      }
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) patchCollapse(m);
    });
    // the ambient occlusion pre-pass must not see what's gone either
    const ao = this.world.game.post?.gtao?.normalMaterial;
    if (ao) patchCollapse(ao);
  }

  // ---- per frame -------------------------------------------------------------

  update(dt, ctx) {
    const game = ctx.game;
    if (game.state !== 'playing') return;
    this.t += dt;
    U.uClpsTime.value = this.t;
    const w = this.world;
    const g = this.grid;
    const p = ctx.player;
    // stepping onto cracked floor
    const [pi, pj] = g.cellOf(p.pos.x, p.pos.z);
    if (p.grounded && g.inBounds(pi, pj)) {
      const k = pj * g.w + pi;
      const id = this.patchOf[k];
      if (id >= 0 && !this.patches[id].fired) this.firePatch(id, k);
    }
    if (this.quakes.length && this.t >= this.quakes[0]) {
      this.quakes.shift();
      this.quake(p);
    }
    const signal = w.timeLeft < this.window ? this.signal(dt, p) : 0;
    this.tick(p, game);
    this.debris.update(dt);
    this.dropTimer -= dt;
    if (this.dropTimer <= 0) {
      this.dropTimer = 0.15;
      this.dropEntities();
    }
    this.updateFalling(dt);
    this.feel(dt, game, signal);
    if (this.dirty) {
      this.tex.needsUpdate = true;
      this.dirty = false;
    }
  }

  /** Cell k starts to go in `delay` seconds, and is gone `dur` seconds after that. */
  warn(k, dur, delay = 0) {
    if (this.state[k] !== INTACT) return;
    this.state[k] = WARNING;
    this.start[k] = this.t + delay;
    this.due[k] = this.t + delay + dur;
    this.active.push(k);
  }

  firePatch(id, k0) {
    this.patches[id].fired = true;
    // the cracks run out from where you stepped
    for (const [k, ring] of this.region(k0, 99, (k) => this.patchOf[k] === id, 1)) this.warn(k, 1.1, ring * 0.3);
    this.world.game.audio.creak(this.panner(k0), 1.3);
    this.creakCool = 0.8;
    this.patchRumble = 1;
  }

  quake(p) {
    const g = this.grid;
    const W = g.w;
    const cs = g.cs;
    const [pi, pj] = g.cellOf(p.pos.x, p.pos.z);
    if (!g.standable(pi, pj)) return;
    const d = g.distances(pi, pj);
    const lo = Math.max(3, Math.round(7 / cs));
    const hi = Math.max(lo + 2, Math.round(20 / cs));
    const fx = -Math.sin(p.yaw);
    const fz = -Math.cos(p.yaw);
    let best = -1;
    let bestScore = -Infinity;
    for (let k = 0; k < this.n; k++) {
      if (d[k] < lo || d[k] > hi || this.state[k] !== INTACT || this.protect[k]) continue;
      const dx = ((k % W) + 0.5) * cs - p.pos.x;
      const dz = (((k / W) | 0) + 0.5) * cs - p.pos.z;
      // usually somewhere behind you: you hear it before you see it
      const behind = (dx * fx + dz * fz) / (Math.hypot(dx, dz) + 1e-6) < -0.2 ? 1 : 0;
      const score = behind + this.rng.next();
      if (score > bestScore) {
        bestScore = score;
        best = k;
      }
    }
    if (best < 0) return;
    const u = this.world.unease(best % W, (best / W) | 0);
    const r = Math.max(1, Math.round((this.rng.float(2.5, 5) * (0.8 + u * 0.4)) / cs));
    // it never takes the ground right around you
    const ok = (k) => this.state[k] === INTACT && this.standable(k) && !this.protect[k] && d[k] >= 2;
    for (const [k, ring] of this.region(best, r, ok, 0.8)) this.warn(k, 1.7, 0.8 + ring * 0.28 + this.rng.float(0, 0.15));
    this.quakeT = 0;
    this.quakeProx = Math.min(1, Math.max(0.35, 1.2 - (d[best] * cs) / 30));
    this.world.game.audio.creak(this.panner(best), 1.2);
    this.creakCool = 0.8;
  }

  /**
   * The fading signal: cells further (by walking distance) from where you
   * stand than a shrinking radius start to go, so the edge closes in on you
   * wherever you run. When the signal is gone, so is the rest.
   */
  signal(dt, p) {
    const w = this.world;
    const s = Math.min(1, Math.max(0, (this.window - w.timeLeft) / this.window));
    const f = this.front || (this.front = { maxD: 1, dist: null, order: [], ptr: 0, timer: 0 });
    f.timer -= dt;
    if ((f.timer <= 0 || !f.dist) && p.grounded) {
      f.timer = 1;
      this.rank(p, f);
    }
    if (!f.dist) return s;
    const R = w.timeLeft <= 0 ? -1 : f.maxD * Math.pow(1 - s, 1.25);
    const far = (k) => (f.dist[k] < 0 ? 1e9 : f.dist[k]);
    while (f.ptr < f.order.length && far(f.order[f.ptr]) > R) this.warn(f.order[f.ptr++], 1.6);
    return s;
  }

  /** Remaining cells, furthest from you first (cut-off ones first of all). */
  rank(p, f) {
    const g = this.grid;
    const [pi, pj] = g.cellOf(p.pos.x, p.pos.z);
    if (!g.standable(pi, pj)) return;
    const d = g.distances(pi, pj);
    if (!f.dist) for (const v of d) f.maxD = Math.max(f.maxD, v);
    f.dist = d;
    const far = (k) => (d[k] < 0 ? 1e9 : d[k]);
    f.order = [];
    for (let k = 0; k < this.n; k++) if (this.state[k] === INTACT && this.standable(k)) f.order.push(k);
    f.order.sort((a, b) => far(b) - far(a));
    f.ptr = 0;
  }

  /** Advances cells on their way out: cracks widen, they shiver, then drop. */
  tick(p, game) {
    const g = this.grid;
    const W = g.w;
    const cs = g.cs;
    let near = -1;
    let nearD = Infinity;
    let count = 0;
    let creak = -1;
    let creakD = Infinity;
    for (let a = this.active.length - 1; a >= 0; a--) {
      const k = this.active[a];
      if (this.t < this.start[k]) continue;
      const d = Math.hypot(((k % W) + 0.5) * cs - p.pos.x, (((k / W) | 0) + 0.5) * cs - p.pos.z);
      if (!this.began[k]) {
        this.began[k] = 1;
        this.beginWarning(k, d);
        if (d < creakD) {
          creakD = d;
          creak = k;
        }
      }
      if (this.t >= this.due[k]) {
        this.active[a] = this.active[this.active.length - 1];
        this.active.pop();
        this.fall(k, d);
        count++;
        if (d < nearD) {
          nearD = d;
          near = k;
        }
        continue;
      }
      const f = (this.t - this.start[k]) / (this.due[k] - this.start[k]);
      this.data[k * 4] = Math.min(255, Math.max(this.base[k], f * 255));
      this.data[k * 4 + 1] = Math.min(255, f * 1.6 * 255);
      this.dirty = true;
    }
    const audio = game.audio;
    if (near >= 0 && nearD < 45 && this.soundCool <= 0) {
      this.soundCool = 0.13;
      audio.crumble(this.panner(near), Math.min(1.3, 0.7 + count * 0.1));
    }
    if (near >= 0 && nearD < 10) game.shake = Math.max(game.shake, 0.5 * (1 - nearD / 10));
    if (creak >= 0 && creakD < 14 && this.creakCool <= 0) {
      this.creakCool = 0.8;
      audio.creak(this.panner(creak), 0.8);
    }
  }

  beginWarning(k, d) {
    // its lights stutter, and grit sifts down from the ceiling
    for (const f of this.fixturesAt.get(k) || []) if (!f.dead) f.flicker = Math.max(f.flicker || 0, 0.45);
    if (d > 16) return;
    const g = this.grid;
    const i = k % g.w;
    const j = (k / g.w) | 0;
    const y = g.heightOf(i, j);
    const light = this.lightAt(i, j, y);
    this.debris.dust.emit(6, (i + 0.5) * g.cs, this.ceilAt(i, j, y) - 0.05, (j + 0.5) * g.cs, { spread: g.cs * 0.45, vy: -0.4, jitter: 0.15, life: 2.4, bright: this.dustBright(light) });
  }

  fall(k, d) {
    const g = this.grid;
    const W = g.w;
    const i = k % W;
    const j = (k / W) | 0;
    const floorY = g.floorAt((i + 0.5) * g.cs, (j + 0.5) * g.cs);
    this.state[k] = GONE;
    this.data[k * 4] = this.data[k * 4 + 1] = 0;
    this.data[k * 4 + 3] = 255;
    g.set(i, j, HOLE);
    // the pits the level was built with go with their surroundings
    for (const [dx, dy] of DIRS) {
      const a = i + dx;
      const b = j + dy;
      if (g.inBounds(a, b) && this.pit[b * W + a]) this.data[(b * W + a) * 4 + 3] = 255;
    }
    this.dirty = true;
    for (const f of this.fixturesAt.get(k) || []) {
      f.dead = true;
      f.deadGlow = 0;
    }
    for (const l of this.lightsAt.get(k) || []) l.intensity = 0;
    this.fallen.push(k);
    if (d < 26) this.shatter(i, j, floorY, d);
  }

  /** Debris for a cell that just went: floor slabs, a bit of ceiling, lumps of wall, grit and dust. */
  shatter(i, j, floorY, d) {
    const g = this.grid;
    const cs = g.cs;
    const k = j * g.w + i;
    const D = this.debris;
    const s = this.surf;
    const rnd = Math.random;
    const light = this.lightAt(i, j, floorY);
    const fm = s.floor[k] >= 0 ? s.mats[s.floor[k]] : D.rubble;
    for (let a = 0; a < 2; a++) {
      for (let b = 0; b < 2; b++) {
        const th = 0.1 + rnd() * 0.08;
        D.spawn(fm, (i + 0.25 + a * 0.5) * cs, floorY - th / 2, (j + 0.25 + b * 0.5) * cs, cs * (0.44 + rnd() * 0.05), th, cs * (0.44 + rnd() * 0.05), {
          vx: (a - 0.5) * rnd() * 0.5, vy: -rnd() * 0.6, vz: (b - 0.5) * rnd() * 0.5, spin: 0.3 + rnd() * 1.4, wait: rnd() * 0.15, light,
        });
      }
    }
    if (d < 14) {
      for (let a = 0; a < 3; a++) {
        const sz = 0.06 + rnd() * 0.14;
        D.spawn(fm, (i + rnd()) * cs, floorY + 0.05, (j + rnd()) * cs, sz, sz, sz, { vx: (rnd() - 0.5) * 1.5, vy: rnd() * 1.5, vz: (rnd() - 0.5) * 1.5, spin: 2 + rnd() * 6, light });
      }
    }
    const cy = this.ceilAt(i, j, floorY);
    if (s.ceil[k] >= 0) {
      for (let a = 0; a < 2; a++) {
        const th = 0.08 + rnd() * 0.06;
        D.spawn(s.mats[s.ceil[k]], (i + 0.25 + rnd() * 0.5) * cs, cy - th / 2, (j + 0.25 + rnd() * 0.5) * cs, cs * 0.5, th, cs * 0.45, { spin: 0.2 + rnd(), wait: 0.1 + rnd() * 0.35, light });
      }
    }
    if (s.wall[k] >= 0) {
      const wm = s.mats[s.wall[k]];
      for (const [dx, dy] of DIRS) {
        if (!g.solid(i + dx, j + dy) || rnd() < 0.3) continue;
        const along = 0.4 + rnd() * 0.5;
        const thick = 0.14 + rnd() * 0.1;
        const off = (rnd() - 0.5) * cs * 0.6;
        const x = (i + 0.5 + dx * 0.5) * cs - (dx * thick) / 2 + (dy ? off : 0);
        const z = (j + 0.5 + dy * 0.5) * cs - (dy * thick) / 2 + (dx ? off : 0);
        const y = floorY + 0.3 + rnd() * Math.max(0.2, cy - floorY - 0.8);
        D.spawn(wm, x, y, z, dx ? thick : along, 0.4 + rnd() * 0.6, dx ? along : thick, { vx: -dx * rnd() * 0.8, vz: -dy * rnd() * 0.8, spin: 0.3 + rnd(), wait: rnd() * 0.3, light });
      }
    }
    D.dust.emit(d < 14 ? 14 : 6, (i + 0.5) * cs, floorY + 0.1, (j + 0.5) * cs, { spread: cs * 0.45, burst: 1.2, vy: -0.3, jitter: 0.5, life: 1.8, bright: this.dustBright(light) });
  }

  ceilAt(i, j, floorY) {
    return this.world.ceilAt?.(i, j) ?? floorY + (this.world.env.height || 2.7);
  }

  /** Baked light arriving in a cell, for the debris to carry as it falls. */
  lightAt(i, j, y) {
    const b = this.world.baker;
    if (!b) return [0.3, 0.3, 0.3];
    _v.set((i + 0.5) * this.grid.cs, y + 1.1, (j + 0.5) * this.grid.cs);
    b.irradiance(_v, null, i, j, _irr);
    return [_irr.x, _irr.y, _irr.z];
  }

  dustBright(light) {
    const scale = this.world.bakeUniforms?.scale.value ?? 1;
    return Math.min(0.9, 0.12 + ((light[0] + light[1] + light[2]) / 3) * scale * 0.35);
  }

  /** A pooled positional source at cell k (the collapse makes too many sounds for one panner each). */
  panner(k) {
    const a = this.world.game.audio;
    if (!a.ready) return null;
    if (!this.panners) this.panners = Array.from({ length: 6 }, () => a.panner(0, 0, 0, { ref: 3, rolloff: 1, max: 80 }));
    this.pn = (this.pn + 1) % this.panners.length;
    const p = this.panners[this.pn];
    const g = this.grid;
    a.setPannerPos(p, ((k % g.w) + 0.5) * g.cs, g.hgt[k] + 0.5, (((k / g.w) | 0) + 0.5) * g.cs);
    return p;
  }

  dropEntities() {
    const w = this.world;
    const g = this.grid;
    const gone = [];
    for (const e of w.entities) {
      if (!this.canDrop(e)) continue;
      const o = e.object.position;
      const [i, j] = g.cellOf(o.x, o.z);
      if (g.inBounds(i, j) && this.state[j * g.w + i] === GONE) gone.push(e);
    }
    for (const e of gone) {
      const o = e.object;
      w.entities = w.entities.filter((x) => x !== e);
      w.interactables = w.interactables.filter((x) => x !== e);
      w.doors = w.doors.filter((x) => x !== e);
      w.circles = w.circles.filter((c) => c.obj !== o);
      w.npcMarkers = w.npcMarkers.filter((m) => m !== o.position);
      e.dispose?.();
      // it stays in the level (and is freed with it), tumbling out of sight
      this.falling.push({ o, vy: 0, t: 0, rx: (Math.random() - 0.5) * 1.5, rz: (Math.random() - 0.5) * 1.5 });
    }
  }

  updateFalling(dt) {
    for (const f of this.falling) {
      if (f.t > 4) continue;
      f.t += dt;
      f.vy -= 11 * dt;
      f.o.position.y += f.vy * dt;
      f.o.rotation.x += f.rx * dt;
      f.o.rotation.z += f.rz * dt;
      if (f.t > 4) f.o.visible = false;
    }
  }

  /** The rumble you hear and the shaking you feel. */
  feel(dt, game, signal) {
    this.soundCool -= dt;
    this.creakCool -= dt;
    let rumble = signal ? 0.15 + signal * 0.6 : 0;
    let shake = signal ? 0.06 + signal * 0.3 : 0;
    if (this.quakeT >= 0) {
      this.quakeT += dt;
      const q = this.quakeT;
      const env = Math.min(1, q / 0.5) * Math.exp(-Math.max(0, q - 2) / 1.2);
      rumble = Math.max(rumble, env * 0.9 * this.quakeProx);
      shake = Math.max(shake, env * 0.6 * this.quakeProx);
      if (q > 8) this.quakeT = -1;
    }
    if (this.patchRumble > 0) {
      this.patchRumble = Math.max(0, this.patchRumble - dt * 0.8);
      rumble = Math.max(rumble, this.patchRumble * 0.4);
      shake = Math.max(shake, this.patchRumble * 0.3);
    }
    game.audio.setRumble(rumble);
    game.shake = Math.max(game.shake, shake);
  }

  /** Cells that fell since the last call (for the map), or null. */
  takeFallen() {
    if (!this.fallen.length) return null;
    const out = this.fallen;
    this.fallen = [];
    return out;
  }

  dispose() {
    for (const p of this.panners || []) p.disconnect();
    this.tex.dispose();
    if (U.tClps.value === this.tex) {
      U.tClps.value = EMPTY;
      U.uClpsOn.value = 0;
    }
  }
}
