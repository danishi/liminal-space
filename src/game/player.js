import * as THREE from 'three';

const WALK = 2.9;
const RUN = 5.1;

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
    this.yaw = yaw;
    this.pitch = 0;
    this.stamina = 100;
    this.exhausted = false;
    this.staminaDelay = 0;
    this.sanity = 100;
    this.battery = 100;
    this.flashlight = false;
    this.stepDist = 0;
    this.bob = 0;
    this.roll = 0;
    this.running = false;
    this.noise = 0;
    this.speed = 0;
    this.lookKick = 0;
  }

  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  /**
   * world: { collide(pos, r), floorAt(x,z), speedAt(x,z), surfaceAt(x,z) }
   * Returns a step surface string when a footstep lands this frame.
   */
  update(dt, input, world, settings, frozen = false) {
    const look = input.consumeLook();
    if (!frozen) {
      const k = 0.0021 * settings.sensitivity;
      this.yaw -= look.x * k;
      this.pitch -= look.y * k * (settings.invertY ? -1 : 1);
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    }

    const mv = frozen ? { x: 0, y: 0 } : input.move();
    const moving = Math.hypot(mv.x, mv.y) > 0.1;
    const wantRun = input.down('run') && moving && mv.y > -0.2;

    // stamina
    if (wantRun && !this.exhausted) {
      this.stamina = Math.max(0, this.stamina - 20 * dt);
      this.staminaDelay = 0.9;
      if (this.stamina <= 0) this.exhausted = true;
    } else {
      this.staminaDelay -= dt;
      if (this.staminaDelay <= 0) this.stamina = Math.min(100, this.stamina + (moving ? 11 : 17) * dt);
      if (this.exhausted && this.stamina > 35) this.exhausted = false;
    }
    this.running = wantRun && !this.exhausted;

    const surfMul = world.speedAt(this.pos.x, this.pos.z);
    const top = (this.running ? RUN : WALK) * surfMul * (this.exhausted ? 0.8 : 1);
    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);
    // forward = (-sin, -cos), right = (cos, -sin)
    const tx = (-sy * mv.y + cy * mv.x) * top;
    const tz = (-cy * mv.y - sy * mv.x) * top;
    const a = 1 - Math.exp(-dt * (moving ? 10 : 12));
    this.vel.x += (tx - this.vel.x) * a;
    this.vel.y += (tz - this.vel.y) * a;

    const ox = this.pos.x;
    const oz = this.pos.z;
    // sub-step so fast movement never tunnels through thin geometry
    const steps = Math.max(1, Math.ceil((Math.hypot(this.vel.x, this.vel.y) * dt) / 0.15));
    for (let s = 0; s < steps; s++) {
      this.pos.x += (this.vel.x * dt) / steps;
      this.pos.z += (this.vel.y * dt) / steps;
      world.collide(this.pos, this.radius);
    }
    const moved = Math.hypot(this.pos.x - ox, this.pos.z - oz);
    this.speed = moved / Math.max(dt, 1e-4);

    const fy = world.floorAt(this.pos.x, this.pos.z);
    this.pos.y += (fy - this.pos.y) * Math.min(1, dt * 8);

    // footsteps & bob
    let step = null;
    const stride = this.running ? 1.0 : 0.72;
    this.stepDist += moved;
    if (this.stepDist >= stride) {
      this.stepDist -= stride;
      step = world.surfaceAt(this.pos.x, this.pos.z);
    }
    const phase = (this.stepDist / stride) * Math.PI;
    const amp = settings.headBob ? Math.min(1, this.speed / RUN) * (this.running ? 0.07 : 0.045) : 0;
    this.bob += (Math.abs(Math.sin(phase)) * amp - this.bob) * Math.min(1, dt * 12);
    const targetRoll = settings.headBob ? -mv.x * 0.012 : 0;
    this.roll += (targetRoll - this.roll) * Math.min(1, dt * 6);

    // how much noise we make (creatures listen for this)
    this.noise = moving ? (this.running ? 1 : 0.3) : 0;

    this.lookKick *= Math.exp(-dt * 6);
    const cam = this.camera;
    cam.position.set(this.pos.x, this.pos.y + this.eye + this.bob - 0.02, this.pos.z);
    cam.rotation.set(this.pitch + this.lookKick, this.yaw, this.roll);
    return step;
  }
}
