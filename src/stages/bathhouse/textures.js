import { canvasTexture } from '../../core/textures.js';
import { rngFn as rng32 } from '../../core/rng.js';
import { PI } from './constants.js';

// ---------------------------------------------------------------------------
// Canvas painting

export const canvasTex = (key, w, h, draw, { repeat = false, shrink = false } = {}) => canvasTexture(key, w, h, draw, { repeat, anisotropy: 8, shrink });

export const JP = '"Zen Kaku Gothic New", "IBM Plex Sans", "Hiragino Sans", "IPAGothic", sans-serif';
export const SERIF = '"Hiragino Mincho ProN", "Yu Mincho", "IPAMincho", "Noto Serif JP", serif';

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

/** Noren: dyed cotton with a big white character. kind: 'men' | 'women' | 'yu' */
export function norenTexture(kind, name = '') {
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

/** Yellow bath bucket side print: a red ユアミン brand (a made-up bathhouse remedy), twice around. */
export function bucketTexture() {
  return canvasTex('bath-bucket', 1024, 128, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const x of [w * 0.25, w * 0.75]) {
      c.font = `900 84px ${JP}`;
      c.lineWidth = 6;
      c.strokeStyle = '#c3141a';
      c.strokeText('ユアミン', x, h * 0.46);
      c.fillStyle = '#d8161c';
      c.fillText('ユアミン', x, h * 0.46);
    }
  });
}

/**
 * Locker fronts with numbered wooden key tags. kind: 'shoe' | 'dress'.
 * Every bank is numbered differently, so there are dozens: kept at the
 * texture detail (half size on phones).
 */
export function lockerTexture(kind, start, taken) {
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
  }, { shrink: true });
}

/** Painted board / plate with lines of text. lines: [text, sizeFrac, color, weight?, font?] */
export function boardTexture(key, w, h, bg, lines, { border = null, wood = false } = {}) {
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

export function wickerTexture() {
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
export function glazeTexture(key, rgb, vary = 10) {
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
export function mirrorTexture(wiped) {
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
export function kawaraTexture() {
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

export function footprintTexture() {
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

export function puffTexture() {
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
export function steamGlassTexture() {
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

export function milkCapTexture() {
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

export function newspaperTexture() {
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

export function scaleDialTexture() {
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
