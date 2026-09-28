import * as THREE from 'three';
import { human, beast, sculptHead, noise3 } from './figures.js';
import { sculptGeometry, sculptMaterial, eyeball, recolor } from '../core/sculpt.js';

// The cast. Each look builds (and caches) a sculpted figure; stages and
// apparitions ask for them by name.

const C = (hex) => new THREE.Color(hex);

// ---- head-wear -------------------------------------------------------------

const fedora = (sc, S, hs) => sc.with({ mat: 'hat', k: 0.004 * hs }, () => {
  sc.cone(S(0, 0.148, -0.01), S(0, 0.153, -0.01), 0.15 * hs, 0.15 * hs);
  sc.cone(S(0, 0.15, -0.01), S(0, 0.24, -0.012), 0.088 * hs, 0.078 * hs, { k: 0.01 * hs });
  sc.cut(() => sc.ellipsoid(S(0, 0.25, -0.01), [0.02 * hs, 0.02 * hs, 0.06 * hs], { k: 0.01 * hs, mat: 'hat' }));
  sc.torus(S(0, 0.165, -0.011), 0.086 * hs, 0.009 * hs, { mat: 'band' });
});

const stationCap = (sc, S, hs) => sc.with({ mat: 'cap', k: 0.004 * hs }, () => {
  sc.cone(S(0, 0.13, -0.008), S(0, 0.19, 0.0), 0.088 * hs, 0.1 * hs, { k: 0.008 * hs });
  sc.box(S(0, 0.2, 0), [0.1 * hs, 0.012 * hs, 0.095 * hs], 0.01 * hs, { k: 0.01 * hs });
  sc.box(S(0, 0.135, 0.095), [0.07 * hs, 0.004 * hs, 0.035 * hs], 0.003 * hs, { mat: 'visor', rot: [0.3, 0, 0] });
  sc.torus(S(0, 0.15, -0.006), 0.09 * hs, 0.007 * hs, { mat: 'band' });
  sc.sphere(S(0, 0.165, 0.093), 0.012 * hs, { mat: 'gold' });
});

const pillbox = (sc, S, hs) => sc.with({ mat: 'top', k: 0.003 * hs }, () => {
  sc.cone(S(0.012, 0.16, 0.0), S(0.02, 0.215, 0.0), 0.058 * hs, 0.058 * hs, { k: 0.006 * hs, rot: [0, 0, -0.1] });
  sc.torus(S(0.014, 0.172, 0), 0.059 * hs, 0.006 * hs, { mat: 'gold' });
});

const gasMask = (sc, S, hs) => {
  sc.with({ mat: 'suit', k: 0.02 * hs }, () => {
    sc.ellipsoid(S(0, 0.08, -0.012), [0.096 * hs, 0.112 * hs, 0.116 * hs], { clip: [0, -0.2, 0.98, 0.05 * hs], noise: [0.003 * hs, 40 / hs] });
    sc.cone(S(0, 0.0, -0.04), S(0, -0.08, -0.03), 0.09 * hs, 0.1 * hs, { noise: [0.003 * hs, 40 / hs] });
  });
  sc.with({ mat: 'rubber', k: 0.012 * hs }, () => {
    sc.ellipsoid(S(0, 0.035, 0.07), [0.072 * hs, 0.075 * hs, 0.06 * hs]);
    sc.box(S(0, 0.0, 0.118), [0.028 * hs, 0.03 * hs, 0.022 * hs], 0.018 * hs);
    for (const x of [-1, 1]) {
      sc.cone(S(x * 0.045, -0.005, 0.1), S(x * 0.065, -0.02, 0.125), 0.024 * hs, 0.026 * hs, { mat: 'filter', k: 0.004 * hs });
      sc.torus(S(x * 0.033, 0.058, 0.115), 0.021 * hs, 0.006 * hs, { rot: [Math.PI / 2, 0, 0], k: 0.003 * hs });
      sc.cone(S(x * 0.033, 0.058, 0.108), S(x * 0.033, 0.058, 0.116), 0.02 * hs, 0.02 * hs, { mat: 'lens', k: 0.002 * hs });
    }
  });
};

const glasses = (sc, S, hs) => sc.with({ mat: 'metal', k: 0.001 * hs }, () => {
  for (const x of [-1, 1]) {
    sc.torus(S(x * 0.032, 0.058, 0.118), 0.017 * hs, 0.0032 * hs, { rot: [Math.PI / 2, 0, 0] });
    sc.cone(S(x * 0.049, 0.06, 0.115), S(x * 0.08, 0.064, 0.02), 0.003 * hs, 0.003 * hs);
  }
  sc.cone(S(-0.015, 0.062, 0.12), S(0.015, 0.062, 0.12), 0.003 * hs, 0.003 * hs);
});

const buttons = (n, y0, dy, mat = 'gold') => (sc, J, s) => sc.with({ bone: 'chest', mat, k: 0.002 * s }, () => {
  for (let k = 0; k < n; k++) sc.sphere([0, J.chest.pos[1] + (y0 - k * dy) * s, 0.108 * s], 0.009 * s);
});

// ---- looks -----------------------------------------------------------------

export const LOOKS = {
  /** Level 0's hazmat wanderer, resting against a wall. */
  drifter: () => human({
    key: 'drifter',
    body: { height: 1.74, girth: 1.15 },
    outfit: { skinMat: 'suit', shoes: 'boot', gloves: true, hood: true, belt: true },
    head: { face: 'human', extraHead: gasMask },
    eyes: null,
    paints: {
      suit: { color: C(0xd07a1c), rough: 0.55, vary: 0.12, freq: 9, fn: (x, y, z, c) => c.multiplyScalar(0.75 + 0.25 * Math.min(1, y * 1.4)) },
      rubber: { color: C(0x1b1c1c), rough: 0.45 },
      filter: { color: C(0x3b3f36), rough: 0.6 },
      lens: { color: C(0x70807a), rough: 0.05, emit: 0.05 },
      glove: { color: C(0x151515), rough: 0.5 },
      shoe: { color: C(0x202020), rough: 0.5 },
      belt: { color: C(0x2a2a26), rough: 0.5 },
    },
    material: { physical: { sheen: 0.4, sheenColor: C(0xffd9a0) } },
  }),

  /** The night hotel's bellboy: a ghost, from the waist down anyway. */
  bellboy: () => human({
    key: 'bellboy',
    body: { height: 1.68, girth: 0.9 },
    outfit: { top: 'jacket', sleeve: 1, bottom: 'pants', legs: false, wispMat: 'wisp', collar: true, gloves: true, extraBody: buttons(4, 0.1, 0.05) },
    head: { face: 'human', hair: 'short', extraHead: pillbox },
    eyes: { iris: 0x8fb0ff, pupil: 0.2 },
    paints: {
      skin: { color: C(0xb7c4df), rough: 0.5 },
      top: { color: C(0x8a1c2a), rough: 0.6, vary: 0.05 },
      gold: { color: C(0xe0b050), rough: 0.25, emit: 0.3 },
      wisp: { color: C(0x5e6fa8), rough: 0.9, emit: 0.4 },
      hair: { color: C(0x303850), rough: 0.5 },
      glove: { color: C(0xf2f2f6), rough: 0.6 },
    },
    material: { fade: true, physical: { emissive: C(0x243a8a), emissiveIntensity: 0.6 } },
  }),

  /** The station attendant: navy uniform, cap, white gloves. */
  attendant: () => human({
    key: 'attendant',
    body: { height: 1.7, girth: 0.95 },
    outfit: { top: 'jacket', sleeve: 1, bottom: 'pants', gloves: true, collar: true, belt: false, extraBody: buttons(4, 0.1, 0.055, 'gold') },
    head: { face: 'human', hair: 'short', extraHead: stationCap },
    eyes: { iris: 0x2a1c10 },
    paints: {
      skin: { color: C(0xd9ae90), rough: 0.55 },
      top: { color: C(0x1c2740), rough: 0.7 },
      bottom: { color: C(0x1a2236), rough: 0.7 },
      cap: { color: C(0x1c2740), rough: 0.6 },
      visor: { color: C(0x0c0c0c), rough: 0.15 },
      band: { color: C(0xc9a24a), rough: 0.3 },
      gold: { color: C(0xd8b060), rough: 0.25 },
      collar: { color: C(0xf4f4f0), rough: 0.6 },
    },
  }),

  /** A student made of dusk: a silhouette in uniform with pinprick eyes. */
  student: () => human({
    key: 'student',
    body: { height: 1.55, girth: 0.82, head: 1.05 },
    outfit: { top: 'shirt', sleeve: 1, bottom: 'skirt', collar: true, shoes: 'shoe', skinMat: 'shade' },
    head: { face: 'hollow', hair: 'bob', skinMat: 'shade' },
    eyes: { glow: 0xffe8c8 },
    paints: {
      shade: { color: C(0x0b0a0e), rough: 0.9, vary: 0.02 },
      top: { color: C(0x101018), rough: 0.9 },
      bottom: { color: C(0x0d0d16), rough: 0.9 },
      collar: { color: C(0x151a2a), rough: 0.9 },
      hair: { color: C(0x060608), rough: 0.7 },
      socket: { color: C(0x000000), rough: 1 },
      shoe: { color: C(0x070707), rough: 0.5 },
    },
    material: { fade: true },
  }),

  /** The bathhouse keeper: old, bald, glasses, a cardigan. */
  keeper: () => human({
    key: 'keeper',
    body: { height: 1.58, girth: 1.05, belly: 0.6, neck: 0.8 },
    outfit: { top: 'shirt', sleeve: 1, bottom: 'pants', shoes: 'shoe' },
    head: { face: 'human', hair: 'bald', extraHead: glasses },
    eyes: { iris: 0x2a1a10, pupil: 0.5 },
    paints: {
      skin: { color: C(0xc99a7c), rough: 0.5, vary: 0.1 },
      hair: { color: C(0xd8d4cc), rough: 0.6, vary: 0.2 },
      top: { color: C(0x6e5a44), rough: 0.9, vary: 0.1, freq: 50 },
      bottom: { color: C(0x3a3a3c), rough: 0.8 },
      metal: { color: C(0xb8b4a8), rough: 0.25 },
      shoe: { color: C(0x5a4030), rough: 0.6 },
    },
  }),

  /** A mall security guard, asleep on the job since 1997. */
  guard: () => human({
    key: 'guard',
    body: { height: 1.8, girth: 1.2, belly: 1 },
    outfit: { top: 'shirt', sleeve: 0.45, bottom: 'pants', belt: true, extraBody: buttons(5, 0.12, 0.05, 'metal') },
    head: { face: 'human', hair: 'short', extraHead: stationCap },
    eyes: { iris: 0x3a2818 },
    paints: {
      skin: { color: C(0xa87458), rough: 0.5 },
      top: { color: C(0x7f8fa6), rough: 0.8 },
      bottom: { color: C(0x22262e), rough: 0.8 },
      cap: { color: C(0x22262e), rough: 0.6 },
      visor: { color: C(0x0c0c0c), rough: 0.15 },
      band: { color: C(0x9a9a9a), rough: 0.3 },
      gold: { color: C(0xc0c0c8), rough: 0.25 },
      metal: { color: C(0xc0c0c8), rough: 0.25 },
    },
  }),

  /** The parking attendant, in a high-vis vest. */
  valet: () => human({
    key: 'valet',
    body: { height: 1.7, girth: 0.9 },
    outfit: { top: 'jacket', sleeve: 1, bottom: 'pants', gloves: true },
    head: { face: 'human', hair: 'short', extraHead: stationCap },
    eyes: { iris: 0x2a1c10 },
    paints: {
      skin: { color: C(0xc39070), rough: 0.55 },
      // reflective bands painted round the chest and sleeves
      top: { color: C(0xc8d020), rough: 0.6, fn: (x, y, z, c) => {
        if (Math.abs(y - 1.22) < 0.018 || Math.abs(y - 1.1) < 0.018) c.setRGB(0.75, 0.75, 0.72);
      } },
      bottom: { color: C(0x2a2c30), rough: 0.8 },
      cap: { color: C(0x202226), rough: 0.6 },
      visor: { color: C(0x0c0c0c), rough: 0.15 },
      band: { color: C(0xe0e020), rough: 0.3 },
      gold: { color: C(0xe0e020), rough: 0.3 },
      glove: { color: C(0x303030), rough: 0.7 },
    },
  }),

  /** A shop mannequin. Glossy, jointed, faceless. */
  mannequin: (variant = 0) => {
    const outfits = [
      { outfit: { joints: true, shoes: null }, paints: {} },
      { outfit: { joints: true, top: 'shirt', sleeve: 0.4, bottom: 'pants', shoes: null }, paints: { top: { color: C(0xb03030), rough: 0.8 }, bottom: { color: C(0x2a3550), rough: 0.8 } } },
      { outfit: { joints: true, top: 'dress', sleeve: 0.2, shoes: null }, paints: { top: { color: C(0xe0c050), rough: 0.8 }, bottom: { color: C(0xe0c050), rough: 0.8 } } },
    ];
    const v = outfits[variant % outfits.length];
    return human({
      key: `mannequin${variant % outfits.length}`,
      body: { height: 1.8, girth: 0.85, leg: 1.06, head: 0.95 },
      outfit: { ...v.outfit, skinMat: 'plastic' },
      head: { face: 'blank', skinMat: 'plastic' },
      hands: { curl: 0.15, fingerLen: 1.05 },
      eyes: null,
      detail: 'plastic',
      headDetail: 'plastic',
      paints: {
        plastic: { color: C(0xe6dfd4), rough: 0.28, vary: 0.03 },
        joint: { color: C(0xbfb6a8), rough: 0.35 },
        ...v.paints,
      },
      material: { fade: true, physical: { clearcoat: 0.7, clearcoatRoughness: 0.25 } },
    });
  },

  /**
   * The tall one. Starved, too many joints' worth of arm, a long head with
   * nothing in the sockets but two points of light.
   */
  watcher: ({ body = 0x141214, eyes = 0xffffff, height = 2.45, hat = false, coat = false, suit = false, key = '' } = {}) => human({
    key: `watcher:${body}:${height}:${hat}:${coat}:${suit}:${key}`,
    body: { height, leg: 1.12, arm: 1.5, neck: 1.9, torso: 1.1, girth: 0.58, head: 0.9, shoulders: 1.1, limb: 0.7, spread: 0.08 },
    outfit: {
      ribs: !coat && !suit, shoes: 'bare', skinMat: 'flesh',
      top: coat ? 'coat' : suit ? 'jacket' : null, sleeve: coat || suit ? 0.9 : 0, bottom: suit ? 'pants' : null, coatLen: 0.9,
    },
    head: { face: 'hollow', longHead: 1.28, skinMat: 'flesh', extraHead: hat ? fedora : null },
    hands: { handScale: 1.45, fingerLen: 1.7, curl: 0.55, nails: true },
    eyes: { glow: eyes },
    detail: 'skin',
    paints: {
      flesh: { color: C(body), rough: 0.6, vary: 0.15, freq: 30 },
      socket: { color: C(0x000000), rough: 1 },
      top: { color: C(0x0c0c0e), rough: 0.9 },
      bottom: { color: C(0x0c0c0e), rough: 0.9 },
      hat: { color: C(0x0a0a0a), rough: 0.8 },
      band: { color: C(0x1a1414), rough: 0.6 },
      nail: { color: C(0x2a2622), rough: 0.3 },
    },
    material: { fade: true, physical: { sheen: 0.3, sheenColor: C(0x708090) } },
  }),

  /** White fox. */
  kitsune: () => beast({
    key: 'kitsune',
    len: 0.48, height: 0.4, girth: 0.11, neck: 0.13, headSize: 1, snout: 1.4, muzzle: 0.7, ears: 0.95, earFlare: 0.12,
    tail: true, tailLen: 0.6, tailFluff: 0.9, tailRise: -0.18, legR: 0.019,
    paints: {
      fur: { color: C(0xf1ece4), rough: 0.9, vary: 0.05, freq: 40 },
      chest: { color: C(0xfbf8f2), rough: 0.9 },
      muzzle: { color: C(0xf6f2ea), rough: 0.85, fn: (x, y, z, c) => {
        // red markings above the eyes and along the muzzle
        if (Math.abs(Math.abs(x) - 0.03) < 0.012 && noise3(x * 60, y * 60, z * 60) > 0.35) c.setRGB(0.6, 0.04, 0.03);
      } },
      cheek: { color: C(0xf6f2ea), rough: 0.9 },
      ear: { color: C(0xf1ece4), rough: 0.9 },
      earIn: { color: C(0xb02a20), rough: 0.8 },
      nose: { color: C(0x1a1414), rough: 0.3 },
      leg: { color: C(0xe8e2d8), rough: 0.9 },
      paw: { color: C(0xe8e2d8), rough: 0.9 },
      tail: { color: C(0xf4f0e8), rough: 0.95, vary: 0.08 },
      tip: { color: C(0xc02a1e), rough: 0.9 },
    },
    eyes: { iris: 0xd89a20, pupil: 0.25 },
    material: { physical: { sheen: 0.8, sheenColor: C(0xffffff), emissive: C(0x1a1a28), emissiveIntensity: 0.6 } },
  }),

  /** A grey tabby that turns up where cats shouldn't be. */
  cat: () => beast({
    key: 'cat',
    len: 0.34, height: 0.22, girth: 0.085, neck: 0.07, headSize: 1.3, snout: 0.35, muzzle: 1.1, ears: 0.5, earFlare: 0.12,
    tail: true, tailLen: 0.42, tailFluff: 0.28, legR: 0.017,
    paints: {
      fur: { color: C(0x8c8680), rough: 0.9, vary: 0.1, freq: 50, fn: (x, y, z, c) => {
        if (Math.sin(z * 90 + noise3(x * 20, y * 20, z * 20) * 5) > 0.35) c.multiplyScalar(0.45);
      } },
      chest: { color: C(0xd8d2c8), rough: 0.9 },
      muzzle: { color: C(0xe8e2da), rough: 0.9 },
      cheek: { color: C(0xa29c94), rough: 0.9 },
      ear: { color: C(0x6a6660), rough: 0.9 },
      earIn: { color: C(0xd09a98), rough: 0.8 },
      nose: { color: C(0xc07878), rough: 0.4 },
      leg: { color: C(0x8c8680), rough: 0.9 },
      paw: { color: C(0xe8e2da), rough: 0.9 },
      tail: { color: C(0x7a746e), rough: 0.9, fn: (x, y, z, c) => {
        if (Math.sin(z * 70) > 0.2) c.multiplyScalar(0.45);
      } },
      tip: { color: C(0x2a2826), rough: 0.9 },
    },
    eyes: { iris: 0x8aa820, pupil: 0.35 },
  }),

  /** A capybara, soaking. */
  capybara: () => {
    const g = beast({
      key: 'capybara',
      len: 0.62, height: 0.3, girth: 0.2, barrel: 1.12, neck: 0.06, headSize: 1.05, headShape: 'box', ears: 0.15, earFlare: 0.02,
      tail: false, legR: 0.032,
      paints: {
        fur: { color: C(0x7a5536), rough: 0.95, vary: 0.12, freq: 30 },
        chest: { color: C(0x80593a), rough: 0.95 },
        muzzle: { color: C(0x6a4a30), rough: 0.9 },
        cheek: { color: C(0x7a5536), rough: 0.95 },
        ear: { color: C(0x4a3020), rough: 0.9 },
        earIn: { color: C(0x3a2418), rough: 0.9 },
        nose: { color: C(0x2a1c14), rough: 0.5 },
        leg: { color: C(0x5a3e28), rough: 0.9 },
        paw: { color: C(0x2a1e16), rough: 0.7 },
      },
      eyes: { iris: 0x1a120c, pupil: 0.6 },
    });
    // a yuzu on its head, as is traditional
    const yuzu = new THREE.Mesh(new THREE.SphereGeometry(0.045, 20, 14), new THREE.MeshPhysicalMaterial({ color: 0xf0b020, roughness: 0.45, clearcoat: 0.4 }));
    yuzu.scale.set(1, 0.85, 1);
    yuzu.position.set(0, 0.21 * 0.72 + 0.03, 0.02);
    g.userData.rig.bones.head.add(yuzu);
    g.userData.yuzu = yuzu;
    return g;
  },
};

// ---- things that aren't people ---------------------------------------------

/** A floating grin: dark skin, a mouth full of teeth, two points of light. */
export function grinFace() {
  const geo = sculptHead('grin', { face: 'grin', headScale: 1.9, skinMat: 'dark' }, {
    dark: { color: C(0x0a0808), rough: 0.7, vary: 0.2 },
    teeth: { color: C(0xf2ead8), rough: 0.25, emit: 1.6 },
    mouth: { color: C(0x140404), rough: 0.9, emit: 0.05 },
  }, 0.0045);
  const mat = sculptMaterial({ detail: 'skin', detailScale: 18, fade: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.noBake = true;
  const g = new THREE.Group();
  g.add(mesh);
  const eyes = [];
  for (const x of [-1, 1]) {
    const e = eyeball(0.0105, { glow: 0xfff4d8 });
    e.position.set(x * 0.032 * 1.9, 0.058 * 1.9, 0.08 * 1.9);
    mesh.add(e);
    eyes.push(e);
  }
  g.userData = { mat, eyes, mesh };
  return g;
}

/** A robot vacuum that has been cleaning the same room since 1998. */
export function robotVacuum() {
  const geo = sculptGeometry('roomba', (sc) => {
    sc.with({ mat: 'shell', k: 0.01 }, () => {
      sc.cone([0, 0.012, 0], [0, 0.07, 0], 0.17, 0.165);
      sc.cut(() => sc.torus([0, 0.075, 0], 0.12, 0.004, { mat: 'seam', k: 0.002 }));
      sc.cone([0, 0.07, 0.02], [0, 0.078, 0.02], 0.045, 0.04, { mat: 'button', k: 0.005 });
      sc.box([0, 0.05, 0.155], [0.09, 0.022, 0.02], 0.01, { mat: 'bumper', k: 0.004 });
    });
    return sc;
  }, { h: 0.004, paints: { shell: { color: C(0x2a2a2c), rough: 0.25 }, seam: { color: C(0x0a0a0a) }, button: { color: C(0xc8c8c8), rough: 0.3, emit: 0.2 }, bumper: { color: C(0x151515), rough: 0.6 } } });
  const mesh = new THREE.Mesh(geo, sculptMaterial({ detail: 'plastic', physical: { clearcoat: 0.8 } }));
  mesh.userData.noBake = true;
  mesh.castShadow = true;
  const g = new THREE.Group();
  g.add(mesh);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.5, 0.6) }));
  led.position.set(0, 0.08, 0.06);
  g.add(led);
  g.userData = { led, mat: mesh.material };
  return g;
}

/** A car, sculpted: body, glass, wheels. kind: 'sedan' | 'kei' | 'van'. */
export function carModel(kind = 'sedan', color = 0x8a1c1c) {
  const dims = { sedan: [1.78, 4.5, 1.42, 0.6], kei: [1.48, 3.4, 1.65, 0.5], van: [1.85, 4.7, 1.95, 0.45] }[kind];
  const [w, l, h] = dims;
  const geo = sculptGeometry(`car:${kind}`, (sc) => {
    const hw = w / 2;
    const hl = l / 2;
    sc.with({ mat: 'paint', k: 0.08 }, () => {
      // lower body
      sc.box([0, 0.55, 0], [hw, 0.3, hl], 0.14);
      // cabin
      const cabF = kind === 'sedan' ? hl - 1.3 : kind === 'kei' ? hl - 0.55 : hl - 0.45;
      const cabB = kind === 'sedan' ? -hl + 0.95 : -hl + 0.15;
      const cz = (cabF + cabB) / 2;
      sc.box([0, 0.85 + (h - 0.85) / 2, cz], [hw * 0.9, (h - 0.85) / 2, (cabF - cabB) / 2], 0.12, { k: 0.12 });
      // wheel arches
      for (const z of [hl - 0.75, -hl + 0.7]) for (const x of [-1, 1]) sc.cut(() => sc.cone([x * (hw + 0.05), 0.33, z], [x * (hw - 0.2), 0.33, z], 0.37, 0.37, { k: 0.03, mat: 'dark' }));
      // windows: shallow cuts filled with glass
      sc.cut(() => sc.box([0, 0.85 + (h - 0.85) * 0.55, cz], [hw * 0.93, (h - 0.85) * 0.33, (cabF - cabB) / 2 - 0.12], 0.05, { k: 0.02, mat: 'glass' }));
      sc.cut(() => sc.box([0, 0.85 + (h - 0.85) * 0.55, cz], [hw * 0.8, (h - 0.85) * 0.33, (cabF - cabB) / 2 + 0.05], 0.05, { k: 0.02, mat: 'glass' }));
      // glass set a little into the openings
      sc.box([0, 0.85 + (h - 0.85) * 0.5, cz], [hw * 0.86, (h - 0.85) * 0.42, (cabF - cabB) / 2 - 0.06], 0.1, { k: 0.01, mat: 'glass' });
      // lights
      for (const x of [-1, 1]) {
        sc.box([x * (hw - 0.25), 0.68, hl - 0.02], [0.17, 0.05, 0.04], 0.03, { mat: 'head', k: 0.01 });
        sc.box([x * (hw - 0.2), 0.72, -hl + 0.02], [0.14, 0.05, 0.04], 0.03, { mat: 'tail', k: 0.01 });
      }
      sc.box([0, 0.4, hl + 0.02], [hw * 0.95, 0.08, 0.05], 0.05, { mat: 'trim', k: 0.02 });
      sc.box([0, 0.4, -hl - 0.02], [hw * 0.95, 0.08, 0.05], 0.05, { mat: 'trim', k: 0.02 });
      sc.box([0, 0.5, hl + 0.04], [0.26, 0.07, 0.01], 0.01, { mat: 'plate', k: 0.005 });
      sc.box([0, 0.5, -hl - 0.04], [0.26, 0.07, 0.01], 0.01, { mat: 'plate', k: 0.005 });
    });
    // wheels
    for (const z of [hl - 0.75, -hl + 0.7]) {
      for (const x of [-1, 1]) {
        sc.cyl([x * (hw - 0.11), 0.32, z], 0.31, 0.1, 0.06, { mat: 'tyre', k: 0.02, rot: [0, 0, Math.PI / 2] });
        sc.cyl([x * (hw - 0.02), 0.32, z], 0.19, 0.02, 0.015, { mat: 'rim', k: 0.01, rot: [0, 0, Math.PI / 2] });
      }
    }
    return sc;
  }, {
    h: 0.035,
    sharp: 0.006,
    paints: {
      paint: { color: C(0xffffff), rough: 0.18, vary: 0.02 },
      glass: { color: C(0x0a0d10), rough: 0.05 },
      head: { color: C(0xe8ecf0), rough: 0.1, emit: 0.1 },
      tail: { color: C(0x7a0808), rough: 0.2, emit: 0.2 },
      trim: { color: C(0x1a1a1a), rough: 0.5 },
      plate: { color: C(0xe8e4c8), rough: 0.4 },
      tyre: { color: C(0x0e0e0e), rough: 0.8 },
      rim: { color: C(0x9a9a9e), rough: 0.25 },
      dark: { color: C(0x080808), rough: 0.9 },
    },
  });
  const mat = sculptMaterial({ detail: null, physical: { clearcoat: 1, clearcoatRoughness: 0.08 } });
  const mesh = new THREE.Mesh(recolor(geo, 'paint', color), mat);
  mesh.castShadow = true;
  const g = new THREE.Group();
  g.add(mesh);
  g.userData = { mat, size: [w, l, h] };
  return g;
}

/**
 * Builds looks ahead of time so a level doesn't stall on them mid-build.
 * items: names or [name, arg] pairs.
 */
export async function prewarm(items = []) {
  for (const item of items) {
    const [name, arg] = Array.isArray(item) ? item : [item];
    if (name === 'grin') grinFace();
    else if (name === 'vacuum') robotVacuum();
    else if (name.startsWith('car:')) carModel(name.slice(4));
    else LOOKS[name]?.(arg);
    await new Promise((r) => setTimeout(r, 0));
  }
}
