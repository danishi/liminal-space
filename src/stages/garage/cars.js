import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { glowSprite } from '../../core/textures.js';
import { updateProbe } from '../../entities/figures.js';
import { PI } from './constants.js';

// ---------------------------------------------------------------------------
// Cars

const PAINTS = [[0xd6d6d2, 5], [0xdedcd4, 2], [0x9ea3a8, 4], [0x676b70, 2], [0x121316, 4], [0x1c2a48, 2], [0x7a1418, 1.2], [0x2a3a30, 0.8], [0xb8a88a, 0.8], [0x4a2c20, 0.5]];
export const PASTELS = [0xbfe3d2, 0xf2dcc0, 0xe9c9d6, 0xc9d8ef, 0xf0e6a8];

export function pickPaint(rng, kind) {
  if (kind === 'kei' && rng.chance(0.3)) return rng.pick(PASTELS);
  const total = PAINTS.reduce((s, p) => s + p[1], 0);
  let r = rng.next() * total;
  for (const [c, w] of PAINTS) {
    r -= w;
    if (r <= 0) return c;
  }
  return PAINTS[0][0];
}

export const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const PLANE = new THREE.PlaneGeometry(1, 1);
PLANE.userData.shared = true;

/**
 * Lamps that can come on: additive planes over the sculpted head, tail and
 * indicator lights plus glow sprites (never real lights: the light count
 * stays constant). set(head, tail, amber) takes levels 0..~2.
 */
export function lightRig(car, size) {
  const [w, l] = size;
  const hw = w / 2;
  const hl = l / 2;
  const add = () => new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const spr = () => new THREE.SpriteMaterial({ map: glowSprite(), color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const head = add();
  const tail = add();
  const amber = add();
  const headG = spr();
  const tailG = spr();
  const amberG = spr();
  const lamp = (mat, sx, sy, x, y, z, back) => {
    const m = new THREE.Mesh(PLANE, mat);
    m.scale.set(sx, sy, 1);
    m.position.set(x, y, z);
    if (back) m.rotation.y = PI;
    m.userData.noBake = true;
    car.add(m);
  };
  const halo = (mat, s, x, y, z) => {
    const sp = new THREE.Sprite(mat);
    sp.scale.setScalar(s);
    sp.position.set(x, y, z);
    car.add(sp);
  };
  for (const sx of [-1, 1]) {
    lamp(head, 0.3, 0.09, sx * (hw - 0.26), 0.68, hl + 0.04);
    lamp(tail, 0.26, 0.09, sx * (hw - 0.2), 0.72, -hl - 0.04, true);
    lamp(amber, 0.09, 0.07, sx * (hw - 0.08), 0.68, hl + 0.035);
    lamp(amber, 0.09, 0.07, sx * (hw - 0.07), 0.72, -hl - 0.035, true);
    halo(headG, 1.2, sx * (hw - 0.26), 0.68, hl + 0.14);
    halo(tailG, 0.8, sx * (hw - 0.2), 0.72, -hl - 0.12);
    halo(amberG, 0.9, sx * (hw - 0.08), 0.68, hl + 0.12);
    halo(amberG, 0.9, sx * (hw - 0.07), 0.72, -hl - 0.12);
  }
  const parts = car.children.filter((o) => o.material === head || o.material === tail || o.material === amber || o.material === headG || o.material === tailG || o.material === amberG);
  let on = true;
  const rig = {
    set(h, t, a) {
      // idle rigs are hidden: a car park full of black additive quads is a lot of draw calls
      const want = h + t + a > 0.001;
      if (want !== on) {
        on = want;
        for (const o of parts) o.visible = want;
      }
      head.color.setRGB(2.4, 2.3, 2.0).multiplyScalar(h);
      headG.color.setRGB(0.8, 0.78, 0.7).multiplyScalar(h);
      tail.color.setRGB(2.2, 0.1, 0.05).multiplyScalar(t);
      tailG.color.setRGB(0.7, 0.04, 0.02).multiplyScalar(t);
      amber.color.setRGB(2.6, 1.3, 0.1).multiplyScalar(a);
      amberG.color.setRGB(0.9, 0.45, 0.04).multiplyScalar(a);
    },
  };
  rig.set(0, 0, 0);
  return rig;
}

/** Low-poly stand-ins for distant cars: the sculpted ones are heavy. */
const PROXY_DIMS = { sedan: [1.78, 4.5, 1.42], kei: [1.48, 3.4, 1.65], van: [1.85, 4.7, 1.95] };
const proxyCache = new Map();
export function proxyGeo(kind) {
  if (proxyCache.has(kind)) return proxyCache.get(kind);
  const [w, l, h] = PROXY_DIMS[kind];
  const hw = w / 2;
  const hl = l / 2;
  const cabF = kind === 'sedan' ? hl - 1.3 : kind === 'kei' ? hl - 0.55 : hl - 0.45;
  const cabB = kind === 'sedan' ? -hl + 0.95 : -hl + 0.15;
  const cz = (cabF + cabB) / 2;
  const cl = cabF - cabB;
  const box = (bw, bh, bd, x, y, z) => new THREE.BoxGeometry(bw, bh, bd).translate(x, y, z);
  const paintG = mergeGeometries([
    box(w, 0.58, l - 0.1, 0, 0.56, 0),
    box(w - 0.1, 0.5, 0.1, 0, 0.55, hl - 0.05),
    box(w - 0.1, 0.5, 0.1, 0, 0.55, -hl + 0.05),
    box(w * 0.86, 0.12, cl - 0.1, 0, h - 0.06, cz),
    box(w * 0.88, 0.14, cl, 0, 0.92, cz),
  ]);
  const darkG = mergeGeometries([
    box(w * 0.9, h - 1.06, cl - 0.06, 0, (h + 0.99) / 2 - 0.03, cz),
    ...[hl - 0.75, -hl + 0.7].flatMap((z) => [-1, 1].map((x) => new THREE.CylinderGeometry(0.31, 0.31, 0.2, 12).rotateZ(PI / 2).translate(x * (hw - 0.1), 0.31, z))),
  ]);
  const out = [paintG, darkG];
  for (const geo of out) geo.userData.shared = true;
  proxyCache.set(kind, out);
  return out;
}

const LOOK_LINES = [
  { min: 0, lines: ['(Nobody inside. The seat is still warm.)'] },
  { min: 0, lines: ['(A parking ticket on the dashboard: OVERSTAYED — 11,000 DAYS.)'] },
  { min: 0, lines: ['(A pine-tree air freshener. It smells of a forest you have never been to.)'] },
  { min: 0, lines: ['(The keys are in the ignition.)', '(The car is not.)', '(No — it is. You checked twice.)'] },
  { min: 0, lines: ['(A sticky note on the wheel: “BACK IN 5 MIN.” The note is yellow with age.)'] },
  { min: 0.2, lines: ['(The sat-nav is on. It says: “You have arrived.”)'] },
  { min: 0.3, lines: ['(The radio is on, very quietly. It is a traffic report for this car park.)', '(Traffic on P6 is light. Traffic on P6 has always been light.)'] },
  { min: 0.4, lines: ['(The windows are fogged from the inside. Someone has written “HI”.)'] },
  { min: 0.55, lines: ['(Nobody inside. The seat is pushed all the way back, for someone very tall.)'] },
  { min: 0.65, lines: ['(The rear-view mirror is angled down at you. You didn’t touch it.)'] },
];
const DRAWING = ['(A child’s drawing on the back seat.)', '(It is a drawing of you, looking in through a car window.)'];
const COVER_LINES = [
  ['(A car under a dust cover. The cover rises and falls, slowly.)', '(It’s the ventilation. Probably the ventilation.)'],
  ['(You lift a corner of the cover. There is another cover underneath.)'],
  ['(A handwritten tag on the cover: “DO NOT UNCOVER. IT IS SLEEPING.”)'],
];

/** The gimmick cars: locking chirps, distant alarms, a horn with rhythm, "look inside". */
export class CarPark {
  constructor(world, cars) {
    this.world = world;
    this.cars = cars;
    this.active = new Set();
    this.probed = false;
    this.cullT = 0;
    this.alarmT = world.rng.float(25, 55);
    this.chirpCool = 4;
    this.lookIdx = 0;
    this.drawingShown = false;
    this.panners = null;
    this.ended = false;
    this.lines = world.rng.shuffle(LOOK_LINES.slice());
  }

  lookInside(car, game) {
    const u = this.world.uneaseAt(car.x, car.z);
    let lines;
    if (car.covered) lines = COVER_LINES[(car.looked = (car.looked ?? -1) + 1) % COVER_LINES.length];
    else if (car.honker && car.honked) lines = ['(Nobody inside. A note is taped to the horn: “TWO BITS”.)'];
    else if (u >= 0.8 && !this.drawingShown && this.world.rng.chance(0.5)) {
      this.drawingShown = true;
      lines = DRAWING;
      game.pulseStatic(0.25);
    } else {
      const ok = this.lines.filter((e) => u >= e.min);
      lines = ok[this.lookIdx++ % ok.length].lines;
    }
    game.openDialog('the car', lines, 0.8);
  }

  start(car, type, dur) {
    car.fx = { type, t: 0, dur };
    this.active.add(car);
  }

  update(dt, ctx) {
    const w = this.world;
    const cam = ctx.camera.position;
    // parked cars pick up the baked light where they stand
    if (!this.probed) {
      this.probed = true;
      for (const c of this.cars) if (c.sculpt) updateProbe(c.sculpt, w, c.group.position);
    }
    // sculpted cars up close, low-poly stand-ins further out, nothing past the fog
    this.cullT -= dt;
    if (this.cullT <= 0) {
      this.cullT = 0.3;
      const dirty = new Set();
      for (const c of this.cars) {
        if (!c.sculpt) continue;
        const dist = Math.hypot(c.x - cam.x, c.z - cam.z);
        c.sculpt.visible = dist < 17;
        const proxy = dist >= 17 && dist < 44;
        if (proxy === c.proxyShown) continue;
        c.proxyShown = proxy;
        const { pm, dm, n, m } = c.proxy;
        pm.setMatrixAt(n, proxy ? m : ZERO);
        dm.setMatrixAt(n, proxy ? m : ZERO);
        dirty.add(pm).add(dm);
      }
      for (const im of dirty) im.instanceMatrix.needsUpdate = true;
    }
    for (const c of this.active) {
      const f = c.fx;
      f.t += dt;
      let h = 0;
      let a = 0;
      let t = 0;
      if (f.type === 'lock') {
        a = f.t < 0.62 && f.t % 0.32 < 0.14 ? 1 : 0;
        t = a * 0.6;
      } else if (f.type === 'alarm') {
        a = f.t % 0.5 < 0.25 ? 1 : 0;
        h = a;
      } else if (f.type === 'honk') {
        for (const [s, len] of f.notes) if (f.t >= s && f.t < s + len + 0.04) h = 1.4;
        if (f.second && f.t >= f.second.at) {
          ctx.game.audio.honk(this.panners?.honk, f.second.pattern);
          f.second = null;
        }
      }
      c.rig.set(h, t, a);
      if (f.t >= f.dur) {
        c.rig.set(0, 0, 0);
        c.fx = null;
        this.active.delete(c);
      }
    }
    if (ctx.attract) return;
    const audio = ctx.game.audio;
    if (!audio.ready) return;
    if (!this.panners) this.panners = { chirp: audio.panner(0, 0, 0, { ref: 3, rolloff: 1.2 }), alarm: audio.panner(0, 0, 0, { ref: 5, rolloff: 0.9 }), honk: audio.panner(0, 0, 0, { ref: 4, rolloff: 1 }) };
    const p = ctx.player.pos;
    this.chirpCool -= dt;
    for (const c of this.cars) {
      if (!c.rig || c.fx) continue;
      c.cool = (c.cool || 0) - dt;
      if (c.cool > 0 || Math.abs(c.x - p.x) + Math.abs(c.z - p.z) > 9) continue;
      // distance to the car's body, not its centre: walking down the lane counts as passing it
      const cy = Math.cos(c.yaw);
      const sy = Math.sin(c.yaw);
      const lx = (p.x - c.x) * cy - (p.z - c.z) * sy;
      const lz = (p.x - c.x) * sy + (p.z - c.z) * cy;
      const d = Math.hypot(Math.max(0, Math.abs(lx) - c.size[0] / 2), Math.max(0, Math.abs(lz) - c.size[1] / 2));
      if (d > (c.honker ? 4 : 3.4)) continue;
      if (c.honker && ctx.player.speed > 0.5) {
        // shave and a haircut ... (two bits)
        c.cool = 70;
        c.honked = true;
        audio.setPannerPos(this.panners.honk, c.x, c.y + 0.8, c.z);
        audio.honk(this.panners.honk, [0.2, 0.04, 0.04, 0.2, 0.2]);
        this.start(c, 'honk', 2.4);
        c.fx.notes = [[0, 0.2], [0.32, 0.04], [0.48, 0.04], [0.64, 0.2], [0.96, 0.2], [1.6, 0.2], [1.92, 0.2]];
        c.fx.second = { at: 1.6, pattern: [0.2, 0.2] };
      } else if (c.locker && this.chirpCool <= 0 && ctx.player.speed > 0.5) {
        // someone just locked it. Nobody is there.
        c.cool = 90;
        this.chirpCool = w.rng.float(5, 12);
        if (!w.rng.chance(0.65)) continue;
        audio.setPannerPos(this.panners.chirp, c.x, c.y + 0.8, c.z);
        const unlock = w.uneaseAt(c.x, c.z) > 0.8 && w.rng.chance(0.4);
        audio.chirp(this.panners.chirp, unlock ? 1 : 2);
        this.start(c, 'lock', unlock ? 0.3 : 0.7);
      }
    }
    // now and then a car alarm goes off somewhere else on the level
    this.alarmT -= dt;
    if (this.alarmT <= 0) {
      const u = w.uneaseAt(p.x, p.z);
      this.alarmT = w.rng.float(40, 90) / (0.7 + u);
      const far = this.cars.filter((c) => c.rig && !c.fx && Math.hypot(c.x - p.x, c.z - p.z) > 14 && Math.hypot(c.x - p.x, c.z - p.z) < 45);
      if (far.length) {
        const c = w.rng.pick(far);
        const dur = w.rng.float(3.5, 6);
        audio.setPannerPos(this.panners.alarm, c.x, c.y + 0.8, c.z);
        audio.carAlarm(this.panners.alarm, dur);
        this.start(c, 'alarm', dur);
      }
    }
  }

  dispose() {
    if (this.panners) for (const k in this.panners) this.panners[k].disconnect();
  }
}
