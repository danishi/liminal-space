import * as THREE from 'three';
import { canvasTexture } from '../../core/textures.js';
import { PI, W, Z, MALL } from './constants.js';

// ---------------------------------------------------------------------------
// Canvas textures (signs, skylights, the directory map). Made per level.

export const canvasTex = (w, h, draw) => canvasTexture(null, w, h, draw);

const SANS = '"IBM Plex Sans", "Helvetica Neue", Arial, sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';

// storefront sign styles: channel letters on a raceway, or a backlit lightbox
export const STYLES = [
  { bg: '#1b1917', fg: '#ff5a3a', glow: '#ff3818', font: `700 {s}px ${SANS}`, dead: '#3a2a26' },
  { bg: '#f4efe4', fg: '#1d4f8a', glow: null, font: `italic 600 {s}px ${SERIF}`, dead: '#c8c2b6' },
  { bg: '#14222a', fg: '#62e6dc', glow: '#20c8c0', font: `600 {s}px ${SANS}`, dead: '#23343a' },
  { bg: '#26152c', fg: '#ff82d8', glow: '#ff40c0', font: `italic 700 {s}px ${SERIF}`, dead: '#3a2440' },
  { bg: '#191919', fg: '#ffd45a', glow: '#ffb020', font: `700 {s}px ${SANS}`, dead: '#353020' },
  { bg: '#fbf7ee', fg: '#b0262a', glow: null, font: `700 {s}px ${SANS}`, dead: '#d8cfc2' },
  { bg: '#0f1a30', fg: '#f4f0e0', glow: '#9ab8ff', font: `600 {s}px ${SERIF}`, dead: '#26304a' },
];

/** A shop sign; `dead` holds indexes of letters whose tubes have gone out. */
export function signTex(name, st, dead, ghost = false) {
  return canvasTex(1024, 160, (ctx, w, h) => {
    if (ghost) ctx.clearRect(0, 0, w, h);
    else {
      ctx.fillStyle = st.bg;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, w - 6, h - 6);
    }
    let size = h * 0.6;
    const setFont = () => (ctx.font = st.font.replace('{s}', size));
    setFont();
    while (ctx.measureText(name).width > w * 0.88 && size > 24) {
      size -= 4;
      setFont();
    }
    ctx.textBaseline = 'middle';
    let x = (w - ctx.measureText(name).width) / 2;
    for (let k = 0; k < name.length; k++) {
      const ch = name[k];
      const lit = !dead.has(k);
      if (ghost) {
        // the letters were taken down; their outline stayed on the wall
        ctx.fillStyle = 'rgba(120,108,90,0.22)';
        ctx.shadowBlur = 0;
      } else {
        ctx.shadowColor = st.glow || 'transparent';
        ctx.shadowBlur = lit && st.glow ? 16 : 0;
        ctx.fillStyle = lit ? st.fg : st.dead;
      }
      ctx.fillText(ch, x, h * 0.54);
      x += ctx.measureText(ch).width;
    }
  });
}

/** Skylight glazing seen from below: pale sky through a grid of mullions. */
export function skylightTex(grey, dirt, seed) {
  return canvasTex(256, 512, (ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, w, h);
    const a = new THREE.Color(0.52, 0.7, 0.94).lerp(new THREE.Color(0.66, 0.67, 0.7), grey);
    const b = new THREE.Color(0.86, 0.92, 1).lerp(new THREE.Color(0.8, 0.8, 0.8), grey);
    sky.addColorStop(0, `#${a.getHexString()}`);
    sky.addColorStop(1, `#${b.getHexString()}`);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    // clouds
    ctx.filter = 'blur(18px)';
    for (let k = 0; k < 6; k++) {
      const r = (n) => Math.abs(Math.sin(seed * 12.9 + k * 78.2 + n * 3.1) * 43758.5) % 1;
      ctx.fillStyle = `rgba(255,255,255,${0.35 + r(1) * 0.3})`;
      ctx.beginPath();
      ctx.ellipse(r(2) * w, r(3) * h, 40 + r(4) * 60, 20 + r(5) * 40, 0, 0, PI * 2);
      ctx.fill();
    }
    // grime and dead leaves on the glass
    ctx.filter = 'blur(3px)';
    for (let k = 0; k < dirt * 40; k++) {
      const r = (n) => Math.abs(Math.sin(seed * 7.3 + k * 19.7 + n * 5.9) * 23421.6) % 1;
      ctx.fillStyle = `rgba(${60 + r(1) * 40},${50 + r(2) * 30},${30},${0.3 + r(3) * 0.5})`;
      ctx.beginPath();
      ctx.ellipse(r(4) * w, r(5) * h, 3 + r(6) * 12, 2 + r(7) * 6, r(8) * 3, 0, PI * 2);
      ctx.fill();
    }
    ctx.filter = 'none';
    ctx.fillStyle = '#5b5e62';
    for (let k = 0; k <= 2; k++) ctx.fillRect(k * (w / 2) - 5, 0, 10, h);
    for (let k = 0; k <= 5; k++) ctx.fillRect(0, k * (h / 5) - 4, w, 8);
  });
}

/** Someone lying face down on the skylight, seen from underneath. */
export function silhouetteTex() {
  return canvasTex(256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.filter = 'blur(5px)';
    ctx.fillStyle = 'rgba(20,18,16,0.92)';
    ctx.beginPath();
    ctx.ellipse(w / 2, 46, 20, 24, 0, 0, PI * 2); // head
    ctx.fill();
    ctx.fillRect(w / 2 - 30, 70, 60, 90); // body
    ctx.save();
    ctx.translate(w / 2 - 30, 78);
    ctx.rotate(0.5);
    ctx.fillRect(-12, 0, 14, 80); // arms, spread against the glass
    ctx.restore();
    ctx.save();
    ctx.translate(w / 2 + 30, 78);
    ctx.rotate(-0.5);
    ctx.fillRect(-2, 0, 14, 80);
    ctx.restore();
    // hands pressed flat
    ctx.beginPath();
    ctx.ellipse(w / 2 - 78, 150, 12, 16, 0.4, 0, PI * 2);
    ctx.ellipse(w / 2 + 78, 150, 12, 16, -0.4, 0, PI * 2);
    ctx.fill();
    ctx.fillRect(w / 2 - 28, 158, 22, 80);
    ctx.fillRect(w / 2 + 6, 158, 22, 80);
  });
}

export function grooveTex() {
  const t = canvasTex(64, 16, (ctx, w, h) => {
    ctx.fillStyle = '#b4b6b8';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#3a3c3e';
    for (let x = 0; x < w; x += 8) ctx.fillRect(x, 0, 3, h);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(70, 1);
  return t;
}

/** Brown paper over a vacant shop's windows, with a leasing notice. */
export function paperTex(seed, text, sub) {
  return canvasTex(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#b89c70';
    ctx.fillRect(0, 0, w, h);
    for (let k = 0; k < 7; k++) {
      ctx.fillStyle = `rgba(90,70,40,${0.08 + (k % 3) * 0.04})`;
      ctx.fillRect(k * 76 + (seed % 20), 0, 3, h);
    }
    ctx.fillStyle = '#f7f3ea';
    ctx.fillRect(w * 0.3, h * 0.22, w * 0.4, h * 0.46);
    ctx.fillStyle = '#b0262a';
    ctx.font = `700 34px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.fillText(text, w / 2, h * 0.4);
    ctx.fillStyle = '#333';
    ctx.font = `18px ${SANS}`;
    ctx.fillText(sub, w / 2, h * 0.55);
  });
}

/** Window banner: STORE CLOSING, or worse. */
export function bannerTex(text, sub) {
  return canvasTex(512, 128, (ctx, w, h) => {
    ctx.fillStyle = '#d8231f';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffe94a';
    ctx.font = `800 52px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h * 0.4);
    ctx.fillStyle = '#fff';
    ctx.font = `600 22px ${SANS}`;
    ctx.fillText(sub, w / 2, h * 0.8);
  });
}

export function menuTex(name, items) {
  return canvasTex(512, 200, (ctx, w, h) => {
    ctx.fillStyle = '#1c1a18';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffcf5a';
    ctx.font = `700 26px ${SANS}`;
    ctx.fillText(name.toUpperCase(), 18, 34);
    ctx.font = `20px ${SANS}`;
    items.forEach(([a, b], k) => {
      ctx.fillStyle = '#f2ece0';
      ctx.fillText(a, 18, 72 + k * 30);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#9fe0a0';
      ctx.fillText(b, w - 18, 72 + k * 30);
      ctx.textAlign = 'left';
    });
  });
}

/** The mall directory, drawn from the level itself. */
export function directoryTex(g, zones, stars, fool) {
  return canvasTex(512, 420, (ctx, w, h) => {
    ctx.fillStyle = '#f6f1e6';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1d4f8a';
    ctx.fillRect(0, 0, w, 56);
    ctx.fillStyle = '#fff';
    ctx.font = `700 26px ${SANS}`;
    ctx.fillText('MALL DIRECTORY', 18, 36);
    ctx.font = `italic 16px ${SERIF}`;
    ctx.textAlign = 'right';
    ctx.fillText(MALL, w - 16, 34);
    ctx.textAlign = 'left';
    const s = 8.4;
    const ox = (w - W * s) / 2;
    const oy = 74;
    for (let j = 0; j < g.h; j++) {
      for (let i = 0; i < g.w; i++) {
        if (g.solid(i, j)) continue;
        const z = zones[j * g.w + i];
        const up = g.heightOf(i, j) > 2;
        ctx.fillStyle = z === Z.SHOP ? (up ? '#7aa6d6' : '#e8905e') : z === Z.SERV || z === Z.OFFICE ? '#bdb7ab' : z === Z.REST ? '#8cc6bc' : up ? '#d9c79c' : '#eadcbc';
        if (g.ramp[j * g.w + i]) ctx.fillStyle = '#b8a67a';
        ctx.fillRect(ox + i * s, oy + j * s, s + 0.5, s + 0.5);
      }
    }
    const star = (x, y, r) => {
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -PI / 2 + (k * PI) / 5;
        const rr = k % 2 ? r * 0.45 : r;
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
    };
    ctx.fillStyle = '#d32020';
    stars.forEach(([i, j], k) => {
      const x = ox + (i + 0.5) * s;
      const y = oy + (j + 0.5) * s;
      star(x, y, 9);
      if (k === 0 || fool) {
        ctx.font = `700 12px ${SANS}`;
        ctx.fillText(k === 0 ? 'YOU ARE HERE' : fool && k === stars.length - 1 ? 'YOU ARE NOT HERE' : 'YOU ARE HERE', x + 11, y + 4);
      }
    });
    ctx.font = `13px ${SANS}`;
    const legend = [['#eadcbc', 'Level 1'], ['#d9c79c', 'Level 2'], ['#e8905e', 'Shops'], ['#8cc6bc', 'Restrooms'], ['#bdb7ab', 'Staff only']];
    legend.forEach(([c, t], k) => {
      ctx.fillStyle = c;
      ctx.fillRect(18 + k * 98, h - 34, 14, 14);
      ctx.fillStyle = '#333';
      ctx.fillText(t, 36 + k * 98, h - 22);
    });
  });
}

/** CCTV monitor: grey picture with a timestamp that never moves. */
export function cctvTex(cam) {
  return canvasTex(128, 96, (ctx, w, h) => {
    ctx.fillStyle = '#7a8078';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#5a605a';
    ctx.fillRect(0, h * 0.55, w, h * 0.45);
    ctx.fillStyle = '#a0a69e';
    ctx.fillRect(w * 0.3, h * 0.2, w * 0.4, h * 0.3);
    for (let y = 0; y < h; y += 3) {
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(0, y, w, 1);
    }
    ctx.fillStyle = '#f0f0f0';
    ctx.font = '10px monospace';
    ctx.fillText(`CAM ${cam}`, 5, 12);
    ctx.fillText('12-31-1999 20:59', 5, h - 6);
  });
}
