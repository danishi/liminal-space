import * as THREE from 'three';
import { glowSprite } from '../core/textures.js';
import { LOOKS, grinFace, robotVacuum } from './looks.js';
import { setFigureOpacity, updateProbe, idlePose, walkPose, lookAt, applyPose, beastPose, tailSway, POSES } from './figures.js';

// Apparitions: things you glimpse, never things that hurt you. They appear
// more often and closer as unease grows. Also a few stray things that are
// more silly than scary.

const _v = new THREE.Vector3();
const _f = new THREE.Vector3();
const _w = new THREE.Vector3();

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
export function hiddenCell(world, player, minCells, maxCells = 999, { visible = false, filter = null } = {}) {
  const g = world.grid;
  const [pi, pj] = g.cellOf(player.pos.x, player.pos.z);
  const d = g.distances(pi, pj);
  const cands = [];
  for (let j = 0; j < g.h; j++) {
    for (let i = 0; i < g.w; i++) {
      const k = d[j * g.w + i];
      if (k < minCells || k > maxCells || !g.standable(i, j)) continue;
      if (filter && !filter(i, j)) continue;
      const c = g.center(i, j);
      if (g.los(player.pos.x, player.pos.z, c.x, c.z) !== visible) continue;
      cands.push([i, j]);
    }
  }
  return cands.length ? world.rng.pick(cands) : null;
}

/** Is a world point inside the camera's view cone (ignores walls)? */
export function inView(camera, x, y, z, slack = 0.85) {
  _v.set(x - camera.position.x, y - camera.position.y, z - camera.position.z).normalize();
  camera.getWorldDirection(_f);
  const half = THREE.MathUtils.degToRad(camera.fov * 0.5) * Math.max(1, camera.aspect) * slack;
  return _f.dot(_v) > Math.cos(Math.min(1.3, half));
}

/** In view and not behind a wall. */
export function seen(ctx, world, x, y, z, slack = 0.85) {
  return inView(ctx.camera, x, y, z, slack) && world.grid.los(ctx.player.pos.x, ctx.player.pos.z, x, z);
}

const angleTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);

function turnToward(obj, yaw, rate) {
  const diff = Math.atan2(Math.sin(yaw - obj.rotation.y), Math.cos(yaw - obj.rotation.y));
  obj.rotation.y += diff * Math.min(1, rate);
}

/** Keeps a sculpted figure's light probe in step with the baked level light. */
class Probe {
  constructor() {
    this.t = Math.random() * 0.3;
  }

  update(dt, fig, world, pos) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.3;
    updateProbe(fig, world, pos);
  }
}

// ---------------------------------------------------------------------------

/**
 * The Watcher: a tall figure that appears at the edge of sight, stands still
 * and stares. Its head follows you further than a neck should turn. Approach
 * it and it walks away down a corridor, still looking back at you; wait too
 * long and it simply isn't there any more.
 *
 * With `ceiling`, it walks upside down along the ceiling instead, far off.
 */
export class Watcher {
  constructor(world, opts = {}) {
    this.world = world;
    this.presence = 0;
    this.opts = opts;
    this.ceiling = !!opts.ceiling;
    this.object = LOOKS.watcher({ ...(opts.look || {}), ...(this.ceiling ? { height: 2.0, key: 'ceil' } : {}) });
    this.fig = this.object;
    setFigureOpacity(this.fig, 0);
    this.mover = new GridMover(world, this.object, 0.3);
    this.state = 'hidden';
    this.timer = world.rng.float(18, 40) / (1 + world.depth * 0.25) + (this.ceiling ? 30 : 0);
    this.phase = 0;
    this.t = 0;
    this.stepTimer = 0;
    this.panner = null;
    this.watched = 0;
    this.fade = 0;
    this.twitch = 0;
    this.twitchT = 3;
    this.wave = 0;
    this.probe = new Probe();
  }

  place(c) {
    const p = this.object.position;
    p.set(c.x, this.ceiling ? this.ceilAt(c.x, c.z) : this.world.floorAt(c.x, c.z), c.z);
    this.object.rotation.set(0, 0, this.ceiling ? Math.PI : 0);
  }

  ceilAt(x, z) {
    const [i, j] = this.world.grid.cellOf(x, z);
    return this.world.ceilAt ? this.world.ceilAt(i, j) : (this.world.env.height || 2.7);
  }

  update(dt, ctx) {
    const { player, game, camera } = ctx;
    const p = this.object.position;
    this.t += dt;
    if (!this.panner && game.audio.ready) this.panner = game.audio.panner(p.x, 1.5, p.z, { ref: 3, rolloff: 1.3 });
    if (this.panner) game.audio.setPannerPos(this.panner, p.x, p.y + (this.ceiling ? -1 : 1.6), p.z);
    const unease = this.world.uneaseAt(player.pos.x, player.pos.z);
    const dist = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
    const eyeY = p.y + (this.ceiling ? -1.7 : 2.1);

    if (ctx.attract) {
      this.presence = 0;
      return;
    }

    if (this.state === 'hidden') {
      this.presence = 0;
      this.timer -= dt;
      if (this.timer <= 0) {
        // appear somewhere visible but out of frame, a fair distance away
        const near = this.ceiling ? 9 : Math.max(4, Math.round(9 - unease * 4));
        const cell = hiddenCell(this.world, player, near, near + 8, { visible: true, filter: (i, j) => !this.world.grid.ramp[j * this.world.grid.w + i] });
        const c = cell && this.world.grid.center(...cell);
        if (c && !inView(camera, c.x, 1.5, c.z, 1.1)) {
          this.place(c);
          this.watched = 0;
          this.fade = 0;
          this.wave = 0;
          this.object.rotation.y = angleTo(p, player.pos);
          if (this.ceiling) {
            // walk somewhere across the ceiling
            const far = hiddenCell(this.world, player, near + 4, near + 16, { visible: true });
            if (far && this.mover.setGoal(...far)) this.state = 'crawl';
            else this.timer = 4;
          } else this.state = 'watching';
        } else this.timer = 2;
      }
      return;
    }

    const rig = this.fig.userData.rig;
    this.probe.update(dt, this.fig, this.world, p);
    if (this.state === 'watching') {
      this.fade = Math.min(1, this.fade + dt * 2);
      setFigureOpacity(this.fig, this.fade);
      turnToward(this.object, angleTo(p, player.pos), dt * 0.6);
      const isSeen = seen(ctx, this.world, p.x, eyeY, p.z);
      if (isSeen) this.watched += dt;
      if (isSeen && this.watched < dt * 1.5) {
        game.audio.stinger();
        game.pulseStatic(0.25);
      }
      this.presence = isSeen ? Math.max(0.3, 1 - dist / 18) : 0.15;
      if (dist < 6 || this.watched > 6 + this.world.rng.float(0, 4)) {
        // walk away around a corner
        const cell = hiddenCell(this.world, player, 5, 14);
        if (cell && this.mover.setGoal(...cell)) this.state = 'leaving';
        else this.state = 'vanish';
      }
      if (this.world.lightPool) this.world.lightPool.setDisturbance(p, 6);
      // animation: breathing, the head locked on you, the occasional wrong tilt
      idlePose(rig, this.t, { sway: 0.6 });
      rig.rot('foreL', -0.05, 0, 0);
      rig.rot('foreR', -0.05, 0, 0);
      this.twitchT -= dt;
      if (this.twitchT <= 0) {
        this.twitchT = this.world.rng.float(1.5, 4);
        this.twitch = this.world.rng.chance(0.5) ? this.world.rng.pick([-1, 1]) : 0;
      }
      if (this.watched > 2.5 && unease > 0.5 && !this.wave && this.world.rng.chance(dt * 0.3)) this.wave = 0.001;
      if (this.wave) this.wave = Math.min(1, this.wave + dt * 0.35);
      if (this.wave) {
        // a slow, polite wave. Somehow worse.
        rig.rot('armR', -0.2 * this.wave, 0, -2.3 * this.wave);
        rig.rot('foreR', 0, 0, -0.6 * this.wave + Math.sin(this.t * 3) * 0.3 * this.wave);
      }
      _w.set(camera.position.x, camera.position.y, camera.position.z);
      lookAt(this.fig, _w, { max: 1.3, over: 1.8, pitch: 0.7 });
      const r = rig.bones.head;
      r.rotation.z += this.twitch * 0.7;
    } else if (this.state === 'leaving' || this.state === 'crawl') {
      if (this.state === 'crawl') {
        this.fade = Math.min(1, this.fade + dt);
        setFigureOpacity(this.fig, this.fade);
      }
      const done = this.mover.step(dt, this.state === 'crawl' ? 1.0 : this.opts.speed || 1.9);
      if (this.ceiling) {
        p.y = this.ceilAt(p.x, p.z);
        this.object.rotation.z = Math.PI;
      }
      const isSeen = seen(ctx, this.world, p.x, eyeY, p.z);
      this.presence = isSeen ? (this.ceiling ? 0.5 : 0.35) : 0.1;
      if (this.panner) {
        this.stepTimer -= dt;
        if (this.stepTimer <= 0) {
          this.stepTimer = this.ceiling ? 0.8 : 0.55;
          game.audio.thump(this.panner, this.ceiling ? 0.2 : 0.35);
        }
      }
      this.phase += dt * (this.ceiling ? 3.2 : 4.2);
      walkPose(rig, this.phase, 1, { stride: 0.55, arms: 0.12, stiff: 0.25, bounce: 0.03 });
      // it keeps looking back at you as it goes
      _w.set(camera.position.x, camera.position.y, camera.position.z);
      if (!this.ceiling) lookAt(this.fig, _w, { max: 1.3, over: 2.2 });
      if (this.state === 'crawl' && dist < 7) this.state = 'vanish';
      if (done || (!isSeen && this.mover.path && this.mover.path.length < 3)) this.state = 'vanish';
    } else if (this.state === 'vanish') {
      this.fade -= dt * 3;
      setFigureOpacity(this.fig, Math.max(0, this.fade));
      this.presence = 0;
      if (this.fade <= 0) {
        this.state = 'hidden';
        this.timer = this.world.rng.float(25, 70) / (1 + this.world.depth * 0.2 + unease) + (this.ceiling ? 20 : 0);
        if (this.world.lightPool) this.world.lightPool.setDisturbance(null);
      }
    }
  }

  dispose() {
    this.panner?.disconnect();
  }
}

// ---------------------------------------------------------------------------

const FUNNY = ['peace', 'dab', 'thinker', 'shrug', 'selfie', 'flex', 'runway', 'wave', 'watch', 'hug', 'tpose'];
const CREEPY = ['point', 'reach', 'wrong', 'stand', 'kneel', 'point', 'reach'];

/**
 * A shop mannequin. It only moves while nobody is looking: each time you
 * look back it is a little closer and posing differently. Low unease makes
 * it silly (it dabs), high unease makes it reach for you. If it ever gets
 * right behind you and you turn round, it falls to pieces.
 */
export class Mannequin {
  constructor(world, { pos, yaw = 0, variant = 0, mode = 'mixed', moves = true, pose = null } = {}) {
    this.world = world;
    this.object = LOOKS.mannequin(variant);
    this.fig = this.object;
    this.object.position.copy(pos);
    this.object.rotation.y = yaw;
    this.pos = this.object.position;
    this.mode = mode;
    this.moves = moves;
    this.presence = 0;
    this.unseen = 0;
    this.wait = world.rng.float(1.5, 4);
    this.moved = false;
    this.broken = false;
    this.aimHeight = 1.1;
    this.interactRange = 2.2;
    this.panner = null;
    this.probe = new Probe();
    applyPose(this.fig.userData.rig, pose || world.rng.pick(mode === 'creepy' ? CREEPY : FUNNY));
    world.addCircle(this.object, 0.28);
    this.probeT = 0;
  }

  get prompt() {
    return this.broken ? 'Tidy up the mannequin' : 'Poke the mannequin';
  }

  pickPose(unease) {
    const creepy = this.mode === 'creepy' || (this.mode === 'mixed' && this.world.rng.chance(Math.min(0.85, unease * 0.7)));
    return this.world.rng.pick(creepy ? CREEPY : FUNNY);
  }

  interact(game) {
    game.audio.clack(this.panner, 0.9 + Math.random() * 0.3);
    if (this.broken) {
      this.broken = false;
      applyPose(this.fig.userData.rig, 'stand');
      game.toast('You stand it back up', 'It is lighter than it should be');
      return;
    }
    // it changes pose while you watch, which is somehow the worst part
    applyPose(this.fig.userData.rig, this.world.rng.pick(FUNNY));
  }

  update(dt, ctx) {
    this.probe.update(dt, this.fig, this.world, this.pos);
    if (ctx.attract) return;
    const { player, game } = ctx;
    const p = this.pos;
    if (!this.panner && game.audio.ready) this.panner = game.audio.panner(p.x, 1.2, p.z, { ref: 2, rolloff: 1.3 });
    if (this.panner) game.audio.setPannerPos(this.panner, p.x, p.y + 1.2, p.z);
    const dist = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
    const isSeen = seen(ctx, this.world, p.x, p.y + 1.2, p.z, 1.0);
    const unease = this.world.uneaseAt(p.x, p.z);
    this.presence = 0;
    if (isSeen) {
      this.unseen = 0;
      if (this.moved) {
        this.moved = false;
        if (dist < 1.6 && !this.broken) {
          // right behind you: it comes apart
          this.broken = true;
          applyPose(this.fig.userData.rig, 'collapse');
          game.audio.clack(this.panner, 0.7);
          setTimeout(() => game.audio.clack(this.panner, 1.1), 120);
          setTimeout(() => game.audio.clack(this.panner, 0.8), 260);
          game.pulseStatic(0.5);
          this.presence = 0.9;
        } else if (dist < 7 && unease > 0.5) {
          this.presence = 0.5;
          game.pulseStatic(0.12);
        }
      }
      return;
    }
    this.unseen += dt;
    if (this.broken || this.unseen < this.wait || dist > 26 || dist < 1.2) return;
    this.unseen = 0;
    this.wait = this.world.rng.float(2, 6) / (1 + unease);
    if (!this.moves) {
      // shop-window mannequins stay put, but they don't stay still
      applyPose(this.fig.userData.rig, this.pickPose(unease));
      this.object.rotation.y += this.world.rng.float(-0.6, 0.6);
      this.moved = dist < 12;
      return;
    }
    // step toward you along the floor, but never into your view
    const g = this.world.grid;
    const [ci, cj] = g.cellOf(p.x, p.z);
    const [pi, pj] = g.cellOf(player.pos.x, player.pos.z);
    const path = g.path(ci, cj, pi, pj, 3000);
    if (!path || path.length < 2) return;
    const n = Math.min(path.length - 1, 1 + Math.floor(this.world.rng.float(0, 2 + unease * 2)));
    const [ti, tj] = path[Math.max(0, n - 1)];
    const c = g.center(ti, tj);
    const tx = c.x + this.world.rng.float(-0.3, 0.3);
    const tz = c.z + this.world.rng.float(-0.3, 0.3);
    if (inView(ctx.camera, tx, p.y + 1.2, tz, 1.15) && g.los(player.pos.x, player.pos.z, tx, tz)) return;
    if (Math.hypot(player.pos.x - tx, player.pos.z - tz) < 0.9) return;
    p.set(tx, this.world.floorAt(tx, tz), tz);
    this.object.rotation.y = angleTo(p, player.pos) + this.world.rng.float(-0.3, 0.3);
    applyPose(this.fig.userData.rig, this.pickPose(unease));
    this.moved = true;
  }

  dispose() {
    this.panner?.disconnect();
  }
}

// ---------------------------------------------------------------------------

/**
 * Something peeking round a corner: only a head and a hand show past the
 * wall. It ducks back the moment you look straight at it.
 */
export class Peeker {
  constructor(world, opts = {}) {
    this.world = world;
    this.opts = opts;
    this.object = opts.figure ? opts.figure() : LOOKS.watcher({ ...(opts.look || {}), height: 1.9, key: 'peek' });
    this.fig = this.object;
    setFigureOpacity(this.fig, 0);
    this.presence = 0;
    this.state = 'hidden';
    this.timer = world.rng.float(25, 50) / (1 + world.depth * 0.3);
    this.lean = 0;
    this.side = 1;
    this.fade = 0;
    this.watched = 0;
    this.panner = null;
    this.probe = new Probe();
  }

  /** Finds a spot just behind a corner, with the head clear of it. */
  findSpot(player) {
    const g = this.world.grid;
    const cs = g.cs;
    const [pi, pj] = g.cellOf(player.pos.x, player.pos.z);
    const d = g.distances(pi, pj);
    const cands = [];
    for (let j = 1; j < g.h - 1; j++) {
      for (let i = 1; i < g.w - 1; i++) {
        const k = d[j * g.w + i];
        if (k < 2 || k > 6 || !g.standable(i, j) || g.ramp[j * g.w + i]) continue;
        const c = g.center(i, j);
        if (g.los(player.pos.x, player.pos.z, c.x, c.z)) continue;
        cands.push([i, j]);
      }
    }
    this.world.rng.shuffle(cands);
    for (const [i, j] of cands.slice(0, 80)) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!g.standable(i + dx, j + dy) || Math.abs(g.heightOf(i + dx, j + dy) - g.heightOf(i, j)) > 0.3) continue;
        // stand just inside the hidden cell, next to the open one
        const c = g.center(i, j);
        const bx = c.x + dx * (cs / 2 - 0.3);
        const bz = c.z + dy * (cs / 2 - 0.3);
        if (g.los(player.pos.x, player.pos.z, bx, bz)) continue;
        const yaw = Math.atan2(player.pos.x - bx, player.pos.z - bz);
        const rx = Math.cos(yaw);
        const rz = -Math.sin(yaw);
        const dot = rx * dx + rz * dy;
        if (Math.abs(dot) < 0.35) continue;
        const side = Math.sign(dot);
        const hx = bx + rx * side * 0.8;
        const hz = bz + rz * side * 0.8;
        if (!g.walkable(...g.cellOf(hx, hz)) || !g.los(player.pos.x, player.pos.z, hx, hz)) continue;
        return { c: { x: bx, z: bz }, yaw, side };
      }
    }
    return null;
  }

  update(dt, ctx) {
    const { player, game, camera } = ctx;
    const p = this.object.position;
    if (!this.panner && game.audio.ready) this.panner = game.audio.panner(p.x, 1.5, p.z, { ref: 2, rolloff: 1.3 });
    if (this.panner) game.audio.setPannerPos(this.panner, p.x, 1.5, p.z);
    if (ctx.attract) return;
    const rig = this.fig.userData.rig;
    if (this.state === 'hidden') {
      this.presence = 0;
      this.timer -= dt;
      if (this.timer > 0) return;
      const spot = this.findSpot(player);
      if (!spot) {
        this.timer = 4;
        return;
      }
      p.set(spot.c.x, this.world.floorAt(spot.c.x, spot.c.z), spot.c.z);
      this.object.rotation.set(0, spot.yaw, 0);
      this.side = spot.side;
      this.state = 'peek';
      this.lean = 0;
      this.fade = 0;
      this.watched = 0;
      return;
    }
    this.probe.update(dt, this.fig, this.world, p);
    const head = rig.bones.head.getWorldPosition(_w);
    const isSeen = inView(camera, head.x, head.y, head.z, 0.45) && this.world.grid.los(player.pos.x, player.pos.z, head.x, head.z);
    if (this.state === 'peek') {
      this.fade = Math.min(1, this.fade + dt * 1.5);
      setFigureOpacity(this.fig, this.fade);
      this.lean = Math.min(1, this.lean + dt * 0.5);
      if (isSeen) this.watched += dt;
      this.presence = isSeen ? 0.55 : 0.05;
      if (this.watched > 0.5 || Math.hypot(player.pos.x - p.x, player.pos.z - p.z) < 2.5) {
        this.state = 'duck';
        game.audio.whisper(this.panner);
        game.pulseStatic(0.2);
      }
    } else if (this.state === 'duck') {
      this.lean -= dt * 5;
      this.presence = 0;
      if (this.lean <= 0) {
        setFigureOpacity(this.fig, 0);
        this.state = 'hidden';
        this.timer = this.world.rng.float(30, 80) / (1 + this.world.depth * 0.2);
      }
    }
    // lean the whole body round the corner; one hand grips the edge
    const l = Math.max(0, this.lean);
    rig.reset();
    rig.rot('spine', 0, 0, -this.side * 0.35 * l);
    rig.rot('chest', 0, 0, -this.side * 0.35 * l);
    rig.rot('neck', 0, 0, -this.side * 0.4 * l);
    rig.rot('head', 0.1, 0, this.side * 0.9 * l);
    const arm = this.side > 0 ? 'armL' : 'armR';
    rig.rot(arm, -0.6 * l, 0, this.side * 1.2 * l);
    rig.rot(this.side > 0 ? 'foreL' : 'foreR', -1.2 * l, 0, 0);
  }

  dispose() {
    this.panner?.disconnect();
  }
}

// ---------------------------------------------------------------------------

/**
 * A grin in the dark. It waits in unlit places and fades when light touches
 * it or you come close. Lit up, it shakes its head very fast before it goes.
 */
export class Grin {
  constructor(world, opts = {}) {
    this.world = world;
    this.presence = 0;
    this.object = new THREE.Group();
    this.face = grinFace();
    this.face.position.y = 1.55;
    this.object.add(this.face);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: 0xfff1d6, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    glow.scale.setScalar(1.6);
    glow.position.y = 1.55;
    this.object.add(glow);
    this.glow = glow;
    this.object.visible = false;
    this.state = 'hidden';
    this.timer = world.rng.float(20, 45) / (1 + world.depth * 0.25);
    this.alpha = 0;
    this.shake = 0;
    this.t = 0;
    this.panner = null;
    this.opts = opts;
  }

  setAlpha(a) {
    const u = this.face.userData;
    u.mat.opacity = a;
    for (const e of u.eyes) {
      e.material.transparent = true;
      e.material.opacity = a;
    }
    this.glow.material.opacity = a * 0.1;
    this.object.visible = a > 0.01;
  }

  update(dt, ctx) {
    const { player, game, camera } = ctx;
    const p = this.object.position;
    this.t += dt;
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
          this.shake = 0;
          this.object.visible = true;
          if (this.panner) game.audio.giggle(this.panner);
        } else this.timer = 3;
      }
    } else if (this.state === 'shown') {
      this.alpha = Math.min(1, this.alpha + dt * 0.8);
      const isSeen = seen(ctx, this.world, p.x, p.y + 1.6, p.z);
      const lit = isSeen && player.flashlight && dist < 14 && inView(camera, p.x, p.y + 1.6, p.z, 0.3);
      this.presence = isSeen ? Math.max(0.35, 1 - dist / 14) : 0.2;
      // it drifts a little and tilts its head, interested
      this.face.rotation.z = Math.sin(this.t * 0.7) * 0.25;
      this.face.position.y = 1.55 + Math.sin(this.t * 0.9) * 0.04;
      if (lit || dist < 4) {
        this.state = 'shaking';
        this.shake = 0;
        if (this.panner) game.audio.whisper(this.panner);
      }
    } else if (this.state === 'shaking') {
      this.shake += dt;
      this.face.rotation.y = Math.sin(this.shake * 60) * 0.35 * Math.min(1, this.shake * 4);
      this.face.rotation.z = Math.sin(this.shake * 47) * 0.1;
      this.presence = 0.6;
      if (this.shake > 0.6) this.state = 'fading';
    } else if (this.state === 'fading') {
      this.alpha -= dt * 1.5;
      this.presence = 0;
      if (this.alpha <= 0) {
        this.alpha = 0;
        this.state = 'hidden';
        this.face.rotation.set(0, 0, 0);
        this.object.visible = false;
        this.timer = this.world.rng.float(30, 80) / (1 + this.world.depth * 0.2);
      }
    }
    this.setAlpha(this.alpha);
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

// ---------------------------------------------------------------------------

const CAT_LINES = [
  ['(It purrs.)'],
  ['Mrrp.'],
  ['(It looks at you as if you are the one who got lost.)'],
  ['(It allows this.)'],
  ['(It purrs. The lights hum along, in the same key.)'],
  ['(It has a collar. The tag says: “RETURN TO LEVEL 0”.)'],
  ['(It blinks slowly at you. That means something, in cat.)'],
];

/**
 * A cat. It turns up wherever you're about to be, and sometimes where no
 * cat could be (the ceiling, once you've drifted far enough).
 */
export class StrayCat {
  constructor(world) {
    this.world = world;
    this.object = LOOKS.cat();
    this.fig = this.object;
    this.pos = this.object.position;
    this.object.visible = false;
    this.aimHeight = 0.25;
    this.interactRange = 2.2;
    this.enabled = false;
    this.unseen = 0;
    this.t = 0;
    this.pose = 'loaf';
    this.upside = false;
    this.panner = null;
    this.timer = world.rng.float(8, 25);
    this.petted = 0;
    this.probe = new Probe();
  }

  get prompt() {
    return 'Pet the cat';
  }

  interact(game) {
    game.audio.purr(this.panner, 2.5);
    const lines = CAT_LINES[this.petted++ % CAT_LINES.length];
    game.openDialog('the cat', lines, 1.6);
    this.unseen = -3;
  }

  appear(player, camera) {
    const g = this.world.grid;
    // ahead of you, just out of frame, where you're about to look
    const cell = hiddenCell(this.world, player, 3, 9, { visible: true, filter: (i, j) => !g.ramp[j * g.w + i] && g.countSolidNeighbors(i, j) >= 1 });
    if (!cell) return false;
    const c = g.center(...cell);
    if (inView(camera, c.x, 0.3, c.z, 1.05)) return false;
    const unease = this.world.uneaseAt(c.x, c.z);
    this.upside = unease > 0.75 && this.world.rng.chance(0.35);
    const y = this.upside ? (this.world.ceilAt ? this.world.ceilAt(...cell) : 2.7) : this.world.floorAt(c.x, c.z);
    this.pos.set(c.x + this.world.rng.float(-0.4, 0.4), y, c.z + this.world.rng.float(-0.4, 0.4));
    this.object.rotation.set(0, angleTo(this.pos, player.pos), this.upside ? Math.PI : 0);
    this.pose = this.world.rng.pick(['loaf', 'sit', 'sit']);
    beastPose(this.fig, this.pose);
    this.object.visible = true;
    this.enabled = !this.upside;
    return true;
  }

  update(dt, ctx) {
    this.t += dt;
    if (ctx.attract) return;
    const { player, game, camera } = ctx;
    const p = this.pos;
    if (!this.panner && game.audio.ready) this.panner = game.audio.panner(p.x, 0.3, p.z, { ref: 1.5, rolloff: 1.4 });
    if (this.panner) game.audio.setPannerPos(this.panner, p.x, p.y + 0.3, p.z);
    if (!this.object.visible) {
      this.timer -= dt;
      if (this.timer <= 0 && !this.appear(player, camera)) this.timer = 2;
      return;
    }
    this.probe.update(dt, this.fig, this.world, p);
    const rig = this.fig.userData.rig;
    const dist = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
    const isSeen = seen(ctx, this.world, p.x, p.y + 0.3, p.z, 1);
    // it watches you with its whole head
    beastPose(this.fig, this.pose);
    tailSway(rig, this.t, this.pose === 'sit' ? 0.25 : 0.1, 1.2);
    const yaw = Math.atan2(player.pos.x - p.x, player.pos.z - p.z) - this.object.rotation.y;
    const rel = Math.atan2(Math.sin(yaw), Math.cos(yaw)) * (this.upside ? -1 : 1);
    rig.rot('head', this.pose === 'sit' ? 0.55 : 0, Math.max(-1.2, Math.min(1.2, rel)), 0);
    if (isSeen) {
      if (this.unseen > 6 && this.world.rng.chance(0.4)) game.audio.meow(this.panner, 0.9 + Math.random() * 0.3);
      this.unseen = Math.min(0, this.unseen);
    } else this.unseen += dt;
    // wander off when ignored, or when you walk right past
    if (this.unseen > 5 || (!isSeen && dist > 16)) {
      this.object.visible = false;
      this.enabled = false;
      this.unseen = 0;
      this.timer = this.world.rng.float(10, 30);
    }
  }

  dispose() {
    this.panner?.disconnect();
  }
}

const VACUUM_LINES = [
  ['(A robot vacuum. It bumps into your foot, considers this, and turns around.)'],
  ['(It has been cleaning this room since 1998. The carpet is not getting any cleaner.)'],
  ['(Beep.)', '(It seems pleased to see you.)'],
];

/**
 * A robot vacuum on its endless rounds. It follows walls, bumps into things,
 * and at high unease it starts following you instead.
 */
export class RobotVacuum {
  constructor(world, pos) {
    this.world = world;
    this.object = robotVacuum();
    this.object.position.copy(pos);
    this.pos = this.object.position;
    this.heading = world.rng.float(0, Math.PI * 2);
    this.turn = 0;
    this.aimHeight = 0.05;
    this.interactRange = 1.8;
    this.talks = 0;
    this.panner = null;
    this.blink = 0;
    this.home = pos.clone();
  }

  get prompt() {
    return 'Look at the robot vacuum';
  }

  interact(game) {
    game.audio.beep(this.panner, 1, 3);
    game.openDialog('the robot vacuum', VACUUM_LINES[this.talks++ % VACUUM_LINES.length], 2.2);
  }

  update(dt, ctx) {
    const { game, player } = ctx;
    const p = this.pos;
    if (!this.panner && game.audio.ready) this.panner = game.audio.panner(p.x, 0.1, p.z, { ref: 1.5, rolloff: 1.5 });
    if (this.panner) game.audio.setPannerPos(this.panner, p.x, p.y + 0.1, p.z);
    this.blink += dt;
    this.object.userData.led.visible = Math.sin(this.blink * 4) > 0;
    const unease = this.world.uneaseAt(p.x, p.z);
    const follow = !ctx.attract && unease > 0.9 && Math.hypot(player.pos.x - p.x, player.pos.z - p.z) < 12;
    if (this.turn > 0) {
      this.turn -= dt;
      this.heading += dt * 2.4;
    } else if (follow) {
      const want = Math.atan2(player.pos.x - p.x, player.pos.z - p.z);
      this.heading += Math.atan2(Math.sin(want - this.heading), Math.cos(want - this.heading)) * Math.min(1, dt * 2);
    }
    const speed = Math.hypot(player.pos.x - p.x, player.pos.z - p.z) < 1.2 && follow ? 0 : 0.3;
    const nx = p.x + Math.sin(this.heading) * speed * dt;
    const nz = p.z + Math.cos(this.heading) * speed * dt;
    _v.set(nx, 0, nz);
    this.world.collide(_v, 0.18, p.y);
    const blocked = Math.hypot(_v.x - nx, _v.z - nz) > 1e-4 || Math.abs(this.world.floorAt(_v.x, _v.z) - p.y) > 0.05;
    if (blocked && this.turn <= 0) {
      this.turn = this.world.rng.float(0.4, 1.4);
      if (!ctx.attract && game.audio.ready && Math.random() < 0.5) game.audio.clack(this.panner, 0.5);
    } else if (!blocked) {
      p.x = _v.x;
      p.z = _v.z;
    }
    this.object.rotation.y = this.heading;
  }

  dispose() {
    this.panner?.disconnect();
  }
}

export { POSES };
