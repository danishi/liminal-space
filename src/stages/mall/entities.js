import * as THREE from 'three';
import { signTexture } from '../../props/canvas.js';
import { Mannequin, seen } from '../../entities/creatures.js';
import { applyPose } from '../../entities/figures.js';
import { PI } from './constants.js';
import { silhouetteTex } from './textures.js';

// ---------------------------------------------------------------------------
// Entities

/** A display-window mannequin: it never walks, but it poses while you aren't looking. */
export class DisplayMannequin extends Mannequin {
  constructor(world, opts) {
    super(world, { ...opts, moves: false });
    this.baseYaw = opts.yaw;
    this.swapWait = world.rng.float(3, 7);
  }

  update(dt, ctx) {
    super.update(dt, ctx);
    if (ctx.attract || this.broken || this.unseen < this.swapWait) return;
    const p = this.pos;
    const pl = ctx.player.pos;
    const dist = Math.hypot(pl.x - p.x, pl.z - p.z);
    if (dist > 24) return;
    const u = this.world.uneaseAt(p.x, p.z);
    applyPose(this.fig.userData.rig, this.pickPose(u));
    // deeper in, they turn to face wherever you are
    let yaw = this.baseYaw;
    if (u > 0.45) {
      const want = Math.atan2(pl.x - p.x, pl.z - p.z);
      const diff = Math.atan2(Math.sin(want - yaw), Math.cos(want - yaw));
      yaw += Math.max(-1, Math.min(1, diff)) * Math.min(1, (u - 0.45) * 2);
    }
    this.object.rotation.y = yaw;
    this.moved = true;
    this.unseen = 0;
    this.swapWait = this.world.rng.float(3, 8) / (1 + u);
  }
}

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
const TWINKLE = [72, 72, 79, 79, 81, 81, 79, 0, 77, 77, 76, 76, 74, 74, 72];

/**
 * Coin-operated rocket ride. Walk past and it starts rocking and playing its
 * tune, with nobody on it.
 */
export class KiddieRide {
  constructor(world, x, y, z, yaw) {
    this.world = world;
    const k = { std: (c, r = 0.5, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m }) };
    const g = (this.object = new THREE.Group());
    const add = (geo, mat, px, py, pz, rx = 0, ry = 0, rz = 0, parent = g) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.rotation.set(rx, ry, rz);
      parent.add(m);
      return m;
    };
    const blue = k.std(0x2a5ab8, 0.4);
    const red = k.std(0xd8302a, 0.3, 0.1);
    const yellow = k.std(0xf2c230, 0.4);
    const white = k.std(0xf2eee6, 0.4);
    add(new THREE.BoxGeometry(1.1, 0.22, 1.6), blue, 0, 0.11, 0);
    add(new THREE.BoxGeometry(1.12, 0.05, 1.62), yellow, 0, 0.2, 0);
    // coin box on a post at the front
    add(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 10), white, 0.42, 0.55, 0.72);
    add(new THREE.BoxGeometry(0.24, 0.3, 0.18), red, 0.42, 1.0, 0.72);
    const label = new THREE.MeshStandardMaterial({ map: signTexture('25¢', 'RIDE ME!', { bg: '#f2c230', fg: '#b01c1c', w: 256, h: 128 }), roughness: 0.5 });
    add(new THREE.PlaneGeometry(0.2, 0.12), label, 0.42, 1.02, 0.811);
    this.coinLight = add(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: 0x401010 }), 0.42, 1.2, 0.72);
    // the rocket rocks on a pivot
    const body = (this.body = new THREE.Group());
    body.position.y = 0.25;
    g.add(body);
    add(new THREE.CylinderGeometry(0.34, 0.34, 1.1, 20), red, 0, 0.55, -0.05, PI / 2, 0, 0, body);
    add(new THREE.ConeGeometry(0.34, 0.55, 20), white, 0, 0.55, 0.77, PI / 2, 0, 0, body);
    add(new THREE.CylinderGeometry(0.34, 0.24, 0.2, 20), white, 0, 0.55, -0.7, PI / 2, 0, 0, body);
    for (let n = 0; n < 3; n++) {
      const a = (n / 3) * PI * 2 + PI / 2;
      add(new THREE.BoxGeometry(0.05, 0.4, 0.35), yellow, Math.cos(a) * 0.4, 0.55 + Math.sin(a) * 0.4, -0.55, 0, 0, a - PI / 2, body);
    }
    add(new THREE.BoxGeometry(0.4, 0.12, 0.5), k.std(0x1a1a1a, 0.6), 0, 0.88, -0.1, 0, 0, 0, body);
    add(new THREE.SphereGeometry(0.12, 14, 10), new THREE.MeshPhysicalMaterial({ color: 0x9fd8ff, roughness: 0.05, clearcoat: 1 }), 0, 0.68, 0.36, 0, 0, 0, body);
    this.lights = [];
    for (let n = 0; n < 4; n++) {
      const m = add(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0x302010 }), (n % 2 ? 1 : -1) * 0.3, 0.72, -0.4 + n * 0.25, 0, 0, 0, body);
      this.lights.push(m);
    }
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    this.pos = g.position;
    world.addFootprint(x, z, 1.2, 1.7, yaw);
    this.aimHeight = 0.8;
    this.interactRange = 2.6;
    this.t = 0;
    this.run = 0;
    this.cool = 2;
    this.notes = [];
    this.panner = null;
    this.seenOnce = false;
  }

  get prompt() {
    return 'Put a quarter in';
  }

  interact(game) {
    game.toast('You don’t have a quarter.', 'It starts anyway.');
    this.start(game);
  }

  start(game) {
    const audio = game.audio;
    this.run = 8;
    this.cool = 25;
    if (!audio.ready) return;
    if (!this.panner) this.panner = audio.panner(this.pos.x, this.pos.y + 1, this.pos.z, { ref: 2, rolloff: 1.2 });
    // the further out, the more the tune sags
    const u = this.world.uneaseAt(this.pos.x, this.pos.z);
    const pitch = 1 - Math.max(0, u - 0.5) * 0.12;
    const beat = 0.28 * (1 + Math.max(0, u - 0.5) * 0.4);
    const t0 = audio.now + 0.1;
    TWINKLE.forEach((n, k) => {
      if (!n) return;
      const f = NOTE(n) * pitch * (u > 0.9 && k === TWINKLE.length - 1 ? 0.94 : 1);
      const last = k === TWINKLE.length - 1;
      audio.tone({ type: 'square', f, t: t0 + k * beat, a: 0.005, d: last && u > 0.9 ? 2.5 : beat * 0.8, peak: 0.025, send: 0.3, dest: this.panner });
      audio.tone({ type: 'sine', f: f / 2, t: t0 + k * beat, a: 0.005, d: beat * 0.7, peak: 0.02, send: 0.2, dest: this.panner });
    });
  }

  update(dt, ctx) {
    this.t += dt;
    this.cool -= dt;
    if (!ctx.attract) {
      const p = ctx.player.pos;
      const d = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
      if (d < 3.2 && this.cool <= 0) {
        this.start(ctx.game);
        if (!this.seenOnce) {
          this.seenOnce = true;
          ctx.game.toast('The kiddie ride starts on its own', 'Nobody is on it');
        }
      }
    }
    this.run = Math.max(0, this.run - dt);
    const amt = Math.min(1, this.run);
    this.body.rotation.x = Math.sin(this.t * 4.2) * 0.1 * amt;
    this.body.rotation.z = Math.sin(this.t * 2.1) * 0.06 * amt;
    this.lights.forEach((l, n) => l.material.color.setHex(amt > 0 && Math.floor(this.t * 6 + n) % 2 ? 0xffe060 : 0x302010));
    this.coinLight.material.color.setHex(amt > 0 ? 0xff3020 : 0x401010);
  }

  dispose() {
    this.panner?.disconnect();
  }
}

/**
 * Someone lying face down on a skylight. Look up at it for too long and it
 * isn't there.
 */
export class SkylightShadow {
  constructor(world, x, y, z) {
    this.world = world;
    this.mat = new THREE.MeshBasicMaterial({ map: silhouetteTex(), transparent: true, depthWrite: false, fog: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), this.mat);
    m.rotation.x = PI / 2;
    m.rotation.z = world.rng.float(0, PI * 2);
    m.position.set(x, y, z);
    this.object = m;
    this.presence = 0;
    this.watched = 0;
    this.gone = false;
  }

  update(dt, ctx) {
    if (ctx.attract || this.gone) return;
    const p = this.object.position;
    const looking = seen(ctx, this.world, p.x, p.y, p.z, 0.5) && Math.hypot(ctx.player.pos.x - p.x, ctx.player.pos.z - p.z) < 14;
    this.watched = looking ? this.watched + dt : Math.max(0, this.watched - dt * 0.5);
    this.presence = looking ? 0.35 : 0;
    if (this.watched > 2.2) {
      this.mat.opacity -= dt * 3;
      if (this.mat.opacity <= 0) {
        this.gone = true;
        this.object.visible = false;
        this.presence = 0;
        ctx.game.pulseStatic(0.2);
      }
    }
  }
}
