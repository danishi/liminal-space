import * as THREE from 'three';
import { keep } from './kit.js';
import { posterTexture, paintingTexture, vendingTexture, clockFace, emaTexture, bulletinTexture, mapBoard, signTexture, screenStatic } from './canvas.js';
import { woodPanel, pbr, paint } from '../core/surfaces.js';
import { modelSize } from '../core/assets.js';

// Every builder returns a THREE.Group with its origin on the floor at the
// centre of its footprint and its front facing +Z. `fp` is the collision
// footprint [width, depth] (null = walk-through clutter). `place` says where
// the decorator may put it:
//   wall   — back against a wall, on the floor
//   high   — mounted on a wall at head height (no collision)
//   floor  — free-standing, anywhere with space
//   clutter— small stuff scattered on the floor (no collision)
//   ceil   — hanging from the ceiling (no collision)

const G = () => new THREE.Group();
const PI = Math.PI;

// ---------------------------------------------------------------------------
// Photo-scanned models (Poly Haven, CC0). Footprints come from the model's
// bounds once it's loaded; models face +Z like every other prop.

export function modelProp(id, { place = 'wall', y, scale = 1, collide = true, yaw = 0, jitter = 0, scaleJitter = 0 } = {}) {
  return {
    id,
    place,
    y,
    get fp() {
      if (!collide) return null;
      const s = modelSize(id);
      return [s.x * scale, s.z * scale];
    },
    build(k, rng) {
      const g = G();
      const sc = scale * (1 + (scaleJitter ? rng.float(-scaleJitter, scaleJitter) : 0));
      k.model(g, id, 0, 0, 0, yaw + (jitter ? rng.float(-jitter, jitter) : 0), sc);
      return g;
    },
  };
}

// ---------------------------------------------------------------------------
// Office / Backrooms

export const officeChair = {
  place: 'floor', fp: [0.6, 0.6],
  build(k, rng) {
    const g = G();
    const black = k.std(0x1c1c1e, 0.6, 0.1);
    const fabric = k.std(rng.pick([0x2b3440, 0x3a2e2a, 0x2f3a33]), 0.95);
    const chrome = k.std(0x9a9a9a, 0.3, 0.9);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * PI * 2;
      k.box(g, 0.05, 0.04, 0.3, black, Math.sin(a) * 0.15, 0.06, Math.cos(a) * 0.15, 0, a, 0);
      k.sphere(g, 0.03, black, Math.sin(a) * 0.29, 0.03, Math.cos(a) * 0.29);
    }
    k.cyl(g, 0.025, 0.025, 0.35, chrome, 0, 0.26, 0);
    k.box(g, 0.48, 0.08, 0.46, fabric, 0, 0.47, 0);
    k.box(g, 0.44, 0.5, 0.06, fabric, 0, 0.8, -0.22, -0.1);
    for (const s of [-1, 1]) k.box(g, 0.04, 0.2, 0.3, black, s * 0.25, 0.6, 0);
    return g;
  },
};

export const cardboardBoxes = {
  place: 'wall', fp: [0.8, 0.6],
  build(k, rng) {
    const g = G();
    const card = k.std(0xa27b4f, 0.9);
    const tape = k.std(0xc9a574, 0.5);
    let y = 0;
    const n = rng.int(1, 3);
    for (let i = 0; i < n; i++) {
      const w = rng.float(0.35, 0.6);
      const h = rng.float(0.25, 0.45);
      const d = rng.float(0.3, 0.5);
      const ox = rng.float(-0.12, 0.12);
      k.box(g, w, h, d, card, ox, y + h / 2, 0, 0, rng.float(-0.2, 0.2), 0);
      k.box(g, 0.06, 0.005, d + 0.01, tape, ox, y + h + 0.002, 0);
      y += h;
    }
    return g;
  },
};

export const filingCabinet = {
  place: 'wall', fp: [0.5, 0.6],
  build(k, rng) {
    const g = G();
    const metal = k.std(rng.pick([0x8a8d88, 0x6f7568, 0x9c9483]), 0.45, 0.6);
    const handle = k.std(0x2a2a2a, 0.4, 0.8);
    const n = rng.int(2, 4);
    const h = n * 0.33;
    k.box(g, 0.46, h, 0.6, metal, 0, h / 2, 0);
    for (let i = 0; i < n; i++) {
      const open = rng.chance(0.15) ? 0.2 : 0;
      k.box(g, 0.42, 0.29, 0.02, metal, 0, 0.17 + i * 0.33, 0.31 + open);
      k.box(g, 0.14, 0.02, 0.03, handle, 0, 0.24 + i * 0.33, 0.33 + open);
    }
    return g;
  },
};

export const waterCooler = {
  place: 'wall', fp: [0.35, 0.35],
  build(k) {
    const g = G();
    k.box(g, 0.32, 0.95, 0.32, k.std(0xe8e6de, 0.5), 0, 0.475, 0);
    const bottle = k.cyl(g, 0.13, 0.13, 0.42, k.std(0x7fb5d8, 0.05, 0, { transparent: true, opacity: 0.55 }), 0, 1.16, 0);
    bottle.renderOrder = 2;
    k.box(g, 0.06, 0.05, 0.03, k.std(0x2a64b0, 0.4), -0.06, 0.8, 0.17);
    k.box(g, 0.06, 0.05, 0.03, k.std(0xb02a2a, 0.4), 0.06, 0.8, 0.17);
    return g;
  },
};

export const wetFloorSign = {
  place: 'floor', fp: [0.35, 0.35],
  build(k) {
    const g = G();
    const y = k.std(0xf2c230, 0.5);
    k.box(g, 0.3, 0.62, 0.02, y, 0, 0.31, 0.1, -0.28);
    k.box(g, 0.3, 0.62, 0.02, y, 0, 0.31, -0.1, 0.28);
    k.plane(g, 0.22, 0.2, k.tex('wet', signTexture('!', 'CAUTION WET FLOOR', { bg: '#f2c230', fg: '#111', w: 256, h: 256 })), 0, 0.4, 0.125, -0.28);
    return g;
  },
};

export const trafficCone = {
  place: 'clutter', fp: null,
  build(k) {
    const g = G();
    k.box(g, 0.36, 0.03, 0.36, k.std(0x222222, 0.8), 0, 0.015, 0);
    k.cyl(g, 0.03, 0.14, 0.62, k.std(0xff5a1f, 0.6), 0, 0.33, 0);
    k.cyl(g, 0.075, 0.1, 0.1, k.std(0xf0f0f0, 0.5), 0, 0.36, 0);
    return g;
  },
};

export const crtMonitor = {
  place: 'clutter', fp: null,
  build(k, rng) {
    const g = G();
    k.box(g, 0.4, 0.36, 0.38, k.std(0xcfc8b6, 0.6), 0, 0.18, -0.02);
    const on = rng.chance(0.4);
    const scr = k.plane(g, 0.3, 0.24, on ? new THREE.MeshBasicMaterial({ map: screenStatic(rng.int(0, 9)), color: new THREE.Color(1.4, 1.4, 1.4) }) : k.std(0x1d2420, 0.2), 0, 0.19, 0.176);
    if (on) keep(scr).userData.flickerScreen = true;
    return g;
  },
};

export const mattress = {
  place: 'wall', fp: [1.0, 0.3],
  build(k) {
    const g = G();
    k.box(g, 0.95, 1.9, 0.2, k.std(0xd8d2c0, 0.95), 0, 0.93, 0.05, -0.12);
    k.box(g, 0.2, 0.2, 0.18, k.std(0x8a7a50, 0.9), 0.2, 1.1, 0.16, -0.12);
    return g;
  },
};

export const stepLadder = {
  place: 'wall', fp: [0.5, 0.5],
  build(k) {
    const g = G();
    const al = k.std(0xb8bcbf, 0.35, 0.8);
    for (const s of [-1, 1]) {
      k.box(g, 0.04, 1.5, 0.05, al, s * 0.22, 0.72, 0.12, -0.18);
      k.box(g, 0.04, 1.5, 0.05, al, s * 0.22, 0.72, -0.12, 0.18);
    }
    for (let i = 0; i < 4; i++) k.box(g, 0.44, 0.03, 0.1, al, 0, 0.3 + i * 0.32, 0.2 - i * 0.055);
    return g;
  },
};

export const paperScatter = {
  place: 'clutter', fp: null,
  build(k, rng) {
    const g = G();
    const paper = k.std(0xf1efe6, 0.9, 0, { side: THREE.DoubleSide });
    for (let i = 0; i < rng.int(3, 9); i++) k.plane(g, 0.21, 0.297, paper, rng.float(-0.5, 0.5), 0.004 + i * 0.001, rng.float(-0.5, 0.5), -PI / 2, 0, rng.float(0, PI));
    return g;
  },
};

export const bottles = {
  place: 'clutter', fp: null,
  build(k, rng) {
    const g = G();
    const glass = k.std(0xd8f0ea, 0.05, 0, { transparent: true, opacity: 0.6 });
    const cap = k.std(0x2c5aa0, 0.4);
    for (let i = 0; i < rng.int(1, 4); i++) {
      const x = rng.float(-0.25, 0.25);
      const z = rng.float(-0.25, 0.25);
      if (rng.chance(0.4)) {
        k.cyl(g, 0.035, 0.035, 0.22, glass, x, 0.035, z, PI / 2, 0, rng.float(0, PI));
      } else {
        k.cyl(g, 0.035, 0.035, 0.22, glass, x, 0.11, z);
        k.cyl(g, 0.018, 0.018, 0.03, cap, x, 0.235, z);
      }
    }
    return g;
  },
};

export const extinguisher = {
  place: 'wall', fp: null,
  build(k) {
    const g = G();
    k.cyl(g, 0.08, 0.08, 0.5, k.std(0xc41e1e, 0.35, 0.2), 0, 0.3, 0.1);
    k.cyl(g, 0.03, 0.03, 0.08, k.std(0x222222, 0.4, 0.6), 0, 0.59, 0.1);
    k.box(g, 0.12, 0.03, 0.03, k.std(0x222222, 0.4, 0.6), 0.04, 0.63, 0.1);
    return g;
  },
};

export const wallVent = {
  place: 'high', fp: null, y: 2.35,
  build(k) {
    const g = G();
    const m = k.std(0xd8d4c8, 0.5, 0.3);
    k.box(g, 0.5, 0.3, 0.02, m, 0, 0, 0.01);
    const slat = k.std(0x4a4842, 0.6, 0.3);
    for (let i = 0; i < 6; i++) k.box(g, 0.44, 0.012, 0.02, slat, 0, -0.11 + i * 0.045, 0.02, 0.5);
    return g;
  },
};

export const outlet = {
  place: 'high', fp: null, y: 0.3,
  build(k) {
    const g = G();
    k.box(g, 0.08, 0.12, 0.01, k.std(0xf0ece0, 0.4), 0, 0, 0.005);
    const hole = k.std(0x151515, 0.8);
    for (const y of [-0.025, 0.025]) {
      k.box(g, 0.006, 0.016, 0.004, hole, -0.012, y, 0.011);
      k.box(g, 0.006, 0.016, 0.004, hole, 0.012, y, 0.011);
    }
    return g;
  },
};

export const wallClock = {
  place: 'high', fp: null, y: 2.1,
  build(k, rng, o = {}) {
    const g = G();
    k.cyl(g, 0.17, 0.17, 0.05, k.std(0x2a2a2a, 0.4, 0.5), 0, 0, 0.025, PI / 2);
    k.plane(g, 0.3, 0.3, k.tex(`clock${o.eerie ? 'x' : ''}`, clockFace(!!o.eerie), { transparent: true }), 0, 0, 0.052);
    return g;
  },
};

export const painting = {
  place: 'high', fp: null, y: 1.6,
  build(k, rng, o = {}) {
    const g = G();
    const seed = rng.int(0, 30);
    const w = rng.float(0.5, 0.9);
    const h = w * 0.78;
    k.box(g, w + 0.08, h + 0.08, 0.04, k.std(rng.pick([0x5a3a1e, 0x2a2a2a, 0xa08040]), 0.4, 0.3), 0, 0, 0.02);
    k.plane(g, w, h, new THREE.MeshStandardMaterial({ map: paintingTexture(seed, { eerie: !!o.eerie }), roughness: 0.6 }), 0, 0, 0.041);
    return g;
  },
};

export const poster = {
  place: 'high', fp: null, y: 1.5,
  build(k, rng, o = {}) {
    const g = G();
    const seed = rng.int(0, 40);
    k.plane(g, 0.42, 0.59, new THREE.MeshStandardMaterial({ map: posterTexture(seed, { mood: o.mood || 0 }), roughness: 0.5 }), 0, 0, 0.012, 0, 0, rng.float(-0.04, 0.04));
    return g;
  },
};

export const hangingWires = {
  place: 'ceil', fp: null,
  build(k, rng) {
    const g = G();
    const wire = k.std(0x151515, 0.6);
    for (let i = 0; i < rng.int(2, 4); i++) {
      const len = rng.float(0.3, 1.1);
      k.cyl(g, 0.008, 0.008, len, wire, rng.float(-0.2, 0.2), -len / 2, rng.float(-0.2, 0.2), rng.float(-0.2, 0.2), 0, rng.float(-0.2, 0.2), 5);
    }
    return g;
  },
};

export const missingTile = {
  place: 'ceil', fp: null,
  build(k) {
    const g = G();
    k.plane(g, 0.58, 0.58, k.std(0x050505, 1), 0, -0.012, 0, PI / 2);
    return g;
  },
};

export const puddle = {
  place: 'clutter', fp: null,
  build(k, rng) {
    const g = G();
    const m = k.mat('puddle', () => new THREE.MeshStandardMaterial({ color: 0x2b2618, roughness: 0.04, metalness: 0.2, transparent: true, opacity: 0.55 }));
    const p = k.mesh(g, new THREE.CircleGeometry(rng.float(0.3, 0.9), 20), m, 0, 0.006, 0, -PI / 2);
    p.scale.set(1, rng.float(0.5, 1), 1);
    return g;
  },
};

export const chairPile = {
  place: 'floor', fp: [1.1, 1.1],
  build(k, rng) {
    const g = G();
    for (let i = 0; i < rng.int(3, 6); i++) {
      const c = officeChair.build(k, rng);
      c.position.set(rng.float(-0.3, 0.3), i * 0.35, rng.float(-0.3, 0.3));
      c.rotation.set(rng.float(-1.2, 1.2), rng.float(0, PI * 2), rng.float(-1.2, 1.2));
      g.add(c);
    }
    return g;
  },
};

export const fakeDoor = {
  place: 'wall', fp: [1.0, 0.1],
  build(k, rng) {
    const g = G();
    const frame = k.std(0x6d5a3a, 0.5);
    k.box(g, 1.0, 2.1, 0.06, k.std(rng.pick([0x8a7a5a, 0x5d6358, 0x7a4a3a]), 0.55), 0, 1.05, 0.03);
    k.box(g, 1.12, 0.06, 0.08, frame, 0, 2.13, 0.04);
    k.box(g, 0.06, 2.16, 0.08, frame, -0.53, 1.08, 0.04);
    k.box(g, 0.06, 2.16, 0.08, frame, 0.53, 1.08, 0.04);
    k.sphere(g, 0.03, k.std(0xb8a878, 0.3, 0.8), 0.38, 1.0, 0.08);
    return g;
  },
};

export const upsideChair = {
  place: 'ceil', fp: null,
  build(k, rng) {
    const g = officeChair.build(k, rng);
    g.rotation.x = PI;
    const outer = G();
    outer.add(g);
    return outer;
  },
};

export const handprints = {
  place: 'high', fp: null, y: 1.2,
  build(k, rng) {
    const g = G();
    const m = k.mat('handprint', () => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const ctx = c.getContext('2d');
      ctx.fillStyle = 'rgba(60,40,20,0.65)';
      ctx.beginPath();
      ctx.ellipse(32, 40, 14, 16, 0, 0, PI * 2);
      ctx.fill();
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.ellipse(18 + i * 9, 16, 3.5, 11, (i - 1.5) * 0.12, 0, PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.ellipse(50, 36, 3.5, 9, 0.9, 0, PI * 2);
      ctx.fill();
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: 0.8 });
    });
    for (let i = 0; i < rng.int(1, 5); i++) k.plane(g, 0.16, 0.16, m, rng.float(-0.6, 0.6), rng.float(-0.4, 0.7), 0.004 + i * 0.001, 0, 0, rng.float(-0.5, 0.5));
    return g;
  },
};

export const tvStatic = {
  place: 'wall', fp: [0.6, 0.5],
  build(k, rng) {
    const g = G();
    k.box(g, 0.6, 0.45, 0.45, k.std(0x2a2826, 0.5), 0, 0.225, 0);
    const scr = k.plane(g, 0.46, 0.34, new THREE.MeshBasicMaterial({ map: screenStatic(rng.int(0, 9)), color: new THREE.Color(1.6, 1.6, 1.7) }), 0, 0.23, 0.226);
    keep(scr).userData.flickerScreen = true;
    return g;
  },
};

// ---------------------------------------------------------------------------
// Pool

export const lounger = {
  place: 'floor', fp: [0.7, 1.9],
  build(k, rng) {
    const g = G();
    const frame = k.std(0xe8e8e4, 0.3, 0.6);
    const slat = k.std(rng.pick([0x5ab0c8, 0xf3f0e6, 0xf2a0a0]), 0.6);
    for (const s of [-1, 1]) {
      k.box(g, 0.04, 0.04, 1.8, frame, s * 0.3, 0.32, 0);
      k.box(g, 0.04, 0.3, 0.04, frame, s * 0.3, 0.15, 0.8);
      k.box(g, 0.04, 0.3, 0.04, frame, s * 0.3, 0.15, -0.5);
    }
    for (let i = 0; i < 9; i++) k.box(g, 0.56, 0.02, 0.1, slat, 0, 0.35, 0.8 - i * 0.14);
    for (let i = 0; i < 4; i++) k.box(g, 0.56, 0.02, 0.1, slat, 0, 0.42 + i * 0.1, -0.52 - i * 0.07, 0.95);
    if (rng.chance(0.5)) k.box(g, 0.5, 0.03, 0.7, k.std(rng.pick([0xf5d76e, 0xffffff, 0x7fc6e0]), 0.95), 0, 0.37, 0.4);
    return g;
  },
};

export const lifeguardChair = {
  place: 'floor', fp: [0.9, 0.9],
  build(k) {
    const g = G();
    const w = k.std(0xf2f2ee, 0.5);
    for (const [x, z] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]]) k.box(g, 0.06, 1.8, 0.06, w, x, 0.9, z, z * 0.1, 0, -x * 0.1);
    k.box(g, 0.7, 0.06, 0.6, w, 0, 1.6, 0);
    k.box(g, 0.7, 0.6, 0.06, w, 0, 1.92, -0.28);
    for (let i = 0; i < 4; i++) k.box(g, 0.66, 0.04, 0.08, w, 0, 0.35 + i * 0.35, 0.38);
    k.box(g, 0.3, 0.35, 0.02, k.std(0xd23030, 0.6), 0, 1.3, 0.4);
    return g;
  },
};

export const towelStack = {
  place: 'wall', fp: [0.5, 0.4],
  build(k, rng) {
    const g = G();
    k.box(g, 0.5, 0.45, 0.4, k.std(0xdde6e8, 0.4), 0, 0.225, 0);
    for (let i = 0; i < rng.int(2, 5); i++) k.box(g, 0.42, 0.07, 0.32, k.std(rng.pick([0xffffff, 0x9ad1e0, 0xf6c8c0]), 0.95), 0, 0.49 + i * 0.07, 0);
    return g;
  },
};

export const pottedPalm = {
  place: 'wall', fp: [0.5, 0.5],
  build(k, rng) {
    const g = G();
    k.cyl(g, 0.22, 0.17, 0.45, k.std(0xe9e4da, 0.5), 0, 0.225, 0);
    k.cyl(g, 0.2, 0.2, 0.02, k.std(0x3a2a1a, 1), 0, 0.44, 0);
    const leaf = k.std(0x3f7a3a, 0.6, 0, { side: THREE.DoubleSide });
    k.cyl(g, 0.02, 0.03, 1.1, k.std(0x6b5a3a, 0.9), 0, 0.95, 0);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * PI * 2 + rng.float(0, 0.3);
      k.plane(g, 0.18, 0.8, leaf, Math.sin(a) * 0.3, 1.45, Math.cos(a) * 0.3, 0.9, a, 0);
    }
    return g;
  },
};

export const drainGrate = {
  place: 'clutter', fp: null,
  build(k) {
    const g = G();
    const m = k.std(0x9aa3a6, 0.35, 0.8);
    k.box(g, 0.3, 0.01, 0.3, k.std(0x202528, 0.8), 0, 0.004, 0);
    for (let i = 0; i < 6; i++) k.box(g, 0.28, 0.012, 0.018, m, 0, 0.008, -0.12 + i * 0.048);
    return g;
  },
};

export const lockers = {
  place: 'wall', fp: [1.6, 0.5],
  build(k, rng, o = {}) {
    const g = G();
    const col = o.color || rng.pick([0x5f8fa8, 0x8aa36a, 0xb0a48a]);
    const m = k.std(col, 0.45, 0.4);
    const n = 4;
    for (let i = 0; i < n; i++) {
      const x = -0.6 + i * 0.4;
      const open = rng.chance(o.eerie ? 0.35 : 0.1);
      k.box(g, 0.38, 1.8, 0.46, m, x, 0.9, 0);
      const door = k.box(g, 0.36, 1.76, 0.02, m, x + (open ? 0.12 : 0), 0.9, 0.24 + (open ? 0.14 : 0), 0, open ? -1.1 : 0, 0);
      void door;
      for (let v = 0; v < 3; v++) k.box(g, 0.2, 0.012, 0.01, k.std(0x2a2a2a, 0.6), x, 1.5 + v * 0.04, 0.245);
    }
    return g;
  },
};

export const beachBall = {
  place: 'clutter', fp: null,
  build(k, rng) {
    const g = G();
    const cols = [0xe23b3b, 0xffffff, 0x2f7de1, 0xf5d020];
    for (let i = 0; i < 4; i++) {
      const s = k.mesh(g, new THREE.SphereGeometry(0.2, 12, 10, (i / 4) * PI * 2, PI / 2), k.std(cols[i], 0.35), 0, 0.2, 0);
      void s;
    }
    g.rotation.z = rng.float(0, 1);
    return g;
  },
};

// ---------------------------------------------------------------------------
// Toys (Pastel)

export const toyBlock = {
  place: 'floor', fp: [0.9, 0.9],
  build(k, rng, o = {}) {
    const g = G();
    const cols = o.grey ? [0xb5b0b8, 0x8f8a92, 0xcfc9d2] : [0xff9aa2, 0xffdac1, 0xb5ead7, 0xc7ceea, 0xfff5ba];
    let y = 0;
    for (let i = 0; i < rng.int(1, 3); i++) {
      const s = rng.float(0.5, 0.8);
      k.box(g, s, s, s, k.std(rng.pick(cols), 0.45), rng.float(-0.1, 0.1), y + s / 2, rng.float(-0.1, 0.1), 0, rng.float(0, 1), 0);
      y += s;
    }
    return g;
  },
};

export const balloon = {
  place: 'clutter', fp: null,
  build(k, rng, o = {}) {
    const g = G();
    const col = o.grey ? 0x9a979d : rng.pick([0xff7aa2, 0x8fd3ff, 0xffe27a, 0xb89cff, 0x9ff0c4]);
    const h = rng.float(1.2, 2.2);
    const b = k.sphere(g, 0.22, k.std(col, 0.18, 0, { emissive: col, emissiveIntensity: 0.08 }), 0, h, 0, 1, 1.18, 1);
    keep(b).userData.bob = rng.float(0, 6);
    const s = k.cyl(g, 0.004, 0.004, h - 0.22, k.std(0xffffff, 0.8), 0, (h - 0.22) / 2, 0, 0, 0, 0, 4);
    keep(s);
    return g;
  },
};

export const gumball = {
  place: 'floor', fp: [0.5, 0.5],
  build(k, rng) {
    const g = G();
    const red = k.std(0xd83c4a, 0.3, 0.2);
    k.cyl(g, 0.12, 0.2, 0.7, red, 0, 0.35, 0);
    k.box(g, 0.3, 0.2, 0.3, red, 0, 0.8, 0);
    k.sphere(g, 0.28, k.std(0xffffff, 0.02, 0, { transparent: true, opacity: 0.35 }), 0, 1.18, 0);
    for (let i = 0; i < 26; i++) {
      const a = rng.float(0, PI * 2);
      const r = rng.float(0, 0.2);
      k.sphere(g, 0.04, k.std(rng.pick([0xff5a7a, 0x5ac8ff, 0xffe04a, 0x7aff9a, 0xffffff]), 0.3), Math.cos(a) * r, 0.98 + rng.float(0, 0.25), Math.sin(a) * r, 1, 1, 1, 8);
    }
    return g;
  },
};

export const teddy = {
  place: 'clutter', fp: null,
  build(k, rng, o = {}) {
    const g = G();
    const fur = k.std(o.grey ? 0x7a7575 : rng.pick([0xc9a27a, 0xf2c6d6, 0xe8e0d0]), 0.95);
    const dark = k.std(0x1a1414, 0.3);
    k.sphere(g, 0.2, fur, 0, 0.2, 0, 1, 1.1, 0.9);
    const headless = o.eerie && rng.chance(0.5);
    if (!headless) {
      k.sphere(g, 0.15, fur, 0, 0.47, 0.02);
      for (const s of [-1, 1]) {
        k.sphere(g, 0.06, fur, s * 0.11, 0.6, 0);
        k.sphere(g, 0.02, dark, s * 0.05, 0.5, 0.14);
      }
    } else k.sphere(g, 0.15, fur, 0.35, 0.12, 0.1);
    for (const s of [-1, 1]) {
      k.sphere(g, 0.07, fur, s * 0.2, 0.25, 0.08);
      k.sphere(g, 0.08, fur, s * 0.12, 0.06, 0.15);
    }
    return g;
  },
};

export const carouselHorse = {
  place: 'floor', fp: [0.6, 1.1],
  build(k, rng) {
    const g = G();
    const gold = k.std(0xe0b84a, 0.25, 0.9);
    const body = k.std(rng.pick([0xffffff, 0xf7d3e0, 0xd9e8ff]), 0.35);
    k.cyl(g, 0.03, 0.03, 3, gold, 0, 1.5, 0);
    k.sphere(g, 0.25, body, 0, 1.2, 0, 1, 0.8, 1.9);
    k.box(g, 0.14, 0.4, 0.18, body, 0, 1.5, 0.42, 0.6);
    k.box(g, 0.16, 0.14, 0.3, body, 0, 1.68, 0.55);
    for (const [x, z] of [[-0.1, 0.3], [0.1, 0.3], [-0.1, -0.3], [0.1, -0.3]]) k.box(g, 0.06, 0.45, 0.06, body, x, 0.85, z, z > 0 ? -0.5 : 0.5);
    k.box(g, 0.28, 0.06, 0.3, k.std(0xd05a8a, 0.5), 0, 1.4, 0);
    return g;
  },
};

export const giantCandy = {
  place: 'floor', fp: [0.6, 0.6],
  build(k, rng) {
    const g = G();
    const col = rng.pick([0xff7ab0, 0x8fe0ff, 0xffe27a]);
    k.cyl(g, 0.03, 0.03, 1.4, k.std(0xffffff, 0.6), 0, 0.7, 0);
    const disc = k.cyl(g, 0.45, 0.45, 0.12, k.std(col, 0.2), 0, 1.6, 0, PI / 2);
    void disc;
    k.torus(g, 0.3, 0.05, k.std(0xffffff, 0.2), 0, 1.6, 0.065);
    k.torus(g, 0.15, 0.04, k.std(0xffffff, 0.2), 0, 1.6, 0.065);
    return g;
  },
};

// ---------------------------------------------------------------------------
// Hotel

export const roomServiceCart = {
  place: 'floor', fp: [0.6, 0.9],
  build(k, rng, o = {}) {
    const g = G();
    const cloth = k.std(0xf1ede2, 0.9);
    k.box(g, 0.6, 0.72, 0.9, cloth, 0, 0.36, 0);
    const silver = k.std(0xc8c8c8, 0.2, 1);
    k.sphere(g, 0.14, silver, -0.12, 0.72, 0.15, 1, 0.7, 1);
    k.cyl(g, 0.14, 0.14, 0.01, silver, 0.15, 0.73, -0.2);
    k.cyl(g, 0.03, 0.025, 0.2, k.std(0xaa1c2c, 0.1, 0, { transparent: true, opacity: 0.8 }), 0.18, 0.82, 0.2);
    if (o.eerie) k.box(g, 0.6, 0.72, 0.9, cloth, 0, 0.36, 0, 0, 0, 1.5);
    return g;
  },
};

export const vaseTable = {
  place: 'wall', fp: [0.8, 0.4],
  build(k, rng, o = {}) {
    const g = G();
    const wood = pbr(woodPanel('s-wood-dark', [60, 34, 22], 0.3));
    const m = k.mat('woodDark', () => wood);
    k.box(g, 0.8, 0.04, 0.4, m, 0, 0.8, 0);
    for (const [x, z] of [[-0.36, -0.16], [0.36, -0.16], [-0.36, 0.16], [0.36, 0.16]]) k.box(g, 0.04, 0.8, 0.04, m, x, 0.4, z);
    k.cyl(g, 0.06, 0.1, 0.3, k.std(0x2a4a6a, 0.15, 0.1), 0, 0.97, 0);
    const petal = k.std(o.eerie ? 0x2a1e1a : rng.pick([0xd8354a, 0xf2e6c8, 0xe8a0b8]), 0.7);
    const stem = k.std(o.eerie ? 0x3a3020 : 0x3c6a2a, 0.8);
    for (let i = 0; i < 6; i++) {
      const a = rng.float(-0.4, 0.4);
      const b = rng.float(0, PI * 2);
      k.cyl(g, 0.006, 0.006, 0.4, stem, Math.sin(b) * 0.05, 1.28, Math.cos(b) * 0.05, a, b, 0, 4);
      k.sphere(g, 0.045, petal, Math.sin(b) * 0.12, 1.47, Math.cos(b) * 0.12, 1, 0.8, 1, 8);
    }
    return g;
  },
};

export const armchair = {
  place: 'wall', fp: [0.8, 0.8],
  build(k, rng, o = {}) {
    const g = G();
    const fab = k.std(rng.pick([0x5a1a22, 0x2c3f33, 0x6a5a3a]), 0.9);
    k.box(g, 0.75, 0.4, 0.75, fab, 0, 0.2, 0);
    k.box(g, 0.75, 0.6, 0.18, fab, 0, 0.7, -0.3);
    for (const s of [-1, 1]) k.box(g, 0.14, 0.25, 0.7, fab, s * 0.32, 0.52, 0);
    if (o.eerie) g.rotation.z = PI / 2;
    return g;
  },
};

export const suitcase = {
  place: 'clutter', fp: null,
  build(k, rng) {
    const g = G();
    const m = k.std(rng.pick([0x3a2a1e, 0x6a3a2a, 0x2a3a5a, 0x8a8a86]), 0.5, 0.1);
    const upright = rng.chance(0.5);
    if (upright) {
      k.box(g, 0.45, 0.65, 0.22, m, 0, 0.325, 0);
      k.box(g, 0.14, 0.03, 0.03, k.std(0x111111, 0.4), 0, 0.67, 0);
    } else k.box(g, 0.45, 0.22, 0.65, m, 0, 0.11, 0);
    return g;
  },
};

export const luggageCart = {
  place: 'floor', fp: [0.7, 1.1],
  build(k, rng) {
    const g = G();
    const brass = k.std(0xc9a24a, 0.25, 1);
    k.box(g, 0.7, 0.05, 1.1, k.std(0x5a1a22, 0.9), 0, 0.2, 0);
    for (const z of [-0.5, 0.5]) {
      k.cyl(g, 0.02, 0.02, 1.6, brass, -0.32, 1.0, z);
      k.cyl(g, 0.02, 0.02, 1.6, brass, 0.32, 1.0, z);
    }
    k.torus(g, 0.32, 0.02, brass, 0, 1.8, 0, 0, PI / 2, 0, PI);
    for (let i = 0; i < 3; i++) {
      const s = suitcase.build(k, rng);
      s.position.set(rng.float(-0.15, 0.15), 0.23, -0.3 + i * 0.3);
      g.add(s);
    }
    return g;
  },
};

export const iceMachine = {
  place: 'wall', fp: [0.7, 0.7],
  build(k) {
    const g = G();
    k.box(g, 0.7, 1.4, 0.7, k.std(0xb8bcbf, 0.3, 0.8), 0, 0.7, 0);
    k.plane(g, 0.5, 0.18, k.tex('ice', signTexture('ICE', '製氷機', { bg: '#1a3a5a', w: 256, h: 96 })), 0, 1.2, 0.352);
    const l = k.plane(g, 0.08, 0.04, k.glow(0x6ab4ff, 2.2), 0.25, 1.05, 0.352);
    keep(l);
    return g;
  },
};

export const grandfatherClock = {
  place: 'wall', fp: [0.5, 0.35],
  build(k, rng, o = {}) {
    const g = G();
    const wood = k.mat('woodDark2', () => pbr(woodPanel('s-wood-dark2', [70, 38, 20], 0.25)));
    k.box(g, 0.5, 2.0, 0.35, wood, 0, 1.0, 0);
    k.plane(g, 0.34, 0.34, k.tex(`clock${o.eerie ? 'x' : ''}`, clockFace(!!o.eerie), { transparent: true }), 0, 1.7, 0.176);
    k.plane(g, 0.3, 0.8, k.std(0x1a1210, 0.1, 0.2), 0, 0.9, 0.176);
    return g;
  },
};

// ---------------------------------------------------------------------------
// School (Japan)

export const shoeCubbies = {
  place: 'wall', fp: [1.8, 0.4],
  build(k, rng, o = {}) {
    const g = G();
    const steel = k.std(0xbfc4c0, 0.45, 0.5);
    const inner = k.std(0x3a3e3a, 0.8);
    k.box(g, 1.8, 1.6, 0.38, steel, 0, 0.8, 0);
    const shoe = k.std(0xf2f0e8, 0.6);
    const toe = k.std(rng.pick([0x2a5ad0, 0xd02a3a, 0x2aa05a]), 0.5);
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 6; c++) {
        const x = -0.75 + c * 0.3;
        const y = 0.2 + r * 0.3;
        k.box(g, 0.26, 0.24, 0.02, inner, x, y, 0.18);
        if (rng.chance(o.eerie ? 0.8 : 0.35)) {
          k.box(g, 0.1, 0.06, 0.24, shoe, x - 0.055, y - 0.08, 0.18);
          k.box(g, 0.1, 0.06, 0.24, shoe, x + 0.055, y - 0.08, 0.18);
          k.box(g, 0.1, 0.02, 0.06, toe, x - 0.055, y - 0.05, 0.28);
          k.box(g, 0.1, 0.02, 0.06, toe, x + 0.055, y - 0.05, 0.28);
        }
      }
    }
    return g;
  },
};

export const bulletinBoard = {
  place: 'high', fp: null, y: 1.5,
  build(k, rng) {
    const g = G();
    k.box(g, 1.8, 0.95, 0.03, k.std(0x6b5234, 0.6), 0, 0, 0.015);
    k.plane(g, 1.7, 0.85, new THREE.MeshStandardMaterial({ map: bulletinTexture(rng.int(0, 3)), roughness: 0.9 }), 0, 0, 0.032);
    return g;
  },
};

export const trashBins = {
  place: 'wall', fp: [1.0, 0.4],
  build(k, rng, o = {}) {
    const g = G();
    const cols = o.station ? [0x2a6ad0, 0xd0a02a, 0x3aa05a] : [0x2a6ad0, 0xd03a2a, 0x9aa0a0];
    const labels = o.station ? ['びん・缶', 'ペットボトル', 'もえるゴミ'] : ['可燃', '不燃', '資源'];
    cols.forEach((c, i) => {
      const x = -0.34 + i * 0.34;
      k.box(g, 0.3, 0.8, 0.36, k.std(c, 0.5, 0.2), x, 0.4, 0);
      k.box(g, 0.14, 0.03, 0.02, k.std(0x111111, 0.6), x, 0.72, 0.19);
      k.plane(g, 0.26, 0.1, k.tex(`bin${i}${o.station}`, signTexture(labels[i], '', { bg: '#ffffff', fg: '#222', w: 256, h: 96 })), x, 0.55, 0.181);
    });
    return g;
  },
};

export const mopBucket = {
  place: 'clutter', fp: null,
  build(k) {
    const g = G();
    k.cyl(g, 0.2, 0.17, 0.32, k.std(0x2a7ad0, 0.4), 0, 0.16, 0);
    k.cyl(g, 0.015, 0.015, 1.3, k.std(0xb89a6a, 0.6), 0.1, 0.7, 0, 0, 0, 0.25);
    k.cyl(g, 0.12, 0.08, 0.2, k.std(0xd8d4c8, 1), 0.1, 0.12, 0);
    return g;
  },
};

export const waterFountain = {
  place: 'wall', fp: [1.6, 0.5],
  build(k) {
    const g = G();
    const steel = k.std(0xc8ccd0, 0.25, 0.9);
    k.box(g, 1.6, 0.12, 0.5, steel, 0, 0.8, 0);
    k.box(g, 1.6, 0.7, 0.08, k.std(0xdcd8cc, 0.7), 0, 0.4, -0.2);
    for (let i = 0; i < 4; i++) k.cyl(g, 0.02, 0.02, 0.12, steel, -0.6 + i * 0.4, 0.92, 0.05);
    return g;
  },
};

export const hydrantBox = {
  place: 'wall', fp: null,
  build(k) {
    const g = G();
    k.box(g, 0.7, 0.9, 0.18, k.std(0xc8201a, 0.4, 0.3), 0, 0.85, 0.09);
    k.plane(g, 0.5, 0.14, k.tex('hydrant', signTexture('消火栓', 'HYDRANT', { bg: '#c8201a', w: 256, h: 80 })), 0, 1.1, 0.181);
    const lamp = k.sphere(g, 0.05, k.glow(0xff3020, 2.5), 0, 1.4, 0.12, 1, 1, 0.6);
    keep(lamp);
    return g;
  },
};

export const tvCart = {
  place: 'floor', fp: [0.7, 0.5],
  build(k, rng) {
    const g = G();
    const metal = k.std(0x4a4e52, 0.4, 0.6);
    k.box(g, 0.7, 0.03, 0.5, metal, 0, 0.8, 0);
    k.box(g, 0.7, 0.03, 0.5, metal, 0, 0.2, 0);
    for (const [x, z] of [[-0.33, -0.23], [0.33, -0.23], [-0.33, 0.23], [0.33, 0.23]]) k.box(g, 0.03, 0.8, 0.03, metal, x, 0.4, z);
    const tv = crtMonitor.build(k, rng);
    tv.position.y = 0.82;
    tv.scale.setScalar(1.4);
    g.add(tv);
    return g;
  },
};

export const deskBarricade = {
  place: 'floor', fp: [1.4, 1.2],
  build(k, rng) {
    const g = G();
    const top = k.std(0xc89b62, 0.6);
    const metal = k.std(0x5d6a63, 0.5, 0.5);
    for (let i = 0; i < rng.int(3, 6); i++) {
      const d = G();
      k.box(d, 0.64, 0.04, 0.46, top, 0, 0.72, 0);
      for (const [x, z] of [[-0.28, -0.19], [0.28, -0.19], [-0.28, 0.19], [0.28, 0.19]]) k.box(d, 0.04, 0.7, 0.04, metal, x, 0.35, z);
      d.position.set(rng.float(-0.35, 0.35), i < 2 ? 0 : 0.5 + (i - 2) * 0.4, rng.float(-0.3, 0.3));
      d.rotation.set(rng.float(-0.6, 0.6), rng.float(0, PI), i < 2 ? 0 : rng.float(-2, 2));
      g.add(d);
    }
    return g;
  },
};

export const teruteru = {
  place: 'ceil', fp: null,
  build(k) {
    const g = G();
    const cloth = k.std(0xf6f4ee, 0.9, 0, { side: THREE.DoubleSide });
    k.cyl(g, 0.003, 0.003, 0.5, k.std(0xeeeeee, 0.8), 0, -0.25, 0, 0, 0, 0, 3);
    k.sphere(g, 0.08, cloth, 0, -0.55, 0);
    k.cyl(g, 0.02, 0.15, 0.22, cloth, 0, -0.7, 0, 0, 0, 0, 10);
    return g;
  },
};

// ---------------------------------------------------------------------------
// Station (Japan)

export const vendingMachine = {
  place: 'wall', fp: [0.95, 0.75],
  build(k, rng) {
    const g = G();
    const seed = rng.int(0, 5);
    k.box(g, 0.95, 1.83, 0.72, k.std(seed % 2 ? 0xe8ecef : 0xd64032, 0.35, 0.3), 0, 0.915, 0);
    const face = k.plane(g, 0.88, 1.74, (() => {
      const m = new THREE.MeshStandardMaterial({ map: vendingTexture(seed), emissiveMap: vendingTexture(seed), emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.25 });
      return m;
    })(), 0, 0.93, 0.361);
    keep(face).userData.vending = true;
    return g;
  },
};

export const bench = {
  place: 'wall', fp: [1.6, 0.5],
  build(k, rng) {
    const g = G();
    const seat = k.std(rng.pick([0x2a6ad0, 0xe0a030, 0xd8d4c8]), 0.35, 0.1);
    const metal = k.std(0x8a8e92, 0.35, 0.8);
    for (let i = 0; i < 4; i++) {
      k.box(g, 0.38, 0.05, 0.42, seat, -0.6 + i * 0.4, 0.44, 0);
      k.box(g, 0.38, 0.4, 0.04, seat, -0.6 + i * 0.4, 0.68, -0.2, -0.12);
    }
    for (const x of [-0.75, 0, 0.75]) k.box(g, 0.05, 0.42, 0.3, metal, x, 0.21, 0);
    return g;
  },
};

export const ticketMachine = {
  place: 'wall', fp: [0.7, 0.55],
  build(k) {
    const g = G();
    k.box(g, 0.7, 1.6, 0.55, k.std(0xd8dcdc, 0.35, 0.3), 0, 0.8, 0);
    const scr = k.plane(g, 0.5, 0.36, k.glow(0x5ab0ff, 1.1), 0, 1.15, 0.28, -0.35);
    keep(scr);
    k.box(g, 0.3, 0.05, 0.05, k.std(0x222222, 0.5), 0, 0.8, 0.28);
    k.plane(g, 0.6, 0.12, k.tex('kippu', signTexture('きっぷ', 'Tickets', { bg: '#2e7d4f', w: 256, h: 64 })), 0, 1.5, 0.276);
    return g;
  },
};

export const ticketGate = {
  place: 'floor', fp: [0.3, 1.4],
  build(k) {
    const g = G();
    k.box(g, 0.28, 1.0, 1.4, k.std(0xd0d4d6, 0.3, 0.4), 0, 0.5, 0);
    k.plane(g, 0.2, 0.12, k.glow(0x3ae07a, 1.4), 0, 1.01, 0.5, -PI / 2);
    k.box(g, 0.04, 0.2, 0.4, k.std(0x1a1a1a, 0.4), 0.16, 0.8, -0.1);
    return g;
  },
};

export const umbrella = {
  place: 'clutter', fp: null,
  build(k, rng) {
    const g = G();
    const m = k.std(rng.pick([0xf0f0f0, 0x1a1a1a, 0x2a4a8a]), 0.3, 0, { transparent: true, opacity: 0.85 });
    k.cyl(g, 0.01, 0.01, 0.85, k.std(0x888888, 0.3, 0.8), 0, 0.04, 0, PI / 2 - 0.06, rng.float(0, PI), 0, 5);
    k.cyl(g, 0.06, 0.02, 0.6, m, 0.15, 0.06, 0, 0, 0, PI / 2, 8);
    return g;
  },
};

export const lostShoe = {
  place: 'clutter', fp: null,
  build(k, rng) {
    const g = G();
    k.box(g, 0.1, 0.07, 0.27, k.std(rng.pick([0x1a1a1a, 0x5a3a2a, 0xe8e4dc]), 0.4), 0, 0.035, 0, 0, rng.float(0, PI), 0);
    return g;
  },
};

export const stationMap = {
  place: 'high', fp: null, y: 1.5,
  build(k) {
    const g = G();
    k.box(g, 1.3, 0.85, 0.04, k.std(0x3a3e42, 0.4, 0.6), 0, 0, 0.02);
    const m = k.plane(g, 1.2, 0.75, new THREE.MeshStandardMaterial({ map: mapBoard(), emissiveMap: mapBoard(), emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 0.3 }), 0, 0, 0.041);
    keep(m);
    return g;
  },
};

export const cctv = {
  place: 'high', fp: null, y: 2.5,
  build(k) {
    const g = G();
    const w = k.std(0xe8e8e4, 0.4);
    k.box(g, 0.06, 0.06, 0.2, w, 0, 0.05, 0.1);
    k.box(g, 0.12, 0.12, 0.3, w, 0, -0.05, 0.3, 0.4);
    const led = k.sphere(g, 0.012, k.glow(0xff2020, 3), 0.04, -0.03, 0.46);
    keep(led).userData.blink = true;
    return g;
  },
};

export const pillarAd = {
  place: 'high', fp: null, y: 1.4,
  build(k, rng, o = {}) {
    const g = G();
    k.box(g, 0.75, 1.05, 0.05, k.std(0x2a2e32, 0.4, 0.6), 0, 0, 0.025);
    const tex = posterTexture(rng.int(0, 40), { mood: o.mood || 0 });
    const m = k.plane(g, 0.66, 0.94, new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.2 }), 0, 0, 0.052);
    keep(m);
    return g;
  },
};

// ---------------------------------------------------------------------------
// Shrine (Japan)

export const stoneLantern = {
  place: 'floor', fp: [0.5, 0.5],
  build(k) {
    const g = G();
    const stone = k.mat('lanternStone', () => new THREE.MeshStandardMaterial({ color: 0x8a877e, roughness: 0.95 }));
    k.box(g, 0.5, 0.12, 0.5, stone, 0, 0.06, 0);
    k.cyl(g, 0.1, 0.12, 0.8, stone, 0, 0.52, 0, 0, 0, 0, 8);
    k.box(g, 0.44, 0.1, 0.44, stone, 0, 0.97, 0);
    k.box(g, 0.34, 0.3, 0.34, stone, 0, 1.17, 0);
    const win = k.box(g, 0.36, 0.16, 0.16, k.glow(0xffb45a, 2.4), 0, 1.18, 0);
    keep(win).userData.lanternFlame = true;
    k.cyl(g, 0.02, 0.38, 0.22, stone, 0, 1.43, 0, 0, PI / 4, 0, 4);
    k.sphere(g, 0.06, stone, 0, 1.58, 0);
    return g;
  },
};

export const foxStatue = {
  place: 'floor', fp: [0.5, 0.6],
  build(k, rng) {
    const g = G();
    const stone = k.std(0x9a968c, 0.9);
    const red = k.std(0xc0281e, 0.8);
    k.box(g, 0.5, 0.5, 0.6, stone, 0, 0.25, 0);
    k.sphere(g, 0.16, stone, 0, 0.75, 0, 0.9, 1.3, 1);
    k.sphere(g, 0.1, stone, 0, 1.0, 0.06, 1, 0.9, 1.2);
    k.box(g, 0.06, 0.06, 0.16, stone, 0, 0.97, 0.18);
    for (const s of [-1, 1]) k.mesh(g, new THREE.ConeGeometry(0.04, 0.14, 4), stone, s * 0.06, 1.12, 0.03);
    k.sphere(g, 0.1, stone, 0, 0.72, -0.18, 0.7, 1.6, 0.7);
    k.cyl(g, 0.12, 0.17, 0.12, red, 0, 0.62, 0.05, 0.3, 0, 0, 10);
    void rng;
    return g;
  },
};

export const jizo = {
  place: 'clutter', fp: null,
  build(k, rng, o = {}) {
    const g = G();
    const stone = k.std(0x8c8a82, 0.95);
    const red = k.std(0xc4261c, 0.85);
    k.cyl(g, 0.13, 0.15, 0.42, stone, 0, 0.21, 0, 0, 0, 0, 10);
    k.sphere(g, 0.11, stone, 0, 0.5, 0);
    k.cyl(g, 0.05, 0.16, 0.18, red, 0, 0.36, 0.02, 0.15, 0, 0, 10);
    if (o.eerie || rng.chance(0.3)) k.cyl(g, 0.12, 0.13, 0.05, red, 0, 0.62, 0);
    return g;
  },
};

export const offeringBox = {
  place: 'floor', fp: [0.9, 0.5],
  build(k) {
    const g = G();
    const wood = k.mat('shrineWood', () => pbr(woodPanel('s-wood-shrine', [110, 72, 40], 0.5)));
    k.box(g, 0.9, 0.55, 0.5, wood, 0, 0.275, 0);
    for (let i = 0; i < 6; i++) k.box(g, 0.8, 0.03, 0.04, k.std(0x2a1a10, 0.8), 0, 0.56, -0.18 + i * 0.07, 0.4);
    k.plane(g, 0.3, 0.12, k.tex('saisen', signTexture('奉納', '', { bg: '#1a1a1a', fg: '#e0c070', w: 128, h: 48 })), 0, 0.35, 0.252);
    return g;
  },
};

export const emaRack = {
  place: 'floor', fp: [1.4, 0.3],
  build(k, rng) {
    const g = G();
    const wood = k.std(0x5a3a22, 0.8);
    k.box(g, 0.06, 1.4, 0.06, wood, -0.68, 0.7, 0);
    k.box(g, 0.06, 1.4, 0.06, wood, 0.68, 0.7, 0);
    k.box(g, 1.44, 0.06, 0.06, wood, 0, 1.2, 0);
    k.box(g, 1.44, 0.06, 0.06, wood, 0, 0.85, 0);
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < 9; i++) {
        const tex = emaTexture(rng.int(0, 20));
        k.plane(g, 0.14, 0.1, k.tex(`ema${tex.uuid}`, tex, { side: THREE.DoubleSide }), -0.6 + i * 0.15, 1.12 - r * 0.35, 0.04 + (i % 2) * 0.01, 0, 0, rng.float(-0.1, 0.1));
      }
    }
    return g;
  },
};

export const chozuya = {
  place: 'floor', fp: [1.1, 0.7],
  build(k) {
    const g = G();
    const stone = k.std(0x7a786e, 0.9);
    k.box(g, 1.1, 0.6, 0.6, stone, 0, 0.3, 0);
    k.plane(g, 0.96, 0.46, k.std(0x1f3a3a, 0.02, 0.1), 0, 0.58, 0, -PI / 2);
    const bamboo = k.std(0xb8a060, 0.5);
    for (let i = 0; i < 4; i++) {
      k.cyl(g, 0.012, 0.012, 0.4, bamboo, -0.3 + i * 0.2, 0.65, 0.2, 0.3, 0, PI / 2);
      k.cyl(g, 0.04, 0.04, 0.06, bamboo, -0.3 + i * 0.2 - 0.18, 0.66, 0.26);
    }
    return g;
  },
};

export const paperLantern = {
  place: 'ceil', fp: null,
  build(k, rng) {
    const g = G();
    const m = k.glow(rng.pick([0xff6a3a, 0xffd28a]), 1.8);
    k.cyl(g, 0.004, 0.004, 0.3, k.std(0x222222, 0.8), 0, -0.15, 0, 0, 0, 0, 3);
    const l = k.sphere(g, 0.16, m, 0, -0.42, 0, 1, 1.3, 1);
    keep(l).userData.lanternFlame = true;
    k.cyl(g, 0.09, 0.09, 0.03, k.std(0x1a1a1a, 0.6), 0, -0.21, 0);
    k.cyl(g, 0.09, 0.09, 0.03, k.std(0x1a1a1a, 0.6), 0, -0.63, 0);
    return g;
  },
};

export const spiderLilies = {
  place: 'clutter', fp: null,
  build(k, rng) {
    const g = G();
    const red = k.std(0xd2201a, 0.55, 0, { emissive: 0x400000, emissiveIntensity: 0.4 });
    const stem = k.std(0x3a6a2a, 0.7);
    for (let i = 0; i < rng.int(4, 10); i++) {
      const x = rng.float(-0.5, 0.5);
      const z = rng.float(-0.5, 0.5);
      const h = rng.float(0.35, 0.55);
      k.cyl(g, 0.006, 0.006, h, stem, x, h / 2, z, 0, 0, 0, 4);
      for (let p = 0; p < 6; p++) {
        const a = (p / 6) * PI * 2;
        k.cyl(g, 0.004, 0.002, 0.12, red, x + Math.cos(a) * 0.04, h + 0.02, z + Math.sin(a) * 0.04, Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2, 3);
      }
    }
    return g;
  },
};

export const foxMask = {
  place: 'high', fp: null, y: 1.7,
  build(k) {
    const g = G();
    const white = k.std(0xf4f0e8, 0.3);
    const red = k.std(0xc4261c, 0.4);
    k.sphere(g, 0.12, white, 0, 0, 0.04, 1, 1, 0.45);
    k.mesh(g, new THREE.ConeGeometry(0.06, 0.14, 12), white, 0, -0.05, 0.12, PI / 2);
    for (const s of [-1, 1]) {
      k.mesh(g, new THREE.ConeGeometry(0.035, 0.1, 4), white, s * 0.07, 0.12, 0.04);
      k.box(g, 0.05, 0.01, 0.01, red, s * 0.045, 0.02, 0.1, 0, 0, s * 0.3);
    }
    return g;
  },
};

// ---------------------------------------------------------------------------

export { paint };
