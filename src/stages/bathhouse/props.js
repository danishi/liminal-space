import * as THREE from 'three';
import { keep } from '../../props/kit.js';
import { screenStatic } from '../../props/canvas.js';
import { PI, BANDAI_PH, BANDAI_CH } from './constants.js';
import { lockerTexture, boardTexture, wickerTexture, mirrorTexture, milkCapTexture, scaleDialTexture } from './textures.js';

// ---------------------------------------------------------------------------
// Props (origin on the floor, facing +Z)

export function hangingPlate(k, tex, w, h, x, y, z, yaw = 0, { glow = 0.25, frame = 0x5a3a20 } = {}) {
  const g = new THREE.Group();
  k.box(g, w + 0.04, h + 0.04, 0.025, k.std(frame, 0.6), 0, 0, -0.012);
  const m = k.mat(`plate:${tex.uuid}:${glow}`, () => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: glow }));
  k.plane(g, w, h, m, 0, 0, 0.002);
  g.position.set(x, y, z);
  g.rotation.y = yaw;
  return g;
}

/** Wooden locker bank (the texture carries the doors and key tags). */
export function lockerBank(k, kind, w, hgt, start, taken) {
  const g = new THREE.Group();
  const tex = lockerTexture(kind, start, taken);
  const wood = k.std(0x5a3820, 0.7);
  k.box(g, w, hgt, 0.42, wood, 0, hgt / 2, 0);
  const face = k.mat(`locker:${tex.uuid}`, () => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.65 }));
  k.plane(g, w - 0.04, hgt - 0.08, face, 0, hgt / 2 + 0.02, 0.211);
  k.box(g, w + 0.04, 0.05, 0.46, k.std(0x3a2414, 0.6), 0, hgt + 0.025, 0.01);
  k.box(g, w, 0.06, 0.44, k.std(0x2a1a10, 0.8), 0, 0.03, 0.005);
  return g;
}

/** Open wooden cubbies (for baskets). Returns cubby centres for placing baskets. */
export function cubbyShelf(k, cols, rows, cw = 0.44, ch = 0.36) {
  const g = new THREE.Group();
  const wood = k.std(0x7a5232, 0.65);
  const dark = k.std(0x2a1a0e, 0.9);
  const w = cols * cw;
  const hgt = rows * ch + 0.1;
  k.box(g, w + 0.04, hgt, 0.02, dark, 0, hgt / 2, -0.2);
  for (let c = 0; c <= cols; c++) k.box(g, 0.025, hgt, 0.42, wood, -w / 2 + c * cw, hgt / 2, 0);
  for (let r = 0; r <= rows; r++) k.box(g, w + 0.03, 0.025, 0.42, wood, 0, 0.1 + r * ch, 0);
  const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push([-w / 2 + (c + 0.5) * cw, 0.1 + r * ch + 0.013, 0]);
  g.userData.cells = cells;
  return g;
}

/** Low-poly woven basket for the shelves (the scanned one is used where you look closely). */
export function shelfBasket(k) {
  const g = new THREE.Group();
  const m = k.mat('wicker', () => new THREE.MeshStandardMaterial({ map: wickerTexture(), roughness: 0.9 }));
  const w = 0.38;
  const d = 0.34;
  const h = 0.2;
  k.box(g, w, 0.02, d, m, 0, 0.01, 0);
  for (const s of [-1, 1]) {
    k.box(g, w, h, 0.015, m, 0, h / 2, s * d / 2);
    k.box(g, 0.015, h, d, m, s * w / 2, h / 2, 0);
  }
  k.box(g, w + 0.02, 0.025, d + 0.02, k.std(0x6a4c24, 0.8), 0, h, 0);
  return g;
}

/** A washing station: tiled ledge, push taps, shower, small mirror. */
export function washStation(k, rng, { fogged = false, bottles = 0, width = 1 } = {}) {
  const g = new THREE.Group();
  const chrome = k.std(0xd8dcdc, 0.18, 1);
  const ledgeMat = k.mat('ledge', () => new THREE.MeshStandardMaterial({ color: 0xe9eeee, roughness: 0.3 }));
  k.box(g, width, 0.05, 0.26, ledgeMat, 0, 0.5, 0.13);
  k.box(g, width, 0.08, 0.02, ledgeMat, 0, 0.47, 0.255);
  // push taps: hot (red cap) and cold (blue cap)
  for (const [x, cap] of [[-0.14, 0xd02020], [0.14, 0x2050d0]]) {
    k.cyl(g, 0.022, 0.022, 0.12, chrome, x, 0.66, 0.06, PI / 2, 0, 0, 8);
    k.cyl(g, 0.03, 0.03, 0.03, k.std(cap, 0.3), x, 0.66, 0.13, PI / 2, 0, 0, 10);
    k.cyl(g, 0.012, 0.009, 0.08, chrome, x, 0.61, 0.1, 0, 0, 0, 6);
  }
  // shower on a riser pipe
  k.cyl(g, 0.012, 0.012, 0.75, chrome, 0.3, 1.02, 0.03, 0, 0, 0, 6);
  k.cyl(g, 0.045, 0.03, 0.05, chrome, 0.3, 1.42, 0.08, -0.9, 0, 0, 10);
  k.cyl(g, 0.012, 0.012, 0.07, chrome, 0.3, 1.4, 0.045, PI / 2, 0, 0, 6);
  // mirror
  const wiped = !fogged && rng.chance(0.5);
  const mirror = k.mat(`mirror:${wiped}:${fogged}`, () => new THREE.MeshStandardMaterial({ map: mirrorTexture(wiped), color: fogged ? 0xa8b0b0 : 0xffffff, roughness: 0.12, metalness: 0.5, envMapIntensity: 0.6 }));
  k.box(g, 0.4, 0.52, 0.012, chrome, 0, 1.2, 0.006);
  k.plane(g, 0.37, 0.49, mirror, 0, 1.2, 0.0125);
  for (let b = 0; b < bottles; b++) {
    const col = rng.pick([0xf4f0e8, 0x3a8ad0, 0xe8a0b0, 0x40a070]);
    k.cyl(g, 0.03, 0.032, 0.17, k.std(col, 0.35), -0.3 + b * 0.075, 0.61, 0.12, 0, 0, 0, 8);
    k.cyl(g, 0.018, 0.018, 0.03, k.std(0xffffff, 0.4), -0.3 + b * 0.075, 0.71, 0.12, 0, 0, 0, 6);
  }
  return g;
}

export function bandaiBooth(k, rng) {
  const g = new THREE.Group();
  const wood = k.std(0x6a4226, 0.55);
  const dark = k.std(0x3a2414, 0.6);
  const top = k.std(0x8a5a32, 0.35);
  const PH = BANDAI_PH;
  // platform
  k.box(g, 3.0, PH, 2.0, dark, 0, PH / 2, 0);
  for (let x = -1.35; x <= 1.36; x += 0.45) k.box(g, 0.04, PH - 0.1, 0.02, wood, x, PH / 2, -1.005);
  // front and side counters
  const CH = BANDAI_CH;
  k.box(g, 3.0, CH, 0.06, wood, 0, PH + CH / 2, -0.97);
  for (const s of [-1, 1]) {
    k.box(g, 0.06, CH, 2.0, wood, s * 1.47, PH + CH / 2, 0);
    k.box(g, 0.42, 0.05, 2.04, top, s * 1.32, PH + CH + 0.025, 0);
    // coin tray
    k.box(g, 0.2, 0.02, 0.26, k.std(0x2a2a2a, 0.4, 0.3), s * 1.32, PH + CH + 0.06, -0.4);
  }
  k.box(g, 3.04, 0.05, 0.3, top, 0, PH + CH + 0.025, -0.88);
  // slatted panels
  for (let x = -1.3; x <= 1.31; x += 0.2) k.box(g, 0.03, CH - 0.1, 0.02, dark, x, PH + CH / 2, -1.005);
  // seat cushion and a low stool
  k.box(g, 0.44, 0.4, 0.4, dark, 0, PH + 0.2, -0.3);
  k.box(g, 0.5, 0.06, 0.48, k.std(0x7a2a2a, 0.9), 0, PH + 0.43, -0.3);
  // things on the counter: a tea cup, a bell, a lucky cat
  k.cyl(g, 0.04, 0.035, 0.07, k.std(0x5a6a4a, 0.3), -0.9, PH + CH + 0.085, -0.85);
  k.cyl(g, 0.045, 0.06, 0.05, k.std(0xc8a040, 0.25, 0.9), 0.95, PH + CH + 0.075, -0.85);
  const cat = new THREE.Group();
  const white = k.std(0xf6f2ea, 0.35);
  k.sphere(cat, 0.08, white, 0, 0.08, 0, 1, 1.05, 0.9);
  k.sphere(cat, 0.07, white, 0, 0.2, 0.01);
  for (const s of [-1, 1]) k.mesh(cat, new THREE.ConeGeometry(0.025, 0.05, 6), white, s * 0.045, 0.27, 0);
  k.sphere(cat, 0.025, white, 0.07, 0.25, 0.03, 1, 1.4, 1);
  k.box(cat, 0.05, 0.04, 0.02, k.std(0xd8a020, 0.3, 0.8), 0, 0.12, 0.075);
  k.box(cat, 0.13, 0.015, 0.02, k.std(0xc02020, 0.5), 0, 0.15, 0.065);
  for (const s of [-1, 1]) k.sphere(cat, 0.008, k.std(0x111111, 0.3), s * 0.025, 0.21, 0.065);
  cat.position.set(0.55, PH + CH + 0.05, -0.85);
  g.add(cat);
  // price list pinned to the front
  const price = boardTexture('bandai-price', 512, 256, '#f2ecd8', [['入浴料 520円', 0.42, '#1a1a1a'], ['Bath ¥520', 0.26, '#8a1a1a', 600]], { border: '#3a2414' });
  k.plane(g, 0.5, 0.25, k.mat('bandaiPrice', () => new THREE.MeshStandardMaterial({ map: price, roughness: 0.8 })), 0, PH + CH * 0.55, -1.02, 0, PI, 0);
  g.userData.seat = new THREE.Vector3(0, PH, -0.3);
  return g;
}

export function milkFridge(k) {
  const g = new THREE.Group();
  const body = k.std(0xe8e8e2, 0.4, 0.2);
  k.box(g, 0.66, 1.5, 0.55, body, 0, 0.75, 0);
  const interior = k.mat('fridgeIn', () => new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe8f4ff, emissiveIntensity: 0.55, roughness: 0.6 }));
  k.box(g, 0.56, 1.02, 0.02, interior, 0, 0.83, -0.2);
  // header sign
  const head = boardTexture('fridge-head', 512, 128, '#d82020', [['牛乳 MILK', 0.7, '#ffffff', 900]]);
  k.plane(g, 0.62, 0.16, k.mat('fridgeHead', () => new THREE.MeshStandardMaterial({ map: head, emissive: 0xffffff, emissiveMap: head, emissiveIntensity: 0.9 })), 0, 1.4, 0.28);
  // shelves and bottles
  const shelf = k.std(0xc8ccd0, 0.3, 0.8);
  const kinds = [[0xf8f6ee, 0], [0xb88a5a, 1], [0xf2c878, 2]];
  const capTex = milkCapTexture();
  for (let r = 0; r < 3; r++) {
    const y = 0.38 + r * 0.32;
    k.box(g, 0.56, 0.015, 0.44, shelf, 0, y, 0);
    const [col, ci] = kinds[r];
    const glass = k.mat(`milk:${col}`, () => new THREE.MeshStandardMaterial({ color: col, roughness: 0.15, emissive: col, emissiveIntensity: 0.12 }));
    const cap = k.mat(`cap:${ci}`, () => {
      const t = capTex.clone();
      t.repeat.set(1 / 3, 1);
      t.offset.set(ci / 3, 0);
      t.userData.cached = true;
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
    });
    for (let b = 0; b < 6; b++) {
      const x = -0.22 + b * 0.088;
      const z = 0.08;
      k.cyl(g, 0.028, 0.032, 0.14, glass, x, y + 0.08, z, 0, 0, 0, 8);
      k.cyl(g, 0.022, 0.028, 0.03, glass, x, y + 0.165, z, 0, 0, 0, 8);
      k.mesh(g, new THREE.CircleGeometry(0.022, 10), cap, x, y + 0.181, z, -PI / 2);
    }
  }
  // glass door
  const glassDoor = k.mat('fridgeGlass', () => new THREE.MeshStandardMaterial({ color: 0xdff4ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.18, depthWrite: false }));
  k.plane(g, 0.58, 1.08, glassDoor, 0, 0.84, 0.276);
  k.box(g, 0.03, 1.1, 0.03, body, 0.28, 0.84, 0.27);
  k.box(g, 0.02, 0.4, 0.04, k.std(0x999999, 0.3, 0.9), -0.25, 0.9, 0.3);
  return g;
}

export function massageChair(k) {
  const g = new THREE.Group();
  const vinyl = k.std(0x4a2420, 0.38, 0.05);
  const dark = k.std(0x1c1614, 0.6);
  k.box(g, 0.72, 0.35, 0.8, dark, 0, 0.175, 0);
  k.box(g, 0.56, 0.16, 0.62, vinyl, 0, 0.44, 0.03);
  k.box(g, 0.6, 0.95, 0.24, vinyl, 0, 0.92, -0.3, -0.2);
  k.box(g, 0.36, 0.22, 0.14, vinyl, 0, 1.45, -0.44, -0.2);
  for (const s of [-1, 1]) {
    k.box(g, 0.14, 0.34, 0.7, vinyl, s * 0.33, 0.62, 0.0);
    k.box(g, 0.16, 0.06, 0.72, dark, s * 0.33, 0.8, 0.0);
  }
  k.box(g, 0.44, 0.4, 0.2, vinyl, 0, 0.26, 0.48, 0.5);
  // coin box
  const coin = boardTexture('massage-coin', 256, 128, '#e8e0c8', [['10分 100円', 0.5, '#1a1a1a'], ['10 min ¥100', 0.3, '#8a1a1a', 600]]);
  k.box(g, 0.14, 0.12, 0.12, k.std(0xb8b0a0, 0.4, 0.4), 0.36, 0.9, 0.3);
  k.plane(g, 0.12, 0.06, k.mat('coinLabel', () => new THREE.MeshStandardMaterial({ map: coin, roughness: 0.7 })), 0.36, 0.92, 0.361);
  return g;
}

export function bathScale(k) {
  const g = new THREE.Group();
  const enamel = k.std(0xe6e2d6, 0.35, 0.1);
  k.box(g, 0.42, 0.09, 0.5, enamel, 0, 0.045, 0.05);
  k.box(g, 0.36, 0.01, 0.38, k.std(0x2a2a2a, 0.9), 0, 0.095, 0.08);
  k.box(g, 0.08, 1.05, 0.08, enamel, 0, 0.6, -0.16);
  k.cyl(g, 0.19, 0.19, 0.08, enamel, 0, 1.22, -0.16, PI / 2);
  const dial = k.mat('dial', () => new THREE.MeshStandardMaterial({ map: scaleDialTexture(), roughness: 0.3 }));
  k.mesh(g, new THREE.CircleGeometry(0.16, 32), dial, 0, 1.22, -0.115);
  const needle = keep(k.box(g, 0.006, 0.13, 0.004, k.std(0xb8261e, 0.4), 0, 1.22, -0.11));
  needle.geometry.translate(0, 0.055, 0);
  needle.position.y = 1.22;
  needle.rotation.z = PI * 0.75;
  g.userData.needle = needle;
  return g;
}

export function hairDryer(k) {
  const g = new THREE.Group();
  const cream = k.std(0xd8d0bc, 0.4);
  const red = k.std(0x8a2a24, 0.4);
  k.box(g, 0.5, 0.42, 0.5, k.std(0x5a4a3a, 0.7), 0, 0.21, 0);
  k.box(g, 0.5, 0.12, 0.5, red, 0, 0.48, 0);
  k.box(g, 0.5, 0.6, 0.12, red, 0, 0.8, -0.2);
  k.cyl(g, 0.03, 0.03, 1.2, cream, 0, 0.8, -0.3);
  k.cyl(g, 0.02, 0.02, 0.35, cream, 0, 1.38, -0.15, PI / 2);
  const hood = k.mesh(g, new THREE.SphereGeometry(0.2, 16, 10, 0, PI * 2, 0, PI * 0.55), cream, 0, 1.22, 0.0);
  hood.rotation.x = 0.35;
  const label = boardTexture('dryer', 256, 128, '#f0e8d0', [['3分 20円', 0.5, '#1a1a1a'], ['3 min ¥20', 0.3, '#8a1a1a', 600]]);
  k.box(g, 0.14, 0.1, 0.1, k.std(0xb8b0a0, 0.4, 0.4), 0.3, 0.62, -0.1);
  k.plane(g, 0.12, 0.06, k.mat('dryerLabel', () => new THREE.MeshStandardMaterial({ map: label, roughness: 0.7 })), 0.3, 0.63, -0.049);
  return g;
}

export function crtTv(k, seed) {
  const g = new THREE.Group();
  k.box(g, 0.5, 0.4, 0.42, k.std(0x2a2826, 0.5), 0, 0.2, -0.04);
  const scr = screenStatic(seed);
  k.plane(g, 0.38, 0.29, k.mat(`tv:${seed}`, () => new THREE.MeshBasicMaterial({ map: scr, color: 0x9aa8b0 })), -0.04, 0.21, 0.172);
  k.box(g, 0.3, 0.03, 0.4, k.std(0x444444, 0.5, 0.6), 0, -0.015, -0.04);
  return g;
}

/** Utility pole with a street lamp arm. */
export function utilityPole(k) {
  const g = new THREE.Group();
  const conc = k.std(0x9a968c, 0.8);
  k.cyl(g, 0.12, 0.17, 8.5, conc, 0, 4.25, 0, 0, 0, 0, 10);
  for (const y of [6.8, 7.6]) k.box(g, 1.3, 0.1, 0.1, k.std(0x5a5a58, 0.6, 0.5), 0, y, 0);
  k.cyl(g, 0.03, 0.03, 1.1, k.std(0x6a6a68, 0.5, 0.6), 0, 4.6, 0.5, PI / 2 - 0.2);
  k.box(g, 0.2, 0.06, 0.34, k.std(0x3a3a3a, 0.5), 0, 4.7, 1.02);
  k.box(g, 0.16, 0.02, 0.28, k.glow(0xffd8a0, 3), 0, 4.66, 1.02);
  const sign = boardTexture('pole-sign', 128, 512, '#1a3a8a', [['富', 0.2, '#fff'], ['士', 0.2, '#fff'], ['見', 0.2, '#fff'], ['町', 0.2, '#fff']]);
  k.plane(g, 0.18, 0.72, k.mat('poleSign', () => new THREE.MeshStandardMaterial({ map: sign, roughness: 0.6 })), 0, 2.4, 0.16);
  return g;
}

/** Red Japanese post box. */
export function postBox(k) {
  const g = new THREE.Group();
  const red = k.std(0xc41c1c, 0.35, 0.2);
  k.cyl(g, 0.22, 0.22, 1.1, red, 0, 0.75, 0, 0, 0, 0, 20);
  k.sphere(g, 0.22, red, 0, 1.3, 0, 1, 0.35, 1);
  k.box(g, 0.18, 0.03, 0.05, k.std(0x111111, 0.6), 0, 1.05, 0.2);
  k.cyl(g, 0.12, 0.14, 0.2, k.std(0x2a2a2a, 0.7), 0, 0.1, 0);
  return g;
}

/** Stack of firewood / scrap timber for the boiler. */
export function woodPile(k, rng, w = 1.4) {
  const g = new THREE.Group();
  for (let n = 0; n < 34; n++) {
    const col = rng.pick([0x8a6a48, 0x6a5038, 0xa08058, 0x5a4636]);
    const lw = rng.float(0.5, 0.9);
    const y = 0.06 + Math.floor(n / 7) * 0.1 + rng.float(0, 0.02);
    k.box(g, lw, rng.float(0.05, 0.09), rng.float(0.06, 0.12), k.std(col, 0.9), rng.float(-w / 2 + lw / 2, w / 2 - lw / 2), y, rng.float(-0.2, 0.2), 0, rng.float(-0.15, 0.15), rng.float(-0.05, 0.05));
  }
  return g;
}
