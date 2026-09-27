import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Grid, FLOOR, WALL, HOLE, VOID, DIRS, buildCellQuads, buildRisers, wallMounts } from '../core/grid.js';
import { pbr, paint } from '../core/surfaces.js';
import { mesh, buildShell, doorModel, decorate, glow } from './common.js';
import { LightPool } from '../core/lights.js';
import { PropKit, keep } from '../props/kit.js';
import { photo, modelSize } from '../core/assets.js';
import * as P from '../props/library.js';
import { signTexture, screenStatic } from '../props/canvas.js';
import { exitSign, glowSprite } from '../core/textures.js';
import { Watcher, Follower, Peeker, StrayCat, seen } from '../entities/creatures.js';
import { LOOKS, carModel } from '../entities/looks.js';
import { idlePose, lookAt, beastPose, tailSway, updateProbe, POSES } from '../entities/figures.js';
import { NPC } from '../entities/npc.js';

// Parking Level P6: an underground multi-storey car park at 3 a.m. Split
// decks joined by long ramps, a pillar every three bays, sodium lamps, and
// cars that lock themselves as you walk past.

const CS = 2.5; // one bay wide
const H = 2.75; // slab to slab
const P6 = 0;
const P7 = -3;
const W = 48;
const HH = 35;
const PI = Math.PI;

// bay rows: two cells deep; `lane` is the side the lane is on (+1: larger j)
const BAY_ROWS = [
  { j: 1, lane: 1, zone: 0 },
  { j: 5, lane: -1, zone: 1 },
  { j: 7, lane: 1, zone: 2 },
  { j: 11, lane: -1, zone: 3 },
  { j: 13, lane: 1, zone: 4 },
  { j: 26, lane: -1, zone: 5 },
  { j: 28, lane: 1, zone: 6 },
  { j: 32, lane: -1, zone: 7 },
];
const LANES = [3, 9, 15, 24, 30]; // first row of each two-row driving lane
const CROSS = [1, 21, 41]; // first column of each two-column cross lane
const SEGS = [3, 23]; // first column of each run of 18 bays
const ZONES = 'ABCDEFGH';
const ZONE_COLORS = ['#c8322a', '#2a5cb0', '#2f8a4a', '#d9a51c', '#7a3d9a', '#d8641c', '#1f8c8c', '#c04a7a'];

// ---------------------------------------------------------------------------
// Canvas paint (cached for the session)

const TEX = new Map();
function canvasTex(key, w, h, draw, { repeat = false } = {}) {
  if (TEX.has(key)) return TEX.get(key);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.userData.cached = true;
  TEX.set(key, t);
  return t;
}

function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Scuffs painted marks: tyres wear floor paint away in specks and patches. */
function wear(ctx, w, h, amount = 0.25, seed = 1) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = (y * w + x) * 4;
      if (!d[k + 3]) continue;
      const n = hash2((x >> 3) + seed * 131, (y >> 3) + seed * 17) * 0.55 + hash2(x + seed, y) * 0.45;
      d[k + 3] = n < amount ? 0 : Math.min(d[k + 3], 255 * Math.min(1, (n - amount) * 5 + 0.3));
    }
  }
  ctx.putImageData(img, 0, 0);
}

const FONT = '"IBM Plex Sans", "Helvetica Neue", Arial, sans-serif';

const lineTex = () => canvasTex('g-line', 32, 512, (ctx, w, h) => {
  ctx.fillStyle = '#fff';
  ctx.fillRect(3, 0, w - 6, h);
  wear(ctx, w, h, 0.2, 3);
});

const hazardTex = () => canvasTex('g-hazard', 128, 128, (ctx, w, h) => {
  ctx.fillStyle = '#e0b21c';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#141414';
  for (let k = -2; k < 4; k++) {
    ctx.beginPath();
    ctx.moveTo(k * 64, h);
    ctx.lineTo(k * 64 + 32, h);
    ctx.lineTo(k * 64 + 32 + h, 0);
    ctx.lineTo(k * 64 + h, 0);
    ctx.fill();
  }
  // grime from bumpers and mops
  for (let n = 0; n < 900; n++) {
    ctx.fillStyle = `rgba(40,30,20,${Math.random() * 0.12})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 3, 3);
  }
}, { repeat: true });

const arrowTex = () => canvasTex('g-arrow', 128, 256, (ctx, w, h) => {
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(w / 2, 6);
  ctx.lineTo(w - 8, 96);
  ctx.lineTo(w * 0.66, 96);
  ctx.lineTo(w * 0.66, h - 6);
  ctx.lineTo(w * 0.34, h - 6);
  ctx.lineTo(w * 0.34, 96);
  ctx.lineTo(8, 96);
  ctx.closePath();
  ctx.fill();
  wear(ctx, w, h, 0.25, 5);
});

const floorText = (text, color = '#fff') => canvasTex(`g-ftext:${text}:${color}`, 512, 256, (ctx, w, h) => {
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 150px ${FONT}`;
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(0.75, 1.3); // road paint is stretched along the lane
  ctx.fillText(text, 0, 6);
  ctx.restore();
  wear(ctx, w, h, 0.28, text.length);
});

const wallText = (text, color) => canvasTex(`g-wtext:${text}:${color}`, 512, 256, (ctx, w, h) => {
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 210px ${FONT}`;
  ctx.fillText(text, w / 2, h / 2 + 10);
  wear(ctx, w, h, 0.18, text.length + 9);
});

const oilTex = () => canvasTex('g-oil', 768, 256, (ctx) => {
  for (let v = 0; v < 3; v++) {
    const cx = v * 256 + 128;
    for (let n = 0; n < 16; n++) {
      const r = 18 + Math.random() * 60;
      const x = cx + (Math.random() - 0.5) * 120;
      const y = 128 + (Math.random() - 0.5) * 120;
      const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(8,6,4,0.55)');
      gr.addColorStop(0.6, 'rgba(12,10,6,0.25)');
      gr.addColorStop(1, 'rgba(12,10,6,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
});

// wheel tracks worn into the lanes
const trackTex = () => canvasTex('g-track', 64, 64, (ctx, w, h) => {
  const gr = ctx.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, 'rgba(0,0,0,0)');
  gr.addColorStop(0.5, 'rgba(10,8,6,0.5)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, w, h);
}, { repeat: true });

// bay numbers painted on the floor: one atlas slot per zone and number
const NUM_W = 128;
const NUM_H = 64;
const numAtlas = () => canvasTex('g-nums', 2048, 1152, (ctx) => {
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 46px ${FONT}`;
  for (let z = 0; z < 8; z++) {
    for (let n = 1; n <= 36; n++) {
      const k = z * 36 + n - 1;
      ctx.fillText(`${ZONES[z]}${n}`, (k % 16) * NUM_W + NUM_W / 2, Math.floor(k / 16) * NUM_H + NUM_H / 2 + 3);
    }
  }
  wear(ctx, 2048, 1152, 0.22, 11);
});
function numUV(zone, n) {
  const k = zone * 36 + n - 1;
  const u0 = ((k % 16) * NUM_W) / 2048;
  const v1 = 1 - (Math.floor(k / 16) * NUM_H) / 1152;
  return [u0, v1 - NUM_H / 1152, u0 + NUM_W / 2048, v1];
}

// zone panels painted on the pillars: big letter over the level
const zoneAtlas = () => canvasTex('g-zones', 1024, 160, (ctx) => {
  for (let z = 0; z < 8; z++) {
    const x = z * 128;
    ctx.fillStyle = ZONE_COLORS[z];
    ctx.fillRect(x + 4, 4, 120, 112);
    ctx.fillStyle = '#f4f2ea';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 92px ${FONT}`;
    ctx.fillText(ZONES[z], x + 64, 64);
    ctx.fillStyle = '#26282a';
    ctx.fillRect(x + 4, 118, 120, 38);
    ctx.fillStyle = '#f4f2ea';
    ctx.font = `700 28px ${FONT}`;
    ctx.fillText(z < 5 ? 'P6' : 'P7', x + 64, 138);
  }
  wear(ctx, 1024, 160, 0.08, 2);
});
const zoneUV = (z) => [z / 8, 0, (z + 1) / 8, 1];

const armTex = () => canvasTex('g-arm', 256, 32, (ctx, w, h) => {
  for (let k = 0; k < 8; k++) {
    ctx.fillStyle = k % 2 ? '#f2f0ea' : '#c4201c';
    ctx.fillRect(k * 32, 0, 32, h);
  }
});

/** Poster taped to a pillar or wall: a missing car, or later, a missing driver. */
const missingTex = (eerie) => canvasTex(`g-missing:${eerie}`, 256, 360, (ctx, w, h) => {
  ctx.fillStyle = '#efeadc';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#1a1a1a';
  ctx.textAlign = 'center';
  ctx.font = `800 34px ${FONT}`;
  ctx.fillText('HAVE YOU', w / 2, 44);
  ctx.fillText('SEEN THIS', w / 2, 82);
  ctx.fillText(eerie ? 'DRIVER?' : 'CAR?', w / 2, 120);
  ctx.fillStyle = '#c8c2b2';
  ctx.fillRect(28, 140, w - 56, 130);
  ctx.fillStyle = '#2a2a2a';
  if (eerie) {
    // a head-and-shoulders silhouette, back turned
    ctx.beginPath();
    ctx.arc(w / 2, 190, 30, 0, PI * 2);
    ctx.fill();
    ctx.fillRect(w / 2 - 60, 222, 120, 48);
  } else {
    ctx.fillRect(56, 210, 144, 34);
    ctx.fillRect(86, 184, 84, 30);
    ctx.fillStyle = '#c8c2b2';
    ctx.beginPath();
    ctx.arc(90, 246, 14, 0, PI * 2);
    ctx.arc(168, 246, 14, 0, PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#1a1a1a';
  ctx.font = `500 17px ${FONT}`;
  ctx.fillText(eerie ? 'Last seen on P6.' : 'Silver. Last seen on P6.', w / 2, 298);
  ctx.fillText(eerie ? 'Looks like you.' : 'Answers to nothing.', w / 2, 322);
  ctx.fillStyle = 'rgba(120,100,60,0.2)';
  for (let n = 0; n < 40; n++) ctx.fillRect(Math.random() * w, Math.random() * h, 6, 6);
});

// availability board at the entrance: amber dot matrix
const boardTex = (deep) => canvasTex(`g-board:${deep}`, 512, 256, (ctx, w, h) => {
  ctx.fillStyle = '#0c0b0a';
  ctx.fillRect(0, 0, w, h);
  ctx.font = '38px "DotGothic16", monospace';
  ctx.textBaseline = 'middle';
  const rows = [['P5', 'FULL', '#ff4a2a'], ['P6', 'VACANT', '#ffb040'], ['P7', 'VACANT', '#ffb040'], deep ? ['P∞', 'VACANT', '#ffb040'] : ['P8', '- - - -', '#6a5030']];
  rows.forEach(([a, b, c], k) => {
    ctx.fillStyle = '#ffb040';
    ctx.fillText(a, 34, 40 + k * 58);
    ctx.fillStyle = c;
    ctx.fillText(b, 200, 40 + k * 58);
  });
});

// ---------------------------------------------------------------------------
// Geometry helpers

/** Box with box-projected UVs in metres / s, so photo textures keep their real size. */
function mBox(w, h, d, { segs = [1, 1, 1], s = 2, off = [0, 0] } = {}) {
  const geo = new THREE.BoxGeometry(w, h, d, ...segs);
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const uv = geo.attributes.uv;
  for (let k = 0; k < p.count; k++) {
    const ax = Math.abs(n.getX(k));
    const ay = Math.abs(n.getY(k));
    const x = p.getX(k);
    const y = p.getY(k);
    const z = p.getZ(k);
    const [u, v] = ax > 0.5 ? [z, y] : ay > 0.5 ? [x, z] : [x, y];
    uv.setXY(k, u / s + off[0], v / s + off[1]);
  }
  return geo;
}

/** Floor decal: a flat plane (segmented so baked light matches the floor), UVs from a rect. */
function flatGeo(w, d, rect = null, sx = 1, sz = 1) {
  const geo = new THREE.PlaneGeometry(w, d, sx, sz);
  if (rect) remapUV(geo, rect);
  geo.rotateX(-PI / 2);
  return geo;
}

function wallGeo(w, h, rect = null) {
  const geo = new THREE.PlaneGeometry(w, h);
  if (rect) remapUV(geo, rect);
  return geo;
}

function remapUV(geo, [u0, v0, u1, v1]) {
  const uv = geo.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) * (u1 - u0), v0 + uv.getY(k) * (v1 - v0));
}

/** A pipe running along x. */
function pipeGeo(r, len) {
  return new THREE.CylinderGeometry(r, r, len, 8, Math.max(1, Math.ceil(len / 1.5))).rotateZ(PI / 2);
}

/** Quads in the same layout as the grid builders, so the baker can tessellate them. */
class Quads {
  constructor() {
    this.p = [];
    this.n = [];
    this.uv = [];
    this.idx = [];
  }

  quad(pts, s, uvs = null) {
    const base = this.p.length / 3;
    const [a, b, , d] = pts;
    const n = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).cross(new THREE.Vector3(d[0] - a[0], d[1] - a[1], d[2] - a[2])).normalize();
    pts.forEach((q, k) => {
      this.p.push(...q);
      this.n.push(n.x, n.y, n.z);
      if (uvs) this.uv.push(...uvs[k]);
      else this.uv.push(q[0] / s, (n.y > 0 ? -q[2] : q[2]) / s);
    });
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.userData.quads = true;
    return g;
  }
}

/** Sloped floor and ceiling quads for the car ramps (the grid would draw them as steps). */
function slopeGeos(g, cells, uv) {
  const floor = new Quads();
  const ceil = new Quads();
  for (const [i, j] of cells) {
    const k = j * g.w + i;
    const [dx, dy] = DIRS[g.ramp[k] - 1];
    const base = g.hgt[k];
    const rise = g.rise[k];
    // height at a corner (fx, fz in 0..1 across the cell)
    const hAt = (fx, fz) => base + rise * (dx === 1 ? fx : dx === -1 ? 1 - fx : dy === 1 ? fz : 1 - fz);
    const x0 = i * CS;
    const x1 = x0 + CS;
    const z0 = j * CS;
    const z1 = z0 + CS;
    floor.quad([[x0, hAt(0, 1), z1], [x1, hAt(1, 1), z1], [x1, hAt(1, 0), z0], [x0, hAt(0, 0), z0]], uv);
    ceil.quad([[x0, hAt(0, 0) + H, z0], [x1, hAt(1, 0) + H, z0], [x1, hAt(1, 1) + H, z1], [x0, hAt(0, 1) + H, z1]], uv);
  }
  return [floor.build(), ceil.build()];
}

/** Painted hazard curbs along the walls of the car ramps (they follow the slope). */
function curbGeo(g, cells) {
  const q = new Quads();
  const s = 0.7;
  const hgt = 0.32;
  for (const [i, j] of cells) {
    const k = j * g.w + i;
    const [, dy] = DIRS[g.ramp[k] - 1];
    if (!dy) continue;
    const base = g.hgt[k];
    const rise = g.rise[k];
    const z0 = j * CS;
    const z1 = z0 + CS;
    const h0 = base + (dy === 1 ? 0 : rise);
    const h1 = base + (dy === 1 ? rise : 0);
    const uv = (z, y) => [z / s, (y - h0) / s];
    if (g.get(i - 1, j) === WALL) {
      const x = i * CS + 0.012;
      q.quad([[x, h1, z1], [x, h0, z0], [x, h0 + hgt, z0], [x, h1 + hgt, z1]], s, [uv(z1, h1), uv(z0, h0), uv(z0, h0 + hgt), uv(z1, h1 + hgt)]);
    }
    if (g.get(i + 1, j) === WALL) {
      const x = (i + 1) * CS - 0.012;
      q.quad([[x, h0, z0], [x, h1, z1], [x, h1 + hgt, z1], [x, h0 + hgt, z0]], s, [uv(z0, h0), uv(z1, h1), uv(z1, h1 + hgt), uv(z0, h0 + hgt)]);
    }
  }
  return q.build();
}

/** Proper steps for the stairwell's steep flights. */
function stairGeo(g, cells) {
  const geos = [];
  for (const [i, j] of cells) {
    const k = j * g.w + i;
    const [dx, dy] = DIRS[g.ramp[k] - 1];
    const base = g.hgt[k];
    const rise = g.rise[k];
    const n = Math.max(2, Math.round(Math.abs(rise) / 0.18));
    const depth = CS / n;
    for (let s = 0; s < n; s++) {
      const top = base + (rise * (s + 1)) / n;
      const h = top - base + 0.02;
      const geo = mBox(dx ? depth : CS, h, dx ? CS : depth, { s: 1.5 });
      const off = (s + 0.5) * depth;
      const cx = dx === 1 ? i * CS + off : dx === -1 ? (i + 1) * CS - off : (i + 0.5) * CS;
      const cz = dy === 1 ? j * CS + off : dy === -1 ? (j + 1) * CS - off : (j + 0.5) * CS;
      geo.translate(cx, base + h / 2 - 0.02, cz);
      geos.push(geo);
    }
  }
  return mergeGeometries(geos);
}

// ---------------------------------------------------------------------------
// Cars

const PAINTS = [[0xd6d6d2, 5], [0xdedcd4, 2], [0x9ea3a8, 4], [0x676b70, 2], [0x121316, 4], [0x1c2a48, 2], [0x7a1418, 1.2], [0x2a3a30, 0.8], [0xb8a88a, 0.8], [0x4a2c20, 0.5]];
const PASTELS = [0xbfe3d2, 0xf2dcc0, 0xe9c9d6, 0xc9d8ef, 0xf0e6a8];

function pickPaint(rng, kind) {
  if (kind === 'kei' && rng.chance(0.3)) return rng.pick(PASTELS);
  const total = PAINTS.reduce((s, p) => s + p[1], 0);
  let r = rng.next() * total;
  for (const [c, w] of PAINTS) {
    r -= w;
    if (r <= 0) return c;
  }
  return PAINTS[0][0];
}

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const PLANE = new THREE.PlaneGeometry(1, 1);
PLANE.userData.shared = true;

/**
 * Lamps that can come on: additive planes over the sculpted head, tail and
 * indicator lights plus glow sprites (never real lights: the light count
 * stays constant). set(head, tail, amber) takes levels 0..~2.
 */
function lightRig(car, size) {
  const [w, l] = size;
  const hw = w / 2;
  const hl = l / 2;
  const add = () => new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const spr = () => new THREE.SpriteMaterial({ map: glowSprite(), color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const head = add();
  const tail = add();
  const amber = add();
  const headG = spr();
  const tailG = spr();
  const amberG = spr();
  const lamp = (mat, sx, sy, x, y, z, back) => {
    const m = new THREE.Mesh(PLANE, mat);
    m.scale.set(sx, sy, 1);
    m.position.set(x, y, z);
    if (back) m.rotation.y = PI;
    m.userData.noBake = true;
    car.add(m);
  };
  const halo = (mat, s, x, y, z) => {
    const sp = new THREE.Sprite(mat);
    sp.scale.setScalar(s);
    sp.position.set(x, y, z);
    car.add(sp);
  };
  for (const sx of [-1, 1]) {
    lamp(head, 0.3, 0.09, sx * (hw - 0.26), 0.68, hl + 0.04);
    lamp(tail, 0.26, 0.09, sx * (hw - 0.2), 0.72, -hl - 0.04, true);
    lamp(amber, 0.09, 0.07, sx * (hw - 0.08), 0.68, hl + 0.035);
    lamp(amber, 0.09, 0.07, sx * (hw - 0.07), 0.72, -hl - 0.035, true);
    halo(headG, 1.2, sx * (hw - 0.26), 0.68, hl + 0.14);
    halo(tailG, 0.8, sx * (hw - 0.2), 0.72, -hl - 0.12);
    halo(amberG, 0.9, sx * (hw - 0.08), 0.68, hl + 0.12);
    halo(amberG, 0.9, sx * (hw - 0.07), 0.72, -hl - 0.12);
  }
  const parts = car.children.filter((o) => o.material === head || o.material === tail || o.material === amber || o.material === headG || o.material === tailG || o.material === amberG);
  let on = true;
  const rig = {
    set(h, t, a) {
      // idle rigs are hidden: a car park full of black additive quads is a lot of draw calls
      const want = h + t + a > 0.001;
      if (want !== on) {
        on = want;
        for (const o of parts) o.visible = want;
      }
      head.color.setRGB(2.4, 2.3, 2.0).multiplyScalar(h);
      headG.color.setRGB(0.8, 0.78, 0.7).multiplyScalar(h);
      tail.color.setRGB(2.2, 0.1, 0.05).multiplyScalar(t);
      tailG.color.setRGB(0.7, 0.04, 0.02).multiplyScalar(t);
      amber.color.setRGB(2.6, 1.3, 0.1).multiplyScalar(a);
      amberG.color.setRGB(0.9, 0.45, 0.04).multiplyScalar(a);
    },
  };
  rig.set(0, 0, 0);
  return rig;
}

/** Low-poly stand-ins for distant cars: the sculpted ones are heavy. */
const PROXY_DIMS = { sedan: [1.78, 4.5, 1.42], kei: [1.48, 3.4, 1.65], van: [1.85, 4.7, 1.95] };
const proxyCache = new Map();
function proxyGeo(kind) {
  if (proxyCache.has(kind)) return proxyCache.get(kind);
  const [w, l, h] = PROXY_DIMS[kind];
  const hw = w / 2;
  const hl = l / 2;
  const cabF = kind === 'sedan' ? hl - 1.3 : kind === 'kei' ? hl - 0.55 : hl - 0.45;
  const cabB = kind === 'sedan' ? -hl + 0.95 : -hl + 0.15;
  const cz = (cabF + cabB) / 2;
  const cl = cabF - cabB;
  const box = (bw, bh, bd, x, y, z) => new THREE.BoxGeometry(bw, bh, bd).translate(x, y, z);
  const paintG = mergeGeometries([
    box(w, 0.58, l - 0.1, 0, 0.56, 0),
    box(w - 0.1, 0.5, 0.1, 0, 0.55, hl - 0.05),
    box(w - 0.1, 0.5, 0.1, 0, 0.55, -hl + 0.05),
    box(w * 0.86, 0.12, cl - 0.1, 0, h - 0.06, cz),
    box(w * 0.88, 0.14, cl, 0, 0.92, cz),
  ]);
  const darkG = mergeGeometries([
    box(w * 0.9, h - 1.06, cl - 0.06, 0, (h + 0.99) / 2 - 0.03, cz),
    ...[hl - 0.75, -hl + 0.7].flatMap((z) => [-1, 1].map((x) => new THREE.CylinderGeometry(0.31, 0.31, 0.2, 12).rotateZ(PI / 2).translate(x * (hw - 0.1), 0.31, z))),
  ]);
  const out = [paintG, darkG];
  for (const geo of out) geo.userData.shared = true;
  proxyCache.set(kind, out);
  return out;
}

const LOOK_LINES = [
  { min: 0, lines: ['(Nobody inside. The seat is still warm.)'] },
  { min: 0, lines: ['(A parking ticket on the dashboard: OVERSTAYED — 11,000 DAYS.)'] },
  { min: 0, lines: ['(A pine-tree air freshener. It smells of a forest you have never been to.)'] },
  { min: 0, lines: ['(The keys are in the ignition.)', '(The car is not.)', '(No — it is. You checked twice.)'] },
  { min: 0, lines: ['(A sticky note on the wheel: “BACK IN 5 MIN.” The note is yellow with age.)'] },
  { min: 0.2, lines: ['(The sat-nav is on. It says: “You have arrived.”)'] },
  { min: 0.3, lines: ['(The radio is on, very quietly. It is a traffic report for this car park.)', '(Traffic on P6 is light. Traffic on P6 has always been light.)'] },
  { min: 0.4, lines: ['(The windows are fogged from the inside. Someone has written “HI”.)'] },
  { min: 0.55, lines: ['(Nobody inside. The seat is pushed all the way back, for someone very tall.)'] },
  { min: 0.65, lines: ['(The rear-view mirror is angled down at you. You didn’t touch it.)'] },
];
const DRAWING = ['(A child’s drawing on the back seat.)', '(It is a drawing of you, looking in through a car window.)'];
const COVER_LINES = [
  ['(A car under a dust cover. The cover rises and falls, slowly.)', '(It’s the ventilation. Probably the ventilation.)'],
  ['(You lift a corner of the cover. There is another cover underneath.)'],
  ['(A handwritten tag on the cover: “DO NOT UNCOVER. IT IS SLEEPING.”)'],
];

/** The gimmick cars: locking chirps, distant alarms, a horn with rhythm, "look inside". */
class CarPark {
  constructor(world, cars) {
    this.world = world;
    this.cars = cars;
    this.active = new Set();
    this.probed = false;
    this.cullT = 0;
    this.alarmT = world.rng.float(25, 55);
    this.chirpCool = 4;
    this.lookIdx = 0;
    this.drawingShown = false;
    this.panners = null;
    this.ended = false;
    this.lines = world.rng.shuffle(LOOK_LINES.slice());
  }

  lookInside(car, game) {
    const u = this.world.uneaseAt(car.x, car.z);
    let lines;
    if (car.covered) lines = COVER_LINES[(car.looked = (car.looked ?? -1) + 1) % COVER_LINES.length];
    else if (car.honker && car.honked) lines = ['(Nobody inside. A note is taped to the horn: “TWO BITS”.)'];
    else if (u >= 0.8 && !this.drawingShown && this.world.rng.chance(0.5)) {
      this.drawingShown = true;
      lines = DRAWING;
      game.pulseStatic(0.25);
    } else {
      const ok = this.lines.filter((e) => u >= e.min);
      lines = ok[this.lookIdx++ % ok.length].lines;
    }
    game.openDialog('the car', lines, 0.8);
  }

  start(car, type, dur) {
    car.fx = { type, t: 0, dur };
    this.active.add(car);
  }

  update(dt, ctx) {
    const w = this.world;
    const cam = ctx.camera.position;
    // parked cars pick up the baked light where they stand
    if (!this.probed) {
      this.probed = true;
      for (const c of this.cars) if (c.sculpt) updateProbe(c.sculpt, w, c.group.position);
    }
    // sculpted cars up close, low-poly stand-ins further out, nothing past the fog
    this.cullT -= dt;
    if (this.cullT <= 0) {
      this.cullT = 0.3;
      const dirty = new Set();
      for (const c of this.cars) {
        if (!c.sculpt) continue;
        const dist = Math.hypot(c.x - cam.x, c.z - cam.z);
        c.sculpt.visible = dist < 17;
        const proxy = dist >= 17 && dist < 44;
        if (proxy === c.proxyShown) continue;
        c.proxyShown = proxy;
        const { pm, dm, n, m } = c.proxy;
        pm.setMatrixAt(n, proxy ? m : ZERO);
        dm.setMatrixAt(n, proxy ? m : ZERO);
        dirty.add(pm).add(dm);
      }
      for (const im of dirty) im.instanceMatrix.needsUpdate = true;
    }
    for (const c of this.active) {
      const f = c.fx;
      f.t += dt;
      let h = 0;
      let a = 0;
      let t = 0;
      if (f.type === 'lock') {
        a = f.t < 0.62 && f.t % 0.32 < 0.14 ? 1 : 0;
        t = a * 0.6;
      } else if (f.type === 'alarm') {
        a = f.t % 0.5 < 0.25 ? 1 : 0;
        h = a;
      } else if (f.type === 'honk') {
        for (const [s, len] of f.notes) if (f.t >= s && f.t < s + len + 0.04) h = 1.4;
        if (f.second && f.t >= f.second.at) {
          ctx.game.audio.honk(this.panners?.honk, f.second.pattern);
          f.second = null;
        }
      }
      c.rig.set(h, t, a);
      if (f.t >= f.dur) {
        c.rig.set(0, 0, 0);
        c.fx = null;
        this.active.delete(c);
      }
    }
    if (ctx.attract) return;
    const audio = ctx.game.audio;
    if (!audio.ready) return;
    if (!this.panners) this.panners = { chirp: audio.panner(0, 0, 0, { ref: 3, rolloff: 1.2 }), alarm: audio.panner(0, 0, 0, { ref: 5, rolloff: 0.9 }), honk: audio.panner(0, 0, 0, { ref: 4, rolloff: 1 }) };
    const p = ctx.player.pos;
    this.chirpCool -= dt;
    for (const c of this.cars) {
      if (!c.rig || c.fx) continue;
      c.cool = (c.cool || 0) - dt;
      if (c.cool > 0 || Math.abs(c.x - p.x) + Math.abs(c.z - p.z) > 9) continue;
      // distance to the car's body, not its centre: walking down the lane counts as passing it
      const cy = Math.cos(c.yaw);
      const sy = Math.sin(c.yaw);
      const lx = (p.x - c.x) * cy - (p.z - c.z) * sy;
      const lz = (p.x - c.x) * sy + (p.z - c.z) * cy;
      const d = Math.hypot(Math.max(0, Math.abs(lx) - c.size[0] / 2), Math.max(0, Math.abs(lz) - c.size[1] / 2));
      if (d > (c.honker ? 4 : 3.4)) continue;
      if (c.honker && ctx.player.speed > 0.5) {
        // shave and a haircut ... (two bits)
        c.cool = 70;
        c.honked = true;
        audio.setPannerPos(this.panners.honk, c.x, c.y + 0.8, c.z);
        audio.honk(this.panners.honk, [0.2, 0.04, 0.04, 0.2, 0.2]);
        this.start(c, 'honk', 2.4);
        c.fx.notes = [[0, 0.2], [0.32, 0.04], [0.48, 0.04], [0.64, 0.2], [0.96, 0.2], [1.6, 0.2], [1.92, 0.2]];
        c.fx.second = { at: 1.6, pattern: [0.2, 0.2] };
      } else if (c.locker && this.chirpCool <= 0 && ctx.player.speed > 0.5) {
        // someone just locked it. Nobody is there.
        c.cool = 90;
        this.chirpCool = w.rng.float(5, 12);
        if (!w.rng.chance(0.65)) continue;
        audio.setPannerPos(this.panners.chirp, c.x, c.y + 0.8, c.z);
        const unlock = w.uneaseAt(c.x, c.z) > 0.8 && w.rng.chance(0.4);
        audio.chirp(this.panners.chirp, unlock ? 1 : 2);
        this.start(c, 'lock', unlock ? 0.3 : 0.7);
      }
    }
    // now and then a car alarm goes off somewhere else on the level
    this.alarmT -= dt;
    if (this.alarmT <= 0) {
      const u = w.uneaseAt(p.x, p.z);
      this.alarmT = w.rng.float(40, 90) / (0.7 + u);
      const far = this.cars.filter((c) => c.rig && !c.fx && Math.hypot(c.x - p.x, c.z - p.z) > 14 && Math.hypot(c.x - p.x, c.z - p.z) < 45);
      if (far.length) {
        const c = w.rng.pick(far);
        const dur = w.rng.float(3.5, 6);
        audio.setPannerPos(this.panners.alarm, c.x, c.y + 0.8, c.z);
        audio.carAlarm(this.panners.alarm, dur);
        this.start(c, 'alarm', dur);
      }
    }
  }

  dispose() {
    if (this.panners) for (const k in this.panners) this.panners[k].disconnect();
  }
}

/**
 * Headlight beam through dusty air: bright at the lamp, fading along the
 * cone, and soft at the silhouette (so it reads as haze from any angle).
 */
function beamMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0, 0, 0) } },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vP;
      varying float vAlong;
      void main() {
        vAlong = uv.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vP = mv.xyz;
        vN = normalMatrix * normal;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying vec3 vN;
      varying vec3 vP;
      varying float vAlong;
      void main() {
        float facing = abs(dot(normalize(vN), normalize(-vP)));
        float a = pow(vAlong, 1.8) * pow(facing, 1.6) * exp(-length(vP) * 0.035);
        gl_FragColor = vec4(uColor * a, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

// ---------------------------------------------------------------------------
// The driverless car. It creeps along the lanes toward you while you aren't
// looking, stops the moment you look, and never comes closer than a car length.

class Creeper {
  constructor(world, drive, wp) {
    this.world = world;
    this.drive = drive;
    this.wp = wp;
    this.presence = 0;
    const car = carModel('sedan', 0x22252a);
    car.children[0].userData.noBake = true;
    this.car = car;
    this.rig = lightRig(car, car.userData.size);
    this.object = new THREE.Group();
    this.object.rotation.order = 'YXZ';
    this.object.add(car);
    // headlight beams: additive cones through the fog, and pools on the floor
    this.beamMat = beamMaterial();
    const [cw, cl] = car.userData.size;
    for (const sx of [-1, 1]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.5, 9, 20, 1, true).rotateX(-PI / 2).translate(0, 0, 4.5).rotateX(0.1), this.beamMat);
      cone.position.set(sx * (cw / 2 - 0.26), 0.68, cl / 2 + 0.05);
      this.object.add(cone);
    }
    this.poolMat = new THREE.MeshBasicMaterial({ map: glowSprite(), color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const pool = new THREE.Mesh(flatGeo(3.6, 8), this.poolMat);
    pool.position.set(0, 0.03, cl / 2 + 4.2);
    this.object.add(pool);
    // hidden far below rather than invisible, so its shaders compile with the level
    this.object.position.set(0, -80, 0);
    this.front = new THREE.Vector3(0, 0, -1000);
    this.back = new THREE.Vector3(0, 0, -1000);
    world.addCircle(this.front, 1.0);
    world.addCircle(this.back, 1.0);
    this.state = 'hidden';
    this.timer = world.rng.float(15, 35);
    this.t = 0;
    this.speed = 0;
    this.path = null;
    this.replan = 0;
    this.seenT = 0;
    this.flash = 0;
    this.flashes = 0;
    this.lights = 0;
    this.engine = null;
    this.probeT = 0;
  }

  cellNear(x, z) {
    const g = this.world.grid;
    const [ci, cj] = g.cellOf(x, z);
    let best = null;
    let bd = Infinity;
    for (let dj = -3; dj <= 3; dj++) {
      for (let di = -3; di <= 3; di++) {
        const i = ci + di;
        const j = cj + dj;
        if (!g.inBounds(i, j) || !this.drive[j * g.w + i]) continue;
        const c = this.wp(i, j);
        const d = Math.hypot(c.x - x, c.z - z);
        if (d < bd) {
          bd = d;
          best = [i, j];
        }
      }
    }
    return best;
  }

  /** BFS over lane cells only. */
  route(from, to) {
    const g = this.world.grid;
    const prev = new Int32Array(g.w * g.h).fill(-1);
    const s = from[1] * g.w + from[0];
    const goal = to[1] * g.w + to[0];
    const q = [s];
    prev[s] = s;
    for (let h = 0; h < q.length; h++) {
      const cur = q[h];
      if (cur === goal) break;
      const ci = cur % g.w;
      const cj = (cur / g.w) | 0;
      for (const [dx, dy] of DIRS) {
        const k = (cj + dy) * g.w + ci + dx;
        if (!g.inBounds(ci + dx, cj + dy) || prev[k] !== -1 || !this.drive[k] || !g.passable(ci, cj, dx, dy)) continue;
        prev[k] = cur;
        q.push(k);
      }
    }
    if (prev[goal] === -1) return null;
    const out = [];
    for (let c = goal; c !== s; c = prev[c]) out.push({ ...this.wp(c % g.w, (c / g.w) | 0), cell: [c % g.w, (c / g.w) | 0] });
    return out.reverse();
  }

  appear(ctx) {
    const { player } = ctx;
    const w = this.world;
    const g = w.grid;
    const start = this.cellNear(player.pos.x, player.pos.z);
    if (!start) return false;
    const cands = [];
    for (let j = 0; j < g.h; j++) {
      for (let i = 0; i < g.w; i++) {
        if (!this.drive[j * g.w + i] || g.ramp[j * g.w + i]) continue;
        const c = this.wp(i, j);
        const d = Math.hypot(c.x - player.pos.x, c.z - player.pos.z);
        if (d < 18 || d > 34) continue;
        if (seen(ctx, w, c.x, w.floorAt(c.x, c.z) + 0.8, c.z, 1.2)) continue;
        cands.push([i, j]);
      }
    }
    if (!cands.length) return false;
    const [i, j] = w.rng.pick(cands);
    const path = this.route([i, j], start);
    if (!path || path.length < 3) return false;
    const c = this.wp(i, j);
    const o = this.object;
    o.position.set(c.x, w.floorAt(c.x, c.z), c.z);
    o.rotation.y = Math.atan2(path[0].x - c.x, path[0].z - c.z);
    this.path = path;
    this.cell = [i, j];
    this.state = 'creep';
    this.t = 0;
    this.flashes = 0;
    this.seenT = 0;
    this.probeT = 0;
    return true;
  }

  hide() {
    this.state = 'hidden';
    this.object.position.set(0, -80, 0);
    this.front.set(0, 0, -1000);
    this.back.set(0, 0, -1000);
    this.timer = this.world.rng.float(35, 80);
    this.presence = 0;
    this.lights = 0;
  }

  update(dt, ctx) {
    if (ctx.attract) return;
    const { player, game } = ctx;
    const w = this.world;
    const o = this.object;
    const p = o.position;
    const audio = game.audio;
    if (!this.engine && audio.ready) {
      // a low idle, like an engine left running
      const a = audio.ctx;
      this.panner = audio.panner(0, 0, 0, { ref: 4, rolloff: 1.1 });
      const osc = a.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 33;
      const f = a.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 150;
      const gn = a.createGain();
      gn.gain.value = 0;
      osc.connect(f).connect(gn).connect(this.panner);
      osc.start();
      this.engine = { osc, gn, a };
    }
    if (this.state === 'hidden') {
      if (this.engine) this.engine.gn.gain.setTargetAtTime(0, this.engine.a.currentTime, 0.3);
      if (w.uneaseAt(player.pos.x, player.pos.z) < 0.7) return;
      this.timer -= dt;
      if (this.timer <= 0 && !this.appear(ctx)) this.timer = 3;
      if (this.state === 'hidden') return;
    }
    this.t += dt;
    const dist = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
    const looked = seen(ctx, w, p.x, p.y + 0.8, p.z, 1.0);
    if (this.state === 'creep') {
      this.lights = Math.min(1, this.lights + dt * 2);
      if (looked) {
        this.speed = 0;
        this.seenT += dt;
        this.presence = Math.min(0.55, this.presence + dt * 0.5);
        // it flashes its high beams at you, once or twice
        if (this.seenT > 0.8 && this.flashes < 2 && this.flash <= 0 && w.rng.chance(dt * 1.5)) {
          this.flash = 0.9;
          this.flashes++;
        }
        if (dist < 7.5) this.state = 'leave';
      } else {
        this.seenT = 0;
        this.presence = Math.max(0.15, this.presence - dt * 0.2);
        this.replan -= dt;
        if (this.replan <= 0) {
          this.replan = 1;
          // replan from the last lane cell reached, so it never dithers between two
          const from = this.cell;
          const to = this.cellNear(player.pos.x, player.pos.z);
          if (from && to) this.path = this.route(from, to) || this.path;
        }
        const want = dist > 10 && this.path && this.path.length ? 2.6 : 0;
        this.speed += (want - this.speed) * Math.min(1, dt * 1.5);
        this.follow(dt);
      }
      if (this.t > 120) this.state = 'leave';
    } else if (this.state === 'leave') {
      this.lights = Math.max(0, this.lights - dt * 3);
      this.presence = Math.max(0, this.presence - dt);
      if (!looked) this.hide();
    }
    this.flash = Math.max(0, this.flash - dt);
    const beam = this.lights * (1 + (this.flash > 0 && this.flash % 0.45 > 0.2 ? 1.2 : 0));
    this.rig.set(beam, this.lights * 0.8, 0);
    this.beamMat.uniforms.uColor.value.setRGB(0.16, 0.15, 0.13).multiplyScalar(beam);
    this.poolMat.color.setRGB(0.15, 0.13, 0.095).multiplyScalar(beam);
    // pitch on the ramps
    const [, cl] = this.car.userData.size;
    const fx = Math.sin(o.rotation.y);
    const fz = Math.cos(o.rotation.y);
    if (this.state !== 'hidden') {
      const yf = w.floorAt(p.x + fx * cl * 0.4, p.z + fz * cl * 0.4);
      const yb = w.floorAt(p.x - fx * cl * 0.4, p.z - fz * cl * 0.4);
      o.rotation.x = -Math.atan2(yf - yb, cl * 0.8);
      p.y = (yf + yb) / 2;
      this.front.set(p.x + fx * 1.25, 0, p.z + fz * 1.25);
      this.back.set(p.x - fx * 1.25, 0, p.z - fz * 1.25);
      this.probeT -= dt;
      if (this.probeT <= 0) {
        this.probeT = 0.5;
        updateProbe(this.car, w, p);
      }
    }
    if (this.engine) {
      audio.setPannerPos(this.panner, p.x, p.y + 0.5, p.z);
      this.engine.gn.gain.setTargetAtTime(this.state === 'creep' ? 0.05 + this.speed * 0.02 : 0, this.engine.a.currentTime, 0.4);
      this.engine.osc.frequency.setTargetAtTime(33 + this.speed * 6, this.engine.a.currentTime, 0.4);
    }
  }

  follow(dt) {
    const p = this.object.position;
    while (this.path && this.path.length) {
      const t = this.path[0];
      const dx = t.x - p.x;
      const dz = t.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.3) {
        this.cell = this.path.shift().cell;
        continue;
      }
      const yaw = Math.atan2(dx, dz);
      const diff = Math.atan2(Math.sin(yaw - this.object.rotation.y), Math.cos(yaw - this.object.rotation.y));
      this.object.rotation.y += diff * Math.min(1, dt * 2.5);
      // slow down for corners, like a careful driver
      const s = Math.min(d, this.speed * dt * (Math.abs(diff) > 0.5 ? 0.4 : 1));
      p.x += (dx / d) * s;
      p.z += (dz / d) * s;
      return;
    }
  }

  dispose() {
    if (this.engine) {
      this.engine.osc.stop();
      this.engine.osc.disconnect();
    }
    this.panner?.disconnect();
  }
}

// ---------------------------------------------------------------------------
// Props

// a supermarket trolley that ended up here, as they do
const trolley = {
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
const tyreStack = {
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
const hoseBox = {
  place: 'wall', fp: null,
  build(k) {
    const g = new THREE.Group();
    k.box(g, 0.75, 0.95, 0.2, k.std(0xb81e18, 0.4, 0.3), 0, 0.95, 0.1);
    k.plane(g, 0.56, 0.16, k.tex('g-hose', signTexture('FIRE HOSE', '', { bg: '#b81e18', fg: '#fff', w: 256, h: 72 })), 0, 1.2, 0.202);
    keep(k.sphere(g, 0.05, k.glow(0xff3020, 2.5), 0, 1.53, 0.12, 1, 1, 0.6));
    return g;
  },
};

const missingPoster = {
  place: 'high', fp: null, y: 1.45,
  build(k, rng, o) {
    const g = new THREE.Group();
    const eerie = (o.mood || 0) > 0.85 && rng.chance(0.6);
    k.plane(g, 0.36, 0.5, k.tex(`g-missing:${eerie}`, missingTex(eerie), { roughness: 0.8 }), 0, 0, 0.012, 0, 0, rng.float(-0.05, 0.05));
    return g;
  },
};

const noIdling = {
  place: 'high', fp: null, y: 1.7,
  build(k, rng) {
    const g = new THREE.Group();
    const [a, b] = rng.pick([['NO IDLING', 'Turn off your engine'], ['SPEED LIMIT 8', 'km/h'], ['NO PARKING', 'Fire access'], ['LOCK YOUR CAR', 'Take your valuables'], ['PEDESTRIANS', 'Walk facing traffic']]);
    k.box(g, 0.64, 0.34, 0.02, k.std(0xdedad0, 0.5, 0.2), 0, 0, 0.01);
    k.plane(g, 0.6, 0.3, k.tex(`g-nosign:${a}`, signTexture(a, b, { bg: '#f0ece2', fg: '#1a2a6a', w: 512, h: 256 })), 0, 0, 0.021);
    return g;
  },
};

// ---------------------------------------------------------------------------

export default {
  id: 'garage',
  code: 'LEVEL 6',
  name: 'Parking Level P6',
  sub: 'P6 of P∞',
  tint: 0xffb060,
  assets: {
    textures: ['garage_floor', 'concrete_wall_004', 'painted_metal_shutter'],
    models: ['covered_car', 'concrete_road_barrier', 'old_tyre', 'hand_truck', 'metal_jerrycan', 'power_box_01', 'metal_trash_can', 'WetFloorSign_01', 'security_camera_01', 'utility_box_01', 'trashbag', 'cardboard_box_01', 'metal_office_desk', 'plastic_monobloc_chair_01', 'korean_fire_extinguisher_01'],
    looks: ['valet', ['watcher', { body: 0x16171a, suit: true }], 'cat', 'car:sedan', 'car:kei', 'car:van'],
  },

  build(world) {
    const rng = world.rng;
    const g = (world.grid = new Grid(W, HH, CS, WALL));
    const K = (i, j) => j * W + i;

    // ---- layout ------------------------------------------------------------
    // P6 deck, and the entrance lane off its north-east corner
    g.fillRect(1, 1, 42, 16, FLOOR);
    g.fillRect(43, 2, 46, 4, FLOOR);
    g.fillRect(43, 5, 45, 5, FLOOR);
    // P7, one storey down
    g.fillRect(1, 24, 42, 33, FLOOR);
    g.heightRect(1, 24, 42, 33, P7);
    // two long car ramps down (3 m over seven bays)
    const carRamp = new Set();
    const rr = (P6 - P7) / 7;
    for (const c of [1, 21]) {
      for (let k = 0; k < 7; k++) {
        for (const i of [c, c + 1]) {
          g.set(i, 17 + k, FLOOR);
          g.setRamp(i, 17 + k, 3, P6 - (k + 1) * rr, rr);
          carRamp.add(K(i, 17 + k));
        }
      }
    }
    // and one up to P5, which is full
    for (let k = 0; k < 3; k++) {
      for (const i of [41, 42]) {
        g.set(i, 17 + k, FLOOR);
        g.setRamp(i, 17 + k, 2, k * 0.45, 0.45);
        carRamp.add(K(i, 17 + k));
      }
    }
    g.fillRect(41, 20, 42, 20, FLOOR);
    g.heightRect(41, 20, 42, 20, 1.35);
    // stairwell: a lobby on P6, two steep flights, a landing on P7
    g.set(31, 17, FLOOR);
    g.fillRect(31, 18, 32, 18, FLOOR);
    const stairs = [[31, 19], [31, 20]];
    g.set(31, 19, FLOOR);
    g.setRamp(31, 19, 3, -1.5, 1.5);
    g.set(31, 20, FLOOR);
    g.setRamp(31, 20, 3, P7, 1.5);
    g.fillRect(31, 21, 32, 23, FLOOR);
    g.heightRect(31, 21, 32, 23, P7);
    // the attendants' office and a machine room off the south lane
    g.set(8, 17, FLOOR);
    g.fillRect(6, 18, 10, 20, FLOOR);
    g.set(26, 17, FLOOR);
    g.fillRect(25, 18, 28, 20, FLOOR);

    const sp = { x: 46.3 * CS, z: 3.7 * CS };
    world.spawn = { x: sp.x, z: sp.z, yaw: PI / 2 };
    world.finalizeLayout();

    const isCarRamp = (i, j) => carRamp.has(K(i, j));
    const laneOf = (j) => LANES.find((l) => j === l || j === l + 1);
    const crossOf = (i) => CROSS.find((c) => i === c || i === c + 1);
    const room = (i, j) => (i >= 6 && i <= 10 && j >= 17 && j <= 20) || (i >= 25 && i <= 28 && j >= 17 && j <= 20) || (i >= 31 && i <= 32 && j >= 17 && j <= 23);
    const deckY = (i, j) => g.hgt[K(i, j)];

    // ---- bays ------------------------------------------------------------
    const bays = [];
    for (const row of BAY_ROWS) {
      let n = 1;
      for (const s of SEGS) {
        for (let i = s; i < s + 18; i++, n++) {
          const front = row.lane > 0 ? (row.j + 2) * CS : row.j * CS;
          bays.push({ i, row, n, x: (i + 0.5) * CS, z: (row.j + 1) * CS, front, y: deckY(i, row.j), u: world.unease(i, row.lane > 0 ? row.j + 1 : row.j) });
        }
      }
    }
    // open service shafts in the far bays, more the deeper you drift
    const d = world.distFromSpawn;
    const shafts = [];
    const shaftCands = rng.shuffle(bays.filter((b) => (b.i - (b.i >= 23 ? 23 : 3)) % 2 === 0 && d[K(b.i, b.row.j)] > world.maxDist * 0.55));
    for (const b of shaftCands) {
      if (shafts.length >= 1 + Math.min(3, world.depth)) break;
      if (shafts.some((s) => Math.abs(s.i - b.i) + Math.abs(s.row.j - b.row.j) < 8)) continue;
      shafts.push(b);
    }
    for (const b of shafts) {
      g.fillRect(b.i, b.row.j, b.i + 1, b.row.j + 1, HOLE);
      b.shaft = true;
      bays.find((o) => o.row === b.row && o.i === b.i + 1).shaft = true;
    }

    // ---- shell --------------------------------------------------------------
    const ceilAt = (i, j) => {
      const k = K(i, j);
      return g.hgt[k] + (g.ramp[k] ? Math.max(0, g.rise[k]) : 0) + H;
    };
    const wallMat = photo('concrete_wall_004', { uvScale: 2, color: 0xb4ada2 });
    const ceilMat = photo('concrete_wall_004', { uvScale: 2, color: 0x8c877e, normalScale: 0.7 });
    const floorMat = photo('garage_floor', { uvScale: 2, color: 0xa29c92, roughness: 0.9 });
    const stripe = (key, rgb) => pbr(paint(key, rgb, { rough: 0.55, grain: 0.1 }));
    buildShell(world, {
      height: H,
      ceil: ceilAt,
      wall: { mat: wallMat, u: 2, v: 2 },
      trims: [
        { mat: stripe('s-garage-skirt', [44, 46, 48]), y0: 0, y1: 0.12, inset: 0.012 },
        { mat: stripe('s-garage-band', [214, 132, 38]), y0: 1.0, y1: 1.28, inset: 0.012 },
      ],
    });
    world.ceilAt = ceilAt;
    const solidish = (c) => c === WALL || c === VOID;
    mesh(world, buildCellQuads(g, (c) => !solidish(c) && c !== HOLE, (i, j) => g.hgt[K(i, j)], true, 2), floorMat);
    const risers = buildRisers(g, { pred: (c) => !solidish(c), uScale: 2, vScale: 2 });
    if (risers.attributes.position.count) mesh(world, risers, wallMat);
    const rampCells = [...carRamp].map((k) => [k % W, (k / W) | 0]);
    const [slopeF, slopeC] = slopeGeos(g, rampCells, 2);
    mesh(world, slopeF, floorMat);
    mesh(world, slopeC, ceilMat);
    mesh(world, curbGeo(g, rampCells), new THREE.MeshStandardMaterial({ map: hazardTex(), roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -1 }));
    mesh(world, stairGeo(g, stairs), photo('concrete_wall_004', { uvScale: 1.5, color: 0x9c968c }));
    mesh(world, buildCellQuads(g, (c, i, j) => !solidish(c) && !isCarRamp(i, j), ceilAt, false, 2), ceilMat);
    const drops = buildRisers(g, { pred: (c, i, j) => !solidish(c) && !isCarRamp(i, j), ceil: ceilAt, uScale: 2, vScale: 2 });
    if (drops.attributes.position.count) mesh(world, drops, ceilMat);

    const kit = new PropKit(world);
    const M = {
      concrete: kit.mat('concrete', () => photo('concrete_wall_004', { uvScale: 2, color: 0xa8a298 })),
      beam: kit.mat('beam', () => photo('concrete_wall_004', { uvScale: 2, color: 0x8f8a80 })),
      hazard: kit.mat('hazard', () => new THREE.MeshStandardMaterial({ map: hazardTex(), roughness: 0.7 })),
      line: kit.mat('line', () => new THREE.MeshStandardMaterial({ map: lineTex(), alphaTest: 0.4, color: 0xdedbd2, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })),
      yline: kit.mat('yline', () => new THREE.MeshStandardMaterial({ map: lineTex(), alphaTest: 0.4, color: 0xd8a820, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })),
      nums: kit.mat('nums', () => new THREE.MeshStandardMaterial({ map: numAtlas(), alphaTest: 0.4, color: 0xdedbd2, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })),
      arrow: kit.mat('arrow', () => new THREE.MeshStandardMaterial({ map: arrowTex(), alphaTest: 0.4, color: 0xdedbd2, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })),
      oil: kit.mat('oil', () => new THREE.MeshStandardMaterial({ map: oilTex(), transparent: true, depthWrite: false, roughness: 0.12, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })),
      track: kit.mat('track', () => new THREE.MeshStandardMaterial({ map: trackTex(), transparent: true, opacity: 0.4, depthWrite: false, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })),
      zone: kit.mat('zone', () => new THREE.MeshStandardMaterial({ map: zoneAtlas(), roughness: 0.65 })),
      stop: kit.std(0x8a857c, 0.9),
      stopY: kit.std(0xc8a020, 0.7),
      red: kit.std(0x8e1a14, 0.45, 0.2),
      grey: kit.std(0x6e7072, 0.5, 0.35),
      yellow: kit.std(0xc4a024, 0.5, 0.2),
      duct: kit.std(0xa2a7ac, 0.42, 0.85),
      steel: kit.std(0x505458, 0.45, 0.7),
      dark: kit.std(0x2a2c2e, 0.6, 0.3),
    };
    const floorPaint = (text, color = '#fff') => kit.mat(`ft:${text}:${color}`, () => new THREE.MeshStandardMaterial({ map: floorText(text, color), alphaTest: 0.4, roughness: 0.6, color: 0xdedbd2, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    const decals = new THREE.Group();

    // ---- pillars, beams, services -------------------------------------------
    const pillarX = [];
    for (const s of SEGS) for (let k = 0; k <= 6; k++) pillarX.push(s + 3 * k);
    for (const row of BAY_ROWS) {
      const front = row.lane > 0 ? (row.j + 2) * CS : row.j * CS;
      const z = front - row.lane * 0.45;
      for (const i of pillarX) {
        const y = deckY(i, row.j);
        if (g.get(i, row.j) === HOLE || g.get(i - 1, row.j) === HOLE) continue;
        const p = new THREE.Group();
        const off = [rng.float(0, 5), rng.float(0, 5)];
        kit.mesh(p, mBox(0.6, H, 0.6, { segs: [1, 6, 1], off }), M.concrete, 0, H / 2, 0);
        kit.mesh(p, mBox(0.62, 0.9, 0.62, { s: 0.7 }), M.hazard, 0, 0.45, 0);
        for (let s = 0; s < 4; s++) {
          const a = (s * PI) / 2;
          kit.mesh(p, wallGeo(0.46, 0.575, zoneUV(row.zone)), M.zone, Math.sin(a) * 0.311, 1.72, Math.cos(a) * 0.311, 0, a, 0);
        }
        kit.add(p, i * CS, z, 0, { y, collide: [0.62, 0.62] });
        // the odd poster taped to a pillar
        if (rng.chance(0.08)) {
          const u = world.unease(i, row.j);
          const post = missingPoster.build(kit, rng, { mood: u });
          const a = rng.pick([0, PI / 2, PI, -PI / 2]);
          kit.add(post, i * CS + Math.sin(a) * 0.3, z + Math.cos(a) * 0.3, a, { y: y + 1.2 });
        }
      }
    }
    // downstand beams and services under each deck's slab
    for (const [z0, z1, y] of [[1 * CS, 17 * CS, P6], [24 * CS, 34 * CS, P7]]) {
      const len = z1 - z0;
      for (const i of pillarX) kit.mesh(decals, mBox(0.5, 0.5, len, { segs: [1, 1, Math.ceil(len / 1.2)] }), M.beam, i * CS, y + H - 0.25, (z0 + z1) / 2);
      for (const row of BAY_ROWS) {
        if (deckY(3, row.j) !== y) continue;
        const front = row.lane > 0 ? (row.j + 2) * CS : row.j * CS;
        const xl = 42 * CS;
        kit.mesh(decals, mBox(xl, 0.4, 0.4, { segs: [Math.ceil(xl / 1.2), 1, 1] }), M.beam, 1 * CS + xl / 2, y + H - 0.2, front - row.lane * 0.45);
      }
      // pipes along the lanes: sprinkler main (red), drain (grey), gas (yellow)
      for (const L of LANES) {
        if (deckY(3, L) !== y) continue;
        const zc = (L + 1) * CS;
        const x0 = 1 * CS + 0.2;
        const len = 42 * CS - 0.4;
        // (they run through the downstand beams, as they do)
        kit.mesh(decals, pipeGeo(0.055, len), M.red, x0 + len / 2, y + H - 0.2, zc - 1.9);
        kit.mesh(decals, pipeGeo(0.08, len), M.grey, x0 + len / 2, y + H - 0.24, zc + 2.1);
        kit.mesh(decals, pipeGeo(0.03, len), M.yellow, x0 + len / 2, y + H - 0.12, zc + 2.35);
        for (let x = x0 + 1; x < x0 + len; x += 3) {
          kit.cyl(decals, 0.01, 0.01, 0.16, M.steel, x, y + H - 0.08, zc - 1.9, 0, 0, 0, 5);
          kit.cyl(decals, 0.014, 0.02, 0.07, M.red, x + 1.5, y + H - 0.28, zc - 1.9, 0, 0, 0, 6);
        }
      }
      // a big ventilation duct over each back-to-back double row
      for (const jb of y === P6 ? [7, 13] : [28]) {
        const zc = jb * CS;
        const x0 = 3 * CS;
        const len = 38 * CS;
        kit.mesh(decals, mBox(len, 0.4, 0.9, { segs: [Math.ceil(len / 1.2), 1, 1] }), M.duct, x0 + len / 2, y + H - 0.72, zc);
        for (let x = x0 + 2; x < x0 + len; x += 6) kit.box(decals, 0.4, 0.05, 0.5, M.dark, x, y + H - 0.94, zc);
      }
    }

    // ---- floor markings ---------------------------------------------------------
    for (const row of BAY_ROWS) {
      const y = deckY(3, row.j) + 0.004;
      const zc = (row.j + 1) * CS;
      for (const s of SEGS) {
        for (let i = s; i <= s + 18; i++) {
          if (g.get(i, row.j) === HOLE && g.get(i - 1, row.j) === HOLE) continue;
          kit.mesh(decals, flatGeo(0.12, 2 * CS - 0.3, null, 1, 8), M.line, i * CS, y, zc - row.lane * 0.1);
        }
      }
    }
    for (const b of bays) {
      if (b.shaft) continue;
      const yaw = b.row.lane > 0 ? 0 : PI;
      kit.mesh(decals, flatGeo(1.0, 0.5, numUV(b.row.zone, b.n), 2, 1), M.nums, b.x, b.y + 0.005, b.front - b.row.lane * 0.55, 0, yaw, 0);
      // wheel stops
      const back = b.front - b.row.lane * 2 * CS;
      kit.mesh(decals, mBox(1.5, 0.12, 0.16, { s: 1 }), rng.chance(0.3) ? M.stopY : M.stop, b.x, b.y + 0.06, back + b.row.lane * 0.65);
      if (rng.chance(0.7)) {
        const v = rng.int(0, 2);
        const sz = rng.float(0.9, 1.7);
        kit.mesh(decals, flatGeo(sz, sz * rng.float(0.7, 1.2), [v / 3, 0, (v + 1) / 3, 1], 2, 2), M.oil, b.x + rng.float(-0.4, 0.4), b.y + 0.003, b.z + rng.float(-1.2, 1.2), 0, rng.float(0, PI * 2), 0);
      }
    }
    // lanes: worn wheel tracks and one-way arrows
    const laneDir = { 3: -1, 9: 1, 15: -1, 24: 1, 30: -1 };
    for (const L of LANES) {
      const y = deckY(3, L) + 0.002;
      const zc = (L + 1) * CS;
      for (const off of [-0.8, 0.8]) kit.mesh(decals, flatGeo(42 * CS, 0.6, [0, 0, 42, 1], 60, 1), M.track, 22 * CS, y, zc + off);
      for (let x = 6; x < 42; x += 7) kit.mesh(decals, flatGeo(0.9, 2.2, null, 1, 3), M.arrow, (x + 0.5) * CS, y + 0.002, zc, 0, laneDir[L] > 0 ? -PI / 2 : PI / 2, 0);
    }
    for (const c of CROSS) {
      const xc = (c + 1) * CS;
      for (const [j0, j1] of [[1, 16], [24, 33]]) {
        for (let j = j0 + 2; j < j1; j += 6) kit.mesh(decals, flatGeo(0.9, 2.2, null, 1, 3), M.arrow, xc, deckY(c, j) + 0.004, (j + 0.5) * CS, 0, c === 41 ? 0 : PI, 0);
      }
    }
    // SLOW at the ramp heads, a stop line before the barrier
    for (const c of [1, 21]) {
      kit.mesh(decals, flatGeo(2.4, 1.2, null, 2, 1), floorPaint('SLOW'), (c + 1) * CS, 0.006, 15.6 * CS, 0, PI, 0);
      kit.mesh(decals, flatGeo(2.4, 1.2, null, 2, 1), floorPaint('P7', '#f0c030'), (c + 1) * CS, P7 + 0.006, 25.2 * CS, 0, PI, 0);
    }
    kit.mesh(decals, flatGeo(2.4, 1.2, null, 2, 1), floorPaint('P5'), 42 * CS, 0.006, 15.6 * CS, 0, PI, 0);
    kit.mesh(decals, flatGeo(0.3, 2 * CS, null, 1, 4), M.line, 42.7 * CS, 0.005, 4 * CS);
    kit.mesh(decals, flatGeo(2.2, 1.1, null, 2, 1), floorPaint('STOP'), 43.9 * CS, 0.006, 3.5 * CS, 0, PI / 2, 0);
    // yellow hatching in front of the service doors
    for (const [i, j] of [[8, 16], [26, 16], [31, 16]]) {
      for (let k = -3; k <= 3; k++) kit.mesh(decals, flatGeo(0.1, 1.9, null, 1, 2), M.yline, (i + 0.5) * CS + k * 0.35, 0.005, (j + 0.55) * CS, 0, PI / 4, 0);
    }
    kit.add(decals, 0, 0, 0);

    // ---- which bays get cars --------------------------------------------------
    const blocked = new Set();
    const cars = [];
    const parked = [];
    for (const b of bays) {
      if (b.shaft) continue;
      // emptier the further (and deeper) you go
      if (!rng.chance(Math.max(0.1, 0.46 - b.u * 0.36))) continue;
      blocked.add(K(b.i, b.row.j));
      blocked.add(K(b.i, b.row.j + 1));
      const noseIn = rng.chance(0.6);
      const yaw = (noseIn === b.row.lane > 0 ? PI : 0) + rng.float(-0.05, 0.05);
      const x = b.x + rng.float(-0.12, 0.12);
      const z = b.z - b.row.lane * rng.float(0.1, 0.3);
      if (rng.chance(0.07)) {
        // someone's pride and joy, under a cover
        const s = modelSize('covered_car');
        const grp = new THREE.Group();
        kit.model(grp, 'covered_car', 0, 0, 0, 0, 4.4 / Math.max(s.z, 0.1));
        kit.add(grp, x, z, yaw, { y: b.y });
        world.addFootprint(x, z, s.x * (4.4 / s.z) - 0.05, 4.3, yaw);
        cars.push({ covered: true, x, z, y: b.y, bay: b });
        continue;
      }
      parked.push({ b, x, z, yaw });
    }
    let pastel = false;
    for (const { b, x, z, yaw } of parked) {
      const kind = rng.pick(['sedan', 'sedan', 'sedan', 'kei', 'kei', 'van']);
      // at least one little pastel kei car near the entrance
      const paintHex = kind === 'kei' && !pastel ? rng.pick(PASTELS) : pickPaint(rng, kind);
      if (PASTELS.includes(paintHex)) pastel = true;
      const sculpt = carModel(kind, paintHex);
      sculpt.children[0].userData.noBake = true;
      const root = new THREE.Group();
      root.add(sculpt);
      root.position.set(x, b.y, z);
      root.rotation.y = yaw;
      // only the cars around the spawn start sculpted (the rest swap in as you approach)
      sculpt.visible = Math.hypot(x - sp.x, z - sp.z) < 17;
      world.root.add(root);
      const size = sculpt.userData.size;
      world.addFootprint(x, z, size[0] - 0.05, size[1] - 0.1, yaw);
      cars.push({ group: root, sculpt, size, rig: lightRig(root, size), kind, paint: paintHex, x, z, y: b.y, yaw, bay: b, locker: rng.chance(0.4) });
    }
    const proxyPaint = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.15 });
    const proxyDark = new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.25, metalness: 0.2 });
    const pcol = new THREE.Color();
    for (const kind of ['sedan', 'kei', 'van']) {
      const list = cars.filter((c) => c.kind === kind);
      if (!list.length) continue;
      const [pg, dg] = proxyGeo(kind);
      const pm = new THREE.InstancedMesh(pg, proxyPaint, list.length);
      const dm = new THREE.InstancedMesh(dg, proxyDark, list.length);
      pm.frustumCulled = dm.frustumCulled = false;
      list.forEach((c, n) => {
        c.group.updateMatrix();
        const m = c.group.matrix.clone();
        c.proxyShown = !c.sculpt.visible;
        pm.setMatrixAt(n, c.proxyShown ? m : ZERO);
        dm.setMatrixAt(n, c.proxyShown ? m : ZERO);
        pm.setColorAt(n, pcol.set(c.paint));
        c.proxy = { pm, dm, n, m };
      });
      world.root.add(pm, dm);
    }
    // one of them has opinions about rhythm
    const honkers = cars.filter((c) => c.rig && d[K(c.bay.i, c.bay.row.j)] > 4 && d[K(c.bay.i, c.bay.row.j)] < 22);
    if (honkers.length) rng.pick(honkers).honker = true;
    for (const c of cars) {
      world.interactables.push({
        pos: new THREE.Vector3(c.x, c.y, c.z),
        aimHeight: 0.9,
        interactRange: 3.0,
        prompt: c.covered ? 'Look under the cover' : 'Look inside',
        interact: (game) => carPark.lookInside(c, game),
      });
    }
    const carPark = world.add(new CarPark(world, cars));

    // ---- empty bays: the things that end up in car parks ---------------------------
    const Mdl = {
      barrier: P.modelProp('concrete_road_barrier'),
      truck: P.modelProp('hand_truck', { jitter: 0.4 }),
      can: P.modelProp('metal_jerrycan', { jitter: 3 }),
      bin: P.modelProp('metal_trash_can', { scale: 0.9 }),
      bag: P.modelProp('trashbag', { jitter: 3 }),
      box: P.modelProp('cardboard_box_01', { jitter: 0.5, scaleJitter: 0.15 }),
      sign: P.modelProp('WetFloorSign_01', { jitter: 3 }),
      chair: P.modelProp('plastic_monobloc_chair_01'),
    };
    const EMPTY = [
      { w: 4, f: null, max: 0.7 },
      { w: 1.5, f: null },
      { w: 1.2, f: 'cones' },
      { w: 0.5, f: 'wet' },
      { w: 0.25, f: 'barrier' },
      { w: 0.6, f: 'tyres', min: 0.15 },
      { w: 0.4, f: 'truck', min: 0.2 },
      { w: 0.12, f: 'cans', min: 0.1 },
      { w: 0.5, f: 'trolley', min: 0.3 },
      { w: 0.6, f: 'rubbish', min: 0.35 },
      { w: 0.3, f: 'bin' },
      { w: 0.5, f: 'chair', min: 0.8 },
      { w: 0.4, f: 'coneCar', min: 0.9 },
      { w: 0.4, f: 'shoes', min: 0.7 },
    ];
    const puddles = [];
    // scanned props are dense meshes: cap the heaviest ones
    const caps = { barrier: 3, cans: 3, tyres: 6 };
    for (const b of bays) {
      if (b.shaft || blocked.has(K(b.i, b.row.j))) continue;
      const opts = EMPTY.filter((e) => b.u >= (e.min ?? -1) && b.u <= (e.max ?? 9) && (caps[e.f] ?? 1) > 0);
      const tot = opts.reduce((s, e) => s + e.w, 0);
      let r = rng.next() * tot;
      const e = opts.find((o) => (r -= o.w) <= 0) || opts[0];
      if (!e.f) continue;
      if (caps[e.f]) caps[e.f]--;
      blocked.add(K(b.i, b.row.j));
      blocked.add(K(b.i, b.row.j + 1));
      const inward = -b.row.lane;
      const at = (along, side = 0) => [b.x + side, b.front + inward * along];
      const yawIn = b.row.lane > 0 ? 0 : PI;
      const u = b.u;
      if (e.f === 'cones') {
        for (let n = rng.int(1, 3); n > 0; n--) {
          const [x, z] = at(rng.float(0.5, 2.5), rng.float(-0.8, 0.8));
          const c = P.trafficCone.build(kit, rng);
          if (rng.chance(0.15 + u * 0.3)) kit.add(c, x, z, rng.float(0, 6), { y: b.y + 0.12, rz: PI / 2 - 0.15 });
          else kit.add(c, x, z, 0, { y: b.y });
        }
      } else if (e.f === 'wet') {
        const [x, z] = at(rng.float(1.5, 3.5));
        kit.add(P.puddle.build(kit, rng), x, z, rng.float(0, 6), { y: b.y });
        kit.add(Mdl.sign.build(kit, rng), x + 0.6, z, rng.float(0, 6), { y: b.y, collide: [0.4, 0.4] });
        puddles.push([x, z, 0.9]);
      } else if (e.f === 'barrier') {
        const [x, z] = at(0.9);
        kit.add(Mdl.barrier.build(kit, rng), x, z, rng.float(-0.08, 0.08), { y: b.y, collide: Mdl.barrier.fp });
      } else if (e.f === 'tyres') {
        for (let n = rng.int(1, 2); n > 0; n--) {
          const [x, z] = at(rng.float(3.2, 4.4), rng.float(-0.6, 0.6));
          kit.add(tyreStack.build(kit, rng), x, z, 0, { y: b.y, collide: [0.6, 0.6] });
        }
      } else if (e.f === 'truck') {
        const [x, z] = at(4.3, rng.float(-0.5, 0.5));
        kit.add(Mdl.truck.build(kit, rng), x, z, yawIn + PI, { y: b.y, collide: [0.6, 0.6] });
      } else if (e.f === 'cans') {
        for (let n = 1; n > 0; n--) {
          const [x, z] = at(rng.float(3.5, 4.5), rng.float(-0.8, 0.8));
          kit.add(Mdl.can.build(kit, rng), x, z, rng.float(0, 6), { y: b.y });
        }
      } else if (e.f === 'trolley') {
        const [x, z] = at(rng.float(1.2, 3.5), rng.float(-0.4, 0.4));
        kit.add(trolley.build(kit, rng), x, z, rng.float(0, 6), { y: b.y, collide: [0.7, 0.7] });
      } else if (e.f === 'rubbish') {
        const [x, z] = at(4.1, rng.float(-0.6, 0.6));
        kit.add(Mdl.bag.build(kit, rng), x, z, rng.float(0, 6), { y: b.y });
        if (rng.chance(0.4)) kit.add(Mdl.box.build(kit, rng), x + rng.float(-0.8, 0.8), z + inward * -0.3, rng.float(0, 6), { y: b.y, collide: [0.5, 0.5] });
        if (rng.chance(0.5)) kit.add(P.paperScatter.build(kit, rng), x, z - inward * 1.5, rng.float(0, 6), { y: b.y });
      } else if (e.f === 'bin') {
        const [x, z] = at(4.3);
        kit.add(Mdl.bin.build(kit, rng), x, z, yawIn + PI, { y: b.y, collide: [0.6, 0.6] });
      } else if (e.f === 'chair') {
        // a chair in an empty bay, facing the wall
        const [x, z] = at(3.2);
        kit.add(Mdl.chair.build(kit, rng), x, z, yawIn, { y: b.y, collide: [0.5, 0.5] });
      } else if (e.f === 'coneCar') {
        // cones marking out exactly where a car used to be
        for (const [sx, sz] of [[-0.85, 0.3], [0.85, 0.3], [-0.85, 4.6], [0.85, 4.6], [-0.9, 2.45], [0.9, 2.45]]) {
          const [x, z] = at(sz, sx);
          kit.add(P.trafficCone.build(kit, rng), x, z, 0, { y: b.y });
        }
      } else if (e.f === 'shoes') {
        // a pair of shoes, neatly placed, where the driver's door would be
        const [x, z] = at(2.2, 1.0);
        kit.add(P.lostShoe.build(kit, rng), x - 0.1, z, yawIn, { y: b.y });
        kit.add(P.lostShoe.build(kit, rng), x + 0.1, z, yawIn, { y: b.y });
      }
    }
    // puddles under the drain pipes
    for (const L of LANES) {
      for (let n = 0; n < 3; n++) {
        const i = rng.int(3, 40);
        if (!rng.chance(0.4 + world.unease(i, L) * 0.4)) continue;
        const x = (i + 0.5) * CS;
        const z = (L + 1) * CS + 1.5 + rng.float(-0.4, 0.4);
        kit.add(P.puddle.build(kit, rng), x, z, rng.float(0, 6), { y: deckY(i, L) });
        puddles.push([x, z, 0.9]);
      }
    }

    // ---- shafts, chained off ----------------------------------------------------
    const chainMat = kit.std(0xd8c020, 0.5, 0.3);
    for (const b of shafts) {
      const x0 = b.i * CS - 0.25;
      const x1 = (b.i + 2) * CS + 0.25;
      const z0 = b.row.j * CS - 0.25;
      const z1 = (b.row.j + 2) * CS + 0.25;
      const pts = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
      const grp = new THREE.Group();
      for (let k = 0; k < 4; k++) {
        const [ax, az] = pts[k];
        const [bx, bz] = pts[(k + 1) % 4];
        for (let s = 0; s <= 2; s++) {
          const px = ax + ((bx - ax) * s) / 2;
          const pz = az + ((bz - az) * s) / 2;
          kit.mesh(grp, mBox(0.1, 0.9, 0.1, { s: 0.6 }), M.hazard, px, 0.45, pz);
          kit.cyl(grp, 0.12, 0.14, 0.05, M.dark, px, 0.025, pz);
        }
        // sagging chain between posts
        for (let s = 0; s < 2; s++) {
          const sx = ax + ((bx - ax) * s) / 2;
          const sz = az + ((bz - az) * s) / 2;
          const ex = ax + ((bx - ax) * (s + 1)) / 2;
          const ez = az + ((bz - az) * (s + 1)) / 2;
          const n = 10;
          for (let q = 0; q < n; q++) {
            const t0 = q / n;
            const t1 = (q + 1) / n;
            const y0 = 0.82 - Math.sin(t0 * PI) * 0.25;
            const y1 = 0.82 - Math.sin(t1 * PI) * 0.25;
            const cx = sx + (ex - sx) * (t0 + t1) / 2;
            const cz = sz + (ez - sz) * (t0 + t1) / 2;
            const len = Math.hypot((ex - sx) / n, (ez - sz) / n, y1 - y0);
            const m = kit.cyl(grp, 0.015, 0.015, len, chainMat, cx, (y0 + y1) / 2, cz, 0, 0, 0, 5);
            m.lookAt(new THREE.Vector3(sx + (ex - sx) * t1, y1, sz + (ez - sz) * t1));
            m.rotateX(PI / 2);
          }
        }
      }
      kit.add(grp, 0, 0, 0, { y: b.y });
      // a warning sign on the nearest pillar side
      const sign = new THREE.Group();
      kit.plane(sign, 0.6, 0.3, kit.tex('g-shaftsign', signTexture('DANGER', 'Open shaft. Do not lean.', { bg: '#e0b21c', fg: '#141414', w: 512, h: 256 })), 0, 0, 0);
      kit.add(sign, (b.i + 1) * CS, b.front + b.row.lane * 0.26, b.row.lane > 0 ? 0 : PI, { y: b.y + 0.6 });
    }

    // ---- entrance: barrier gate, booth, ticket machine, shutter --------------------
    const bx = 44.5 * CS;
    const bz = 5.55 * CS;
    const island = new THREE.Group();
    kit.mesh(island, mBox(7.4, 0.15, 2.4, { s: 1.5 }), M.concrete, 0, 0.075, 0);
    kit.mesh(island, mBox(7.44, 0.152, 0.08, { s: 0.7 }), M.hazard, 0, 0.076, -1.2);
    kit.add(island, 44.45 * CS, 5.5 * CS, 0, { collide: [7.4, 2.4] });
    // the booth: white panels below, glass above, a lamp and a little TV inside
    const booth = new THREE.Group();
    const white = kit.std(0x9c9a92, 0.5, 0.2);
    const glass = kit.mat('glass', () => new THREE.MeshStandardMaterial({ color: 0x6a8088, roughness: 0.04, metalness: 0.4, transparent: true, opacity: 0.22, depthWrite: false }));
    const frame = kit.std(0x3a3c3e, 0.4, 0.6);
    const BW = 1.9;
    for (const [x, z, ry] of [[0, -BW / 2, 0], [0, BW / 2, 0], [-BW / 2, 0, PI / 2], [BW / 2, 0, PI / 2]]) {
      kit.box(booth, BW, 0.95, 0.06, white, x, 0.475, z, 0, ry, 0);
      const door = z > 0 && ry === 0;
      if (!door) kit.box(booth, BW - 0.1, 1.2, 0.02, glass, x, 1.55, z, 0, ry, 0);
    }
    for (const x of [-1, 1]) for (const z of [-1, 1]) kit.box(booth, 0.07, 2.3, 0.07, frame, (x * BW) / 2, 1.15, (z * BW) / 2);
    kit.box(booth, BW + 0.3, 0.14, BW + 0.3, white, 0, 2.37, 0);
    kit.box(booth, BW + 0.32, 0.05, BW + 0.32, frame, 0, 2.3, 0);
    kit.box(booth, BW - 0.1, 0.05, 0.4, kit.std(0x6a5a44, 0.6), 0, 0.95, -0.72);
    // lightbox on the roof
    const payTex = signTexture('ATTENDANT', 'Pay here · 24 h', { bg: '#1f4a78', fg: '#fff', w: 512, h: 128 });
    const payMat = kit.mat('paysign', () => new THREE.MeshStandardMaterial({ map: payTex, emissiveMap: payTex, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.4 }));
    kit.box(booth, 1.3, 0.3, 0.1, frame, 0, 1.98, -BW / 2 - 0.07);
    keep(kit.plane(booth, 1.24, 0.26, payMat, 0, 1.98, -BW / 2 - 0.121, 0, PI, 0)).userData.noBake = true;
    // window frames, a sliding pay hatch and a rubber mat
    for (const y of [0.97, 2.15]) kit.box(booth, BW + 0.02, 0.05, BW + 0.02, frame, 0, y, 0);
    kit.box(booth, 0.03, 1.2, 0.07, frame, 0, 1.55, -BW / 2);
    kit.box(booth, 0.5, 0.04, 0.3, frame, 0.3, 0.98, -BW / 2 - 0.1);
    kit.box(booth, BW - 0.06, 0.02, 0.4, kit.std(0x1a1a1a, 0.9), 0, 0.02, -BW / 2 - 0.3);
    const lampShade = kit.cyl(booth, 0.05, 0.1, 0.1, kit.glow(0xffc070, 2.2), 0.55, 1.2, -0.7);
    keep(lampShade);
    const tv = kit.plane(booth, 0.26, 0.2, new THREE.MeshBasicMaterial({ map: screenStatic(3), color: new THREE.Color(0.9, 1.1, 1.0) }), -0.55, 1.13, -0.62, -0.2, PI, 0);
    keep(tv).userData.noBake = true;
    kit.box(booth, 0.32, 0.26, 0.26, kit.std(0x2a2a2a, 0.6), -0.55, 1.1, -0.76);
    kit.add(booth, bx, bz, 0, { y: 0.15, collide: [BW + 0.1, BW + 0.1] });
    world.bakeSources.push({ pos: new THREE.Vector3(bx, 1.9, bz), color: new THREE.Color(1, 0.8, 0.55), intensity: 2.5 });
    const boothGlow = glow(0xffc070, 3.2, 0.12);
    boothGlow.position.set(bx, 1.5, bz);
    world.root.add(boothGlow);

    // barrier gate: the arm lifts for anyone, and leads nowhere in particular
    const gx = 43.2 * CS;
    const gz = 5.08 * CS;
    const gate = new THREE.Group();
    kit.mesh(gate, mBox(0.36, 1.05, 0.36, { s: 0.7 }), M.hazard, 0, 0.525, 0);
    kit.box(gate, 0.4, 0.12, 0.4, M.dark, 0, 1.1, 0);
    kit.add(gate, gx, gz, 0, { y: 0.15 });
    const armPivot = new THREE.Group();
    armPivot.position.set(gx, 1.12, gz);
    const armMat = new THREE.MeshStandardMaterial({ map: armTex(), roughness: 0.5 });
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 4.8), armMat);
    arm.position.set(0, 0, -2.45);
    armPivot.add(arm);
    const tipLamp = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    tipLamp.position.set(0, 0.07, -4.8);
    armPivot.add(tipLamp);
    world.root.add(armPivot);
    let armA = 0;
    let armUp = false;
    let gatePanner = null;

    // ticket machine on the driver's side
    const tm = new THREE.Group();
    kit.box(tm, 0.5, 1.25, 0.42, kit.std(0x2e5a8a, 0.4, 0.4), 0, 0.625, 0);
    kit.box(tm, 0.52, 0.06, 0.44, frame, 0, 1.28, 0);
    const tkt = signTexture('TICKET', 'Press the button', { bg: '#0e1a24', fg: '#9fe0ff', w: 256, h: 128 });
    kit.plane(tm, 0.36, 0.2, kit.tex('g-ticket', tkt, { emissiveMap: tkt, emissive: 0xffffff, emissiveIntensity: 0.8 }), 0, 1.02, 0.212);
    keep(kit.sphere(tm, 0.035, kit.glow(0x40ff80, 2), 0.12, 0.78, 0.21));
    kit.box(tm, 0.16, 0.02, 0.03, M.dark, -0.06, 0.72, 0.22);
    kit.add(tm, 44.2 * CS, 2.35 * CS, 0, { collide: [0.5, 0.45] });
    const TICKETS = [
      ['(Beep. A ticket slides out.)', '(ENTERED: 03:00. The clock on the machine also says 03:00.)'],
      ['(Beep. Another ticket. ENTERED: 03:00.)', '(You have now entered twice, without leaving once.)'],
      ['(Beep. A ticket. On the back, in pencil: “P6”.)'],
      ['(The machine is out of tickets. The little screen says PLEASE WAIT.)', '(You wait. It is 03:00.)'],
    ];
    let tickets = 0;
    world.interactables.push({
      pos: new THREE.Vector3(44.2 * CS, 0, 2.35 * CS + 0.2), aimHeight: 0.9, interactRange: 2.2, prompt: 'Press the button',
      interact: (game) => {
        game.audio.beep(null, 1.1, 1);
        game.openDialog('the ticket machine', TICKETS[Math.min(tickets++, TICKETS.length - 1)], 1.3);
      },
    });
    // availability board on the entrance wall
    const board = new THREE.Group();
    kit.box(board, 1.3, 0.72, 0.1, frame, 0, 0, 0.05);
    kit.plane(board, 1.2, 0.6, new THREE.MeshBasicMaterial({ map: boardTex(world.depth >= 3), color: new THREE.Color(1.3, 1.3, 1.3) }), 0, 0, 0.101);
    kit.add(board, 45.3 * CS, 2 * CS, 0, { y: 1.85 });
    // the way in is shuttered: a slit of cold street light underneath
    const shutter = new THREE.Group();
    const shutMat = photo('painted_metal_shutter', { uvScale: 1.5, color: 0x8a9096, metalness: 0.5, roughness: 0.6 });
    const sg = new THREE.PlaneGeometry(2 * CS, 2.55);
    remapUV(sg, [0, 0, (2 * CS) / 1.5, 2.55 / 1.5]);
    kit.mesh(shutter, sg, shutMat, 0, 1.3, 0.03);
    kit.box(shutter, 2 * CS + 0.3, 0.25, 0.3, frame, 0, 2.6, 0.15);
    const slit = kit.plane(shutter, 2 * CS - 0.1, 0.03, kit.glow(0x9fb8d8, 1.6), 0, 0.02, 0.05);
    keep(slit);
    kit.plane(shutter, 1.6, 0.4, kit.tex('g-closed', signTexture('CLOSED', 'Open 00:00 – 00:00', { bg: '#f0ece2', fg: '#8a1a14', w: 512, h: 128 })), 0, 1.5, 0.05);
    kit.add(shutter, 47 * CS - 0.02, 3.95 * CS, -PI / 2);
    const street = new THREE.Mesh(flatGeo(1.4, 2 * CS), new THREE.MeshBasicMaterial({ map: glowSprite(), color: new THREE.Color(0.12, 0.16, 0.22), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    street.position.set(47 * CS - 0.6, 0.01, 3.95 * CS);
    street.userData.noBake = true;
    world.root.add(street);

    // ---- doorways, rooms --------------------------------------------------------
    const used = (world.usedMounts = new Set());
    for (const m of wallMounts(g)) {
      if ((m.j === 17 && [8, 26, 31].includes(m.i)) || (m.i >= 43 && m.j <= 5) || (m.i >= 41 && m.j === 20)) used.add(`${m.i},${m.j},${m.nx},${m.nz}`);
    }
    const doorway = (i, j, open = 0.9) => {
      // a steel door set in a wall that fills the rest of the cell
      const x = (i + 0.5) * CS;
      const z = (j + 1) * CS;
      const grp = new THREE.Group();
      const side = (CS - 1.0) / 2;
      for (const s of [-1, 1]) kit.mesh(grp, mBox(side, H, 0.2, { off: [s, 0] }), M.concrete, s * (0.5 + side / 2), H / 2, 0);
      kit.mesh(grp, mBox(1.0, H - 2.1, 0.2), M.concrete, 0, 2.1 + (H - 2.1) / 2, 0);
      for (const s of [-1, 1]) kit.box(grp, 0.06, 2.1, 0.24, frame, s * 0.53, 1.05, 0);
      kit.box(grp, 1.12, 0.06, 0.24, frame, 0, 2.13, 0);
      const leaf = kit.box(grp, 0.96, 2.06, 0.05, kit.std(0x6a7074, 0.45, 0.5), 0, 1.03, 0);
      leaf.position.set(-0.48 + Math.cos(open * 1.4) * 0.48, 1.03, Math.sin(open * 1.4) * 0.48 + 0.1);
      leaf.rotation.y = -open * 1.4;
      kit.add(grp, x, z, 0);
      world.addBox(x - CS / 2, z - 0.1, x - 0.5, z + 0.1);
      world.addBox(x + 0.5, z - 0.1, x + CS / 2, z + 0.1);
      return grp;
    };
    doorway(8, 16);
    doorway(26, 16, 0.6);
    doorway(31, 16, 1.0);
    // green running-man signs over the stairwell
    const exitMat = kit.mat('exit', () => new THREE.MeshStandardMaterial({ map: exitSign(), emissiveMap: exitSign(), emissive: 0xffffff, emissiveIntensity: 1.3, roughness: 0.3 }));
    const exitBox = (x, y, z, yaw) => {
      const e = new THREE.Group();
      kit.box(e, 0.5, 0.2, 0.08, kit.std(0xe8e8e2, 0.4), 0, 0, 0);
      keep(kit.plane(e, 0.46, 0.17, exitMat, 0, 0, 0.041));
      kit.add(e, x, z, yaw, { y });
    };
    exitBox(31.5 * CS, 2.38, 17 * CS - 0.15, PI);
    exitBox(30.5 * CS, P7 + 2.2, 24 * CS + 0.05, 0);
    const plate = (text, sub, x, y, z, yaw, bg = '#e8e6de', fg = '#1a1a1a') => {
      const e = new THREE.Group();
      kit.plane(e, 0.7, 0.2, kit.tex(`g-plate:${text}`, signTexture(text, sub, { bg, fg, w: 512, h: 144 })), 0, 0, 0);
      kit.add(e, x, z, yaw, { y });
    };
    plate('STAIRS', 'P6 · P7', 31.5 * CS - 0.95, 1.6, 17 * CS - 0.11, PI);
    plate('OFFICE', 'Staff only', 8.5 * CS - 0.95, 1.6, 17 * CS - 0.11, PI);
    plate('MACHINE ROOM', 'Keep out', 26.5 * CS - 0.95, 1.6, 17 * CS - 0.11, PI, '#e0b21c', '#141414');

    // office: a desk facing the door, CCTV that shows only empty bays
    const office = new THREE.Group();
    kit.model(office, 'metal_office_desk', 8.5 * CS, 0, 20.6 * CS, PI, 0.95);
    kit.model(office, 'plastic_monobloc_chair_01', 8.4 * CS, 0, 20.05 * CS, 0.3);
    for (let k = 0; k < 3; k++) {
      kit.box(office, 0.42, 0.34, 0.36, kit.std(0x2a2a2a, 0.5), 8.5 * CS - 0.5 + k * 0.5, 0.75 + 0.17, 20.7 * CS);
      const scr = kit.plane(office, 0.34, 0.26, new THREE.MeshBasicMaterial({ map: screenStatic(k + 5), color: new THREE.Color(0.55, 0.8, 0.6) }), 8.5 * CS - 0.5 + k * 0.5, 0.93, 20.7 * CS - 0.185, 0, PI, 0);
      keep(scr).userData.noBake = true;
    }
    kit.add(office, 0, 0, 0);
    world.addBox(8.5 * CS - 1, 20.2 * CS, 8.5 * CS + 1, 21 * CS);
    kit.add(P.filingCabinet.build(kit, rng), 6.2 * CS, 21 * CS - 0.32, PI, { collide: [0.5, 0.6] });
    kit.add(P.lockers.build(kit, rng, { color: 0x8a9088 }), 11 * CS - 0.27, 19.5 * CS, -PI / 2, { collide: [0.9, 0.5] });
    kit.add(P.wallClock.build(kit, rng, {}), 8.5 * CS, 21 * CS - 0.02, PI, { y: 2.1 });
    kit.add(Mdl.box.build(kit, rng), 6.3 * CS, 18.3 * CS, 0.3, { collide: [0.5, 0.5] });
    // machine room: switchboards humming to themselves
    for (let k = 0; k < 3; k++) {
      const sb = new THREE.Group();
      kit.box(sb, 0.9, 2.0, 0.5, kit.std(0x8a8e88, 0.45, 0.4), 0, 1.0, 0);
      for (let v = 0; v < 6; v++) kit.box(sb, 0.6, 0.02, 0.02, M.dark, 0, 0.3 + v * 0.06, 0.26);
      keep(kit.sphere(sb, 0.02, kit.glow(k === 1 ? 0xff3020 : 0x30ff60, 2.5), 0.3, 1.7, 0.26));
      kit.add(sb, (25.2 + k * 1.2) * CS + 0.4, 21 * CS - 0.3, PI, { collide: [0.9, 0.5] });
    }
    for (let k = 0; k < 3; k++) kit.add(P.modelProp('power_box_01', { place: 'high', collide: false }).build(kit, rng), 25 * CS + 0.01, 18.6 * CS + k * 0.9, PI / 2, { y: 1.3 });
    kit.add(P.modelProp('utility_box_01').build(kit, rng), 29 * CS - 0.25, 18.6 * CS, -PI / 2, { collide: [0.5, 0.5] });
    for (let k = 0; k < 2; k++) kit.add(Mdl.can.build(kit, rng), 28.6 * CS + rng.float(-0.3, 0.3), 19.9 * CS + k * 0.3, rng.float(0, 6));
    plate('DANGER', 'High voltage', 26.4 * CS, 1.3, 21 * CS - 0.57, PI, '#e0b21c', '#141414');
    // stairwell lobby and landing
    kit.add(P.modelProp('korean_fire_extinguisher_01').build(kit, rng), 32.8 * CS, 18.2 * CS, -PI / 2);
    kit.add(Mdl.bin.build(kit, rng), 32.7 * CS, 18.8 * CS, -PI / 2, { collide: [0.6, 0.6] });
    plate('P7', 'Parking level', 32.5 * CS, P7 + 1.7, 21 * CS + 0.02, 0, '#1f5a8a', '#fff');
    // P5: full, apparently
    const p5 = new THREE.Group();
    const p5t = signTexture('P5 FULL', 'Also P4, P3, P2 and P1. Please park on P6.', { bg: '#141414', fg: '#ff5a30', w: 1024, h: 384 });
    kit.plane(p5, 2.4, 0.9, kit.tex('g-p5', p5t, { emissiveMap: p5t, emissive: 0xffffff, emissiveIntensity: 0.7 }), 0, 0, 0);
    kit.add(p5, 42 * CS, 21 * CS - 0.03, PI, { y: 1.35 + 1.6 });
    for (const x of [41.5, 42.5]) kit.add(Mdl.barrier.build(kit, rng), x * CS, 20.7 * CS, PI, { y: 1.35, collide: Mdl.barrier.fp });
    for (let k = 0; k < 3; k++) kit.add(P.trafficCone.build(kit, rng), (41.2 + k * 0.6) * CS, 20.1 * CS, 0, { y: 1.35 });

    // convex safety mirrors where the lanes meet the end walls
    const mirrorMat = kit.mat('mirror', () => new THREE.MeshStandardMaterial({ color: 0x6c7276, metalness: 1, roughness: 0.06 }));
    const rimMat = kit.std(0xe06a1c, 0.5, 0.1);
    for (const L of LANES) {
      for (const [x, face] of [[1 * CS, 1], [43 * CS, -1]]) {
        if (face < 0 && L === 3) continue; // the entrance is there
        const m = new THREE.Group();
        const tilt = new THREE.Group();
        tilt.rotation.x = 0.25;
        m.add(tilt);
        kit.mesh(tilt, new THREE.SphereGeometry(0.6, 24, 8, 0, PI * 2, 0, 0.5), mirrorMat, 0, 0, -0.447, PI / 2, 0, 0);
        kit.torus(tilt, 0.288, 0.025, rimMat, 0, 0, 0.08);
        kit.box(m, 0.05, 0.05, 0.22, M.steel, 0, 0.05, -0.1);
        kit.add(m, x + face * 0.2, (L + 1) * CS + face * 1.4, face > 0 ? PI / 2 - 0.5 : -PI / 2 - 0.5, { y: deckY(2, L) + 2.05 });
      }
    }

    // ---- signs --------------------------------------------------------------
    const hang = (text, sub, x, y, z, yaw, bg = '#1f6b3a') => {
      const s = new THREE.Group();
      const tex = signTexture(text, sub, { bg, fg: '#ffffff', w: 512, h: 128 });
      const face = kit.mat(`hang:${text}:${sub}`, () => new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.45, roughness: 0.4 }));
      kit.box(s, 1.5, 0.38, 0.06, kit.std(0x2a2c2e, 0.4, 0.6), 0, -0.5, 0);
      kit.plane(s, 1.44, 0.34, face, 0, -0.5, 0.031);
      kit.plane(s, 1.44, 0.34, face, 0, -0.5, -0.031, 0, PI, 0);
      for (const sx of [-0.6, 0.6]) kit.cyl(s, 0.008, 0.008, 0.3, M.steel, sx, -0.16, 0);
      kit.add(s, x, z, yaw, { y });
    };
    for (const c of [1, 21]) {
      hang('P7', 'Ramp down ↓', (c + 1) * CS, H + P6 - 0.5, 14.8 * CS, 0);
      hang('P6', 'Ramp up ↑', (c + 1) * CS, H + P7 - 0.5, 25.5 * CS, 0);
      // clearance bar over the ramp mouth
      const bar = new THREE.Group();
      kit.mesh(bar, mBox(2 * CS - 0.2, 0.18, 0.12, { s: 0.7 }), M.hazard, 0, 0, 0);
      for (const sx of [-2.2, 2.2]) kit.cyl(bar, 0.012, 0.012, 0.36, M.steel, sx, 0.27, 0, 0, 0, 0, 5);
      kit.plane(bar, 0.9, 0.2, kit.tex('g-clear', signTexture('HEADROOM 2.1 m', '', { bg: '#e0b21c', fg: '#141414', w: 512, h: 112 })), 0, -0.2, -0.065, 0, PI, 0);
      kit.add(bar, (c + 1) * CS, 16.9 * CS, 0, { y: H - 0.63 });
    }
    hang('P5', 'Ramp up ↑', 42 * CS, H - 0.5, 14.8 * CS, 0);
    hang('STAIRS', 'P6 · P7', 31.5 * CS, H - 0.5, 15.2 * CS, 0);
    hang('EXIT →', 'Pedestrians', 38 * CS, H - 0.5, 4 * CS, PI / 2);
    hang('← EXIT', 'Pedestrians', 12 * CS, H - 0.5, 10 * CS, PI / 2);
    hang('EXIT →', 'Pedestrians', 10 * CS, P7 + H - 0.5, 25 * CS, PI / 2);
    // big painted level numbers on the walls
    const levelMounts = rng.shuffle(wallMounts(g).filter((m) => !room(m.i, m.j) && !used.has(`${m.i},${m.j},${m.nx},${m.nz}`) && (laneOf(m.j) !== undefined || crossOf(m.i) !== undefined) && m.i < 43));
    const painted = [];
    for (const m of levelMounts) {
      if (painted.length >= 18) break;
      if (painted.some((o) => Math.abs(o.i - m.i) + Math.abs(o.j - m.j) < 6)) continue;
      painted.push(m);
      used.add(`${m.i},${m.j},${m.nx},${m.nz}`);
      const u = world.unease(m.i, m.j);
      let text = m.y < -1 ? 'P7' : 'P6';
      if (u > 1.0 && rng.chance(0.3)) text = rng.pick(['P6', 'P6?', 'P∞']);
      const mat = kit.mat(`wt:${text}`, () => new THREE.MeshStandardMaterial({ map: wallText(text, '#d88428'), alphaTest: 0.35, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }));
      const e = new THREE.Group();
      kit.plane(e, 1.9, 0.95, mat, 0, 0, 0);
      kit.add(e, m.x + m.nx * 0.015, m.z + m.nz * 0.015, Math.atan2(m.nx, m.nz), { y: m.y + 1.95 });
    }

    // ---- lights: sodium lamps on a lattice over the lanes, a few cold tubes ------------
    const lampAt = [];
    for (const L of LANES) for (const s of SEGS) for (let k = 0; k < 6; k++) lampAt.push([(s + 1.5 + 3 * k) * CS, (L + 1) * CS]);
    for (const c of CROSS) for (const row of BAY_ROWS) lampAt.push([(c + 1) * CS, (row.j + 1) * CS]);
    for (const c of [1, 21]) for (const k of [1.5, 5]) lampAt.push([(c + 1) * CS, (17 + k) * CS]);
    lampAt.push([42 * CS, 18.5 * CS], [45 * CS, 3 * CS]);
    const pool = new LightPool(world.root, world.lightCount, { color: 0xff9a40, intensity: 7, distance: 13, decay: 1.5 });
    world.lightPool = pool;
    const lens = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.05, 0.22), new THREE.MeshBasicMaterial({ color: 0xffffff }), lampAt.length);
    const housing = new THREE.InstancedMesh(new THREE.BoxGeometry(0.62, 0.14, 0.3), new THREE.MeshStandardMaterial({ color: 0x3a3a38, roughness: 0.5, metalness: 0.5 }), lampAt.length);
    pool.baseColor.setRGB(1.7, 0.72, 0.16);
    const mtx = new THREE.Matrix4();
    const col = new THREE.Color();
    lampAt.forEach(([x, z], n) => {
      const [i, j] = g.cellOf(x, z);
      const top = world.floorAt(x, z) + H;
      const y = top - 0.52;
      const rot = crossOf(i) !== undefined && laneOf(j) === undefined ? PI / 2 : 0;
      mtx.makeRotationY(rot).setPosition(x, y, z);
      lens.setMatrixAt(n, mtx);
      lens.setColorAt(n, col.setRGB(1.7, 0.72, 0.16));
      mtx.makeRotationY(rot).setPosition(x, y + 0.09, z);
      housing.setMatrixAt(n, mtx);
      for (const s of [-0.22, 0.22]) kit.cyl(decals, 0.008, 0.008, 0.44, M.steel, x + (rot ? 0 : s), y + 0.38, z + (rot ? s : 0), 0, 0, 0, 5);
      const u = world.unease(i, j);
      const safe = x > 40 * CS && z < 8 * CS;
      const dead = !safe && rng.chance(0.05 + u * 0.28);
      pool.add({ pos: new THREE.Vector3(x, y - 0.05, z), color: 0xff9a40, flicker: !dead && rng.chance(0.06 + u * 0.3) ? rng.float(0.05, 0.25 + u * 0.2) : 0, dead, instance: n });
    });
    pool.mesh = lens;
    world.root.add(lens, housing);
    const tubes = [];
    const tubeAt = [[32 * CS, 18.5 * CS, 0, 0], [32 * CS, 22 * CS, P7, PI / 2], [8.5 * CS, 19.5 * CS, 0, 0], [26.8 * CS, 19.5 * CS, 0, 0], [31.5 * CS, 16.6 * CS, 0, 0], [31.5 * CS, 24.6 * CS, P7, 0]];
    for (const [x, z, y0, rot] of tubeAt) {
      const [i, j] = g.cellOf(x, z);
      const y = y0 + H - 0.06;
      const tb = new THREE.Group();
      kit.box(tb, 1.3, 0.05, 0.16, kit.std(0xdcdcd6, 0.5, 0.2), 0, 0.02, 0);
      const tubeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 2.0, 2.1) });
      keep(kit.cyl(tb, 0.018, 0.018, 1.2, tubeMat, 0, -0.025, 0, 0, 0, PI / 2, 8)).userData.noBake = true;
      kit.add(tb, x, z, rot, { y });
      const u = world.unease(i, j);
      const dead = rng.chance(0.03 + u * 0.15);
      const fx = pool.add({ pos: new THREE.Vector3(x, y - 0.1, z), color: 0xd8ecff, intensity: 5, flicker: !dead && rng.chance(0.3 + u * 0.3) ? rng.float(0.1, 0.3) : 0, dead });
      tubes.push({ mat: tubeMat, fx });
    }
    world.root.add(new THREE.HemisphereLight(0x6a5a48, 0x1a140c, 0.35));

    // ---- set dressing along the walls (the prop table follows unease) --------------
    decorate(world, kit, {
      density: { wall: 0.1, high: 0.07, floor: 0, clutter: 0.03, ceil: 0.03 },
      keepClear: (i, j) => blocked.has(K(i, j)) || room(i, j) || i >= 43 || (i >= 41 && j >= 17) || g.get(i, j) === HOLE,
      wall: [
        { p: P.extinguisher, w: 1.5 }, { p: hoseBox, w: 0.8 }, { p: P.modelProp('utility_box_01'), w: 1 },
        { p: Mdl.bin, w: 0.8 }, { p: tyreStack, w: 0.6, min: 0.2 }, { p: P.modelProp('trashbag', { jitter: 3 }), w: 0.8, min: 0.35 },
        { p: P.modelProp('cardboard_box_01', { jitter: 0.4 }), w: 0.3, min: 0.3 }, { p: P.modelProp('hand_truck'), w: 0.4, min: 0.4 },
      ],
      high: [
        { p: P.modelProp('security_camera_01', { place: 'high', collide: false }), w: 1.2, o: {} },
        { p: P.modelProp('power_box_01', { place: 'high', collide: false }), w: 0.4 }, { p: noIdling, w: 1.2 },
        { p: missingPoster, w: 0.8, min: 0.4 }, { p: P.wallVent, w: 0.6 },
      ],
      clutter: [
        { p: P.paperScatter, w: 1 }, { p: P.bottles, w: 0.8 }, { p: P.trafficCone, w: 0.6, min: 0.2 },
        { p: P.lostShoe, w: 0.5, min: 0.5 },
      ],
      ceil: [{ p: P.hangingWires, w: 1, min: 0.45 }],
    });
    kit.finish();

    // ---- the attendant ------------------------------------------------------------
    const model = LOOKS.valet();
    model.position.set(bx, 0.15, bz + 0.1);
    model.rotation.y = PI;
    const attendant = world.add(new NPC(world, {
      name: 'the attendant',
      pos: model.position.clone(),
      model,
      voice: 0.85,
      radius: 0,
      conversations: [
        ['Evening. Ticket?', '...You don’t have a ticket.', 'That’s all right. Nobody has a ticket.'],
        ['Your car is on P6.', 'Everyone’s car is on P6.', 'If it isn’t on P6, it’s on P7. P7 is P6, a bit further down.'],
        ['The barrier goes up for anyone. It doesn’t go anywhere, but it goes up.', 'I think that’s important.'],
        ['If a car flashes its lights at you, just wave. They like that.', 'If one follows you, don’t look away from it. It’s shy.'],
        ['Drive safely. Or walk. Walking is also fine.'],
      ],
    }));
    let wave = 0;
    let waved = false;
    let bow = 0;
    let wasNear = false;
    const eye = new THREE.Vector3();
    attendant.idle = (dt, ctx) => {
      const rig = model.userData.rig;
      const dist = ctx.player.pos.distanceTo(model.position);
      if (!waved && dist < 8 && !ctx.attract) {
        waved = true;
        wave = 0.001;
      }
      const near = dist < 3.5;
      if (wasNear && !near && !ctx.attract) bow = 0.001;
      wasNear = near;
      idlePose(rig, attendant.t, { sway: 0.4 });
      rig.rot('armL', 0.1, 0, 0.05);
      rig.rot('foreL', -0.4, 0.3, 0);
      if (wave) {
        wave += dt * 0.45;
        const s = Math.sin(Math.min(1, wave) * PI);
        rig.blend(POSES.wave, s);
        rig.rot('foreR', 0, 0, -0.5 + Math.sin(attendant.t * 9) * 0.35 * s);
        if (wave >= 1) wave = 0;
      } else if (bow) {
        bow += dt * 0.7;
        rig.blend({ spine: [0.3, 0, 0], chest: [0.3, 0, 0], neck: [0.15, 0, 0], head: [0.1, 0, 0] }, Math.sin(Math.min(1, bow) * PI));
        if (bow >= 1) bow = 0;
      }
      if (!bow) lookAt(model, eye.copy(ctx.camera.position), { max: 0.9 });
    };

    // a cat, loafing on a car roof, as cats do
    const roofCars = cars.filter((c) => c.rig && !c.honker && d[K(c.bay.i, c.bay.row.j)] > 5 && d[K(c.bay.i, c.bay.row.j)] < 20);
    if (roofCars.length && rng.chance(0.75)) {
      const c = rng.pick(roofCars);
      const cat = LOOKS.cat();
      const ch = c.size[2];
      c.group.updateMatrixWorld(true);
      const pos = new THREE.Vector3(0, ch - 0.02, -0.2).applyMatrix4(c.group.matrixWorld);
      cat.position.copy(pos);
      cat.rotation.y = c.yaw + rng.float(-0.8, 0.8);
      beastPose(cat, 'loaf');
      world.root.add(cat);
      let petted = 0;
      let catT = 0;
      let probeT = 0;
      const lines = [['(It purrs. The car’s alarm does not go off. It has an understanding with the car.)'], ['Mrrp.'], ['(It is warm. The roof under it is warm. The engine is cold.)'], ['(It blinks slowly. You are, apparently, allowed to stay.)']];
      world.interactables.push({
        pos, aimHeight: 0.2, interactRange: 2.4, prompt: 'Pet the cat',
        interact: (game) => {
          game.audio.purr(null, 2.5);
          game.openDialog('the cat', lines[petted++ % lines.length], 1.6);
        },
      });
      world.animated.push((dt, ctx) => {
        catT += dt;
        probeT -= dt;
        if (probeT <= 0) {
          probeT = 0.5;
          updateProbe(cat, world, pos);
        }
        const rig = cat.userData.rig;
        beastPose(cat, 'loaf');
        tailSway(rig, catT, 0.12, 1);
        const yaw = Math.atan2(ctx.player.pos.x - pos.x, ctx.player.pos.z - pos.z) - cat.rotation.y;
        rig.rot('head', 0.1, Math.max(-1.1, Math.min(1.1, Math.atan2(Math.sin(yaw), Math.cos(yaw)))), 0);
      });
    }

    // ---- apparitions -------------------------------------------------------------
    if (!world.attract) {
      world.add(new Watcher(world, { look: { body: 0x16171a, suit: true }, speed: 1.3 }));
      world.add(new Follower(world));
      if (world.depth >= 1) world.add(new Peeker(world, { look: { body: 0x16171a, suit: true } }));
      if (rng.chance(0.3)) world.add(new StrayCat(world));
      // the driverless car, on lane cells only
      const drive = new Uint8Array(W * HH);
      for (let j = 0; j < HH; j++) {
        for (let i = 0; i < 43; i++) {
          if (!g.standable(i, j) || room(i, j) || (i >= 41 && j >= 17)) continue;
          if (laneOf(j) !== undefined || crossOf(i) !== undefined) drive[K(i, j)] = 1;
        }
      }
      const wp = (i, j) => {
        const c = crossOf(i);
        const l = laneOf(j);
        const x = c !== undefined ? (c + 1) * CS : (i + 0.5) * CS;
        const z = l !== undefined ? (l + 1) * CS : (j + 0.5) * CS;
        return { x, z };
      };
      world.add(new Creeper(world, drive, wp));
    }

    Object.assign(world.env, {
      background: 0x070504,
      fog: new THREE.FogExp2(0x1c1208, 0.042 + world.depth * 0.004),
      exposure: 1.15,
      postfx: { bloom: 0.5, bloomThreshold: 0.72, bloomRadius: 0.55, grain: 0.09, vignette: 0.48, chroma: 0.002, scan: 0.03, tint: [1.05, 0.98, 0.9] },
      ao: 1,
      envIntensity: 0.4,
      ambience: 'garage',
      reverb: [2.8, 2.5],
      bake: { hemi: 0.8, dynamic: 0.5, bounce: 0.3, radius: 10 },
      flashlight: true,
      flashlightOn: true,
      flashlightIntensity: 24,
      flashlightDistance: 24,
    });
    world.surfaceFn = (x, z) => {
      for (const [px, pz, r] of puddles) if (Math.abs(px - x) < r && Math.abs(pz - z) < r) return 'water';
      return 'stone';
    };

    world.onUpdate = (dt, ctx) => {
      for (const t of tubes) t.mat.color.setRGB(1.8, 2.0, 2.1).multiplyScalar(t.fx.dead ? 0.03 : 0.1 + t.fx.level * 0.9);
      // the barrier lifts for whoever comes near it
      const p = ctx.player.pos;
      const near = !ctx.attract && Math.hypot(p.x - gx, p.z - (gz - 2.4)) < 5;
      if (near !== armUp) {
        armUp = near;
        const audio = ctx.game.audio;
        if (audio.ready) {
          if (!gatePanner) gatePanner = audio.panner(gx, 1, gz, { ref: 3 });
          audio.beep(gatePanner, 0.7, 1);
          audio.tone({ type: 'sawtooth', f: 70, f2: 95, a: 0.05, d: 1.1, peak: 0.025, send: 0.3, dest: gatePanner });
        }
      }
      armA += ((armUp ? 1.45 : 0) - armA) * Math.min(1, dt * 1.6);
      armPivot.rotation.x = armA;
      tipLamp.material.color.setRGB(2, 0.2, 0.1).multiplyScalar(armUp ? 0.2 : 0.6 + 0.4 * Math.sin(ctx.t * 4));
    };
    world.onDispose.push(() => gatePanner?.disconnect());
  },

  makeDoor(world, dest) {
    return doorModel({
      width: 0.95,
      height: 2.1,
      doorColor: 0x5e6468,
      frameColor: 0x2e3032,
      lightColor: dest.tint || 0xffe0b0,
      knob: 0xb8b8b0,
      extras(group) {
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.16), new THREE.MeshBasicMaterial({ map: signTexture('STAIRS', '', { bg: '#e8e6de', fg: '#1a1a1a', w: 256, h: 80 }) }));
        plate.position.set(0.85, 1.55, 0.015);
        const exit = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.19), new THREE.MeshBasicMaterial({ map: exitSign(), color: new THREE.Color(1.6, 1.6, 1.6) }));
        exit.position.set(0, 2.4, 0.06);
        group.add(plate, exit);
      },
    });
  },
};
