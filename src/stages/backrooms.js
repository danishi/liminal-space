import * as THREE from 'three';
import { Grid, FLOOR, WALL, HOLE } from '../core/grid.js';
import { ceilingTile, pbr, paint } from '../core/surfaces.js';
import { exitSign } from '../core/textures.js';
import { buildShell, ceilingFixtures, doorModel, glow, decorate, stairRun } from './common.js';
import { PropKit } from '../props/kit.js';
import { photo } from '../core/assets.js';
import * as P from '../props/library.js';
import { Watcher, Follower } from '../entities/creatures.js';
import { NPC, mat } from '../entities/npc.js';

const H = 2.7;

// photo-scanned props
const M = {
  box: P.modelProp('cardboard_box_01', { jitter: 0.3, scaleJitter: 0.15 }),
  box2: P.modelProp('cardboard_box_01', { scale: 1.4, jitter: 0.2 }),
  cabinet: P.modelProp('drawer_cabinet'),
  extinguisher: P.modelProp('korean_fire_extinguisher_01'),
  bins: P.modelProp('metal_trash_can', { scale: 0.9 }),
  desk: P.modelProp('metal_office_desk', { scale: 0.85 }),
  ladder: P.modelProp('ladder_sectioned_01'),
  tv: P.modelProp('Television_01', { jitter: 0.5 }),
  alarm: P.modelProp('fire_alarm', { place: 'high', y: 1.45, collide: false }),
  chair: P.modelProp('plastic_monobloc_chair_01', { jitter: 3 }),
  sign: P.modelProp('WetFloorSign_01', { jitter: 3 }),
  chairTipped: {
    place: 'floor', fp: [0.7, 0.9],
    build(k, rng) {
      const g = new THREE.Group();
      const m = k.model(g, 'plastic_monobloc_chair_01', 0, 0.32, 0, rng.float(0, 6));
      m.rotation.x = -Math.PI / 2;
      return g;
    },
  },
};

function drifterModel() {
  const g = new THREE.Group();
  const suit = mat(0xc4611f);
  const dark = mat(0x2a2a28);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.4, 4, 8), suit);
  torso.position.set(0, 0.62, -0.05);
  torso.rotation.x = -0.15;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), suit);
  head.position.set(0, 1.05, -0.02);
  g.add(head);
  const mask = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.12, 12), dark);
  mask.rotation.x = Math.PI / 2;
  mask.position.set(0, 1.0, 0.14);
  g.add(mask);
  for (const x of [-0.07, 0.07]) {
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.045, 12), new THREE.MeshStandardMaterial({ color: 0x9fb4b0, metalness: 0.6, roughness: 0.2 }));
    lens.position.set(x, 1.08, 0.155);
    g.add(lens);
  }
  for (const x of [-0.13, 0.13]) {
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.35, 4, 8), suit);
    thigh.rotation.x = Math.PI / 2 - 0.5;
    thigh.position.set(x, 0.38, 0.2);
    g.add(thigh);
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.35, 4, 8), suit);
    shin.rotation.x = 0.35;
    shin.position.set(x, 0.24, 0.48);
    g.add(shin);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.4, 4, 8), suit);
    arm.position.set(x * 2.1, 0.6, 0.08);
    arm.rotation.x = -0.6;
    g.add(arm);
  }
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.7, 0.9) }));
  lantern.position.set(0.42, 0.08, 0.35);
  g.add(lantern);
  const l = glow(0xffc36b, 1.2, 0.5);
  l.position.copy(lantern.position);
  g.add(l);
  return g;
}

function phoneModel() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.1, 0.2), new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.3 }));
  body.position.y = 0.05;
  g.add(body);
  const hand = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.18, 4, 8), new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.3 }));
  hand.rotation.z = Math.PI / 2;
  hand.position.y = 0.13;
  g.add(hand);
  return g;
}

/** Lowers a rectangle of floor and gives it one staircase down. */
function sunken(g, rng, depth, near) {
  for (let tries = 0; tries < 30; tries++) {
    const w = rng.int(4, 7);
    const h = rng.int(4, 7);
    const i0 = rng.int(3, g.w - w - 4);
    const j0 = rng.int(3, g.h - h - 4);
    if (Math.abs(i0 + w / 2 - near[0]) < w / 2 + 4 && Math.abs(j0 + h / 2 - near[1]) < h / 2 + 4) continue;
    for (let j = j0; j < j0 + h; j++) for (let i = i0; i < i0 + w; i++) if (g.get(i, j) === FLOOR) g.setHeight(i, j, -depth);
    // stairs: a run of ramp cells leaving the room through one side
    const side = rng.int(0, 3);
    const steps = depth > 1.5 ? 2 : 1;
    const rise = depth / steps;
    let si;
    let sj;
    let dir;
    if (side === 0) { si = i0 + w - steps; sj = j0 + rng.int(1, h - 2); dir = 0; }
    else if (side === 1) { si = i0 + steps - 1; sj = j0 + rng.int(1, h - 2); dir = 1; }
    else if (side === 2) { si = i0 + rng.int(1, w - 2); sj = j0 + h - steps; dir = 2; }
    else { si = i0 + rng.int(1, w - 2); sj = j0 + steps - 1; dir = 3; }
    const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][dir];
    for (let s = 0; s < steps; s++) {
      g.set(si + dx * s, sj + dy * s, FLOOR);
      g.setRamp(si + dx * s, sj + dy * s, dir, -depth + rise * s, rise);
    }
    // keep the landing at the top clear
    g.set(si + dx * steps, sj + dy * steps, FLOOR);
    g.setHeight(si + dx * steps, sj + dy * steps, 0);
    return;
  }
}

export default {
  id: 'backrooms',
  code: 'LEVEL 0',
  name: 'The Backrooms',
  sub: 'Endless yellow rooms',
  tint: 0xfff0b0,
  assets: {
    textures: ['decrepit_wallpaper', 'dirty_carpet'],
    models: ['cardboard_box_01', 'WetFloorSign_01', 'metal_office_desk', 'plastic_monobloc_chair_01', 'metal_trash_can', 'drawer_cabinet', 'korean_fire_extinguisher_01', 'Television_01', 'ladder_sectioned_01', 'fire_alarm'],
  },

  build(world) {
    const rng = world.rng;
    const W = 44;
    const cs = 2.6;
    const g = (world.grid = new Grid(W, W, cs, FLOOR));
    g.border();
    for (let s = 0; s < 190; s++) {
      const i = rng.int(1, W - 2);
      const j = rng.int(1, W - 2);
      const horiz = rng.chance(0.5);
      const len = rng.int(2, 7);
      for (let k = 0; k < len; k++) g.set(horiz ? i + k : i, horiz ? j : j + k, WALL);
    }
    for (let r = 0; r < 4; r++) {
      const i0 = rng.int(2, W - 10);
      const j0 = rng.int(2, W - 10);
      const w = rng.int(5, 8);
      const h = rng.int(5, 8);
      g.fillRect(i0, j0, i0 + w, j0 + h, FLOOR);
      for (let j = j0 + 1; j < j0 + h; j += 2) for (let i = i0 + 1; i < i0 + w; i += 2) g.set(i, j, WALL);
    }
    const si = W >> 1;
    const sj = W >> 1;
    g.fillRect(si - 1, sj - 1, si + 1, sj + 1, FLOOR);
    // verticality: sunken rooms (one floor down or a half level) and raised decks
    const nSunken = 2 + Math.min(3, world.depth);
    for (let n = 0; n < nSunken; n++) sunken(g, rng, rng.pick([1.2, 2.7]), [si, sj]);
    for (let n = 0; n < 2; n++) {
      const i0 = rng.int(3, W - 9);
      const j0 = rng.int(3, W - 9);
      if (Math.abs(i0 - si) < 6 && Math.abs(j0 - sj) < 6) continue;
      for (let j = j0; j < j0 + 4; j++) for (let i = i0; i < i0 + 5; i++) if (g.get(i, j) === FLOOR && g.heightOf(i, j) === 0) g.setHeight(i, j, 0.9);
      stairRun(g, i0 - 1, j0 + 1, 0, 1, 0, 0.9);
      g.set(i0 - 1, j0 + 1, FLOOR);
    }
    const sp = g.center(si, sj);
    world.spawn = { x: sp.x, z: sp.z, yaw: rng.float(0, Math.PI * 2) };
    world.finalizeLayout();

    // holes in the carpet appear further out, and more of them the deeper you are
    const holes = 1 + world.depth * 2;
    const far = world.pickFarCells(holes, { minFrac: 0.45, spacing: 5, filter: (i, j) => g.get(i, j) === FLOOR && !g.ramp[j * W + i] && g.countSolidNeighbors(i, j) === 0 });
    for (const [i, j] of far) g.set(i, j, HOLE);

    // photo-scanned wallpaper tinted mustard; carpet colour is ours, its fibres are scanned
    const wallMat = photo('decrepit_wallpaper', { uvScale: 2.7, color: new THREE.Color(1.38, 1.2, 0.52) });
    const floorMat = photo('dirty_carpet', { uvScale: 1.2, color: new THREE.Color(2.7, 2.25, 1.1), normalScale: 0.7 });
    const ceilMat = pbr(ceilingTile(), { normalScale: 0.8 });
    const baseMat = pbr(paint('s-br-base', [140, 122, 60], { rough: 0.5 }));
    buildShell(world, {
      height: H,
      wall: { mat: wallMat, u: 2.7, v: 2.7 },
      floor: { mat: floorMat, uv: 2.4 },
      ceilMat: { mat: ceilMat, uv: 1.2 },
      stairs: floorMat,
      trims: [{ mat: baseMat, y0: 0, y1: 0.1, inset: 0.012 }],
    });
    world.root.add(new THREE.HemisphereLight(0xfff0b8, 0x5d5025, 0.35));
    ceilingFixtures(world, {
      type: 'rect', every: 2, offset: 1, size: [1.2, 0.6], color: 0xfff1c8, intensity: 9, distance: 11,
      flicker: 0.08, dead: 0.05, rotate: true, housing: new THREE.MeshStandardMaterial({ color: 0xd8d2bd, roughness: 0.5 }),
    });

    const kit = new PropKit(world);
    decorate(world, kit, {
      density: { wall: 0.14, high: 0.14, floor: 0.07, clutter: 0.1, ceil: 0.06 },
      wall: [
        { p: M.box, w: 3 }, { p: M.box2, w: 1.5 }, { p: M.cabinet, w: 1.5 }, { p: P.filingCabinet, w: 1.5 }, { p: P.waterCooler, w: 1 },
        { p: M.extinguisher, w: 1 }, { p: M.bins, w: 1 }, { p: M.desk, w: 1 }, { p: M.ladder, w: 0.8 },
        { p: P.mattress, w: 1, min: 0.3 }, { p: P.fakeDoor, w: 1.2, min: 0.45 }, { p: M.tv, w: 1, min: 0.5 }, { p: P.tvStatic, w: 1, min: 0.65 },
      ],
      high: [
        { p: P.outlet, w: 3 }, { p: P.wallVent, w: 2 }, { p: M.alarm, w: 1 }, { p: P.wallClock, w: 1 }, { p: P.poster, w: 1, min: 0.3 },
        { p: P.painting, w: 1, min: 0.55 }, { p: P.handprints, w: 1.5, min: 0.8 },
      ],
      floor: [{ p: P.officeChair, w: 2 }, { p: M.chair, w: 2 }, { p: M.sign, w: 1 }, { p: P.chairPile, w: 1.2, min: 0.6 }, { p: M.chairTipped, w: 1, min: 0.5 }],
      clutter: [
        { p: P.paperScatter, w: 3 }, { p: P.bottles, w: 2 }, { p: P.trafficCone, w: 1 }, { p: M.tv, w: 0.8, min: 0.2 }, { p: P.puddle, w: 2 },
        { p: M.box, w: 1.5 },
      ],
      ceil: [{ p: P.missingTile, w: 2 }, { p: P.hangingWires, w: 1, min: 0.35 }, { p: P.upsideChair, w: 0.6, min: 0.9 }],
    });
    kit.finish();

    Object.assign(world.env, {
      background: 0x5c5431,
      fog: new THREE.FogExp2(0x6b6238, 0.04 + world.depth * 0.004),
      exposure: 1.15,
      postfx: { bloom: 0.3, bloomThreshold: 0.9, grain: 0.06, vignette: 0.4, chroma: 0.0018, scan: 0.03, tint: [1.03, 1, 0.9] },
      ao: 1,
      envIntensity: 0.45,
      ambience: 'hum',
      reverb: [1.1, 4],
    });
    world.surfaceFn = () => 'carpet';

    // resident
    const d = world.distFromSpawn;
    const spots = [];
    for (let j = 1; j < W - 1; j++) {
      for (let i = 1; i < W - 1; i++) {
        const k = d[j * W + i];
        if (k < 5 || k > 12 || g.heightOf(i, j) !== 0) continue;
        if (g.get(i, j - 1) === WALL && g.standable(i, j + 1)) spots.push([i, j]);
      }
    }
    if (spots.length) {
      const [i, j] = rng.pick(spots);
      const c = g.center(i, j);
      const model = drifterModel();
      model.position.set(c.x, 0, j * cs + 0.35);
      world.add(new NPC(world, {
        name: 'the Drifter',
        pos: model.position.clone(),
        model,
        voice: 0.8,
        face: false,
        conversations: [
          [
            '...Huh. Someone who still has their wits about them.',
            'This is Level 0. Walk as far as you like, it is the same yellow room the whole way.',
            'There are doors that hum. Walk through one and you end up somewhere else. So do the holes in the floor, only faster.',
          ],
          [
            'The further you wander from where you woke up, the worse it gets. More junk. Fewer lights.',
            'And the tall one stands at the ends of hallways. It never comes closer. I think it just wants to be seen.',
          ],
          ['I will rest here a while. ...Lost count of the days, honestly.'],
        ],
      }));
    }

    // a phone ringing somewhere far away
    if (!world.attract) {
      const [cell] = world.pickFarCells(1, { minFrac: 0.5, filter: (i, j) => g.get(i, j) === FLOOR && !g.ramp[j * W + i] });
      if (cell) {
        const c = g.center(...cell);
        const model = phoneModel();
        model.position.set(c.x, g.heightOf(...cell), c.z);
        const phone = new NPC(world, {
          name: 'the phone',
          pos: model.position.clone(),
          model,
          radius: 0,
          face: false,
          marker: false,
          prompt: 'Pick up the phone',
          conversations: [
            ['(static)', '...hello? Is someone there? I can hear you breathing.', 'Don’t go down the stairs. Every time I go down, the rooms get— (the line goes dead)'],
            ['(only a dial tone)'],
          ],
        });
        phone.aimHeight = 0.1;
        let ring = 3;
        phone.idle = (dt, ctx) => {
          if (phone.talkIndex > 0 || ctx.attract) return;
          ring -= dt;
          const dd = ctx.player.pos.distanceTo(model.position);
          if (ring <= 0 && dd < 22) {
            ring = 4;
            if (!phone.panner && ctx.game.audio.ready) phone.panner = ctx.game.audio.panner(model.position.x, model.position.y, model.position.z, { ref: 2, rolloff: 1 });
            if (phone.panner) ctx.game.audio.phoneRing(phone.panner);
          }
        };
        world.add(phone);
      }
      world.add(new Watcher(world, { look: {} }));
      if (world.depth >= 1) world.add(new Follower(world));
    }
  },

  makeDoor(world, dest) {
    return doorModel({
      doorColor: 0x55614f,
      frameColor: 0x3c3a30,
      lightColor: dest.tint || 0xffffff,
      extras(group) {
        const signMat = new THREE.MeshBasicMaterial({ map: exitSign() });
        signMat.color.setScalar(1.6);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.225), signMat);
        sign.position.set(0, 2.38, 0.05);
        group.add(sign);
        const g = glow(0x7dffb0, 1.4, 0.35);
        g.position.set(0, 2.38, 0.2);
        group.add(g);
      },
    });
  },
};
