import * as THREE from 'three';
import { DIRS } from '../../core/grid.js';
import { glowSprite } from '../../core/textures.js';
import { seen } from '../../entities/creatures.js';
import { carModel } from '../../entities/looks.js';
import { updateProbe } from '../../entities/figures.js';
import { PI } from './constants.js';
import { flatGeo } from './geometry.js';
import { lightRig } from './cars.js';

/**
 * Headlight beam through dusty air: bright at the lamp, fading along the
 * cone, and soft at the silhouette (so it reads as haze from any angle).
 */
function beamMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0, 0, 0) } },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vP;
      varying float vAlong;
      void main() {
        vAlong = uv.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vP = mv.xyz;
        vN = normalMatrix * normal;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying vec3 vN;
      varying vec3 vP;
      varying float vAlong;
      void main() {
        float facing = abs(dot(normalize(vN), normalize(-vP)));
        float a = pow(vAlong, 1.8) * pow(facing, 1.6) * exp(-length(vP) * 0.035);
        gl_FragColor = vec4(uColor * a, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

// ---------------------------------------------------------------------------
// The driverless car. It creeps along the lanes toward you while you aren't
// looking, stops the moment you look, and never comes closer than a car length.

export class Creeper {
  constructor(world, drive, wp) {
    this.world = world;
    this.drive = drive;
    this.wp = wp;
    this.presence = 0;
    const car = carModel('sedan', 0x22252a);
    car.children[0].userData.noBake = true;
    this.car = car;
    this.rig = lightRig(car, car.userData.size);
    this.object = new THREE.Group();
    this.object.rotation.order = 'YXZ';
    this.object.add(car);
    // headlight beams: additive cones through the fog, and pools on the floor
    this.beamMat = beamMaterial();
    const [cw, cl] = car.userData.size;
    for (const sx of [-1, 1]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.5, 9, 20, 1, true).rotateX(-PI / 2).translate(0, 0, 4.5).rotateX(0.1), this.beamMat);
      cone.position.set(sx * (cw / 2 - 0.26), 0.68, cl / 2 + 0.05);
      this.object.add(cone);
    }
    this.poolMat = new THREE.MeshBasicMaterial({ map: glowSprite(), color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const pool = new THREE.Mesh(flatGeo(3.6, 8), this.poolMat);
    pool.position.set(0, 0.03, cl / 2 + 4.2);
    this.object.add(pool);
    // hidden far below rather than invisible, so its shaders compile with the level
    this.object.position.set(0, -80, 0);
    this.front = new THREE.Vector3(0, 0, -1000);
    this.back = new THREE.Vector3(0, 0, -1000);
    world.addCircle(this.front, 1.0);
    world.addCircle(this.back, 1.0);
    this.state = 'hidden';
    this.timer = world.rng.float(15, 35);
    this.t = 0;
    this.speed = 0;
    this.path = null;
    this.replan = 0;
    this.seenT = 0;
    this.flash = 0;
    this.flashes = 0;
    this.lights = 0;
    this.engine = null;
    this.probeT = 0;
  }

  cellNear(x, z) {
    const g = this.world.grid;
    const [ci, cj] = g.cellOf(x, z);
    let best = null;
    let bd = Infinity;
    for (let dj = -3; dj <= 3; dj++) {
      for (let di = -3; di <= 3; di++) {
        const i = ci + di;
        const j = cj + dj;
        if (!g.inBounds(i, j) || !this.drive[j * g.w + i]) continue;
        const c = this.wp(i, j);
        const d = Math.hypot(c.x - x, c.z - z);
        if (d < bd) {
          bd = d;
          best = [i, j];
        }
      }
    }
    return best;
  }

  /** BFS over lane cells only. */
  route(from, to) {
    const g = this.world.grid;
    const prev = new Int32Array(g.w * g.h).fill(-1);
    const s = from[1] * g.w + from[0];
    const goal = to[1] * g.w + to[0];
    const q = [s];
    prev[s] = s;
    for (let h = 0; h < q.length; h++) {
      const cur = q[h];
      if (cur === goal) break;
      const ci = cur % g.w;
      const cj = (cur / g.w) | 0;
      for (const [dx, dy] of DIRS) {
        const k = (cj + dy) * g.w + ci + dx;
        if (!g.inBounds(ci + dx, cj + dy) || prev[k] !== -1 || !this.drive[k] || !g.passable(ci, cj, dx, dy)) continue;
        prev[k] = cur;
        q.push(k);
      }
    }
    if (prev[goal] === -1) return null;
    const out = [];
    for (let c = goal; c !== s; c = prev[c]) out.push({ ...this.wp(c % g.w, (c / g.w) | 0), cell: [c % g.w, (c / g.w) | 0] });
    return out.reverse();
  }

  appear(ctx) {
    const { player } = ctx;
    const w = this.world;
    const g = w.grid;
    const start = this.cellNear(player.pos.x, player.pos.z);
    if (!start) return false;
    const cands = [];
    for (let j = 0; j < g.h; j++) {
      for (let i = 0; i < g.w; i++) {
        if (!this.drive[j * g.w + i] || g.ramp[j * g.w + i]) continue;
        const c = this.wp(i, j);
        const d = Math.hypot(c.x - player.pos.x, c.z - player.pos.z);
        if (d < 18 || d > 34) continue;
        if (seen(ctx, w, c.x, w.floorAt(c.x, c.z) + 0.8, c.z, 1.2)) continue;
        cands.push([i, j]);
      }
    }
    if (!cands.length) return false;
    const [i, j] = w.rng.pick(cands);
    const path = this.route([i, j], start);
    if (!path || path.length < 3) return false;
    const c = this.wp(i, j);
    const o = this.object;
    o.position.set(c.x, w.floorAt(c.x, c.z), c.z);
    o.rotation.y = Math.atan2(path[0].x - c.x, path[0].z - c.z);
    this.path = path;
    this.cell = [i, j];
    this.state = 'creep';
    this.t = 0;
    this.flashes = 0;
    this.seenT = 0;
    this.probeT = 0;
    return true;
  }

  hide() {
    this.state = 'hidden';
    this.object.position.set(0, -80, 0);
    this.front.set(0, 0, -1000);
    this.back.set(0, 0, -1000);
    this.timer = this.world.rng.float(35, 80);
    this.presence = 0;
    this.lights = 0;
  }

  update(dt, ctx) {
    if (ctx.attract) return;
    const { player, game } = ctx;
    const w = this.world;
    const o = this.object;
    const p = o.position;
    const audio = game.audio;
    if (!this.engine && audio.ready) {
      // a low idle, like an engine left running
      this.panner = audio.panner(0, 0, 0, { ref: 4, rolloff: 1.1 });
      this.engine = audio.hum(this.panner, { freq: 33, cut: 150 });
    }
    if (this.state === 'hidden') {
      if (this.engine) this.engine.gain.setTargetAtTime(0, audio.ctx.currentTime, 0.3);
      if (w.uneaseAt(player.pos.x, player.pos.z) < 0.7) return;
      this.timer -= dt;
      if (this.timer <= 0 && !this.appear(ctx)) this.timer = 3;
      if (this.state === 'hidden') return;
    }
    this.t += dt;
    const dist = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
    const looked = seen(ctx, w, p.x, p.y + 0.8, p.z, 1.0);
    if (this.state === 'creep') {
      this.lights = Math.min(1, this.lights + dt * 2);
      if (looked) {
        this.speed = 0;
        this.seenT += dt;
        this.presence = Math.min(0.55, this.presence + dt * 0.5);
        // it flashes its high beams at you, once or twice
        if (this.seenT > 0.8 && this.flashes < 2 && this.flash <= 0 && w.rng.chance(dt * 1.5)) {
          this.flash = 0.9;
          this.flashes++;
        }
        if (dist < 7.5) this.state = 'leave';
      } else {
        this.seenT = 0;
        this.presence = Math.max(0.15, this.presence - dt * 0.2);
        this.replan -= dt;
        if (this.replan <= 0) {
          this.replan = 1;
          // replan from the last lane cell reached, so it never dithers between two
          const from = this.cell;
          const to = this.cellNear(player.pos.x, player.pos.z);
          if (from && to) this.path = this.route(from, to) || this.path;
        }
        const want = dist > 10 && this.path && this.path.length ? 2.6 : 0;
        this.speed += (want - this.speed) * Math.min(1, dt * 1.5);
        this.follow(dt);
      }
      if (this.t > 120) this.state = 'leave';
    } else if (this.state === 'leave') {
      this.lights = Math.max(0, this.lights - dt * 3);
      this.presence = Math.max(0, this.presence - dt);
      if (!looked) this.hide();
    }
    this.flash = Math.max(0, this.flash - dt);
    const beam = this.lights * (1 + (this.flash > 0 && this.flash % 0.45 > 0.2 ? 1.2 : 0));
    this.rig.set(beam, this.lights * 0.8, 0);
    this.beamMat.uniforms.uColor.value.setRGB(0.16, 0.15, 0.13).multiplyScalar(beam);
    this.poolMat.color.setRGB(0.15, 0.13, 0.095).multiplyScalar(beam);
    // pitch on the ramps
    const [, cl] = this.car.userData.size;
    const fx = Math.sin(o.rotation.y);
    const fz = Math.cos(o.rotation.y);
    if (this.state !== 'hidden') {
      const yf = w.floorAt(p.x + fx * cl * 0.4, p.z + fz * cl * 0.4);
      const yb = w.floorAt(p.x - fx * cl * 0.4, p.z - fz * cl * 0.4);
      o.rotation.x = -Math.atan2(yf - yb, cl * 0.8);
      p.y = (yf + yb) / 2;
      this.front.set(p.x + fx * 1.25, 0, p.z + fz * 1.25);
      this.back.set(p.x - fx * 1.25, 0, p.z - fz * 1.25);
      this.probeT -= dt;
      if (this.probeT <= 0) {
        this.probeT = 0.5;
        updateProbe(this.car, w, p);
      }
    }
    if (this.engine) {
      audio.setPannerPos(this.panner, p.x, p.y + 0.5, p.z);
      this.engine.gain.setTargetAtTime(this.state === 'creep' ? 0.05 + this.speed * 0.02 : 0, audio.ctx.currentTime, 0.4);
      this.engine.freq.setTargetAtTime(33 + this.speed * 6, audio.ctx.currentTime, 0.4);
    }
  }

  follow(dt) {
    const p = this.object.position;
    while (this.path && this.path.length) {
      const t = this.path[0];
      const dx = t.x - p.x;
      const dz = t.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.3) {
        this.cell = this.path.shift().cell;
        continue;
      }
      const yaw = Math.atan2(dx, dz);
      const diff = Math.atan2(Math.sin(yaw - this.object.rotation.y), Math.cos(yaw - this.object.rotation.y));
      this.object.rotation.y += diff * Math.min(1, dt * 2.5);
      // slow down for corners, like a careful driver
      const s = Math.min(d, this.speed * dt * (Math.abs(diff) > 0.5 ? 0.4 : 1));
      p.x += (dx / d) * s;
      p.z += (dz / d) * s;
      return;
    }
  }

  dispose() {
    if (this.engine) {
      this.engine.stop();
      this.engine.osc.disconnect();
    }
    this.panner?.disconnect();
  }
}
