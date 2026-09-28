import * as THREE from 'three';

// Cell types shared by every stage.
export const FLOOR = 0;
export const WALL = 1;
export const WATER = 2; // walkable, lowered floor (pools)
export const DOORWAY = 3; // walkable, a lintel hangs over it
export const VOID = 4; // solid, never rendered (invisible boundary)
export const HOLE = 5; // no floor: fall through it

export const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export const PIT_DEPTH = -14; // floor height of a hole (visual shaft bottom)
const STEP = 0.55; // max height difference you can walk up
const _n = new THREE.Vector3();

/**
 * A 2.5D tile map in the XZ plane. Cell (i, j) covers
 * x ∈ [i·cs, (i+1)·cs], z ∈ [j·cs, (j+1)·cs] and has a floor height.
 * Ramp cells slope along one axis (stairs).
 */
export class Grid {
  constructor(w, h, cs, fill = FLOOR) {
    this.w = w;
    this.h = h;
    this.cs = cs;
    this.cells = new Uint8Array(w * h).fill(fill);
    this.hgt = new Float32Array(w * h); // floor height (low end for ramps)
    this.ramp = new Int8Array(w * h); // 0 flat, else index into DIRS+1: direction the floor rises toward
    this.rise = new Float32Array(w * h);
  }

  inBounds(i, j) {
    return i >= 0 && j >= 0 && i < this.w && j < this.h;
  }

  get(i, j) {
    return this.inBounds(i, j) ? this.cells[j * this.w + i] : WALL;
  }

  set(i, j, v) {
    if (this.inBounds(i, j)) this.cells[j * this.w + i] = v;
  }

  solid(i, j) {
    const c = this.get(i, j);
    return c === WALL || c === VOID;
  }

  walkable(i, j) {
    return !this.solid(i, j);
  }

  /** Walkable and has a floor (not a hole). */
  standable(i, j) {
    const c = this.get(i, j);
    return c !== WALL && c !== VOID && c !== HOLE;
  }

  fillRect(i0, j0, i1, j1, v) {
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.set(i, j, v);
  }

  setHeight(i, j, y) {
    if (this.inBounds(i, j)) this.hgt[j * this.w + i] = y;
  }

  heightRect(i0, j0, i1, j1, y) {
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.setHeight(i, j, y);
  }

  /** Turns (i,j) into stairs rising toward DIRS[dir] from `from` by `rise`. */
  setRamp(i, j, dir, from, rise) {
    if (!this.inBounds(i, j)) return;
    const k = j * this.w + i;
    this.ramp[k] = dir + 1;
    this.hgt[k] = from;
    this.rise[k] = rise;
  }

  heightOf(i, j) {
    if (!this.inBounds(i, j)) return 0;
    const k = j * this.w + i;
    return this.cells[k] === HOLE ? PIT_DEPTH : this.hgt[k];
  }

  /** Highest floor point of a cell (top of a ramp). */
  topOf(i, j) {
    const k = j * this.w + i;
    return this.heightOf(i, j) + (this.ramp[k] ? this.rise[k] : 0);
  }

  border(v = WALL) {
    for (let i = 0; i < this.w; i++) {
      this.set(i, 0, v);
      this.set(i, this.h - 1, v);
    }
    for (let j = 0; j < this.h; j++) {
      this.set(0, j, v);
      this.set(this.w - 1, j, v);
    }
  }

  cellOf(x, z) {
    return [Math.floor(x / this.cs), Math.floor(z / this.cs)];
  }

  center(i, j) {
    return { x: (i + 0.5) * this.cs, z: (j + 0.5) * this.cs };
  }

  /** Floor height at a world point. Holes return PIT_DEPTH. */
  floorAt(x, z) {
    const i = Math.floor(x / this.cs);
    const j = Math.floor(z / this.cs);
    if (!this.inBounds(i, j)) return 0;
    const k = j * this.w + i;
    if (this.cells[k] === HOLE) return PIT_DEPTH;
    const r = this.ramp[k];
    if (!r) return this.hgt[k];
    const [dx, dy] = DIRS[r - 1];
    const fx = x / this.cs - i;
    const fz = z / this.cs - j;
    const t = dx === 1 ? fx : dx === -1 ? 1 - fx : dy === 1 ? fz : 1 - fz;
    return this.hgt[k] + this.rise[k] * t;
  }

  /** Floor height along the edge of (i,j) in direction (dx,dy). */
  edgeHeight(i, j, dx, dy) {
    const k = j * this.w + i;
    if (this.cells[k] === HOLE) return PIT_DEPTH;
    const r = this.ramp[k];
    if (!r) return this.hgt[k];
    const [rx, ry] = DIRS[r - 1];
    if (rx === dx && ry === dy) return this.hgt[k] + this.rise[k];
    if (rx === -dx && ry === -dy) return this.hgt[k];
    return this.hgt[k] + this.rise[k] * 0.5;
  }

  /** Can you walk from (i,j) to its neighbour in direction (dx,dy)? */
  passable(i, j, dx, dy) {
    const ni = i + dx;
    const nj = j + dy;
    if (!this.standable(i, j) || !this.inBounds(ni, nj) || !this.standable(ni, nj)) return false;
    return Math.abs(this.edgeHeight(i, j, dx, dy) - this.edgeHeight(ni, nj, -dx, -dy)) <= STEP;
  }

  /** Breadth-first distances (in cells) from (si, sj). -1 = unreachable. */
  distances(si, sj) {
    const { w, h } = this;
    const dist = new Int32Array(w * h).fill(-1);
    if (!this.standable(si, sj)) return dist;
    const q = new Int32Array(w * h);
    let head = 0;
    let tail = 0;
    q[tail++] = sj * w + si;
    dist[sj * w + si] = 0;
    while (head < tail) {
      const cur = q[head++];
      const ci = cur % w;
      const cj = (cur / w) | 0;
      for (const [dx, dy] of DIRS) {
        const ni = ci + dx;
        const nj = cj + dy;
        if (!this.inBounds(ni, nj)) continue;
        const k = nj * w + ni;
        if (dist[k] !== -1 || !this.passable(ci, cj, dx, dy)) continue;
        dist[k] = dist[cur] + 1;
        q[tail++] = k;
      }
    }
    return dist;
  }

  /** Walls off every standable cell not reachable from (si, sj). */
  sealUnreachable(si, sj) {
    const d = this.distances(si, sj);
    for (let k = 0; k < this.cells.length; k++) {
      const c = this.cells[k];
      if (d[k] === -1 && c !== WALL && c !== VOID && c !== HOLE) this.cells[k] = WALL;
    }
    // holes that no longer touch any reachable cell become walls too
    for (let j = 0; j < this.h; j++) {
      for (let i = 0; i < this.w; i++) {
        if (this.get(i, j) !== HOLE) continue;
        let touch = false;
        for (const [dx, dy] of DIRS) {
          const ni = i + dx;
          const nj = j + dy;
          if (this.inBounds(ni, nj) && d[nj * this.w + ni] !== -1) touch = true;
        }
        if (!touch) this.set(i, j, WALL);
      }
    }
    return d;
  }

  /** Shortest passable path from (si,sj) to (ti,tj) as [[i,j],...] excluding start. */
  path(si, sj, ti, tj, maxNodes = 5000) {
    const { w, h } = this;
    if (!this.standable(ti, tj) || !this.inBounds(si, sj)) return null;
    const prev = new Int32Array(w * h).fill(-1);
    const start = sj * w + si;
    const goal = tj * w + ti;
    if (start === goal) return [];
    const q = [start];
    prev[start] = start;
    let head = 0;
    while (head < q.length && head < maxNodes) {
      const cur = q[head++];
      if (cur === goal) break;
      const ci = cur % w;
      const cj = (cur / w) | 0;
      for (const [dx, dy] of DIRS) {
        const ni = ci + dx;
        const nj = cj + dy;
        if (!this.inBounds(ni, nj)) continue;
        const k = nj * w + ni;
        if (prev[k] !== -1 || !this.passable(ci, cj, dx, dy)) continue;
        prev[k] = cur;
        q.push(k);
      }
    }
    if (prev[goal] === -1) return null;
    const out = [];
    let c = goal;
    while (c !== start) {
      out.push([c % w, (c / w) | 0]);
      c = prev[c];
    }
    return out.reverse();
  }

  /** Line of sight between two world points (walls only). */
  los(x0, z0, x1, z1) {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const step = this.cs * 0.2;
    const n = Math.ceil(len / step);
    const cs = this.cs;
    for (let s = 1; s < n; s++) {
      const t = s / n;
      if (this.solid(Math.floor((x0 + dx * t) / cs), Math.floor((z0 + dz * t) / cs))) return false;
    }
    return true;
  }

  /** Free distance from a point along a direction (walls only), capped. */
  probe(x, z, dirX, dirZ, max = 8) {
    const step = this.cs * 0.25;
    const cs = this.cs;
    for (let d = step; d <= max; d += step) {
      const i = Math.floor((x + dirX * d) / cs);
      const j = Math.floor((z + dirZ * d) / cs);
      if (this.solid(i, j) || this.get(i, j) === HOLE) return d - step;
    }
    return max;
  }

  openCells() {
    const out = [];
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) if (this.standable(i, j)) out.push([i, j]);
    return out;
  }

  countSolidNeighbors(i, j) {
    let n = 0;
    for (const [dx, dy] of DIRS) if (this.solid(i + dx, j + dy)) n++;
    return n;
  }
}

// ---------------------------------------------------------------------------
// Geometry builders. UVs are in world units divided by a texture scale so
// textures tile seamlessly regardless of wall length.

/** Collects quads (4 vertices, 6 indices each) in the layout the light baker can tessellate. */
export class GeoBuilder {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.uv = [];
    this.idx = [];
  }

  quad(a, b, c, d, n, uva, uvb, uvc, uvd) {
    const base = this.pos.length / 3;
    this.pos.push(...a, ...b, ...c, ...d);
    for (let k = 0; k < 4; k++) this.nrm.push(...n);
    this.uv.push(...uva, ...uvb, ...uvc, ...uvd);
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /**
   * Quad from four corner points; the normal is (b - a) × (d - a). Without
   * `uvs`, UVs are planar in metres / s (x and ±z).
   */
  quadPts(pts, s, uvs = null) {
    const [a, b, c, d] = pts;
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = d[0] - a[0];
    const vy = d[1] - a[1];
    const vz = d[2] - a[2];
    _n.set(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx).normalize();
    const n = [_n.x, _n.y, _n.z];
    const uv = uvs || pts.map((q) => [q[0] / s, (n[1] > 0 ? -q[2] : q[2]) / s]);
    this.quad(a, b, c, d, n, uv[0], uv[1], uv[2], uv[3]);
  }

  get empty() {
    return !this.idx.length;
  }

  /** Vertical face on a cell boundary. side: 0 +X, 1 -X, 2 +Z, 3 -Z (normal direction). */
  vface(i, j, side, cs, y0, y1, uScale, vScale, inset = 0) {
    if (y1 - y0 < 1e-3) return;
    const x0 = i * cs;
    const x1 = x0 + cs;
    const z0 = j * cs;
    const z1 = z0 + cs;
    const v0 = y0 / vScale;
    const v1 = y1 / vScale;
    if (side === 0) {
      const x = x1 + inset;
      this.quad([x, y0, z1], [x, y0, z0], [x, y1, z0], [x, y1, z1], [1, 0, 0], [-z1 / uScale, v0], [-z0 / uScale, v0], [-z0 / uScale, v1], [-z1 / uScale, v1]);
    } else if (side === 1) {
      const x = x0 - inset;
      this.quad([x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0], [-1, 0, 0], [z0 / uScale, v0], [z1 / uScale, v0], [z1 / uScale, v1], [z0 / uScale, v1]);
    } else if (side === 2) {
      const z = z1 + inset;
      this.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], [0, 0, 1], [x0 / uScale, v0], [x1 / uScale, v0], [x1 / uScale, v1], [x0 / uScale, v1]);
    } else {
      const z = z0 - inset;
      this.quad([x1, y0, z], [x0, y0, z], [x0, y1, z], [x1, y1, z], [0, 0, -1], [-x1 / uScale, v0], [-x0 / uScale, v0], [-x0 / uScale, v1], [-x1 / uScale, v1]);
    }
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    g.userData.quads = true; // lets the light baker tessellate it
    return g;
  }
}

/** Neighbour offsets with the matching vface side: [dx, dy, side]. */
export const SIDES = [
  [1, 0, 0],
  [-1, 0, 1],
  [0, 1, 2],
  [0, -1, 3],
];

/**
 * Vertical faces on every boundary between a "solid" cell and an "open"
 * neighbour, facing into the open cell. y0/y1 may be numbers or functions
 * of the open cell (oi, oj).
 */
export function buildWallFaces(grid, opts) {
  const { uScale = 2, vScale = 2, inset = 0 } = opts;
  const solid = opts.solid || ((c) => c === WALL);
  const open = opts.open || ((c) => c !== WALL && c !== VOID);
  const y0f = typeof opts.y0 === 'function' ? opts.y0 : () => opts.y0 ?? 0;
  const y1f = typeof opts.y1 === 'function' ? opts.y1 : () => opts.y1 ?? 2.7;
  const b = new GeoBuilder();
  for (let j = 0; j < grid.h; j++) {
    for (let i = 0; i < grid.w; i++) {
      if (!solid(grid.get(i, j), i, j)) continue;
      for (const [dx, dy, side] of SIDES) {
        const oi = i + dx;
        const oj = j + dy;
        if (!grid.inBounds(oi, oj) || !open(grid.get(oi, oj), oi, oj)) continue;
        b.vface(i, j, side, grid.cs, y0f(oi, oj), y1f(oi, oj), uScale, vScale, inset);
      }
    }
  }
  return b.build();
}

/**
 * Riser faces between neighbouring open cells whose floors differ (steps,
 * ledges and the shafts of holes). Faces point toward the lower cell.
 * `ceil` (optional) builds ceiling drops instead, using ceil(i,j) heights.
 */
export function buildRisers(grid, { pred = (c) => c !== WALL && c !== VOID, uScale = 2, vScale = 2, ceil = null, skipRamps = true } = {}) {
  const b = new GeoBuilder();
  for (let j = 0; j < grid.h; j++) {
    for (let i = 0; i < grid.w; i++) {
      if (!pred(grid.get(i, j), i, j)) continue;
      for (const [dx, dy, side] of SIDES) {
        const oi = i + dx;
        const oj = j + dy;
        if (!grid.inBounds(oi, oj) || !pred(grid.get(oi, oj), oi, oj)) continue;
        if (ceil) {
          // face on the boundary of (i,j) facing the neighbour whose ceiling is higher
          const a = ceil(i, j);
          const n = ceil(oi, oj);
          if (n > a + 1e-3) b.vface(i, j, side, grid.cs, a, n, uScale, vScale);
          continue;
        }
        // stair blocks draw their own sides down to their lowest step, so a
        // ramp only contributes its lowest height here
        const low = (ci, cj) => {
          const kk = cj * grid.w + ci;
          return grid.ramp[kk] && skipRamps ? grid.heightOf(ci, cj) + Math.min(0, grid.rise[kk]) : null;
        };
        const hi = low(i, j) ?? grid.edgeHeight(i, j, dx, dy);
        const lo = low(oi, oj) ?? grid.edgeHeight(oi, oj, -dx, -dy);
        if (hi > lo + 0.02) b.vface(i, j, side, grid.cs, lo, hi, uScale, vScale);
      }
    }
  }
  return b.build();
}

/**
 * Horizontal quads over cells matching `pred`. y is a number or a function
 * (i, j) → height. up=true faces +Y (floors), up=false faces -Y (ceilings).
 * Ramp cells are skipped when `ramps` is false (stairs draw themselves).
 */
export function buildCellQuads(grid, pred, y, up = true, uvScale = 2, { ramps = false } = {}) {
  const cs = grid.cs;
  const yf = typeof y === 'function' ? y : () => y;
  const b = new GeoBuilder();
  for (let j = 0; j < grid.h; j++) {
    let i = 0;
    while (i < grid.w) {
      const k = j * grid.w + i;
      if (!pred(grid.get(i, j), i, j) || (grid.ramp[k] && !ramps && up)) {
        i++;
        continue;
      }
      const yy = yf(i, j);
      let e = i;
      while (e + 1 < grid.w && pred(grid.get(e + 1, j), e + 1, j) && !grid.ramp[j * grid.w + e + 1] && Math.abs(yf(e + 1, j) - yy) < 1e-4 && !grid.ramp[k]) e++;
      const x0 = i * cs;
      const x1 = (e + 1) * cs;
      const z0 = j * cs;
      const z1 = z0 + cs;
      const u0 = x0 / uvScale;
      const u1 = x1 / uvScale;
      const w0 = z0 / uvScale;
      const w1 = z1 / uvScale;
      if (up) {
        b.quad([x0, yy, z1], [x1, yy, z1], [x1, yy, z0], [x0, yy, z0], [0, 1, 0], [u0, -w1], [u1, -w1], [u1, -w0], [u0, -w0]);
      } else {
        b.quad([x0, yy, z0], [x1, yy, z0], [x1, yy, z1], [x0, yy, z1], [0, -1, 0], [u0, w0], [u1, w0], [u1, w1], [u0, w1]);
      }
      i = e + 1;
    }
  }
  return b.build();
}

/** Floors that follow the height field (flat cells, and ramps as slopes). */
export function buildFloors(grid, pred, uvScale = 2) {
  return buildCellQuads(grid, pred, (i, j) => grid.heightOf(i, j), true, uvScale);
}

/** Step geometry for every ramp cell (treads + risers down to the low end). */
export function buildStairs(grid, { tread = 0.18 } = {}) {
  const geos = [];
  const cs = grid.cs;
  for (let j = 0; j < grid.h; j++) {
    for (let i = 0; i < grid.w; i++) {
      const k = j * grid.w + i;
      const r = grid.ramp[k];
      if (!r || grid.cells[k] === HOLE) continue;
      const [dx, dy] = DIRS[r - 1];
      const base = grid.hgt[k];
      const rise = grid.rise[k];
      const n = Math.max(2, Math.round(Math.abs(rise) / tread));
      const depth = cs / n;
      const lowest = Math.min(base, base + rise);
      for (let s = 0; s < n; s++) {
        const top = base + (rise * (s + 1)) / n;
        const h = top - lowest + 0.02;
        const g = new THREE.BoxGeometry(dx ? depth : cs, h, dx ? cs : depth);
        const off = (s + 0.5) * depth;
        const cx = dx === 1 ? i * cs + off : dx === -1 ? (i + 1) * cs - off : (i + 0.5) * cs;
        const cz = dy === 1 ? j * cs + off : dy === -1 ? (j + 1) * cs - off : (j + 0.5) * cs;
        g.translate(cx, lowest + h / 2 - 0.02, cz);
        geos.push(g);
      }
    }
  }
  return geos;
}

/** A single world-space rectangle (floor/ceiling) with world UVs. */
export function worldPlane(x0, z0, x1, z1, y, up = true, uvScale = 2) {
  const b = new GeoBuilder();
  const u0 = x0 / uvScale;
  const u1 = x1 / uvScale;
  const w0 = z0 / uvScale;
  const w1 = z1 / uvScale;
  if (up) {
    b.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], [u0, -w1], [u1, -w1], [u1, -w0], [u0, -w0]);
  } else {
    b.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, -1, 0], [u0, w0], [u1, w0], [u1, w1], [u0, w1]);
  }
  return b.build();
}

/**
 * Wall faces suitable for mounting things (doors, signs, props).
 * Returns [{ i, j, nx, nz, x, z, y }] where (i,j) is the open cell, (x,z) the
 * centre of the wall face, y the floor height and (nx, nz) points into the cell.
 */
export function wallMounts(grid, filter = () => true) {
  const out = [];
  const cs = grid.cs;
  for (let j = 0; j < grid.h; j++) {
    for (let i = 0; i < grid.w; i++) {
      if (!grid.standable(i, j) || grid.ramp[j * grid.w + i] || !filter(grid.get(i, j), i, j)) continue;
      for (const [dx, dy] of DIRS) {
        if (grid.get(i + dx, j + dy) !== WALL) continue;
        const c = grid.center(i, j);
        out.push({ i, j, nx: -dx, nz: -dy, x: c.x + dx * cs * 0.5, z: c.z + dy * cs * 0.5, y: grid.heightOf(i, j) });
      }
    }
  }
  return out;
}
