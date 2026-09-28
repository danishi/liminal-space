import { WATER, WALL, HOLE } from '../core/grid.js';

const K = 8; // pixels per cell in the exploration canvas

/** Fog-of-war map: cells get revealed as the player sees them. */
export class MapMemory {
  constructor(world) {
    const g = world.grid;
    this.world = world;
    this.explored = new Uint8Array(g.w * g.h);
    this.canvas = document.createElement('canvas');
    this.canvas.width = g.w * K;
    this.canvas.height = g.h * K;
    this.ctx = this.canvas.getContext('2d');
    this.timer = 0;
    this.version = 0; // bumped whenever a cell is revealed
  }

  reveal(px, pz, radiusCells = 4) {
    const g = this.world.grid;
    const [ci, cj] = g.cellOf(px, pz);
    const ctx = this.ctx;
    for (let j = cj - radiusCells; j <= cj + radiusCells; j++) {
      for (let i = ci - radiusCells; i <= ci + radiusCells; i++) {
        if (!g.inBounds(i, j) || !g.walkable(i, j)) continue;
        const k = j * g.w + i;
        if (this.explored[k]) continue;
        if ((i - ci) ** 2 + (j - cj) ** 2 > radiusCells * radiusCells + 1) continue;
        const c = g.center(i, j);
        if (!g.los(px, pz, c.x, c.z)) continue;
        this.explored[k] = 1;
        this.version++;
        const ct = g.get(i, j);
        ctx.fillStyle = ct === HOLE ? 'rgba(0,0,0,0.9)' : ct === WATER ? 'rgba(110,190,220,0.45)' : g.ramp[k] ? 'rgba(236,230,214,0.4)' : 'rgba(236,230,214,0.2)';
        ctx.fillRect(i * K, j * K, K, K);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (g.get(i + dx, j + dy) === WALL) {
            ctx.fillStyle = 'rgba(236,230,214,0.7)';
            ctx.fillRect((i + dx) * K, (j + dy) * K, K, K);
          }
        }
      }
    }
  }

  isExplored(x, z) {
    const g = this.world.grid;
    const [i, j] = g.cellOf(x, z);
    return g.inBounds(i, j) && this.explored[j * g.w + i] === 1;
  }
}

function diamond(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
  ctx.fill();
}

function arrow(ctx, x, y, r, angle, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(r * 0.7, r * 0.8);
  ctx.lineTo(0, r * 0.4);
  ctx.lineTo(-r * 0.7, r * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Changes whenever the map's markers would (doors spotted, residents moving). */
export function mapMarkerKey(world) {
  let key = '';
  for (const d of world.doors) key += d.seen ? '1' : '0';
  for (const p of world.npcMarkers) key += `|${p.x.toFixed(2)},${p.z.toFixed(2)}`;
  return key;
}

/** Markers visible on the map right now. */
function markers(world, mem) {
  const out = [];
  for (const d of world.doors) if (d.seen) out.push({ x: d.pos.x, z: d.pos.z, kind: 'exit' });
  for (const p of world.npcMarkers) if (mem.isExplored(p.x, p.z)) out.push({ x: p.x, z: p.z, kind: 'npc' });
  return out;
}

function drawMarker(ctx, m, x, y, s = 1) {
  if (m.kind === 'frag') diamond(ctx, x, y, 5 * s, '#e7d36f');
  else if (m.kind === 'exit') {
    ctx.fillStyle = '#8fd6a8';
    ctx.fillRect(x - 4.5 * s, y - 4.5 * s, 9 * s, 9 * s);
  } else {
    ctx.fillStyle = '#8fb8ff';
    ctx.beginPath();
    ctx.arc(x, y, 3.5 * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Heading-up circular minimap. */
export function drawMinimap(canvas, world, mem, player) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const R = W / 2;
  const g = world.grid;
  const pxPerM = R / 22; // show ~22 m radius
  const s = pxPerM / (K / g.cs);
  ctx.clearRect(0, 0, W, W);
  ctx.save();
  ctx.beginPath();
  ctx.arc(R, R, R - 1, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(R, R);
  ctx.rotate(player.yaw);
  ctx.save();
  ctx.scale(s, s);
  ctx.translate((-player.pos.x / g.cs) * K, (-player.pos.z / g.cs) * K);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(mem.canvas, 0, 0);
  ctx.restore();
  for (const m of markers(world, mem)) {
    let x = (m.x - player.pos.x) * pxPerM;
    let y = (m.z - player.pos.z) * pxPerM;
    const d = Math.hypot(x, y);
    if (d > R - 10) {
      if (!m.pin) continue;
      x = (x / d) * (R - 10);
      y = (y / d) * (R - 10);
    }
    drawMarker(ctx, m, x, y);
  }
  ctx.restore();
  // player
  arrow(ctx, R, R, 7, 0, '#ffffff');
  // north tick
  const nx = R + Math.sin(player.yaw) * (R - 9);
  const ny = R - Math.cos(player.yaw) * (R - 9);
  ctx.fillStyle = 'rgba(236,230,214,0.6)';
  ctx.font = '10px "DotGothic16", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', nx, ny);
}

/** North-up full map of everything explored. */
export function drawBigMap(canvas, world, mem, player) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const g = world.grid;
  const k = Math.min(W / g.w, W / g.h);
  const ox = (W - g.w * k) / 2;
  const oy = (W - g.h * k) / 2;
  ctx.clearRect(0, 0, W, W);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(mem.canvas, ox, oy, g.w * k, g.h * k);
  const toMap = (x, z) => [ox + (x / g.cs) * k, oy + (z / g.cs) * k];
  for (const m of markers(world, mem)) {
    const [x, y] = toMap(m.x, m.z);
    drawMarker(ctx, m, x, y, 1.4);
  }
  const [px, py] = toMap(player.pos.x, player.pos.z);
  arrow(ctx, px, py, 9, -player.yaw, '#ffffff');
}
