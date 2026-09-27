import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';

let rectReady = false;

/**
 * Many light fixtures, few real lights: a fixed pool of lights is moved to
 * the fixtures nearest the camera. Fixtures can flicker or be dead, and a
 * "disturbance" makes nearby fixtures stutter.
 *
 * type 'point' uses PointLights; 'rect' uses downward RectAreaLights sized
 * like the fixture (soft, physically shaped fluorescent panels).
 *
 * fixture: { pos: Vector3, color?, intensity?, flicker: 0..1, dead: bool, instance?: index }
 */
export class LightPool {
  constructor(parent, count, { type = 'point', color = 0xffffff, intensity = 6, distance = 9, decay = 1.6, width = 1.2, height = 0.6 } = {}) {
    this.type = type;
    this.lights = [];
    this.fixtures = [];
    this.baseIntensity = intensity;
    if (type === 'rect' && !rectReady) {
      RectAreaLightUniformsLib.init();
      rectReady = true;
    }
    for (let i = 0; i < count; i++) {
      let l;
      if (type === 'rect') {
        l = new THREE.RectAreaLight(color, 0, width, height);
        l.rotation.x = -Math.PI / 2;
      } else {
        l = new THREE.PointLight(color, 0, distance, decay);
      }
      l.userData.fixture = null;
      parent.add(l);
      this.lights.push(l);
    }
    this.timer = 0;
    this.disturb = null;
    this.mesh = null; // optional InstancedMesh of fixture panels
    this.baseColor = new THREE.Color(1, 1, 1);
    this._c = new THREE.Color();
  }

  add(fixture) {
    fixture.level = fixture.dead ? 0 : 1;
    fixture.phase = Math.random() * 100;
    this.fixtures.push(fixture);
    return fixture;
  }

  setDisturbance(pos, radius) {
    this.disturb = pos ? { pos, radius } : null;
  }

  levelOf(f, t) {
    if (f.dead) return f.deadGlow || 0;
    let lv = 1;
    if (f.flicker > 0) {
      const p = t * 9 + f.phase;
      const s = Math.sin(p) * Math.sin(p * 2.7 + 1.3) * Math.sin(p * 0.31);
      if (s > 1 - f.flicker) lv = 0.08;
      else if (Math.sin(t * 1.7 + f.phase) > 0.97) lv = 0.5;
    }
    if (this.disturb) {
      const d = f.pos.distanceTo(this.disturb.pos);
      if (d < this.disturb.radius && Math.random() < (1 - d / this.disturb.radius) * 0.5) lv *= 0.05;
    }
    return lv;
  }

  assign(camPos, instant = false) {
    const wanted = this.fixtures
      .filter((f) => !f.dead)
      .map((f) => ({ f, d: f.pos.distanceToSquared(camPos) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, this.lights.length)
      .map((e) => e.f);
    const wantedSet = new Set(wanted);
    const kept = new Set();
    const free = [];
    // keep stable assignments so lights don't pop between fixtures
    for (const l of this.lights) {
      const f = l.userData.fixture;
      if (f && wantedSet.has(f) && !kept.has(f)) kept.add(f);
      else free.push(l);
    }
    for (const f of wanted) {
      if (kept.has(f)) continue;
      const l = free.pop();
      if (!l) break;
      l.userData.fixture = f;
      l.intensity = instant ? (f.intensity ?? this.baseIntensity) : 0;
      l.position.copy(f.pos);
      if (this.type === 'point') l.position.y -= 0.25;
      else l.position.y -= 0.03;
      if (f.color) l.color.set(f.color);
      if (this.type === 'rect' && f.rot) l.rotation.set(-Math.PI / 2, 0, f.rot);
    }
    for (const l of free) l.userData.fixture = null;
  }

  /** Assign and light instantly (used before capturing reflections). */
  snap(camPos) {
    this.assign(camPos, true);
  }

  update(dt, t, camPos) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.25;
      this.assign(camPos);
    }
    for (const f of this.fixtures) f.level = this.levelOf(f, t);
    for (const l of this.lights) {
      const f = l.userData.fixture;
      const target = f ? f.level * (f.intensity ?? this.baseIntensity) : 0;
      l.intensity += (target - l.intensity) * Math.min(1, dt * (target < l.intensity ? 30 : 8));
    }
    if (this.mesh) {
      for (const f of this.fixtures) {
        if (f.instance === undefined) continue;
        this._c.copy(this.baseColor).multiplyScalar(0.1 + f.level * 0.9);
        this.mesh.setColorAt(f.instance, this._c);
      }
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
  }
}
