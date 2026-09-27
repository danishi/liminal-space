import * as THREE from 'three';
import { smilerFace, glowSprite } from '../core/textures.js';

const _v = new THREE.Vector3();

/** Moves an object along BFS paths over the stage grid. */
class GridMover {
  constructor(world, obj, radius = 0.35) {
    this.world = world;
    this.obj = obj;
    this.radius = radius;
    this.path = null;
    this.goal = null;
  }

  cell() {
    return this.world.grid.cellOf(this.obj.position.x, this.obj.position.z);
  }

  setGoal(i, j) {
    const [ci, cj] = this.cell();
    this.goal = [i, j];
    this.path = this.world.grid.path(ci, cj, i, j);
    return !!this.path;
  }

  /** Advance along the path; returns true once the goal is reached. */
  step(dt, speed) {
    if (!this.path) return true;
    const g = this.world.grid;
    while (this.path.length) {
      const [i, j] = this.path[0];
      const c = g.center(i, j);
      const dx = c.x - this.obj.position.x;
      const dz = c.z - this.obj.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.25) {
        this.path.shift();
        continue;
      }
      this.moveToward(c.x, c.z, speed, dt);
      return false;
    }
    return true;
  }

  moveToward(x, z, speed, dt) {
    const p = this.obj.position;
    const dx = x - p.x;
    const dz = z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-4) return 0;
    const s = Math.min(d, speed * dt);
    p.x += (dx / d) * s;
    p.z += (dz / d) * s;
    this.world.collide(p, this.radius);
    // turn to face movement direction
    const yaw = Math.atan2(dx, dz);
    let diff = yaw - this.obj.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.obj.rotation.y += diff * Math.min(1, dt * 8);
    return s;
  }
}

/** A far walkable cell that the player can't currently see. */
function farHiddenCell(world, player, minCells, maxCells = 999) {
  const g = world.grid;
  const [pi, pj] = g.cellOf(player.pos.x, player.pos.z);
  const d = g.distances(pi, pj);
  const cands = [];
  for (let j = 0; j < g.h; j++) {
    for (let i = 0; i < g.w; i++) {
      const k = d[j * g.w + i];
      if (k < minCells || k > maxCells) continue;
      const c = g.center(i, j);
      if (g.los(player.pos.x, player.pos.z, c.x, c.z)) continue;
      cands.push([i, j]);
    }
  }
  if (!cands.length) {
    // fall back to anything reachable
    for (let k = 0; k < d.length; k++) if (d[k] > minCells / 2) cands.push([k % g.w, (k / g.w) | 0]);
  }
  return cands.length ? world.rng.pick(cands) : null;
}

// ---------------------------------------------------------------------------

function tallFigure({ body = 0x070707, eyes = 0xffffff, height = 2.45, hat = false, coat = false }) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: body, roughness: 1, metalness: 0 });
  const s = height / 2.45;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.75, 4, 8), m);
  torso.position.y = 1.55 * s;
  torso.scale.set(1, s, 0.7);
  g.add(torso);
  if (coat) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.34, 0.9, 10), m);
    c.position.y = 1.05 * s;
    g.add(c);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), m);
  head.scale.set(0.9, 1.35, 0.95);
  head.position.y = 2.22 * s;
  g.add(head);
  if (hat) {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.02, 16), m);
    brim.position.y = 2.36 * s;
    g.add(brim);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.15, 0.18, 16), m);
    crown.position.y = 2.45 * s;
    g.add(crown);
  }
  const eyeMat = new THREE.MeshBasicMaterial({ color: eyes });
  eyeMat.color.multiplyScalar(2.5);
  for (const x of [-0.05, 0.05]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), eyeMat);
    e.position.set(x, 2.25 * s, 0.12);
    g.add(e);
  }
  const limb = (len, r) => {
    const pivot = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 3, 6), m);
    mesh.position.y = -len / 2 - r;
    pivot.add(mesh);
    return pivot;
  };
  const armL = limb(1.05 * s, 0.045);
  armL.position.set(-0.24, 1.95 * s, 0);
  const armR = limb(1.05 * s, 0.045);
  armR.position.set(0.24, 1.95 * s, 0);
  const legL = limb(0.95 * s, 0.06);
  legL.position.set(-0.1, 1.1 * s, 0);
  const legR = limb(0.95 * s, 0.06);
  legR.position.set(0.1, 1.1 * s, 0);
  g.add(armL, armR, legL, legR);
  g.userData = { head, armL, armR, legL, legR, torso };
  return g;
}

/**
 * A hunting creature. Roams, listens for running footsteps, and chases on
 * sight. Breaking line of sight for a few seconds makes it lose track.
 */
export class Wanderer {
  constructor(world, cell, opts = {}) {
    this.world = world;
    this.hostile = true;
    this.name = opts.name || '徘徊者';
    this.catchTitle = opts.catchTitle || '徘徊者に捕まった';
    this.catchLine = opts.catchLine || '黄色い光の中で、長い腕が肩に触れた。';
    this.speeds = { roam: 1.3, investigate: 2.4, chase: 4.25, ...(opts.speeds || {}) };
    this.sight = opts.sight || 20;
    this.graceTime = opts.grace ?? 20;
    this.disturbLights = opts.disturbLights ?? true;
    this.object = tallFigure(opts.look || {});
    const c = world.grid.center(...cell);
    this.object.position.set(c.x, 0, c.z);
    this.mover = new GridMover(world, this.object, 0.35);
    this.state = 'roam';
    this.stateTime = 0;
    this.lostTime = 0;
    this.lastSeen = null;
    this.repath = 0;
    this.stepTimer = 0;
    this.phase = 0;
    this.threat = 0;
    this.farTime = 0;
    this.twitch = 0;
    this.active = !world.attract;
    this.panner = null;
  }

  sees(player, dist) {
    if (dist > this.sight) return false;
    const p = this.object.position;
    if (!this.world.grid.los(p.x, p.z, player.pos.x, player.pos.z)) return false;
    if (dist < 5) return true;
    const yaw = this.object.rotation.y;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const dx = (player.pos.x - p.x) / dist;
    const dz = (player.pos.z - p.z) / dist;
    return fx * dx + fz * dz > 0.3;
  }

  setState(s) {
    if (s === this.state) return;
    if (s === 'chase' && this.state !== 'chase') this.onChase?.();
    this.state = s;
    this.stateTime = 0;
    this.repath = 0;
  }

  update(dt, ctx) {
    const { player, game } = ctx;
    const p = this.object.position;
    this.stateTime += dt;
    this.graceTime -= dt;
    if (!this.panner && game.audio.ready) this.panner = game.audio.panner(p.x, 1.5, p.z, { ref: 3, rolloff: 1.3 });
    if (this.panner) game.audio.setPannerPos(this.panner, p.x, 1.6, p.z);

    const dx = player.pos.x - p.x;
    const dz = player.pos.z - p.z;
    const dist = Math.hypot(dx, dz);
    let speed = 0;

    if (this.active && this.graceTime <= 0 && !ctx.attract) {
      const seen = this.sees(player, dist);
      if (seen) {
        this.lastSeen = { x: player.pos.x, z: player.pos.z };
        this.lostTime = 0;
        this.setState('chase');
      } else if (this.state === 'chase') {
        this.lostTime += dt;
        if (this.lostTime > 4) this.setState('investigate');
      }
      // hearing
      if (this.state !== 'chase') {
        const hear = player.noise >= 1 ? 16 : player.noise > 0 ? 4.5 : 0;
        if (dist < hear) {
          this.lastSeen = { x: player.pos.x, z: player.pos.z };
          if (this.state !== 'investigate') this.setState('investigate');
          this.repath = 0;
        }
      }

      if (this.state === 'chase') {
        speed = this.speeds.chase;
        if (seen && dist < 9) {
          this.mover.path = null;
          this.mover.moveToward(player.pos.x, player.pos.z, speed, dt);
        } else {
          this.repath -= dt;
          if (this.repath <= 0) {
            this.repath = 0.4;
            this.mover.setGoal(...this.world.grid.cellOf(this.lastSeen.x, this.lastSeen.z));
          }
          this.mover.step(dt, speed);
        }
        if (dist < 0.85) game.caught(this);
      } else if (this.state === 'investigate') {
        speed = this.speeds.investigate;
        if (this.repath <= 0 && this.lastSeen) {
          this.repath = 99;
          this.mover.setGoal(...this.world.grid.cellOf(this.lastSeen.x, this.lastSeen.z));
        }
        if (this.mover.step(dt, speed) || this.stateTime > 14) this.setState('roam');
      } else {
        speed = this.speeds.roam;
        if (!this.mover.path || !this.mover.path.length || this.stateTime > 25) {
          // roam, drifting towards the player's general area
          const g = this.world.grid;
          const [pi, pj] = g.cellOf(player.pos.x, player.pos.z);
          let target = null;
          for (let k = 0; k < 20 && !target; k++) {
            const i = pi + this.world.rng.int(-12, 12);
            const j = pj + this.world.rng.int(-12, 12);
            if (g.walkable(i, j)) target = [i, j];
          }
          if (target) this.mover.setGoal(...target);
          this.stateTime = 0;
        }
        this.mover.step(dt, speed);
      }

      // keep the pressure on: if it's been far away for long, relocate
      if (dist > 40 && this.state === 'roam') {
        this.farTime += dt;
        if (this.farTime > 25) {
          this.farTime = 0;
          const c = farHiddenCell(this.world, player, 12, 20);
          if (c) {
            const w = this.world.grid.center(...c);
            p.set(w.x, 0, w.z);
            this.mover.path = null;
          }
        }
      } else this.farTime = 0;
    } else if (ctx.attract || !this.active) {
      // idle sway only
    }

    p.y = this.world.floorAt(p.x, p.z);

    // animation
    const moving = speed > 0 && (this.mover.path?.length || this.state === 'chase');
    this.phase += dt * (moving ? speed * 2.4 : 0.5);
    const u = this.object.userData;
    const swing = moving ? Math.sin(this.phase) * 0.6 : Math.sin(this.phase) * 0.05;
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
    u.armL.rotation.x = -swing * 0.5 + (this.state === 'chase' ? -0.9 : 0);
    u.armR.rotation.x = swing * 0.5 + (this.state === 'chase' ? -0.9 : 0);
    this.twitch -= dt;
    if (this.twitch <= 0) {
      this.twitch = 0.3 + Math.random() * 2;
      u.head.rotation.z = (Math.random() - 0.5) * 0.9;
      u.head.rotation.x = (Math.random() - 0.5) * 0.4;
    }

    // footsteps
    if (moving && this.panner) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.stepTimer = Math.PI / (speed * 2.4);
        game.audio.thump(this.panner, this.state === 'chase' ? 1 : 0.5);
      }
    }

    if (this.disturbLights && this.world.lightPool) this.world.lightPool.setDisturbance(p, 7);

    const t = this.state === 'chase' ? 1 - dist / 30 : 0.6 * (1 - dist / 12);
    this.threat = ctx.attract ? 0 : Math.max(0, Math.min(1, t));
  }

  dispose() {
    this.panner?.disconnect();
  }
}

// ---------------------------------------------------------------------------

/**
 * Only a grin in the dark. It moves only while you are not looking at it,
 * and retreats when held in the flashlight beam.
 */
export class Smiler {
  constructor(world, cell, opts = {}) {
    this.world = world;
    this.hostile = true;
    this.name = '笑うもの';
    this.catchTitle = '暗闇が笑った';
    this.catchLine = '目を離したほんの一瞬、白い歯がすぐ目の前にあった。';
    this.object = new THREE.Group();
    const c = world.grid.center(...cell);
    this.object.position.set(c.x, 0, c.z);

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    body.position.y = 1.55;
    body.scale.set(1, 1.3, 0.6);
    this.object.add(body);
    const faceMat = new THREE.MeshBasicMaterial({ map: smilerFace(), transparent: true, depthWrite: false, fog: false });
    faceMat.color.setRGB(1.8, 1.7, 1.55);
    this.face = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), faceMat);
    this.face.position.y = 1.62;
    this.object.add(this.face);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: 0xfff1d6, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    glow.scale.setScalar(2.2);
    glow.position.y = 1.6;
    this.object.add(glow);

    this.mover = new GridMover(world, this.object, 0.3);
    this.grace = opts.grace ?? 30;
    this.exposure = 0;
    this.hiddenTime = 0;
    this.repath = 0;
    this.giggleTimer = 4;
    this.threat = 0;
    this.blink = 0;
    this.panner = null;
    this.speed = opts.speed || 2.3;
  }

  update(dt, ctx) {
    const { player, game, camera } = ctx;
    const p = this.object.position;
    this.grace -= dt;
    if (!this.panner && game.audio.ready) this.panner = game.audio.panner(p.x, 1.6, p.z, { ref: 2.5, rolloff: 1.2 });
    if (this.panner) game.audio.setPannerPos(this.panner, p.x, 1.6, p.z);

    // billboard toward camera (yaw only)
    this.face.parent.rotation.y = Math.atan2(camera.position.x - p.x, camera.position.z - p.z);

    // blink
    this.blink -= dt;
    this.face.scale.y = this.blink < 0.12 && this.blink > 0 ? 0.1 : 1;
    if (this.blink <= 0) this.blink = 2 + Math.random() * 5;

    if (ctx.attract) return;

    if (this.hiddenTime > 0) {
      this.hiddenTime -= dt;
      this.object.visible = false;
      this.threat = 0;
      if (this.hiddenTime <= 0) {
        const c = farHiddenCell(this.world, player, 14, 26);
        if (c) {
          const w = this.world.grid.center(...c);
          p.set(w.x, 0, w.z);
        }
        this.object.visible = true;
        this.mover.path = null;
      }
      return;
    }

    const dx = player.pos.x - p.x;
    const dz = player.pos.z - p.z;
    const dist = Math.hypot(dx, dz);
    const los = this.world.grid.los(player.pos.x, player.pos.z, p.x, p.z);
    _v.set(p.x - camera.position.x, 1.6 + p.y - camera.position.y, p.z - camera.position.z).normalize();
    const fwd = camera.getWorldDirection(new THREE.Vector3());
    const dot = fwd.dot(_v);
    const halfFov = THREE.MathUtils.degToRad(camera.fov * 0.5) * Math.max(1, camera.aspect) * 0.85;
    const observed = los && dist < 32 && dot > Math.cos(Math.min(1.3, halfFov));
    const lit = observed && player.flashlight && dist < 14 && dot > Math.cos(THREE.MathUtils.degToRad(22));

    if (lit) {
      this.exposure += dt;
      this.face.material.opacity = 1 - Math.min(0.7, this.exposure / 1.6);
      if (this.exposure > 1.3) {
        game.audio.giggle(this.panner);
        game.toast('光を嫌って、それは消えた', null, 'accent');
        this.exposure = 0;
        this.face.material.opacity = 1;
        this.hiddenTime = 9;
        return;
      }
    } else {
      this.exposure = Math.max(0, this.exposure - dt * 0.5);
      this.face.material.opacity = 1;
    }

    if (!observed && this.grace <= 0) {
      const sp = dist > 16 ? this.speed * 1.5 : this.speed;
      if (los && dist < 6) {
        this.mover.path = null;
        this.mover.moveToward(player.pos.x, player.pos.z, sp, dt);
      } else {
        this.repath -= dt;
        if (this.repath <= 0) {
          this.repath = 0.6;
          this.mover.setGoal(...this.world.grid.cellOf(player.pos.x, player.pos.z));
        }
        this.mover.step(dt, sp);
      }
      this.giggleTimer -= dt;
      if (this.giggleTimer <= 0 && dist < 16) {
        this.giggleTimer = 5 + Math.random() * 6;
        if (dist < 6) game.audio.whisper(this.panner);
        else game.audio.giggle(this.panner);
      }
    }
    if (dist < 0.9 && this.grace <= 0) game.caught(this);

    this.threat = this.grace > 0 ? 0 : Math.max(0, Math.min(1, 1 - dist / 16)) * (observed ? 1 : 0.8);
  }

  dispose() {
    this.panner?.disconnect();
  }
}

export { GridMover, farHiddenCell, tallFigure };
