import * as THREE from 'three';

// Baked lighting: when a level is built, every light fixture's contribution
// (with walls blocking it), a soft bounce term and grid-based ambient
// occlusion are computed per vertex and stored in a `bake` attribute
// (rgb = irradiance, a = occlusion). Materials pick it up through a small
// shader patch, so the whole level is lit, not just the few real lights
// around the camera.

const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _l = new THREE.Vector3();
const _m = new THREE.Matrix4();

// integer key for a grid cell (i, j), valid for |j| < 32768
const cellKey = (i, j) => i * 65536 + j;

/**
 * Splits the quads produced by the grid builders (4 vertices, 6 indices
 * each) into a finer grid so per-vertex lighting has enough resolution.
 */
export function tessellate(geo, size = 0.55) {
  const pos = geo.attributes.position.array;
  const nrm = geo.attributes.normal.array;
  const uv = geo.attributes.uv.array;
  const quads = pos.length / 12;
  const len = (p, q) => Math.hypot(pos[q * 3] - pos[p * 3], pos[q * 3 + 1] - pos[p * 3 + 1], pos[q * 3 + 2] - pos[p * 3 + 2]);
  // first pass: how finely each quad is split
  const nus = new Int32Array(quads);
  const nvs = new Int32Array(quads);
  let verts = 0;
  let tris = 0;
  for (let q = 0; q < quads; q++) {
    const b = q * 4;
    const nu = Math.max(1, Math.ceil(len(b, b + 1) / size));
    const nv = Math.max(1, Math.ceil(len(b, b + 3) / size));
    nus[q] = nu;
    nvs[q] = nv;
    verts += (nu + 1) * (nv + 1);
    tris += nu * nv * 2;
  }
  const P = new Float32Array(verts * 3);
  const N = new Float32Array(verts * 3);
  const U = new Float32Array(verts * 2);
  // same index type three.js would pick for a plain array
  const I = verts - 1 >= 65535 ? new Uint32Array(tris * 3) : new Uint16Array(tris * 3);
  let pv = 0;
  let pi = 0;
  for (let q = 0; q < quads; q++) {
    const b = q * 4;
    const nu = nus[q];
    const nv = nvs[q];
    const base = pv;
    for (let j = 0; j <= nv; j++) {
      const s = j / nv;
      for (let i = 0; i <= nu; i++) {
        const r = i / nu;
        const w0 = (1 - r) * (1 - s);
        const w1 = r * (1 - s);
        const w2 = r * s;
        const w3 = (1 - r) * s;
        for (let c = 0; c < 3; c++) P[pv * 3 + c] = pos[b * 3 + c] * w0 + pos[(b + 1) * 3 + c] * w1 + pos[(b + 2) * 3 + c] * w2 + pos[(b + 3) * 3 + c] * w3;
        for (let c = 0; c < 2; c++) U[pv * 2 + c] = uv[b * 2 + c] * w0 + uv[(b + 1) * 2 + c] * w1 + uv[(b + 2) * 2 + c] * w2 + uv[(b + 3) * 2 + c] * w3;
        N[pv * 3] = nrm[b * 3];
        N[pv * 3 + 1] = nrm[b * 3 + 1];
        N[pv * 3 + 2] = nrm[b * 3 + 2];
        pv++;
      }
    }
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const k00 = base + j * (nu + 1) + i;
        const k10 = k00 + 1;
        const k01 = k00 + nu + 1;
        const k11 = k01 + 1;
        I[pi++] = k00;
        I[pi++] = k10;
        I[pi++] = k11;
        I[pi++] = k00;
        I[pi++] = k11;
        I[pi++] = k01;
      }
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  out.setIndex(new THREE.BufferAttribute(I, 1));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

/** Adds the baked-light terms to a standard/physical material. */
export function patchMaterial(mat, uniforms) {
  if (mat.userData.baked) return;
  mat.userData.baked = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.uniforms.uBakeScale = uniforms.scale;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 bake;\nvarying vec4 vBake;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBake = bake;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vBake;\nuniform float uBakeScale;')
      .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\nirradiance += vBake.rgb * uBakeScale;')
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= vBake.a;\nreflectedLight.indirectSpecular *= mix(1.0, vBake.a, 0.6);');
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => `${key ? key() : ''}|bake`;
  mat.needsUpdate = true;
}

/**
 * sources: [{ pos: Vector3, color: Color, intensity, dir?: Vector3 (lambertian panel facing dir), range }]
 * opts: { bounce, ao, radius }
 */
export class Baker {
  constructor(world, sources, { bounce = 0.25, ao = 1, radius = 10 } = {}) {
    this.world = world;
    this.grid = world.grid;
    this.bounce = bounce;
    this.aoStrength = ao;
    this.radius = radius;
    this.sources = sources.filter((s) => s.intensity > 0);
    // spatial hash of sources by cell
    const g = this.grid;
    this.hash = new Map();
    this.sources.forEach((s, idx) => {
      s.idx = idx;
      const i = Math.floor(s.pos.x / g.cs);
      const j = Math.floor(s.pos.z / g.cs);
      s.ci = i;
      s.cj = j;
      const k = cellKey(i, j);
      if (!this.hash.has(k)) this.hash.set(k, []);
      this.hash.get(k).push(s);
    });
    this.reach = Math.ceil(radius / g.cs);
    // sources that can reach each cell, computed on first use
    this.nearCache = new Array(g.w * g.h);
    // source → cell-centre line of sight: -1 unknown, 0 blocked, 1 clear
    const cells = g.w * g.h;
    this.vis = this.sources.length * cells <= 64e6 ? new Int8Array(this.sources.length * cells).fill(-1) : null;
    this.visMap = this.vis ? null : new Map();
  }

  /** Can source s see cell (i, j)? Cached grid line of sight. */
  visible(s, i, j, x, z) {
    const g = this.grid;
    const inside = g.inBounds(i, j);
    const key = inside ? s.idx * g.w * g.h + j * g.w + i : s.idx * 1e6 + j * 1000 + i;
    let v = inside && this.vis ? this.vis[key] : this.visMap?.get(key) ?? -1;
    if (v < 0) {
      const c = g.center(i, j);
      // test from the source to the cell centre and to the actual point; lit if either is clear
      v = g.los(s.pos.x, s.pos.z, c.x, c.z) ? 1 : 0;
      if (inside && this.vis) this.vis[key] = v;
      else (this.visMap || (this.visMap = new Map())).set(key, v);
    }
    if (v) return 1;
    return g.los(s.pos.x, s.pos.z, x, z) ? 0.8 : 0;
  }

  /**
   * Sources near cell (i, j), in scan order. Sources that can't come within
   * `radius` of any point in the cell are left out (irradiance would skip
   * them anyway), and the list is kept per cell.
   */
  near(i, j) {
    const g = this.grid;
    const inside = g.inBounds(i, j);
    if (inside) {
      const hit = this.nearCache[j * g.w + i];
      if (hit) return hit;
    }
    const out = [];
    const r = this.reach;
    const cs = g.cs;
    const R2 = this.radius * this.radius;
    const x0 = i * cs;
    const z0 = j * cs;
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        const list = this.hash.get(cellKey(i + di, j + dj));
        if (!list) continue;
        for (const s of list) {
          const dx = Math.max(x0 - s.pos.x, 0, s.pos.x - (x0 + cs));
          const dz = Math.max(z0 - s.pos.z, 0, s.pos.z - (z0 + cs));
          if (dx * dx + dz * dz > R2 * 1.0001) continue;
          out.push(s);
        }
      }
    }
    if (inside) this.nearCache[j * g.w + i] = out;
    return out;
  }

  /** Ambient occlusion for a point near walls, ledges, floors and ceilings. */
  occlusion(p, n, i, j) {
    const g = this.grid;
    const cs = g.cs;
    let ao = 1;
    // distance to nearby solid cells (skip the wall we sit on)
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di;
        const nj = j + dj;
        if (!g.solid(ni, nj)) continue;
        if (Math.abs(n.y) < 0.5 && Math.round(-n.x) === di && Math.round(-n.z) === dj) continue;
        const cx = Math.max(ni * cs, Math.min(p.x, (ni + 1) * cs));
        const cz = Math.max(nj * cs, Math.min(p.z, (nj + 1) * cs));
        const d = Math.hypot(p.x - cx, p.z - cz);
        const k = n.y > 0.5 ? 0.42 : n.y < -0.5 ? 0.3 : 0.32;
        ao *= 1 - k * Math.exp(-d / 0.32);
      }
    }
    if (Math.abs(n.y) < 0.5) {
      const floor = g.floorAt(p.x, p.z);
      const dyF = p.y - floor;
      ao *= 1 - 0.4 * Math.exp(-Math.max(0, dyF) / 0.28);
      const ceil = this.world.ceilAt ? this.world.ceilAt(i, j) : null;
      if (ceil !== null && ceil !== undefined) ao *= 1 - 0.28 * Math.exp(-Math.max(0, ceil - p.y) / 0.3);
    }
    return 1 - (1 - ao) * this.aoStrength;
  }

  irradiance(p, n, i, j, out) {
    out.set(0, 0, 0);
    const R = this.radius;
    for (const s of this.near(i, j)) {
      _l.subVectors(s.pos, p);
      const d2 = _l.lengthSq();
      if (d2 > R * R) continue;
      if (Math.abs(s.pos.y - p.y) > 5) continue;
      const d = Math.sqrt(d2);
      _l.divideScalar(d || 1);
      const vis = this.visible(s, i, j, p.x, p.z);
      if (!vis) continue;
      const fall = Math.max(0, 1 - Math.pow(d / (s.range || R), 4)) ** 2;
      // direct
      const ndl = n ? Math.max(0, n.dot(_l) * 0.9 + 0.1) : 0.6;
      const emit = s.dir ? Math.max(0, -_l.dot(s.dir)) : 1;
      let e = (s.intensity * ndl * emit) / (d2 + 0.25);
      // cheap bounce: light that reached the room's other surfaces
      e += (s.intensity * this.bounce) / (d2 + 3.5);
      e *= vis * fall;
      out.x += s.color.r * e;
      out.y += s.color.g * e;
      out.z += s.color.b * e;
    }
    return out;
  }

  /** Bakes a geometry already in world space. */
  bakeGeometry(geo, { ao = true } = {}) {
    const pos = geo.attributes.position;
    const nrm = geo.attributes.normal;
    const count = pos.count;
    const data = new Float32Array(count * 4);
    const g = this.grid;
    const irr = new THREE.Vector3();
    for (let k = 0; k < count; k++) {
      _p.fromBufferAttribute(pos, k);
      _n.fromBufferAttribute(nrm, k).normalize();
      const qx = _p.x + _n.x * 0.08;
      const qz = _p.z + _n.z * 0.08;
      const i = Math.floor(qx / g.cs);
      const j = Math.floor(qz / g.cs);
      _p.x = qx;
      _p.z = qz;
      _p.y += _n.y * 0.02;
      this.irradiance(_p, _n, i, j, irr);
      data[k * 4] = irr.x;
      data[k * 4 + 1] = irr.y;
      data[k * 4 + 2] = irr.z;
      data[k * 4 + 3] = ao ? this.occlusion(_p, _n, i, j) : 1;
    }
    geo.setAttribute('bake', new THREE.BufferAttribute(data, 4));
  }

  /** Per-instance bake for instanced meshes (evaluated at each instance's origin). */
  bakeInstances(im) {
    const data = new Float32Array(im.count * 4);
    const irr = new THREE.Vector3();
    for (let k = 0; k < im.count; k++) {
      im.getMatrixAt(k, _m);
      _p.setFromMatrixPosition(_m);
      _p.y += 1.2;
      const [i, j] = this.grid.cellOf(_p.x, _p.z);
      this.irradiance(_p, null, i, j, irr);
      data[k * 4] = irr.x;
      data[k * 4 + 1] = irr.y;
      data[k * 4 + 2] = irr.z;
      data[k * 4 + 3] = 1;
    }
    im.geometry.setAttribute('bake', new THREE.InstancedBufferAttribute(data, 4));
  }
}

/**
 * Bakes a whole level: tessellates grid geometry, bakes every lit mesh and
 * patches materials. Returns the shared uniforms ({ scale }).
 */
export function bakeWorld(world, extraSources = [], opts = {}) {
  const sources = [...extraSources];
  const pool = world.lightPool;
  if (pool) {
    const col = pool.lights[0]?.color || new THREE.Color(1, 1, 1);
    const area = pool.type === 'rect' ? pool.rectArea : 1;
    for (const f of pool.fixtures) {
      if (f.dead) continue;
      sources.push({
        pos: f.pos,
        color: f.color ? new THREE.Color(f.color) : col.clone(),
        intensity: (f.intensity ?? pool.baseIntensity) * area * (f.flicker ? 0.8 : 1) * (opts.fixtureScale ?? 1),
        dir: pool.type === 'rect' ? new THREE.Vector3(0, -1, 0) : null,
        range: opts.radius,
      });
    }
  }
  const baker = new Baker(world, sources, opts);
  const uniforms = { scale: { value: opts.scale ?? 1 } };
  const meshes = [];
  // apparitions move and doors animate; everything else is baked where it stands
  const skip = new Set();
  for (const e of world.entities) if (e.object && (e.presence !== undefined || e.dest !== undefined)) e.object.traverse((o) => skip.add(o));
  world.root.traverse((o) => {
    if (skip.has(o)) return;
    if (!o.isMesh || !o.visible || o.isSkinnedMesh || o.userData.noBake) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (!mats.every((m) => m.isMeshStandardMaterial)) return;
    meshes.push(o);
  });
  for (const o of meshes) {
    if (o.isInstancedMesh) {
      if (o.count > 0) baker.bakeInstances(o);
    } else {
      o.updateMatrixWorld(true);
      if (o.geometry.userData.quads) {
        const t = tessellate(o.geometry, opts.tess ?? 0.55);
        o.geometry.dispose();
        o.geometry = t;
      }
      const isIdentity = o.matrixWorld.equals(_m.identity());
      if (isIdentity) baker.bakeGeometry(o.geometry, { ao: !o.userData.noAO });
      else {
        // bake in world space on a temporary copy, then keep the attribute
        const tmp = o.geometry.clone().applyMatrix4(o.matrixWorld);
        baker.bakeGeometry(tmp, { ao: false });
        o.geometry.setAttribute('bake', tmp.attributes.bake);
        tmp.dispose();
      }
    }
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) patchMaterial(m, uniforms);
    o.receiveShadow = true;
    o.castShadow = true;
  }
  world.baker = baker;
  return uniforms;
}
