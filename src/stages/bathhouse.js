import * as THREE from 'three';
import { Grid, FLOOR, WALL, WATER, DOORWAY, VOID, HOLE, DIRS, PIT_DEPTH, buildWallFaces, buildCellQuads, buildFloors, buildStairs } from '../core/grid.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { waterNormalMap, paint, pbr, woodPanel } from '../core/surfaces.js';
import { caustics } from '../core/textures.js';
import { mesh } from './common.js';
import { LightPool } from '../core/lights.js';
import { PropKit, keep } from '../props/kit.js';
import { photo, model, modelSize, hdri } from '../core/assets.js';
import * as P from '../props/library.js';
import { screenStatic } from '../props/canvas.js';
import { NPC } from '../entities/npc.js';
import { Watcher, Follower, Peeker, StrayCat, inView } from '../entities/creatures.js';
import { LOOKS } from '../entities/looks.js';
import { applyPose, lookAt, beastPose, tailSway } from '../entities/figures.js';

// A Showa-era public bathhouse late at night, repeated along a back street:
// shoe lockers, noren, the bandai, changing rooms, a tiled bath hall under a
// painted Mt. Fuji, and a roof terrace with an open-air bath. The further you
// wander from where you came in, the less the bathhouses agree with each other.

const PI = Math.PI;
const Y_WOOD_ = 0.3; // raised wooden floor of the changing rooms
const MW = 17; // module (one bathhouse) width in cells, walls included
const MD = 27; // module depth
const NX = 3; // bathhouses per row
const GAP = 3; // outdoor passage between bathhouses
const TOP = 10; // roof-terrace rows above the first row
const ALLEY = 5;
const W = NX * MW + (NX - 1) * GAP;
const ROW_A = TOP;
const ALLEY0 = ROW_A + MD;
const ROW_B = ALLEY0 + ALLEY;
const H = ROW_B + MD;

const BANDAI_PH = 0.5; // the bandai platform
const BANDAI_CH = 0.62; // its counter boards
const BANDAI_TOP = Y_WOOD_ + BANDAI_PH + BANDAI_CH + 0.05;
const BAND = 0.8; // top of the blue tile band in the bath hall
const Y_GENKAN = 0;
const Y_WOOD = Y_WOOD_;
const Y_BATH = 0;
const Y_RIM = 0.45; // bath rim you step over
const Y_BENCH = 0.18; // the sitting step inside the bath
const Y_DEEP = -0.12;
const Y_SURF = 0.37;
const Y_ALLEY = -0.12;
const Y_TERR = 2.6; // roof terrace
const TERR_POOL = -0.5; // open-air bath floor, relative to the terrace
const BATH_CEIL = 5.2;
const BATH_CEIL_HI = 6.4; // raised roof over the middle of the bath hall (steam vents)

const Z_GENKAN = 1;
const Z_DRESS = 2;
const Z_BATH = 3;
const Z_GAP = 4;
const Z_ALLEY = 5;
const Z_TERR = 6;
const outdoor = (z) => z >= Z_GAP;

const NAMES = ['富士の湯', '富士の湯', '富士の湯', '冨士の湯', '富土の湯', '士富の湯', '湯の士富'];

// ---------------------------------------------------------------------------
// Canvas painting

const texCache = new Map();
function canvasTex(key, w, h, draw, { repeat = false } = {}) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.userData.cached = true;
  texCache.set(key, t);
  return t;
}

function rng32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const JP = '"Zen Kaku Gothic New", "IBM Plex Sans", "Hiragino Sans", "IPAGothic", sans-serif';
const SERIF = '"Hiragino Mincho ProN", "Yu Mincho", "IPAMincho", "Noto Serif JP", serif';

function woodFill(c, x, y, w, h, rgb, r, { vertical = true, grain = 1 } = {}) {
  c.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  c.fillRect(x, y, w, h);
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  const n = Math.max(6, ((vertical ? w : h) / 3) * grain);
  for (let k = 0; k < n; k++) {
    const d = r() < 0.5;
    c.strokeStyle = d ? `rgba(40,20,8,${0.05 + r() * 0.12})` : `rgba(255,230,190,${0.03 + r() * 0.06})`;
    c.lineWidth = 0.6 + r() * 1.6;
    c.beginPath();
    if (vertical) {
      const px = x + r() * w;
      c.moveTo(px, y);
      c.bezierCurveTo(px + (r() - 0.5) * 6, y + h * 0.33, px + (r() - 0.5) * 6, y + h * 0.66, px + (r() - 0.5) * 4, y + h);
    } else {
      const py = y + r() * h;
      c.moveTo(x, py);
      c.bezierCurveTo(x + w * 0.33, py + (r() - 0.5) * 6, x + w * 0.66, py + (r() - 0.5) * 6, x + w, py + (r() - 0.5) * 4);
    }
    c.stroke();
  }
  c.restore();
}

/** Soft cumulus cloud. */
function cloud(c, x, y, s, r, tint = '255,255,255') {
  for (let k = 0; k < 9; k++) {
    const cx = x + (r() - 0.5) * s * 2.2;
    const cy = y - r() * s * 0.5;
    const rad = s * (0.35 + r() * 0.45);
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, `rgba(${tint},0.85)`);
    g.addColorStop(0.55, `rgba(${tint},0.55)`);
    g.addColorStop(1, `rgba(${tint},0)`);
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(cx, cy, rad * 1.4, rad, 0, 0, PI * 2);
    c.fill();
  }
}

function fujiPath(c, cx, baseY, peakY, bw) {
  const ht = baseY - peakY;
  const top = bw * 0.085;
  c.beginPath();
  c.moveTo(cx - bw * 1.25, baseY + 4);
  c.bezierCurveTo(cx - bw * 0.62, baseY - ht * 0.06, cx - bw * 0.26, peakY + ht * 0.2, cx - top, peakY);
  c.lineTo(cx - top * 0.45, peakY - ht * 0.012);
  c.lineTo(cx - top * 0.1, peakY + ht * 0.006);
  c.lineTo(cx + top * 0.35, peakY - ht * 0.01);
  c.lineTo(cx + top, peakY + ht * 0.004);
  c.bezierCurveTo(cx + bw * 0.26, peakY + ht * 0.2, cx + bw * 0.62, baseY - ht * 0.06, cx + bw * 1.25, baseY + 4);
  c.closePath();
}

/** The mountain: blue body, ridges, a snow cap that runs down the ravines. */
function fuji(c, cx, baseY, peakY, bw, r, { dusk = false } = {}) {
  const ht = baseY - peakY;
  c.save();
  fujiPath(c, cx, baseY, peakY, bw);
  const body = c.createLinearGradient(0, peakY, 0, baseY);
  body.addColorStop(0, dusk ? '#2a2850' : '#3b5a96');
  body.addColorStop(0.55, dusk ? '#3a3560' : '#5b7fb8');
  body.addColorStop(1, dusk ? '#4a4068' : '#86a7cf');
  c.fillStyle = body;
  c.fill();
  c.clip();
  // shadowed right flank
  const sh = c.createLinearGradient(cx - bw * 0.1, 0, cx + bw * 0.8, 0);
  sh.addColorStop(0, 'rgba(20,30,70,0)');
  sh.addColorStop(0.3, 'rgba(20,30,70,0.22)');
  sh.addColorStop(1, 'rgba(20,30,70,0.3)');
  c.fillStyle = sh;
  c.fillRect(cx - bw * 0.1, peakY - 10, bw * 1.5, ht + 20);
  // ravines
  for (let k = 0; k < 16; k++) {
    const side = k % 2 ? 1 : -1;
    const x0 = cx + side * r() * bw * 0.08;
    c.strokeStyle = `rgba(25,40,80,${0.12 + r() * 0.12})`;
    c.lineWidth = 2 + r() * 3;
    c.beginPath();
    c.moveTo(x0, peakY + ht * 0.03);
    const ex = cx + side * (0.2 + r() * 0.85) * bw;
    c.quadraticCurveTo(x0 + (ex - x0) * 0.3, peakY + ht * 0.5, ex, baseY);
    c.stroke();
  }
  // snow cap with fingers running down the ravines
  const snow = peakY + ht * 0.36;
  c.beginPath();
  c.moveTo(cx - bw * 1.3, peakY - 30);
  c.lineTo(cx + bw * 1.3, peakY - 30);
  c.lineTo(cx + bw * 1.3, snow - ht * 0.12);
  const steps = 34;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = cx + bw * (0.62 - t * 1.24);
    const edge = Math.abs(x - cx) / (bw * 0.62);
    const finger = s % 2 ? ht * (0.03 + r() * 0.16) * (1 - edge * 0.5) : -ht * r() * 0.03;
    c.lineTo(x, snow + finger - edge * ht * 0.08);
  }
  c.lineTo(cx - bw * 1.3, snow - ht * 0.12);
  c.closePath();
  const sg = c.createLinearGradient(cx - bw * 0.3, 0, cx + bw * 0.4, 0);
  sg.addColorStop(0, dusk ? '#f4d8e0' : '#ffffff');
  sg.addColorStop(0.5, dusk ? '#e8c8d8' : '#f2f6fb');
  sg.addColorStop(1, dusk ? '#a898b8' : '#b9cbe4');
  c.fillStyle = sg;
  c.fill();
  // snow streak detail
  for (let k = 0; k < 40; k++) {
    c.strokeStyle = `rgba(120,150,200,${0.1 + r() * 0.15})`;
    c.lineWidth = 1 + r() * 2;
    const x = cx + (r() - 0.5) * bw * 0.9;
    c.beginPath();
    c.moveTo(x, peakY + ht * (0.04 + r() * 0.1));
    c.lineTo(x + (x - cx) * 0.25, peakY + ht * (0.18 + r() * 0.18));
    c.stroke();
  }
  c.restore();
}

/** A Japanese black pine: crooked trunk, flat cloud-pads of needles. */
function pine(c, x, y, hgt, r, lean = 0) {
  c.strokeStyle = '#3a2618';
  c.lineWidth = hgt * 0.05;
  c.lineCap = 'round';
  const tx = x + lean * hgt * 0.5;
  c.beginPath();
  c.moveTo(x, y);
  c.bezierCurveTo(x + (r() - 0.5) * hgt * 0.3, y - hgt * 0.4, tx - (r() - 0.5) * hgt * 0.3, y - hgt * 0.7, tx, y - hgt);
  c.stroke();
  const pads = 4 + Math.floor(r() * 3);
  for (let k = 0; k < pads; k++) {
    const py = y - hgt * (0.45 + (k / pads) * 0.6);
    const px = x + (tx - x) * ((k + 2) / (pads + 2)) + (r() - 0.5) * hgt * 0.5;
    const pw = hgt * (0.28 - k * 0.025) * (0.8 + r() * 0.5);
    c.lineWidth = hgt * 0.02;
    c.beginPath();
    c.moveTo(x + (tx - x) * ((k + 2) / (pads + 2)), py + hgt * 0.06);
    c.lineTo(px, py);
    c.stroke();
    c.fillStyle = '#1b3d24';
    c.beginPath();
    c.ellipse(px, py, pw, pw * 0.32, (r() - 0.5) * 0.2, 0, PI * 2);
    c.fill();
    c.fillStyle = 'rgba(70,120,70,0.55)';
    c.beginPath();
    c.ellipse(px - pw * 0.1, py - pw * 0.1, pw * 0.8, pw * 0.16, 0, 0, PI * 2);
    c.fill();
  }
}

/**
 * The bath-hall mural. variant: 'classic' | 'two' | 'flood' | 'upside' | 'figure'.
 * Mt. Fuji sits in the middle so it rises over the partition wall.
 */
function muralTexture(variant) {
  return canvasTex(`bath-mural:${variant}`, 3072, 640, (c, w, h) => {
    const r = rng32(variant.length * 131 + 7);
    const dusk = variant === 'figure';
    const horizon = h * 0.66;
    const seaY = variant === 'flood' ? h * 0.4 : horizon;
    const sky = c.createLinearGradient(0, 0, 0, horizon);
    if (dusk) {
      sky.addColorStop(0, '#221a3e');
      sky.addColorStop(0.45, '#7a3448');
      sky.addColorStop(1, '#f09058');
    } else {
      sky.addColorStop(0, '#1d62b8');
      sky.addColorStop(0.5, '#62a8e0');
      sky.addColorStop(1, '#d6ecf6');
    }
    c.fillStyle = sky;
    c.fillRect(0, 0, w, horizon + 4);
    for (let k = 0; k < 13; k++) cloud(c, r() * w, h * (0.1 + r() * 0.35), 40 + r() * 70, r, dusk ? '255,200,170' : '255,255,255');
    // distant ridges
    c.fillStyle = dusk ? '#3d3350' : '#6e93b8';
    c.beginPath();
    c.moveTo(0, horizon);
    for (let x = 0; x <= w; x += 32) c.lineTo(x, horizon - 20 - Math.sin(x * 0.004) * 16 - Math.sin(x * 0.013 + 1) * 8);
    c.lineTo(w, horizon);
    c.fill();
    const bw = w * 0.2;
    const peak = h * 0.1;
    if (variant === 'two') {
      fuji(c, w * 0.32, horizon, peak + 20, bw * 0.95, r);
      fuji(c, w * 0.68, horizon, peak + 20, bw * 0.95, r);
    } else if (variant === 'upside') {
      c.save();
      c.translate(0, horizon + 6);
      c.scale(1, -1);
      fuji(c, w * 0.5, horizon, peak + 40, bw, r);
      c.restore();
    } else fuji(c, w * 0.5, horizon, peak, bw, r, { dusk });
    // green foothills
    c.fillStyle = dusk ? '#23243a' : '#3f6d5c';
    for (const [x0, x1, hh] of [[0, w * 0.3, 40], [w * 0.7, w, 52]]) {
      c.beginPath();
      c.moveTo(x0, horizon);
      c.quadraticCurveTo((x0 + x1) / 2, horizon - hh * 2, x1, horizon);
      c.fill();
    }
    // sea
    const sea = c.createLinearGradient(0, seaY, 0, h);
    sea.addColorStop(0, dusk ? '#c07a70' : '#8cc0e2');
    sea.addColorStop(0.18, dusk ? '#4a3a60' : '#2f78c0');
    sea.addColorStop(1, dusk ? '#1a1a38' : '#123f7c');
    c.fillStyle = sea;
    c.fillRect(0, seaY, w, h - seaY);
    for (let k = 0; k < 900; k++) {
      const y = seaY + Math.pow(r(), 1.6) * (h - seaY);
      const t = (y - seaY) / (h - seaY);
      const x = r() * w;
      const len = 8 + t * 40 + r() * 20;
      c.strokeStyle = `rgba(255,255,255,${0.15 + t * 0.35})`;
      c.lineWidth = 1 + t * 2.5;
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(x + len / 2, y - 2 - t * 4, x + len, y);
      c.stroke();
    }
    // Miho no Matsubara: a sandy spit of pines on the left
    const shoreY = h * 0.84;
    if (variant !== 'flood') {
      c.fillStyle = dusk ? '#6a5048' : '#e6d6a8';
      c.beginPath();
      c.moveTo(0, shoreY - 20);
      c.bezierCurveTo(w * 0.1, shoreY - 40, w * 0.22, shoreY - 10, w * 0.3, shoreY + 18);
      c.lineTo(w * 0.3, h);
      c.lineTo(0, h);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.6)';
      c.fillRect(0, h - 6, w * 0.3, 6);
      for (let k = 0; k < 9; k++) pine(c, w * (0.015 + k * 0.03) + r() * 20, shoreY - 12 + r() * 20, 110 + r() * 70, r, (r() - 0.6) * 0.8);
      // rocks and surf on the right
      c.fillStyle = dusk ? '#241c24' : '#4a4038';
      c.beginPath();
      c.moveTo(w * 0.84, h);
      c.lineTo(w * 0.86, h * 0.86);
      c.lineTo(w * 0.9, h * 0.78);
      c.lineTo(w * 0.94, h * 0.82);
      c.lineTo(w * 0.97, h * 0.74);
      c.lineTo(w, h * 0.76);
      c.lineTo(w, h);
      c.fill();
      for (let k = 0; k < 60; k++) {
        c.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.5})`;
        c.beginPath();
        c.ellipse(w * (0.83 + r() * 0.12), h * (0.8 + r() * 0.18), 6 + r() * 16, 3 + r() * 6, 0, 0, PI * 2);
        c.fill();
      }
      for (let k = 0; k < 3; k++) pine(c, w * (0.9 + k * 0.03), h * 0.8 - k * 10, 90 + r() * 40, r, -0.4);
    } else {
      // only the tops of the pines still show above the water
      for (let k = 0; k < 6; k++) {
        c.fillStyle = '#1b3d24';
        c.beginPath();
        c.ellipse(w * (0.03 + k * 0.05), seaY + 30 + r() * 30, 30 + r() * 20, 10, 0, 0, PI * 2);
        c.fill();
      }
    }
    // sailboats
    const boatY = variant === 'flood' ? seaY + 26 : horizon + 40;
    for (const bx of [w * 0.38, w * 0.62, w * 0.72]) {
      const s = variant === 'flood' ? 1.2 : 0.8 + r() * 0.4;
      const by = boatY + r() * 30;
      c.fillStyle = '#5a3a22';
      c.fillRect(bx - 14 * s, by, 28 * s, 5 * s);
      c.fillStyle = '#fdfbf2';
      c.beginPath();
      c.moveTo(bx - 10 * s, by - 2);
      c.lineTo(bx + 11 * s, by - 2);
      c.lineTo(bx + 8 * s, by - 34 * s);
      c.lineTo(bx - 8 * s, by - 34 * s);
      c.closePath();
      c.fill();
    }
    // gulls
    c.strokeStyle = dusk ? 'rgba(30,20,30,0.8)' : 'rgba(40,50,70,0.8)';
    c.lineWidth = 2;
    for (let k = 0; k < 7; k++) {
      const gx = w * (0.15 + r() * 0.7);
      const gy = h * (0.08 + r() * 0.3);
      c.beginPath();
      c.moveTo(gx - 9, gy - 3);
      c.quadraticCurveTo(gx - 4, gy - 6, gx, gy);
      c.quadraticCurveTo(gx + 4, gy - 6, gx + 9, gy - 3);
      c.stroke();
    }
    if (variant === 'figure') {
      // someone standing on the water, right under the mountain
      const fx = w * 0.5;
      const fy = h * 0.9;
      c.fillStyle = 'rgba(232,226,214,0.95)';
      c.beginPath();
      c.ellipse(fx, fy - 172, 13, 19, 0, 0, PI * 2);
      c.fill();
      c.beginPath();
      c.moveTo(fx - 16, fy - 150);
      c.lineTo(fx + 16, fy - 150);
      c.lineTo(fx + 12, fy - 60);
      c.lineTo(fx + 8, fy);
      c.lineTo(fx - 8, fy);
      c.lineTo(fx - 12, fy - 60);
      c.closePath();
      c.fill();
      c.strokeStyle = 'rgba(232,226,214,0.95)';
      c.lineWidth = 5;
      c.beginPath();
      c.moveTo(fx - 15, fy - 145);
      c.lineTo(fx - 22, fy - 55);
      c.moveTo(fx + 15, fy - 145);
      c.lineTo(fx + 22, fy - 55);
      c.stroke();
      c.fillStyle = '#000';
      c.fillRect(fx - 7, fy - 176, 4, 5);
      c.fillRect(fx + 3, fy - 176, 4, 5);
      c.fillStyle = 'rgba(232,226,214,0.25)';
      c.fillRect(fx - 10, fy + 2, 20, 60);
    }
    // brush grain and the damp of fifty years of steam
    for (let k = 0; k < 5000; k++) {
      c.fillStyle = r() < 0.5 ? `rgba(255,255,255,${r() * 0.05})` : `rgba(0,0,0,${r() * 0.05})`;
      c.fillRect(r() * w, r() * h, 2 + r() * 10, 1 + r() * 2);
    }
    for (let k = 0; k < 14; k++) {
      const x = r() * w;
      const g = c.createLinearGradient(0, h * 0.6, 0, h);
      g.addColorStop(0, 'rgba(120,100,60,0)');
      g.addColorStop(1, `rgba(120,100,60,${0.1 + r() * 0.12})`);
      c.fillStyle = g;
      c.fillRect(x, h * 0.6, 10 + r() * 40, h * 0.4);
    }
    // the painter's seal
    c.fillStyle = '#b8261e';
    c.fillRect(w - 84, h - 118, 44, 44);
    c.fillStyle = '#fff';
    c.font = `700 17px ${SERIF}`;
    c.textAlign = 'center';
    c.fillText('富士', w - 62, h - 90);
  });
}

/** Noren: dyed cotton with a big white character. kind: 'men' | 'women' | 'yu' */
function norenTexture(kind, name = '') {
  return canvasTex(`bath-noren:${kind}:${name}`, 1024, 512, (c, w, h) => {
    const r = rng32(kind.length * 17);
    const bg = kind === 'women' ? [168, 34, 40] : kind === 'men' ? [26, 52, 104] : [22, 40, 78];
    c.fillStyle = `rgb(${bg})`;
    c.fillRect(0, 0, w, h);
    for (let k = 0; k < 4000; k++) {
      const v = r() < 0.5 ? 255 : 0;
      c.fillStyle = `rgba(${v},${v},${v},${r() * 0.05})`;
      c.fillRect(r() * w, r() * h, 1 + r() * 3, 1);
    }
    c.fillStyle = '#f6f1e6';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    if (kind === 'yu') {
      c.font = `700 300px ${JP}`;
      c.fillText('ゆ', w / 2, h * 0.46);
      c.font = `700 44px ${JP}`;
      c.fillText(name, w / 2, h * 0.86);
    } else {
      c.font = `700 250px ${SERIF}`;
      c.fillText(kind === 'men' ? '男' : '女', w / 2, h * 0.42);
      c.font = `700 56px ${JP}`;
      c.fillText(kind === 'men' ? 'ゆ　おとこ' : 'ゆ　おんな', w / 2, h * 0.8);
    }
    // faded fold creases
    for (const x of [w / 3, (2 * w) / 3]) {
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.fillRect(x - 2, 0, 4, h);
    }
  });
}

/** Yellow bath bucket side print: the red ケロリン logo, twice around. */
function kerorinTexture() {
  return canvasTex('bath-kerorin', 1024, 128, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const x of [w * 0.25, w * 0.75]) {
      c.font = `900 84px ${JP}`;
      c.lineWidth = 6;
      c.strokeStyle = '#c3141a';
      c.strokeText('ケロリン', x, h * 0.46);
      c.fillStyle = '#d8161c';
      c.fillText('ケロリン', x, h * 0.46);
    }
  });
}

/** Locker fronts with numbered wooden key tags. kind: 'shoe' | 'dress'. */
function lockerTexture(kind, start, taken) {
  const key = `bath-locker:${kind}:${start}:${Math.round(taken * 10)}`;
  return canvasTex(key, 1024, 1024, (c, w, h) => {
    const r = rng32(start * 7 + (kind === 'shoe' ? 3 : 5));
    const cols = kind === 'shoe' ? 6 : 4;
    const rows = kind === 'shoe' ? 7 : 5;
    woodFill(c, 0, 0, w, h, [92, 58, 32], r);
    const pad = 12;
    const cw = (w - pad) / cols;
    const ch = (h - pad) / rows;
    let n = start;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const x0 = pad + x * cw;
        const y0 = pad + y * ch;
        const dw = cw - pad;
        const dh = ch - pad;
        woodFill(c, x0, y0, dw, dh, [150 + r() * 20, 102 + r() * 12, 58 + r() * 10], r);
        c.fillStyle = 'rgba(255,240,210,0.18)';
        c.fillRect(x0, y0, dw, 3);
        c.fillRect(x0, y0, 3, dh);
        c.fillStyle = 'rgba(30,15,5,0.35)';
        c.fillRect(x0, y0 + dh - 4, dw, 4);
        c.fillRect(x0 + dw - 4, y0, 4, dh);
        const has = r() > taken;
        if (kind === 'shoe') {
          // brass lock plate with a wooden key board slotted in
          const px = x0 + dw / 2;
          const py = y0 + dh * 0.42;
          c.fillStyle = '#8a7440';
          c.fillRect(px - dw * 0.2, py - dh * 0.32, dw * 0.4, dh * 0.64);
          c.fillStyle = '#b89c58';
          c.fillRect(px - dw * 0.18, py - dh * 0.3, dw * 0.36, dh * 0.6);
          if (has) {
            woodFill(c, px - dw * 0.14, py - dh * 0.4, dw * 0.28, dh * 0.8, [214, 186, 140], r);
            c.strokeStyle = 'rgba(60,40,20,0.6)';
            c.lineWidth = 2;
            c.strokeRect(px - dw * 0.14, py - dh * 0.4, dw * 0.28, dh * 0.8);
            c.fillStyle = '#141008';
            c.font = `700 ${Math.round(dh * 0.3)}px ${SERIF}`;
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText(String(n), px, py);
          } else {
            c.fillStyle = '#1a1208';
            c.fillRect(px - dw * 0.1, py - dh * 0.26, dw * 0.2, dh * 0.52);
          }
        } else {
          // number plate, keyhole and (maybe) a key on a wooden tag
          const px = x0 + dw * 0.5;
          c.fillStyle = '#e8e0cc';
          c.beginPath();
          c.ellipse(px, y0 + dh * 0.18, dw * 0.14, dh * 0.07, 0, 0, PI * 2);
          c.fill();
          c.fillStyle = '#1a1a1a';
          c.font = `700 ${Math.round(dh * 0.1)}px ${JP}`;
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText(String(n), px, y0 + dh * 0.185);
          c.fillStyle = '#9a8248';
          c.beginPath();
          c.arc(px, y0 + dh * 0.45, dw * 0.05, 0, PI * 2);
          c.fill();
          c.fillStyle = '#1a1208';
          c.fillRect(px - 2, y0 + dh * 0.43, 4, dh * 0.06);
          if (has) {
            c.strokeStyle = '#6a6a6a';
            c.lineWidth = 3;
            c.beginPath();
            c.moveTo(px, y0 + dh * 0.47);
            c.lineTo(px, y0 + dh * 0.55);
            c.stroke();
            woodFill(c, px - dw * 0.1, y0 + dh * 0.55, dw * 0.2, dh * 0.32, [210, 180, 132], r);
            c.fillStyle = '#141008';
            c.font = `700 ${Math.round(dh * 0.1)}px ${SERIF}`;
            c.fillText(String(n), px, y0 + dh * 0.71);
          }
        }
        n++;
      }
    }
  });
}

/** Painted board / plate with lines of text. lines: [text, sizeFrac, color, weight?, font?] */
function boardTexture(key, w, h, bg, lines, { border = null, wood = false } = {}) {
  return canvasTex(`bath-board:${key}`, w, h, (c) => {
    const r = rng32(key.length * 13);
    if (wood) woodFill(c, 0, 0, w, h, bg, r, { vertical: false });
    else {
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);
    }
    if (border) {
      c.strokeStyle = border;
      c.lineWidth = Math.max(4, w * 0.012);
      c.strokeRect(c.lineWidth, c.lineWidth, w - c.lineWidth * 2, h - c.lineWidth * 2);
    }
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const total = lines.reduce((s, l) => s + l[1], 0);
    let y = (1 - total) / 2;
    for (const [t, s, col, weight = 700, font = JP] of lines) {
      c.fillStyle = col;
      c.font = `${weight} ${Math.round(s * h * 0.78)}px ${font}`;
      c.fillText(t, w / 2, (y + s / 2) * h);
      y += s;
    }
    for (let k = 0; k < 600; k++) {
      c.fillStyle = `rgba(0,0,0,${r() * 0.04})`;
      c.fillRect(r() * w, r() * h, 2 + r() * 6, 1 + r() * 2);
    }
  });
}

function wickerTexture() {
  return canvasTex('bath-wicker', 256, 256, (c, w, h) => {
    const r = rng32(41);
    c.fillStyle = '#8a6a3a';
    c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) {
      for (let x = 0; x < w; x += 16) {
        const odd = ((x + y) / 16) % 2;
        const g = c.createLinearGradient(x, y, odd ? x + 16 : x, odd ? y : y + 16);
        g.addColorStop(0, '#6a4c24');
        g.addColorStop(0.5, `rgb(${196 + r() * 20},${160 + r() * 16},${100 + r() * 12})`);
        g.addColorStop(1, '#6a4c24');
        c.fillStyle = g;
        c.fillRect(x + 1, y + 1, 14, 14);
      }
    }
  }, { repeat: true });
}

/** Glaze colour for mosaic tiles (the scanned mosaic supplies grout and relief). */
function glazeTexture(key, rgb, vary = 10) {
  return canvasTex(`bath-glaze:${key}`, 256, 256, (c, w, h) => {
    const r = rng32(key.length * 29 + 1);
    c.fillStyle = `rgb(${rgb})`;
    c.fillRect(0, 0, w, h);
    for (let k = 0; k < 60; k++) {
      const x = r() * w;
      const y = r() * h;
      const rad = 20 + r() * 60;
      const g = c.createRadialGradient(x, y, 0, x, y, rad);
      const d = (r() - 0.5) * vary;
      g.addColorStop(0, `rgba(${d > 0 ? '255,255,255' : '0,0,0'},${Math.abs(d) / 100})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    }
  }, { repeat: true });
}

/** A mirror at a washing station: fogged with steam, one wiped clear patch. */
function mirrorTexture(wiped) {
  return canvasTex(`bath-mirror:${wiped}`, 128, 160, (c, w, h) => {
    const r = rng32(wiped ? 3 : 4);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#b8c8cc');
    g.addColorStop(1, '#8a9ca2');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    if (wiped) {
      c.fillStyle = 'rgba(150,170,178,0.7)';
      c.beginPath();
      c.ellipse(w * 0.5, h * 0.45, w * 0.3, h * 0.2, 0.2, 0, PI * 2);
      c.fill();
    }
    for (let k = 0; k < 400; k++) {
      c.fillStyle = `rgba(255,255,255,${0.1 + r() * 0.25})`;
      c.beginPath();
      c.arc(r() * w, r() * h, 0.5 + r() * 1.6, 0, PI * 2);
      c.fill();
    }
    for (let k = 0; k < 10; k++) {
      const x = r() * w;
      c.strokeStyle = 'rgba(50,64,70,0.5)';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(x, r() * h * 0.5);
      c.lineTo(x + (r() - 0.5) * 3, h);
      c.stroke();
    }
  });
}

/** Grey kawara roof tiles in rows. */
function kawaraTexture() {
  return canvasTex('bath-kawara', 256, 256, (c, w, h) => {
    c.fillStyle = '#3a3e44';
    c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) {
      const g = c.createLinearGradient(x, 0, x + 32, 0);
      g.addColorStop(0, '#22262a');
      g.addColorStop(0.5, '#6a7078');
      g.addColorStop(1, '#22262a');
      c.fillStyle = g;
      c.fillRect(x, 0, 32, h);
    }
    for (let y = 0; y < h; y += 64) {
      c.fillStyle = 'rgba(0,0,0,0.5)';
      c.fillRect(0, y, w, 5);
    }
  }, { repeat: true });
}

function footprintTexture() {
  return canvasTex('bath-foot', 128, 256, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = '#fff';
    c.filter = 'blur(3px)';
    c.beginPath();
    c.ellipse(w * 0.52, h * 0.6, w * 0.26, h * 0.3, 0.08, 0, PI * 2);
    c.fill();
    c.beginPath();
    c.ellipse(w * 0.46, h * 0.86, w * 0.2, h * 0.11, 0, 0, PI * 2);
    c.fill();
    const toes = [[0.32, 0.24, 0.1], [0.48, 0.2, 0.075], [0.6, 0.22, 0.065], [0.7, 0.26, 0.055], [0.78, 0.31, 0.05]];
    for (const [x, y, s] of toes) {
      c.beginPath();
      c.arc(w * x, h * y, w * s, 0, PI * 2);
      c.fill();
    }
  });
}

function puffTexture() {
  return canvasTex('bath-puff', 128, 128, (c, w, h) => {
    const r = rng32(5);
    void r;
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.8)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.45)');
    g.addColorStop(0.75, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  });
}

/** Fogged, softly lit glass between the changing room and the bath. */
function steamGlassTexture() {
  return canvasTex('bath-glass', 512, 512, (c, w, h) => {
    const r = rng32(11);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#dfe9ea');
    g.addColorStop(1, '#c4d4d6');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    for (let k = 0; k < 1400; k++) {
      c.fillStyle = `rgba(255,255,255,${0.1 + r() * 0.3})`;
      c.beginPath();
      c.arc(r() * w, r() * h, 0.5 + r() * 2.5, 0, PI * 2);
      c.fill();
    }
    for (let k = 0; k < 40; k++) {
      const x = r() * w;
      const y0 = r() * h * 0.6;
      c.strokeStyle = 'rgba(160,180,184,0.35)';
      c.lineWidth = 1.5 + r() * 2;
      c.beginPath();
      c.moveTo(x, y0);
      c.lineTo(x + (r() - 0.5) * 6, y0 + 40 + r() * 160);
      c.stroke();
    }
  }, { repeat: true });
}

function milkCapTexture() {
  return canvasTex('bath-milkcaps', 768, 256, (c, w, h) => {
    const caps = [['牛乳', '#2a6ab8', '#ffffff'], ['コーヒー', '#6a3a1a', '#f4e4c8'], ['フルーツ', '#e07a20', '#fff4d8']];
    caps.forEach(([t, ring, bg], k) => {
      const x = w * (k + 0.5) / 3;
      c.fillStyle = bg;
      c.beginPath();
      c.arc(x, h / 2, h * 0.46, 0, PI * 2);
      c.fill();
      c.strokeStyle = ring;
      c.lineWidth = 14;
      c.beginPath();
      c.arc(x, h / 2, h * 0.38, 0, PI * 2);
      c.stroke();
      c.fillStyle = ring;
      c.font = `700 ${t.length > 2 ? 34 : 56}px ${JP}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(t, x, h / 2);
    });
  });
}

function newspaperTexture() {
  return canvasTex('bath-paper', 512, 360, (c, w, h) => {
    const r = rng32(23);
    c.fillStyle = '#e6e0d0';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#1a1a1a';
    c.font = `900 44px ${SERIF}`;
    c.textAlign = 'right';
    c.fillText('湯', w - 20, 60);
    c.font = `900 30px ${SERIF}`;
    c.fillText('本日も', w - 20, 110);
    c.fillText('異状なし', w - 20, 146);
    for (let col = 0; col < 18; col++) {
      for (let k = 0; k < 16; k++) {
        if (r() < 0.2) continue;
        c.fillStyle = `rgba(20,20,20,${0.4 + r() * 0.4})`;
        c.fillRect(w - 110 - col * 21, 20 + k * 20, 12, 12);
      }
    }
    c.fillStyle = '#555';
    c.fillRect(40, 220, 150, 110);
  });
}

function scaleDialTexture() {
  return canvasTex('bath-dial', 256, 256, (c, w, h) => {
    c.fillStyle = '#f4f0e4';
    c.beginPath();
    c.arc(w / 2, h / 2, w * 0.48, 0, PI * 2);
    c.fill();
    c.strokeStyle = '#222';
    c.fillStyle = '#222';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let k = 0; k <= 30; k++) {
      const a = -PI * 0.75 + (k / 30) * PI * 1.5 - PI / 2;
      const r0 = w * (k % 5 ? 0.4 : 0.36);
      c.lineWidth = k % 5 ? 1.5 : 3;
      c.beginPath();
      c.moveTo(w / 2 + Math.cos(a) * r0, h / 2 + Math.sin(a) * r0);
      c.lineTo(w / 2 + Math.cos(a) * w * 0.44, h / 2 + Math.sin(a) * w * 0.44);
      c.stroke();
      if (k % 5 === 0) {
        c.font = `700 18px ${JP}`;
        c.fillText(String(k * 5), w / 2 + Math.cos(a) * w * 0.29, h / 2 + Math.sin(a) * w * 0.29);
      }
    }
    c.fillStyle = '#b8261e';
    c.font = `700 22px ${JP}`;
    c.fillText('kg', w / 2, h * 0.68);
  });
}

// ---------------------------------------------------------------------------
// Geometry helpers

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Vertical/horizontal quads with world UVs, tagged for the light baker. */
class Quads {
  constructor() {
    this.p = [];
    this.n = [];
    this.u = [];
    this.i = [];
  }

  quad(a, b, c, d, n, ua, ub, uc, ud) {
    const base = this.p.length / 3;
    this.p.push(...a, ...b, ...c, ...d);
    for (let k = 0; k < 4; k++) this.n.push(...n);
    this.u.push(...ua, ...ub, ...uc, ...ud);
    this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** Face on the boundary of cell (i,j), side 0 +X, 1 -X, 2 +Z, 3 -Z (normal direction). */
  vface(i, j, side, y0, y1, sc = 2) {
    if (y1 - y0 < 1e-3) return;
    const x0 = i;
    const x1 = i + 1;
    const z0 = j;
    const z1 = j + 1;
    const v0 = y0 / sc;
    const v1 = y1 / sc;
    if (side === 0) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [-z1 / sc, v0], [-z0 / sc, v0], [-z0 / sc, v1], [-z1 / sc, v1]);
    else if (side === 1) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [z0 / sc, v0], [z1 / sc, v0], [z1 / sc, v1], [z0 / sc, v1]);
    else if (side === 2) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [x0 / sc, v0], [x1 / sc, v0], [x1 / sc, v1], [x0 / sc, v1]);
    else this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [-x1 / sc, v0], [-x0 / sc, v0], [-x0 / sc, v1], [-x1 / sc, v1]);
  }

  get empty() {
    return !this.i.length;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    g.userData.quads = true;
    return g;
  }
}

const SIDES = [[1, 0, 0], [-1, 0, 1], [0, 1, 2], [0, -1, 3]];

/**
 * Instanced copies of small repeated things (stools, buckets, baskets),
 * one InstancedMesh per part per key so each can be culled and baked.
 */
class Batch {
  constructor(world) {
    this.world = world;
    this.sets = new Map();
  }

  add(key, parts, matrix) {
    let e = this.sets.get(key);
    if (!e) {
      e = { parts, list: [], meshes: null };
      this.sets.set(key, e);
    }
    e.list.push(matrix.clone());
    return { set: e, index: e.list.length - 1 };
  }

  finish() {
    for (const e of this.sets.values()) {
      e.meshes = e.parts.map((p) => {
        const im = new THREE.InstancedMesh(p.geo.clone(), p.mat, e.list.length);
        e.list.forEach((mm, n) => im.setMatrixAt(n, _m.multiplyMatrices(mm, p.m)));
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        this.world.root.add(im);
        return im;
      });
    }
  }

  move(ref, matrix) {
    const e = ref.set;
    e.list[ref.index].copy(matrix);
    e.parts.forEach((p, k) => {
      const im = e.meshes[k];
      im.setMatrixAt(ref.index, _m.multiplyMatrices(matrix, p.m));
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
    });
  }
}

const partCache = new Map();
/** Meshes of a preloaded model with their transforms (for instancing). */
function modelParts(id, scale = 1) {
  const key = `${id}:${scale}`;
  if (partCache.has(key)) return partCache.get(key);
  const m = model(id);
  m.scale.setScalar(scale);
  m.updateMatrixWorld(true);
  const parts = [];
  m.traverse((o) => {
    if (o.isMesh) parts.push({ geo: o.geometry, mat: o.material, m: o.matrixWorld.clone() });
  });
  partCache.set(key, parts);
  return parts;
}

let bucketParts = null;
/** The yellow Kerorin bucket: a lathe body and a printed band. */
function kerorinParts() {
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
  const print = new THREE.MeshStandardMaterial({ map: kerorinTexture(), transparent: true, alphaTest: 0.4, roughness: 0.35, polygonOffset: true, polygonOffsetFactor: -1 });
  const I = new THREE.Matrix4();
  bucketParts = [{ geo: body, mat: yellow, m: I }, { geo: band, mat: print, m: I }];
  for (const p of bucketParts) {
    p.geo.userData.shared = true;
    p.mat.userData.shared = true;
  }
  return bucketParts;
}

/** A Kerorin bucket as a decorate() prop, for when the bathhouse bleeds elsewhere. */
const bleedBucket = {
  place: 'clutter', fp: null,
  build() {
    const g = new THREE.Group();
    for (const p of kerorinParts()) {
      const m = new THREE.Mesh(p.geo, p.mat);
      m.applyMatrix4(p.m);
      g.add(m);
    }
    return g;
  },
};

let stoolParts = null;
/** A low plastic bath stool (the scanned wooden stool is used for the nicer ones). */
function plasticStoolParts() {
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

/** Merges a prop group into one mesh per material (for props that move as a whole). */
function mergeGroup(group, skip = new Set()) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const byMat = new Map();
  const keepers = [];
  group.traverse((o) => {
    if (!o.isMesh) return;
    if (skip.has(o)) {
      keepers.push(o);
      return;
    }
    const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    geo.applyMatrix4(_m.multiplyMatrices(inv, o.matrixWorld));
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(geo);
  });
  const out = new THREE.Group();
  for (const [mat, geos] of byMat) {
    out.add(new THREE.Mesh(mergeGeometries(geos), mat));
    for (const x of geos) x.dispose();
  }
  for (const o of keepers) {
    const wm = _m.multiplyMatrices(inv, o.matrixWorld);
    o.parent.remove(o);
    wm.decompose(o.position, o.quaternion, o.scale);
    out.add(o);
  }
  return out;
}

function matAt(x, y, z, yaw = 0, s = 1, rx = 0) {
  _q.setFromEuler(new THREE.Euler(rx, yaw, 0, 'YXZ'));
  return new THREE.Matrix4().compose(_v.set(x, y, z), _q, _s.set(s, s, s));
}

/** Continuous hum on a panner (fridges, massage chairs). */
function makeHum(audio, p, { freq = 60, type = 'sawtooth', cut = 240, gain = 0 } = {}) {
  const ctx = audio.ctx;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = cut;
  const g = ctx.createGain();
  g.gain.value = gain;
  o.connect(f).connect(g).connect(p);
  o.start();
  return {
    gain: g.gain,
    freq: o.frequency,
    stop() {
      try {
        o.stop();
      } catch {
        /* already stopped */
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Props (origin on the floor, facing +Z)

function hangingPlate(k, tex, w, h, x, y, z, yaw = 0, { glow = 0.25, frame = 0x5a3a20 } = {}) {
  const g = new THREE.Group();
  k.box(g, w + 0.04, h + 0.04, 0.025, k.std(frame, 0.6), 0, 0, -0.012);
  const m = k.mat(`plate:${tex.uuid}:${glow}`, () => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: glow }));
  k.plane(g, w, h, m, 0, 0, 0.002);
  g.position.set(x, y, z);
  g.rotation.y = yaw;
  return g;
}

/** Wooden locker bank (the texture carries the doors and key tags). */
function lockerBank(k, kind, w, hgt, start, taken) {
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
function cubbyShelf(k, cols, rows, cw = 0.44, ch = 0.36) {
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
function shelfBasket(k) {
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
function washStation(k, rng, { fogged = false, bottles = 0, width = 1 } = {}) {
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

function bandaiBooth(k, rng) {
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

function milkFridge(k) {
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

function massageChair(k) {
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

function bathScale(k) {
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

function hairDryer(k) {
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

function crtTv(k, seed) {
  const g = new THREE.Group();
  k.box(g, 0.5, 0.4, 0.42, k.std(0x2a2826, 0.5), 0, 0.2, -0.04);
  const scr = screenStatic(seed);
  k.plane(g, 0.38, 0.29, k.mat(`tv:${seed}`, () => new THREE.MeshBasicMaterial({ map: scr, color: 0x9aa8b0 })), -0.04, 0.21, 0.172);
  k.box(g, 0.3, 0.03, 0.4, k.std(0x444444, 0.5, 0.6), 0, -0.015, -0.04);
  return g;
}

/** Utility pole with a street lamp arm. */
function utilityPole(k) {
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
function postBox(k) {
  const g = new THREE.Group();
  const red = k.std(0xc41c1c, 0.35, 0.2);
  k.cyl(g, 0.22, 0.22, 1.1, red, 0, 0.75, 0, 0, 0, 0, 20);
  k.sphere(g, 0.22, red, 0, 1.3, 0, 1, 0.35, 1);
  k.box(g, 0.18, 0.03, 0.05, k.std(0x111111, 0.6), 0, 1.05, 0.2);
  k.cyl(g, 0.12, 0.14, 0.2, k.std(0x2a2a2a, 0.7), 0, 0.1, 0);
  return g;
}

/** Stack of firewood / scrap timber for the boiler. */
function woodPile(k, rng, w = 1.4) {
  const g = new THREE.Group();
  for (let n = 0; n < 34; n++) {
    const col = rng.pick([0x8a6a48, 0x6a5038, 0xa08058, 0x5a4636]);
    const lw = rng.float(0.5, 0.9);
    const y = 0.06 + Math.floor(n / 7) * 0.1 + rng.float(0, 0.02);
    k.box(g, lw, rng.float(0.05, 0.09), rng.float(0.06, 0.12), k.std(col, 0.9), rng.float(-w / 2 + lw / 2, w / 2 - lw / 2), y, rng.float(-0.2, 0.2), 0, rng.float(-0.15, 0.15), rng.float(-0.05, 0.05));
  }
  return g;
}

// ---------------------------------------------------------------------------
// Entities

/** Noren panels that sway, and part when you walk through them. */
class Noren {
  constructor(world, panels, pos, normal) {
    this.world = world;
    this.panels = panels;
    this.pos = pos;
    this.normal = normal;
    this.t = world.rng.float(0, 10);
  }

  update(dt, ctx) {
    this.t += dt;
    const p = ctx.player.pos;
    const dx = p.x - this.pos.x;
    const dz = p.z - this.pos.z;
    const along = dx * this.normal.x + dz * this.normal.z;
    this.panels.forEach((m, k) => {
      const wp = m.userData.world;
      const lat = Math.hypot(p.x - wp.x, p.z - wp.z);
      // pushed aside, away from whoever walks through
      const push = lat < 0.8 && Math.abs(along) < 0.9 ? (1 - lat / 0.8) * 1.1 * Math.sign(along || 1) : 0;
      m.userData.push += (push - m.userData.push) * Math.min(1, dt * 6);
      m.rotation.x = Math.sin(this.t * 0.9 + k * 0.7) * 0.035 + m.userData.push;
    });
  }
}

/** Things you can poke: buckets, fridges, chairs, scales. Picks the one you're looking at. */
class Pokeables {
  constructor(world) {
    this.world = world;
    this.items = [];
    this.pos = new THREE.Vector3();
    this.target = null;
    this.enabled = false;
    this.interactRange = 2.3;
    this.aimHeight = 0;
    this.t = 0;
    this._f = new THREE.Vector3();
  }

  get prompt() {
    return this.target ? this.target.prompt : '';
  }

  add(item) {
    item.aim = item.aim ?? 0;
    this.items.push(item);
    return item;
  }

  update(dt, ctx) {
    this.t += dt;
    const cam = ctx.camera.position;
    ctx.camera.getWorldDirection(this._f);
    let best = null;
    let score = -Infinity;
    for (const it of this.items) {
      if (it.enabled === false) continue;
      const dx = it.pos.x - cam.x;
      const dz = it.pos.z - cam.z;
      const d = Math.hypot(dx, dz);
      if (d > (it.range || 2.2)) continue;
      const dy = it.pos.y + it.aim - cam.y;
      const len = Math.hypot(dx, dy, dz);
      const dot = (this._f.x * dx + this._f.y * dy + this._f.z * dz) / len;
      const flat = (this._f.x * dx + this._f.z * dz) / (Math.hypot(this._f.x, this._f.z) * d + 1e-6);
      const s = Math.max(dot, flat * 0.97) - d * 0.08;
      if (s < 0.8) continue;
      if (s > score) {
        score = s;
        best = it;
      }
    }
    this.target = best;
    this.enabled = !!best;
    if (best) this.pos.set(best.pos.x, best.pos.y + best.aim, best.pos.z);
    for (const it of this.items) it.tick?.(dt, ctx);
  }

  interact(game) {
    this.target?.use(game, this.target);
  }
}

// ---------------------------------------------------------------------------

export default {
  id: 'bathhouse',
  code: 'LEVEL 26',
  name: 'Midnight Bathhouse',
  sub: '深夜の銭湯 · Open late. Very late.',
  tint: 0x9ad8ff,
  assets: {
    textures: ['blue_floor_tiles_01', 'square_tiled_wall', 'old_wooden_floor_02', 'terrazzo_tiles', 'beige_wall_001', 'dark_paneled_wood', 'brown_planks_03', 'concrete_floor_02', 'concrete_wall_004', 'bamboo_wall', 'stone_pathway_02'],
    models: ['wooden_stool_01', 'wicker_basket_01', 'ceiling_fan', 'painted_wooden_bench', 'wall_clock', 'potted_plant_04', 'rock_moss_set_01', 'wooden_bucket_02', 'metal_trash_can', 'utility_box_01', 'trashbag', 'rubber_duck_toy'],
    hdris: ['qwantani_night_puresky'],
    looks: ['keeper', 'capybara', ['watcher', { body: 0xc8c0b8, eyes: 0x202020, height: 2.3 }], 'cat'],
  },

  build(world) {
    const rng = world.rng;
    const g = (world.grid = new Grid(W, H, 1, WALL));
    const N = W * H;
    const zone = new Uint8Array(N);
    const modAt = new Int8Array(N).fill(-1);
    const lowTop = new Float32Array(N);
    const bathKind = new Uint8Array(N); // 1 hot, 2 herbal, 3 open-air
    const wclass = new Uint8Array(N); // outdoor wall faces: 1 building, 2 fence
    const bh = new Float32Array(N); // building height of wall cells
    const K = (i, j) => j * W + i;
    const zoneAt = (i, j) => (g.inBounds(i, j) ? zone[K(i, j)] : 0);

    // ---- bathhouses: two rows facing each other across the alley
    const mods = [];
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < NX; col++) {
        mods.push({ idx: mods.length, row, col, ox: col * (MW + GAP), oz: row ? ROW_B : ROW_A, rot: row === 0 });
      }
    }
    // local (cell) → world cell, and local metres → world metres
    const cellL = (m, li, lj) => (m.rot ? [m.ox + MW - 1 - li, m.oz + MD - 1 - lj] : [m.ox + li, m.oz + lj]);
    const at = (m, s, lx, lz, yaw = 0) => {
      if (s === 1) {
        lx = MW - lx;
        yaw = -yaw;
      }
      return m.rot ? { x: m.ox + MW - lx, z: m.oz + MD - lz, yaw: yaw + PI } : { x: m.ox + lx, z: m.oz + lz, yaw };
    };

    for (const m of mods) {
      const set = (li, lj, type, h, z) => {
        const [i, j] = cellL(m, li, lj);
        g.set(i, j, type);
        g.setHeight(i, j, h);
        const k = K(i, j);
        zone[k] = z;
        modAt[k] = m.idx;
      };
      for (let lj = 1; lj <= 3; lj++) for (let li = 4; li <= 12; li++) set(li, lj, FLOOR, Y_GENKAN, Z_GENKAN);
      for (let li = 7; li <= 9; li++) set(li, 0, DOORWAY, Y_GENKAN, Z_GENKAN);
      for (const s of [0, 1]) {
        const L = (li) => (s ? MW - 1 - li : li);
        for (const li of [5, 6]) set(L(li), 4, DOORWAY, Y_WOOD, Z_DRESS, s);
        for (const li of [3, 4]) set(L(li), 13, DOORWAY, Y_WOOD, Z_DRESS, s);
        for (let lj = 5; lj <= 12; lj++) for (let li = 1; li <= 7; li++) set(L(li), lj, FLOOR, Y_WOOD, Z_DRESS, s);
        for (let lj = 14; lj <= 25; lj++) for (let li = 1; li <= 7; li++) set(L(li), lj, FLOOR, Y_BATH, Z_BATH, s);
        for (let lj = 16; lj <= 19; lj++) {
          set(L(4), lj, VOID, Y_BATH, Z_BATH, s);
          lowTop[K(...cellL(m, L(4), lj))] = 1.85;
        }
        for (let li = 1; li <= 7; li++) set(L(li), 20, FLOOR, Y_RIM, Z_BATH, s);
        for (let lj = 21; lj <= 25; lj++) {
          for (let li = 1; li <= 7; li++) {
            if (li === 5) {
              set(L(li), lj, FLOOR, Y_RIM, Z_BATH, s);
              continue;
            }
            set(L(li), lj, WATER, lj === 21 ? Y_BENCH : Y_DEEP, Z_BATH, s);
            bathKind[K(...cellL(m, L(li), lj))] = li < 5 ? 1 : s ? 4 : 2;
          }
        }
      }
      // bandai booth between the changing rooms, and the low partition walls
      for (let li = 7; li <= 9; li++) for (let lj = 5; lj <= 6; lj++) set(li, lj, VOID, Y_WOOD, Z_DRESS);
      for (let lj = 7; lj <= 12; lj++) {
        set(8, lj, VOID, Y_WOOD, Z_DRESS);
        lowTop[K(...cellL(m, 8, lj))] = Y_WOOD + 2.1;
      }
      for (let lj = 14; lj <= 25; lj++) {
        set(8, lj, VOID, Y_BATH, Z_BATH);
        lowTop[K(...cellL(m, 8, lj))] = 2.2;
      }
      // building heights: the bath hall rises behind the lower front
      for (let lj = 0; lj < MD; lj++) {
        for (let li = 0; li < MW; li++) {
          const [i, j] = cellL(m, li, lj);
          const k = K(i, j);
          if (modAt[k] < 0) modAt[k] = m.idx;
          if (g.get(i, j) === WALL || g.get(i, j) === DOORWAY) {
            wclass[k] = 1;
            bh[k] = lj >= 13 ? 7.2 : 4.8;
          }
        }
      }
    }

    // ---- outdoor: the alley, the passages between bathhouses, the roof terrace
    for (let j = ALLEY0; j < ALLEY0 + ALLEY; j++) {
      for (let i = 1; i < W - 1; i++) {
        g.set(i, j, FLOOR);
        g.setHeight(i, j, Y_ALLEY);
        zone[K(i, j)] = Z_ALLEY;
      }
    }
    const gapCols = [];
    for (let c = 0; c < NX - 1; c++) gapCols.push(c * (MW + GAP) + MW);
    for (const c0 of gapCols) {
      for (let i = c0; i < c0 + GAP; i++) {
        for (let j = ROW_A; j < ALLEY0; j++) {
          g.set(i, j, FLOOR);
          zone[K(i, j)] = Z_GAP;
          // stairs up to the roof terrace at the far end
          if (j === ROW_A) g.setHeight(i, j, Y_TERR);
          else if (j <= ROW_A + 5) g.setRamp(i, j, 3, Y_TERR - (j - ROW_A) * (Y_TERR / 5), Y_TERR / 5);
        }
        for (let j = ROW_B; j < H - 1; j++) {
          g.set(i, j, FLOOR);
          zone[K(i, j)] = Z_GAP;
        }
      }
    }
    const T0 = gapCols[0] - 2;
    const T1 = gapCols[gapCols.length - 1] + GAP + 1;
    for (let j = 1; j < ROW_A; j++) {
      for (let i = T0; i <= T1; i++) {
        g.set(i, j, FLOOR);
        g.setHeight(i, j, Y_TERR);
        zone[K(i, j)] = Z_TERR;
      }
    }
    // the open-air bath: a rounded pool in the middle of the terrace
    const rcx = (T0 + T1 + 1) / 2;
    const rcz = 4.6;
    for (let j = 2; j <= 7; j++) {
      for (let i = T0 + 3; i <= T1 - 3; i++) {
        const dx = (i + 0.5 - rcx) / 7.5;
        const dz = (j + 0.5 - rcz) / 2.9;
        if (dx * dx + dz * dz > 1) continue;
        g.set(i, j, WATER);
        g.setHeight(i, j, Y_TERR + TERR_POOL);
        bathKind[K(i, j)] = 3;
      }
    }
    // border walls of the outdoor areas are fences; the alley ends are buildings
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const k = K(i, j);
        if (g.get(i, j) !== WALL || wclass[k]) continue;
        const nearAlley = j >= ALLEY0 && j < ALLEY0 + ALLEY;
        wclass[k] = nearAlley ? 1 : 2;
        bh[k] = nearAlley ? 4.8 : 0;
      }
    }
    // side doors from the genkan and bath halls into the passages
    for (const m of mods) {
      for (const [li, lj, out] of [[0, 16, -1], [16, 16, 17]]) {
        const [i, j] = cellL(m, li, lj);
        const [oi, oj] = cellL(m, out, lj);
        if (zoneAt(oi, oj) !== Z_GAP) continue;
        g.set(i, j, DOORWAY);
        g.setHeight(i, j, 0);
        zone[K(i, j)] = lj < 5 ? Z_GENKAN : Z_BATH;
        if (!m.doors) m.doors = [];
        m.doors.push({ li, lj, i, j });
      }
    }

    const spawnMod = mods[1];
    const sp = at(spawnMod, 0, 8.5, 1.7);
    world.spawn = { x: sp.x, z: sp.z, yaw: sp.yaw + PI };
    world.finalizeLayout();

    // how wrong each bathhouse is, from how far it is from where you came in
    for (const m of mods) {
      const [i, j] = cellL(m, 8, 2);
      m.u = world.unease(i, j);
      m.name = m === spawnMod ? NAMES[0] : NAMES[Math.min(NAMES.length - 1, Math.floor(m.u * 5 + rng.float(0, 1.5)))];
      m.variant = m.u < 0.3 ? 'classic' : m.u < 0.5 ? rng.pick(['classic', 'two']) : m.u < 0.7 ? rng.pick(['two', 'flood']) : m.u < 0.9 ? rng.pick(['flood', 'upside']) : rng.pick(['upside', 'figure']);
      if (m === spawnMod) m.variant = 'classic';
    }
    // deep ends: some baths go down further than the building does
    const deep = new Set();
    for (const m of mods) {
      for (const s of [0, 1]) {
        if (m === spawnMod || !rng.chance(0.15 + world.depth * 0.12 + m.u * 0.3)) continue;
        const L = (li) => (s ? MW - 1 - li : li);
        for (const li of [2, 3]) {
          const [i, j] = cellL(m, L(li), 25);
          g.set(i, j, HOLE);
          deep.add(K(i, j));
        }
      }
    }
    if (world.depth >= 1 && rng.chance(0.3 + world.depth * 0.15)) {
      const i = Math.floor(rcx);
      const j = 4;
      if (g.get(i, j) === WATER) {
        g.set(i, j, HOLE);
        deep.add(K(i, j));
      }
    }

    // ---- heights of things
    const floorOf = (i, j) => g.heightOf(i, j);
    const isOpen = (c) => c !== WALL && c !== VOID;
    const interiorCell = (i, j) => {
      const z = zoneAt(i, j);
      const c = g.get(i, j);
      return z > 0 && !outdoor(z) && c !== WALL;
    };
    const ceilOf = (i, j) => {
      const k = K(i, j);
      const z = zone[k];
      const c = g.cells[k];
      if (outdoor(z)) return 40;
      if (c === DOORWAY) {
        const lj = (() => {
          const m = mods[modAt[k]];
          return m ? (m.rot ? m.oz + MD - 1 - j : j - m.oz) : 0;
        })();
        if (lj === 0) return 2.3;
        if (lj === 2 || lj === 16) return 2.1;
        return Y_WOOD + 2.0;
      }
      if (z === Z_GENKAN) return 3.0;
      if (z === Z_DRESS) return 3.5;
      if (z === Z_BATH) {
        const m = mods[modAt[k]];
        const li = m.rot ? m.ox + MW - 1 - i : i - m.ox;
        return li >= 5 && li <= 11 ? BATH_CEIL_HI : BATH_CEIL;
      }
      return 3;
    };
    world.ceilAt = (i, j) => (g.inBounds(i, j) ? ceilOf(i, j) : 3);
    const isWet = (i, j) => bathKind[K(i, j)] && (g.get(i, j) === WATER || deep.has(K(i, j)));
    const surfOf = (i, j) => (bathKind[K(i, j)] === 3 ? Y_TERR - 0.1 : Y_SURF);

    // ---- materials
    const u = Math.min(1, world.depth * 0.12);
    // the scanned mosaic gives grout and relief; the glaze colour is ours
    const mosaic = (key, rgb, uv, opts = {}) => {
      const map = glazeTexture(key, rgb).clone();
      map.repeat.set(uv / 2, uv / 2);
      map.userData.cached = true;
      return photo('square_tiled_wall', { uvScale: uv, map, roughness: 0.3, ...opts });
    };
    const tileFloor = mosaic('floor', [178, 198, 204], 0.55, { roughness: 0.45 });
    const basin = mosaic('basin', [120, 190, 205], 0.6, { emissive: 0xfff0d0, emissiveMap: caustics(), emissiveIntensity: 0.12 });
    const causticMap = basin.emissiveMap;
    const rimMat = photo('terrazzo_tiles', { uvScale: 1.5, roughness: 0.35, color: new THREE.Color(1.0, 1.0, 0.98) });
    const tileWall = mosaic('wall', [226, 236, 236], 0.8, { roughness: 0.22 });
    const tileBand = mosaic('band', [60, 110, 160], 0.8, { roughness: 0.22 });
    const upperBath = pbr(paint('s-bath-upper', [188, 212, 214], { rough: 0.55 }));
    const bathCeil = pbr(paint('s-bath-ceil', [214, 224, 222], { rough: 0.6 }));
    const woodFloor = photo('old_wooden_floor_02', { uvScale: 2, roughness: 0.55, color: new THREE.Color(1.0, 0.92, 0.84) });
    const genkanFloor = photo('terrazzo_tiles', { uvScale: 2, roughness: 0.45, color: new THREE.Color(0.82, 0.8, 0.76) });
    const plaster = photo('beige_wall_001', { uvScale: 2, color: new THREE.Color(1.05, 1.0, 0.92) });
    const wainscot = pbr(woodPanel('s-bath-wainscot', [132, 92, 58], 0.4), { normalScale: 0.6 });
    const woodCeil = photo('brown_planks_03', { uvScale: 1, roughness: 0.6, color: new THREE.Color(1.4, 1.25, 1.05) });
    const riserWood = photo('dark_paneled_wood', { uvScale: 1, roughness: 0.5, color: new THREE.Color(0.75, 0.6, 0.5) });
    const street = photo('concrete_floor_02', { uvScale: 2, roughness: 0.55, color: new THREE.Color(0.62, 0.62, 0.64) });
    const paving = photo('blue_floor_tiles_01', { uvScale: 1.6, roughness: 0.4, color: new THREE.Color(0.55, 0.58, 0.64) });
    const facade = photo('beige_wall_001', { uvScale: 2, color: new THREE.Color(0.78, 0.74, 0.68) });
    const facadeLow = pbr(woodPanel('s-bath-facade', [70, 46, 30], 0.5), { normalScale: 0.6 });
    const backWall = photo('concrete_wall_004', { uvScale: 2, color: new THREE.Color(0.72, 0.72, 0.72) });
    const fence = photo('bamboo_wall', { uvScale: 2, color: 0xb8a888 });
    const terrFloor = photo('stone_pathway_02', { uvScale: 2.2, color: 0xb8b4ac });
    const nightGlass = new THREE.MeshStandardMaterial({ color: 0x1a2a40, roughness: 0.1, metalness: 0.4, emissive: 0x0a1428, emissiveIntensity: 1 });

    // ---- shell: walls by zone
    const wall = (opts, mat) => {
      const geo = buildWallFaces(g, opts);
      if (geo.attributes.position.count) mesh(world, geo, mat);
    };
    const inZone = (z) => (c, i, j) => isOpen(c) && zoneAt(i, j) === z;
    // interior walls of rooms (low partitions and the bandai count as open so the wall runs behind them)
    const openInterior = (z) => (c, i, j) => zoneAt(i, j) === z && c !== WALL;
    for (const [z, band, lower, upper] of [[Z_GENKAN, 1.0, wainscot, plaster], [Z_DRESS, 1.1, wainscot, plaster]]) {
      wall({ solid: (c) => c === WALL, open: openInterior(z), y0: (i, j) => floorOf(i, j) - 0.02, y1: (i, j) => Math.min(ceilOf(i, j), floorOf(i, j) + band), uScale: 1.4, vScale: 1.4 }, lower);
      wall({ solid: (c) => c === WALL, open: openInterior(z), y0: (i, j) => floorOf(i, j) + band, y1: (i, j) => ceilOf(i, j), uScale: 2, vScale: 2 }, upper);
      // a dark trim rail where the wood panelling stops
      wall({ solid: (c) => c === WALL, open: inZone(z), y0: (i, j) => floorOf(i, j) + band - 0.02, y1: (i, j) => floorOf(i, j) + band + 0.05, inset: 0.012, uScale: 1, vScale: 1 }, riserWood);
    }
    wall({ solid: (c) => c === WALL, open: openInterior(Z_BATH), y0: (i, j) => floorOf(i, j) - 0.02, y1: (i, j) => Math.min(ceilOf(i, j), BAND), uScale: 1.6, vScale: 1.6 }, tileBand);
    wall({ solid: (c) => c === WALL, open: openInterior(Z_BATH), y0: (i, j) => BAND, y1: (i, j) => Math.min(ceilOf(i, j), 2.3), uScale: 1.6, vScale: 1.6 }, tileWall);
    wall({ solid: (c) => c === WALL, open: openInterior(Z_BATH), y0: () => 2.3, y1: (i, j) => ceilOf(i, j), uScale: 2, vScale: 2 }, upperBath);
    // low partitions and islands
    const lowNb = new Float32Array(N);
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        let t = 0;
        for (const [dx, dy] of DIRS) if (g.inBounds(i + dx, j + dy)) t = Math.max(t, lowTop[K(i + dx, j + dy)]);
        lowNb[K(i, j)] = t;
      }
    }
    const lowSolid = (c, i, j) => c === VOID && lowTop[K(i, j)] > 0;
    wall({ solid: lowSolid, open: inZone(Z_BATH), y0: (i, j) => floorOf(i, j) - 0.02, y1: (i, j) => BAND, uScale: 1.6, vScale: 1.6 }, tileBand);
    wall({ solid: lowSolid, open: inZone(Z_BATH), y0: (i, j) => BAND, y1: (i, j) => lowNb[K(i, j)], uScale: 1.6, vScale: 1.6 }, tileWall);
    wall({ solid: lowSolid, open: inZone(Z_DRESS), y0: (i, j) => floorOf(i, j) - 0.02, y1: (i, j) => floorOf(i, j) + 1.1, uScale: 1.4, vScale: 1.4 }, wainscot);
    wall({ solid: lowSolid, open: inZone(Z_DRESS), y0: (i, j) => floorOf(i, j) + 1.1, y1: (i, j) => lowNb[K(i, j)], uScale: 2, vScale: 2 }, plaster);
    const capGeo = buildCellQuads(g, lowSolid, (i, j) => lowTop[K(i, j)] + 0.001, true, 1.6);
    mesh(world, capGeo, tileWall);

    // ---- floors, bath basins, risers, stairs
    const floorQ = (pred, uv, mat) => {
      const geo = buildFloors(g, (c, i, j) => c !== WALL && c !== VOID && c !== HOLE && pred(c, i, j), uv);
      if (geo.attributes.position.count) mesh(world, geo, mat);
    };
    floorQ((c, i, j) => zoneAt(i, j) === Z_GENKAN && c !== DOORWAY, 2, genkanFloor);
    floorQ((c, i, j) => zoneAt(i, j) === Z_GENKAN && c === DOORWAY, 2, genkanFloor);
    floorQ((c, i, j) => zoneAt(i, j) === Z_DRESS, 2, woodFloor);
    floorQ((c, i, j) => zoneAt(i, j) === Z_BATH && c !== WATER && Math.abs(floorOf(i, j) - Y_RIM) > 0.01, 1.4, tileFloor);
    floorQ((c, i, j) => zoneAt(i, j) === Z_BATH && c !== WATER && Math.abs(floorOf(i, j) - Y_RIM) <= 0.01, 1.5, rimMat);
    floorQ((c, i, j) => c === WATER && bathKind[K(i, j)] !== 3, 1.2, basin);
    floorQ((c, i, j) => zoneAt(i, j) === Z_ALLEY, 1.6, paving);
    floorQ((c, i, j) => zoneAt(i, j) === Z_GAP, 2, street);
    floorQ((c, i, j) => zoneAt(i, j) === Z_TERR && c !== WATER, 2.2, terrFloor);
    floorQ((c, i, j) => c === WATER && bathKind[K(i, j)] === 3, 2.2, terrFloor);
    const pits = buildCellQuads(g, (c) => c === HOLE, PIT_DEPTH, true, 2);
    if (pits.attributes.position.count) mesh(world, pits, new THREE.MeshBasicMaterial({ color: 0x041418 }));
    const stairGeos = buildStairs(g);
    if (stairGeos.length) mesh(world, mergeGeometries(stairGeos), street);
    // risers: material from the higher side
    const riserQ = new Map();
    const riserMat = (i, j) => {
      const z = zoneAt(i, j);
      if (z === Z_BATH) return g.get(i, j) === DOORWAY ? riserWood : tileWall;
      if (z === Z_DRESS) return riserWood;
      if (z === Z_TERR) return terrFloor;
      if (z === Z_GENKAN) return genkanFloor;
      return street;
    };
    const lowEnd = (i, j) => {
      const k = K(i, j);
      return g.ramp[k] ? g.heightOf(i, j) + Math.min(0, g.rise[k]) : null;
    };
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        if (!isOpen(g.get(i, j))) continue;
        for (const [dx, dy, s] of SIDES) {
          const oi = i + dx;
          const oj = j + dy;
          if (!g.inBounds(oi, oj) || !isOpen(g.get(oi, oj))) continue;
          const hi = lowEnd(i, j) ?? g.edgeHeight(i, j, dx, dy);
          const lo = lowEnd(oi, oj) ?? g.edgeHeight(oi, oj, -dx, -dy);
          if (hi <= lo + 0.02) continue;
          const lowC = g.get(oi, oj);
          const mat = (lowC === WATER || lowC === HOLE) && bathKind[K(oi, oj)] !== 3 ? basin : riserMat(i, j);
          if (!riserQ.has(mat)) riserQ.set(mat, new Quads());
          riserQ.get(mat).vface(i, j, s, lo, hi, mat === riserWood ? 1 : 1.6);
        }
      }
    }
    for (const [mat, q] of riserQ) mesh(world, q.build(), mat);

    // ---- ceilings and the steps between them (the raised bath-hall roof has windows)
    const ceilPred = (z) => (c, i, j) => interiorCell(i, j) && zoneAt(i, j) === z;
    mesh(world, buildCellQuads(g, ceilPred(Z_GENKAN), (i, j) => ceilOf(i, j), false, 1), woodCeil);
    mesh(world, buildCellQuads(g, ceilPred(Z_DRESS), (i, j) => ceilOf(i, j), false, 1), woodCeil);
    mesh(world, buildCellQuads(g, ceilPred(Z_BATH), (i, j) => ceilOf(i, j), false, 2), bathCeil);
    const dropQ = new Map();
    const clerestory = new Quads();
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        if (!interiorCell(i, j)) continue;
        const a = ceilOf(i, j);
        for (const [dx, dy, s] of SIDES) {
          const oi = i + dx;
          const oj = j + dy;
          if (!g.inBounds(oi, oj) || !interiorCell(oi, oj)) continue;
          const b = ceilOf(oi, oj);
          if (b <= a + 1e-3) continue;
          const z = zoneAt(oi, oj);
          if (z === Z_BATH && zoneAt(i, j) === Z_BATH && a >= BATH_CEIL - 0.01) {
            clerestory.vface(i, j, s, a, b, 1.2);
            continue;
          }
          const mat = z === Z_BATH ? (a < 2.3 ? tileWall : upperBath) : plaster;
          if (!dropQ.has(mat)) dropQ.set(mat, new Quads());
          const q = dropQ.get(mat);
          if (z === Z_BATH && a < 2.3) {
            q.vface(i, j, s, a, 2.3, 1.6);
            if (!dropQ.has(upperBath)) dropQ.set(upperBath, new Quads());
            dropQ.get(upperBath).vface(i, j, s, 2.3, b, 2);
          } else q.vface(i, j, s, a, b, mat === plaster ? 2 : 1.6);
        }
      }
    }
    for (const [mat, q] of dropQ) if (!q.empty) mesh(world, q.build(), mat);
    const windowTex = canvasTex('bath-clerestory', 256, 256, (c, w, h) => {
      c.fillStyle = '#0c1626';
      c.fillRect(0, 0, w, h);
      const gr = c.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, 'rgba(60,80,120,0.5)');
      gr.addColorStop(1, 'rgba(20,30,50,0)');
      c.fillStyle = gr;
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#d8dcd6';
      c.fillRect(0, 0, w, 14);
      c.fillRect(0, h - 14, w, 14);
      c.fillRect(0, 0, 10, h);
      c.fillRect(w / 2 - 5, 0, 10, h);
    }, { repeat: true });
    nightGlass.map = windowTex;
    nightGlass.emissiveMap = windowTex;
    if (!clerestory.empty) mesh(world, clerestory.build(), nightGlass);

    // ---- outdoor walls: facades on the alley, bare concrete in the passages, fences around the roof
    const outH = new Float32Array(N);
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        if (!outdoor(zoneAt(i, j))) continue;
        let t = 0;
        for (const [dx, dy] of DIRS) if (g.inBounds(i + dx, j + dy) && wclass[K(i + dx, j + dy)] === 1) t = Math.max(t, bh[K(i + dx, j + dy)]);
        outH[K(i, j)] = t;
      }
    }
    const outOpen = (z) => (c, i, j) => zoneAt(i, j) === z;
    // doorways only get the wall above their lintel
    const facadeSolid = (c, i, j) => c === WALL && wclass[K(i, j)] === 1;
    const lintelSolid = (c, i, j) => c === DOORWAY && wclass[K(i, j)] === 1 && !outdoor(zoneAt(i, j));
    wall({ solid: facadeSolid, open: outOpen(Z_ALLEY), y0: (i, j) => floorOf(i, j) - 0.02, y1: (i, j) => floorOf(i, j) + 0.9, uScale: 1.4, vScale: 1.4 }, facadeLow);
    wall({ solid: facadeSolid, open: outOpen(Z_ALLEY), y0: (i, j) => floorOf(i, j) + 0.9, y1: (i, j) => outH[K(i, j)], uScale: 2, vScale: 2 }, facade);
    for (const z of [Z_GAP, Z_TERR]) wall({ solid: facadeSolid, open: outOpen(z), y0: (i, j) => floorOf(i, j) - 0.02, y1: (i, j) => outH[K(i, j)], uScale: 2, vScale: 2 }, backWall);
    wall({ solid: lintelSolid, open: outOpen(Z_ALLEY), y0: () => 2.3, y1: (i, j) => outH[K(i, j)], uScale: 2, vScale: 2 }, facade);
    wall({ solid: lintelSolid, open: outOpen(Z_GAP), y0: () => 2.1, y1: (i, j) => outH[K(i, j)], uScale: 2, vScale: 2 }, backWall);
    wall({ solid: (c, i, j) => c === WALL && wclass[K(i, j)] === 2, open: (c, i, j) => outdoor(zoneAt(i, j)), y0: (i, j) => floorOf(i, j) - 0.02, y1: (i, j) => Math.max(0, lowEnd(i, j) ?? floorOf(i, j)) + 2.3, uScale: 2, vScale: 2 }, fence);

    // ---- water
    const nMap = waterNormalMap();
    const waterMats = {
      1: new THREE.MeshPhysicalMaterial({ color: 0x9fe0d6, transparent: true, opacity: 0.5 + u * 0.2, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.06, normalMap: nMap, normalScale: new THREE.Vector2(0.25, 0.25), depthWrite: false }),
      4: new THREE.MeshPhysicalMaterial({ color: 0xa8e8f0, transparent: true, opacity: 0.45, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.05, normalMap: nMap, normalScale: new THREE.Vector2(0.35, 0.35), depthWrite: false }),
      2: new THREE.MeshPhysicalMaterial({ color: 0xe8e090, transparent: true, opacity: 0.62, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.1, normalMap: nMap, normalScale: new THREE.Vector2(0.2, 0.2), depthWrite: false }),
      3: new THREE.MeshPhysicalMaterial({ color: 0x6a9a98, transparent: true, opacity: 0.72, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.05, normalMap: nMap, normalScale: new THREE.Vector2(0.3, 0.3), depthWrite: false }),
    };
    for (const kind of [1, 2, 3, 4]) {
      const geo = buildCellQuads(g, (c, i, j) => isWet(i, j) && bathKind[K(i, j)] === kind, surfOf, true, 3);
      if (!geo.attributes.position.count) continue;
      const wm = mesh(world, geo, waterMats[kind]);
      wm.renderOrder = 2;
      wm.userData.noBake = true;
    }

    // ---- props
    const kit = new PropKit(world);
    const batch = new Batch(world);
    const poke = new Pokeables(world);
    const bakeSources = world.bakeSources;
    const place = (grp, m, s, lx, lz, yaw = 0, y = 0, collide = null) => {
      const p = at(m, s, lx, lz, yaw);
      kit.add(grp, p.x, p.z, p.yaw, { y, collide });
      return p;
    };
    const fixtures = [];
    const fixture = (x, y, z, { intensity = 1, color = null, visible = true, rot = 0 } = {}) => fixtures.push({ x, y, z, intensity, color, visible, rot });

    const buckets = [];
    const stoolWood = modelParts('wooden_stool_01', 0.55);
    const stoolSize = modelSize('wooden_stool_01').clone().multiplyScalar(0.55);
    const basketParts = modelParts('wicker_basket_01', 0.9);
    const addBucket = (m, s, x, y, z, yaw, upside = false, key = 'b') => {
      const mat4 = upside ? matAt(x, y + 0.115, z, yaw, 1, PI) : matAt(x, y, z, yaw);
      const ref = batch.add(`bucket:${m ? m.idx : 't'}:${key}`, kerorinParts(), mat4);
      const b = { ref, pos: new THREE.Vector3(x, y + 0.06, z), base: mat4.clone(), m, s, hop: 0, tower: false, upside };
      buckets.push(b);
      return b;
    };

    const clock = (m, s, lx, lz, yaw, y) => {
      const grp = new THREE.Group();
      kit.model(grp, 'wall_clock', 0, 0, 0, 0, 0.9);
      place(grp, m, s, lx, lz, yaw, y);
    };

    const massageChairs = [];
    const yuzus = [];
    const yuzuMat = new THREE.MeshStandardMaterial({ color: 0xf0b020, roughness: 0.5 });
    const yuzuGeo = new THREE.SphereGeometry(0.045, 12, 9);
    yuzuGeo.scale(1, 0.85, 1);
    const yuzuParts = [{ geo: yuzuGeo, mat: yuzuMat, m: new THREE.Matrix4() }];
    world.onDispose.push(() => yuzuGeo.dispose());
    const scales = [];
    const fridges = [];

    for (const m of mods) {
      const mu = m.u;
      const r2 = rng32(m.idx * 97 + 3);
      // ---------------- genkan
      // shoe lockers along the front wall and the sides
      let tagNo = 1 + m.idx * 7;
      for (const [lx0, lx1] of [[4.05, 6.95], [10.05, 12.95]]) {
        const w = lx1 - lx0;
        const grp = lockerBank(kit, 'shoe', w, 1.75, tagNo, 0.15 + mu * 0.5);
        tagNo += 42;
        place(grp, m, 0, (lx0 + lx1) / 2, 1.22, 0, Y_GENKAN, [w, 0.44]);
      }
      for (const s of [0, 1]) {
        const grp = lockerBank(kit, 'shoe', 2.1, 1.75, tagNo, 0.2 + mu * 0.5);
        tagNo += 42;
        place(grp, m, s, 4.22, 2.55, PI / 2, Y_GENKAN, [2.1, 0.44]);
      }
      // the wall between the noren: prices, a clock, the day's bath
      const priceTex = boardTexture(`price:${mu > 0.9 ? 'late' : 'ok'}`, 512, 640, [236, 226, 204], [
        ['入浴料金', 0.13, '#1a1208', 900, SERIF], ['PRICES', 0.06, '#6a2a1a', 600],
        ['大人 520円', 0.12, '#1a1208', 700], ['Adults ¥520', 0.06, '#5a4a3a', 600],
        ['中人 200円', 0.1, '#1a1208', 700], ['小人 100円', 0.1, '#1a1208', 700],
        ['営業時間', 0.09, '#8a1a1a', 700], [mu > 0.9 ? '15:00 – ∞' : '15:00 – 24:00', 0.09, '#8a1a1a', 700],
      ], { wood: true, border: '#3a2414' });
      const pp = at(m, 0, 8.5, 3.98, PI);
      kit.add(hangingPlate(kit, priceTex, 0.8, 1.0, 0, 0, 0, 0, { glow: 0.12 }), pp.x, pp.z, pp.yaw, { y: 1.55 });
      clock(m, 0, 9.6, 3.98, PI, 2.3);
      const today = boardTexture('today', 256, 512, '#f4efe2', [['本日の', 0.12, '#1a1a1a'], ['薬湯', 0.2, '#1a6a2a', 900, SERIF], ['ゆず湯', 0.22, '#c07a10', 900, SERIF], ['YUZU', 0.08, '#6a5a3a', 600], ['BATH', 0.08, '#6a5a3a', 600]], { border: '#1a6a2a' });
      const tp = at(m, 0, 7.45, 3.98, PI);
      kit.add(hangingPlate(kit, today, 0.35, 0.7, 0, 0, 0, 0, { glow: 0.1 }), tp.x, tp.z, tp.yaw, { y: 1.5 });
      // umbrella stand, a plant, a slatted step
      const plant = new THREE.Group();
      kit.model(plant, 'potted_plant_04', 0, 0, 0, r2() * 6, 0.9);
      place(plant, m, 1, 4.45, 3.55, 0, Y_GENKAN, [0.5, 0.5]);
      place(P.umbrella.build(kit, rng), m, 1, 6.5, 1.75, 0.4, Y_GENKAN);
      // entrance: glass sliding doors, the middle two slid open
      {
        const grp = new THREE.Group();
        const frame = kit.std(0x3a2a1c, 0.5);
        const glass = kit.mat('entranceGlass', () => new THREE.MeshStandardMaterial({ color: 0xcfe0e4, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.25, depthWrite: false }));
        const frameGeo = mergeGeometries([
          new THREE.BoxGeometry(0.72, 0.1, 0.04).translate(0, 0.05, 0),
          new THREE.BoxGeometry(0.72, 0.45, 0.04).translate(0, 0.325, 0),
          new THREE.BoxGeometry(0.72, 0.1, 0.04).translate(0, 2.15, 0),
          new THREE.BoxGeometry(0.06, 2.2, 0.04).translate(-0.33, 1.1, 0),
          new THREE.BoxGeometry(0.06, 2.2, 0.04).translate(0.33, 1.1, 0),
          new THREE.BoxGeometry(0.6, 0.03, 0.03).translate(0, 1.3, 0),
        ]);
        for (const [x, z] of [[-1.1, 0.03], [-0.95, -0.03], [0.95, -0.03], [1.1, 0.03]]) {
          kit.mesh(grp, frameGeo.clone(), frame, x, 0, z);
          kit.plane(grp, 0.6, 1.5, glass, x, 1.3, z + 0.004);
          kit.plane(grp, 0.6, 1.5, glass, x, 1.3, z - 0.004, 0, PI, 0);
        }
        frameGeo.dispose();
        const p = at(m, 0, 8.5, 0.5, 0);
        kit.add(grp, p.x, p.z, p.yaw, { y: Y_GENKAN });
        for (const x of [-1.03, 1.03]) world.addFootprint(p.x + Math.cos(p.yaw) * x, p.z - Math.sin(p.yaw) * x, 0.86, 0.12, p.yaw);
      }
      // ---------------- bandai
      {
        const booth = bandaiBooth(kit, rng);
        const p = at(m, 0, 8.5, 6.0, 0);
        kit.add(booth, p.x, p.z, p.yaw, { y: Y_WOOD });
        const seat = booth.userData.seat;
        m.bandai = { x: p.x, z: p.z, yaw: p.yaw + PI, seat: new THREE.Vector3(p.x + Math.sin(p.yaw) * seat.z, Y_WOOD + seat.y, p.z + Math.cos(p.yaw) * seat.z) };
        // the keeper's lamp
        fixture(p.x, 3.45, p.z, { intensity: 0.8 });
        const tv = crtTv(kit, m.idx);
        const tp2 = at(m, 0, 9.75, 5.3, -1.0);
        kit.add(tv, tp2.x, tp2.z, tp2.yaw, { y: BANDAI_TOP });
        // the empty bandai keeps a cup of tea and today's paper
        const paper = new THREE.Group();
        kit.plane(paper, 0.42, 0.3, kit.mat('paper', () => new THREE.MeshStandardMaterial({ map: newspaperTexture(), roughness: 0.9, side: THREE.DoubleSide })), 0, 0.001, 0, -PI / 2, 0, 0.1);
        const pp2 = at(m, 0, 7.2, 6.3, 0.3);
        kit.add(paper, pp2.x, pp2.z, pp2.yaw, { y: BANDAI_TOP });
      }
      // ---------------- both sides: changing room and bath hall
      for (const s of [0, 1]) {
        const kind = s ? 'women' : 'men';
        // noren at the changing-room doorway
        {
          const tex = norenTexture(kind);
          const panels = [];
          const nm = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.95 });
          const p = at(m, s, 6.0, 4.05, 0);
          const holder = new THREE.Group();
          holder.position.set(p.x, Y_WOOD + 2.0, p.z);
          holder.rotation.y = p.yaw + PI;
          for (let n = 0; n < 3; n++) {
            const geo = new THREE.PlaneGeometry(0.62, 1.05, 1, 4);
            geo.translate(0, -0.525, 0);
            const uv = geo.attributes.uv;
            for (let v = 0; v < uv.count; v++) uv.setX(v, (n + uv.getX(v)) / 3);
            const pm = new THREE.Mesh(geo, nm);
            pm.position.set(-0.64 + n * 0.64, 0, 0);
            pm.userData.push = 0;
            holder.add(pm);
            panels.push(pm);
          }
          const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 2.0, 8), new THREE.MeshStandardMaterial({ color: 0x3a2414, roughness: 0.5 }));
          rod.rotation.z = PI / 2;
          holder.add(rod);
          world.root.add(holder);
          holder.updateMatrixWorld(true);
          for (const pm of panels) pm.userData.world = pm.getWorldPosition(new THREE.Vector3());
          const nrm = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
          world.add(new Noren(world, panels, new THREE.Vector3(p.x, 0, p.z), nrm));
        }
        // changing room: lockers, baskets, bench, fan, fridge, massage chair, scale
        const taken = 0.1 + mu * 0.6;
        for (let n = 0; n < 4; n++) {
          const grp = lockerBank(kit, 'dress', 1.4, 1.85, 1 + n * 20 + s * 80, taken);
          place(grp, m, s, 1.22, 6.9 + n * 1.45, PI / 2, Y_WOOD, [1.4, 0.44]);
        }
        {
          const shelf = cubbyShelf(kit, 5, 2);
          const p = place(shelf, m, s, 6.12, 12.78, PI, Y_WOOD, [2.2, 0.44]);
          shelf.updateMatrixWorld(true);
          for (const [cx, cy, cz] of shelf.userData.cells) {
            if (r2() < 0.25) continue;
            const wp = new THREE.Vector3(cx, cy, cz).applyMatrix4(shelf.matrixWorld);
            kit.add(shelfBasket(kit), wp.x, wp.z, p.yaw + (r2() - 0.5) * 0.2, { y: wp.y });
          }
        }
        {
          const shelf = cubbyShelf(kit, 4, 2);
          const p = place(shelf, m, s, 2.0, 12.78, PI, Y_WOOD, [1.8, 0.44]);
          shelf.updateMatrixWorld(true);
          for (const [cx, cy, cz] of shelf.userData.cells) {
            if (r2() < 0.35) continue;
            const wp = new THREE.Vector3(cx, cy, cz).applyMatrix4(shelf.matrixWorld);
            kit.add(shelfBasket(kit), wp.x, wp.z, p.yaw + (r2() - 0.5) * 0.2, { y: wp.y });
          }
        }
        {
          const bench = new THREE.Group();
          kit.model(bench, 'painted_wooden_bench', 0, 0, 0, 0, 1);
          const bs = modelSize('painted_wooden_bench');
          place(bench, m, s, 4.2, 9.0, PI / 2, Y_WOOD, [bs.x, bs.z]);
          const bp = at(m, s, 4.2, 8.6, 0);
          batch.add(`basket:${m.idx}`, basketParts, matAt(bp.x, Y_WOOD + bs.y, bp.z, r2() * 6));
        }
        {
          // ceiling fan, spinning
          const fan = model('ceiling_fan');
          const fs = modelSize('ceiling_fan');
          const sc = Math.min(1.2 / Math.max(fs.x, fs.z), 0.9 / fs.y);
          fan.scale.setScalar(sc);
          const p = at(m, s, 4.2, 9.0);
          fan.position.set(p.x, 3.5 - fs.y * sc, p.z);
          world.root.add(fan);
          const speed = 2.2 + r2() * 0.8 - (mu > 0.9 ? 3.4 : 0);
          world.animated.push((dt) => (fan.rotation.y += dt * speed));
        }
        {
          const fr = milkFridge(kit);
          const p = place(fr, m, s, 2.0, 5.3, 0, Y_WOOD, [0.66, 0.55]);
          bakeSources.push({ pos: new THREE.Vector3(p.x + Math.sin(p.yaw) * 0.5, Y_WOOD + 0.9, p.z + Math.cos(p.yaw) * 0.5), color: new THREE.Color(0.85, 0.95, 1), intensity: 2.2, range: 5 });
          fridges.push(poke.add({ pos: new THREE.Vector3(p.x + Math.sin(p.yaw) * 0.3, Y_WOOD + 1.0, p.z + Math.cos(p.yaw) * 0.3), prompt: 'Take a milk', kind: 'fridge', m }));
        }
        {
          const ch = mergeGroup(massageChair(kit));
          const p = at(m, s, 7.45, 8.0, -PI / 2);
          ch.position.set(p.x, Y_WOOD, p.z);
          ch.rotation.y = p.yaw;
          world.root.add(ch);
          world.addFootprint(p.x, p.z, 0.8, 0.9, p.yaw);
          massageChairs.push(poke.add({ pos: new THREE.Vector3(p.x, Y_WOOD + 0.7, p.z), prompt: 'Sit in the massage chair', kind: 'chair', obj: ch, base: ch.position.clone(), m, shake: 0 }));
        }
        {
          const raw = bathScale(kit);
          const sc = mergeGroup(raw, new Set([raw.userData.needle]));
          sc.userData.needle = raw.userData.needle;
          const p = at(m, s, 7.6, 9.8, -PI / 2);
          sc.position.set(p.x, Y_WOOD, p.z);
          sc.rotation.y = p.yaw;
          world.root.add(sc);
          world.addFootprint(p.x, p.z, 0.45, 0.55, p.yaw);
          scales.push(poke.add({ pos: new THREE.Vector3(p.x, Y_WOOD + 0.9, p.z), prompt: 'Step on the scale', kind: 'scale', needle: sc.userData.needle, m, spin: 0 }));
        }
        place(hairDryer(kit), m, s, 7.5, 11.4, -PI / 2, Y_WOOD, [0.5, 0.55]);
        // a slatted drain mat at the bath door
        {
          const mat = new THREE.Group();
          for (let n = 0; n < 9; n++) kit.box(mat, 0.08, 0.025, 0.9, kit.std(0x9a7a52, 0.8), -0.64 + n * 0.16, 0.0125, 0);
          place(mat, m, s, 4.0, 12.5, 0, Y_WOOD);
        }
        // posters and signs
        const posters = [
          boardTexture('poster-milk', 384, 512, '#f6e7b8', [['お風呂上がりに', 0.1, '#1a3a8a'], ['牛乳', 0.3, '#c01818', 900, SERIF], ['MILK', 0.12, '#1a3a8a', 900], ['after your bath', 0.07, '#1a3a8a', 600]], { border: '#c01818' }),
          boardTexture('poster-rinse', 384, 512, '#e8f2f4', [['かけ湯を', 0.16, '#1a4a7a', 900], ['してから', 0.16, '#1a4a7a', 900], ['入りましょう', 0.12, '#1a4a7a', 700], ['Rinse before', 0.07, '#4a4a4a', 600], ['you soak', 0.07, '#4a4a4a', 600]], { border: '#1a4a7a' }),
          boardTexture('poster-towel', 384, 512, '#fbf6ea', [['タオルを', 0.14, '#1a1a1a', 900], ['湯船に', 0.14, '#1a1a1a', 900], ['入れないで', 0.14, '#c01818', 900], ['No towels', 0.08, '#4a4a4a', 600], ['in the bath', 0.08, '#4a4a4a', 600]], { border: '#1a1a1a' }),
          boardTexture('poster-stay', 384, 512, '#efe6d6', [['ごゆっくり', 0.16, '#3a1a1a', 900], ['どうぞ', 0.16, '#3a1a1a', 900], ['Take your time.', 0.08, '#4a4a4a', 600], ['All of it.', 0.08, '#8a1a1a', 600]], { border: '#3a1a1a' }),
        ];
        const pick = (n) => posters[(n + m.idx + s) % (mu > 0.7 ? 4 : 3)];
        const pa = at(m, s, 1.02, 6.8, PI / 2);
        kit.add(hangingPlate(kit, pick(0), 0.42, 0.56, 0, 0, 0), pa.x, pa.z, pa.yaw, { y: 2.45 });
        const pb = at(m, s, 7.98, 12.2, -PI / 2);
        kit.add(hangingPlate(kit, pick(1), 0.42, 0.56, 0, 0, 0), pb.x, pb.z, pb.yaw, { y: 1.6 + Y_WOOD });
        // steamy glass above the basket shelf
        {
          const gm = kit.mat('steamGlass', () => {
            const t = steamGlassTexture().clone();
            t.userData.cached = true;
            return new THREE.MeshStandardMaterial({ map: t, emissive: 0xdde8e8, emissiveMap: t, emissiveIntensity: 0.45, roughness: 0.25 });
          });
          const frame = kit.std(0x4a3222, 0.5);
          for (const [lx, w] of [[6.0, 2.0], [2.0, 1.8]]) {
            const grp = new THREE.Group();
            kit.plane(grp, w, 1.0, gm, 0, 0, 0);
            for (let n = 0; n <= 3; n++) kit.box(grp, 0.04, 1.04, 0.03, frame, -w / 2 + (n * w) / 3, 0, 0.01);
            kit.box(grp, w + 0.04, 0.04, 0.03, frame, 0, 0.5, 0.01);
            kit.box(grp, w + 0.04, 0.04, 0.03, frame, 0, -0.5, 0.01);
            const p = at(m, s, lx, 12.99, PI);
            kit.add(grp, p.x, p.z, p.yaw, { y: Y_WOOD + 1.75 });
          }
          // glass door into the bath hall, one leaf slid open
          const door = new THREE.Group();
          for (const [x, zz] of [[-0.52, 0.03], [-0.42, -0.03]]) {
            kit.plane(door, 0.9, 1.7, gm, x, 1.05, zz);
            kit.plane(door, 0.9, 1.7, gm, x, 1.05, zz, 0, PI, 0);
            for (const dx of [-0.46, 0.46]) kit.box(door, 0.05, 1.95, 0.04, frame, x + dx, 0.98, zz);
            kit.box(door, 0.95, 0.06, 0.04, frame, x, 0.03, zz);
            kit.box(door, 0.95, 0.06, 0.04, frame, x, 1.93, zz);
          }
          const p = at(m, s, 4.0, 13.5, 0);
          kit.add(door, p.x, p.z, p.yaw, { y: Y_WOOD });
          const q = at(m, s, 3.5, 13.5, 0);
          world.addFootprint(q.x, q.z, 1.0, 0.1, p.yaw);
        }
        // TV high in the corner
        {
          const tv = crtTv(kit, m.idx * 2 + s + 3);
          const p = at(m, s, 1.35, 12.4, PI * 0.75);
          kit.add(tv, p.x, p.z, p.yaw, { y: 2.55 });
          const br = new THREE.Group();
          kit.box(br, 0.4, 0.03, 0.5, kit.std(0x3a3a3a, 0.5, 0.6), 0, 0, 0);
          kit.add(br, p.x, p.z, p.yaw, { y: 2.53 });
        }
        // lights
        for (const lz of [6.4, 9.0, 11.6]) {
          const p = at(m, s, 4.0, lz);
          fixture(p.x, 3.47, p.z, { intensity: 1, rot: PI / 2 });
        }

        // ---------------- bath hall
        const fogged = mu > 0.75;
        const stations = [];
        for (let lz = 15.5; lz <= 19.5; lz += 1) stations.push([1.0, lz, PI / 2], [8.0, lz, -PI / 2]);
        for (let lz = 16.5; lz <= 19.5; lz += 1) stations.push([4.0, lz, -PI / 2], [5.0, lz, PI / 2]);
        for (const [lx, lz, yaw] of stations) {
          const st = washStation(kit, rng, { fogged: fogged && r2() < 0.5, bottles: r2() < 0.3 ? 1 + Math.floor(r2() * 3) : 0 });
          const p = place(st, m, s, lx, lz, yaw, Y_BATH);
          const fx = Math.sin(p.yaw);
          const fz = Math.cos(p.yaw);
          world.addFootprint(p.x + fx * 0.13, p.z + fz * 0.13, 1.0, 0.27, p.yaw);
          // stool and bucket
          const roll = r2();
          if (roll < 0.75) {
            const d = 0.62 + r2() * 0.1;
            const sx = p.x + fx * d;
            const sz = p.z + fz * d;
            const nice = r2() < 0.12;
            if (nice) batch.add(`stoolw:${m.idx}`, stoolWood, matAt(sx, Y_BATH, sz, p.yaw + (r2() - 0.5) * 0.4));
            else batch.add(`stool:${m.idx}`, plasticStoolParts(), matAt(sx, Y_BATH, sz, p.yaw + (r2() - 0.5) * 0.3));
            const topY = nice ? stoolSize.y : 0.25;
            if (r2() < 0.55) addBucket(m, s, sx, Y_BATH + topY, sz, r2() * 6, true);
            else addBucket(m, s, p.x + fx * 0.14 + Math.cos(p.yaw) * 0.3 * (r2() < 0.5 ? 1 : -1), Y_BATH + 0.525, p.z + fz * 0.14 - Math.sin(p.yaw) * 0.3, r2() * 6);
          } else if (roll < 0.9) {
            addBucket(m, s, p.x + fx * 0.14 - Math.cos(p.yaw) * 0.28, Y_BATH + 0.525, p.z + fz * 0.14 + Math.sin(p.yaw) * 0.28, r2() * 6);
          }
        }
        // a pile of stools and buckets by the door
        {
          const p = at(m, s, 1.5, 14.5);
          for (let n = 0; n < 5; n++) batch.add(`stool:${m.idx}`, plasticStoolParts(), matAt(p.x, Y_BATH + n * 0.07, p.z, 0.05 * n));
          for (let n = 0; n < 6; n++) addBucket(m, s, p.x + 0.45, Y_BATH + n * 0.028, p.z + 0.05, n * 0.3);
        }
        // bath: spouts pouring in, signs on the tiles below the mural
        for (const [lx, label, sub] of [[2.6, 'あつ湯 42℃', 'HOT BATH 42°C'], [6.5, s ? '電気風呂' : '薬湯 ゆず湯', s ? 'ELECTRIC BATH' : 'YUZU BATH']]) {
          const p = at(m, s, lx, 25.98, PI);
          const sign = boardTexture(`bsign:${label}`, 512, 160, '#f6f2e8', [[label, 0.5, '#c01818', 900], [sub, 0.26, '#1a3a6a', 700]], { border: '#1a3a6a' });
          kit.add(hangingPlate(kit, sign, 0.8, 0.25, 0, 0, 0, 0, { frame: 0xd8dcdc }), p.x, p.z, p.yaw, { y: 1.62 });
          const spout = new THREE.Group();
          const brass = kit.std(0xc8a050, 0.3, 0.9);
          kit.cyl(spout, 0.035, 0.035, 0.35, brass, 0, 1.0, 0.17, PI / 2);
          kit.cyl(spout, 0.05, 0.04, 0.1, brass, 0, 0.98, 0.35, 0.3);
          kit.cyl(spout, 0.018, 0.028, 1.0 - (Y_SURF + 0.02), kit.mat('stream', () => new THREE.MeshStandardMaterial({ color: 0xeaf6f6, transparent: true, opacity: 0.45, roughness: 0.05, emissive: 0x9ab8b8, emissiveIntensity: 0.4, depthWrite: false })), 0, (1.0 + Y_SURF) / 2 - 0.02, 0.38, 0, 0, 0, 8);
          const q = at(m, s, lx + 0.3, 26.0, PI);
          kit.add(spout, q.x, q.z, q.yaw, { y: 0 });
        }
        if (s === 1) {
          const warn = boardTexture('ewarn', 384, 256, '#fff4c0', [['注意', 0.3, '#c01818', 900], ['心臓の弱い方は', 0.16, '#1a1a1a'], ['ご遠慮ください', 0.16, '#1a1a1a'], ['Not for weak hearts', 0.14, '#6a1a1a', 600]], { border: '#c01818' });
          const p = at(m, s, 7.98, 22.2, -PI / 2);
          kit.add(hangingPlate(kit, warn, 0.42, 0.28, 0, 0, 0), p.x, p.z, p.yaw, { y: 1.35 });
          // electrode plates on the bath wall
          for (const lz of [22.6, 24.4]) {
            const plate = new THREE.Group();
            kit.box(plate, 0.5, 0.35, 0.02, kit.std(0xb8bcbc, 0.25, 0.9), 0, 0, 0);
            for (let n = 0; n < 5; n++) kit.box(plate, 0.4, 0.015, 0.01, kit.std(0x333333, 0.5), 0, -0.12 + n * 0.06, 0.012);
            const q = at(m, s, 7.97, lz, -PI / 2);
            kit.add(plate, q.x, q.z, q.yaw, { y: 0.05 });
          }
        } else {
          // yuzu floating in the herbal bath
          for (let n = 0; n < 9; n++) {
            const q = at(m, s, 6.2 + r2() * 1.6, 21.3 + r2() * 4.4);
            yuzus.push({ ref: batch.add('yuzu', yuzuParts, matAt(q.x, Y_SURF, q.z)), x: q.x, z: q.z, ph: r2() * 6, vx: (r2() - 0.5) * 0.04, vz: (r2() - 0.5) * 0.04, m });
          }
        }
        clock(m, s, 6.2, 14.02, 0, 2.6);
        // lights: along the low ceiling on the outer side, and high over the partition
        for (const lz of [15.5, 19.5, 23.5]) {
          const p = at(m, s, 2.2, lz);
          fixture(p.x, BATH_CEIL - 0.02, p.z, { intensity: 1.5, rot: PI / 2 });
        }
      }
      for (const lz of [16, 21.5]) {
        const p = at(m, 0, 8.5, lz);
        fixture(p.x, BATH_CEIL_HI - 0.02, p.z, { intensity: 1.7, rot: PI / 2 });
      }
      // genkan lights
      for (const lx of [6.0, 11.0]) {
        const p = at(m, 0, lx, 2.2);
        fixture(p.x, 2.98, p.z, { intensity: 0.9 });
      }
      // mural across the back wall of the bath hall, over the partition
      {
        const tex = muralTexture(m.variant);
        const mm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.14 });
        const mh = BATH_CEIL - 2.05;
        const p = at(m, 0, 8.5, 25.985, PI);
        const mural = new THREE.Mesh(new THREE.PlaneGeometry(15, mh), mm);
        mural.position.set(p.x, 1.95 + mh / 2, p.z);
        mural.rotation.y = p.yaw;
        world.root.add(mural);
        // the raised centre shows the painted sky continuing
        const top = new THREE.Mesh(new THREE.PlaneGeometry(7, BATH_CEIL_HI - BATH_CEIL + 0.01), new THREE.MeshStandardMaterial({ color: m.variant === 'figure' ? 0x221a3e : 0x1d62b8, roughness: 0.8, emissive: m.variant === 'figure' ? 0x221a3e : 0x1d62b8, emissiveIntensity: 0.15 }));
        top.position.set(p.x, (BATH_CEIL + BATH_CEIL_HI) / 2, p.z);
        top.rotation.y = p.yaw;
        world.root.add(top);
        m.mural = { x: p.x, z: p.z };
      }
      // ---------------- the facade on the alley
      {
        const f = at(m, 0, 8.5, -0.02, PI);
        const grp = new THREE.Group();
        // tiled eaves over the entrance and along the top of the front
        const kawara = kit.mat('kawara', () => {
          const t = kawaraTexture().clone();
          t.repeat.set(6, 1);
          t.userData.cached = true;
          return new THREE.MeshStandardMaterial({ map: t, roughness: 0.45, metalness: 0.2 });
        });
        const eaveWood = kit.std(0x2a1c12, 0.6);
        kit.box(grp, 5.4, 0.1, 1.4, kawara, 0, 3.0, 0.66, 0.3);
        kit.box(grp, 5.4, 0.12, 0.1, eaveWood, 0, 2.8, 1.32);
        for (const x of [-2.5, 2.5]) kit.box(grp, 0.1, 0.1, 1.3, eaveWood, x, 2.9, 0.65, 0.3);
        kit.box(grp, MW, 0.12, 1.0, kawara, 0, 4.75, 0.42, 0.35);
        kit.box(grp, MW, 0.14, 0.08, eaveWood, 0, 4.6, 0.9);
        // wooden lattice either side of the door
        for (const sx of [-1, 1]) {
          for (let n = 0; n < 16; n++) kit.box(grp, 0.035, 1.7, 0.05, eaveWood, sx * (2.2 + n * 0.1), 1.75, 0.05);
          kit.box(grp, 1.65, 0.06, 0.07, eaveWood, sx * 2.95, 2.62, 0.05);
          kit.box(grp, 1.65, 0.06, 0.07, eaveWood, sx * 2.95, 0.9, 0.05);
        }
        // red paper lanterns
        const lanTex = boardTexture('chochin', 256, 256, '#e03a1a', [['ゆ', 0.7, '#1a0a06', 900, SERIF]]);
        const lanMat = kit.mat('chochin', () => new THREE.MeshStandardMaterial({ map: lanTex, emissive: 0xffffff, emissiveMap: lanTex, emissiveIntensity: 1.1, roughness: 0.8 }));
        for (const sx of [-1, 1]) {
          kit.sphere(grp, 0.2, lanMat, sx * 1.85, 2.3, 1.05, 1, 1.35, 1, 16);
          kit.cyl(grp, 0.12, 0.12, 0.05, kit.std(0x111111, 0.5), sx * 1.85, 2.58, 1.05);
          kit.cyl(grp, 0.12, 0.12, 0.05, kit.std(0x111111, 0.5), sx * 1.85, 2.02, 1.05);
          kit.cyl(grp, 0.01, 0.01, 0.25, kit.std(0x111111, 0.5), sx * 1.85, 2.72, 1.05);
        }
        // name board
        const nameTex = boardTexture(`name:${m.name}`, 1024, 256, [70, 44, 24], [[m.name, 0.72, '#f4e8c8', 900, SERIF]], { wood: true, border: '#c8a060' });
        kit.add(hangingPlate(kit, nameTex, 2.6, 0.65, 0, 0, 0, 0, { glow: 0.35, frame: 0x2a1a0e }), 0, 0, 0);
        const nb = kit.placed.pop();
        nb.position.set(0, 4.0, 0.03);
        grp.add(nb);
        // glowing ゆ light box
        const yuTex = boardTexture('yu-box', 256, 256, '#fbf6ea', [['ゆ', 0.8, '#c01818', 900]]);
        const box = new THREE.Group();
        kit.box(box, 0.5, 0.5, 0.16, kit.std(0x333333, 0.5, 0.5), 0, 0, 0);
        const face = kit.mat('yuFace', () => new THREE.MeshStandardMaterial({ map: yuTex, emissive: 0xffffff, emissiveMap: yuTex, emissiveIntensity: 1.3 }));
        kit.plane(box, 0.46, 0.46, face, 0, 0, 0.081);
        kit.plane(box, 0.46, 0.46, face, 0, 0, -0.081, 0, PI, 0);
        box.position.set(-3.2, 3.55, 0.45);
        box.rotation.y = PI / 2;
        kit.box(grp, 0.04, 0.04, 0.5, kit.std(0x333333, 0.5, 0.6), -3.2, 3.83, 0.22);
        grp.add(box);
        kit.add(grp, f.x, f.z, f.yaw, { y: 0 });
        const n = new THREE.Vector3(Math.sin(f.yaw), 0, Math.cos(f.yaw));
        bakeSources.push({ pos: new THREE.Vector3(f.x + n.x * 0.9, 2.6, f.z + n.z * 0.9), color: new THREE.Color(1, 0.8, 0.55), intensity: 5, range: 9 });
        fixture(f.x + n.x * 0.7, 2.85, f.z + n.z * 0.7, { intensity: 0.6, color: 0xffc890, visible: false });
        // noren ゆ outside the doors
        const tex = norenTexture('yu', m.name);
        const nm = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.95 });
        const holder = new THREE.Group();
        holder.position.set(f.x + n.x * 0.35, 2.28, f.z + n.z * 0.35);
        holder.rotation.y = f.yaw;
        const panels = [];
        for (let k2 = 0; k2 < 3; k2++) {
          const geo = new THREE.PlaneGeometry(0.92, 1.0, 1, 4);
          geo.translate(0, -0.5, 0);
          const uv = geo.attributes.uv;
          for (let v = 0; v < uv.count; v++) uv.setX(v, (k2 + uv.getX(v)) / 3);
          const pm = new THREE.Mesh(geo, nm);
          pm.position.set(-0.95 + k2 * 0.95, 0, 0);
          pm.userData.push = 0;
          holder.add(pm);
          panels.push(pm);
        }
        world.root.add(holder);
        holder.updateMatrixWorld(true);
        for (const pm of panels) pm.userData.world = pm.getWorldPosition(new THREE.Vector3());
        world.add(new Noren(world, panels, holder.position.clone(), n));
        // chimney behind the bath hall, with the name down its side
        const c = at(m, 0, 14.5, 26.5);
        const chim = new THREE.Group();
        const conc = kit.std(0x8a8680, 0.9);
        kit.cyl(chim, 0.32, 0.48, 22, conc, 0, 11, 0, 0, 0, 0, 16);
        kit.cyl(chim, 0.36, 0.36, 0.4, kit.std(0x2a2826, 0.8), 0, 21.9, 0, 0, 0, 0, 16);
        const vt = boardTexture(`chim:${m.name}`, 128, 512, '#f2eee4', m.name.split('').map((ch) => [ch, 0.24, '#1a1a1a', 900, SERIF]));
        const vm = kit.mat(`chimSign:${m.name}`, () => new THREE.MeshStandardMaterial({ map: vt, roughness: 0.8 }));
        for (const a of [0, PI / 2, PI, -PI / 2]) {
          kit.plane(chim, 0.46, 2.4, vm, Math.sin(a) * 0.4, 15, Math.cos(a) * 0.4, 0, a, 0);
        }
        const warn = keep(kit.sphere(chim, 0.12, kit.glow(0xff2a1a, 3), 0, 22.2, 0));
        warn.userData.blink = true;
        kit.add(chim, c.x, c.z, 0, { y: 0 });
      }
      // lamps over the side doors
      for (const d of m.doors || []) {
        const p = at(m, 0, d.li === 0 ? -0.1 : 17.1, d.lj + 0.5, d.li === 0 ? -PI / 2 : PI / 2);
        fixture(p.x, 2.45, p.z, { intensity: 0.45, color: 0xffb870, visible: false });
        const bulb = new THREE.Group();
        kit.sphere(bulb, 0.06, kit.glow(0xffd090, 4), 0, 0, 0);
        kit.box(bulb, 0.08, 0.08, 0.2, kit.std(0x2a2a2a, 0.5), 0, 0.06, -0.08);
        kit.add(bulb, p.x, p.z, p.yaw, { y: 2.45 });
      }
    }

    // ---- the alley: poles, wires, vending machines, a post box
    const poles = [];
    for (const x of [4.5, 13.5, 24.5, 33.5, 44.5, 53.5]) {
      const z = ALLEY0 + (poles.length % 2 ? ALLEY - 0.35 : 0.35);
      const yaw = poles.length % 2 ? PI : 0;
      kit.add(utilityPole(kit), x, z, yaw, { y: Y_ALLEY, collide: [0.34, 0.34] });
      const lz = z + (yaw ? -1.02 : 1.02);
      fixture(x, 4.6, lz, { intensity: 1.1, color: 0xffd0a0, visible: false });
      poles.push(new THREE.Vector3(x, Y_ALLEY, z));
    }
    {
      const wireMat = new THREE.LineBasicMaterial({ color: 0x0a0a0a });
      for (let n = 0; n < poles.length - 1; n++) {
        for (const [dy, dx] of [[6.8, -0.6], [6.8, 0.6], [7.6, -0.5], [7.6, 0.5]]) {
          const a = poles[n].clone().add(new THREE.Vector3(dx, dy + Y_ALLEY, 0));
          const b = poles[n + 1].clone().add(new THREE.Vector3(dx, dy + Y_ALLEY, 0));
          const pts = [];
          for (let t = 0; t <= 12; t++) {
            const p = a.clone().lerp(b, t / 12);
            p.y -= Math.sin((t / 12) * PI) * 0.45;
            pts.push(p);
          }
          world.root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
        }
      }
    }
    for (const m of mods) {
      const vx = m.row ? 3.2 : 13.8;
      const p = at(m, 0, vx, -0.4, PI);
      kit.add(P.vendingMachine.build(kit, rng), p.x, p.z, p.yaw, { y: Y_ALLEY, collide: [0.95, 0.75] });
      bakeSources.push({ pos: new THREE.Vector3(p.x + Math.sin(p.yaw) * 0.8, 1.2, p.z + Math.cos(p.yaw) * 0.8), color: new THREE.Color(0.9, 0.95, 1), intensity: 3, range: 6 });
      if (m.idx === 4) {
        const q = at(m, 0, 12.2, -0.6, PI);
        kit.add(postBox(kit), q.x, q.z, 0, { y: Y_ALLEY, collide: [0.46, 0.46] });
      }
      const t = at(m, 0, m.row ? 14.8 : 2.2, -0.35, PI);
      const can = new THREE.Group();
      kit.model(can, 'metal_trash_can', 0, 0, 0, rng.float(0, 6), 0.8);
      kit.add(can, t.x, t.z, 0, { y: Y_ALLEY, collide: [0.5, 0.5] });
    }
    // passages: pipes, a boiler, firewood, gas meters
    for (const c0 of gapCols) {
      for (const [j0, j1] of [[ROW_A + 7, ALLEY0 - 1], [ROW_B + 1, H - 3]]) {
        for (const [x, face] of [[c0 + 0.06, 1], [c0 + GAP - 0.06, -1]]) {
          const pipes = new THREE.Group();
          for (const [y, r, col] of [[2.55, 0.06, 0x7a6a5a], [2.8, 0.035, 0x8a8a88], [0.35, 0.05, 0x5a5048]]) kit.cyl(pipes, r, r, j1 - j0, kit.std(col, 0.5, 0.6), x + face * r * 1.5, y, (j0 + j1) / 2, PI / 2);
          kit.add(pipes, 0, 0, 0);
        }
      }
      for (const [j, face] of [[ROW_A + 12, 1], [ROW_B + 8, -1], [ROW_A + 22, -1]]) {
        const x = face > 0 ? c0 + 0.45 : c0 + GAP - 0.45;
        kit.add(woodPile(kit, rng, 1.6), x, j + 0.5, PI / 2, { y: 0, collide: [1.6, 0.6] });
      }
      for (const j of [ROW_A + 18, ROW_B + 14]) {
        const u2 = new THREE.Group();
        kit.model(u2, 'utility_box_01', 0, 0, 0, 0, 0.8);
        kit.add(u2, c0 + GAP - 0.2, j, -PI / 2, { y: 1.1 });
        const tb = new THREE.Group();
        kit.model(tb, 'trashbag', 0, 0, 0, rng.float(0, 6), 0.9);
        kit.add(tb, c0 + 0.5, j + 4, 0, { y: 0 });
      }
      // boiler tank
      const boiler = new THREE.Group();
      kit.cyl(boiler, 0.55, 0.55, 2.2, kit.std(0x5a6a6a, 0.5, 0.6), 0, 1.1, 0, 0, 0, 0, 16);
      kit.cyl(boiler, 0.1, 0.1, 3.5, kit.std(0x3a3a3a, 0.6, 0.6), 0, 3.4, 0);
      kit.cyl(boiler, 0.12, 0.12, 0.05, kit.std(0xe8e8e0, 0.3), 0.3, 1.5, 0.46, PI / 2);
      kit.add(boiler, c0 + 1.5, ROW_B + GAP + 20.5, 0, { y: 0, collide: [1.1, 1.1] });
      bakeSources.push({ pos: new THREE.Vector3(c0 + 1.5, 0.4, ROW_B + 23.2), color: new THREE.Color(1, 0.5, 0.2), intensity: 1.5, range: 4 });
    }

    // ---- roof terrace: fence, lanterns, rocks around the open-air bath
    {
      const lanterns = [[T0 + 1.5, 2.0], [T1 - 0.5, 2.0], [T0 + 1.5, 8.2], [T1 - 0.5, 8.2], [rcx - 9, 5], [rcx + 9, 5], [rcx - 4, 1.5], [rcx + 4, 1.5], [rcx - 5, 8.4], [rcx + 5.5, 8.4]];
      for (const [x, z] of lanterns) {
        kit.add(P.stoneLantern.build(kit, rng), x, z, 0, { y: Y_TERR, collide: [0.5, 0.5] });
        bakeSources.push({ pos: new THREE.Vector3(x, Y_TERR + 1.3, z), color: new THREE.Color(1, 0.65, 0.3), intensity: 3.2, range: 7 });
      }
      for (let a = 0; a < PI * 2; a += PI / 6) {
        const x = rcx + Math.cos(a) * 8.2;
        const z = rcz + Math.sin(a) * 3.5;
        if (Math.sin(a) > 0.3 && Math.abs(Math.cos(a)) < 0.6) continue; // the way in
        const rk = new THREE.Group();
        kit.model(rk, 'rock_moss_set_01', 0, 0, 0, rng.float(0, 6), rng.float(0.2, 0.28));
        kit.add(rk, x, z, 0, { y: Y_TERR - 0.15 });
      }
      const sign = boardTexture('roten', 512, 160, [70, 44, 24], [['露天風呂', 0.55, '#f4e8c8', 900, SERIF], ['OPEN-AIR BATH', 0.25, '#e8d0a0', 700]], { wood: true });
      kit.add(hangingPlate(kit, sign, 1.2, 0.38, 0, 0, 0, 0, { glow: 0.3 }), rcx, 1.03, 0, { y: Y_TERR + 1.7 });
      const bucket = new THREE.Group();
      kit.model(bucket, 'wooden_bucket_02', 0, 0, 0, 0, 0.8);
      kit.add(bucket, rcx + 4, 8.3, 0, { y: Y_TERR, collide: [0.4, 0.4] });
    }

    kit.finish();

    // ---- light fixtures (one pool; visible tubes on an instanced mesh)
    world.root.add(new THREE.HemisphereLight(0xdbe8f0, 0x6a6258, 0.55));
    const pool = new LightPool(world.root, world.lightCount, { type: world.game.quality.lights <= 4 ? 'point' : 'rect', color: 0xfff4e6, intensity: 26, distance: 12, width: 1.2, height: 0.25 });
    pool.baseColor.setRGB(2.2, 2.15, 2.0);
    const tubes = fixtures.filter((f) => f.visible);
    const tubeMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 0.05, 0.14), new THREE.MeshBasicMaterial({ color: 0xffffff }), Math.max(1, tubes.length));
    const housing = new THREE.InstancedMesh(new THREE.BoxGeometry(1.32, 0.07, 0.26), new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.4, metalness: 0.3 }), Math.max(1, tubes.length));
    let ti = 0;
    const c = new THREE.Color();
    for (const f of fixtures) {
      const [i, j] = g.cellOf(f.x, f.z);
      const un = g.inBounds(i, j) ? world.unease(i, j) : 0;
      const dead = rng.chance(0.03 + un * 0.15);
      const fx = { pos: new THREE.Vector3(f.x, f.y, f.z), flicker: !dead && rng.chance(0.05 + un * 0.2) ? rng.float(0.05, 0.25) : 0, dead, intensity: 26 * f.intensity, color: f.color, rot: f.rot };
      if (f.visible) {
        _m.makeRotationY(f.rot).setPosition(f.x, f.y - 0.04, f.z);
        tubeMesh.setMatrixAt(ti, _m);
        tubeMesh.setColorAt(ti, c.setRGB(2.2, 2.15, 2.0));
        _m.makeRotationY(f.rot).setPosition(f.x, f.y - 0.01, f.z);
        housing.setMatrixAt(ti, _m);
        fx.instance = ti++;
      }
      pool.add(fx);
    }
    tubeMesh.count = ti;
    housing.count = ti;
    world.root.add(tubeMesh, housing);
    pool.mesh = tubeMesh;
    world.lightPool = pool;

    batch.finish();

    // ---- steam over the baths
    const wet = [];
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (isWet(i, j)) wet.push([i, j]);
    const SN = 320;
    const sPos = new Float32Array(SN * 3);
    const sAlpha = new Float32Array(SN);
    const sSize = new Float32Array(SN);
    const sLife = [];
    const respawn = (n, t0 = Math.random()) => {
      const [i, j] = wet[(Math.random() * wet.length) | 0];
      sPos[n * 3] = i + Math.random();
      sPos[n * 3 + 1] = surfOf(i, j) + 0.05;
      sPos[n * 3 + 2] = j + Math.random();
      sLife[n] = { dim: bathKind[K(i, j)] === 3 ? 0.35 : 1, t: t0 * 8, max: 6 + Math.random() * 5, vx: (Math.random() - 0.5) * 0.12, vz: (Math.random() - 0.5) * 0.12, vy: 0.18 + Math.random() * 0.2 };
      sSize[n] = 2.0 + Math.random() * 2.0;
    };
    for (let n = 0; n < SN; n++) respawn(n);
    const sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    sGeo.setAttribute('aAlpha', new THREE.BufferAttribute(sAlpha, 1));
    sGeo.setAttribute('aSize', new THREE.BufferAttribute(sSize, 1));
    const steamMat = new THREE.ShaderMaterial({
      uniforms: { tex: { value: puffTexture() }, uScale: { value: 600 }, uColor: { value: new THREE.Color(0.95, 0.97, 1.0) } },
      vertexShader: /* glsl */ `
        attribute float aAlpha;
        attribute float aSize;
        uniform float uScale;
        varying float vA;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = min(aSize * uScale / max(0.5, -mv.z), 220.0);
          vA = aAlpha * smoothstep(1.0, 4.0, -mv.z);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tex;
        uniform vec3 uColor;
        varying float vA;
        void main() {
          float a = texture2D(tex, gl_PointCoord).a * vA;
          if (a < 0.004) discard;
          gl_FragColor = vec4(uColor, a);
        }`,
      transparent: true,
      depthWrite: false,
    });
    const steam = new THREE.Points(sGeo, steamMat);
    steam.frustumCulled = false;
    steam.renderOrder = 3;
    world.root.add(steam);

    // ---- residents
    const keeperModel = LOOKS.keeper();
    applyPose(keeperModel.userData.rig, 'sit');
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.32), new THREE.MeshStandardMaterial({ map: newspaperTexture(), roughness: 0.9, side: THREE.DoubleSide }));
    paper.position.set(0, -0.06, 0.34);
    paper.rotation.x = -0.35;
    keeperModel.userData.rig.bones.chest.add(paper);
    let keeperMod = spawnMod;
    const seatAt = (m) => m.bandai.seat.clone();
    keeperModel.position.copy(seatAt(spawnMod));
    keeperModel.rotation.y = spawnMod.bandai.yaw;
    const keeper = new NPC(world, {
      name: 'the keeper',
      pos: keeperModel.position.clone(),
      model: keeperModel,
      voice: 0.8,
      radius: 0,
      face: false,
      conversations: [
        ['Evening. ¥520.', '...Or whatever you have. Nobody has paid in years.', 'Towels are ¥50. Soap is ¥30. The way out is not for sale.'],
        ['Drink milk after your bath. It’s the rule.', 'I don’t make the rules.', '...Well. I did make that one.'],
        ['The big bath is 42 degrees. The other big bath is also 42 degrees.', 'There are a lot of big baths.'],
        ['If you see someone standing in the steam, don’t stare. It’s rude.', 'They’re just drying off. For a very long time.'],
        ['Mind the deep end. Some of the baths go further down than the building does.', 'People come up somewhere else. They always look so refreshed.'],
        ['We close at midnight.', '(He glances at the clock. It is 11:58. It has been 11:58 since you arrived.)'],
        ['...', '(He turns a page of the newspaper. The date is today. It was also today yesterday.)'],
      ],
    });
    keeper.interactRange = 3.2;
    keeper.aimHeight = 0.5;
    const moved = [
      ['Welcome.', '(It is the same man. He is on the same page of the same newspaper.)'],
      ['Oh. You again.', '...Or me again. Hard to say, this late.'],
      ['(He does not look up.)', 'The next one is also the same. You can check if you like.'],
    ];
    let movedN = 0;
    const baseTalk = keeper.interact.bind(keeper);
    keeper.interact = (game) => {
      if (keeper.moved) {
        keeper.moved = false;
        game.openDialog(keeper.name, moved[movedN++ % moved.length], keeper.voice);
      } else baseTalk(game);
    };
    const eye = new THREE.Vector3();
    let read = 0;
    let bodyYaw = 0;
    keeper.idle = (dt, ctx) => {
      const rig = keeperModel.userData.rig;
      applyPose(rig, 'sit');
      const t = keeper.t;
      rig.rot('armL', -0.85, 0.15, 0.08);
      rig.rot('foreL', -1.1, 0.2, 0);
      rig.rot('armR', -0.85, -0.15, -0.08);
      rig.rot('foreR', -1.1, -0.2, 0);
      rig.rot('spine', 0.12 + Math.sin(t * 1.4) * 0.01, 0, 0);
      const p = ctx.player.pos;
      const near = Math.hypot(p.x - keeperModel.position.x, p.z - keeperModel.position.z) < 5.5;
      read += ((near ? 0 : 1) - read) * Math.min(1, dt * 1.5);
      // turns a little on his cushion toward you
      const want = near ? Math.atan2(p.x - keeperModel.position.x, p.z - keeperModel.position.z) - keeperMod.bandai.yaw : 0;
      const rel = Math.max(-0.7, Math.min(0.7, Math.atan2(Math.sin(want), Math.cos(want))));
      bodyYaw += (rel - bodyYaw) * Math.min(1, dt * 1.2);
      keeperModel.rotation.y = keeperMod.bandai.yaw + bodyYaw;
      if (read > 0.5) {
        rig.rot('neck', 0.35, Math.sin(t * 0.2) * 0.1, 0);
        rig.rot('head', 0.4, 0, 0);
      } else {
        keeperModel.updateMatrixWorld(true);
        lookAt(keeperModel, eye.copy(ctx.camera.position), { max: 1.1 });
      }
      paper.visible = true;
    };
    world.add(keeper);
    world.onDispose.push(() => paper.geometry.dispose());

    // the keeper is at whichever bandai you are nearest, if you aren't looking
    const modOfPos = (x, z) => {
      const [i, j] = g.cellOf(x, z);
      return g.inBounds(i, j) ? modAt[K(i, j)] : -1;
    };

    // capybaras soaking: one, and more the deeper you drift
    const capyCount = Math.min(8, 1 + world.depth + (world.depth >= 2 ? 1 : 0));
    const capyLines = [
      ['(It does not acknowledge you. This is the most relaxed anything has ever been.)'],
      ['(You lower yourself into the water next to it. 42 degrees.)', '(Your problems dissolve one at a time, starting with your name.)'],
      ['(The yuzu on its head turns slowly to face you.)'],
      ['(It exhales through its nose. The steam spells a word you don’t know yet.)'],
      ['(It opens one eye, then closes it. You have been judged, and found acceptable.)'],
    ];
    const capySpots = [];
    const modsByDist = [...mods].sort((a, b) => a.u - b.u);
    for (const m of modsByDist) {
      for (const s of [0, 1]) {
        const p = at(m, s, 2.2 + (s ? 0.4 : 0), 23.2 + (m.idx % 2) * 0.8, PI + (s ? 0.5 : -0.4));
        capySpots.push({ ...p, y: Y_SURF });
      }
    }
    capySpots.splice(2, 0, { x: rcx + 2.5, z: rcz + 0.5, yaw: -0.6, y: Y_TERR - 0.1 });
    const capys = [];
    for (let n = 0; n < capyCount && n < capySpots.length; n++) {
      const sp2 = capySpots[n];
      const [ci, cj] = g.cellOf(sp2.x, sp2.z);
      if (deep.has(K(ci, cj))) continue;
      const fig = LOOKS.capybara();
      beastPose(fig, 'loaf');
      fig.scale.setScalar(1.25);
      // heavy eyelids
      const lidMat = new THREE.MeshStandardMaterial({ color: 0x6a4a30, roughness: 0.95 });
      for (const e of fig.userData.eyes) {
        const r = e.geometry.boundingSphere?.radius || 0.018;
        const lid = new THREE.Mesh(new THREE.SphereGeometry(r * 1.18, 12, 8, 0, PI * 2, 0, PI * 0.5), lidMat);
        lid.rotation.x = 0.55;
        e.add(lid);
      }
      const base = sp2.y - 0.36;
      fig.position.set(sp2.x, base, sp2.z);
      fig.rotation.y = sp2.yaw;
      const capy = new NPC(world, { name: 'the capybara', pos: fig.position.clone(), model: fig, voice: 0.5, radius: 0.45, face: false, prompt: 'Join the capybara', conversations: [capyLines[n % capyLines.length], ...capyLines.filter((_, k) => k !== n % capyLines.length)], onTalk: (game) => game.audio.splash(null, 0.6) });
      capy.aimHeight = 0.35;
      capy.interactRange = 3;
      const ph = rng.float(0, 6);
      capy.idle = (dt) => {
        fig.position.y = base + Math.sin(capy.t * 0.7 + ph) * 0.012;
        fig.rotation.y = sp2.yaw + Math.sin(capy.t * 0.08 + ph) * 0.25;
        fig.rotation.z = Math.sin(capy.t * 0.5 + ph) * 0.02;
        const rig = fig.userData.rig;
        rig.rot('neck', -0.05 + Math.sin(capy.t * 0.3 + ph) * 0.04, 0, 0);
        rig.rot('head', 0.05, Math.sin(capy.t * 0.15 + ph) * 0.15, Math.sin(capy.t * 0.2) * 0.05);
        if (fig.userData.yuzu) fig.userData.yuzu.rotation.y += dt * 0.15;
      };
      world.add(capy);
      capys.push(capy);
    }

    // deeper in, a capybara cools off on a changing-room bench with a towel on its head
    if (world.depth >= 2) {
      const m = rng.pick(mods.filter((x) => x !== spawnMod));
      const p = at(m, 0, 4.2, 9.35, PI / 2);
      const fig = LOOKS.capybara();
      beastPose(fig, 'sit');
      fig.scale.setScalar(1.1);
      if (fig.userData.yuzu) fig.userData.yuzu.visible = false;
      const towel = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.16), new THREE.MeshStandardMaterial({ color: 0xf4f2ec, roughness: 1 }));
      towel.position.copy(fig.userData.yuzu ? fig.userData.yuzu.position : new THREE.Vector3(0, 0.18, 0));
      fig.userData.rig.bones.head.add(towel);
      fig.position.set(p.x, Y_WOOD + 0.42, p.z);
      fig.rotation.y = p.yaw;
      const bc = new NPC(world, { name: 'the capybara', pos: fig.position.clone(), model: fig, voice: 0.5, radius: 0, face: false, prompt: 'Sit with the capybara', conversations: [['(It is cooling down after its bath. It has earned this.)'], ['(It has a towel folded on its head. You feel underdressed.)'], ['(It is waiting for the milk fridge to be restocked. It has been waiting a long time. It does not mind.)']] });
      bc.aimHeight = 0.4;
      world.add(bc);
    }
    // a cat asleep on one of the bandai counters
    if (rng.chance(0.6)) {
      const m = rng.pick(mods.filter((x) => x !== spawnMod));
      const catFig = LOOKS.cat();
      beastPose(catFig, 'loaf');
      const cp = at(m, rng.int(0, 1), 8.5 - 1.32, 6.2, PI);
      catFig.position.set(cp.x, BANDAI_TOP, cp.z);
      catFig.rotation.y = cp.yaw;
      const cat = new NPC(world, { name: 'the bandai cat', pos: catFig.position.clone(), model: catFig, voice: 1.6, radius: 0, face: false, prompt: 'Pet the cat', conversations: [['(It purrs. It has been left in charge.)'], ['(It collects your ¥520 with a paw and does nothing with it.)'], ['Mrrp.']], onTalk: (game) => game.audio.purr(null, 2) });
      cat.aimHeight = 0.2;
      cat.idle = () => {
        tailSway(catFig.userData.rig, cat.t, 0.2, 0.8);
        catFig.userData.rig.rot('head', 0.3, Math.sin(cat.t * 0.2) * 0.3, 0.2);
      };
      world.add(cat);
    }

    // ---- pokeables: buckets, milk, the massage chairs and scales
    for (const b of buckets) {
      b.prompt = 'Tap the bucket';
      b.range = 1.9;
      b.use = (game) => {
        b.hop = 1;
        game.audio.bucket(null);
      };
      poke.add(b);
    }
    const milkLines = [
      ['(You take a coffee milk. It is ice cold.)', '(The cap says: BEST BEFORE 昭和64年. That year only lasted a week.)'],
      ['(A fruit milk. You drink it in one go, hand on your hip, the proper way.)'],
      ['(Plain milk. It tastes like being eight years old in 1984.)'],
      ['(The fridge is full again. It is always full again.)'],
    ];
    let milkN = 0;
    const chairLines = [
      ['(You drop a coin in. It kneads your back with the force of a small earthquake.)'],
      ['(It stops. It starts again. You didn’t put a coin in this time.)'],
      ['(The chair is warm, as if someone just got up.)'],
    ];
    let chairN = 0;
    const scaleLines = [
      ['(The needle swings round, keeps going, and comes back to zero.)', '(You weigh nothing here.)'],
      ['(It reads 0 kg. It also read 0 kg for the man before you. There was no man before you.)'],
    ];
    let scaleN = 0;
    for (const f of fridges) f.use = (game) => game.openDialog('the milk fridge', milkLines[milkN++ % milkLines.length], 1);
    for (const ch of massageChairs) {
      ch.use = (game) => {
        ch.shake = 3.5;
        game.openDialog('the massage chair', chairLines[chairN++ % chairLines.length], 0.7);
      };
    }
    for (const sc of scales) {
      sc.use = (game) => {
        sc.spin = 1;
        game.openDialog('the scale', scaleLines[scaleN++ % scaleLines.length], 1);
      };
    }
    world.add(poke);

    // ---- apparitions (never lethal) and small wrong things
    const hum = { panner: null, fridge: null, chair: null };
    const towers = [];
    for (const m of mods) {
      for (const s of [0, 1]) {
        const [i, j] = cellL(m, s ? MW - 1 - 3 : 3, 17);
        if (world.unease(i, j) < 0.75 && world.depth < 4) continue;
        const p = at(m, s, 6.2, 14.6);
        towers.push({ m, s, x: p.x, z: p.z, n: 0, cool: 3 });
      }
    }
    const prints = [];
    const footMat = new THREE.MeshStandardMaterial({ color: 0x6a7c84, roughness: 0.02, metalness: 0.3, transparent: true, opacity: 0, map: footprintTexture(), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    for (let n = 0; n < 16; n++) {
      const fm = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.3), footMat.clone());
      fm.rotation.x = -PI / 2;
      fm.visible = false;
      fm.userData.noBake = true;
      world.root.add(fm);
      prints.push({ mesh: fm, age: 99 });
    }
    const walk = { active: false, timer: rng.float(20, 40), step: 0, n: 0, from: new THREE.Vector3(), dir: new THREE.Vector3(), panner: null };

    if (!world.attract) {
      world.add(new Watcher(world, { look: { body: 0xc8c0b8, eyes: 0x202020, height: 2.3 }, speed: 1.2 }));
      if (world.depth >= 1) world.add(new Follower(world));
      if (world.depth >= 1) world.add(new Peeker(world, { look: { body: 0xc8c0b8, eyes: 0x202020 } }));
      if (rng.chance(0.3)) world.add(new StrayCat(world));
    }

    // ---- per-frame
    let t = 0;
    let konT = rng.float(6, 14);
    let konPanner = null;
    const blinkers = [];
    world.root.traverse((o) => o.userData.blink && blinkers.push(o));
    world.onUpdate = (dt, ctx) => {
      t += dt;
      nMap.offset.set(t * 0.015, t * 0.01);
      causticMap.offset.set(Math.sin(t * 0.15) * 0.1 + t * 0.008, t * 0.012);
      for (const b of blinkers) b.visible = Math.sin(t * 2.2) > 0.2;
      // steam
      const sz = ctx.game.renderer?.domElement?.height || 720;
      steamMat.uniforms.uScale.value = sz * 0.55;
      for (let n = 0; n < SN; n++) {
        const L = sLife[n];
        L.t += dt;
        if (L.t > L.max) {
          respawn(n, 0);
          continue;
        }
        sPos[n * 3] += L.vx * dt;
        sPos[n * 3 + 1] += L.vy * dt;
        sPos[n * 3 + 2] += L.vz * dt;
        const f = L.t / L.max;
        sAlpha[n] = Math.sin(f * PI) * 0.055 * L.dim;
        sSize[n] += dt * 0.12;
      }
      sGeo.attributes.position.needsUpdate = true;
      sGeo.attributes.aAlpha.needsUpdate = true;
      sGeo.attributes.aSize.needsUpdate = true;
      if (ctx.attract) return;

      const { player, game, camera } = ctx;
      const audio = game.audio;
      const pz = player.pos;
      // buckets hop when tapped
      for (const b of buckets) {
        if (b.hop <= 0) continue;
        b.hop = Math.max(0, b.hop - dt * 3);
        const m4 = b.base.clone();
        m4.elements[13] += Math.sin(b.hop * PI) * 0.08;
        batch.move(b.ref, m4);
      }
      // yuzu drift and bob
      for (const y of yuzus) {
        if (y.m.idx !== modOfPos(pz.x, pz.z)) continue;
        batch.move(y.ref, matAt(y.x + Math.sin(t * 0.13 + y.ph) * 0.25, Y_SURF - 0.01 + Math.sin(t * 1.3 + y.ph) * 0.008, y.z + Math.cos(t * 0.11 + y.ph) * 0.25, t * 0.1 + y.ph));
      }
      // the electric bath tingles
      const [ei, ej] = g.cellOf(pz.x, pz.z);
      const inElectric = g.inBounds(ei, ej) && bathKind[K(ei, ej)] === 4 && g.get(ei, ej) === WATER;
      if (inElectric && !walk.buzz) game.toast('Bzzzt.', 'The electric bath works. So do your elbows, now, independently.');
      walk.buzz = inElectric;
      // the keeper moves to the bandai of whichever bathhouse you are in, when you aren't looking
      const pm = modOfPos(pz.x, pz.z);
      if (pm >= 0 && mods[pm] !== keeperMod && modOfPos(keeperModel.position.x, keeperModel.position.z) !== pm) {
        const kp = keeperModel.position;
        const target = seatAt(mods[pm]);
        const visibleNow = inView(camera, kp.x, kp.y + 0.8, kp.z, 1.1) && g.los(pz.x, pz.z, kp.x, kp.z);
        const visibleThere = inView(camera, target.x, target.y + 0.8, target.z, 1.1) && g.los(pz.x, pz.z, target.x, target.z);
        if (!visibleNow && !visibleThere) {
          keeperMod = mods[pm];
          kp.copy(target);
          keeperModel.rotation.y = keeperMod.bandai.yaw;
          keeper.moved = true;
        }
      }
      // fridge hum and the massage chairs
      if (audio.ready && !hum.panner) {
        hum.panner = audio.panner(0, 1, 0, { ref: 1.2, rolloff: 1.6 });
        hum.fridge = makeHum(audio, hum.panner, { freq: 58, cut: 200, gain: 0.05 });
        hum.chair = makeHum(audio, hum.panner, { freq: 42, type: 'square', cut: 160, gain: 0 });
        world.onDispose.push(() => {
          hum.fridge.stop();
          hum.chair.stop();
          hum.panner.disconnect();
        });
      }
      let nearF = null;
      let dF = 1e9;
      for (const f of fridges) {
        const d = f.pos.distanceToSquared(pz);
        if (d < dF) {
          dF = d;
          nearF = f;
        }
      }
      let nearC = null;
      let dC = 1e9;
      for (const ch of massageChairs) {
        const d = ch.pos.distanceToSquared(pz);
        if (d < dC) {
          dC = d;
          nearC = ch;
        }
      }
      if (nearC && dC < 81) {
        // it runs by itself every so often
        nearC.idleT = (nearC.idleT ?? rng.float(6, 14)) - dt;
        if (nearC.idleT <= 0) {
          nearC.shake = rng.float(2.5, 4.5);
          nearC.idleT = rng.float(12, 26) / (1 + world.uneaseAt(pz.x, pz.z));
        }
      }
      for (const ch of massageChairs) {
        if (ch.shake > 0) {
          ch.shake -= dt;
          const a = Math.min(1, ch.shake);
          ch.obj.position.set(ch.base.x + Math.sin(t * 47) * 0.006 * a, ch.base.y + Math.abs(Math.sin(t * 31)) * 0.008 * a, ch.base.z + Math.cos(t * 53) * 0.006 * a);
          ch.obj.rotation.z = Math.sin(t * 23) * 0.012 * a;
        } else if (ch.obj.rotation.z !== 0) {
          ch.obj.position.copy(ch.base);
          ch.obj.rotation.z = 0;
        }
      }
      if (hum.panner) {
        const src = walk.buzz ? { pos: pz } : nearC && nearC.shake > 0 && dC < dF + 4 ? nearC : nearF;
        if (src) audio.setPannerPos(hum.panner, src.pos.x, src.pos.y + 0.5, src.pos.z);
        const shaking = walk.buzz ? 0.8 : nearC && nearC.shake > 0 ? Math.min(1, nearC.shake) : 0;
        hum.chair.gain.value += (shaking * 0.09 - hum.chair.gain.value) * Math.min(1, dt * 5);
        hum.chair.freq.value = 40 + Math.sin(t * 3) * 6;
      }
      for (const sc of scales) {
        if (sc.spin > 0) {
          sc.spin = Math.max(0, sc.spin - dt * 0.35);
          sc.needle.rotation.z = PI * 0.75 - Math.sin((1 - sc.spin) * PI) * PI * 1.9;
        }
      }
      // a distant "kon" of a bucket set down somewhere in the building
      konT -= dt;
      if (konT <= 0 && audio.ready) {
        konT = rng.float(10, 28);
        const a = rng.float(0, PI * 2);
        const d = rng.float(8, 20);
        if (!konPanner) {
          konPanner = audio.panner(0, 0, 0, { ref: 3, rolloff: 1 });
          world.onDispose.push(() => konPanner.disconnect());
        }
        audio.setPannerPos(konPanner, pz.x + Math.cos(a) * d, 1, pz.z + Math.sin(a) * d);
        audio.bucket(konPanner);
      }
      // buckets you turn away from stack themselves into a neat tower
      for (const tw of towers) {
        if (tw.n >= 11) continue;
        const d = Math.hypot(pz.x - tw.x, pz.z - tw.z);
        if (d > 13 || modOfPos(pz.x, pz.z) !== tw.m.idx) continue;
        tw.cool -= dt;
        if (tw.cool > 0) continue;
        const siteSeen = inView(camera, tw.x, 0.6, tw.z, 1.15) && g.los(pz.x, pz.z, tw.x, tw.z);
        if (siteSeen) continue;
        const src = buckets.find((b) => b.m === tw.m && b.s === tw.s && !b.tower && !(inView(camera, b.pos.x, b.pos.y, b.pos.z, 1.15) && g.los(pz.x, pz.z, b.pos.x, b.pos.z)));
        if (!src) continue;
        src.tower = true;
        src.base = matAt(tw.x, Y_BATH + 0.115 + tw.n * 0.108, tw.z, tw.n * 0.21, 1, PI);
        src.pos.set(tw.x, Y_BATH + tw.n * 0.108 + 0.06, tw.z);
        batch.move(src.ref, src.base);
        tw.n++;
        tw.cool = rng.float(1.2, 3.5);
        if (!tw.panner && audio.ready) {
          tw.panner = audio.panner(tw.x, 0.5, tw.z, { ref: 2, rolloff: 1.2 });
          world.onDispose.push(() => tw.panner.disconnect());
        }
        if (tw.panner) audio.bucket(tw.panner);
      }
      // wet footprints walking toward you across the tiles
      const un = world.uneaseAt(pz.x, pz.z);
      const [pi, pj] = g.cellOf(pz.x, pz.z);
      const onTiles = zoneAt(pi, pj) === Z_BATH;
      if (!walk.active) {
        walk.timer -= dt;
        if (walk.timer <= 0 && un > 0.6 && onTiles) {
          const a = rng.float(0, PI * 2);
          const d = rng.float(3.5, 6.5);
          const fx = pz.x + Math.cos(a) * d;
          const fz = pz.z + Math.sin(a) * d;
          const [fi, fj] = g.cellOf(fx, fz);
          if (g.inBounds(fi, fj) && zoneAt(fi, fj) === Z_BATH && g.get(fi, fj) === FLOOR && Math.abs(floorOf(fi, fj) - Y_BATH) < 0.01 && g.los(fx, fz, pz.x, pz.z)) {
            walk.active = true;
            walk.from.set(fx, 0, fz);
            walk.dir.set(pz.x - fx, 0, pz.z - fz).normalize();
            walk.n = 0;
            walk.step = 0.8;
          } else walk.timer = 1;
        }
      } else {
        walk.step -= dt;
        if (walk.step <= 0) {
          walk.step = 0.62;
          const x = walk.from.x + walk.dir.x * walk.n * 0.6 + walk.dir.z * (walk.n % 2 ? 0.1 : -0.1);
          const z = walk.from.z + walk.dir.z * walk.n * 0.6 - walk.dir.x * (walk.n % 2 ? 0.1 : -0.1);
          const [fi, fj] = g.cellOf(x, z);
          const ok = g.inBounds(fi, fj) && g.get(fi, fj) === FLOOR && Math.abs(floorOf(fi, fj) - Y_BATH) < 0.01;
          if (!ok || Math.hypot(pz.x - x, pz.z - z) < 1.1 || walk.n > 14) {
            walk.active = false;
            walk.timer = rng.float(25, 60) / Math.max(0.7, un);
          } else {
            const pr = prints[walk.n % prints.length];
            pr.mesh.position.set(x, Y_BATH + 0.004, z);
            pr.mesh.rotation.set(-PI / 2, 0, Math.atan2(walk.dir.x, walk.dir.z) + PI);
            pr.mesh.scale.x = walk.n % 2 ? -1 : 1;
            pr.mesh.visible = true;
            pr.age = 0;
            walk.n++;
            if (audio.ready) {
              if (!walk.panner) {
                walk.panner = audio.panner(x, 0.1, z, { ref: 1.5, rolloff: 1.4 });
                world.onDispose.push(() => walk.panner.disconnect());
              }
              audio.setPannerPos(walk.panner, x, 0.1, z);
              audio.thump(walk.panner, 0.12);
            }
          }
        }
      }
      for (const pr of prints) {
        if (!pr.mesh.visible) continue;
        pr.age += dt;
        pr.mesh.material.opacity = Math.max(0, Math.min(1, pr.age * 3) * 0.85 * (1 - Math.max(0, pr.age - 5) / 5));
        if (pr.age > 10) pr.mesh.visible = false;
      }
      // sinking into a deep bath
      if (g.get(pi, pj) === HOLE && deep.has(K(pi, pj)) && pz.y < Y_SURF - 0.8 && !walk.sank) {
        walk.sank = true;
        game.toast('The bath is deeper than it looks', null, 'danger');
        audio.splash(null, 1.5);
      }
    };

    // ---- surfaces and mood
    world.speedFn = (x, z) => (world.isWater(x, z) ? 0.6 : 1);
    world.surfaceFn = (x, z) => {
      const [i, j] = g.cellOf(x, z);
      if (!g.inBounds(i, j)) return 'stone';
      const c = g.get(i, j);
      const zn = zone[K(i, j)];
      if (c === WATER) return 'water';
      if (zn === Z_DRESS) return 'wood';
      if (zn === Z_BATH) return 'tile';
      return 'stone';
    };
    Object.assign(world.env, {
      background: 0x0b0f18,
      backgroundTex: hdri('qwantani_night_puresky'),
      backgroundIntensity: 0.14,
      fog: new THREE.FogExp2(new THREE.Color(0x8c9aa4).lerp(new THREE.Color(0x4a5258), u), 0.028 + world.depth * 0.003),
      exposure: 1.05,
      postfx: { bloom: 0.45, bloomThreshold: 0.78, bloomRadius: 0.6, grain: 0.045, vignette: 0.3, chroma: 0.0012, scan: 0.02, tint: [1.0, 1.01, 1.03] },
      ao: 0.8,
      envIntensity: 0.75,
      ambience: 'bath',
      reverb: [3.5, 3],
      flashlight: false,
      bake: { fixtureScale: 0.3, bounce: 0.5, hemi: 0.5, dynamic: 0.45, radius: 8, tess: 0.8 },
    });
  },

  // what leaks through when this level bleeds into another (see game/bleed.js)
  bleed: {
    ambience: 'bath',
    looks: ['capybara'],
    surfaces: () => {
      const mosaic = (key, rgb, uv, opts = {}) => {
        const map = glazeTexture(key, rgb).clone();
        map.repeat.set(uv / 2, uv / 2);
        map.userData.cached = true;
        return { mat: photo('square_tiled_wall', { uvScale: uv, map, roughness: 0.3, ...opts }), uv };
      };
      return { wall: mosaic('wall', [226, 236, 236], 0.8, { roughness: 0.22 }), floor: mosaic('floor', [178, 198, 204], 0.55, { roughness: 0.45 }) };
    },
    props: {
      clutter: [{ p: bleedBucket, w: 3 }],
    },
    stray: (world, pos) => {
      const fig = LOOKS.capybara();
      beastPose(fig, 'loaf');
      fig.position.copy(pos);
      const capy = new NPC(world, { name: 'the capybara', pos, model: fig, voice: 0.5, radius: 0.45, face: false, prompt: 'Sit with the capybara', conversations: [
        ['(A capybara, damp, somewhere it should not be. It seems fine with it.)'],
        ['(It is waiting for the bath to come back. It has all the time there is.)'],
      ] });
      capy.aimHeight = 0.4;
      return capy;
    },
  },

  makeDoor(world, dest) {
    // a wooden sliding door with a ゆ noren; the light beyond is the destination's
    const group = new THREE.Group();
    const w = 0.86;
    const hgt = 2.0;
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.6 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.6 });
    for (const x of [-w / 2 - 0.04, w / 2 + 0.04]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, hgt + 0.08, 0.12), frameMat);
      post.position.set(x, (hgt + 0.08) / 2, 0.06);
      group.add(post);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(w + 0.16, 0.08, 0.14), frameMat);
    lintel.position.set(0, hgt + 0.04, 0.06);
    group.add(lintel);
    const lightMat = new THREE.MeshBasicMaterial({ color: dest.tint || 0xfff0d0 });
    const beyond = new THREE.Color(dest.tint || 0xfff0d0).multiplyScalar(2.4);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(w, hgt), lightMat);
    back.position.set(0, hgt / 2, 0.01);
    group.add(back);
    // sliding leaf: wooden lattice over paper
    const leaf = new THREE.Group();
    const paper = new THREE.MeshStandardMaterial({ color: 0xf0e8d8, roughness: 0.9, emissive: new THREE.Color(dest.tint || 0xfff0d0), emissiveIntensity: 0.15 });
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.04, hgt - 0.5), paper);
    pane.position.set(0, hgt / 2 + 0.15, 0);
    leaf.add(pane);
    const lower = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, 0.035), wood);
    lower.position.set(0, 0.25, 0);
    leaf.add(lower);
    for (let n = 0; n <= 4; n++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.025, hgt - 0.5, 0.04), wood);
      bar.position.set(-w / 2 + (n * w) / 4, hgt / 2 + 0.25, 0.005);
      leaf.add(bar);
    }
    for (let n = 0; n <= 5; n++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.025, 0.04), wood);
      bar.position.set(0, 0.5 + (n * (hgt - 0.5)) / 5, 0.005);
      leaf.add(bar);
    }
    leaf.position.set(0, 0, 0.05);
    group.add(leaf);
    // noren with ゆ, swaying
    const tex = norenTexture('yu', '');
    const nm = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.95 });
    const panels = [];
    for (let k = 0; k < 2; k++) {
      const geo = new THREE.PlaneGeometry(0.46, 0.75, 1, 3);
      geo.translate(0, -0.375, 0);
      const uv = geo.attributes.uv;
      for (let v = 0; v < uv.count; v++) uv.setX(v, 0.2 + (k + uv.getX(v)) * 0.3);
      const pm = new THREE.Mesh(geo, nm);
      pm.position.set(-0.235 + k * 0.47, hgt + 0.02, 0.16);
      group.add(pm);
      panels.push(pm);
    }
    const leak = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.1, 1.0), new THREE.MeshBasicMaterial({ color: dest.tint || 0xfff0d0, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }));
    leak.rotation.x = -PI / 2;
    leak.position.set(0, 0.012, 0.5);
    group.add(leak);
    return {
      group,
      update(dt, time, open) {
        leaf.position.x = -open * (w - 0.1);
        lightMat.color.copy(beyond).multiplyScalar(0.05 + open * 0.95);
        leak.material.opacity = 0.1 + open * 0.3 + Math.sin(time * 3) * 0.02;
        panels.forEach((p, k) => (p.rotation.x = Math.sin(time * 1.1 + k) * 0.05 + open * 0.25));
      },
    };
  },
};
