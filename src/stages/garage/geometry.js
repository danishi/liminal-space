import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WALL, DIRS, GeoBuilder } from '../../core/grid.js';
import { CS, H, PI } from './constants.js';

// ---------------------------------------------------------------------------
// Geometry helpers

/** Box with box-projected UVs in metres / s, so photo textures keep their real size. */
export function mBox(w, h, d, { segs = [1, 1, 1], s = 2, off = [0, 0] } = {}) {
  const geo = new THREE.BoxGeometry(w, h, d, ...segs);
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const uv = geo.attributes.uv;
  for (let k = 0; k < p.count; k++) {
    const ax = Math.abs(n.getX(k));
    const ay = Math.abs(n.getY(k));
    const x = p.getX(k);
    const y = p.getY(k);
    const z = p.getZ(k);
    const [u, v] = ax > 0.5 ? [z, y] : ay > 0.5 ? [x, z] : [x, y];
    uv.setXY(k, u / s + off[0], v / s + off[1]);
  }
  return geo;
}

/** Floor decal: a flat plane (segmented so baked light matches the floor), UVs from a rect. */
export function flatGeo(w, d, rect = null, sx = 1, sz = 1) {
  const geo = new THREE.PlaneGeometry(w, d, sx, sz);
  if (rect) remapUV(geo, rect);
  geo.rotateX(-PI / 2);
  return geo;
}

export function wallGeo(w, h, rect = null) {
  const geo = new THREE.PlaneGeometry(w, h);
  if (rect) remapUV(geo, rect);
  return geo;
}

export function remapUV(geo, [u0, v0, u1, v1]) {
  const uv = geo.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) * (u1 - u0), v0 + uv.getY(k) * (v1 - v0));
}

/** A pipe running along x. */
export function pipeGeo(r, len) {
  return new THREE.CylinderGeometry(r, r, len, 8, Math.max(1, Math.ceil(len / 1.5))).rotateZ(PI / 2);
}

/** Sloped floor and ceiling quads for the car ramps (the grid would draw them as steps). */
export function slopeGeos(g, cells, uv) {
  const floor = new GeoBuilder();
  const ceil = new GeoBuilder();
  for (const [i, j] of cells) {
    const k = j * g.w + i;
    const [dx, dy] = DIRS[g.ramp[k] - 1];
    const base = g.hgt[k];
    const rise = g.rise[k];
    // height at a corner (fx, fz in 0..1 across the cell)
    const hAt = (fx, fz) => base + rise * (dx === 1 ? fx : dx === -1 ? 1 - fx : dy === 1 ? fz : 1 - fz);
    const x0 = i * CS;
    const x1 = x0 + CS;
    const z0 = j * CS;
    const z1 = z0 + CS;
    floor.quadPts([[x0, hAt(0, 1), z1], [x1, hAt(1, 1), z1], [x1, hAt(1, 0), z0], [x0, hAt(0, 0), z0]], uv);
    ceil.quadPts([[x0, hAt(0, 0) + H, z0], [x1, hAt(1, 0) + H, z0], [x1, hAt(1, 1) + H, z1], [x0, hAt(0, 1) + H, z1]], uv);
  }
  return [floor.build(), ceil.build()];
}

/** Painted hazard curbs along the walls of the car ramps (they follow the slope). */
export function curbGeo(g, cells) {
  const q = new GeoBuilder();
  const s = 0.7;
  const hgt = 0.32;
  for (const [i, j] of cells) {
    const k = j * g.w + i;
    const [, dy] = DIRS[g.ramp[k] - 1];
    if (!dy) continue;
    const base = g.hgt[k];
    const rise = g.rise[k];
    const z0 = j * CS;
    const z1 = z0 + CS;
    const h0 = base + (dy === 1 ? 0 : rise);
    const h1 = base + (dy === 1 ? rise : 0);
    const uv = (z, y) => [z / s, (y - h0) / s];
    if (g.get(i - 1, j) === WALL) {
      const x = i * CS + 0.012;
      q.quadPts([[x, h1, z1], [x, h0, z0], [x, h0 + hgt, z0], [x, h1 + hgt, z1]], s, [uv(z1, h1), uv(z0, h0), uv(z0, h0 + hgt), uv(z1, h1 + hgt)]);
    }
    if (g.get(i + 1, j) === WALL) {
      const x = (i + 1) * CS - 0.012;
      q.quadPts([[x, h0, z0], [x, h1, z1], [x, h1 + hgt, z1], [x, h0 + hgt, z0]], s, [uv(z0, h0), uv(z1, h1), uv(z1, h1 + hgt), uv(z0, h0 + hgt)]);
    }
  }
  return q.build();
}

/** Proper steps for the stairwell's steep flights. */
export function stairGeo(g, cells) {
  const geos = [];
  for (const [i, j] of cells) {
    const k = j * g.w + i;
    const [dx, dy] = DIRS[g.ramp[k] - 1];
    const base = g.hgt[k];
    const rise = g.rise[k];
    const n = Math.max(2, Math.round(Math.abs(rise) / 0.18));
    const depth = CS / n;
    for (let s = 0; s < n; s++) {
      const top = base + (rise * (s + 1)) / n;
      const h = top - base + 0.02;
      const geo = mBox(dx ? depth : CS, h, dx ? CS : depth, { s: 1.5 });
      const off = (s + 0.5) * depth;
      const cx = dx === 1 ? i * CS + off : dx === -1 ? (i + 1) * CS - off : (i + 0.5) * CS;
      const cz = dy === 1 ? j * CS + off : dy === -1 ? (j + 1) * CS - off : (j + 0.5) * CS;
      geo.translate(cx, base + h / 2 - 0.02, cz);
      geos.push(geo);
    }
  }
  return mergeGeometries(geos);
}
