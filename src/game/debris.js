import * as THREE from 'three';
import { patchMaterial } from '../core/bake.js';
import { glowSprite } from '../core/textures.js';

// Pieces of a level falling away into the void (see collapse.js): slabs of
// floor, lumps of wall and ceiling, grit, and dust. Chunks are instances of a
// unit box, one instanced mesh per surface material (a copy the collapse never
// cuts away); they darken as they fall away from the light.

const CAP = 96;
const GRAVITY = 11;
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _a = new THREE.Vector3();

/** A plain copy of a material (without its shader patches, and without deep-copying its userData). */
function copyMaterial(src) {
  const ud = src.userData;
  src.userData = {};
  try {
    return src.clone();
  } finally {
    src.userData = ud;
  }
}

export class Debris {
  /** materials: the level's surface materials that get debris of their own. */
  constructor(world, materials) {
    this.world = world;
    this.sets = new Map();
    // for surfaces with no material of their own
    this.rubble = new THREE.MeshStandardMaterial({ color: 0x77726a, roughness: 0.95 });
    for (const m of [...materials, this.rubble]) this.sets.set(m, this.makeSet(m));
    this.dust = new Dust(world);
  }

  makeSet(src) {
    const mat = src === this.rubble ? src : copyMaterial(src);
    // freed below rather than by World.dispose: its textures belong to the level
    mat.userData = { shared: true };
    mat.vertexColors = false;
    if (this.world.bakeUniforms) patchMaterial(mat, this.world.bakeUniforms);
    this.world.onDispose.push(() => mat.dispose());
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const uv = geo.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 0.35, uv.getY(k) * 0.35);
    const bake = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('bake', bake);
    const mesh = new THREE.InstancedMesh(geo, mat, CAP);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.userData.noCollapse = true;
    this.world.root.add(mesh);
    return { mesh, bake, chunks: new Array(CAP).fill(null), next: 0 };
  }

  /**
   * A box of `mat` centred at (x, y, z) that drops away.
   * o: { vx, vy, vz, spin (rad/s), wait (s before it starts to fall), light: [r, g, b] baked irradiance }
   */
  spawn(mat, x, y, z, sx, sy, sz, o = {}) {
    const set = this.sets.get(mat) || this.sets.get(this.rubble);
    const k = set.next;
    set.next = (k + 1) % CAP;
    set.mesh.count = Math.max(set.mesh.count, k + 1);
    _a.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    const l = o.light || [0, 0, 0];
    set.chunks[k] = {
      x, y, z, y0: y, sx, sy, sz,
      vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0,
      ax: _a.x, ay: _a.y, az: _a.z, ang: 0, spin: o.spin ?? 1, wait: o.wait || 0,
      r: l[0], g: l[1], b: l[2],
    };
  }

  update(dt) {
    for (const set of this.sets.values()) {
      const { mesh, bake, chunks } = set;
      if (!mesh.count) continue;
      let live = 0;
      for (let k = 0; k < mesh.count; k++) {
        const c = chunks[k];
        if (!c) continue;
        if (c.wait > 0) c.wait -= dt;
        else {
          c.vy -= GRAVITY * dt;
          c.x += c.vx * dt;
          c.y += c.vy * dt;
          c.z += c.vz * dt;
          c.ang += c.spin * dt;
        }
        if (c.y < c.y0 - 30) {
          chunks[k] = null;
          mesh.setMatrixAt(k, HIDDEN);
          continue;
        }
        live++;
        _q.setFromAxisAngle(_a.set(c.ax, c.ay, c.az), c.ang);
        mesh.setMatrixAt(k, _m.compose(_p.set(c.x, c.y, c.z), _q, _s.set(c.sx, c.sy, c.sz)));
        // darker the further it falls from the light
        const f = Math.exp((c.y - c.y0) / 6);
        bake.setXYZW(k, c.r * f, c.g * f, c.b * f, 1);
      }
      mesh.instanceMatrix.needsUpdate = true;
      bake.needsUpdate = true;
      if (!live) {
        mesh.count = 0;
        set.next = 0;
      }
    }
    this.dust.update(dt);
  }
}

/** Motes of dust: sifting from a ceiling about to go, and puffs where the floor went. */
class Dust {
  constructor(world, cap = 360) {
    this.cap = cap;
    this.pos = new Float32Array(cap * 3);
    this.vel = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 4);
    this.life = new Float32Array(cap);
    this.span = new Float32Array(cap);
    this.bright = new Float32Array(cap);
    this.next = 0;
    this.awake = false;
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('color', this.colAttr);
    const mat = new THREE.PointsMaterial({ map: glowSprite(), size: 0.06, vertexColors: true, transparent: true, depthWrite: false });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.userData.noCollapse = true;
    world.root.add(this.points);
  }

  /**
   * n motes around (x, y, z), scattered ±spread over the floor plane.
   * o: { vx, vy, vz, jitter, burst (outward speed), life (s), bright (0..1) }
   */
  emit(n, x, y, z, { spread = 0.5, vx = 0, vy = 0, vz = 0, jitter = 0.3, burst = 0, life = 2, bright = 0.5 } = {}) {
    for (let a = 0; a < n; a++) {
      const k = this.next;
      this.next = (k + 1) % this.cap;
      const ox = (Math.random() - 0.5) * 2 * spread;
      const oz = (Math.random() - 0.5) * 2 * spread;
      const d = Math.hypot(ox, oz) || 1;
      this.pos[k * 3] = x + ox;
      this.pos[k * 3 + 1] = y + (Math.random() - 0.5) * 0.1;
      this.pos[k * 3 + 2] = z + oz;
      this.vel[k * 3] = vx + (Math.random() - 0.5) * jitter + (ox / d) * burst * Math.random();
      this.vel[k * 3 + 1] = vy + (Math.random() - 0.5) * jitter;
      this.vel[k * 3 + 2] = vz + (Math.random() - 0.5) * jitter + (oz / d) * burst * Math.random();
      this.life[k] = this.span[k] = life * (0.6 + Math.random() * 0.6);
      this.bright[k] = bright;
    }
    this.awake = true;
  }

  update(dt) {
    if (!this.awake) return;
    let any = false;
    const drag = Math.exp(-dt * 1.6);
    for (let k = 0; k < this.cap; k++) {
      if (this.life[k] <= 0) {
        this.col[k * 4 + 3] = 0;
        continue;
      }
      any = true;
      this.life[k] -= dt;
      const v = k * 3;
      // motes slow in the air and settle downward
      this.vel[v] *= drag;
      this.vel[v + 2] *= drag;
      this.vel[v + 1] = this.vel[v + 1] * drag - 0.5 * dt;
      this.pos[v] += this.vel[v] * dt;
      this.pos[v + 1] += this.vel[v + 1] * dt;
      this.pos[v + 2] += this.vel[v + 2] * dt;
      const t = Math.max(0, this.life[k] / this.span[k]);
      const b = this.bright[k];
      this.col[k * 4] = 0.86 * b;
      this.col[k * 4 + 1] = 0.83 * b;
      this.col[k * 4 + 2] = 0.77 * b;
      this.col[k * 4 + 3] = Math.min(1, (1 - t) * 8) * t * 0.8;
    }
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.awake = any;
  }
}
