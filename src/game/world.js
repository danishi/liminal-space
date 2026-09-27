import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { wallMounts, WATER } from '../core/grid.js';
import { Fragment } from '../entities/fragment.js';
import { ExitDoor } from '../entities/exitdoor.js';

/**
 * A built stage: geometry, collision, entities and objective state.
 * Stage modules fill it in through build(world).
 */
export class World {
  constructor(game, stage, seed, { attract = false, lights = 6 } = {}) {
    this.lightCount = lights;
    this.game = game;
    this.stage = stage;
    this.seed = seed;
    this.rng = new RNG(seed);
    this.attract = attract;
    this.root = new THREE.Group();
    this.entities = [];
    this.interactables = [];
    this.boxes = [];
    this.boxHash = new Map();
    this.circles = [];
    this.fragments = [];
    this.collected = 0;
    this.exit = null;
    this.lightPool = null;
    this.spawn = { x: 0, z: 0, yaw: 0 };
    this.npcMarkers = [];
    this.env = {
      background: 0x000000,
      fog: null,
      exposure: 1,
      postfx: {},
      ambience: null,
      reverb: [1.5, 3],
      flashlight: false, // available?
      flashlightOn: false,
      flashlightIntensity: 30,
      darkness: 0, // 0..1, drains sanity when the flashlight is off
      sanityRegen: 1,
      shadows: false,
    };
    this.floorFn = null;
    this.speedFn = null;
    this.surfaceFn = null;
    this.onUpdate = null;
    this.onDispose = [];

    stage.build(this);
    this.distFromSpawn = this.grid.distances(...this.grid.cellOf(this.spawn.x, this.spawn.z));
    if (!stage.customObjectives) this.placeObjectives();
  }

  // ---- queries used by the player ----------------------------------------

  floorAt(x, z) {
    return this.floorFn ? this.floorFn(x, z) : 0;
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

  addBox(x0, z0, x1, z1) {
    const b = { x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) };
    this.boxes.push(b);
    const cs = this.grid.cs;
    for (let j = Math.floor(b.z0 / cs); j <= Math.floor(b.z1 / cs); j++) {
      for (let i = Math.floor(b.x0 / cs); i <= Math.floor(b.x1 / cs); i++) {
        const k = `${i},${j}`;
        if (!this.boxHash.has(k)) this.boxHash.set(k, []);
        this.boxHash.get(k).push(b);
      }
    }
    return b;
  }

  /** Axis-aligned box collider for a rotated footprint (w × d, yaw multiple of 90°). */
  addFootprint(x, z, w, d, yaw = 0) {
    const swap = Math.abs(Math.sin(yaw)) > 0.5;
    const hw = (swap ? d : w) / 2;
    const hd = (swap ? w : d) / 2;
    return this.addBox(x - hw, z - hd, x + hw, z + hd);
  }

  addCircle(obj, r) {
    const c = { obj, r };
    this.circles.push(c);
    return c;
  }

  collide(pos, r) {
    const g = this.grid;
    const cs = g.cs;
    for (let iter = 0; iter < 2; iter++) {
      const ci = Math.floor(pos.x / cs);
      const cj = Math.floor(pos.z / cs);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const i = ci + di;
          const j = cj + dj;
          if (g.solid(i, j)) pushOutBox(pos, r, i * cs, j * cs, (i + 1) * cs, (j + 1) * cs);
          const list = this.boxHash.get(`${i},${j}`);
          if (list) for (const b of list) pushOutBox(pos, r, b.x0, b.z0, b.x1, b.z1);
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

  /** Is a world point blocked by walls or props (for spawning and AI)? */
  blocked(x, z, r = 0.3) {
    const p = { x, z };
    this.collide(p, r);
    return Math.hypot(p.x - x, p.z - z) > 0.01;
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

  // ---- objectives ----------------------------------------------------------

  /** Picks walkable cells far from spawn and from each other. */
  pickFarCells(n, { minFrac = 0.35, spacing = 6, avoid = [], filter = null } = {}) {
    const g = this.grid;
    const d = this.distFromSpawn;
    let max = 0;
    for (let k = 0; k < d.length; k++) if (d[k] > max) max = d[k];
    const candidates = [];
    for (let j = 0; j < g.h; j++) {
      for (let i = 0; i < g.w; i++) {
        const k = j * g.w + i;
        if (d[k] < max * minFrac) continue;
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

  placeObjectives() {
    const g = this.grid;
    const d = this.distFromSpawn;
    // exit: the reachable wall mount farthest from spawn (with some randomness)
    const mounts = wallMounts(g, (c, i, j) => d[j * g.w + i] > 0 && c !== WATER && g.countSolidNeighbors(i, j) <= 2);
    mounts.sort((a, b) => d[b.j * g.w + b.i] - d[a.j * g.w + a.i]);
    const top = mounts.slice(0, Math.max(1, Math.floor(mounts.length * 0.05)));
    const mount = this.stage.pickExitMount ? this.stage.pickExitMount(this, mounts) : this.rng.pick(top);
    if (mount) {
      this.exit = this.add(new ExitDoor(this, mount, this.stage.makeExit(this)));
    }
    const avoid = mount ? [[mount.i, mount.j]] : [];
    const cells = this.pickFarCells(3, {
      minFrac: 0.3,
      spacing: Math.floor((g.w + g.h) / 6),
      avoid: [...avoid, ...this.npcMarkers.map((m) => g.cellOf(m.x, m.z))],
      filter: (i, j) => g.get(i, j) !== WATER || this.stage.fragmentsInWater,
    });
    const memories = this.stage.memories || [];
    cells.forEach(([i, j], n) => {
      const c = g.center(i, j);
      const y = this.floorAt(c.x, c.z) + 1.1;
      this.fragments.push(this.add(new Fragment(this, new THREE.Vector3(c.x, y, c.z), this.stage.fragmentColor || 0xfff2a8, memories[n] || '')));
    });
  }

  collect(fragment) {
    this.collected++;
    this.remove(fragment);
    if (this.collected >= this.fragments.length && this.exit) this.exit.unlock();
  }

  update(dt, ctx) {
    for (const e of this.entities) e.update?.(dt, ctx);
    this.onUpdate?.(dt, ctx);
    if (this.lightPool) this.lightPool.update(dt, ctx.t, ctx.camera.position);
  }

  dispose() {
    for (const e of this.entities) e.dispose?.();
    for (const fn of this.onDispose) fn();
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          for (const key of ['map', 'emissiveMap', 'alphaMap']) {
            const t = m[key];
            if (t && !t.userData.cached) t.dispose();
          }
          m.dispose();
        }
      }
    });
    if (this.lightPool) for (const l of this.lightPool.lights) l.parent?.remove(l);
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
    // centre inside the box: push out along the shallowest axis
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
