import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();

/**
 * Builds props out of primitives and bakes the static ones into one merged
 * mesh per material, so hundreds of props cost only a handful of draw calls.
 * Meshes flagged with `keep` (animated or emissive-varying) stay live.
 */
export class PropKit {
  constructor(world, { shadows = false } = {}) {
    this.world = world;
    this.rng = world.rng;
    this.mats = new Map();
    this.placed = [];
    this.shadows = shadows;
  }

  // ---- materials ------------------------------------------------------------

  mat(key, make) {
    if (!this.mats.has(key)) this.mats.set(key, make());
    return this.mats.get(key);
  }

  std(color, rough = 0.7, metal = 0, extra = {}) {
    const key = `std:${color}:${rough}:${metal}:${JSON.stringify(extra)}`;
    return this.mat(key, () => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra }));
  }

  glow(color, intensity = 1) {
    return this.mat(`glow:${color}:${intensity}`, () => {
      const m = new THREE.MeshBasicMaterial({ color });
      m.color.multiplyScalar(intensity);
      return m;
    });
  }

  tex(key, texture, extra = {}) {
    return this.mat(`tex:${key}`, () => new THREE.MeshStandardMaterial({ map: texture, roughness: 0.7, ...extra }));
  }

  // ---- primitives (all added to group g, return the mesh) -------------------

  mesh(g, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    g.add(m);
    return m;
  }

  box(g, w, h, d, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    return this.mesh(g, new THREE.BoxGeometry(w, h, d), mat, x, y, z, rx, ry, rz);
  }

  cyl(g, rt, rb, h, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 14) {
    return this.mesh(g, new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z, rx, ry, rz);
  }

  sphere(g, r, mat, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, seg = 16) {
    const m = this.mesh(g, new THREE.SphereGeometry(r, seg, Math.max(6, seg * 0.7 | 0)), mat, x, y, z);
    m.scale.set(sx, sy, sz);
    return m;
  }

  plane(g, w, h, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    return this.mesh(g, new THREE.PlaneGeometry(w, h), mat, x, y, z, rx, ry, rz);
  }

  torus(g, r, tube, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, arc = Math.PI * 2) {
    return this.mesh(g, new THREE.TorusGeometry(r, tube, 8, 24, arc), mat, x, y, z, rx, ry, rz);
  }

  // ---- placement ----------------------------------------------------------

  /**
   * Places a prop group in the world.
   * opts: { y, collide: [w, d] footprint | { r } circle, scale, rx, rz }
   */
  add(group, x, z, yaw = 0, opts = {}) {
    const { y = 0, collide = null, scale = 1, rx = 0, rz = 0 } = opts;
    group.position.set(x, y, z);
    group.rotation.set(rx, yaw, rz);
    group.scale.setScalar(scale);
    if (collide) {
      if (Array.isArray(collide)) {
        const [w, d] = collide;
        const c = Math.abs(Math.cos(yaw));
        const s = Math.abs(Math.sin(yaw));
        const hw = (w * c + d * s) * scale * 0.5;
        const hd = (w * s + d * c) * scale * 0.5;
        this.world.addBox(x - hw, z - hd, x + hw, z + hd);
      } else if (collide.r) {
        this.world.addBox(x - collide.r, z - collide.r, x + collide.r, z + collide.r);
      }
    }
    this.placed.push(group);
    return group;
  }

  /** Bakes all static meshes; live ones are attached to the world as-is. */
  finish() {
    const byMat = new Map();
    for (const g of this.placed) {
      g.updateMatrixWorld(true);
      const live = [];
      g.traverse((o) => {
        if (!o.isMesh) return;
        if (o.userData.keep || o.isInstancedMesh) {
          live.push(o);
          return;
        }
        const geo = o.geometry.index ? o.geometry : o.geometry;
        const clone = geo.clone();
        for (const name of Object.keys(clone.attributes)) if (!['position', 'normal', 'uv'].includes(name)) clone.deleteAttribute(name);
        clone.applyMatrix4(_m.copy(o.matrixWorld));
        if (!clone.index) clone.setIndex([...Array(clone.attributes.position.count).keys()]);
        if (!byMat.has(o.material)) byMat.set(o.material, []);
        byMat.get(o.material).push(clone);
        o.geometry.dispose();
      });
      if (live.length) {
        // keep the live meshes in their group; strip merged ones
        g.traverse((o) => {
          if (o.isMesh && !live.includes(o)) o.visible = false;
        });
        const holder = new THREE.Group();
        for (const m of live) {
          const wm = m.matrixWorld.clone();
          m.parent.remove(m);
          wm.decompose(m.position, m.quaternion, m.scale);
          holder.add(m);
        }
        this.world.root.add(holder);
      }
    }
    for (const [mat, geos] of byMat) {
      // merge in chunks to keep individual buffers reasonable
      for (let i = 0; i < geos.length; i += 400) {
        const merged = mergeGeometries(geos.slice(i, i + 400), false);
        if (!merged) continue;
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, mat);
        mesh.castShadow = this.shadows;
        mesh.receiveShadow = this.shadows;
        this.world.root.add(mesh);
      }
      for (const g of geos) g.dispose();
    }
    this.placed = [];
  }
}

/** Marks a mesh as live (not merged). */
export function keep(mesh) {
  mesh.userData.keep = true;
  return mesh;
}
