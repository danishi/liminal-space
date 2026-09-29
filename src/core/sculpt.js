import * as THREE from 'three';
import { surface, fbm } from './surfaces.js';

// Sculpting: characters and organic props are modelled as signed distance
// fields (spheres, ellipsoids, round cones and round boxes blended with
// smooth unions and carved with smooth subtractions), then polygonised with
// narrow-band surface nets. Each primitive carries a paint region and a bone,
// so the resulting mesh gets vertex colours, per-vertex roughness and
// automatic skin weights in the same pass. Results are cached by key.

const cache = new Map();

// ---- noise ----------------------------------------------------------------

function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth 3D value noise, 0..1. */
export function noise3(x, y, z) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (i, j, k) => hash3(xi + i, yi + j, zi + k);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
    l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}

// ---- primitives -----------------------------------------------------------

const SPHERE = 0;
const ELLIPSOID = 1;
const CONE = 2;
const BOX = 3;
const TORUS = 4;
const CYL = 5;

function rotInverse(rot) {
  if (!rot) return null;
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0] || 0, rot[1] || 0, rot[2] || 0));
  m.invert();
  const e = m.elements;
  // row-major 3x3 of the inverse rotation
  return [e[0], e[4], e[8], e[1], e[5], e[9], e[2], e[6], e[10]];
}

function primDist(p, x, y, z) {
  let d;
  if (p.t === SPHERE) {
    d = Math.hypot(x - p.cx, y - p.cy, z - p.cz) - p.r;
  } else if (p.t === CONE) {
    // Inigo Quilez's round cone between two points
    const pax = x - p.ax;
    const pay = y - p.ay;
    const paz = z - p.az;
    const l2 = p.l2;
    const yy = pax * p.bax + pay * p.bay + paz * p.baz;
    const zz = yy - l2;
    const qx = pax * l2 - p.bax * yy;
    const qy = pay * l2 - p.bay * yy;
    const qz = paz * l2 - p.baz * yy;
    const x2 = qx * qx + qy * qy + qz * qz;
    const y2 = yy * yy * l2;
    const z2 = zz * zz * l2;
    const k = Math.sign(p.rr) * p.rr * p.rr * x2;
    if (Math.sign(zz) * p.a2 * z2 > k) d = Math.sqrt(x2 + z2) * p.il2 - p.rb;
    else if (Math.sign(yy) * p.a2 * y2 < k) d = Math.sqrt(x2 + y2) * p.il2 - p.ra;
    else d = (Math.sqrt(x2 * p.a2 * p.il2) + yy * p.rr) * p.il2 - p.ra;
  } else {
    let lx = x - p.cx;
    let ly = y - p.cy;
    let lz = z - p.cz;
    if (p.inv) {
      const m = p.inv;
      const tx = m[0] * lx + m[1] * ly + m[2] * lz;
      const ty = m[3] * lx + m[4] * ly + m[5] * lz;
      const tz = m[6] * lx + m[7] * ly + m[8] * lz;
      lx = tx;
      ly = ty;
      lz = tz;
    }
    if (p.t === ELLIPSOID) {
      const k0 = Math.hypot(lx / p.rx, ly / p.ry, lz / p.rz);
      const k1 = Math.hypot(lx / (p.rx * p.rx), ly / (p.ry * p.ry), lz / (p.rz * p.rz));
      d = k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(p.rx, p.ry, p.rz);
    } else if (p.t === BOX) {
      const qx = Math.abs(lx) - p.hx + p.r;
      const qy = Math.abs(ly) - p.hy + p.r;
      const qz = Math.abs(lz) - p.hz + p.r;
      d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - p.r;
    } else if (p.t === CYL) {
      // rounded cylinder along local Y
      const dx = Math.hypot(lx, lz) - p.r + p.rr;
      const dy = Math.abs(ly) - p.hh + p.rr;
      d = Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - p.rr;
    } else {
      // torus in the local XZ plane
      const q = Math.hypot(lx, lz) - p.R;
      d = Math.hypot(q, ly) - p.r;
    }
  }
  if (p.clip) {
    const c = p.clip;
    d = Math.max(d, x * c[0] + y * c[1] + z * c[2] - c[3]);
  }
  if (p.noise) d += p.noise[0] * (noise3(x * p.noise[1] + 17.3, y * p.noise[1], z * p.noise[1] - 5.1) * 2 - 1);
  return d;
}

/** Signed distance of a list of primitives. */
function evalList(prims, x, y, z) {
  let d = 1e9;
  for (let n = 0; n < prims.length; n++) {
    const p = prims[n];
    const di = primDist(p, x, y, z);
    d = p.cut ? smax(d, -di, p.k) : smin(d, di, p.k);
  }
  return d;
}

function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

function smax(a, b, k) {
  return -smin(-a, -b, k);
}

/**
 * Collects primitives. Options on every primitive:
 *   k     blend radius with what came before (smooth union / subtraction)
 *   bone  bone name for skinning
 *   mat   paint region
 *   cut   subtract instead of add
 *   rot   [x, y, z] Euler rotation (ellipsoid, box, torus)
 *   clip  [nx, ny, nz, o]: keep only the half-space n·p < o
 *   noise [amplitude, frequency] surface displacement
 */
export class Sculpt {
  constructor({ bone = 'root', mat = 'skin', k = 0.02 } = {}) {
    this.prims = [];
    this.ctx = { bone, mat, k };
  }

  /** Runs fn with some default options (bone, mat, k) changed. */
  with(opts, fn) {
    const prev = this.ctx;
    this.ctx = { ...prev, ...opts };
    fn(this);
    this.ctx = prev;
    return this;
  }

  push(p, o) {
    Object.assign(p, { k: this.ctx.k, bone: this.ctx.bone, mat: this.ctx.mat, cut: !!this.ctx.cut, noise: this.ctx.noise, clip: this.ctx.clip }, o);
    if (o.rot) p.inv = rotInverse(o.rot);
    this.prims.push(p);
    return this;
  }

  sphere(c, r, o = {}) {
    return this.push({ t: SPHERE, cx: c[0], cy: c[1], cz: c[2], r, ext: r }, o);
  }

  ellipsoid(c, rad, o = {}) {
    return this.push({ t: ELLIPSOID, cx: c[0], cy: c[1], cz: c[2], rx: rad[0], ry: rad[1], rz: rad[2], ext: Math.max(...rad) }, o);
  }

  /** Round cone (capsule when ra == rb) from a to b. */
  cone(a, b, ra, rb = ra, o = {}) {
    const bax = b[0] - a[0];
    const bay = b[1] - a[1];
    const baz = b[2] - a[2];
    let l2 = bax * bax + bay * bay + baz * baz;
    if (l2 < 1e-8) return this.sphere(a, Math.max(ra, rb), o);
    // the formula needs |ra - rb| < length
    const len = Math.sqrt(l2);
    if (Math.abs(ra - rb) > len * 0.98) {
      if (ra > rb) rb = ra - len * 0.98;
      else ra = rb - len * 0.98;
    }
    const rr = ra - rb;
    return this.push({
      t: CONE, ax: a[0], ay: a[1], az: a[2], bax, bay, baz, l2, rr, a2: l2 - rr * rr, il2: 1 / l2, ra, rb,
      cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2, cz: (a[2] + b[2]) / 2, ext: len / 2 + Math.max(ra, rb),
    }, o);
  }

  /** A chain of round cones through points with radii. */
  chain(points, radii, o = {}) {
    for (let n = 0; n < points.length - 1; n++) this.cone(points[n], points[n + 1], radii[n], radii[n + 1], o);
    return this;
  }

  box(c, half, r = 0.01, o = {}) {
    return this.push({ t: BOX, cx: c[0], cy: c[1], cz: c[2], hx: half[0], hy: half[1], hz: half[2], r, ext: Math.hypot(...half) }, o);
  }

  /** Rounded cylinder along local Y (use rot to orient), half-height hh. */
  cyl(c, r, hh, round = 0.005, o = {}) {
    return this.push({ t: CYL, cx: c[0], cy: c[1], cz: c[2], r, hh, rr: Math.min(round, r, hh), ext: Math.hypot(r, hh) }, o);
  }

  torus(c, R, r, o = {}) {
    return this.push({ t: TORUS, cx: c[0], cy: c[1], cz: c[2], R, r, ext: R + r }, o);
  }

  cut(fn) {
    return this.with({ cut: true }, fn);
  }

  bounds(pad) {
    const b = new THREE.Box3();
    for (const p of this.prims) {
      if (p.cut) continue;
      const e = p.ext + (p.noise ? p.noise[0] : 0) + pad;
      b.expandByPoint(new THREE.Vector3(p.cx - e, p.cy - e, p.cz - e));
      b.expandByPoint(new THREE.Vector3(p.cx + e, p.cy + e, p.cz + e));
    }
    return b;
  }
}

// ---- polygonisation -------------------------------------------------------

/**
 * Naive surface nets over a narrow band: blocks far from the surface are
 * skipped, vertices are projected back onto the field with a couple of
 * Newton steps and get normals from its gradient.
 */
function polygonize(prims, box, h) {
  const nx = Math.ceil((box.max.x - box.min.x) / h) + 1;
  const ny = Math.ceil((box.max.y - box.min.y) / h) + 1;
  const nz = Math.ceil((box.max.z - box.min.z) / h) + 1;
  const ox = box.min.x;
  const oy = box.min.y;
  const oz = box.min.z;
  const sx = nx + 1;
  const sxy = (nx + 1) * (ny + 1);
  const F = new Float32Array((nx + 1) * (ny + 1) * (nz + 1));
  const B = 4;
  const bx = Math.ceil((nx + 1) / B);
  const by = Math.ceil((ny + 1) / B);
  const bz = Math.ceil((nz + 1) / B);
  const reach = B * h * 0.9 + h * 1.5;
  // each block only evaluates the primitives that can reach it
  let maxK = 0;
  for (const p of prims) maxK = Math.max(maxK, p.k);
  const margin = reach + maxK + h * 2;
  const R = B * h * 0.87 + h;
  const lists = new Array(bx * by * bz);
  const nearB = new Uint8Array(bx * by * bz);
  const fnAt = (x, y, z) => {
    const ib = Math.max(0, Math.min(bx - 1, Math.floor((x - ox) / h / B)));
    const jb = Math.max(0, Math.min(by - 1, Math.floor((y - oy) / h / B)));
    const kb = Math.max(0, Math.min(bz - 1, Math.floor((z - oz) / h / B)));
    return evalList(lists[(kb * by + jb) * bx + ib], x, y, z);
  };
  for (let kb = 0; kb < bz; kb++) {
    for (let jb = 0; jb < by; jb++) {
      for (let ib = 0; ib < bx; ib++) {
        const cx = ox + (ib * B + B / 2) * h;
        const cy = oy + (jb * B + B / 2) * h;
        const cz = oz + (kb * B + B / 2) * h;
        const list = prims.filter((p) => Math.hypot(cx - p.cx, cy - p.cy, cz - p.cz) - p.ext - (p.noise ? p.noise[0] : 0) - R < margin);
        lists[(kb * by + jb) * bx + ib] = list;
        const dc = evalList(list, cx, cy, cz);
        const far = Math.abs(dc) > reach;
        nearB[(kb * by + jb) * bx + ib] = far ? 0 : 1;
        for (let k = kb * B; k < Math.min(nz + 1, kb * B + B); k++) {
          for (let j = jb * B; j < Math.min(ny + 1, jb * B + B); j++) {
            for (let i = ib * B; i < Math.min(nx + 1, ib * B + B); i++) {
              F[k * sxy + j * sx + i] = far ? dc : evalList(list, ox + i * h, oy + j * h, oz + k * h);
            }
          }
        }
      }
    }
  }
  const fn = fnAt;
  // only cells in (or next to) blocks near the surface can hold it
  const active = new Uint8Array(bx * by * bz);
  for (let kb = 0; kb < bz; kb++) {
    for (let jb = 0; jb < by; jb++) {
      for (let ib = 0; ib < bx; ib++) {
        if (!nearB[(kb * by + jb) * bx + ib]) continue;
        for (let dk = -1; dk <= 1; dk++) {
          for (let dj = -1; dj <= 1; dj++) {
            for (let di = -1; di <= 1; di++) {
              const a = ib + di;
              const b = jb + dj;
              const c = kb + dk;
              if (a >= 0 && b >= 0 && c >= 0 && a < bx && b < by && c < bz) active[(c * by + b) * bx + a] = 1;
            }
          }
        }
      }
    }
  }
  const blocks = [];
  for (let n = 0; n < active.length; n++) if (active[n]) blocks.push(n);

  const cellIdx = new Int32Array(nx * ny * nz).fill(-1);
  const P = [];
  const N = [];
  const e = h * 0.5;
  const grad = (x, y, z, out) => {
    // tetrahedral gradient
    const a = fn(x + e, y - e, z - e);
    const b = fn(x - e, y - e, z + e);
    const c = fn(x - e, y + e, z - e);
    const d = fn(x + e, y + e, z + e);
    out[0] = a - b - c + d;
    out[1] = -a - b + c + d;
    out[2] = -a + b - c + d;
    const l = Math.hypot(out[0], out[1], out[2]) || 1;
    out[0] /= l;
    out[1] /= l;
    out[2] /= l;
    return (a + b + c + d) * 0.25; // the field at the centre, near enough
  };
  const g = [0, 0, 0];
  const corner = new Float32Array(8);
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (const bn of blocks) {
    const ib = bn % bx;
    const jb = ((bn / bx) | 0) % by;
    const kb = (bn / (bx * by)) | 0;
    for (let k = kb * B; k < Math.min(nz, kb * B + B); k++) {
    for (let j = jb * B; j < Math.min(ny, jb * B + B); j++) {
      for (let i = ib * B; i < Math.min(nx, ib * B + B); i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const v = F[(k + (c >> 2)) * sxy + (j + ((c >> 1) & 1)) * sx + i + (c & 1)];
          corner[c] = v;
          if (v < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let px = 0;
        let py = 0;
        let pz = 0;
        let cnt = 0;
        for (const [a, b] of EDGES) {
          const va = corner[a];
          const vb = corner[b];
          if ((va < 0) === (vb < 0)) continue;
          const t = va / (va - vb);
          px += (a & 1) + ((b & 1) - (a & 1)) * t;
          py += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
          pz += (a >> 2) + ((b >> 2) - (a >> 2)) * t;
          cnt++;
        }
        let x = ox + (i + px / cnt) * h;
        let y = oy + (j + py / cnt) * h;
        let z = oz + (k + pz / cnt) * h;
        // one Newton step onto the surface; the gradient doubles as the normal
        const d = Math.max(-h, Math.min(h, grad(x, y, z, g)));
        x -= g[0] * d;
        y -= g[1] * d;
        z -= g[2] * d;
        cellIdx[k * nx * ny + j * nx + i] = P.length / 3;
        P.push(x, y, z);
        N.push(g[0], g[1], g[2]);
      }
    }
    }
  }

  const I = [];
  const cell = (i, j, k) => cellIdx[k * nx * ny + j * nx + i];
  const quad = (a, b, c, d) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    // orient by the vertex normals, split along the shorter diagonal
    const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
    const ux = P[b * 3] - ax, uy = P[b * 3 + 1] - ay, uz = P[b * 3 + 2] - az;
    const vx = P[c * 3] - ax, vy = P[c * 3 + 1] - ay, vz = P[c * 3 + 2] - az;
    const fx = uy * vz - uz * vy;
    const fy = uz * vx - ux * vz;
    const fz = ux * vy - uy * vx;
    const nx_ = N[a * 3] + N[c * 3];
    const ny_ = N[a * 3 + 1] + N[c * 3 + 1];
    const nz_ = N[a * 3 + 2] + N[c * 3 + 2];
    if (fx * nx_ + fy * ny_ + fz * nz_ < 0) {
      const t = b;
      b = d;
      d = t;
    }
    const d2 = (p, q) => (P[p * 3] - P[q * 3]) ** 2 + (P[p * 3 + 1] - P[q * 3 + 1]) ** 2 + (P[p * 3 + 2] - P[q * 3 + 2]) ** 2;
    if (d2(a, c) <= d2(b, d)) I.push(a, b, c, a, c, d);
    else I.push(a, b, d, b, c, d);
  };
  for (const bn of blocks) {
    const ib = bn % bx;
    const jb = ((bn / bx) | 0) % by;
    const kb = (bn / (bx * by)) | 0;
    for (let k = kb * B; k < Math.min(nz + 1, kb * B + B); k++) {
    for (let j = jb * B; j < Math.min(ny + 1, jb * B + B); j++) {
      for (let i = ib * B; i < Math.min(nx + 1, ib * B + B); i++) {
        const v0 = F[k * sxy + j * sx + i] < 0;
        if (i < nx && j > 0 && k > 0 && j < ny && k < nz && v0 !== F[k * sxy + j * sx + i + 1] < 0) {
          quad(cell(i, j - 1, k - 1), cell(i, j, k - 1), cell(i, j, k), cell(i, j - 1, k));
        }
        if (j < ny && i > 0 && k > 0 && i < nx && k < nz && v0 !== F[k * sxy + (j + 1) * sx + i] < 0) {
          quad(cell(i - 1, j, k - 1), cell(i - 1, j, k), cell(i, j, k), cell(i, j, k - 1));
        }
        if (k < nz && i > 0 && j > 0 && i < nx && j < ny && v0 !== F[(k + 1) * sxy + j * sx + i] < 0) {
          quad(cell(i - 1, j - 1, k), cell(i, j - 1, k), cell(i, j, k), cell(i - 1, j, k));
        }
      }
    }
    }
  }
  return { P, N, I };
}

// ---- paint and skin -------------------------------------------------------

const _c = new THREE.Color();

function toColor(c) {
  if (c instanceof THREE.Color) return c.clone();
  if (Array.isArray(c)) return new THREE.Color(c[0], c[1], c[2]);
  return new THREE.Color(c);
}

/**
 * Builds a sculpt into a BufferGeometry.
 *   paints: { region: { color, rough = 0.7, vary = 0.08, freq = 18, emit = 0, fn?(x, y, z, color) } }
 *   bones:  optional list of bone names → adds skinIndex / skinWeight
 *   h:      grid spacing in metres
 */
export function sculptGeometry(key, build, { h = 0.012, paints = {}, bones = null, joints = null, jointR = 0.13, sharp = 0.004, soft = 0.03 } = {}) {
  const ck = `${key}|${h}`;
  if (cache.has(ck)) return cache.get(ck);
  const s = build instanceof Sculpt ? build : build(new Sculpt());
  const { P, N, I } = polygonize(s.prims, s.bounds(h * 3), h);
  const count = P.length / 3;
  const color = new Float32Array(count * 3);
  const rough = new Float32Array(count);
  const emit = new Float32Array(count);
  const skinI = bones ? new Uint16Array(count * 4) : null;
  const skinW = bones ? new Float32Array(count * 4) : null;
  const prims = s.prims;
  const pd = new Float32Array(prims.length);
  const pal = {};
  for (const [name, p] of Object.entries(paints)) pal[name] = { rough: 0.7, vary: 0.08, freq: 18, ...p, col: toColor(p.color ?? 0xffffff) };
  const fallback = { rough: 0.7, vary: 0.05, freq: 18, col: new THREE.Color(0.7, 0.7, 0.7) };
  const regions = Object.keys(pal);
  const regionOf = new Map(regions.map((r, n) => [r, n]));
  const region = new Uint8Array(count);
  const boneIdx = bones ? new Map(bones.map((b, n) => [b, n])) : null;
  const bw = bones ? new Float32Array(bones.length) : null;
  // weights only blend across a joint: between a bone and its parent or child,
  // and only near where they meet (so a hanging hand never drags the hip)
  const link = new Map();
  if (bones && joints) {
    for (const [name, j] of Object.entries(joints)) {
      if (!j.parent) continue;
      const a = boneIdx.get(name);
      const b = boneIdx.get(j.parent);
      link.set(a * 1000 + b, j.pos);
      link.set(b * 1000 + a, j.pos);
    }
  }
  const primBone = bones ? prims.map((p) => boneIdx.get(p.bone) ?? 0) : null;
  const W = bones ? new Float32Array(count * bones.length) : null;
  const dom = bones ? new Int16Array(count) : null;
  for (let v = 0; v < count; v++) {
    const x = P[v * 3];
    const y = P[v * 3 + 1];
    const z = P[v * 3 + 2];
    let dmin = 1e9;
    for (let n = 0; n < prims.length; n++) {
      const p = prims[n];
      // the surface a vertex sits on is the primitive it is closest to (either side)
      let d = Math.abs(primDist(p, x, y, z));
      if (p.cut) d = p.paint === false ? 1e9 : d + 0.002;
      pd[n] = d;
      if (d < dmin) dmin = d;
    }
    let r = 0;
    let g = 0;
    let b = 0;
    let ro = 0;
    let em = 0;
    let wsum = 0;
    let best = 1e9;
    let b0 = -1;
    let bd = 1e9;
    if (bw) {
      bw.fill(0);
      for (let n = 0; n < prims.length; n++) {
        if (!prims[n].cut && pd[n] < bd) {
          bd = pd[n];
          b0 = primBone[n];
        }
      }
    }
    for (let n = 0; n < prims.length; n++) {
      const p = prims[n];
      const dd = pd[n] - dmin;
      if (pd[n] < best) {
        best = pd[n];
        region[v] = regionOf.get(p.mat) ?? 255;
      }
      if (dd < sharp * 8) {
        const w = Math.exp(-dd / sharp);
        const m = pal[p.mat] || fallback;
        _c.copy(m.col);
        if (m.fn) m.fn(x, y, z, _c);
        const nz = m.vary ? 1 + m.vary * (noise3(x * m.freq, y * m.freq, z * m.freq) * 2 - 1) : 1;
        r += _c.r * nz * w;
        g += _c.g * nz * w;
        b += _c.b * nz * w;
        ro += m.rough * w;
        em += (m.emit || 0) * w;
        wsum += w;
      }
      if (bw && !p.cut && pd[n] - bd < soft * 6) {
        const bi = primBone[n];
        let f = 1;
        if (bi !== b0 && joints) {
          const jp = link.get(b0 * 1000 + bi);
          if (!jp) f = 0;
          else {
            const r = Math.hypot(x - jp[0], y - jp[1], z - jp[2]) / jointR;
            f = r >= 1 ? 0 : (1 - r) * (1 - r);
          }
        }
        if (f > 0) bw[bi] += Math.exp(-(pd[n] - bd) / soft) * f;
      }
    }
    color[v * 3] = r / wsum;
    color[v * 3 + 1] = g / wsum;
    color[v * 3 + 2] = b / wsum;
    rough[v] = ro / wsum;
    emit[v] = em / wsum;
    if (bw) {
      W.set(bw, v * bw.length);
      dom[v] = b0;
    }
  }
  if (bones) {
    // smooth the weights over the surface so bones blend without tearing, but
    // never across places where unrelated parts touch (a hand resting on a hip)
    const nb = bones.length;
    const nbr = Array.from({ length: count }, () => new Set());
    const related = (a, b) => dom[a] === dom[b] || !joints || link.has(dom[a] * 1000 + dom[b]);
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t];
      const b = I[t + 1];
      const c = I[t + 2];
      if (related(a, b)) nbr[a].add(b), nbr[b].add(a);
      if (related(b, c)) nbr[b].add(c), nbr[c].add(b);
      if (related(a, c)) nbr[a].add(c), nbr[c].add(a);
    }
    const tmp = new Float32Array(W.length);
    for (let it = 0; it < 4; it++) {
      for (let v = 0; v < count; v++) {
        const o = v * nb;
        let sum = 0;
        for (let k = 0; k < nb; k++) sum += W[o + k];
        for (let k = 0; k < nb; k++) tmp[o + k] = W[o + k] / (sum || 1);
      }
      for (let v = 0; v < count; v++) {
        const o = v * nb;
        for (let k = 0; k < nb; k++) W[o + k] = tmp[o + k];
        for (const u of nbr[v]) for (let k = 0; k < nb; k++) W[o + k] += tmp[u * nb + k];
      }
    }
    // keep the four strongest bones
    for (let v = 0; v < count; v++) {
      bw.set(W.subarray(v * nb, v * nb + nb));
      for (let slot = 0; slot < 4; slot++) {
        let best = -1;
        let bv = 0;
        for (let n = 0; n < nb; n++) {
          if (bw[n] > bv) {
            bv = bw[n];
            best = n;
          }
        }
        if (best < 0) break;
        skinI[v * 4 + slot] = best;
        skinW[v * 4 + slot] = bv;
        bw[best] = 0;
      }
      const t = skinW[v * 4] + skinW[v * 4 + 1] + skinW[v * 4 + 2] + skinW[v * 4 + 3] || 1;
      for (let slot = 0; slot < 4; slot++) skinW[v * 4 + slot] /= t;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geo.setAttribute('rough', new THREE.BufferAttribute(rough, 1));
  geo.setAttribute('emit', new THREE.BufferAttribute(emit, 1));
  if (bones) {
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(skinI, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinW, 4));
  }
  geo.setIndex(count > 65535 ? new THREE.Uint32BufferAttribute(I, 1) : new THREE.Uint16BufferAttribute(I, 1));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  geo.userData.shared = true;
  geo.userData.region = region;
  geo.userData.regions = regions;
  cache.set(ck, geo);
  return geo;
}

// ---- materials ------------------------------------------------------------

/** Tiling detail normal maps (triplanar, in object space). */
function detailSet(kind) {
  if (kind === 'cloth') {
    return surface('sc-cloth', 256, (s) => {
      s.each((x, y, k) => {
        const weave = (Math.sin(x * 0.8 * Math.PI) * Math.sin(y * 0.8 * Math.PI) > 0 ? 0.6 : 0.4) + fbm(x, y, 256, 16, 3, 5) * 0.4;
        s.H[k] = weave;
        s.set(x, y, 255, 255, 255);
      });
    }, { normal: 1.2 });
  }
  if (kind === 'plastic') {
    return surface('sc-plastic', 256, (s) => {
      s.each((x, y, k) => {
        s.H[k] = fbm(x, y, 256, 6, 4, 11) * 0.6;
        s.set(x, y, 255, 255, 255);
      });
    }, { normal: 0.6 });
  }
  if (kind === 'fur') {
    return surface('sc-fur', 256, (s) => {
      s.each((x, y, k) => {
        // streaks along one axis read as fur
        s.H[k] = fbm(x * 0.25, y * 3, 256, 8, 4, 21);
        s.set(x, y, 255, 255, 255);
      });
    }, { normal: 3 });
  }
  return surface('sc-skin', 256, (s) => {
    s.each((x, y, k) => {
      const pores = fbm(x, y, 256, 48, 2, 3);
      s.H[k] = fbm(x, y, 256, 10, 4, 7) * 0.5 + (pores > 0.62 ? -0.25 : 0);
      s.set(x, y, 255, 255, 255);
    });
  }, { normal: 1.5 });
}

/**
 * Material for sculpted meshes: vertex colours, per-vertex roughness, a
 * triplanar detail normal, and a light probe term (`userData.probe`) so
 * moving characters pick up the level's baked light.
 */
export function sculptMaterial({ detail = 'skin', detailScale = 14, detailStrength = 0.35, physical = {}, fade = false, skinned = false, probe = null } = {}) {
  probe = probe || { value: new THREE.Vector3(0, 0, 0) };
  const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 1, metalness: 0, alphaHash: fade, ...physical });
  const tex = detail ? detailSet(detail).normalMap : null;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uProbe = probe;
    sh.uniforms.tDetail = { value: tex };
    sh.uniforms.uDetail = { value: detailStrength };
    sh.uniforms.uDetailScale = { value: detailScale };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float rough;\nattribute float emit;\nvarying float vRough;\nvarying float vEmit;\nvarying vec3 vObjPos;\nvarying vec3 vObjN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRough = rough;\nvEmit = emit;\nvObjPos = position;\nvObjN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vRough;
varying float vEmit;
varying vec3 vObjPos;
varying vec3 vObjN;
uniform vec3 uProbe;
uniform sampler2D tDetail;
uniform float uDetail, uDetailScale;
uniform mat3 normalMatrix;`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vEmit;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= vRough;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
${tex ? `{
  vec3 bw = pow(abs(normalize(vObjN)), vec3(4.0));
  bw /= (bw.x + bw.y + bw.z);
  vec2 dx = texture2D(tDetail, vObjPos.zy * uDetailScale).xy * 2.0 - 1.0;
  vec2 dy = texture2D(tDetail, vObjPos.xz * uDetailScale).xy * 2.0 - 1.0;
  vec2 dz = texture2D(tDetail, vObjPos.xy * uDetailScale).xy * 2.0 - 1.0;
  vec3 dObj = vec3(0.0, dx.y, dx.x) * bw.x + vec3(dy.x, 0.0, dy.y) * bw.y + vec3(dz.x, dz.y, 0.0) * bw.z;
  normal = normalize(normal + normalMatrix * dObj * uDetail);
}` : ''}`)
      .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\nirradiance += uProbe;');
  };
  mat.customProgramCacheKey = () => `sculpt|${detail}|${skinned}`;
  mat.userData.probe = probe;
  return mat;
}

/** Copy of a sculpt geometry with one paint region recoloured (shares everything else). */
export function recolor(geo, regionName, color) {
  const key = `${geo.uuid}|${regionName}|${color}`;
  if (cache.has(key)) return cache.get(key);
  const idx = geo.userData.regions.indexOf(regionName);
  const src = geo.attributes.color.array;
  const out = new Float32Array(src);
  const c = new THREE.Color(color);
  for (let v = 0; v < geo.userData.region.length; v++) {
    if (geo.userData.region[v] !== idx) continue;
    out[v * 3] *= c.r;
    out[v * 3 + 1] *= c.g;
    out[v * 3 + 2] *= c.b;
  }
  const g = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(geo.attributes)) g.setAttribute(name, name === 'color' ? new THREE.BufferAttribute(out, 3) : attr);
  g.setIndex(geo.index);
  g.boundingSphere = geo.boundingSphere;
  g.boundingBox = geo.boundingBox;
  g.userData = { ...geo.userData };
  cache.set(key, g);
  return g;
}

/** A plain rigid mesh from a sculpt (props, heads, hands). */
export function sculptMesh(key, build, opts = {}, matOpts = {}) {
  const geo = sculptGeometry(key, build, opts);
  const m = new THREE.Mesh(geo, opts.material || sculptMaterial(matOpts));
  m.castShadow = true;
  m.userData.noBake = true;
  return m;
}

/**
 * A skinned mesh from a sculpt. `joints` is { name: { pos: [x,y,z], parent } }
 * in rest pose; bones get the same names. Returns the mesh; bones are in
 * mesh.userData.bones by name.
 */
export function skinnedSculpt(key, build, joints, opts = {}, matOpts = {}) {
  const names = Object.keys(joints);
  const geo = sculptGeometry(key, build, { ...opts, bones: names, joints });
  const bones = {};
  const list = names.map((n) => {
    const b = new THREE.Bone();
    b.name = n;
    bones[n] = b;
    return b;
  });
  let root = null;
  for (const n of names) {
    const j = joints[n];
    const b = bones[n];
    const par = j.parent ? joints[j.parent] : null;
    b.position.set(j.pos[0] - (par ? par.pos[0] : 0), j.pos[1] - (par ? par.pos[1] : 0), j.pos[2] - (par ? par.pos[2] : 0));
    if (j.parent) bones[j.parent].add(b);
    else root = b;
  }
  const mat = opts.material || sculptMaterial({ ...matOpts, skinned: true });
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.add(root);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(list));
  mesh.castShadow = true;
  // generous bounds (rest pose × 2.5) cover any pose, so figures out of view
  // can be culled from the main, AO and shadow passes without popping
  const rest = geo.boundingSphere;
  mesh.boundingSphere = new THREE.Sphere(rest.center.clone(), rest.radius * 2.5);
  mesh.userData.noBake = true;
  mesh.userData.bones = bones;
  return mesh;
}

/** Glossy eye with an iris, or a glowing one. */
export function eyeball(r, { iris = 0x3a2a1c, glow = null, pupil = 0.45 } = {}) {
  if (glow) {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(glow).multiplyScalar(3) });
    return new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), m);
  }
  const key = `eye:${iris}:${pupil}`;
  let tex = cache.get(key);
  if (!tex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#e9e3da';
    x.fillRect(0, 0, 128, 128);
    const col = new THREE.Color(iris);
    const gr = x.createRadialGradient(64, 64, 4, 64, 64, 30);
    gr.addColorStop(0, `#${col.clone().multiplyScalar(0.4).getHexString()}`);
    gr.addColorStop(0.7, `#${col.getHexString()}`);
    gr.addColorStop(1, '#111');
    x.fillStyle = gr;
    x.beginPath();
    x.arc(64, 64, 30, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#050505';
    x.beginPath();
    x.arc(64, 64, 30 * pupil, 0, Math.PI * 2);
    x.fill();
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    cache.set(key, tex);
  }
  const geo = new THREE.SphereGeometry(r, 18, 14);
  // planar projection: the iris looks along +Z
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let n = 0; n < pos.count; n++) {
    const z = pos.getZ(n);
    uv.setXY(n, z > 0 ? pos.getX(n) / r * 0.5 + 0.5 : 0.02, z > 0 ? pos.getY(n) / r * 0.5 + 0.5 : 0.02);
  }
  const m = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 }));
  m.userData.noBake = true;
  return m;
}
