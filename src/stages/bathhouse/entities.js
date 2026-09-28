import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Entities

/** Noren panels that sway, and part when you walk through them. */
export class Noren {
  constructor(world, panels, pos, normal) {
    this.world = world;
    this.panels = panels;
    this.pos = pos;
    this.normal = normal;
    this.t = world.rng.float(0, 10);
  }

  update(dt, ctx) {
    this.t += dt;
    const p = ctx.player.pos;
    const dx = p.x - this.pos.x;
    const dz = p.z - this.pos.z;
    const along = dx * this.normal.x + dz * this.normal.z;
    this.panels.forEach((m, k) => {
      const wp = m.userData.world;
      const lat = Math.hypot(p.x - wp.x, p.z - wp.z);
      // pushed aside, away from whoever walks through
      const push = lat < 0.8 && Math.abs(along) < 0.9 ? (1 - lat / 0.8) * 1.1 * Math.sign(along || 1) : 0;
      m.userData.push += (push - m.userData.push) * Math.min(1, dt * 6);
      m.rotation.x = Math.sin(this.t * 0.9 + k * 0.7) * 0.035 + m.userData.push;
    });
  }
}

/** Things you can poke: buckets, fridges, chairs, scales. Picks the one you're looking at. */
export class Pokeables {
  constructor(world) {
    this.world = world;
    this.items = [];
    this.pos = new THREE.Vector3();
    this.target = null;
    this.enabled = false;
    this.interactRange = 2.3;
    this.aimHeight = 0;
    this.t = 0;
    this._f = new THREE.Vector3();
  }

  get prompt() {
    return this.target ? this.target.prompt : '';
  }

  add(item) {
    item.aim = item.aim ?? 0;
    this.items.push(item);
    return item;
  }

  update(dt, ctx) {
    this.t += dt;
    const cam = ctx.camera.position;
    ctx.camera.getWorldDirection(this._f);
    let best = null;
    let score = -Infinity;
    for (const it of this.items) {
      if (it.enabled === false) continue;
      const dx = it.pos.x - cam.x;
      const dz = it.pos.z - cam.z;
      const d = Math.hypot(dx, dz);
      if (d > (it.range || 2.2)) continue;
      const dy = it.pos.y + it.aim - cam.y;
      const len = Math.hypot(dx, dy, dz);
      const dot = (this._f.x * dx + this._f.y * dy + this._f.z * dz) / len;
      const flat = (this._f.x * dx + this._f.z * dz) / (Math.hypot(this._f.x, this._f.z) * d + 1e-6);
      const s = Math.max(dot, flat * 0.97) - d * 0.08;
      if (s < 0.8) continue;
      if (s > score) {
        score = s;
        best = it;
      }
    }
    this.target = best;
    this.enabled = !!best;
    if (best) this.pos.set(best.pos.x, best.pos.y + best.aim, best.pos.z);
    for (const it of this.items) it.tick?.(dt, ctx);
  }

  interact(game) {
    this.target?.use(game, this.target);
  }
}
