import * as THREE from 'three';
import { keep } from '../../props/kit.js';
import { signTexture } from '../../props/canvas.js';
import { PI } from './constants.js';
import { missingTex } from './textures.js';

// ---------------------------------------------------------------------------
// Props

// a supermarket trolley that ended up here, as they do
export const trolley = {
  place: 'clutter', fp: [0.6, 0.95],
  build(k, rng) {
    const g = new THREE.Group();
    const wire = k.std(0xa8acb0, 0.35, 0.9);
    const red = k.std(0xb02020, 0.5, 0.1);
    const tipped = rng.chance(0.2);
    const b = new THREE.Group();
    // basket: bars on each side
    for (let x = -0.26; x <= 0.261; x += 0.065) {
      k.box(b, 0.008, 0.45, 0.008, wire, x, 0.72, -0.4);
      k.box(b, 0.008, 0.008, 0.85, wire, x, 0.5, 0);
    }
    for (let z = -0.4; z <= 0.41; z += 0.08) for (const x of [-0.27, 0.27]) k.box(b, 0.008, 0.45, 0.008, wire, x, 0.72, z);
    for (const y of [0.5, 0.72, 0.95]) {
      k.box(b, 0.56, 0.012, 0.012, wire, 0, y, -0.42);
      k.box(b, 0.56, 0.012, 0.012, wire, 0, y, 0.42);
      for (const x of [-0.27, 0.27]) k.box(b, 0.012, 0.012, 0.85, wire, x, y, 0);
    }
    k.box(b, 0.6, 0.04, 0.04, red, 0, 1.0, 0.5);
    for (const x of [-0.24, 0.24]) {
      k.box(b, 0.02, 0.5, 0.02, wire, x, 0.25, -0.35);
      k.box(b, 0.02, 0.5, 0.02, wire, x, 0.25, 0.35);
      for (const z of [-0.35, 0.35]) k.cyl(b, 0.05, 0.05, 0.03, k.std(0x1a1a1a, 0.7), x, 0.05, z, 0, 0, PI / 2);
    }
    g.add(b);
    if (tipped) {
      b.rotation.z = PI / 2 - 0.1;
      b.position.set(0.5, 0.3, 0);
    }
    return g;
  },
};

// tyres stacked flat
export const tyreStack = {
  place: 'wall', fp: [0.65, 0.65],
  build(k, rng) {
    const g = new THREE.Group();
    const n = rng.int(1, 4);
    for (let s = 0; s < n; s++) {
      // the scan stands upright on its tread: centre it, then lay it flat
      const t = new THREE.Group();
      k.model(t, 'old_tyre', 0, -0.3, 0);
      t.rotation.set(PI / 2, 0, rng.float(0, PI * 2));
      t.position.set(rng.float(-0.03, 0.03), 0.0825 + s * 0.165, rng.float(-0.03, 0.03));
      g.add(t);
    }
    return g;
  },
};

// fire hose cabinet (English only: this car park isn't anywhere in particular)
export const hoseBox = {
  place: 'wall', fp: null,
  build(k) {
    const g = new THREE.Group();
    k.box(g, 0.75, 0.95, 0.2, k.std(0xb81e18, 0.4, 0.3), 0, 0.95, 0.1);
    k.plane(g, 0.56, 0.16, k.tex('g-hose', signTexture('FIRE HOSE', '', { bg: '#b81e18', fg: '#fff', w: 256, h: 72 })), 0, 1.2, 0.202);
    keep(k.sphere(g, 0.05, k.glow(0xff3020, 2.5), 0, 1.53, 0.12, 1, 1, 0.6));
    return g;
  },
};

export const missingPoster = {
  place: 'high', fp: null, y: 1.45,
  build(k, rng, o) {
    const g = new THREE.Group();
    const eerie = (o.mood || 0) > 0.85 && rng.chance(0.6);
    k.plane(g, 0.36, 0.5, k.tex(`g-missing:${eerie}`, missingTex(eerie), { roughness: 0.8 }), 0, 0, 0.012, 0, 0, rng.float(-0.05, 0.05));
    return g;
  },
};

export const noIdling = {
  place: 'high', fp: null, y: 1.7,
  build(k, rng) {
    const g = new THREE.Group();
    const [a, b] = rng.pick([['NO IDLING', 'Turn off your engine'], ['SPEED LIMIT 8', 'km/h'], ['NO PARKING', 'Fire access'], ['LOCK YOUR CAR', 'Take your valuables'], ['PEDESTRIANS', 'Walk facing traffic']]);
    k.box(g, 0.64, 0.34, 0.02, k.std(0xdedad0, 0.5, 0.2), 0, 0, 0.01);
    k.plane(g, 0.6, 0.3, k.tex(`g-nosign:${a}`, signTexture(a, b, { bg: '#f0ece2', fg: '#1a2a6a', w: 512, h: 256 })), 0, 0, 0.021);
    return g;
  },
};
