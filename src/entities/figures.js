import * as THREE from 'three';
import { Sculpt, sculptGeometry, sculptMaterial, skinnedSculpt, eyeball, noise3 } from '../core/sculpt.js';

// Sculpted characters. A humanoid is a skinned body (torso, limbs, clothes)
// plus a finer-resolution head and hands parented to their bones, so faces
// and fingers keep their detail. Everything is built once per look and
// cached; instances share geometry and only own their skeleton and material.

const v3 = (x, y, z) => [x, y, z];
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mirror = (p) => [-p[0], p[1], p[2]];

// ---------------------------------------------------------------------------
// Rig: named bones driven by Euler angles every frame.

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();

export class Rig {
  constructor(bones) {
    this.bones = bones;
    this.rest = {};
    for (const [n, b] of Object.entries(bones)) this.rest[n] = b.position.clone();
    this.cur = {};
  }

  /** Sets a bone's rotation (radians, YXZ order so yaw stays yaw). */
  rot(name, x = 0, y = 0, z = 0) {
    const b = this.bones[name];
    if (!b) return;
    _e.set(x, y, z, 'YXZ');
    b.quaternion.setFromEuler(_e);
  }

  /** Blends toward a pose { bone: [x, y, z] } by t (0..1). */
  blend(pose, t) {
    for (const [name, r] of Object.entries(pose)) {
      const b = this.bones[name];
      if (!b) continue;
      _e.set(r[0] || 0, r[1] || 0, r[2] || 0, 'YXZ');
      _q.setFromEuler(_e);
      b.quaternion.slerp(_q, t);
    }
  }

  reset() {
    for (const k in this.bones) this.bones[k].quaternion.identity();
  }

  offset(name, x, y, z) {
    const b = this.bones[name];
    const r = this.rest[name];
    if (b && r) b.position.set(r.x + x, r.y + y, r.z + z);
  }
}

// ---------------------------------------------------------------------------
// Humanoid

const HUMAN = {
  height: 1.72, leg: 1, arm: 1, neck: 1, torso: 1, girth: 1, head: 1, shoulders: 1, hips: 1, belly: 0,
  limb: 1, spread: 0.2, hand: 1,
};

/** Rest-pose joints of a humanoid facing +Z (its left is +X). */
export function humanJoints(p) {
  const P = { ...HUMAN, ...p };
  const s = P.height / 1.72;
  const ankle = 0.085 * s;
  const legLen = 0.82 * s * P.leg;
  const hipY = ankle + legLen;
  const knee = ankle + legLen * 0.49;
  const torsoH = 0.5 * s * P.torso;
  const neckY = hipY + torsoH;
  const headY = neckY + 0.09 * s * P.neck;
  const shY = neckY - 0.035 * s;
  const shX = 0.185 * s * P.shoulders * Math.sqrt(P.girth);
  const up = 0.3 * s * P.arm;
  const fore = 0.27 * s * P.arm;
  const a = P.spread;
  const elbow = [shX + Math.sin(a) * up, shY - Math.cos(a) * up, -0.025 * s];
  const wrist = [elbow[0] + Math.sin(a * 0.6) * fore, elbow[1] - Math.cos(a * 0.6) * fore, 0.02 * s];
  const hx = 0.088 * s * P.hips * Math.sqrt(P.girth);
  const J = {
    hips: { pos: v3(0, hipY, 0) },
    spine: { pos: v3(0, hipY + torsoH * 0.28, 0), parent: 'hips' },
    chest: { pos: v3(0, hipY + torsoH * 0.62, -0.005), parent: 'spine' },
    neck: { pos: v3(0, neckY, -0.012 * s), parent: 'chest' },
    head: { pos: v3(0, headY, 0), parent: 'neck' },
    armL: { pos: v3(shX, shY, -0.012 * s), parent: 'chest' },
    foreL: { pos: elbow, parent: 'armL' },
    handL: { pos: wrist, parent: 'foreL' },
    armR: { pos: mirror([shX, shY, -0.012 * s]), parent: 'chest' },
    foreR: { pos: mirror(elbow), parent: 'armR' },
    handR: { pos: mirror(wrist), parent: 'foreR' },
    thighL: { pos: v3(hx, hipY - 0.03 * s, 0), parent: 'hips' },
    shinL: { pos: v3(hx * 1.03, knee, 0.012 * s), parent: 'thighL' },
    footL: { pos: v3(hx * 1.06, ankle, -0.02 * s), parent: 'shinL' },
    thighR: { pos: v3(-hx, hipY - 0.03 * s, 0), parent: 'hips' },
    shinR: { pos: v3(-hx * 1.03, knee, 0.012 * s), parent: 'thighR' },
    footR: { pos: v3(-hx * 1.06, ankle, -0.02 * s), parent: 'shinR' },
  };
  return { J, P, s };
}

const J3 = (J, n) => J[n].pos;

/**
 * Body primitives. outfit: { top: 'shirt'|'coat'|'jacket'|'dress'|null, sleeve: 0..1,
 * bottom: 'pants'|'skirt'|'shorts'|null, shoes: 'shoe'|'bare'|'boot'|null,
 * collar, gloves, belt, ribs, joints (mannequin ball joints), hood }
 */
function humanBody(sc, J, P, s, o = {}) {
  const g = P.girth;
  const L = P.limb;
  const hip = J3(J, 'hips');
  const spine = J3(J, 'spine');
  const chest = J3(J, 'chest');
  const neck = J3(J, 'neck');
  const head = J3(J, 'head');
  const skin = o.skinMat || 'skin';
  const top = o.top || null;
  const bottom = o.bottom || null;
  const thin = o.ribs ? 0.82 : 1;
  const tH = P.torso;

  // torso
  sc.with({ bone: 'hips', mat: bottom ? 'bottom' : skin, k: 0.05 * s }, () => {
    sc.ellipsoid([0, hip[1] + 0.01 * s, -0.005], [0.15 * s * g * P.hips, 0.1 * s, 0.1 * s * g * thin]);
    for (const x of [-1, 1]) sc.ellipsoid([x * 0.058 * s * P.hips, hip[1] - 0.035 * s, -0.045 * s], [0.07 * s * g, 0.08 * s, 0.062 * s * g * thin]);
  });
  const folds = top ? { noise: [0.0025 * s, 28 / s] } : {};
  sc.with({ bone: 'spine', mat: top ? 'top' : skin, k: 0.06 * s, ...folds }, () => {
    sc.ellipsoid([0, spine[1] + 0.02 * s, (0.01 + P.belly * 0.05) * s], [0.13 * s * g * thin, 0.13 * s * tH, (0.095 + P.belly * 0.05) * s * g * thin]);
  });
  sc.with({ bone: 'chest', mat: top ? 'top' : skin, k: 0.05 * s }, () => {
    sc.ellipsoid([0, chest[1], 0], [0.15 * s * g * thin * P.shoulders, 0.15 * s * tH, 0.1 * s * g * thin]);
    if (!o.ribs) for (const x of [-1, 1]) sc.ellipsoid([x * 0.062 * s, chest[1] + 0.04 * s, 0.05 * s * g], [0.062 * s * g, 0.045 * s, 0.04 * s * g], { k: 0.06 * s });
    // trapezius into the shoulders
    for (const x of [-1, 1]) sc.cone([0, neck[1] - 0.01 * s, -0.025 * s], [x * J3(J, 'armL')[0] * 0.85, J3(J, 'armL')[1] + 0.012 * s, -0.02 * s], 0.055 * s * Math.sqrt(g), 0.048 * s * Math.sqrt(g));
  });
  if (o.ribs) {
    // a starved ribcage
    sc.with({ bone: 'chest', mat: skin, k: 0.012 * s }, () => {
      for (let r = 0; r < 5; r++) {
        const y = chest[1] + (0.07 - r * 0.045) * s * tH;
        for (const x of [-1, 1]) sc.cone([x * 0.02 * s, y + 0.01 * s, 0.1 * s * g * thin], [x * 0.14 * s * g, y - 0.02 * s, 0.01], 0.011 * s, 0.013 * s);
      }
    });
  }
  // neck
  sc.with({ bone: 'neck', mat: o.collar ? 'top' : skin, k: 0.03 * s }, () => {
    sc.cone([0, neck[1] - 0.04 * s, -0.012 * s], [0, head[1] + 0.035 * s, 0.004 * s], 0.056 * s * Math.sqrt(g) * (o.ribs ? 0.75 : 1), 0.047 * s * (o.ribs ? 0.75 : 1));
  });

  // arms
  const sleeve = o.sleeve ?? (top ? 0.45 : 0);
  for (const side of ['L', 'R']) {
    const sh = J3(J, `arm${side}`);
    const el = J3(J, `fore${side}`);
    const wr = J3(J, `hand${side}`);
    sc.with({ bone: `arm${side}`, mat: skin, k: 0.035 * s }, () => {
      sc.sphere([sh[0] * 0.98, sh[1] - 0.022 * s, sh[2] + 0.005], 0.048 * s * Math.sqrt(g) * L);
      sc.cone(sh, el, 0.05 * s * L * Math.sqrt(g), 0.036 * s * L);
      sc.ellipsoid(lerp3(sh, el, 0.45), [0.045 * s * L, 0.08 * s, 0.047 * s * L], { k: 0.04 * s });
    });
    sc.with({ bone: `fore${side}`, mat: skin, k: 0.03 * s }, () => {
      sc.cone(el, wr, 0.039 * s * L, 0.027 * s * L);
      sc.ellipsoid(lerp3(el, wr, 0.25), [0.04 * s * L, 0.07 * s, 0.037 * s * L], { k: 0.035 * s });
    });
    if (o.joints) {
      sc.with({ bone: `fore${side}`, mat: 'joint', k: 0.004 * s }, () => sc.sphere(el, 0.04 * s * L));
      sc.with({ bone: `hand${side}`, mat: 'joint', k: 0.004 * s }, () => sc.sphere(wr, 0.03 * s * L));
    }
    // sleeves: a slightly larger shell, ending in a hem
    if (top && sleeve > 0) {
      const endArm = Math.min(1, sleeve * 2);
      const loose = top === 'coat' ? 1.35 : 1.18;
      sc.with({ bone: `arm${side}`, mat: 'top', k: 0.02 * s }, () => {
        sc.cone([sh[0], sh[1] - 0.005, sh[2]], lerp3(sh, el, endArm), 0.055 * s * loose * Math.sqrt(g), 0.044 * s * loose * L, { noise: [0.003 * s, 30 / s] });
      });
      if (sleeve > 0.5) {
        sc.with({ bone: `fore${side}`, mat: 'top', k: 0.012 * s }, () => {
          sc.cone(el, lerp3(el, wr, (sleeve - 0.5) * 2 * 0.95), 0.047 * s * loose * L, 0.036 * s * loose * L, { noise: [0.003 * s, 30 / s] });
        });
      }
    }
    if (o.gloves) sc.with({ bone: `hand${side}`, mat: 'glove', k: 0.01 * s }, () => sc.cone(lerp3(el, wr, 0.88), wr, 0.031 * s, 0.03 * s));
  }

  if (o.legs === false) {
    // a ghost: the body trails off into a wisp
    sc.with({ bone: 'hips', mat: o.wispMat || 'bottom', k: 0.06 * s }, () => {
      sc.cone([0, hip[1] - 0.02 * s, 0], [0.03 * s, hip[1] - 0.55 * s, -0.08 * s], 0.15 * s * g, 0.02 * s, { noise: [0.012 * s, 14 / s] });
    });
  }
  // legs
  for (const side of o.legs === false ? [] : ['L', 'R']) {
    const th = J3(J, `thigh${side}`);
    const kn = J3(J, `shin${side}`);
    const an = J3(J, `foot${side}`);
    const x = th[0];
    sc.with({ bone: `thigh${side}`, mat: bottom === 'pants' || bottom === 'suit' ? 'bottom' : skin, k: 0.05 * s }, () => {
      sc.cone([x * 0.9, th[1] + 0.02 * s, th[2]], kn, 0.085 * s * g * L * thin, 0.053 * s * L);
      sc.ellipsoid(lerp3(th, kn, 0.35), [0.075 * s * g * L * thin, 0.13 * s, 0.075 * s * g * L * thin], { k: 0.04 * s });
    });
    sc.with({ bone: `shin${side}`, mat: bottom === 'pants' || bottom === 'suit' ? 'bottom' : skin, k: 0.03 * s }, () => {
      sc.cone(kn, an, 0.05 * s * L, 0.033 * s * L);
      sc.ellipsoid([kn[0], kn[1] - 0.12 * s, kn[2] - 0.028 * s], [0.048 * s * L * thin, 0.1 * s, 0.05 * s * L * thin], { k: 0.04 * s });
      if (o.joints) sc.with({ mat: 'joint', k: 0.004 * s }, () => sc.sphere(kn, 0.052 * s * L));
    });
    // feet or shoes
    const shoe = o.shoes === undefined ? 'shoe' : o.shoes;
    sc.with({ bone: `foot${side}`, mat: shoe === 'bare' || !shoe ? skin : 'shoe', k: 0.025 * s }, () => {
      if (shoe === 'boot') sc.cone([an[0], an[1] + 0.09 * s, an[2]], an, 0.045 * s, 0.045 * s);
      sc.box([an[0], 0.04 * s, an[2] + 0.06 * s], [0.042 * s, 0.038 * s, 0.115 * s], 0.032 * s);
      if (shoe === 'bare') for (let t = 0; t < 4; t++) sc.sphere([an[0] + (t - 1.5) * 0.017 * s * Math.sign(an[0] || 1), 0.018 * s, an[2] + 0.17 * s], 0.012 * s);
    });
  }

  // skirt / coat hems / belts
  if (bottom === 'skirt') {
    sc.with({ bone: 'hips', mat: 'bottom', k: 0.02 * s }, () => {
      sc.cone([0, hip[1] + 0.06 * s, 0], [0, hip[1] - 0.26 * s, 0.01], 0.16 * s * g, 0.25 * s * g, { noise: [0.008 * s, 30 / s] });
    });
  }
  if (top === 'coat' || top === 'dress') {
    const len = top === 'dress' ? 0.55 : o.coatLen ?? 0.72;
    sc.with({ bone: 'hips', mat: top === 'dress' ? 'bottom' : 'top', k: 0.03 * s }, () => {
      sc.cone([0, spine[1], 0], [0, hip[1] - len * s * P.leg, -0.01], 0.15 * s * g, 0.22 * s * g * (top === 'dress' ? 1.2 : 1), { noise: [0.006 * s, 18 / s] });
    });
  }
  if (o.belt) sc.with({ bone: 'hips', mat: 'belt', k: 0.004 * s }, () => sc.torus([0, hip[1] + 0.07 * s, 0.005], 0.13 * s * g, 0.018 * s, { rot: [0, 0, 0] }));
  if (o.collar) sc.with({ bone: 'chest', mat: 'collar', k: 0.008 * s }, () => sc.torus([0, neck[1] - 0.012 * s, 0], 0.056 * s, 0.014 * s, { rot: [0.25, 0, 0] }));
  if (o.hood) sc.with({ bone: 'chest', mat: 'top', k: 0.03 * s }, () => sc.ellipsoid([0, neck[1] + 0.01 * s, -0.08 * s], [0.12 * s, 0.07 * s, 0.07 * s]));
  o.extraBody?.(sc, J, s);
}

/**
 * Head in head-bone space (origin at the top of the neck, face along +Z).
 * face: 'human' | 'blank' (mannequin egg) | 'hollow' (sockets, no eyes) | 'grin'
 */
function humanHead(sc, s, o = {}) {
  const hs = s * (o.headScale || 1);
  const face = o.face || 'human';
  const skin = o.skinMat || 'face';
  const S = (x, y, z) => [x * hs, y * hs, z * hs];
  const long = o.longHead || 1;
  sc.with({ bone: 'head', mat: skin, k: 0.02 * hs }, () => {
    sc.cone(S(0, -0.06, -0.015), S(0, 0.02, -0.02), 0.048 * hs, 0.05 * hs);
    if (face === 'blank') {
      sc.ellipsoid(S(0, 0.07, 0.005), [0.078 * hs, 0.11 * hs * long, 0.095 * hs]);
      sc.ellipsoid(S(0, 0.035, 0.05), [0.056 * hs, 0.07 * hs, 0.06 * hs], { k: 0.04 * hs });
      // the barest hint of a nose and brow
      sc.ellipsoid(S(0, 0.06, 0.095), [0.012 * hs, 0.028 * hs, 0.012 * hs], { k: 0.02 * hs });
      sc.ellipsoid(S(0, 0.085, 0.075), [0.055 * hs, 0.012 * hs, 0.02 * hs], { k: 0.02 * hs });
      return;
    }
    sc.ellipsoid(S(0, 0.085 * long, -0.01), [0.077 * hs, 0.092 * hs * long, 0.096 * hs]);
    sc.ellipsoid(S(0, 0.09 * long, 0.035), [0.068 * hs, 0.062 * hs * long, 0.06 * hs], { k: 0.03 * hs });
    sc.ellipsoid(S(0, 0.035, 0.045), [0.062 * hs, 0.06 * hs, 0.055 * hs], { k: 0.03 * hs });
    // jaw and chin
    for (const x of [-1, 1]) sc.cone(S(x * 0.056, 0.022, -0.002), S(x * 0.024, -0.045, 0.07), 0.021 * hs, 0.017 * hs, { k: 0.02 * hs });
    sc.sphere(S(0, -0.05, 0.077), 0.022 * hs, { k: 0.02 * hs });
    // cheekbones and brow
    for (const x of [-1, 1]) sc.sphere(S(x * 0.046, 0.045, 0.064), 0.021 * hs, { k: 0.02 * hs });
    sc.ellipsoid(S(0, 0.078, 0.08), [0.058 * hs, 0.013 * hs, 0.018 * hs], { k: 0.015 * hs });
    // eye sockets
    const sock = face === 'hollow' ? 0.027 : 0.02;
    sc.cut(() => {
      for (const x of [-1, 1]) sc.sphere(S(x * 0.032, 0.058, 0.099), sock * hs, { k: 0.012 * hs, mat: face === 'hollow' ? 'socket' : skin });
    });
    if (face !== 'hollow') {
      for (const x of [-1, 1]) {
        sc.ellipsoid(S(x * 0.032, 0.0685, 0.088), [0.018 * hs, 0.0062 * hs, 0.012 * hs], { k: 0.005 * hs });
        sc.ellipsoid(S(x * 0.032, 0.0465, 0.089), [0.016 * hs, 0.004 * hs, 0.01 * hs], { k: 0.005 * hs });
        if (o.brows !== false) sc.cone(S(x * 0.017, 0.08, 0.1), S(x * 0.05, 0.081, 0.088), 0.0042 * hs, 0.0028 * hs, { mat: 'brow', k: 0.002 * hs });
      }
    }
    // nose
    sc.cone(S(0, 0.062, 0.1), S(0, 0.022, 0.118), 0.008 * hs, 0.012 * hs, { k: 0.012 * hs });
    sc.sphere(S(0, 0.019, 0.117), 0.0135 * hs, { k: 0.01 * hs });
    for (const x of [-1, 1]) sc.sphere(S(x * 0.014, 0.016, 0.106), 0.0105 * hs, { k: 0.008 * hs });
    sc.cut(() => {
      for (const x of [-1, 1]) sc.sphere(S(x * 0.0075, 0.007, 0.113), 0.0042 * hs, { k: 0.004 * hs, mat: 'mouth' });
    });
    // mouth
    if (face === 'grin') {
      // far too wide, far too many teeth
      sc.cut(() => sc.ellipsoid(S(0, -0.018, 0.1), [0.06 * hs, 0.018 * hs, 0.03 * hs], { k: 0.006 * hs, mat: 'mouth' }));
      for (let t = -9; t <= 9; t++) {
        const a = t / 9;
        const x = a * 0.055;
        const z = 0.1 - a * a * 0.035;
        sc.box(S(x, -0.01 - a * a * 0.004, z), [0.0032 * hs, 0.007 * hs, 0.003 * hs], 0.0015 * hs, { mat: 'teeth', k: 0.001 * hs, rot: [0, -a * 0.8, 0] });
        sc.box(S(x, -0.027 - a * a * 0.004, z - 0.002), [0.0032 * hs, 0.0065 * hs, 0.003 * hs], 0.0015 * hs, { mat: 'teeth', k: 0.001 * hs, rot: [0, -a * 0.8, 0] });
      }
    } else if (face !== 'hollow') {
      sc.ellipsoid(S(0, -0.008, 0.099), [0.022 * hs, 0.0065 * hs, 0.01 * hs], { mat: 'lips', k: 0.008 * hs });
      sc.ellipsoid(S(0, -0.0205, 0.096), [0.019 * hs, 0.0075 * hs, 0.0095 * hs], { mat: 'lips', k: 0.008 * hs });
      sc.cut(() => sc.ellipsoid(S(0, -0.0135, 0.109), [0.022 * hs, 0.0014 * hs, 0.01 * hs], { k: 0.002 * hs, mat: 'mouth' }));
    } else {
      sc.cut(() => sc.ellipsoid(S(0, -0.016, 0.1), [0.018 * hs, 0.003 * hs, 0.02 * hs], { k: 0.004 * hs, mat: 'socket' }));
    }
    // ears
    for (const x of [-1, 1]) {
      sc.ellipsoid(S(x * 0.077, 0.05, -0.006), [0.011 * hs, 0.029 * hs, 0.019 * hs], { rot: [0, x * 0.35, x * 0.1], k: 0.008 * hs });
      sc.cut(() => sc.ellipsoid(S(x * 0.085, 0.05, -0.003), [0.005 * hs, 0.018 * hs, 0.01 * hs], { rot: [0, x * 0.35, 0], k: 0.004 * hs }));
    }
  });
  // hair
  const hair = o.hair || 'none';
  if (hair !== 'none') {
    sc.with({ bone: 'head', mat: 'hair', k: 0.012 * hs }, () => {
      const n = [0, -0.6, 0.8];
      if (hair === 'short') sc.ellipsoid(S(0, 0.09, -0.012), [0.083 * hs, 0.094 * hs, 0.102 * hs], { clip: [n[0], n[1], n[2], -0.004 * hs], noise: [0.003 * hs, 70 / hs] });
      if (hair === 'bob' || hair === 'long') {
        sc.ellipsoid(S(0, 0.085, -0.012), [0.088 * hs, 0.1 * hs, 0.106 * hs], { clip: [0, -0.35, 0.94, 0.03 * hs], noise: [0.003 * hs, 60 / hs] });
        sc.cone(S(0, 0.06, -0.03), S(0, hair === 'long' ? -0.14 : -0.03, -0.045), 0.09 * hs, hair === 'long' ? 0.07 * hs : 0.085 * hs, { clip: [0, 0, 1, 0.045 * hs], noise: [0.004 * hs, 50 / hs] });
        // fringe
        sc.ellipsoid(S(0, 0.125, 0.07), [0.07 * hs, 0.03 * hs, 0.035 * hs], { noise: [0.004 * hs, 60 / hs] });
      }
      if (hair === 'bald') sc.ellipsoid(S(0, 0.06, -0.03), [0.08 * hs, 0.05 * hs, 0.09 * hs], { clip: [0, 1, 0, 0.075 * hs], noise: [0.003 * hs, 70 / hs] });
    });
  }
  o.extraHead?.(sc, S, hs);
}

/** A relaxed left hand in hand-bone space (origin at the wrist, fingers down, palm toward -X). */
function humanHand(sc, s, o = {}) {
  const hs = s * (o.handScale || 1);
  const fl = o.fingerLen || 1;
  const S = (x, y, z) => [x * hs, y * hs, z * hs];
  const mat = o.gloves ? 'glove' : o.skinMat || 'skin';
  sc.with({ bone: 'hand', mat, k: 0.008 * hs }, () => {
    sc.cone(S(0, 0.02, 0), S(0, -0.02, 0), 0.027 * hs, 0.025 * hs);
    sc.box(S(0.001, -0.055, 0), [0.012 * hs, 0.043 * hs, 0.038 * hs], 0.011 * hs, { k: 0.015 * hs });
    const fingers = [[0.029, 0.075, 0.0085], [0.01, 0.086, 0.009], [-0.01, 0.081, 0.0085], [-0.028, 0.066, 0.0075]];
    for (const [z, len, r] of fingers) {
      const L = len * fl;
      const curl = o.curl ?? 0.35;
      const p0 = S(0, -0.093, z);
      const p1 = S(-0.004 - curl * 0.012, -0.093 - L * 0.5, z * 1.02);
      const p2 = S(-0.01 - curl * 0.04, -0.093 - L * 0.88, z * 1.04);
      sc.chain([p0, p1, p2], [r * hs, r * 0.9 * hs, r * 0.8 * hs], { k: 0.005 * hs });
      if (o.nails) sc.ellipsoid(S(-0.004 - curl * 0.04, -0.093 - L * 0.92, z * 1.04), [0.004 * hs, 0.007 * hs, r * 0.7 * hs], { mat: 'nail', k: 0.002 * hs });
    }
    sc.chain([S(-0.012, -0.025, 0.03), S(-0.03, -0.06, 0.045), S(-0.036, -0.087, 0.038)], [0.012 * hs, 0.01 * hs, 0.0085 * hs], { k: 0.008 * hs });
  });
}

/** Face skin: the body's skin with some blood in the cheeks, nose and ears. */
function withFace(paints) {
  if (paints.face) return paints;
  const skin = paints.skin;
  const blood = new THREE.Color(0.55, 0.12, 0.1);
  const hot = [[0.045, 0.035, 0.07, 0.03], [-0.045, 0.035, 0.07, 0.03], [0, 0.02, 0.12, 0.02], [0.08, 0.05, 0, 0.03], [-0.08, 0.05, 0, 0.03]];
  const shade = [[0.032, 0.045, 0.09, 0.016], [-0.032, 0.045, 0.09, 0.016]];
  paints.face = {
    ...skin,
    fn: (x, y, z, c) => {
      let r = 0;
      for (const [hx, hy, hz, rad] of hot) r += Math.exp(-((x - hx) ** 2 + (y - hy) ** 2 + (z - hz) ** 2) / (rad * rad));
      c.lerp(blood, Math.min(0.28, r * 0.22));
      for (const [hx, hy, hz, rad] of shade) c.multiplyScalar(1 - 0.18 * Math.exp(-((x - hx) ** 2 + (y - hy) ** 2 + (z - hz) ** 2) / (rad * rad)));
    },
  };
  if (!paints.brow) paints.brow = { ...paints.hair, vary: 0.3, freq: 120 };
  return paints;
}

/** A head on its own (floating faces, busts). */
export function sculptHead(key, opts = {}, paints = {}, h = 0.0045) {
  return sculptGeometry(`headonly:${key}`, (sc) => {
    humanHead(sc, opts.scale || 1, opts);
    return sc;
  }, { h: h * (opts.scale || 1) * (opts.headScale || 1), paints: withFace({ ...DEFAULT_PAINTS, ...paints }) });
}

const DEFAULT_PAINTS = {
  skin: { color: [0.62, 0.45, 0.36], rough: 0.55, vary: 0.06, freq: 25 },
  lips: { color: [0.42, 0.2, 0.17], rough: 0.4 },
  mouth: { color: [0.08, 0.03, 0.03], rough: 0.6 },
  hair: { color: [0.05, 0.04, 0.035], rough: 0.5, vary: 0.2, freq: 60 },
  top: { color: [0.3, 0.3, 0.32], rough: 0.85 },
  bottom: { color: [0.12, 0.12, 0.14], rough: 0.85 },
  shoe: { color: [0.05, 0.045, 0.04], rough: 0.35 },
  glove: { color: [0.9, 0.9, 0.88], rough: 0.7 },
  nail: { color: [0.7, 0.55, 0.5], rough: 0.3 },
  socket: { color: [0.0, 0.0, 0.0], rough: 1 },
  teeth: { color: [0.95, 0.92, 0.82], rough: 0.25, emit: 0 },
  joint: { color: [0.8, 0.78, 0.74], rough: 0.3 },
  collar: { color: [0.92, 0.92, 0.9], rough: 0.6 },
  belt: { color: [0.08, 0.06, 0.05], rough: 0.4 },
};

/**
 * Builds a humanoid. spec: { key, body: proportions, outfit, head: { face, hair, ... },
 * paints, eyes: { iris } | { glow } | null, material: sculptMaterial options, res }
 * Returns a Group with userData { rig, mesh, headMesh, mat, eyes, joints }.
 */
export function human(spec) {
  const { J, P, s } = humanJoints(spec.body || {});
  const paints = withFace({ ...DEFAULT_PAINTS, ...(spec.paints || {}) });
  const res = spec.res || 0.013;
  const outfit = spec.outfit || {};
  const matOpts = { detail: spec.detail ?? 'cloth', detailScale: 22, detailStrength: 0.3, ...(spec.material || {}) };
  const mat = sculptMaterial({ ...matOpts, skinned: true });
  const body = skinnedSculpt(`human:${spec.key}`, (sc) => {
    humanBody(sc, J, P, s, outfit);
    return sc;
  }, J, { h: res * s, paints, material: mat, jointR: 0.14 * s, soft: 0.03 * s });
  const bones = body.userData.bones;
  const headOpts = { skinMat: outfit.skinMat, ...(spec.head || {}) };
  // heads and hands share the body's probe uniform
  const headMat = sculptMaterial({ ...matOpts, detail: spec.headDetail ?? 'skin', detailScale: 45, detailStrength: 0.1, probe: mat.userData.probe });
  const headGeo = sculptGeometry(`head:${spec.key}`, (sc) => {
    humanHead(sc, s, headOpts);
    return sc;
  }, { h: (spec.headRes || 0.0055) * s * (headOpts.headScale || 1), paints });
  const headMesh = new THREE.Mesh(headGeo, headMat);
  headMesh.castShadow = true;
  headMesh.userData.noBake = true;
  bones.head.add(headMesh);
  const handGeo = sculptGeometry(`hand:${spec.key}`, (sc) => {
    humanHand(sc, s, { skinMat: outfit.skinMat, gloves: outfit.gloves, ...(spec.hands || {}) });
    return sc;
  }, { h: (spec.handRes || 0.0045) * s * (spec.hands?.handScale || 1), paints });
  const hands = [];
  for (const side of ['L', 'R']) {
    const hm = new THREE.Mesh(handGeo, headMat);
    hm.castShadow = true;
    hm.userData.noBake = true;
    if (side === 'R') hm.scale.x = -1;
    bones[`hand${side}`].add(hm);
    hands.push(hm);
  }
  const eyes = [];
  const hs = s * (headOpts.headScale || 1);
  if (spec.eyes !== null && headOpts.face !== 'blank') {
    const e = spec.eyes || {};
    const hollow = headOpts.face === 'hollow';
    for (const x of [-1, 1]) {
      const m = eyeball((e.glow ? (hollow ? 0.0045 : 0.006) : 0.0122) * hs, e);
      m.position.set(x * 0.032 * hs, 0.058 * hs, (hollow ? 0.078 : 0.084) * hs);
      headMesh.add(m);
      eyes.push(m);
    }
  }
  const group = new THREE.Group();
  group.add(body);
  const rig = new Rig(bones);
  group.userData = { rig, mesh: body, headMesh, hands, mat, headMat, eyes, joints: J, scale: s };
  return group;
}

/** Fades a figure built by human()/beast() (materials use alpha hashing). */
export function setFigureOpacity(fig, a) {
  const u = fig.userData;
  for (const m of [u.mat, u.headMat]) {
    if (!m) continue;
    m.opacity = a;
    m.transparent = false;
  }
  for (const e of u.eyes || []) {
    e.material.transparent = a < 1;
    e.material.opacity = a;
  }
  fig.visible = a > 0.01;
}

/** Points the probe light of a figure at the level's baked light around it. */
export function updateProbe(fig, world, pos) {
  const probe = fig.userData.mat?.userData.probe;
  if (!probe || !world.probe) return;
  world.probe(pos, probe.value);
}

// ---------------------------------------------------------------------------
// Poses and motion

/** Natural walk cycle. amt 0..1 scales the motion, phase in radians. */
export function walkPose(rig, phase, amt = 1, { stride = 0.45, arms = 0.35, bounce = 0.02, stiff = 0 } = {}) {
  const sn = Math.sin(phase);
  const cs = Math.cos(phase);
  rig.rot('thighL', -sn * stride * amt, 0, 0);
  rig.rot('thighR', sn * stride * amt, 0, 0);
  rig.rot('shinL', Math.max(0, cs) * 0.7 * amt * (1 - stiff), 0, 0);
  rig.rot('shinR', Math.max(0, -cs) * 0.7 * amt * (1 - stiff), 0, 0);
  rig.rot('footL', sn * 0.15 * amt, 0, 0);
  rig.rot('footR', -sn * 0.15 * amt, 0, 0);
  rig.rot('armL', sn * arms * amt, 0, 0.05);
  rig.rot('armR', -sn * arms * amt, 0, -0.05);
  rig.rot('foreL', -0.25 * amt - Math.max(0, sn) * 0.2 * amt, 0, 0);
  rig.rot('foreR', -0.25 * amt - Math.max(0, -sn) * 0.2 * amt, 0, 0);
  rig.rot('spine', 0.04 * amt, sn * 0.06 * amt, 0);
  rig.rot('chest', 0, -sn * 0.08 * amt, 0);
  rig.offset('hips', 0, -Math.abs(cs) * bounce * amt, 0);
}

/** Breathing and weight shifts while standing. */
export function idlePose(rig, t, { sway = 1 } = {}) {
  const b = Math.sin(t * 1.6) * 0.012;
  rig.rot('spine', b, Math.sin(t * 0.3) * 0.02 * sway, Math.sin(t * 0.37) * 0.01 * sway);
  rig.rot('chest', b * 1.5, 0, 0);
  rig.rot('neck', 0, 0, 0);
  rig.rot('armL', 0, 0, 0.04 + b);
  rig.rot('armR', 0, 0, -0.04 - b);
  rig.rot('foreL', -0.12, 0, 0);
  rig.rot('foreR', -0.12, 0, 0);
  rig.rot('thighL', 0, 0, 0);
  rig.rot('thighR', 0, 0, 0);
  rig.rot('shinL', 0, 0, 0);
  rig.rot('shinR', 0, 0, 0);
  rig.rot('footL', 0, 0, 0);
  rig.rot('footR', 0, 0, 0);
  rig.offset('hips', 0, 0, 0);
}

const _lookP = new THREE.Vector3();
const _lookT = new THREE.Vector3();
const _lookInv = new THREE.Matrix4();

/** Turns neck and head toward a world point (yaw/pitch split over two bones). */
export function lookAt(fig, target, { max = 1.2, pitch = 0.5, over = 1 } = {}) {
  const rig = fig.userData.rig;
  const head = rig.bones.head;
  const p = head.getWorldPosition(_lookP);
  const inv = _lookInv.copy(fig.matrixWorld).invert();
  const lp = _lookT.copy(target).applyMatrix4(inv);
  const hp = p.applyMatrix4(inv);
  const dx = lp.x - hp.x;
  const dy = lp.y - hp.y - 0.08;
  const dz = lp.z - hp.z;
  let yaw = Math.atan2(dx, dz);
  yaw = Math.max(-max * over, Math.min(max * over, yaw));
  const pit = Math.max(-pitch, Math.min(pitch, -Math.atan2(dy, Math.hypot(dx, dz))));
  rig.rot('neck', pit * 0.4, yaw * 0.4, 0);
  rig.rot('head', pit * 0.6, yaw * 0.6, 0);
  return yaw;
}

/** Static poses for mannequins and residents. */
export const POSES = {
  stand: {},
  wave: { armR: [0, 0, -2.5], foreR: [0, 0, -0.5], armL: [0, 0, 0.05], head: [0, -0.2, 0.1] },
  peace: { armR: [-1.2, 0, -0.9], foreR: [-1.7, 0, 0], head: [0.1, 0, -0.25], armL: [0, 0, 0.3], foreL: [-1.9, 0, 0], spine: [0, 0, 0.05] },
  dab: { armL: [0, 0, 2.2], foreL: [0, 0, 0.2], armR: [-1.1, 0.5, -0.6], foreR: [-2.2, 0, 0], head: [0.5, -0.5, 0], chest: [0.1, -0.3, 0] },
  thinker: { armR: [-0.5, 0, -0.15], foreR: [-2.3, 0, 0], head: [0.3, 0, 0], neck: [0.2, 0, 0], armL: [0.1, 0, 0.2], foreL: [-1.3, 0, 0] },
  reach: { armL: [-1.5, 0, 0.1], foreL: [-0.1, 0, 0], armR: [-1.45, 0, -0.1], foreR: [-0.1, 0, 0], chest: [0.15, 0, 0], head: [0.1, 0, 0] },
  point: { armR: [-1.5, 0.2, 0], foreR: [0, 0, 0], head: [0, -0.3, 0], armL: [0, 0, 0.1] },
  shrug: { armL: [0, 0, 0.5], foreL: [-1.4, 0.5, 0], armR: [0, 0, -0.5], foreR: [-1.4, -0.5, 0], head: [0, 0, 0.25], chest: [0, 0, 0] },
  tpose: { armL: [0, 0, 1.45], armR: [0, 0, -1.45], foreL: [0, 0, 0], foreR: [0, 0, 0] },
  wrong: { head: [0.2, 3.0, 0], neck: [0, 0.4, 0], armL: [0, 0, 0.2], armR: [-0.3, 0, -0.1], foreR: [-0.2, 0, 0] },
  watch: { armL: [-0.9, 0.4, 0.3], foreL: [-1.6, 0, 0], head: [0.55, 0.3, 0], neck: [0.2, 0, 0] },
  runway: { thighL: [-0.25, 0, 0], shinL: [0.3, 0, 0], thighR: [0.15, 0, 0], armL: [0, 0, 0.15], foreL: [-0.2, 0, 0], armR: [0.3, 0, -0.35], foreR: [-1.5, 0, 0], head: [-0.1, 0.35, 0], hips: [0, 0.2, 0.05] },
  kneel: { thighL: [-1.4, 0, 0], shinL: [1.5, 0, 0], thighR: [0.1, 0, 0], shinR: [1.6, 0, 0], footR: [0.6, 0, 0], head: [0.3, 0, 0], armL: [0, 0, 0.1], armR: [0, 0, -0.1] },
  bow: { spine: [0.35, 0, 0], chest: [0.35, 0, 0], neck: [0.15, 0, 0], armL: [0.3, 0, 0.03], armR: [0.3, 0, -0.03], foreL: [-0.1, 0, 0], foreR: [-0.1, 0, 0] },
  sit: { thighL: [-1.5, 0, 0.05], thighR: [-1.5, 0, -0.05], shinL: [1.5, 0, 0], shinR: [1.5, 0, 0], armL: [-0.3, 0, 0.1], foreL: [-0.8, 0, 0], armR: [-0.3, 0, -0.1], foreR: [-0.8, 0, 0] },
  slump: { thighL: [-1.45, -0.3, 0.2], thighR: [-1.5, 0.35, -0.2], shinL: [1.2, 0, 0], shinR: [0.9, 0, 0], spine: [0.3, 0, 0], chest: [0.25, 0, 0], neck: [0.3, 0, 0.1], head: [0.3, 0.2, 0.15], armL: [-0.5, 0, 0.35], foreL: [-1.1, 0, 0], armR: [-0.4, 0, -0.3], foreR: [-0.9, 0, 0] },
  collapse: { hips: [1.35, 0.4, 0.6], spine: [0.3, 0.3, 0], head: [0.4, 1.2, 0.4], armL: [-2.5, 0, 1.0], armR: [0.4, 0, -1.4], thighL: [-0.4, 0, 0.6], thighR: [0.8, 0, -0.3], shinL: [1.2, 0, 0], shinR: [0.2, 0, 0] },
  hug: { armL: [-1.3, -0.6, 0.2], foreL: [-1.2, -0.6, 0], armR: [-1.3, 0.6, -0.2], foreR: [-1.2, 0.6, 0], head: [0, 0, 0.3] },
  selfie: { armR: [-2.0, -0.4, -0.3], foreR: [-0.6, 0, 0], head: [-0.15, -0.35, -0.15], armL: [0, 0, 0.4], foreL: [-2.0, 0, 0] },
  flex: { armL: [0, 0, 1.45], foreL: [-1.6, 0, 0], armR: [0, 0, -1.45], foreR: [-1.6, 0, 0], head: [0, 0.4, 0] },
};

// poses that sit the hips down to a given height (m above the floor, scaled)
const SEAT = { slump: [0.13, -0.08], sit: [0.47, -0.02], kneel: [0.5, 0], collapse: [0.16, 0] };

/** Applies a named pose from rest, lowering the hips for seated poses. */
export function applyPose(rig, name, t = 1) {
  rig.reset();
  const seat = SEAT[name];
  const hy = rig.rest.hips?.y || 0.95;
  if (seat) rig.offset('hips', 0, (seat[0] * hy / 0.95 - hy) * t, seat[1] * t);
  else rig.offset('hips', 0, 0, 0);
  rig.blend(POSES[name] || {}, t);
}

// ---------------------------------------------------------------------------
// Quadrupeds (fox, cat, capybara). Built along +Z, legs down.

/**
 * spec: { key, len, height, girth, neck, headSize, snout, ears, tail, tails, legs, paints, res, sit }
 */
export function beast(spec) {
  const s = spec.size || 1;
  const len = (spec.len || 0.5) * s;
  const hh = (spec.height || 0.35) * s;
  const g = (spec.girth || 0.12) * s;
  const legR = (spec.legR || 0.028) * s;
  const tailN = spec.tail ? 4 : 0;
  const J = {
    pelvis: { pos: v3(0, hh, -len / 2) },
    spine: { pos: v3(0, hh + g * 0.1, 0), parent: 'pelvis' },
    chest: { pos: v3(0, hh + g * 0.15, len / 2), parent: 'spine' },
    neck: { pos: v3(0, hh + g * 0.6, len / 2 + g * 0.5), parent: 'chest' },
    head: { pos: v3(0, hh + g * 0.6 + (spec.neck || 0.12) * s, len / 2 + g * 0.8), parent: 'neck' },
  };
  const legs = [['FL', 1, len / 2, 'chest'], ['FR', -1, len / 2, 'chest'], ['BL', 1, -len / 2, 'pelvis'], ['BR', -1, -len / 2, 'pelvis']];
  for (const [n, x, z, par] of legs) {
    const lx = x * g * 0.55;
    J[`leg${n}`] = { pos: v3(lx, hh - g * 0.2, z), parent: par };
    J[`low${n}`] = { pos: v3(lx, hh * 0.45, z + (z < 0 ? -0.03 * s : 0.01 * s)), parent: `leg${n}` };
    J[`paw${n}`] = { pos: v3(lx, 0.03 * s, z + 0.01 * s), parent: `low${n}` };
  }
  let prev = 'pelvis';
  const tailPts = [];
  for (let t = 0; t < tailN; t++) {
    const tl = (spec.tailLen || 0.4) * s;
    const p = v3(0, hh + g * 0.3 + t * tl * (spec.tailRise ?? 0.12), -len / 2 - g * 0.6 - t * tl * 0.25);
    J[`tail${t}`] = { pos: p, parent: prev };
    tailPts.push(p);
    prev = `tail${t}`;
  }
  const paints = { ...(spec.paints || {}) };
  const res = (spec.res || 0.009) * s;
  const mat = sculptMaterial({ detail: 'fur', detailScale: 40, detailStrength: 0.45, skinned: true, ...(spec.material || {}) });
  const mesh = skinnedSculpt(`beast:${spec.key}`, (sc) => {
    const hp = J.pelvis.pos;
    const cp = J.chest.pos;
    sc.with({ bone: 'pelvis', mat: 'fur', k: g * 0.5 }, () => sc.ellipsoid([0, hh + g * 0.1, -len / 2 + g * 0.2], [g * 0.85, g * 0.95, g * 1.1]));
    sc.with({ bone: 'spine', mat: 'fur', k: g * 0.5 }, () => sc.ellipsoid([0, hh + g * 0.05, 0], [g * 0.8 * (spec.barrel || 1), g * 0.85 * (spec.barrel || 1), len * 0.45]));
    sc.with({ bone: 'chest', mat: 'chest', k: g * 0.5 }, () => sc.ellipsoid([0, cp[1], cp[2] - g * 0.1], [g * 0.8, g * 1.0, g * 1.0]));
    sc.with({ bone: 'neck', mat: 'fur', k: g * 0.4 }, () => sc.cone([0, cp[1] + g * 0.2, cp[2] + g * 0.1], J.head.pos, g * 0.6, g * 0.45 * (spec.headSize || 1)));
    // head
    const h = J.head.pos;
    const hsz = (spec.headSize || 1) * g;
    sc.with({ bone: 'head', mat: 'fur', k: hsz * 0.3 }, () => {
      const sn = (spec.snout || 0.8) * hsz;
      if (spec.headShape === 'box') {
        // blocky rodent head, sloping down to a deep blunt muzzle
        sc.box([0, h[1] + hsz * 0.05, h[2] + hsz * 0.35], [hsz * 0.42, hsz * 0.48, hsz * 0.75], hsz * 0.34, { rot: [0.35, 0, 0] });
        sc.box([0, h[1] - hsz * 0.18, h[2] + hsz * 0.95], [hsz * 0.34, hsz * 0.3, hsz * 0.25], hsz * 0.25, { mat: 'muzzle', k: hsz * 0.25 });
        sc.ellipsoid([0, h[1] - hsz * 0.12, h[2] + hsz * 1.18], [hsz * 0.2, hsz * 0.1, hsz * 0.06], { mat: 'nose', k: hsz * 0.08 });
      } else {
        sc.ellipsoid([0, h[1] + hsz * 0.15, h[2] + hsz * 0.1], [hsz * 0.62, hsz * 0.55, hsz * 0.62]);
        sc.cone([0, h[1] + hsz * 0.05, h[2] + hsz * 0.4], [0, h[1] - hsz * 0.05, h[2] + hsz * 0.4 + sn], hsz * 0.34, hsz * 0.14 * (spec.muzzle || 1), { mat: 'muzzle' });
        sc.sphere([0, h[1] - hsz * 0.02, h[2] + hsz * 0.42 + sn], hsz * 0.09 * (spec.muzzle || 1), { mat: 'nose', k: hsz * 0.05 });
      }
      for (const x of [-1, 1]) {
        if (spec.headShape !== 'box') sc.ellipsoid([x * hsz * 0.34, h[1] + hsz * 0.02, h[2] + hsz * 0.35], [hsz * 0.22, hsz * 0.18, hsz * 0.2], { mat: 'cheek' });
        const eh = (spec.ears || 0.55) * hsz;
        sc.cone([x * hsz * 0.3, h[1] + hsz * 0.45, h[2] + hsz * 0.0], [x * hsz * (0.36 + (spec.earFlare || 0.15)), h[1] + hsz * 0.45 + eh, h[2] - hsz * 0.02], hsz * 0.19, hsz * 0.02, { mat: 'ear', k: hsz * 0.1 });
        if (spec.ears > 0.3) sc.cut(() => sc.cone([x * hsz * 0.3, h[1] + hsz * 0.5, h[2] + hsz * 0.12], [x * hsz * (0.36 + (spec.earFlare || 0.15)), h[1] + hsz * 0.4 + eh * 0.9, h[2] + hsz * 0.08], hsz * 0.12, hsz * 0.01, { mat: 'earIn', k: hsz * 0.04 }));
        sc.cut(() => sc.sphere([x * hsz * 0.27, h[1] + hsz * 0.22, h[2] + hsz * 0.52], hsz * 0.1, { k: hsz * 0.06 }));
      }
    });
    // legs
    for (const [n] of legs) {
      const a = J[`leg${n}`].pos;
      const b = J[`low${n}`].pos;
      const c = J[`paw${n}`].pos;
      const front = n[0] === 'F';
      sc.with({ bone: `leg${n}`, mat: 'fur', k: legR * 1.5 }, () => {
        sc.cone([a[0], a[1] + g * 0.35, a[2]], b, legR * (front ? 1.9 : 2.4), legR * 1.1);
      });
      sc.with({ bone: `low${n}`, mat: 'leg', k: legR }, () => sc.cone(b, c, legR * 1.05, legR * 0.85));
      sc.with({ bone: `paw${n}`, mat: 'paw', k: legR }, () => sc.ellipsoid([c[0], c[1], c[2] + legR * 0.8], [legR * 1.25, legR * 1.0, legR * 1.8]));
    }
    // tail
    if (tailN) {
      const fluff = (spec.tailFluff || 0.8) * g;
      tailPts.forEach((p, t) => {
        const q = t + 1 < tailN ? tailPts[t + 1] : [p[0], p[1] + (spec.tailLen || 0.4) * s * (spec.tailRise ?? 0.12), p[2] - (spec.tailLen || 0.4) * s * 0.28];
        const r0 = fluff * (0.4 + Math.sin(((t + 0.3) / tailN) * Math.PI) * 0.6);
        const r1 = fluff * (t + 1 < tailN ? 0.4 + Math.sin(((t + 1.3) / tailN) * Math.PI) * 0.6 : 0.25);
        sc.cone(p, q, r0, r1, { bone: `tail${t}`, mat: t === tailN - 1 ? 'tip' : 'tail', k: fluff * 0.5, noise: [fluff * 0.035, 9 / fluff] });
      });
    }
    spec.extra?.(sc, J, s);
    return sc;
  }, J, { h: res, paints, material: mat, jointR: g * 1.4, soft: g * 0.25 });
  const eyes = [];
  const bones = mesh.userData.bones;
  const hsz = (spec.headSize || 1) * g;
  for (const x of [-1, 1]) {
    const e = eyeball(hsz * 0.085, spec.eyes || { iris: 0xb07a20, pupil: 0.3 });
    const h = J.head.pos;
    e.position.set(x * hsz * 0.27, hsz * 0.22, hsz * 0.47);
    e.rotation.y = x * 0.35;
    bones.head.add(e);
    eyes.push(e);
  }
  const group = new THREE.Group();
  group.add(mesh);
  group.userData = { rig: new Rig(bones), mesh, mat, eyes, joints: J, scale: s };
  return group;
}

/** Beast poses: 'stand', 'sit' (upright on haunches), 'loaf' (legs tucked under). */
export function beastPose(fig, name) {
  const rig = fig.userData.rig;
  const J = fig.userData.joints;
  const hh = J.pelvis.pos[1];
  rig.reset();
  rig.offset('pelvis', 0, 0, 0);
  if (name === 'sit') {
    rig.offset('pelvis', 0, -hh * 0.55, 0);
    rig.rot('pelvis', -0.75, 0, 0);
    rig.rot('chest', -0.15, 0, 0);
    for (const s of ['FL', 'FR']) {
      rig.rot(`leg${s}`, 0.95, 0, 0);
      rig.rot(`low${s}`, -0.05, 0, 0);
    }
    for (const s of ['BL', 'BR']) {
      rig.rot(`leg${s}`, -0.55, 0, s === 'BL' ? -0.25 : 0.25);
      rig.rot(`low${s}`, 1.9, 0, 0);
      rig.rot(`paw${s}`, -0.5, 0, 0);
    }
    rig.rot('neck', 0.25, 0, 0);
    rig.rot('head', 0.55, 0, 0);
    rig.rot('tail0', 0.9, 0.4, 0);
  } else if (name === 'loaf') {
    rig.offset('pelvis', 0, -hh * 0.72, 0);
    for (const s of ['FL', 'FR']) {
      rig.rot(`leg${s}`, 1.2, 0, 0);
      rig.rot(`low${s}`, -2.2, 0, 0);
    }
    for (const s of ['BL', 'BR']) {
      rig.rot(`leg${s}`, -1.3, 0, 0);
      rig.rot(`low${s}`, 2.3, 0, 0);
    }
    rig.rot('neck', -0.1, 0, 0);
    rig.rot('tail0', 0.6, 0.9, 0);
    rig.rot('tail1', 0.3, 0.6, 0);
  }
}

/** Wags / sways a beast's tail chain. */
export function tailSway(rig, t, amt = 0.3, speed = 1.5) {
  for (let n = 0; n < 4; n++) rig.rot(`tail${n}`, 0.1 + Math.sin(t * speed * 0.5 + n) * 0.05, Math.sin(t * speed - n * 0.6) * amt, 0);
}

export { noise3 };
