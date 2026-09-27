import * as THREE from 'three';

// Cell types shared by every stage.
export const FLOOR = 0;
export const WALL = 1;
export const WATER = 2; // walkable, lowered floor (pools)
export const DOORWAY = 3; // walkable, but a lintel hangs over it
export const VOID = 4; // solid, never rendered (invisible boundary)

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * A 2D tile map in the XZ plane. Cell (i, j) covers
 * x ∈ [i·cs, (i+1)·cs], z ∈ [j·cs, (j+1)·cs].
 */
export class Grid {
  constructor(w, h, cs, fill = FLOOR) {
    this.w = w;
    this.h = h;
    this.cs = cs;
    this.cells = new Uint8Array(w * h).fill(fill);
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

  fillRect(i0, j0, i1, j1, v) {
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.set(i, j, v);
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

  /** Breadth-first distances (in cells) from (si, sj). -1 = unreachable. */
  distances(si, sj) {
    const { w, h } = this;
    const dist = new Int32Array(w * h).fill(-1);
    if (!this.walkable(si, sj)) return dist;
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
        if (dist[k] !== -1 || this.solid(ni, nj)) continue;
        dist[k] = dist[cur] + 1;
        q[tail++] = k;
      }
    }
    return dist;
  }

  /** Walls off every walkable cell not reachable from (si, sj). */
  sealUnreachable(si, sj) {
    const d = this.distances(si, sj);
    for (let k = 0; k < this.cells.length; k++) {
      if (d[k] === -1 && this.cells[k] !== WALL && this.cells[k] !== VOID) this.cells[k] = WALL;
    }
    return d;
  }

  /** Shortest 4-connected path from (si,sj) to (ti,tj) as [[i,j],...] excluding start. */
  path(si, sj, ti, tj, maxNodes = 4000) {
    const { w, h } = this;
    if (!this.walkable(ti, tj) || !this.inBounds(si, sj)) return null;
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
        if (!this.inBounds(ni, nj) || this.solid(ni, nj)) continue;
        const k = nj * w + ni;
        if (prev[k] !== -1) continue;
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

  /** Line of sight between two world points (ignores props). */
  los(x0, z0, x1, z1) {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const step = this.cs * 0.2;
    const n = Math.ceil(len / step);
    for (let s = 1; s < n; s++) {
      const t = s / n;
      const [i, j] = this.cellOf(x0 + dx * t, z0 + dz * t);
      if (this.solid(i, j)) return false;
    }
    return true;
  }

  /** Walkable cells as [i, j] pairs. */
  openCells() {
    const out = [];
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) if (this.walkable(i, j)) out.push([i, j]);
    return out;
  }

  countSolidNeighbors(i, j) {
    let n = 0;
    for (const [dx, dy] of DIRS) if (this.solid(i + dx, j + dy)) n++;
    return n;
  }
}

export { DIRS };

// ---------------------------------------------------------------------------
// Geometry builders. All UVs are in world units divided by a texture scale so
// textures tile seamlessly regardless of wall length.

class GeoBuilder {
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

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/**
 * Vertical faces on every boundary between a "solid" cell and an "open"
 * neighbour, facing into the open cell.
 * opts: { solid(c,i,j), open(c,i,j), y0, y1, uScale, vScale, inset }
 * `inset` pushes the face into the open cell (for trims such as baseboards).
 */
export function buildWallFaces(grid, opts) {
  const { y0 = 0, y1 = 2.7, uScale = 2, vScale = 2, inset = 0 } = opts;
  const solid = opts.solid || ((c) => c === WALL);
  const open = opts.open || ((c) => c !== WALL && c !== VOID);
  const cs = grid.cs;
  const b = new GeoBuilder();
  const v0 = y0 / vScale;
  const v1 = y1 / vScale;
  for (let j = 0; j < grid.h; j++) {
    for (let i = 0; i < grid.w; i++) {
      if (!solid(grid.get(i, j), i, j)) continue;
      const x0 = i * cs;
      const x1 = x0 + cs;
      const z0 = j * cs;
      const z1 = z0 + cs;
      // +X neighbour → face at x1 facing +X
      if (grid.inBounds(i + 1, j) && open(grid.get(i + 1, j), i + 1, j)) {
        const x = x1 + inset;
        b.quad([x, y0, z1], [x, y0, z0], [x, y1, z0], [x, y1, z1], [1, 0, 0],
          [-z1 / uScale, v0], [-z0 / uScale, v0], [-z0 / uScale, v1], [-z1 / uScale, v1]);
      }
      if (grid.inBounds(i - 1, j) && open(grid.get(i - 1, j), i - 1, j)) {
        const x = x0 - inset;
        b.quad([x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0], [-1, 0, 0],
          [z0 / uScale, v0], [z1 / uScale, v0], [z1 / uScale, v1], [z0 / uScale, v1]);
      }
      if (grid.inBounds(i, j + 1) && open(grid.get(i, j + 1), i, j + 1)) {
        const z = z1 + inset;
        b.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], [0, 0, 1],
          [x0 / uScale, v0], [x1 / uScale, v0], [x1 / uScale, v1], [x0 / uScale, v1]);
      }
      if (grid.inBounds(i, j - 1) && open(grid.get(i, j - 1), i, j - 1)) {
        const z = z0 - inset;
        b.quad([x1, y0, z], [x0, y0, z], [x0, y1, z], [x1, y1, z], [0, 0, -1],
          [-x1 / uScale, v0], [-x0 / uScale, v0], [-x0 / uScale, v1], [-x1 / uScale, v1]);
      }
    }
  }
  return b.build();
}

/**
 * Horizontal quads over every cell matching `pred`, at height y.
 * up=true faces +Y (floors), up=false faces -Y (ceilings).
 */
export function buildCellQuads(grid, pred, y, up = true, uvScale = 2) {
  const cs = grid.cs;
  const b = new GeoBuilder();
  for (let j = 0; j < grid.h; j++) {
    // merge horizontal runs to keep the vertex count down
    let i = 0;
    while (i < grid.w) {
      if (!pred(grid.get(i, j), i, j)) {
        i++;
        continue;
      }
      let e = i;
      while (e + 1 < grid.w && pred(grid.get(e + 1, j), e + 1, j)) e++;
      const x0 = i * cs;
      const x1 = (e + 1) * cs;
      const z0 = j * cs;
      const z1 = z0 + cs;
      const u0 = x0 / uvScale;
      const u1 = x1 / uvScale;
      const w0 = z0 / uvScale;
      const w1 = z1 / uvScale;
      if (up) {
        b.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0],
          [u0, -w1], [u1, -w1], [u1, -w0], [u0, -w0]);
      } else {
        b.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, -1, 0],
          [u0, w0], [u1, w0], [u1, w1], [u0, w1]);
      }
      i = e + 1;
    }
  }
  return b.build();
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
 * Finds wall faces suitable for mounting things (doors, signs, sconces).
 * Returns [{ i, j, nx, nz, x, z }] where (i,j) is the open cell and (x,z) is
 * the centre of the wall face; (nx, nz) points from the wall into the cell.
 */
export function wallMounts(grid, filter = () => true) {
  const out = [];
  const cs = grid.cs;
  for (let j = 0; j < grid.h; j++) {
    for (let i = 0; i < grid.w; i++) {
      if (!grid.walkable(i, j) || !filter(grid.get(i, j), i, j)) continue;
      for (const [dx, dy] of DIRS) {
        if (grid.get(i + dx, j + dy) !== WALL) continue;
        const c = grid.center(i, j);
        out.push({ i, j, nx: -dx, nz: -dy, x: c.x + dx * cs * 0.5, z: c.z + dy * cs * 0.5 });
      }
    }
  }
  return out;
}
