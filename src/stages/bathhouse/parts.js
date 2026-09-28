import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bucketTexture } from './textures.js';

// Shared parts for instancing: each cache lives here and nowhere else.

let bucketParts = null;
/** The yellow ad-printed bath bucket: a lathe body and a printed band. */
export function bathBucketParts() {
  if (bucketParts) return bucketParts;
  const pts = [
    [0, 0.004], [0.098, 0.0], [0.104, 0.004], [0.106, 0.014], [0.118, 0.1], [0.123, 0.104], [0.123, 0.112],
    [0.118, 0.115], [0.113, 0.11], [0.101, 0.02], [0.094, 0.013], [0, 0.013],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.LatheGeometry(pts, 28);
  body.computeVertexNormals();
  const yellow = new THREE.MeshStandardMaterial({ color: 0xf2c418, roughness: 0.32 });
  const band = new THREE.CylinderGeometry(0.1172, 0.1093, 0.055, 28, 1, true);
  band.translate(0, 0.058, 0);
  const print = new THREE.MeshStandardMaterial({ map: bucketTexture(), transparent: true, alphaTest: 0.4, roughness: 0.35, polygonOffset: true, polygonOffsetFactor: -1 });
  const I = new THREE.Matrix4();
  bucketParts = [{ geo: body, mat: yellow, m: I }, { geo: band, mat: print, m: I }];
  for (const p of bucketParts) {
    p.geo.userData.shared = true;
    p.mat.userData.shared = true;
  }
  return bucketParts;
}

/** A bath bucket as a decorate() prop, for when the bathhouse bleeds elsewhere. */
export const bleedBucket = {
  place: 'clutter', fp: null,
  build() {
    const g = new THREE.Group();
    for (const p of bathBucketParts()) {
      const m = new THREE.Mesh(p.geo, p.mat);
      m.applyMatrix4(p.m);
      g.add(m);
    }
    return g;
  },
};

let stoolParts = null;
/** A low plastic bath stool (the scanned wooden stool is used for the nicer ones). */
export function plasticStoolParts() {
  if (stoolParts) return stoolParts;
  const geos = [];
  const top = new THREE.BoxGeometry(0.3, 0.03, 0.24);
  top.translate(0, 0.235, 0);
  geos.push(top);
  for (const [x, z] of [[-0.13, -0.1], [0.13, -0.1], [-0.13, 0.1], [0.13, 0.1]]) {
    const leg = new THREE.BoxGeometry(0.035, 0.22, 0.035);
    leg.translate(x, 0.11, z);
    geos.push(leg);
  }
  for (const z of [-0.105, 0.105]) {
    const skirt = new THREE.BoxGeometry(0.28, 0.06, 0.012);
    skirt.translate(0, 0.19, z);
    geos.push(skirt);
  }
  const g = mergeGeometries(geos.map((x) => x.toNonIndexed()));
  g.userData.shared = true;
  const mat = new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.45 });
  mat.userData.shared = true;
  stoolParts = [{ geo: g, mat, m: new THREE.Matrix4() }];
  return stoolParts;
}
