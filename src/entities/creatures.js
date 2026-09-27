import * as THREE from 'three';
import { smilerFace, glowSprite } from '../core/textures.js';

// Apparitions: things you glimpse, never things that hurt you. They appear
// more often and closer as unease grows.

const _v = new THREE.Vector3();
const _f = new THREE.Vector3();

/** Moves an object along BFS paths over the stage grid. */
export class GridMover {
  constructor(world, obj, radius = 0.35) {
    this.world = world;
    this.obj = obj;
    this.radius = radius;
    this.path = null;
  }

  setGoal(i, j) {
    const [ci, cj] = this.world.grid.cellOf(this.obj.position.x, this.obj.position.z);
    this.path = this.world.grid.path(ci, cj, i, j);
    return !!this.path;
  }

  step(dt, speed) {
    if (!this.path) return true;
    const g = this.world.grid;
    while (this.path.length) {
      const [i, j] = this.path[0];
      const c = g.center(i, j);
      const dx = c.x - this.obj.position.x;
      const dz = c.z - this.obj.position.z;
      if (Math.hypot(dx, dz) < 0.25) {
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
    if (d < 1e-4) return;
    const s = Math.min(d, speed * dt);
    p.x += (dx / d) * s;
    p.z += (dz / d) * s;
    p.y = this.world.floorAt(p.x, p.z);
    const yaw = Math.atan2(dx, dz);
    let diff = yaw - this.obj.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.obj.rotation.y += diff * Math.min(1, dt * 8);
  }
}

/** A cell at a given distance range that the player cannot currently see. */
export function hiddenCell(world, player, minCells, maxCells = 999, { visible = false } = {}) {
  const g = world.grid;
  const [pi, pj] = g.cellOf(player.pos.x, player.pos.z);
  const d = g.distances(pi, pj);
  const cands = [];
  for (let j = 0; j < g.h; j++) {
    for (let i = 0; i < g.w; i++) {
      const k = d[j * g.w + i];
      if (k < minCells || k > maxCells) continue;
      const c = g.center(i, j);
      if (g.los(player.pos.x, player.pos.z, c.x, c.z) !== visible) continue;
      cands.push([i, j]);
    }
  }
  return cands.length ? world.rng.pick(cands) : null;
}

/** Is a world point inside the camera's view cone (ignores walls)? */
function inView(camera, x, y, z, slack = 0.85) {
  _v.set(x - camera.position.x, y - camera.position.y, z - camera.position.z).normalize();
  camera.getWorldDirection(_f);
  const half = THREE.MathUtils.degToRad(camera.fov * 0.5) * Math.max(1, camera.aspect) * slack;
  return _f.dot(_v) > Math.cos(Math.min(1.3, half));
}

// ---------------------------------------------------------------------------

export function tallFigure({ body = 0x070707, eyes = 0xffffff, height = 2.45, hat = false, coat = false, suit = false } = {}) {
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
  if (suit) {
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.42), m);
    bag.position.set(0.3, 0.75 * s, 0);
    g.add(bag);
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
  const eyeMat = new THREE.MeshBasicMaterial({ color: eyes, transparent: true });
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
  g.userData = { head, armL, armR, legL, legR, mat: m, eyeMat };
  return g;
}

/**
 * The Watcher: a tall figure that appears at the edge of sight, stands still
 * and stares. Approach it and it turns away down a corridor; wait too long
 * and it simply isn't there any more.
 */
export class Watcher {
  constructor(world, opts = {}) {
    this.world = world;
    this.presence = 0;
    this.opts = opts;
    this.object = tallFigure(opts.look || {});
    this.object.visible = false;
    this.mover = new GridMover(world, this.object, 0.3);
    this.state = 'hidden';
    this.timer = world.rng.float(18, 40) / (1 + world.depth * 0.25);
    this.phase = 0;
    this.stepTimer = 0;
    this.panner = null;
    this.watched = 0;
    this.fade = 0;
  }

  setOpacity(a) {
    const u = this.object.userData;
    u.mat.transparent = a < 1;
    u.mat.opacity = a;
    u.eyeMat.opacity = a;
    this.object.visible = a > 0.01;
  }

  update(dt, ctx) {
    const { player, game, camera } = ctx;
    const p = this.object.position;
    if (!this.panner && game.audio.ready) this.panner = game.audio.panner(p.x, 1.5, p.z, { ref: 3, rolloff: 1.3 });
    if (this.panner) game.audio.setPannerPos(this.panner, p.x, p.y + 1.6, p.z);
    const unease = this.world.uneaseAt(player.pos.x, player.pos.z);
    const dist = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);

    if (ctx.attract) {
      this.presence = 0;
      return;
    }

    if (this.state === 'hidden') {
      this.presence = 0;
      this.timer -= dt;
      if (this.timer <= 0) {
        // appear somewhere visible but out of frame, a fair distance away
        const near = Math.max(4, Math.round(9 - unease * 4));
        const cell = hiddenCell(this.world, player, near, near + 8, { visible: true });
        const c = cell && this.world.grid.center(...cell);
        if (c && !inView(camera, c.x, 1.5, c.z, 1.1)) {
          p.set(c.x, this.world.floorAt(c.x, c.z), c.z);
          this.state = 'watching';
          this.watched = 0;
          this.fade = 0;
          this.object.rotation.y = Math.atan2(player.pos.x - p.x, player.pos.z - p.z);
        } else this.timer = 2;
      }
      return;
    }

    // face the player while watching
    if (this.state === 'watching') {
      this.fade = Math.min(1, this.fade + dt * 2);
      this.setOpacity(this.fade);
      const yaw = Math.atan2(player.pos.x - p.x, player.pos.z - p.z);
      let diff = Math.atan2(Math.sin(yaw - this.object.rotation.y), Math.cos(yaw - this.object.rotation.y));
      this.object.rotation.y += diff * Math.min(1, dt * 2);
      const seen = inView(camera, p.x, p.y + 1.5, p.z) && this.world.grid.los(player.pos.x, player.pos.z, p.x, p.z);
      if (seen) this.watched += dt;
      if (seen && this.watched < dt * 1.5) {
        game.audio.stinger();
        game.pulseStatic(0.25);
      }
      this.presence = seen ? Math.max(0.3, 1 - dist / 18) : 0.15;
      if (dist < 6 || this.watched > 6 + this.world.rng.float(0, 4)) {
        // walk away around a corner
        const cell = hiddenCell(this.world, player, 5, 14);
        if (cell && this.mover.setGoal(...cell)) this.state = 'leaving';
        else this.state = 'vanish';
      }
      if (this.world.lightPool) this.world.lightPool.setDisturbance(p, 6);
    } else if (this.state === 'leaving') {
      const done = this.mover.step(dt, this.opts.speed || 1.9);
      const seen = inView(camera, p.x, p.y + 1.5, p.z) && this.world.grid.los(player.pos.x, player.pos.z, p.x, p.z);
      this.presence = seen ? 0.35 : 0.1;
      if (this.panner) {
        this.stepTimer -= dt;
        if (this.stepTimer <= 0) {
          this.stepTimer = 0.55;
          game.audio.thump(this.panner, 0.35);
        }
      }
      if (done || (!seen && this.mover.path && this.mover.path.length < 3)) this.state = 'vanish';
    } else if (this.state === 'vanish') {
      this.fade -= dt * 3;
      this.setOpacity(Math.max(0, this.fade));
      this.presence = 0;
      if (this.fade <= 0) {
        this.state = 'hidden';
        this.timer = this.world.rng.float(25, 70) / (1 + this.world.depth * 0.2 + unease);
        if (this.world.lightPool) this.world.lightPool.setDisturbance(null);
      }
    }

    // animation
    const moving = this.state === 'leaving';
    this.phase += dt * (moving ? 4.5 : 0.6);
    const u = this.object.userData;
    const swing = moving ? Math.sin(this.phase) * 0.5 : Math.sin(this.phase) * 0.04;
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
    u.armL.rotation.x = -swing * 0.5;
    u.armR.rotation.x = swing * 0.5;
    u.head.rotation.z = this.state === 'watching' ? Math.sin(this.phase * 0.7) * 0.25 : 0;
  }

  dispose() {
    this.panner?.disconnect();
  }
}

/**
 * A grin in the dark. It waits in unlit places and fades when light touches
 * it or you come close.
 */
export class Grin {
  constructor(world, opts = {}) {
    this.world = world;
    this.presence = 0;
    this.object = new THREE.Group();
    const faceMat = new THREE.MeshBasicMaterial({ map: smilerFace(), transparent: true, depthWrite: false, fog: false, opacity: 0 });
    faceMat.color.setRGB(1.6, 1.5, 1.4);
    this.face = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), faceMat);
    this.face.position.y = 1.6;
    this.object.add(this.face);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: 0xfff1d6, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    glow.scale.setScalar(2);
    glow.position.y = 1.6;
    this.object.add(glow);
    this.glow = glow;
    this.object.visible = false;
    this.state = 'hidden';
    this.timer = world.rng.float(20, 45) / (1 + world.depth * 0.25);
    this.alpha = 0;
    this.panner = null;
    this.opts = opts;
  }

  update(dt, ctx) {
    const { player, game, camera } = ctx;
    const p = this.object.position;
    if (!this.panner && game.audio.ready) this.panner = game.audio.panner(p.x, 1.6, p.z, { ref: 2.5, rolloff: 1.2 });
    if (this.panner) game.audio.setPannerPos(this.panner, p.x, p.y + 1.6, p.z);
    this.object.rotation.y = Math.atan2(camera.position.x - p.x, camera.position.z - p.z);
    if (ctx.attract) return;
    const dist = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);

    if (this.state === 'hidden') {
      this.timer -= dt;
      this.presence = 0;
      if (this.timer <= 0) {
        const cell = hiddenCell(this.world, player, 5, 10, { visible: true });
        const c = cell && this.world.grid.center(...cell);
        if (c && !inView(camera, c.x, 1.6, c.z, 1.1) && !ctx.game.nearLight(new THREE.Vector3(c.x, 0, c.z), 4)) {
          p.set(c.x, this.world.floorAt(c.x, c.z), c.z);
          this.state = 'shown';
          this.object.visible = true;
          if (this.panner) game.audio.giggle(this.panner);
        } else this.timer = 3;
      }
    } else if (this.state === 'shown') {
      this.alpha = Math.min(1, this.alpha + dt * 0.8);
      const seen = inView(camera, p.x, p.y + 1.6, p.z) && this.world.grid.los(player.pos.x, player.pos.z, p.x, p.z);
      const lit = seen && player.flashlight && dist < 14 && inView(camera, p.x, p.y + 1.6, p.z, 0.3);
      this.presence = seen ? Math.max(0.35, 1 - dist / 14) : 0.2;
      if (lit || dist < 4) {
        this.state = 'fading';
        if (this.panner) game.audio.whisper(this.panner);
      }
    } else if (this.state === 'fading') {
      this.alpha -= dt * 1.5;
      this.presence = 0;
      if (this.alpha <= 0) {
        this.alpha = 0;
        this.state = 'hidden';
        this.object.visible = false;
        this.timer = this.world.rng.float(30, 80) / (1 + this.world.depth * 0.2);
      }
    }
    this.face.material.opacity = this.alpha;
    this.glow.material.opacity = this.alpha * 0.12;
  }

  dispose() {
    this.panner?.disconnect();
  }
}

/**
 * Footsteps that follow a little behind you and stop when you turn around.
 * Audio only; appears once unease is high.
 */
export class Follower {
  constructor(world) {
    this.world = world;
    this.presence = 0;
    this.timer = world.rng.float(10, 30);
    this.active = 0;
    this.stepT = 0;
    this.panner = null;
    this.lastYaw = 0;
  }

  update(dt, ctx) {
    const { player, game } = ctx;
    if (ctx.attract || !game.audio.ready) return;
    const unease = this.world.uneaseAt(player.pos.x, player.pos.z);
    if (unease < 0.6) return;
    if (!this.panner) this.panner = game.audio.panner(0, 0, 0, { ref: 2, rolloff: 1.4 });
    const bx = player.pos.x + Math.sin(player.yaw) * 4;
    const bz = player.pos.z + Math.cos(player.yaw) * 4;
    game.audio.setPannerPos(this.panner, bx, player.pos.y + 0.2, bz);
    const turning = Math.abs(player.yaw - this.lastYaw) > dt * 1.2;
    this.lastYaw = player.yaw;
    if (this.active > 0) {
      this.active -= dt;
      this.presence = 0.25;
      if (turning || player.speed < 0.5) this.active = 0;
      this.stepT -= dt;
      if (this.stepT <= 0 && this.active > 0) {
        this.stepT = player.running ? 0.36 : 0.52;
        game.audio.thump(this.panner, 0.18);
      }
    } else {
      this.presence = 0;
      this.timer -= dt;
      if (this.timer <= 0 && player.speed > 1) {
        this.active = this.world.rng.float(4, 9);
        this.timer = this.world.rng.float(30, 70) / unease;
      }
    }
  }

  dispose() {
    this.panner?.disconnect();
  }
}
