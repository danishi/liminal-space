import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { wallMounts, WATER, HOLE, DIRS } from '../core/grid.js';
import { DriftDoor } from '../entities/door.js';
import { bakeWorld } from '../core/bake.js';
import { applyBleed, updateBleed } from './bleed.js';

const STEP_UP = 0.55;
// integer key for a grid cell (i, j) in the prop-box hash, valid for |j| < 32768
const cellKey = (i, j) => i * 65536 + j;
const _pp = new THREE.Vector3();

/**
 * A built level: geometry, collision, residents, apparitions and the doors
 * that lead elsewhere. Stage modules fill it in through build(world).
 *
 * "Unease" rises with drift depth (how many levels you've passed through)
 * and with distance from where you arrived; stages use it to add clutter,
 * break lights and let stranger things appear.
 */
export class World {
  constructor(game, stage, { seed = (Math.random() * 1e9) | 0, depth = 0, attract = false, lights = 6, stages = [], weights = null, bleed = [] } = {}) {
    this.game = game;
    this.stage = stage;
    this.stages = stages;
    this.stageWeights = weights;
    this.seed = seed;
    this.rng = new RNG(seed);
    this.depth = depth;
    this.attract = attract;
    this.lightCount = lights;
    this.root = new THREE.Group();
    this.entities = [];
    this.interactables = [];
    this.boxHash = new Map();
    this.circles = [];
    this.doors = [];
    this.lightPool = null;
    this.spawn = { x: 0, z: 0, yaw: 0 };
    this.npcMarkers = [];
    this.animated = [];
    this.env = {
      background: 0x000000,
      fog: null,
      exposure: 1,
      toneMapping: undefined,
      postfx: {},
      ao: 1,
      envIntensity: 0.6,
      ambience: null,
      reverb: [1.5, 3],
      flashlight: false,
      flashlightOn: false,
      flashlightIntensity: 30,
      shadows: false,
      height: 2.7,
    };
    this.floorFn = null;
    this.speedFn = null;
    this.surfaceFn = null;
    this.onUpdate = null;
    this.onDispose = [];
    this.bakeSources = [];
    this.bakeUniforms = null;
    this.distFromSpawn = null;
    this.maxDist = 1;
    // levels last a few minutes, a little shorter the deeper you drift
    this.duration = this.rng.float(170, 300) * Math.max(0.65, 1 - depth * 0.04);
    this.timeLeft = this.duration;
    // other levels leaking into this one (see bleed.js)
    this.bleedStages = bleed;
    this.bleedZones = [];
    this.bleedLevel = 0;
    this.bleedZone = null;

    stage.build(this);
    if (!this.distFromSpawn) this.finalizeLayout();
    if (bleed.length) applyBleed(this);
    if (!attract) this.placeDoors(stage.doorCount ?? 2);
    if (this.env.bake !== false) this.bake();
  }

  /** Bakes fixture light and ambient occlusion into the level's geometry. */
  bake() {
    const b = { hemi: 0.5, dynamic: 0.55, bounce: 0.3, ao: 1, radius: 11, ...(this.env.bake || {}) };
    this.bakeUniforms = bakeWorld(this, this.bakeSources, b);
    this.root.traverse((o) => {
      if (o.isHemisphereLight) o.intensity *= b.hemi;
    });
    if (this.lightPool) {
      this.lightPool.baseIntensity *= b.dynamic;
      for (const f of this.lightPool.fixtures) if (f.intensity !== undefined) f.intensity *= b.dynamic;
    }
  }

  /**
   * Baked light arriving at a point (for moving things that can't be baked):
   * writes irradiance into `out` (Vector3), zero when the level isn't baked.
   */
  probe(pos, out) {
    if (!this.baker || !this.bakeUniforms) return out.set(0, 0, 0);
    const [i, j] = this.grid.cellOf(pos.x, pos.z);
    _pp.set(pos.x, pos.y + 1.1, pos.z);
    this.baker.irradiance(_pp, null, i, j, out);
    return out.multiplyScalar(this.bakeUniforms.scale.value * 0.8);
  }

  /** Call after carving the grid: seals pockets and computes distances. */
  finalizeLayout() {
    const [si, sj] = this.grid.cellOf(this.spawn.x, this.spawn.z);
    this.distFromSpawn = this.grid.sealUnreachable(si, sj);
    let max = 1;
    for (let k = 0; k < this.distFromSpawn.length; k++) if (this.distFromSpawn[k] > max) max = this.distFromSpawn[k];
    this.maxDist = max;
  }

  /** 0 (calm) .. ~1.5 (deeply wrong) for a cell. */
  unease(i, j) {
    const d = this.distFromSpawn ? this.distFromSpawn[j * this.grid.w + i] : 0;
    const frac = d > 0 ? d / this.maxDist : 0;
    return Math.min(1.5, this.depth * 0.12 + frac * 0.55 + (this.stage.baseUnease || 0));
  }

  uneaseAt(x, z) {
    const [i, j] = this.grid.cellOf(x, z);
    return this.grid.inBounds(i, j) ? this.unease(i, j) : 0;
  }

  // ---- queries used by the player ----------------------------------------

  floorAt(x, z) {
    return this.floorFn ? this.floorFn(x, z) : this.grid.floorAt(x, z);
  }

  speedAt(x, z) {
    return this.speedFn ? this.speedFn(x, z) : 1;
  }

  surfaceAt(x, z) {
    return this.surfaceFn ? this.surfaceFn(x, z) : 'carpet';
  }

  cellType(x, z) {
    const [i, j] = this.grid.cellOf(x, z);
    return this.grid.get(i, j);
  }

  isWater(x, z) {
    return this.cellType(x, z) === WATER;
  }

  // ---- collision -----------------------------------------------------------

  addBox(x0, z0, x1, z1, y0 = -Infinity, y1 = Infinity) {
    const b = { x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), y0, y1 };
    const cs = this.grid.cs;
    for (let j = Math.floor(b.z0 / cs); j <= Math.floor(b.z1 / cs); j++) {
      for (let i = Math.floor(b.x0 / cs); i <= Math.floor(b.x1 / cs); i++) {
        const k = cellKey(i, j);
        if (!this.boxHash.has(k)) this.boxHash.set(k, []);
        this.boxHash.get(k).push(b);
      }
    }
    return b;
  }

  addFootprint(x, z, w, d, yaw = 0) {
    const c = Math.abs(Math.cos(yaw));
    const s = Math.abs(Math.sin(yaw));
    const hw = (w * c + d * s) / 2;
    const hd = (w * s + d * c) / 2;
    return this.addBox(x - hw, z - hd, x + hw, z + hd);
  }

  addCircle(obj, r) {
    const c = { obj, r };
    this.circles.push(c);
    return c;
  }

  /**
   * Pushes a circle at `pos` out of walls, props and ledges too high to step
   * onto from feet height `feetY`.
   */
  collide(pos, r, feetY = null) {
    const g = this.grid;
    const cs = g.cs;
    for (let iter = 0; iter < 2; iter++) {
      const ci = Math.floor(pos.x / cs);
      const cj = Math.floor(pos.z / cs);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const i = ci + di;
          const j = cj + dj;
          let block = g.solid(i, j);
          if (!block && feetY !== null && (di || dj) && g.get(i, j) !== HOLE) {
            // a ledge is a wall if its nearest floor point is too high
            const px = Math.max(i * cs + 0.01, Math.min(pos.x, (i + 1) * cs - 0.01));
            const pz = Math.max(j * cs + 0.01, Math.min(pos.z, (j + 1) * cs - 0.01));
            block = this.floorAt(px, pz) > feetY + STEP_UP;
          }
          if (block) pushOutBox(pos, r, i * cs, j * cs, (i + 1) * cs, (j + 1) * cs);
          const list = this.boxHash.get(cellKey(i, j));
          if (list) {
            for (const b of list) {
              if (feetY !== null && (feetY > b.y1 || feetY + 1.7 < b.y0)) continue;
              pushOutBox(pos, r, b.x0, b.z0, b.x1, b.z1);
            }
          }
        }
      }
      for (const c of this.circles) {
        const p = c.obj.position || c.obj;
        const dx = pos.x - p.x;
        const dz = pos.z - p.z;
        const d = Math.hypot(dx, dz);
        const min = r + c.r;
        if (d < min && d > 1e-5) {
          pos.x += (dx / d) * (min - d);
          pos.z += (dz / d) * (min - d);
        }
      }
    }
  }

  // ---- entities ------------------------------------------------------------

  add(entity) {
    this.entities.push(entity);
    if (entity.object) this.root.add(entity.object);
    if (entity.interact) this.interactables.push(entity);
    return entity;
  }

  remove(entity) {
    this.entities = this.entities.filter((e) => e !== entity);
    this.interactables = this.interactables.filter((e) => e !== entity);
    if (entity.object) this.root.remove(entity.object);
    entity.dispose?.();
  }

  /** Walkable cells far from spawn and from each other. */
  pickFarCells(n, { minFrac = 0.35, spacing = 6, avoid = [], filter = null } = {}) {
    const g = this.grid;
    const d = this.distFromSpawn;
    const candidates = [];
    for (let j = 0; j < g.h; j++) {
      for (let i = 0; i < g.w; i++) {
        const k = j * g.w + i;
        if (d[k] < this.maxDist * minFrac) continue;
        if (filter && !filter(i, j)) continue;
        candidates.push([i, j]);
      }
    }
    this.rng.shuffle(candidates);
    const chosen = [];
    const taken = [...avoid];
    for (let s = spacing; s >= 1 && chosen.length < n; s = Math.floor(s * 0.7)) {
      for (const c of candidates) {
        if (chosen.length >= n) break;
        if (taken.some((t) => Math.abs(t[0] - c[0]) + Math.abs(t[1] - c[1]) < s)) continue;
        chosen.push(c);
        taken.push(c);
      }
    }
    return chosen;
  }

  // ---- doors elsewhere -------------------------------------------------------

  placeDoors(n) {
    const g = this.grid;
    const d = this.distFromSpawn;
    const used = this.usedMounts || new Set();
    const mounts = wallMounts(g, (c, i, j) => d[j * g.w + i] > this.maxDist * 0.3 && c !== WATER && g.countSolidNeighbors(i, j) <= 2)
      .filter((m) => !used.has(`${m.i},${m.j},${m.nx},${m.nz}`) && !this.blockedMount(m));
    this.rng.shuffle(mounts);
    const chosen = [];
    for (const m of mounts) {
      if (chosen.length >= n) break;
      if (chosen.some((c) => Math.abs(c.i - m.i) + Math.abs(c.j - m.j) < (g.w + g.h) / 5)) continue;
      chosen.push(m);
    }
    let others = this.stages.map((_, i) => i).filter((i) => this.stages[i] !== this.stage);
    if (!others.length) others = [Math.max(0, this.stages.indexOf(this.stage))];
    // doors favour levels you haven't drifted through yet
    const w = this.stageWeights;
    if (w) this.rng.weightedShuffle(others, (i) => w[i] ?? 1);
    else this.rng.shuffle(others);
    chosen.forEach((m, k) => {
      used.add(`${m.i},${m.j},${m.nx},${m.nz}`);
      const dest = others[k % Math.max(1, others.length)];
      const model = this.stage.makeDoor(this, this.stages[dest]);
      this.doors.push(this.add(new DriftDoor(this, m, model, dest)));
    });
    this.usedMounts = used;
  }

  /** A door needs clear floor in front of it. */
  blockedMount(m) {
    const cx = m.x + m.nx * 0.9;
    const cz = m.z + m.nz * 0.9;
    const list = this.boxHash.get(cellKey(Math.floor(cx / this.grid.cs), Math.floor(cz / this.grid.cs)));
    if (!list) return false;
    return list.some((b) => cx > b.x0 - 0.6 && cx < b.x1 + 0.6 && cz > b.z0 - 0.6 && cz < b.z1 + 0.6);
  }

  update(dt, ctx) {
    if (this.bleedZones.length) {
      const b = updateBleed(this, dt, ctx.player.pos);
      this.bleedLevel = b.level;
      this.bleedZone = b.zone;
    }
    for (const e of this.entities) e.update?.(dt, ctx);
    for (const a of this.animated) a(dt, ctx);
    this.onUpdate?.(dt, ctx);
    if (this.lightPool) this.lightPool.update(dt, ctx.t, ctx.camera.position);
  }

  dispose() {
    for (const e of this.entities) e.dispose?.();
    for (const fn of this.onDispose) fn();
    this.root.traverse((o) => {
      // instance buffers, bone textures and shadow maps live on the object itself
      if (o.isInstancedMesh) o.dispose();
      if (o.isSkinnedMesh) o.skeleton?.dispose();
      if (o.isLight) o.dispose();
      // sprites share one global quad
      if (o.geometry && !o.geometry.userData.shared && !o.isSprite) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (m.userData.shared) continue;
          for (const key in m) {
            const t = m[key];
            if (t?.isTexture && !t.userData.cached) t.dispose();
          }
          m.dispose();
        }
      }
    });
    this.root.parent?.remove(this.root);
  }
}

function pushOutBox(pos, r, x0, z0, x1, z1) {
  const cx = Math.max(x0, Math.min(pos.x, x1));
  const cz = Math.max(z0, Math.min(pos.z, z1));
  const dx = pos.x - cx;
  const dz = pos.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return;
  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    pos.x += (dx / d) * (r - d);
    pos.z += (dz / d) * (r - d);
  } else {
    const pl = pos.x - x0 + r;
    const pr = x1 - pos.x + r;
    const pt = pos.z - z0 + r;
    const pb = z1 - pos.z + r;
    const m = Math.min(pl, pr, pt, pb);
    if (m === pl) pos.x -= pl;
    else if (m === pr) pos.x += pr;
    else if (m === pt) pos.z -= pt;
    else pos.z += pb;
  }
}

export { DIRS };
