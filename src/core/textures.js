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

function stains(ctx, w, h, n, color, seed, maxR = 0.18) {
  for (let s = 0; s < n; s++) {
    const x = hash(s, 1, seed) * w;
    const y = hash(s, 2, seed) * h;
    const r = (0.04 + hash(s, 3, seed) * maxR) * w;
    // draw wrapped copies so the stain tiles
    for (const ox of [-w, 0, w]) {
      for (const oy of [-h, 0, h]) {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        g.addColorStop(0, color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
  }
}

// ---- Level 0: the yellow rooms -------------------------------------------

export function backroomsWall() {
  return tex('br-wall', 512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#c8b25c';
    ctx.fillRect(0, 0, w, h);
    // faint vertical stripe pattern of the wallpaper
    for (let x = 0; x < w; x += 32) {
      ctx.fillStyle = 'rgba(120,96,30,0.10)';
      ctx.fillRect(x, 0, 14, h);
      ctx.fillStyle = 'rgba(255,240,170,0.10)';
      ctx.fillRect(x + 16, 0, 2, h);
    }
    // tiny chevron motif
    ctx.strokeStyle = 'rgba(110,88,28,0.16)';
    ctx.lineWidth = 1.5;
    for (let y = 8; y < h; y += 24) {
      for (let x = 7; x < w; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x - 4, y + 3);
        ctx.lineTo(x, y);
        ctx.lineTo(x + 4, y + 3);
        ctx.stroke();
      }
    }
    pixels(ctx, w, h, (x, y, d, k) => {
      const n = fbm(x, y, w, 8, 4, 3) - 0.5;
      const grime = Math.max(0, (y / h - 0.7) / 0.3); // darker near the floor (v=0 at bottom → canvas top is v=1)
      const f = 1 + n * 0.22 - (1 - y / h < 0.2 ? 0 : 0) - grime * 0.18;
      d[k] *= f;
      d[k + 1] *= f;
      d[k + 2] *= f * 0.97;
    });
    stains(ctx, w, h, 7, 'rgba(90,70,20,0.18)', 11, 0.14);
  });
}

export function backroomsCarpet() {
  return tex('br-carpet', 512, 512, (ctx, w, h) => {
    pixels(ctx, w, h, (x, y, d, k) => {
      const n = fbm(x, y, w, 6, 5, 21);
      const fiber = hash(x, y, 5) * 0.16;
      const v = 0.72 + n * 0.35 + fiber - 0.08;
      d[k] = 150 * v;
      d[k + 1] = 128 * v;
      d[k + 2] = 72 * v;
      d[k + 3] = 255;
    });
    stains(ctx, w, h, 5, 'rgba(60,45,15,0.28)', 7, 0.2);
  });
}

export function backroomsCeiling() {
  return tex('br-ceiling', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#d9d3bd';
    ctx.fillRect(0, 0, w, h);
    pixels(ctx, w, h, (x, y, d, k) => {
      const speck = hash(x, y, 9) > 0.93 ? 0.8 : 1;
      const n = 0.94 + fbm(x, y, w, 4, 3, 2) * 0.1;
      d[k] *= speck * n;
      d[k + 1] *= speck * n;
      d[k + 2] *= speck * n;
    });
    ctx.strokeStyle = '#8e876e';
    ctx.lineWidth = 3;
    for (let i = 0; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * (w / 2), 0);
      ctx.lineTo(i * (w / 2), h);
      ctx.moveTo(0, i * (h / 2));
      ctx.lineTo(w, i * (h / 2));
      ctx.stroke();
    }
    stains(ctx, w, h, 3, 'rgba(120,100,40,0.2)', 31, 0.12);
  });
}

// ---- Poolrooms -------------------------------------------------------------

function tiles(ctx, w, h, n, base, grout, seed, jitter = 10) {
  const s = w / n;
  ctx.fillStyle = grout;
  ctx.fillRect(0, 0, w, h);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const v = (hash(i, j, seed) - 0.5) * jitter;
      const [r, g, b] = base;
      ctx.fillStyle = `rgb(${r + v},${g + v},${b + v})`;
      ctx.fillRect(i * s + 1.5, j * s + 1.5, s - 3, s - 3);
      // soft glaze highlight
      const gr = ctx.createLinearGradient(i * s, j * s, i * s + s, j * s + s);
      gr.addColorStop(0, 'rgba(255,255,255,0.10)');
      gr.addColorStop(1, 'rgba(0,0,0,0.04)');
      ctx.fillStyle = gr;
      ctx.fillRect(i * s + 1.5, j * s + 1.5, s - 3, s - 3);
    }
  }
}

export function poolTileWhite() {
  return tex('pool-white', 512, 512, (ctx, w, h) => tiles(ctx, w, h, 8, [236, 240, 238], '#b9c3c4', 4));
}

export function poolTileBlue() {
  return tex('pool-blue', 512, 512, (ctx, w, h) => tiles(ctx, w, h, 8, [96, 186, 205], '#5c9aa9', 8, 16));
}

/** Grout-only bump map for the tiles (white tiles, dark lines). */
export function tileBump() {
  return tex('tile-bump', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    const s = w / 8;
    for (let i = 0; i <= 8; i++) {
      ctx.beginPath();
      ctx.moveTo(i * s, 0);
      ctx.lineTo(i * s, h);
      ctx.moveTo(0, i * s);
      ctx.lineTo(w, i * s);
      ctx.stroke();
    }
  }, { srgb: false });
}

export function waterNormal() {
  return tex('water-normal', 256, 256, (ctx, w, h) => {
    const hgt = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) hgt[y * w + x] = fbm(x, y, w, 4, 4, 77);
    pixels(ctx, w, h, (x, y, d, k) => {
      const l = hgt[y * w + ((x - 1 + w) % w)];
      const r = hgt[y * w + ((x + 1) % w)];
      const u = hgt[((y - 1 + h) % h) * w + x];
      const dn = hgt[((y + 1) % h) * w + x];
      const nx = (l - r) * 6;
      const ny = (u - dn) * 6;
      const len = Math.hypot(nx, ny, 1);
      d[k] = (nx / len * 0.5 + 0.5) * 255;
      d[k + 1] = (ny / len * 0.5 + 0.5) * 255;
      d[k + 2] = (1 / len * 0.5 + 0.5) * 255;
      d[k + 3] = 255;
    });
  }, { srgb: false });
}

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

// ---- Pastel dream ----------------------------------------------------------

export function pastelChecker() {
  return tex('pastel-check', 256, 256, (ctx, w, h) => {
    const s = w / 2;
    const cols = ['#f7d9e3', '#fdf6ee'];
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      ctx.fillStyle = cols[(i + j) % 2];
      ctx.fillRect(i * s, j * s, s, s);
    }
    pixels(ctx, w, h, (x, y, d, k) => {
      const n = 0.97 + fbm(x, y, w, 4, 2, 5) * 0.05;
      d[k] *= n; d[k + 1] *= n; d[k + 2] *= n;
    });
  });
}

export function softGrain() {
  return tex('soft-grain', 256, 256, (ctx, w, h) => {
    pixels(ctx, w, h, (x, y, d, k) => {
      const v = 235 + fbm(x, y, w, 4, 3, 44) * 20;
      d[k] = v; d[k + 1] = v; d[k + 2] = v; d[k + 3] = 255;
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

export function hotelCarpet() {
  return tex('hotel-carpet', 512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#5b1418';
    ctx.fillRect(0, 0, w, h);
    const s = 64;
    ctx.lineWidth = 3;
    for (let y = 0; y <= h; y += s) {
      for (let x = 0; x <= w; x += s) {
        ctx.strokeStyle = 'rgba(196,142,64,0.55)';
        ctx.beginPath();
        ctx.moveTo(x, y - s / 2 + 6);
        ctx.lineTo(x + s / 2 - 6, y);
        ctx.lineTo(x, y + s / 2 - 6);
        ctx.lineTo(x - s / 2 + 6, y);
        ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = 'rgba(30,60,50,0.8)';
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(196,142,64,0.4)';
        ctx.beginPath();
        ctx.arc(x + s / 2, y + s / 2, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    pixels(ctx, w, h, (x, y, d, k) => {
      const n = 0.8 + fbm(x, y, w, 8, 4, 12) * 0.35 + hash(x, y, 3) * 0.08;
      d[k] *= n; d[k + 1] *= n; d[k + 2] *= n;
    });
  });
}

export function hotelWallpaper() {
  return tex('hotel-wall', 512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#2e3a30';
    ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 64) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(x + 28, 0, 36, h);
    }
    // damask-ish medallions
    ctx.strokeStyle = 'rgba(170,150,95,0.35)';
    ctx.lineWidth = 2;
    for (let y = 0; y < h + 64; y += 96) {
      for (let x = 0; x < w + 64; x += 64) {
        const oy = (x / 64) % 2 ? 48 : 0;
        const cx = x + 14;
        const cy = y + oy;
        ctx.beginPath();
        ctx.ellipse(cx, cy, 9, 18, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx, cy - 26);
        ctx.quadraticCurveTo(cx + 12, cy - 22, cx, cy - 18);
        ctx.quadraticCurveTo(cx - 12, cy - 22, cx, cy - 26);
        ctx.stroke();
      }
    }
    pixels(ctx, w, h, (x, y, d, k) => {
      const n = 0.82 + fbm(x, y, w, 6, 4, 8) * 0.3;
      d[k] *= n; d[k + 1] *= n; d[k + 2] *= n;
    });
    stains(ctx, w, h, 4, 'rgba(0,0,0,0.25)', 3, 0.2);
  });
}

export function wood(key = 'wood', base = [74, 44, 28]) {
  return tex(key, 256, 256, (ctx, w, h) => {
    pixels(ctx, w, h, (x, y, d, k) => {
      const n = fbm(x * 0.15, y * 3, w, 4, 4, 91);
      const ring = 0.5 + 0.5 * Math.sin((x / w) * 40 + n * 12);
      const v = 0.7 + ring * 0.2 + n * 0.2;
      d[k] = base[0] * v; d[k + 1] = base[1] * v; d[k + 2] = base[2] * v; d[k + 3] = 255;
    });
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (let x = 0; x < w; x += 64) ctx.fillRect(x, 0, 2, h);
  });
}

export function plainNoise(key, rgb, amount = 0.12, scale = 6) {
  return tex(key, 256, 256, (ctx, w, h) => {
    pixels(ctx, w, h, (x, y, d, k) => {
      const n = 1 - amount + fbm(x, y, w, scale, 4, key.length * 13) * amount * 2;
      d[k] = rgb[0] * n; d[k + 1] = rgb[1] * n; d[k + 2] = rgb[2] * n; d[k + 3] = 255;
    });
  });
}

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

export function schoolWall() {
  return tex('school-wall', 512, 512, (ctx, w, h) => {
    // canvas top = top of wall. Cream plaster above, sage green paint below.
    ctx.fillStyle = '#e8dcc2';
    ctx.fillRect(0, 0, w, h);
    const split = h * 0.62;
    ctx.fillStyle = '#7f9c86';
    ctx.fillRect(0, split, w, h - split);
    ctx.fillStyle = '#5c7462';
    ctx.fillRect(0, split - 6, w, 8);
    ctx.fillStyle = '#3f4a3f';
    ctx.fillRect(0, h - 22, w, 22);
    pixels(ctx, w, h, (x, y, d, k) => {
      const n = 0.9 + fbm(x, y, w, 8, 4, 64) * 0.18;
      d[k] *= n; d[k + 1] *= n; d[k + 2] *= n;
    });
    stains(ctx, w, h, 3, 'rgba(90,70,40,0.12)', 5, 0.12);
  });
}

export function linoleum() {
  return tex('lino', 512, 512, (ctx, w, h) => {
    const s = w / 4;
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      const v = hash(i, j, 3) * 12;
      ctx.fillStyle = (i + j) % 2 ? `rgb(${120 + v},${118 + v},${108 + v})` : `rgb(${150 + v},${146 + v},${132 + v})`;
      ctx.fillRect(i * s, j * s, s, s);
    }
    pixels(ctx, w, h, (x, y, d, k) => {
      const n = 0.88 + fbm(x, y, w, 16, 3, 9) * 0.2 + (hash(x, y, 1) > 0.97 ? -0.15 : 0);
      d[k] *= n; d[k + 1] *= n; d[k + 2] *= n;
    });
    ctx.strokeStyle = 'rgba(40,36,30,0.4)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * s, 0); ctx.lineTo(i * s, h);
      ctx.moveTo(0, i * s); ctx.lineTo(w, i * s);
      ctx.stroke();
    }
  });
}

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
    ctx.fillText('きょうの日直', 30, 60);
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
