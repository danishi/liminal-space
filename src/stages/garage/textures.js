import { canvasTexture } from '../../core/textures.js';
import { hash2 } from '../../core/rng.js';
import { PI, ZONES, ZONE_COLORS } from './constants.js';

// ---------------------------------------------------------------------------
// Canvas paint (cached for the session)

const canvasTex = (key, w, h, draw, { repeat = false } = {}) => canvasTexture(key, w, h, draw, { repeat, anisotropy: 8 });

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

export const lineTex = () => canvasTex('g-line', 32, 512, (ctx, w, h) => {
  ctx.fillStyle = '#fff';
  ctx.fillRect(3, 0, w - 6, h);
  wear(ctx, w, h, 0.2, 3);
});

export const hazardTex = () => canvasTex('g-hazard', 128, 128, (ctx, w, h) => {
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

export const arrowTex = () => canvasTex('g-arrow', 128, 256, (ctx, w, h) => {
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

export const floorText = (text, color = '#fff') => canvasTex(`g-ftext:${text}:${color}`, 512, 256, (ctx, w, h) => {
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

export const wallText = (text, color) => canvasTex(`g-wtext:${text}:${color}`, 512, 256, (ctx, w, h) => {
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 210px ${FONT}`;
  ctx.fillText(text, w / 2, h / 2 + 10);
  wear(ctx, w, h, 0.18, text.length + 9);
});

export const oilTex = () => canvasTex('g-oil', 768, 256, (ctx) => {
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
export const trackTex = () => canvasTex('g-track', 64, 64, (ctx, w, h) => {
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
export const numAtlas = () => canvasTex('g-nums', 2048, 1152, (ctx) => {
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
export function numUV(zone, n) {
  const k = zone * 36 + n - 1;
  const u0 = ((k % 16) * NUM_W) / 2048;
  const v1 = 1 - (Math.floor(k / 16) * NUM_H) / 1152;
  return [u0, v1 - NUM_H / 1152, u0 + NUM_W / 2048, v1];
}

// zone panels painted on the pillars: big letter over the level
export const zoneAtlas = () => canvasTex('g-zones', 1024, 160, (ctx) => {
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
export const zoneUV = (z) => [z / 8, 0, (z + 1) / 8, 1];

export const armTex = () => canvasTex('g-arm', 256, 32, (ctx, w, h) => {
  for (let k = 0; k < 8; k++) {
    ctx.fillStyle = k % 2 ? '#f2f0ea' : '#c4201c';
    ctx.fillRect(k * 32, 0, 32, h);
  }
});

/** Poster taped to a pillar or wall: a missing car, or later, a missing driver. */
export const missingTex = (eerie) => canvasTex(`g-missing:${eerie}`, 256, 360, (ctx, w, h) => {
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
export const boardTex = (deep) => canvasTex(`g-board:${deep}`, 512, 256, (ctx, w, h) => {
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
