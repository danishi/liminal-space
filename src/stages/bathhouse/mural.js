import { rngFn as rng32 } from '../../core/rng.js';
import { PI } from './constants.js';
import { canvasTex, SERIF } from './textures.js';

// The bath-hall mural: Mt. Fuji over the sea, painted on canvas.

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
export function muralTexture(variant) {
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
