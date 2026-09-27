import * as THREE from 'three';

// Every texture in the game is painted on a canvas at runtime, so the game
// ships without image assets. Textures are cached by key and never disposed.

const cache = new Map();
let maxAniso = 4;

export function setMaxAnisotropy(n) {
  maxAniso = Math.min(8, n || 1);
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function tex(key, w, h, draw, { srgb = true, repeat = true, mips = true } = {}) {
  if (cache.has(key)) return cache.get(key);
  const c = canvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: false });
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  t.generateMipmaps = mips;
  t.userData.cached = true;
  cache.set(key, t);
  return t;
}

// ---- noise helpers --------------------------------------------------------

function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Tileable value noise sampled at (x, y) with a lattice period. */
function vnoise(x, y, period, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const p = (v) => ((v % period) + period) % period;
  const a = hash(p(xi), p(yi), seed);
  const b = hash(p(xi + 1), p(yi), seed);
  const c = hash(p(xi), p(yi + 1), seed);
  const d = hash(p(xi + 1), p(yi + 1), seed);
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Tileable fractal noise over a w×h canvas, returns 0..1. */
function fbm(px, py, w, base, octaves, seed) {
  let amp = 0.5;
  let sum = 0;
  let norm = 0;
  let period = base;
  for (let o = 0; o < octaves; o++) {
    sum += amp * vnoise((px / w) * period, (py / w) * period, period, seed + o * 17);
    norm += amp;
    amp *= 0.5;
    period *= 2;
  }
  return sum / norm;
}

function pixels(ctx, w, h, fn) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = (y * w + x) * 4;
      fn(x, y, d, k);
    }
  }
  ctx.putImageData(img, 0, 0);
}

// ---- Poolrooms -------------------------------------------------------------

/** Grout-only bump map for the tiles (white tiles, dark lines). */

export function caustics() {
  return tex('caustics', 256, 256, (ctx, w, h) => {
    pixels(ctx, w, h, (x, y, d, k) => {
      const a = fbm(x, y, w, 4, 3, 5);
      const b = fbm(x + 37, y + 91, w, 4, 3, 19);
      const r = 1 - Math.min(1, Math.abs(a - b) * 9);
      const v = Math.pow(Math.max(0, r), 3) * 255;
      d[k] = v * 0.8; d[k + 1] = v; d[k + 2] = v; d[k + 3] = 255;
    });
  });
}

export function cloudSprite() {
  return tex('cloud', 256, 128, (ctx, w, h) => {
    for (let s = 0; s < 14; s++) {
      const x = w * (0.2 + hash(s, 0, 3) * 0.6);
      const y = h * (0.45 + (hash(s, 1, 3) - 0.5) * 0.3);
      const r = h * (0.18 + hash(s, 2, 3) * 0.22);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.6, 'rgba(255,255,255,0.5)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }, { repeat: false });
}

// ---- Night hotel -----------------------------------------------------------

/** Hotel room door with a brass number plate. Not cached — one per number. */
export function hotelDoor(number) {
  const c = canvas(128, 256);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 128, 0);
  g.addColorStop(0, '#3b2217');
  g.addColorStop(0.5, '#4a2c1c');
  g.addColorStop(1, '#351e13');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 256);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 4;
  ctx.strokeRect(18, 20, 92, 90);
  ctx.strokeRect(18, 128, 92, 110);
  ctx.strokeStyle = 'rgba(255,220,170,0.08)';
  ctx.lineWidth = 2;
  ctx.strokeRect(22, 24, 84, 82);
  ctx.strokeRect(22, 132, 84, 102);
  // number plate
  ctx.fillStyle = '#b08d45';
  ctx.fillRect(40, 44, 48, 22);
  ctx.fillStyle = '#2a1d0d';
  ctx.font = 'bold 16px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(number), 64, 56);
  // handle
  ctx.fillStyle = '#c9a458';
  ctx.beginPath();
  ctx.arc(104, 138, 5, 0, Math.PI * 2);
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return t;
}

// ---- Twilight school -------------------------------------------------------

export function schoolWindow() {
  // A window strip: sunset sky seen through a steel-framed window.
  return tex('school-window', 512, 512, (ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#5a5f9a');
    sky.addColorStop(0.35, '#e98a6b');
    sky.addColorStop(0.62, '#ffc27a');
    sky.addColorStop(0.64, '#3a2c2a');
    sky.addColorStop(1, '#2a2020');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    // distant town silhouette
    ctx.fillStyle = '#34282a';
    for (let x = 0; x < w; x += 18) {
      const bh = 10 + hash(x, 0, 4) * 40;
      ctx.fillRect(x, h * 0.64 - bh, 16, bh);
    }
    // frames
    ctx.fillStyle = '#c9c4b8';
    ctx.fillRect(0, 0, w, 40);
    ctx.fillRect(0, h * 0.8, w, h * 0.2);
    ctx.fillRect(0, 0, 14, h);
    ctx.fillRect(w / 2 - 7, 0, 14, h);
    ctx.fillRect(w - 14, 0, 14, h);
    ctx.fillRect(0, h * 0.42, w, 8);
    ctx.fillStyle = '#7f9c86';
    ctx.fillRect(0, h * 0.84, w, h * 0.16);
  });
}

export function chalkboard() {
  return tex('chalkboard', 512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#2f4a3b';
    ctx.fillRect(0, 0, w, h);
    pixels(ctx, w, h, (x, y, d, k) => {
      const n = 0.85 + fbm(x, y, w, 8, 3, 7) * 0.3;
      d[k] *= n; d[k + 1] *= n; d[k + 2] *= n;
    });
    ctx.fillStyle = 'rgba(240,240,230,0.75)';
    ctx.font = '28px "DotGothic16", monospace';
    ctx.fillText('日直 On duty today', 30, 60);
    ctx.fillText('— 　　　　—', 60, 110);
    ctx.font = '22px "DotGothic16", monospace';
    ctx.fillText('ここは どこ？', 300, 190);
    ctx.fillStyle = '#8b6a45';
    ctx.fillRect(0, h - 14, w, 14);
  }, { repeat: false });
}

// ---- Shared ----------------------------------------------------------------

export function glowSprite() {
  return tex('glow', 128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, { repeat: false });
}

export function smilerFace() {
  return tex('smiler', 256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const eye = (x) => {
      const g = ctx.createRadialGradient(x, 92, 0, x, 92, 26);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,250,235,0.95)');
      g.addColorStop(1, 'rgba(255,240,220,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, 92, 26, 18, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    eye(82);
    eye(174);
    // grin
    ctx.fillStyle = 'rgba(255,252,240,0.95)';
    ctx.beginPath();
    ctx.moveTo(40, 150);
    ctx.quadraticCurveTo(128, 250, 216, 150);
    ctx.quadraticCurveTo(128, 200, 40, 150);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.lineWidth = 3;
    for (let x = 56; x < 210; x += 13) {
      ctx.beginPath();
      ctx.moveTo(x, 150 + Math.sin(((x - 40) / 176) * Math.PI) * 8);
      ctx.lineTo(x, 150 + Math.sin(((x - 40) / 176) * Math.PI) * 48);
      ctx.stroke();
    }
  }, { repeat: false });
}

export function exitSign() {
  return tex('exit-sign', 256, 96, (ctx, w, h) => {
    ctx.fillStyle = '#0d3b1f';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#7dffb0';
    ctx.font = 'bold 56px "DotGothic16", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('EXIT', w / 2 + 20, h / 2 + 2);
    // running figure pictogram (simplified)
    ctx.fillRect(22, 30, 14, 14);
    ctx.fillRect(26, 44, 8, 22);
  }, { repeat: false });
}

/** Data URL of grey static noise for the CSS transition overlay. */
export function staticDataURL() {
  const c = canvas(256, 256);
  const ctx = c.getContext('2d');
  pixels(ctx, 256, 256, (x, y, d, k) => {
    const v = Math.random() * 255;
    d[k] = v; d[k + 1] = v; d[k + 2] = v; d[k + 3] = 255;
  });
  return c.toDataURL('image/png');
}

/** Small canvas-rendered text label (signs, room numbers). */
export function labelTexture(text, { w = 256, h = 64, bg = 'rgba(0,0,0,0)', fg = '#fff', font = '32px "DotGothic16", monospace' } = {}) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fg;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Soft-edged window-pane light patch for sunlight on the floor. */
export function sunPatch() {
  return tex('sun-patch', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.filter = 'blur(6px)';
    ctx.fillStyle = '#fff';
    const pane = (x, y, pw, ph) => ctx.fillRect(x, y, pw, ph);
    pane(18, 20, w / 2 - 30, h * 0.36);
    pane(w / 2 + 12, 20, w / 2 - 30, h * 0.36);
    pane(18, h * 0.46, w / 2 - 30, h * 0.46);
    pane(w / 2 + 12, h * 0.46, w / 2 - 30, h * 0.46);
    ctx.filter = 'none';
    // fade out with distance from the window (canvas top = window side)
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, { repeat: false });
}

/** Window frame mask for windowViewMaterial: opaque wall/frames, transparent glass. */
export function schoolWindowFrame() {
  return tex('school-window-frame', 512, 512, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const wall = '#e4dcc8';
    const frame = '#bfc1bc';
    // canvas top = top of the wall
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, w, h * 0.1);
    ctx.fillStyle = '#6f8f76';
    ctx.fillRect(0, h * 0.66, w, h * 0.34);
    ctx.fillStyle = '#56705c';
    ctx.fillRect(0, h * 0.66, w, 8);
    ctx.fillStyle = frame;
    ctx.fillRect(0, h * 0.1, w, 12);
    ctx.fillRect(0, h * 0.64, w, h * 0.03);
    ctx.fillRect(0, h * 0.38, w, 9);
    for (const x of [0, w / 2 - 6, w - 12]) ctx.fillRect(x, h * 0.1, 12, h * 0.56);
    // thin shadow lines so the frames read as extruded
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, h * 0.1 + 12, w, 2);
    ctx.fillRect(0, h * 0.38 + 9, w, 2);
  });
}
