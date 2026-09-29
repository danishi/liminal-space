import * as THREE from 'three';
import { model } from '../../core/assets.js';
import { keep } from '../../props/kit.js';
import { paceClockTexture, laneNumber } from './textures.js';

const PI = Math.PI;
const G = () => new THREE.Group();

/** The scanned rubber duck (0.29 m tall); scale 1 ≈ a real bath duck. */
export function duckModel(scale = 1) {
  const g = new THREE.Group();
  const m = model('rubber_duck_toy');
  m.scale.setScalar(scale * 1.6);
  g.add(m);
  return g;
}

/** A starting block at the pool's edge; local +z faces the water. */
export function startingBlock(k, n) {
  const g = G();
  k.box(g, 0.5, 0.66, 0.5, k.std(0xf0f2ef, 0.45), 0, 0.33, -0.05);
  // the top slopes down toward the water
  k.box(g, 0.52, 0.05, 0.62, k.std(0x2c68a8, 0.85), 0, 0.72, 0, 0.14);
  k.cyl(g, 0.018, 0.018, 0.46, k.std(0xe3e7e8, 0.25, 0.8), 0, 0.6, 0.3, 0, 0, PI / 2);
  const plate = k.mat(`pool-plate:${n}`, () => new THREE.MeshStandardMaterial({ map: laneNumber(n), roughness: 0.5 }));
  k.plane(g, 0.3, 0.3, plate, 0, 0.36, 0.201);
  return g;
}

/** Chrome steps over the edge: origin on the rim, local +z over the water. */
export function poolLadder(k, depth) {
  const g = G();
  const chrome = k.std(0xe8eef0, 0.15, 1);
  for (const x of [-0.26, 0.26]) {
    k.cyl(g, 0.022, 0.022, depth + 0.55, chrome, x, (0.55 - depth) / 2, 0.14);
    k.torus(g, 0.25, 0.022, chrome, x, 0.55, -0.11, 0, PI / 2, 0, PI);
    k.cyl(g, 0.022, 0.022, 0.55, chrome, x, 0.275, -0.36);
    k.cyl(g, 0.05, 0.05, 0.02, chrome, x, 0.01, -0.36);
  }
  for (let s = 1; s <= 3; s++) k.box(g, 0.5, 0.03, 0.09, k.std(0xd8dde0, 0.4, 0.6), 0, -0.3 * s, 0.13);
  return g;
}

/** Backstroke flags: pennants on a line between two poles, `span` apart along local x. */
export function backstrokeFlags(k, span) {
  const g = G();
  const pole = k.std(0xe6e9ea, 0.35, 0.5);
  for (const x of [-span / 2, span / 2]) {
    k.cyl(g, 0.03, 0.03, 2.1, pole, x, 1.05, 0);
    k.cyl(g, 0.16, 0.18, 0.06, k.std(0x3a4448, 0.6), x, 0.03, 0);
  }
  k.cyl(g, 0.006, 0.006, span, k.std(0x1a1a1a, 0.8), 0, 2.0, 0, 0, 0, PI / 2);
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.1, 0, 0, 0, -0.28, 0, 0.1, 0, 0], 3));
  tri.computeVertexNormals();
  const cols = [0xd8312c, 0xf4f4f0, 0x2a5fb8];
  const n = Math.floor(span / 0.3);
  for (let s = 0; s < n; s++) k.mesh(g, tri, k.std(cols[s % 3], 0.8, 0, { side: THREE.DoubleSide }), -span / 2 + ((s + 0.5) * span) / n, 2.0, 0);
  return g;
}

/** A pace clock for the wall (face toward local +z). Returns the group and its sweep hand. */
export function paceClock(k) {
  const g = G();
  k.cyl(g, 0.7, 0.7, 0.08, k.std(0x2b3134, 0.5, 0.3), 0, 0, 0.04, PI / 2, 0, 0, 40);
  const face = k.mat('pool-pace-face', () => new THREE.MeshStandardMaterial({ map: paceClockTexture(), roughness: 0.4 }));
  k.mesh(g, new THREE.CircleGeometry(0.64, 48), face, 0, 0, 0.082);
  const hand = keep(k.box(g, 0.035, 0.6, 0.012, k.std(0xc41e1e, 0.4), 0, 0, 0.1));
  hand.geometry.translate(0, 0.22, 0);
  k.cyl(g, 0.04, 0.04, 0.03, k.std(0x1a1a1a, 0.4, 0.5), 0, 0, 0.11, PI / 2);
  return { g, hand };
}

/** Floating lane ropes, each a [start, end] pair of points on the water. */
export function laneRopes(ropes) {
  const spacing = 0.1;
  const counts = ropes.map(([a, b]) => Math.floor(a.distanceTo(b) / spacing));
  const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.065, 0.065, 0.085, 10), new THREE.MeshStandardMaterial({ roughness: 0.45 }), counts.reduce((s, n) => s + n, 0));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const col = new THREE.Color();
  let n = 0;
  ropes.forEach(([a, b], r) => {
    const len = a.distanceTo(b);
    dir.subVectors(b, a).normalize();
    q.setFromUnitVectors(THREE.Object3D.DEFAULT_UP, dir);
    for (let s = 0; s < counts[r]; s++) {
      const d = ((s + 0.5) * len) / counts[r];
      im.setMatrixAt(n, m.compose(p.copy(a).addScaledVector(dir, d), q, one));
      // red for the last five metres at each end, blue and yellow bands between
      im.setColorAt(n, col.setHex(Math.min(d, len - d) < 5 ? 0xd42a26 : Math.floor(d) % 2 ? 0x2a62c8 : 0xf0d23c));
      n++;
    }
  });
  return im;
}
