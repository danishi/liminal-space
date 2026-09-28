import * as THREE from 'three';
import { keep } from '../../props/kit.js';
import { signTexture } from '../../props/canvas.js';
import { PI, SHOP_H } from './constants.js';
import { signTex, cctvTex } from './textures.js';

// ---------------------------------------------------------------------------
// Props

export const G = () => new THREE.Group();

/** Plane whose UVs are in metres, so photo textures keep their real size. */
function uvPlane(w, h) {
  const geo = new THREE.PlaneGeometry(w, h);
  const uv = geo.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * w, uv.getY(k) * h);
  return geo;
}

/**
 * A storefront, local +Z facing the concourse, x across its width, origin on
 * the floor at the boundary line. kinds: glass (open shop), shutter, papered,
 * dark. Returns the group; `o.boxes` collects local collision boxes.
 */
export function storefront(kit, rng, o) {
  const g = G();
  const { w, kind, low = false, u = 0, mats } = o;
  const top = low ? 2.88 : SHOP_H;
  const openH = low ? 2.3 : 2.9;
  const wo = w - 0.68;
  const boxes = (o.boxes = []);
  for (const s of [-1, 1]) {
    kit.box(g, 0.34, top, 0.24, mats.pilaster, s * (w / 2 - 0.17), top / 2, 0.08);
    kit.box(g, 0.38, 0.12, 0.28, mats.base, s * (w / 2 - 0.17), 0.06, 0.08);
    boxes.push([s * (w / 2 - 0.17), 0.08, 0.36, 0.26]);
  }
  kit.box(g, wo, top - openH, 0.16, mats.frame, 0, (openH + top) / 2, 0.05);
  if (kind === 'glass') {
    const door = 1.25;
    const pw = wo / 2 - door;
    for (const s of [-1, 1]) {
      const cx = s * (door + pw / 2);
      kit.box(g, pw, 0.32, 0.08, mats.frame, cx, 0.16, 0);
      kit.box(g, pw, openH - 0.32, 0.012, mats.glass, cx, 0.32 + (openH - 0.32) / 2, 0);
      for (const x of [s * door, s * (door + pw / 2), s * (wo / 2)]) kit.box(g, 0.06, openH, 0.1, mats.frame, x, openH / 2, 0);
      boxes.push([cx, 0, pw, 0.14]);
      // sale decals on the glass
      if (o.decal && s === 1) kit.plane(g, 1.0, 0.25, o.decal, cx, 1.5, 0.012);
    }
    // the doors were left folded open
    for (const s of [-1, 1]) {
      const leaf = G();
      kit.box(leaf, 0.05, 2.25, 0.05, mats.frame, 0, 1.125, 0);
      kit.box(leaf, 0.05, 2.25, 0.05, mats.frame, 0, 1.125, -1.0);
      kit.box(leaf, 0.012, 2.1, 1.0, mats.glass, 0, 1.12, -0.5);
      kit.box(leaf, 0.05, 0.08, 1.0, mats.frame, 0, 2.22, -0.5);
      kit.box(leaf, 0.05, 0.12, 1.0, mats.frame, 0, 0.06, -0.5);
      leaf.position.set(s * door, 0, -0.05);
      leaf.rotation.y = s * 0.25;
      g.add(leaf);
    }
  } else if (kind === 'shutter') {
    const gap = o.gap || 0;
    const sh = kit.mesh(g, uvPlane(wo, openH - gap), mats.shutter, 0, gap + (openH - gap) / 2, 0.06);
    void sh;
    kit.box(g, wo, 0.07, 0.08, mats.frame, 0, gap + 0.035, 0.07);
    kit.box(g, 0.12, 0.05, 0.04, kit.std(0x999999, 0.4, 0.8), 0.4, gap + 0.07, 0.11);
    for (const s of [-1, 1]) kit.box(g, 0.07, openH, 0.12, mats.frame, s * (wo / 2 - 0.035), openH / 2, 0.06);
    if (gap > 0) {
      kit.plane(g, wo - 0.1, gap, kit.std(0x050505, 1), 0, gap / 2, 0.03);
      // something is standing right behind it
      if (o.feet) {
        for (const x of [-0.12, 0.12]) kit.box(g, 0.1, 0.07, 0.24, kit.std(0xe6dfd4, 0.3), o.feet + x, 0.035, 0.1);
      }
    }
  } else {
    // papered-over or dark glass, straight onto the wall behind
    const glassH = openH - 0.32;
    kit.box(g, wo, 0.32, 0.08, mats.frame, 0, 0.16, 0.06);
    if (kind === 'papered') kit.plane(g, wo, glassH, o.paper, 0, 0.32 + glassH / 2, 0.02);
    else kit.plane(g, wo, glassH, mats.darkGlass, 0, 0.32 + glassH / 2, 0.02);
    kit.box(g, wo, glassH, 0.012, mats.glass, 0, 0.32 + glassH / 2, 0.07);
    for (let k = 0; k <= 3; k++) kit.box(g, 0.06, openH, 0.1, mats.frame, -wo / 2 + (k * wo) / 3, openH / 2, 0.07);
    if (o.banner) kit.plane(g, 2.4, 0.6, o.banner, 0, 1.75, 0.08);
  }
  // the sign: on the bulkhead above, or in the fascia band under the mezzanine
  if (o.sign) {
    const s = o.sign;
    if (s.ghost) kit.plane(g, 5.2, 0.8, s.mat, 0, top + 0.62, 0.012);
    else if (low) {
      kit.box(g, wo * 0.78, 0.44, 0.06, mats.frame, 0, (openH + top) / 2, 0.15);
      keep(kit.plane(g, wo * 0.76, 0.42, s.mat, 0, (openH + top) / 2, 0.181));
    } else {
      const sw = Math.min(w - 0.8, 5.4);
      kit.box(g, sw + 0.1, 0.8, 0.12, mats.frame, 0, top + 0.62, 0.06);
      keep(kit.plane(g, sw, 0.72, s.mat, 0, top + 0.62, 0.121));
    }
  }
  return g;
}

/** Wire shopping cart, sometimes on its side. */
export const cart = {
  place: 'floor', fp: [0.6, 1.0],
  build(k, rng, o = {}) {
    const outer = G();
    const g = G();
    const wire = k.std(0xb8bcc0, 0.35, 0.85);
    const red = k.std(0xc0262a, 0.45);
    const bar = (w, h, d, x, y, z, rx = 0) => k.box(g, w, h, d, wire, x, y, z, rx);
    // basket
    for (const s of [-1, 1]) {
      bar(0.02, 0.02, 0.9, s * 0.27, 1.0, 0);
      bar(0.02, 0.02, 0.8, s * 0.24, 0.5, 0.02);
      for (let n = 0; n < 6; n++) bar(0.015, 0.5, 0.015, s * 0.255, 0.75, -0.42 + n * 0.17, 0.05);
    }
    for (let n = 0; n < 7; n++) bar(0.015, 0.015, 0.8, -0.24 + n * 0.08, 0.5, 0.02);
    for (let n = 0; n < 6; n++) bar(0.54, 0.015, 0.015, 0, 0.55 + n * 0.09, 0.45);
    for (let n = 0; n < 6; n++) bar(0.54, 0.015, 0.015, 0, 0.55 + n * 0.09, -0.44);
    bar(0.56, 0.03, 0.03, 0, 1.0, 0.45);
    k.box(g, 0.58, 0.05, 0.05, red, 0, 1.05, -0.56);
    for (const s of [-1, 1]) {
      bar(0.02, 0.6, 0.02, s * 0.25, 0.75, -0.5, -0.2);
      bar(0.02, 0.45, 0.02, s * 0.2, 0.25, 0.35, 0.2);
      bar(0.02, 0.45, 0.02, s * 0.2, 0.25, -0.35, -0.2);
      bar(0.02, 0.02, 0.8, s * 0.2, 0.08, 0);
      for (const z of [-0.38, 0.38]) k.cyl(g, 0.05, 0.05, 0.04, k.std(0x1a1a1a, 0.7), s * 0.2, 0.05, z, 0, 0, PI / 2, 10);
    }
    outer.add(g);
    if (o.tipped) {
      g.rotation.z = PI / 2;
      g.position.set(0.3, 0.3, 0);
    }
    return outer;
  },
};

/** Round chrome clothes rack. */
export const clothesRack = {
  place: 'floor', fp: [1.2, 1.2],
  build(k, rng, o = {}) {
    const g = G();
    const chrome = k.std(0xc8ccd0, 0.2, 0.95);
    k.cyl(g, 0.04, 0.04, 0.02, chrome, 0, 0.01, 0);
    for (let a = 0; a < 4; a++) k.box(g, 0.9, 0.02, 0.04, chrome, 0, 0.02, 0, 0, (a * PI) / 4, 0);
    k.cyl(g, 0.02, 0.02, 1.3, chrome, 0, 0.66, 0);
    k.torus(g, 0.5, 0.012, chrome, 0, 1.3, 0, PI / 2);
    const cols = o.mood > 0.9 ? [0x1a1a1a, 0x222024, 0x2a2626] : [0xb03030, 0x2a3550, 0xe0c050, 0x3a7a5a, 0xe8e2d8, 0x8a4a8a, 0x5aa0c8, 0xd87a4a];
    const n = o.mood > 0.7 ? rng.int(3, 7) : rng.int(12, 18);
    for (let s = 0; s < n; s++) {
      const a = (s / n) * PI * 2 + rng.float(-0.05, 0.05);
      const len = rng.float(0.6, 0.95);
      k.box(g, 0.42, len, 0.03, k.std(rng.pick(cols), 0.9), Math.cos(a) * 0.5, 1.28 - len / 2, Math.sin(a) * 0.5, 0, -a + PI / 2, 0);
    }
    return g;
  },
};

/** Slatwall with shelves of folded things. */
export const wallShelf = {
  place: 'wall', fp: [2.0, 0.45],
  build(k, rng, o = {}) {
    const g = G();
    k.box(g, 2.0, 2.2, 0.04, k.std(0xe8e2d6, 0.5), 0, 1.25, -0.2);
    for (let y = 0.4; y < 2.3; y += 0.12) k.box(g, 2.0, 0.012, 0.012, k.std(0x9a948a, 0.5), 0, y, -0.18);
    const cols = o.cols || [0xb03030, 0x2a3550, 0xe0c050, 0x3a7a5a, 0xe8e2d8, 0x8a4a8a, 0x5aa0c8];
    for (const y of [0.55, 1.05, 1.55, 2.05]) {
      k.box(g, 1.9, 0.03, 0.38, k.std(0xd8d2c6, 0.45), 0, y, 0);
      if (o.mood > 0.8 && rng.chance(0.5)) continue;
      let x = -0.85;
      while (x < 0.8) {
        const bw = rng.float(0.2, 0.34);
        const bh = rng.float(0.1, 0.3);
        k.box(g, bw, bh, rng.float(0.2, 0.32), k.std(rng.pick(cols), 0.85), x + bw / 2, y + 0.015 + bh / 2, 0);
        x += bw + rng.float(0.02, 0.12);
      }
    }
    return g;
  },
};

/** Video-rental shelf of cassette boxes. */
export const vhsShelf = {
  place: 'wall', fp: [1.8, 0.4],
  build(k, rng) {
    const g = G();
    const wood = k.std(0x6a4a30, 0.6);
    k.box(g, 1.8, 2.0, 0.04, wood, 0, 1.0, -0.18);
    for (const s of [-1, 1]) k.box(g, 0.04, 2.0, 0.38, wood, s * 0.88, 1.0, 0);
    const cols = [0x1a1a1a, 0xc02020, 0x2040a0, 0xe0c030, 0x303030, 0x208040, 0xe06020, 0xf0f0f0];
    for (let r = 0; r < 5; r++) {
      const y = 0.15 + r * 0.38;
      k.box(g, 1.72, 0.025, 0.36, wood, 0, y, 0);
      let x = -0.82;
      while (x < 0.8) {
        k.box(g, 0.03, 0.2, 0.13, k.std(rng.pick(cols), 0.5), x, y + 0.11, 0.08);
        x += 0.034 + (rng.chance(0.1) ? 0.06 : 0);
      }
    }
    return g;
  },
};

/** A waterbed, still sloshing faintly. */
export const waterbed = {
  place: 'floor', fp: [1.9, 2.3],
  build(k, rng) {
    const g = G();
    const wood = k.std(rng.pick([0x5a3a24, 0x8a5a34, 0x2a1a14]), 0.45);
    k.box(g, 1.9, 0.4, 2.3, wood, 0, 0.2, 0);
    k.box(g, 1.9, 1.0, 0.12, wood, 0, 0.5, -1.1);
    const water = k.mat('waterbed', () => new THREE.MeshPhysicalMaterial({ color: 0x3a7ab8, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.08 }));
    k.box(g, 1.72, 0.2, 2.1, water, 0, 0.47, 0.03);
    k.box(g, 0.7, 0.12, 0.35, k.std(0xf0ece4, 0.9), -0.4, 0.62, -0.8);
    k.box(g, 0.7, 0.12, 0.35, k.std(0xf0ece4, 0.9), 0.4, 0.62, -0.8);
    return g;
  },
};

/** Candle table: pillars of wax in every colour. */
export const candleTable = {
  place: 'floor', fp: [1.2, 1.2],
  build(k, rng) {
    const g = G();
    const wood = k.std(0x7a5a3a, 0.5);
    k.cyl(g, 0.6, 0.6, 0.05, wood, 0, 0.78, 0, 0, 0, 0, 24);
    k.cyl(g, 0.06, 0.1, 0.76, wood, 0, 0.38, 0);
    const cols = [0xf0e0c0, 0xd05050, 0x8a60b0, 0x60a080, 0xe0b040, 0xf6f2ea];
    for (let n = 0; n < 16; n++) {
      const a = rng.float(0, PI * 2);
      const r = rng.float(0, 0.5);
      const h = rng.float(0.08, 0.3);
      k.cyl(g, 0.045, 0.045, h, k.std(rng.pick(cols), 0.7), Math.cos(a) * r, 0.8 + h / 2, Math.sin(a) * r, 0, 0, 0, 10);
    }
    return g;
  },
};

/** Counter with a scanned cash register on it. */
export function counter(k, rng, color = 0xd8cfc0) {
  const g = G();
  k.box(g, 2.0, 0.95, 0.65, k.std(color, 0.55), 0, 0.475, 0);
  k.box(g, 2.1, 0.05, 0.75, k.std(0x2a2826, 0.35), 0, 0.975, 0);
  k.model(g, 'CashRegister_01', -0.4, 1.0, 0, PI);
  return g;
}

/** Display plinth for a shop window. */
export function plinth(k) {
  const g = G();
  k.box(g, 1.5, 0.14, 1.2, k.std(0x8a1c24, 0.9), 0, 0.07, 0);
  return g;
}

/** Raised terrazzo planter with a scanned plant. */
export function planter(k, rng, o = {}) {
  const g = G();
  const w = o.w || 1.8;
  const d = o.d || 1.8;
  const stone = k.mat('planter', () => new THREE.MeshStandardMaterial({ color: 0xd8cfbd, roughness: 0.4 }));
  k.box(g, w, 0.55, d, stone, 0, 0.275, 0);
  k.box(g, w + 0.08, 0.06, d + 0.08, k.std(0xc9bfab, 0.35), 0, 0.57, 0);
  k.box(g, w - 0.16, 0.02, d - 0.16, k.std(o.dead ? 0x6a5a44 : 0x3a2c20, 1), 0, 0.56, 0);
  const n = w > 2.5 ? 2 : 1;
  for (let s = 0; s < n; s++) {
    const x = n === 1 ? 0 : (s - 0.5) * (w * 0.5);
    if (o.dead && rng.chance(0.6)) continue;
    k.model(g, 'potted_plant_02', x, 0.02, 0, rng.float(0, PI * 2), rng.float(1.6, 1.9));
  }
  return g;
}

/** Brass railing along x (length len), at local z = 0. */
export function railing(k, len, mat) {
  const g = G();
  const n = Math.max(1, Math.round(len / 1.25));
  for (let s = 0; s <= n; s++) k.cyl(g, 0.025, 0.025, 0.95, mat, -len / 2 + (s * len) / n, 0.475, 0, 0, 0, 0, 8);
  k.box(g, len, 0.05, 0.06, mat, 0, 0.95, 0);
  k.box(g, len, 0.03, 0.03, mat, 0, 0.45, 0);
  return g;
}

/** Food court stall: counter, sneeze guard, register, menu board and sign. */
export function stall(k, rng, name, style, dead, menu, glass) {
  const g = G();
  const col = rng.pick([0xc84a2a, 0xe0b040, 0x2a7a6a, 0x2a4a8a]);
  k.box(g, 3.6, 1.0, 0.7, k.std(col, 0.5), 0, 0.5, 0.2);
  k.box(g, 3.7, 0.05, 0.85, k.std(0xd8d2c4, 0.3), 0, 1.02, 0.2);
  k.box(g, 3.4, 0.012, 0.45, glass, 0, 1.35, 0.35, 0.6);
  k.model(g, 'CashRegister_01', 1.1, 1.05, 0.2, PI);
  k.box(g, 3.8, 3.2, 0.05, k.std(0xe8e2d6, 0.6), 0, 1.6, -0.9);
  const board = new THREE.MeshStandardMaterial({ map: menu, emissiveMap: menu, emissive: 0xffffff, emissiveIntensity: 0.7, roughness: 0.4 });
  keep(k.plane(g, 2.6, 1.0, board, 0, 2.25, -0.86));
  const sign = new THREE.MeshStandardMaterial({ map: signTex(name, style, dead), emissive: 0xffffff, roughness: 0.4 });
  sign.emissiveMap = sign.map;
  sign.emissiveIntensity = style.glow ? 0.9 : 0.35;
  k.box(g, 3.9, 0.7, 0.14, k.std(0x1c1a18, 0.4), 0, 3.4, -0.2);
  keep(k.plane(g, 3.8, 0.62, sign, 0, 3.4, -0.129));
  return g;
}

/** Freestanding kiosk island (keys cut while you wait). */
export function keyKiosk(k, rng, signMat) {
  const g = G();
  const lam = k.std(0x2a5a8a, 0.45);
  k.box(g, 2.2, 1.0, 1.1, lam, 0, 0.5, 0);
  k.box(g, 2.3, 0.05, 1.2, k.std(0xe8e2d6, 0.3), 0, 1.02, 0);
  k.box(g, 1.2, 0.6, 0.5, k.std(0x606468, 0.4, 0.6), -0.3, 1.35, 0);
  k.box(g, 2.0, 0.9, 0.04, k.std(0xc8b890, 0.8), 0, 1.6, -0.45);
  for (let n = 0; n < 24; n++) k.box(g, 0.03, 0.07, 0.008, k.std(rng.pick([0xc8a040, 0xb8bcc0]), 0.3, 0.9), -0.85 + (n % 12) * 0.15, 1.35 + Math.floor(n / 12) * 0.3, -0.425);
  for (const [x, z] of [[-1.05, 0.5], [1.05, 0.5], [-1.05, -0.5], [1.05, -0.5]]) k.cyl(g, 0.025, 0.025, 1.4, k.std(0xc8ccd0, 0.2, 0.9), x, 1.7, z, 0, 0, 0, 8);
  k.box(g, 2.4, 0.08, 1.3, lam, 0, 2.42, 0);
  for (const s of [-1, 1]) {
    k.box(g, 2.0, 0.34, 0.06, k.std(0x1c1a18, 0.4), 0, 2.64, s * 0.4);
    keep(k.plane(g, 1.9, 0.3, signMat, 0, 2.64, s * 0.431, 0, s < 0 ? PI : 0, 0));
  }
  return g;
}

/** Security desk; monitors show the same four empty hallways. */
export function securityDesk(k) {
  const g = G();
  const lam = k.std(0x5a4636, 0.5);
  k.box(g, 2.6, 1.0, 0.1, lam, 0, 0.5, 0.35);
  k.box(g, 2.7, 0.05, 0.3, k.std(0x2a2826, 0.4), 0, 1.03, 0.3);
  k.box(g, 2.6, 0.04, 0.6, k.std(0xd8d0c0, 0.5), 0, 0.76, 0);
  for (const s of [-1, 1]) k.box(g, 0.05, 0.76, 0.6, lam, s * 1.27, 0.38, 0);
  const plate = new THREE.MeshStandardMaterial({ map: signTexture('SECURITY', 'Information · Lost children', { bg: '#1c2230', fg: '#e8e2d0', w: 512, h: 128 }), roughness: 0.4 });
  k.plane(g, 1.0, 0.25, plate, 0, 0.78, 0.402);
  for (let n = 0; n < 3; n++) {
    const x = -0.9 + n * 0.62;
    k.box(g, 0.42, 0.36, 0.4, k.std(0xcfc8b6, 0.6), x, 0.96, -0.05);
    const scr = new THREE.MeshBasicMaterial({ map: cctvTex(`0${n + 1}`) });
    scr.color.setScalar(1.3);
    keep(k.plane(g, 0.32, 0.25, scr, x, 0.97, 0.151));
  }
  k.cyl(g, 0.05, 0.06, 0.04, k.std(0xc8a040, 0.3, 0.9), 1.0, 0.8, 0.15);
  return g;
}

/** Two-sided lit directory stand. */
export function directoryStand(k, mat) {
  const g = G();
  const frame = k.std(0x2a2c30, 0.35, 0.6);
  k.box(g, 1.3, 2.1, 0.22, frame, 0, 1.05, 0);
  k.box(g, 1.5, 0.1, 0.5, frame, 0, 0.05, 0);
  for (const s of [-1, 1]) keep(k.plane(g, 1.16, 0.96, mat, 0, 1.35, s * 0.111, 0, s < 0 ? PI : 0, 0));
  const head = new THREE.MeshStandardMaterial({ map: signTexture('DIRECTORY', '', { bg: '#1d4f8a', fg: '#ffffff', w: 512, h: 96 }), roughness: 0.4 });
  for (const s of [-1, 1]) k.plane(g, 1.1, 0.2, head, 0, 1.98, s * 0.111, 0, s < 0 ? PI : 0, 0);
  return g;
}

/** Dry fountain in the sunken court, coins on the bottom. */
export function fountain(k, rng, tileMat) {
  const g = G();
  const stone = k.std(0xe0d6c4, 0.45);
  const rim = [[2.35, 0], [2.6, 0], [2.6, 0.5], [2.7, 0.56], [2.7, 0.62], [2.3, 0.62], [2.3, 0.08]];
  k.mesh(g, new THREE.LatheGeometry(rim.map(([r, y]) => new THREE.Vector2(r, y)), 48), stone);
  k.mesh(g, new THREE.CircleGeometry(2.32, 40), tileMat, 0, 0.08, 0, -PI / 2);
  k.cyl(g, 0.35, 0.45, 1.2, stone, 0, 0.6, 0, 0, 0, 0, 24);
  const bowl = [[0, 1.15], [1.1, 1.15], [1.25, 1.35], [1.15, 1.35], [0.5, 1.2]];
  k.mesh(g, new THREE.LatheGeometry(bowl.map(([r, y]) => new THREE.Vector2(r, y)), 40), stone);
  k.cyl(g, 0.15, 0.2, 0.8, stone, 0, 1.7, 0, 0, 0, 0, 16);
  k.mesh(g, new THREE.LatheGeometry([[0, 2.05], [0.5, 2.05], [0.6, 2.18], [0.52, 2.18], [0, 2.1]].map(([r, y]) => new THREE.Vector2(r, y)), 32), stone);
  k.sphere(g, 0.12, stone, 0, 2.3, 0);
  // water stains and coins
  k.mesh(g, new THREE.RingGeometry(0.6, 2.3, 40), k.std(0x6a6450, 0.9, 0, { transparent: true, opacity: 0.35, depthWrite: false }), 0, 0.083, 0, -PI / 2);
  const gold = k.std(0xc8a04a, 0.3, 0.9);
  const copper = k.std(0xb06a3a, 0.35, 0.9);
  for (let n = 0; n < 90; n++) {
    const a = rng.float(0, PI * 2);
    const r = rng.float(0.55, 2.2);
    k.cyl(g, 0.013, 0.013, 0.004, rng.chance(0.6) ? copper : gold, Math.cos(a) * r, 0.086, Math.sin(a) * r, rng.float(-0.1, 0.1), 0, 0, 8);
  }
  return g;
}
