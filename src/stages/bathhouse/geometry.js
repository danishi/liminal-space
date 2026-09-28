import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { model } from '../../core/assets.js';

// ---------------------------------------------------------------------------
// Geometry helpers

export const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

/**
 * Instanced copies of small repeated things (stools, buckets, baskets),
 * one InstancedMesh per part per key so each can be culled and baked.
 */
export class Batch {
  constructor(world) {
    this.world = world;
    this.sets = new Map();
  }

  add(key, parts, matrix) {
    let e = this.sets.get(key);
    if (!e) {
      e = { parts, list: [], meshes: null };
      this.sets.set(key, e);
    }
    e.list.push(matrix.clone());
    return { set: e, index: e.list.length - 1 };
  }

  finish() {
    for (const e of this.sets.values()) {
      e.meshes = e.parts.map((p) => {
        // its own copy (it gets a per-instance bake), owned by the level: clones share userData
        const geo = p.geo.clone();
        geo.userData = {};
        const im = new THREE.InstancedMesh(geo, p.mat, e.list.length);
        e.list.forEach((mm, n) => im.setMatrixAt(n, _m.multiplyMatrices(mm, p.m)));
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        this.world.root.add(im);
        return im;
      });
    }
  }

  move(ref, matrix) {
    const e = ref.set;
    e.list[ref.index].copy(matrix);
    e.parts.forEach((p, k) => {
      const im = e.meshes[k];
      im.setMatrixAt(ref.index, _m.multiplyMatrices(matrix, p.m));
      im.instanceMatrix.needsUpdate = true;
      // recomputed by the renderer's culling, once per frame however many moved
      im.boundingSphere = null;
    });
  }
}

const partCache = new Map();
/** Meshes of a preloaded model with their transforms (for instancing). */
export function modelParts(id, scale = 1) {
  const key = `${id}:${scale}`;
  if (partCache.has(key)) return partCache.get(key);
  const m = model(id);
  m.scale.setScalar(scale);
  m.updateMatrixWorld(true);
  const parts = [];
  m.traverse((o) => {
    if (o.isMesh) parts.push({ geo: o.geometry, mat: o.material, m: o.matrixWorld.clone() });
  });
  partCache.set(key, parts);
  return parts;
}

/** Merges a prop group into one mesh per material (for props that move as a whole). */
export function mergeGroup(group, skip = new Set()) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const byMat = new Map();
  const keepers = [];
  group.traverse((o) => {
    if (!o.isMesh) return;
    if (skip.has(o)) {
      keepers.push(o);
      return;
    }
    const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    geo.applyMatrix4(_m.multiplyMatrices(inv, o.matrixWorld));
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(geo);
  });
  const out = new THREE.Group();
  for (const [mat, geos] of byMat) {
    out.add(new THREE.Mesh(mergeGeometries(geos), mat));
    for (const x of geos) x.dispose();
  }
  for (const o of keepers) {
    const wm = _m.multiplyMatrices(inv, o.matrixWorld);
    o.parent.remove(o);
    wm.decompose(o.position, o.quaternion, o.scale);
    out.add(o);
  }
  return out;
}

export function matAt(x, y, z, yaw = 0, s = 1, rx = 0, out = new THREE.Matrix4()) {
  _q.setFromEuler(_e.set(rx, yaw, 0, 'YXZ'));
  return out.compose(_v.set(x, y, z), _q, _s.set(s, s, s));
}
