import * as THREE from 'three';

// Procedural PBR surfaces. Each painter fills a colour canvas plus height and
// roughness fields; the height field becomes a tangent-space normal map.
// Results are cached by key and shared between materials.

const cache = new Map();
let aniso = 8;

export function setSurfaceAnisotropy(n) {
  aniso = Math.min(16, n || 1);
}

// ---- noise ----------------------------------------------------------------

function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function vnoise(x, y, period, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const px = ((xi % period) + period) % period;
  const py = ((yi % period) + period) % period;
  const qx = (px + 1) % period;
  const qy = (py + 1) % period;
  const a = hash(px, py, seed);
  const b = hash(qx, py, seed);
  const c = hash(px, qy, seed);
  const d = hash(qx, qy, seed);
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Tileable fBm at pixel (px, py) of a size×size texture. Returns ~0..1. */
export function fbm(px, py, size, base, octaves, seed) {
  let amp = 0.5;
  let sum = 0;
  let norm = 0;
  let period = base;
  for (let o = 0; o < octaves; o++) {
    sum += amp * vnoise((px / size) * period, (py / size) * period, period, seed + o * 17);
    norm += amp;
    amp *= 0.5;
    period *= 2;
  }
  return sum / norm;
}

export function rnd(x, y, s = 0) {
  return hash(x, y, s);
}

/** Tileable Voronoi: returns [f1, f2, cellId] distances in cell units. */
export function voronoi(px, py, size, cells, seed) {
  const x = (px / size) * cells;
  const y = (py / size) * cells;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let f1 = 9;
  let f2 = 9;
  let id = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = xi + i;
      const cy = yi + j;
      const wx = ((cx % cells) + cells) % cells;
      const wy = ((cy % cells) + cells) % cells;
      const fx = cx + 0.15 + hash(wx, wy, seed) * 0.7;
      const fy = cy + 0.15 + hash(wx, wy, seed + 1) * 0.7;
      const d = Math.hypot(fx - x, fy - y);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = wy * cells + wx;
      } else if (d < f2) f2 = d;
    }
  }
  return [f1, f2, id];
}

// ---- builder --------------------------------------------------------------

/**
 * paint(api) where api = { size, ctx, px(x,y,r,g,b), H, R } — H and R are
 * Float32Arrays (height 0..1, roughness 0..1) the painter fills.
 */
export function surface(key, size, paint, { normal = 2.5, rough = 0.8 } = {}) {
  if (cache.has(key)) return cache.get(key);
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = colorCanvas.height = size;
  const ctx = colorCanvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const data = img.data;
  const H = new Float32Array(size * size).fill(0.5);
  const R = new Float32Array(size * size).fill(rough);
  const api = {
    size,
    ctx,
    H,
    R,
    set(x, y, r, g, b) {
      const k = (y * size + x) * 4;
      data[k] = r;
      data[k + 1] = g;
      data[k + 2] = b;
      data[k + 3] = 255;
    },
    each(fn) {
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) fn(x, y, y * size + x);
    },
    flush() {
      ctx.putImageData(img, 0, 0);
    },
    grab() {
      const d = ctx.getImageData(0, 0, size, size).data;
      data.set(d);
    },
  };
  paint(api);
  api.flush();

  // normal map from height (Sobel, wrapping)
  const nCanvas = document.createElement('canvas');
  nCanvas.width = nCanvas.height = size;
  const nctx = nCanvas.getContext('2d');
  const nImg = nctx.createImageData(size, size);
  const nd = nImg.data;
  const rCanvas = document.createElement('canvas');
  rCanvas.width = rCanvas.height = size;
  const rctx = rCanvas.getContext('2d');
  const rImg = rctx.createImageData(size, size);
  const rd = rImg.data;
  const s = size;
  for (let y = 0; y < s; y++) {
    const ym = ((y - 1 + s) % s) * s;
    const y0 = y * s;
    const yp = ((y + 1) % s) * s;
    for (let x = 0; x < s; x++) {
      const xm = (x - 1 + s) % s;
      const xp = (x + 1) % s;
      const dx = H[ym + xp] + 2 * H[y0 + xp] + H[yp + xp] - H[ym + xm] - 2 * H[y0 + xm] - H[yp + xm];
      const dy = H[yp + xm] + 2 * H[yp + x] + H[yp + xp] - H[ym + xm] - 2 * H[ym + x] - H[ym + xp];
      let nx = -dx * normal;
      let ny = dy * normal;
      const inv = 1 / Math.hypot(nx, ny, 1);
      const k = (y0 + x) * 4;
      nd[k] = (nx * inv * 0.5 + 0.5) * 255;
      nd[k + 1] = (ny * inv * 0.5 + 0.5) * 255;
      nd[k + 2] = (inv * 0.5 + 0.5) * 255;
      nd[k + 3] = 255;
      const r = Math.max(0.02, Math.min(1, R[y0 + x])) * 255;
      rd[k] = r;
      rd[k + 1] = r; // three reads roughness from G
      rd[k + 2] = r;
      rd[k + 3] = 255;
    }
  }
  nctx.putImageData(nImg, 0, 0);
  rctx.putImageData(rImg, 0, 0);

  const mk = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = aniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.userData.cached = true;
    return t;
  };
  const set = { map: mk(colorCanvas, true), normalMap: mk(nCanvas, false), roughnessMap: mk(rCanvas, false) };
  cache.set(key, set);
  return set;
}

/** MeshStandardMaterial from a surface set. */
export function pbr(set, opts = {}) {
  const { normalScale = 1, ...rest } = opts;
  return new THREE.MeshStandardMaterial({
    map: set.map,
    normalMap: set.normalMap,
    normalScale: new THREE.Vector2(normalScale, normalScale),
    roughnessMap: set.roughnessMap,
    roughness: 1,
    metalness: 0,
    ...rest,
  });
}

// ---- helpers for painters ---------------------------------------------------

const clamp = (v, a = 0, b = 255) => (v < a ? a : v > b ? b : v);

/** Soft wrapped blotches (stains, damp). Adds `amount` to field F. */
function blotches(F, size, n, seed, radius, amount) {
  for (let s = 0; s < n; s++) {
    const cx = hash(s, 1, seed) * size;
    const cy = hash(s, 2, seed) * size;
    const r = (0.04 + hash(s, 3, seed) * radius) * size;
    const r2 = r * r;
    for (let y = Math.floor(cy - r); y < cy + r; y++) {
      for (let x = Math.floor(cx - r); x < cx + r; x++) {
        const d2 = (x - cx) ** 2 + (y - cy) ** 2;
        if (d2 > r2) continue;
        const wx = ((x % size) + size) % size;
        const wy = ((y % size) + size) % size;
        const f = 1 - d2 / r2;
        F[wy * size + wx] += amount * f * f;
      }
    }
  }
}

// ---- surfaces ---------------------------------------------------------------

/** Mustard wallpaper, slightly embossed, water-stained. */
export function wallpaperYellow() {
  return surface('s-br-wall', 512, (t) => {
    const { size } = t;
    const stain = new Float32Array(size * size);
    blotches(stain, size, 8, 11, 0.16, 1);
    t.each((x, y, k) => {
      const stripe = (x % 32) < 14 ? 1 : 0;
      const chev = ((y + Math.abs((x % 32) - 16)) % 24) < 2 ? 1 : 0;
      const fiber = fbm(x, y, size, 64, 2, 3);
      const cloud = fbm(x, y, size, 6, 4, 5);
      const grime = Math.max(0, (y / size - 0.72) / 0.28);
      const st = Math.min(1, stain[k]);
      let v = 1 - stripe * 0.06 - chev * 0.05 + (cloud - 0.5) * 0.18 - grime * 0.22 - st * 0.18 + (fiber - 0.5) * 0.05;
      t.set(x, y, clamp(205 * v), clamp(181 * v - st * 10), clamp(96 * v - st * 14));
      t.H[k] = 0.5 + stripe * 0.08 + chev * 0.05 + fiber * 0.08;
      t.R[k] = 0.82 - st * 0.25;
    });
  }, { normal: 1.6 });
}

export function carpetTan() {
  return surface('s-br-carpet', 512, (t) => {
    const { size } = t;
    const damp = new Float32Array(size * size);
    blotches(damp, size, 6, 7, 0.22, 1);
    t.each((x, y, k) => {
      const tuft = rnd(x, y, 5);
      const n = fbm(x, y, size, 8, 5, 21);
      const d = Math.min(1, damp[k]);
      const v = 0.68 + n * 0.32 + tuft * 0.14 - d * 0.22;
      t.set(x, y, clamp(152 * v), clamp(131 * v), clamp(78 * v));
      t.H[k] = tuft * 0.6 + fbm(x, y, size, 128, 1, 9) * 0.4;
      t.R[k] = 0.95 - d * 0.2;
    });
  }, { normal: 3.5, rough: 0.95 });
}

export function ceilingTile() {
  return surface('s-br-ceil', 512, (t) => {
    const { size } = t;
    const half = size / 2;
    t.each((x, y, k) => {
      const gx = x % half;
      const gy = y % half;
      const edge = Math.min(gx, gy, half - gx, half - gy);
      const bar = edge < 5;
      const bevel = !bar && edge < 12 ? (edge - 5) / 7 : 1;
      const pin = rnd(x >> 1, y >> 1, 9) > 0.965;
      const n = fbm(x, y, size, 16, 3, 2);
      const stain = fbm(x, y, size, 3, 3, 31);
      const st = Math.max(0, stain - 0.62) * 3;
      let v = bar ? 0.82 : (0.9 + n * 0.1) * (pin ? 0.72 : 1) * (0.85 + bevel * 0.15) - st * 0.25;
      t.set(x, y, clamp(222 * v), clamp(216 * v - st * 8), clamp(196 * v - st * 25));
      t.H[k] = bar ? 0.9 : (pin ? 0.35 : 0.55) * (0.7 + bevel * 0.3) + n * 0.05;
      t.R[k] = bar ? 0.45 : 0.95;
    });
  }, { normal: 2 });
}

/** Square ceramic tiles with grout. `n` tiles per texture side. */
export function tiles(key, { n = 8, base = [236, 240, 238], grout = [170, 182, 184], jitter = 8, gloss = 0.08, size = 512, band = null } = {}) {
  return surface(key, size, (t) => {
    const s = size / n;
    t.each((x, y, k) => {
      const tx = Math.floor(x / s);
      const ty = Math.floor(y / s);
      const gx = x - tx * s;
      const gy = y - ty * s;
      const e = Math.min(gx, gy, s - gx, s - gy);
      const inG = e < 2;
      const var_ = (rnd(tx, ty, 4) - 0.5) * jitter;
      let col = band && band.rows.includes(ty % n) ? band.color : base;
      const dirt = fbm(x, y, size, 8, 3, 13);
      if (inG) {
        const g = 1 - (dirt - 0.5) * 0.3;
        t.set(x, y, clamp(grout[0] * g), clamp(grout[1] * g), clamp(grout[2] * g));
        t.H[k] = 0.2;
        t.R[k] = 0.75;
      } else {
        const bevel = Math.min(1, (e - 2) / 4);
        const glaze = fbm(x, y, size, 32, 2, 7) - 0.5;
        const v = 1 + glaze * 0.03;
        t.set(x, y, clamp((col[0] + var_) * v), clamp((col[1] + var_) * v), clamp((col[2] + var_) * v));
        t.H[k] = 0.3 + bevel * 0.5 + glaze * 0.02;
        t.R[k] = gloss + (dirt - 0.5) * 0.04;
      }
    });
  }, { normal: 3 });
}

export function carpetHotel() {
  return surface('s-hotel-carpet', 512, (t) => {
    const { size } = t;
    const S = 64;
    t.each((x, y, k) => {
      const cx = ((x + S / 2) % S) - S / 2;
      const cy = ((y + S / 2) % S) - S / 2;
      const diamond = Math.abs(Math.abs(cx) + Math.abs(cy) - 24) < 2.2;
      const dot = Math.hypot(cx, cy) < 6;
      const dot2 = Math.hypot(((x) % S) - S / 2 + (x % S < S / 2 ? 0 : 0), ((y) % S) - S / 2) < 3;
      const tuft = rnd(x, y, 3);
      const n = fbm(x, y, size, 8, 4, 12);
      const v = 0.72 + n * 0.3 + tuft * 0.12;
      let c = [96, 22, 26];
      if (diamond) c = [176, 128, 60];
      else if (dot) c = [34, 64, 54];
      else if (dot2) c = [170, 120, 58];
      t.set(x, y, clamp(c[0] * v), clamp(c[1] * v), clamp(c[2] * v));
      t.H[k] = tuft * 0.7 + (diamond ? 0.15 : 0);
      t.R[k] = 0.97;
    });
  }, { normal: 3.5 });
}

export function wallpaperDamask() {
  return surface('s-hotel-wall', 512, (t) => {
    const { size } = t;
    t.each((x, y, k) => {
      const col = Math.floor(x / 64);
      const lx = (x % 64) - 32;
      const ly = ((y + (col % 2) * 48) % 96) - 48;
      const r = Math.hypot(lx / 11, ly / 22);
      const motif = Math.abs(r - 1) < 0.12 || (Math.abs(lx) < 1.5 && Math.abs(ly) < 30 && Math.abs(ly) > 22);
      const stripe = (x % 64) > 28;
      const n = fbm(x, y, size, 6, 4, 8);
      const v = 0.8 + n * 0.3 - (stripe ? 0.08 : 0);
      const c = motif ? [150, 132, 86] : [44, 58, 47];
      t.set(x, y, clamp(c[0] * v), clamp(c[1] * v), clamp(c[2] * v));
      t.H[k] = motif ? 0.62 : 0.5 + fbm(x, y, size, 96, 1, 4) * 0.04;
      t.R[k] = motif ? 0.45 : 0.85;
    });
  }, { normal: 2 });
}

export function woodPanel(key = 's-wood', base = [78, 44, 28], gloss = 0.35) {
  return surface(key, 512, (t) => {
    const { size } = t;
    t.each((x, y, k) => {
      const plank = Math.floor(x / 128);
      const n = fbm(x * 0.12 + plank * 50, y * 2.5, size, 4, 4, 91 + plank);
      const ring = 0.5 + 0.5 * Math.sin((x / size) * 60 + n * 14 + plank * 3);
      const seam = x % 128 < 2;
      const v = (0.7 + ring * 0.18 + n * 0.22) * (seam ? 0.45 : 1);
      t.set(x, y, clamp(base[0] * v), clamp(base[1] * v), clamp(base[2] * v));
      t.H[k] = seam ? 0.1 : 0.5 + ring * 0.05;
      t.R[k] = seam ? 0.8 : gloss + (1 - ring) * 0.1;
    });
  }, { normal: 1.5 });
}

export function paint(key, rgb, { rough = 0.7, grain = 0.06, scale = 8 } = {}) {
  return surface(key, 256, (t) => {
    const { size } = t;
    t.each((x, y, k) => {
      const n = fbm(x, y, size, scale, 4, key.length * 7);
      const v = 1 - grain + n * grain * 2;
      t.set(x, y, clamp(rgb[0] * v), clamp(rgb[1] * v), clamp(rgb[2] * v));
      t.H[k] = n * 0.3 + rnd(x, y, 2) * 0.05;
      t.R[k] = rough + (n - 0.5) * 0.1;
    });
  }, { normal: 1.2 });
}

export function linoleumFloor() {
  return surface('s-lino', 512, (t) => {
    const { size } = t;
    const s = size / 4;
    t.each((x, y, k) => {
      const tx = Math.floor(x / s);
      const ty = Math.floor(y / s);
      const seam = x % s < 1.5 || y % s < 1.5;
      const light = (tx + ty) % 2 === 0;
      const n = fbm(x, y, size, 16, 3, 9);
      const scratch = Math.abs(fbm(x * 3, y * 0.3, size, 8, 2, 77) - 0.5) < 0.004;
      const v = (light ? 1 : 0.8) * (0.9 + n * 0.16) * (seam ? 0.6 : 1) - (scratch ? 0.08 : 0);
      t.set(x, y, clamp(148 * v), clamp(142 * v), clamp(126 * v));
      t.H[k] = seam ? 0.3 : 0.5 - (scratch ? 0.1 : 0);
      t.R[k] = 0.28 + n * 0.2 + (scratch ? 0.2 : 0);
    });
  }, { normal: 1.5 });
}

export function schoolWallPaint() {
  return surface('s-school-wall', 512, (t) => {
    const { size } = t;
    t.each((x, y, k) => {
      // canvas top = top of wall
      const split = size * 0.62;
      const n = fbm(x, y, size, 8, 4, 64);
      const lower = y > split;
      const line = Math.abs(y - split) < 5;
      const base = y > size - 22;
      let c = lower ? [122, 150, 128] : [228, 218, 194];
      if (line) c = [88, 112, 96];
      if (base) c = [62, 72, 62];
      const v = 0.92 + n * 0.14;
      t.set(x, y, clamp(c[0] * v), clamp(c[1] * v), clamp(c[2] * v));
      t.H[k] = 0.5 + n * 0.1 + (line ? 0.2 : 0);
      t.R[k] = lower ? 0.45 : 0.8;
    });
  }, { normal: 1.5 });
}

/** Rectangular subway-style wall tiles with a coloured line band. */
export function subwayTiles(bandColor = [40, 120, 70]) {
  return surface('s-subway', 512, (t) => {
    const { size } = t;
    const tw = size / 8;
    const th = size / 16;
    t.each((x, y, k) => {
      const row = Math.floor(y / th);
      const off = row % 2 ? tw / 2 : 0;
      const gx = (x + off) % tw;
      const gy = y % th;
      const e = Math.min(gx, gy, tw - gx, th - gy);
      const inG = e < 1.8;
      const band = row >= 9 && row <= 10;
      const n = fbm(x, y, size, 8, 3, 3);
      const var_ = (rnd(Math.floor((x + off) / tw), row, 6) - 0.5) * 8;
      if (inG) {
        t.set(x, y, 150, 150, 142);
        t.H[k] = 0.2;
        t.R[k] = 0.8;
      } else {
        const c = band ? bandColor : [226, 222, 208];
        const v = 1 - (n - 0.5) * 0.06;
        t.set(x, y, clamp((c[0] + var_) * v), clamp((c[1] + var_) * v), clamp((c[2] + var_) * v));
        t.H[k] = 0.3 + Math.min(1, (e - 1.8) / 3) * 0.5;
        t.R[k] = 0.12 + n * 0.08;
      }
    });
  }, { normal: 3 });
}

export function terrazzo() {
  return surface('s-terrazzo', 512, (t) => {
    const { size } = t;
    t.each((x, y, k) => {
      const n = fbm(x, y, size, 8, 4, 41);
      const chip = rnd(x >> 2, y >> 2, 17);
      const chip2 = rnd(x >> 1, y >> 1, 23);
      let c = [168, 166, 160];
      if (chip > 0.9) c = [90, 88, 84];
      else if (chip2 > 0.95) c = [220, 216, 206];
      const dirt = Math.max(0, n - 0.55) * 0.8;
      const v = 0.92 + n * 0.12 - dirt * 0.3;
      t.set(x, y, clamp(c[0] * v), clamp(c[1] * v), clamp(c[2] * v));
      t.H[k] = 0.5 + (chip > 0.9 ? 0.02 : 0);
      t.R[k] = 0.22 + dirt * 0.5 + n * 0.06;
    });
  }, { normal: 1 });
}

/** Yellow tactile paving (dots for warning, bars for direction). */
export function tactile(kind = 'bars') {
  return surface(`s-tactile-${kind}`, 256, (t) => {
    const { size } = t;
    const cell = size / 4;
    t.each((x, y, k) => {
      const lx = (x % cell) - cell / 2;
      const ly = (y % cell) - cell / 2;
      let bump = 0;
      if (kind === 'dots') bump = Math.max(0, 1 - Math.hypot(lx, ly) / (cell * 0.28));
      else bump = Math.abs(lx) < cell * 0.18 && Math.abs(ly) < cell * 0.42 ? 1 : 0;
      const n = fbm(x, y, size, 8, 3, 5);
      const v = 0.85 + n * 0.2;
      t.set(x, y, clamp(222 * v), clamp(178 * v), clamp(38 * v));
      t.H[k] = 0.3 + bump * 0.6;
      t.R[k] = 0.55;
    });
  }, { normal: 4 });
}

/** Irregular flagstones (Voronoi) for the shrine path. */
export function flagstone() {
  return surface('s-flagstone', 512, (t) => {
    const { size } = t;
    t.each((x, y, k) => {
      const [f1, f2, id] = voronoi(x, y, size, 6, 3);
      const edge = f2 - f1;
      const gap = edge < 0.06;
      const n = fbm(x, y, size, 16, 4, 71);
      const moss = Math.max(0, fbm(x, y, size, 5, 3, 12) - 0.55) * 2.5;
      const tone = 0.8 + rnd(id, 0, 3) * 0.3;
      if (gap) {
        const m = 0.5 + moss;
        t.set(x, y, clamp(52 * m), clamp(62 * m + 10), clamp(44 * m));
        t.H[k] = 0.1;
        t.R[k] = 0.9;
      } else {
        const v = tone * (0.8 + n * 0.3);
        t.set(x, y, clamp(128 * v - moss * 20), clamp(126 * v + moss * 10), clamp(118 * v - moss * 25));
        t.H[k] = 0.4 + Math.min(0.3, edge * 2) + n * 0.15;
        t.R[k] = 0.7 + n * 0.2;
      }
    });
  }, { normal: 3 });
}

export function gravel() {
  return surface('s-gravel', 512, (t) => {
    const { size } = t;
    t.each((x, y, k) => {
      const [f1, f2, id] = voronoi(x, y, size, 48, 9);
      const stone = 1 - Math.min(1, f1 * 1.6);
      const tone = 0.7 + rnd(id, 1, 5) * 0.4;
      const v = tone * (0.55 + stone * 0.5);
      t.set(x, y, clamp(150 * v), clamp(146 * v), clamp(138 * v));
      t.H[k] = stone * 0.8 + (f2 - f1) * 0.2;
      t.R[k] = 0.85;
    });
  }, { normal: 4 });
}

/** Dense bamboo grove seen from the path. */
export function bambooGrove() {
  return surface('s-bamboo', 512, (t) => {
    const { size } = t;
    const stalks = [];
    for (let s = 0; s < 22; s++) stalks.push({ x: rnd(s, 0, 4) * size, w: 6 + rnd(s, 1, 4) * 14, depth: rnd(s, 2, 4), node: 40 + rnd(s, 3, 4) * 60, ph: rnd(s, 4, 4) * 100 });
    stalks.sort((a, b) => a.depth - b.depth);
    t.each((x, y, k) => {
      // dark background of deeper grove
      const n = fbm(x, y, size, 6, 3, 8);
      let c = [18 + n * 16, 30 + n * 22, 18 + n * 10];
      let h = 0.2;
      let r = 0.9;
      for (const s of stalks) {
        let dx = x - s.x;
        if (dx > size / 2) dx -= size;
        if (dx < -size / 2) dx += size;
        if (Math.abs(dx) > s.w / 2) continue;
        const u = dx / (s.w / 2);
        const shade = Math.sqrt(1 - u * u);
        const node = Math.abs(((y + s.ph) % s.node) - s.node / 2) > s.node / 2 - 2;
        const lum = (0.35 + s.depth * 0.65) * (0.45 + shade * 0.55) * (node ? 0.7 : 1);
        c = [clamp(96 * lum + 20), clamp(132 * lum + 18), clamp(62 * lum)];
        h = 0.4 + shade * 0.5 - (node ? 0.1 : 0);
        r = 0.45;
      }
      t.set(x, y, c[0], c[1], c[2]);
      t.H[k] = h;
      t.R[k] = r;
    });
  }, { normal: 2 });
}

export function concrete(key = 's-concrete', rgb = [132, 130, 124]) {
  return surface(key, 512, (t) => {
    const { size } = t;
    t.each((x, y, k) => {
      const n = fbm(x, y, size, 8, 5, key.length * 3);
      const pore = rnd(x, y, 7) > 0.985;
      const v = 0.82 + n * 0.3 - (pore ? 0.2 : 0);
      t.set(x, y, clamp(rgb[0] * v), clamp(rgb[1] * v), clamp(rgb[2] * v));
      t.H[k] = n * 0.6 - (pore ? 0.2 : 0);
      t.R[k] = 0.85 + (n - 0.5) * 0.1;
    });
  }, { normal: 1.5 });
}

export function checkerPastel() {
  return surface('s-pastel-check', 256, (t) => {
    const { size } = t;
    const s = size / 2;
    t.each((x, y, k) => {
      const a = (Math.floor(x / s) + Math.floor(y / s)) % 2 === 0;
      const n = fbm(x, y, size, 8, 3, 5);
      const c = a ? [247, 214, 226] : [253, 246, 236];
      const v = 0.97 + n * 0.05;
      t.set(x, y, clamp(c[0] * v), clamp(c[1] * v), clamp(c[2] * v));
      t.H[k] = 0.5 + n * 0.05;
      t.R[k] = 0.3 + n * 0.1;
    });
  }, { normal: 1 });
}

/** Plaster / matte paint for pastel walls (tinted by material colour). */
export function plaster() {
  return surface('s-plaster', 256, (t) => {
    const { size } = t;
    t.each((x, y, k) => {
      const n = fbm(x, y, size, 8, 5, 44);
      const v = 238 + n * 17;
      t.set(x, y, v, v, v);
      t.H[k] = n * 0.5;
      t.R[k] = 0.75;
    });
  }, { normal: 1.5 });
}

export function waterNormalMap() {
  return surface('s-water', 256, (t) => {
    const { size } = t;
    t.each((x, y, k) => {
      t.set(x, y, 255, 255, 255);
      t.H[k] = fbm(x, y, size, 4, 4, 77);
    });
  }, { normal: 5 }).normalMap;
}
