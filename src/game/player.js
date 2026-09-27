import * as THREE from 'three';

const WALK = 2.7;
const RUN = 4.8;
const TURN = 2.3; // rad/s for keyboard turning
const GRAVITY = 16;

function wrap(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

export class Player {
  constructor(camera) {
    this.camera = camera;
    camera.rotation.order = 'YXZ';
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector2();
    this.radius = 0.3;
    this.eye = 1.62;
    this.reset({ x: 0, z: 0, yaw: 0 });
  }

  reset({ x, z, yaw = 0, y = 0 }) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0);
    this.vy = 0;
    this.grounded = true;
    this.yaw = yaw;
    this.pitch = 0;
    this.turnVel = 0;
    this.flashlight = false;
    this.stepDist = 0;
    this.bob = 0;
    this.roll = 0;
    this.running = false;
    this.noise = 0;
    this.speed = 0;
    this.eyeY = y + this.eye;
    this.t = Math.random() * 100;
    this.fallTime = 0;
  }

  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  /**
   * Picks a heading that follows the open space ahead, so walking with only
   * the forward key rounds corners on its own.
   */
  steerTarget(grid) {
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const ahead = grid.probe(this.pos.x, this.pos.z, fx, fz, 7);
    let best = null;
    let bestScore = -Infinity;
    for (let deg = -80; deg <= 80; deg += 10) {
      const a = this.yaw + THREE.MathUtils.degToRad(deg);
      const d = grid.probe(this.pos.x, this.pos.z, -Math.sin(a), -Math.cos(a), 7);
      const score = d - Math.abs(deg) * 0.035;
      if (score > bestScore) {
        bestScore = score;
        best = a;
      }
    }
    if (bestScore < 1.2) return null; // dead end: leave turning around to the player
    if (ahead >= 5.5) {
      // open ahead: settle onto the nearest corridor axis if we're close to it
      const axis = Math.round(this.yaw / (Math.PI / 2)) * (Math.PI / 2);
      const off = wrap(axis - this.yaw);
      const side1 = grid.probe(this.pos.x, this.pos.z, Math.cos(this.yaw), -Math.sin(this.yaw), 3);
      const side2 = grid.probe(this.pos.x, this.pos.z, -Math.cos(this.yaw), Math.sin(this.yaw), 3);
      const corridor = side1 < 2.6 || side2 < 2.6;
      return corridor && Math.abs(off) < 0.35 ? axis : null;
    }
    return best;
  }

  /**
   * world: { collide(pos, r, feetY), floorAt(x,z), speedAt(x,z), surfaceAt(x,z), grid }
   * Returns { step, fell }.
   */
  update(dt, input, world, settings, frozen = false) {
    this.t += dt;
    const look = input.consumeLook();
    const turn = frozen ? 0 : input.turn();
    if (!frozen) {
      const k = 0.0021 * settings.sensitivity;
      this.yaw -= look.x * k;
      this.pitch -= look.y * k * (settings.invertY ? -1 : 1);
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    }
    // keyboard turning with a little acceleration for smoothness
    this.turnVel += (turn * TURN - this.turnVel) * Math.min(1, dt * 10);
    this.yaw -= this.turnVel * dt;

    const mv = frozen ? { x: 0, y: 0 } : input.move();
    const moving = Math.hypot(mv.x, mv.y) > 0.1;

    // steering assist & auto-level (only when not looking around by hand)
    const assist = settings.steer ?? 0.5;
    const idle = input.idleLook();
    if (assist > 0 && !frozen && idle > 0.9 && Math.abs(turn) < 0.01 && this.grounded) {
      if (moving && mv.y > 0.3) {
        const target = this.steerTarget(world.grid);
        if (target !== null) {
          const diff = wrap(target - this.yaw);
          const rate = (0.6 + assist * 1.6) * dt;
          this.yaw += Math.max(-rate, Math.min(rate, diff * Math.min(1, dt * (1 + assist * 3))));
        }
      }
      if (idle > 1.4) this.pitch += (-0.04 - this.pitch) * Math.min(1, dt * (0.6 + assist * 1.6));
    }

    this.running = input.down('run') && moving && mv.y > -0.2;
    const surfMul = world.speedAt(this.pos.x, this.pos.z);
    const top = (this.running ? RUN : WALK) * surfMul * (this.grounded ? 1 : 0.6);
    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);
    const tx = (-sy * mv.y + cy * mv.x) * top;
    const tz = (-cy * mv.y - sy * mv.x) * top;
    const a = 1 - Math.exp(-dt * (moving ? 10 : 12));
    this.vel.x += (tx - this.vel.x) * a;
    this.vel.y += (tz - this.vel.y) * a;

    const ox = this.pos.x;
    const oz = this.pos.z;
    const steps = Math.max(1, Math.ceil((Math.hypot(this.vel.x, this.vel.y) * dt) / 0.12));
    for (let s = 0; s < steps; s++) {
      this.pos.x += (this.vel.x * dt) / steps;
      this.pos.z += (this.vel.y * dt) / steps;
      world.collide(this.pos, this.radius, this.pos.y);
    }
    const moved = Math.hypot(this.pos.x - ox, this.pos.z - oz);
    this.speed = moved / Math.max(dt, 1e-4);

    // vertical: step up small ledges, glide down stairs, fall off edges
    const floor = world.floorAt(this.pos.x, this.pos.z);
    let fell = false;
    if (this.grounded && floor >= this.pos.y - 0.4) {
      this.pos.y = floor;
      this.vy = 0;
    } else {
      this.grounded = false;
      this.vy -= GRAVITY * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= floor) {
        this.pos.y = floor;
        if (this.vy < -7) this.lookKickLand = Math.min(0.12, -this.vy * 0.01);
        this.vy = 0;
        this.grounded = true;
      }
      if (this.pos.y < -6) fell = true;
    }
    this.fallTime = this.grounded ? 0 : this.fallTime + dt;

    // footsteps & bob
    let step = null;
    const stride = this.running ? 1.0 : 0.72;
    if (this.grounded) this.stepDist += moved;
    if (this.stepDist >= stride) {
      this.stepDist -= stride;
      step = world.surfaceAt(this.pos.x, this.pos.z);
    }
    const phase = (this.stepDist / stride) * Math.PI;
    const amp = settings.headBob ? Math.min(1, this.speed / RUN) * (this.running ? 0.06 : 0.035) : 0;
    this.bob += (Math.abs(Math.sin(phase)) * amp - this.bob) * Math.min(1, dt * 12);
    const targetRoll = settings.headBob ? -mv.x * 0.01 + this.turnVel * 0.012 : 0;
    this.roll += (targetRoll - this.roll) * Math.min(1, dt * 6);
    this.noise = moving ? (this.running ? 1 : 0.3) : 0;

    // eye height eases after steps so stairs feel smooth
    const eyeTarget = this.pos.y + this.eye;
    if (this.grounded) this.eyeY += (eyeTarget - this.eyeY) * Math.min(1, dt * 14);
    else this.eyeY = eyeTarget;

    // subtle handheld sway (a camcorder held at chest height)
    const hh = settings.headBob ? 1 : 0;
    const swayX = (Math.sin(this.t * 0.9) * 0.6 + Math.sin(this.t * 2.3) * 0.25) * 0.004 * hh;
    const swayY = (Math.sin(this.t * 0.7 + 1) * 0.6 + Math.sin(this.t * 1.9) * 0.3) * 0.004 * hh;
    this.lookKickLand = (this.lookKickLand || 0) * Math.exp(-dt * 6);

    const cam = this.camera;
    cam.position.set(this.pos.x, this.eyeY + this.bob - 0.02 - (this.lookKickLand || 0), this.pos.z);
    cam.rotation.set(this.pitch + swayY - (this.lookKickLand || 0), this.yaw + swayX, this.roll);
    return { step, fell };
  }
}
