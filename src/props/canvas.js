import { canvasTexture } from '../core/textures.js';

// Small canvas-painted images for props: posters, paintings, signs, screens.

const FONT = '"IBM Plex Sans", "Zen Kaku Gothic New", "Hiragino Sans", sans-serif';
const DOT = '"DotGothic16", monospace';

/** Generic bilingual sign: big text + optional small subtitle, with an arrow. */
export function signTexture(text, sub = '', { bg = '#1d2a3a', fg = '#ffffff', w = 512, h = 128, arrow = '', accent = null } = {}) {
  return canvasTexture(`sign:${text}:${sub}:${bg}:${fg}:${arrow}:${accent}`, w, h, (ctx) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    if (accent) {
      ctx.fillStyle = accent;
      ctx.fillRect(0, 0, 18, h);
    }
    ctx.fillStyle = fg;
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${sub ? h * 0.42 : h * 0.5}px ${FONT}`;
    const x = accent ? 36 : 24;
    ctx.fillText(text, x, sub ? h * 0.36 : h * 0.52);
    if (sub) {
      ctx.globalAlpha = 0.8;
      ctx.font = `${h * 0.22}px ${FONT}`;
      ctx.fillText(sub, x, h * 0.76);
      ctx.globalAlpha = 1;
    }
    if (arrow) {
      ctx.font = `600 ${h * 0.6}px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText(arrow, w - 20, h * 0.54);
    }
  });
}

/** Colourful poster; `seed` picks a layout. */
export function posterTexture(seed, { mood = 0 } = {}) {
  return canvasTexture(`poster:${seed}:${mood}`, 256, 360, (ctx, w, h) => {
    const r = (n) => (Math.sin(seed * 91.7 + n * 13.3) * 43758.5453) % 1;
    const rr = (n) => Math.abs(r(n));
    const hue = Math.floor(rr(1) * 360);
    ctx.fillStyle = `hsl(${hue},${55 - mood * 40}%,${70 - mood * 30}%)`;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = `hsla(${(hue + 40 + i * 60) % 360},${60 - mood * 45}%,${55 - mood * 20}%,0.85)`;
      const t = Math.floor(rr(i + 2) * 3);
      if (t === 0) {
        ctx.beginPath();
        ctx.arc(rr(i + 3) * w, rr(i + 4) * h * 0.7, 20 + rr(i + 5) * 60, 0, Math.PI * 2);
        ctx.fill();
      } else ctx.fillRect(rr(i + 3) * w * 0.7, rr(i + 4) * h * 0.6, 30 + rr(i + 5) * 120, 20 + rr(i + 6) * 80);
    }
    ctx.fillStyle = mood > 0.5 ? '#111' : '#fff';
    ctx.fillRect(16, h - 90, w - 32, 70);
    ctx.fillStyle = mood > 0.5 ? '#bbb' : '#222';
    ctx.font = `bold 26px ${FONT}`;
    const words = mood > 0.6 ? ['STAY', 'DON’T LOOK', 'NO EXIT', 'KEEP WALKING', 'ARE YOU LOST'] : ['SALE', 'SUMMER', 'WELCOME', 'SMILE', 'OPEN', '夏祭り', '安全第一'];
    ctx.fillText(words[Math.floor(rr(9) * words.length)], 28, h - 58);
    ctx.font = `14px ${FONT}`;
    ctx.fillText(mood > 0.6 ? 'you have been here before' : 'every day, all day', 28, h - 32);
  });
}

/** Framed painting: calm landscape, or at depth a faceless portrait. */
export function paintingTexture(seed, { eerie = false } = {}) {
  return canvasTexture(`painting:${seed}:${eerie}`, 256, 200, (ctx, w, h) => {
    if (!eerie) {
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, `hsl(${200 + (seed % 5) * 8},40%,70%)`);
      sky.addColorStop(0.6, `hsl(${30 + (seed % 3) * 10},50%,80%)`);
      sky.addColorStop(1, '#6b7a4a');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#4a5a3a';
      ctx.beginPath();
      ctx.moveTo(0, h * 0.7);
      for (let x = 0; x <= w; x += 16) ctx.lineTo(x, h * 0.62 + Math.sin(x * 0.03 + seed) * 12);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.fill();
    } else {
      ctx.fillStyle = '#2a2420';
      ctx.fillRect(0, 0, w, h);
      const g = ctx.createRadialGradient(w / 2, h * 0.42, 5, w / 2, h * 0.42, 80);
      g.addColorStop(0, '#c9b59a');
      g.addColorStop(1, 'rgba(60,50,40,0)');
      ctx.fillStyle = '#5a4c40';
      ctx.fillRect(w * 0.25, h * 0.62, w * 0.5, h * 0.4);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.42, 38, 48, 0, 0, Math.PI * 2);
      ctx.fill();
      if (seed % 3 === 0) {
        ctx.fillStyle = '#111';
        ctx.fillRect(w / 2 - 20, h * 0.38, 12, 4);
        ctx.fillRect(w / 2 + 8, h * 0.38, 12, 4);
      }
    }
    // canvas texture
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  });
}

/** Vending machine front: rows of drinks, price tags and a lit panel. */
export function vendingTexture(seed) {
  return canvasTexture(`vend:${seed}`, 256, 512, (ctx, w, h) => {
    ctx.fillStyle = seed % 2 ? '#e8ecef' : '#d64032';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f6f8f5';
    ctx.fillRect(14, 20, w - 28, h * 0.55);
    const cols = 6;
    for (let row = 0; row < 4; row++) {
      for (let c = 0; c < cols; c++) {
        const x = 22 + c * ((w - 44) / cols);
        const y = 34 + row * 66;
        const hue = (seed * 47 + row * 70 + c * 33) % 360;
        ctx.fillStyle = `hsl(${hue},65%,55%)`;
        ctx.fillRect(x + 4, y, 26, 44);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(x + 7, y + 4, 5, 36);
        ctx.fillStyle = '#222';
        ctx.fillRect(x + 4, y + 48, 26, 9);
        ctx.fillStyle = '#ff6040';
        ctx.font = `bold 8px ${FONT}`;
        ctx.fillText('¥130', x + 6, y + 55);
      }
    }
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(40, h * 0.66, w - 80, 70);
    ctx.fillStyle = '#39ff9a';
    ctx.font = `20px ${DOT}`;
    ctx.fillText('- - - -', 60, h * 0.66 + 42);
    ctx.fillStyle = '#333';
    ctx.fillRect(30, h * 0.85, w - 60, 44);
  });
}

export function screenStatic(seed) {
  return canvasTexture(null, 128, 96, (ctx, w, h) => {
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const v = Math.random() * 200 + (seed % 2) * 20;
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(x, y, 2, 2);
      }
    }
  });
}

export function clockFace(eerie = false) {
  return canvasTexture(`clock:${eerie}`, 128, 128, (ctx) => {
    ctx.fillStyle = '#f4f1e6';
    ctx.beginPath();
    ctx.arc(64, 64, 62, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.fillRect(64 + Math.sin(a) * 50 - 2, 64 - Math.cos(a) * 50 - 2, 4, 4);
    }
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 4;
    const hA = eerie ? 5.9 : 2.1;
    const mA = eerie ? 5.8 : 4.3;
    ctx.beginPath();
    ctx.moveTo(64, 64);
    ctx.lineTo(64 + Math.sin(hA) * 30, 64 - Math.cos(hA) * 30);
    ctx.moveTo(64, 64);
    ctx.lineTo(64 + Math.sin(mA) * 45, 64 - Math.cos(mA) * 45);
    ctx.stroke();
  });
}

/** Wooden ema plaque with scribbled wishes. */
export function emaTexture(seed) {
  return canvasTexture(`ema:${seed % 6}`, 128, 96, (ctx) => {
    ctx.fillStyle = '#d8b27a';
    ctx.beginPath();
    ctx.moveTo(0, 30);
    ctx.lineTo(64, 0);
    ctx.lineTo(128, 30);
    ctx.lineTo(128, 96);
    ctx.lineTo(0, 96);
    ctx.fill();
    ctx.fillStyle = '#2a1a10';
    ctx.font = `14px ${FONT}`;
    const wishes = ['合格祈願', '家内安全', '帰れますように', '健康第一', 'また会えますように', '縁結び'];
    ctx.fillText(wishes[seed % wishes.length], 14, 62);
    ctx.fillStyle = '#b3261e';
    ctx.fillRect(60, 8, 8, 8);
  });
}

export function bulletinTexture(seed) {
  return canvasTexture(`bulletin:${seed % 4}`, 512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#b89366';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      const x = 20 + (i % 5) * 96 + ((seed * 13 + i * 7) % 20);
      const y = 16 + Math.floor(i / 5) * 118 + ((seed * 5 + i * 11) % 14);
      ctx.fillStyle = ['#fffdf5', '#ffe9a8', '#cfe9ff', '#ffd6e0'][(i + seed) % 4];
      ctx.fillRect(x, y, 80, 100);
      ctx.fillStyle = '#555';
      for (let l = 0; l < 6; l++) ctx.fillRect(x + 8, y + 18 + l * 12, 40 + ((i * l * 7) % 28), 3);
      ctx.fillStyle = '#d33';
      ctx.beginPath();
      ctx.arc(x + 40, y + 6, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

export function mapBoard() {
  return canvasTexture('mapboard', 512, 320, (ctx, w, h) => {
    ctx.fillStyle = '#f4f4ee';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#2e7d4f';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(30, 200);
    ctx.lineTo(200, 200);
    ctx.lineTo(260, 120);
    ctx.lineTo(480, 120);
    ctx.stroke();
    ctx.strokeStyle = '#e0602a';
    ctx.beginPath();
    ctx.moveTo(120, 40);
    ctx.lineTo(120, 290);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 3;
    for (const [x, y] of [[30, 200], [120, 200], [260, 120], [380, 120], [480, 120], [120, 40], [120, 290]]) {
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#222';
    ctx.font = `bold 22px ${FONT}`;
    ctx.fillText('構内図 Station Map', 20, 30);
    ctx.fillStyle = '#d33';
    ctx.beginPath();
    ctx.arc(200, 200, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `14px ${FONT}`;
    ctx.fillText('現在地 You are here', 170, 235);
  });
}
