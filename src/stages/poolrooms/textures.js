import { canvasTexture } from '../../core/textures.js';

const PI = Math.PI;
const SANS = 'Arial, "Helvetica Neue", sans-serif';

/** Frosted roof glazing: one 2 m bay of a skylight strip (repeats along it). */
export function skylightTexture() {
  return canvasTexture('pool-skylight', 128, 256, (ctx, w, h) => {
    const grd = ctx.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, '#d4e6ea');
    grd.addColorStop(0.5, '#ffffff');
    grd.addColorStop(1, '#d4e6ea');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
    // glazing bars
    ctx.fillStyle = '#6f7b80';
    ctx.fillRect(0, 0, w, 8);
    ctx.fillRect(0, h / 2 - 2, w, 4);
    ctx.fillRect(w / 2 - 2, 0, 4, h);
  }, { repeat: true });
}

/** Face of a swimmers' pace clock: sixty seconds, numbered every five. */
export function paceClockTexture() {
  return canvasTexture('pool-pace-clock', 512, 512, (ctx, w) => {
    const c = w / 2;
    ctx.fillStyle = '#f6f6f0';
    ctx.beginPath();
    ctx.arc(c, c, c - 2, 0, PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1b1b1b';
    for (let s = 0; s < 60; s++) {
      const a = (s / 60) * PI * 2;
      const big = s % 5 === 0;
      const r0 = big ? c - 62 : c - 38;
      const r1 = c - 16;
      ctx.lineWidth = big ? 11 : 4;
      ctx.beginPath();
      ctx.moveTo(c + Math.sin(a) * r0, c - Math.cos(a) * r0);
      ctx.lineTo(c + Math.sin(a) * r1, c - Math.cos(a) * r1);
      ctx.stroke();
    }
    ctx.font = `bold 48px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let s = 0; s < 60; s += 5) {
      const a = (s / 60) * PI * 2;
      const r = c - 106;
      ctx.fillStyle = s % 15 === 0 ? '#c41e1e' : '#1b1b1b';
      ctx.fillText(String(s || 60), c + Math.sin(a) * r, c - Math.cos(a) * r + 2);
    }
  });
}

/** Lettering painted on the pool deck (depth markings). */
export function deckLabel(text, color) {
  return canvasTexture(`pool-deck:${text}`, 256, 96, (ctx, w, h) => {
    ctx.fillStyle = color;
    ctx.font = `bold 60px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 3);
  });
}

/** Lane number on the front of a starting block. */
export function laneNumber(n) {
  return canvasTexture(`pool-lane:${n}`, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#f4f4ee';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1d3f6e';
    ctx.font = `bold 96px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), w / 2, h / 2 + 5);
  });
}
