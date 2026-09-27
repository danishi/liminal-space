import * as THREE from 'three';
import { Grid, FLOOR, WALL } from '../core/grid.js';
import { subwayTiles, terrazzo, tactile, paint, pbr } from '../core/surfaces.js';
import { mesh, buildShell, ceilingFixtures, doorModel, decorate } from './common.js';
import { buildCellQuads, worldPlane } from '../core/grid.js';
import { PropKit, keep } from '../props/kit.js';
import { photo } from '../core/assets.js';
import * as P from '../props/library.js';
import { signTexture } from '../props/canvas.js';
import { Watcher, Follower, Peeker, StrayCat } from '../entities/creatures.js';
import { LOOKS } from '../entities/looks.js';
import { idlePose, lookAt } from '../entities/figures.js';
import { NPC, strayNPC } from '../entities/npc.js';

const H = 2.9;
const PLAT = -4; // platform level
const TRACK = -5.3; // track bed

function attendantModel() {
  return LOOKS.attendant();
}

/** Hanging bilingual sign (black with yellow text, like subway signage). */
function hangingSign(kit, text, sub, arrow) {
  const g = new THREE.Group();
  const tex = signTexture(text, sub, { bg: '#16181a', fg: '#f5c400', w: 512, h: 128, arrow });
  const face = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.3 });
  kit.box(g, 1.6, 0.42, 0.08, kit.std(0x2a2c2e, 0.4, 0.6), 0, -0.45, 0);
  keep(kit.plane(g, 1.54, 0.38, face, 0, -0.45, 0.041));
  keep(kit.plane(g, 1.54, 0.38, face, 0, -0.45, -0.041, 0, Math.PI, 0));
  for (const x of [-0.6, 0.6]) kit.cyl(g, 0.01, 0.01, 0.24, kit.std(0x777777, 0.3, 0.9), x, -0.12, 0);
  return g;
}

const pillar = {
  place: 'floor', fp: [0.8, 0.8],
  build(k, rng, o) {
    const g = new THREE.Group();
    const tile = k.mat('pillarTile', () => pbr(subwayTiles([40, 120, 70]), { normalScale: 0.6 }));
    k.box(g, 0.8, H, 0.8, tile, 0, H / 2, 0);
    for (let s = 0; s < 4; s++) {
      if (!rng.chance(0.6)) continue;
      const ad = P.pillarAd.build(k, rng, o);
      const a = (s * Math.PI) / 2;
      ad.position.set(Math.sin(a) * 0.4, 1.4, Math.cos(a) * 0.4);
      ad.rotation.y = a;
      ad.scale.setScalar(0.95);
      g.add(ad);
    }
    return g;
  },
};

export default {
  id: 'station',
  code: 'LEVEL 8',
  name: 'Last-Train Underpass',
  sub: '終電後の地下通路 · A station in Japan after the last train',
  tint: 0xe8fff0,
  assets: {
    textures: ['long_white_tiles', 'concrete_floor_02', 'gravel'],
    models: ['korean_public_payphone_01', 'security_camera_01', 'utility_box_01', 'trashbag', 'vintage_suitcase', 'metal_trash_can', 'WetFloorSign_01'],
    looks: ['attendant', ['watcher', { body: 0x16171a, suit: true, height: 2.2 }]],
  },

  build(world) {
    const rng = world.rng;
    const W = 48;
    const HH = 32;
    const cs = 2.4;
    const g = (world.grid = new Grid(W, HH, cs, WALL));
    // concourse
    g.fillRect(2, 3, W - 3, 5, FLOOR);
    g.fillRect(2, 12, W - 3, 14, FLOOR);
    for (const c of [3, 21, 40]) g.fillRect(c, 3, c + 2, 14, FLOOR);
    g.fillRect(25, 6, 36, 11, FLOOR);
    // side passages and dead ends ("this way to the exit")
    for (let n = 0; n < 4; n++) {
      const j = rng.pick([3, 4, 5, 12, 13, 14]);
      const i = rng.int(7, W - 9);
      const dir = j < 8 ? -1 : 1;
      if (dir === -1) continue;
      const len = rng.int(2, 3);
      for (let k = 1; k <= len; k++) if (j + k < 17) g.set(i, j + k, FLOOR);
    }
    // stairwells down to the platform
    const wells = [rng.int(7, 12), rng.int(30, 37)];
    for (const c of wells) {
      for (let j = 15; j <= 18; j++) {
        for (const i of [c, c + 1]) {
          g.set(i, j, FLOOR);
          g.setRamp(i, j, 3, -(j - 14), 1.0);
        }
      }
      g.fillRect(c, 19, c + 1, 20, FLOOR);
      g.heightRect(c, 19, c + 1, 20, PLAT);
    }
    // platform
    g.fillRect(2, 21, W - 3, 25, FLOOR);
    g.heightRect(2, 21, W - 3, 25, PLAT);

    const si = 4;
    const sj = 4;
    const sp = g.center(si, sj);
    world.spawn = { x: sp.x, z: sp.z, yaw: -Math.PI / 2 };
    world.finalizeLayout();
    // the track bed is a drop you can't climb back out of, so it's carved after sealing
    g.fillRect(2, 26, W - 3, 28, FLOOR);
    g.heightRect(2, 26, W - 3, 28, TRACK);

    const lineColor = rng.pick([[40, 120, 70], [200, 60, 40], [240, 160, 30], [40, 90, 180]]);
    // white glazed wall tiles (uvScale below the UV scale enlarges them) with a band in the line colour;
    // polished terrazzo floor
    const wallMat = photo('long_white_tiles', { uvScale: 1.4, roughness: 0.35, color: new THREE.Color(1.08, 1.08, 1.06) });
    const bandMat = photo('long_white_tiles', { uvScale: 1.2, roughness: 0.5, color: new THREE.Color(lineColor[0] / 160, lineColor[1] / 160, lineColor[2] / 160) });
    const floorMat = pbr(terrazzo(), { normalScale: 0.4 });
    const concreteMat = photo('concrete_floor_02', { uvScale: 2, color: 0xb8b6b0 });
    const ceilMat = pbr(paint('s-station-ceil', [196, 198, 196], { rough: 0.6 }));
    buildShell(world, {
      height: H,
      ceil: (i, j) => (j >= 19 ? PLAT + 4.6 : g.heightOf(i, j) + (g.ramp[j * W + i] ? g.rise[j * W + i] : 0) + H),
      wall: { mat: wallMat, u: 2.4, v: 2.4 },
      floor: { mat: floorMat, uv: 3 },
      floorPred: (c, i, j) => j < 26,
      ceilMat: { mat: ceilMat, uv: 2 },
      stairs: concreteMat,
      riserMat: concreteMat,
      trims: [{ mat: bandMat, y0: 1.25, y1: 1.5, inset: 0.01, u: 1.2, v: 1.2 }],
    });
    // track bed: ballast and rails
    mesh(world, buildCellQuads(g, (c, i, j) => j >= 26 && j <= 28 && c === FLOOR, TRACK, true, 3), photo('gravel', { uvScale: 3, color: 0x9a948a }));
    const kit = new PropKit(world);
    const steel = kit.std(0x8a8a88, 0.25, 0.95);
    const sleeper = kit.std(0x4a4640, 0.9);
    const railRun = new THREE.Group();
    const x0 = 2 * cs;
    const x1 = (W - 2) * cs;
    const zc = 27.5 * cs;
    for (const off of [-0.72, 0.72]) kit.box(railRun, x1 - x0, 0.14, 0.08, steel, (x0 + x1) / 2, 0.07, zc + off);
    for (let x = x0 + 0.3; x < x1; x += 0.7) kit.box(railRun, 0.24, 0.1, 2.3, sleeper, x, 0.03, zc);
    kit.add(railRun, 0, 0, 0, { y: TRACK });
    // platform edge: tactile strip and a yellow warning line
    mesh(world, worldPlane(2 * cs, 26 * cs - 0.95, (W - 2) * cs, 26 * cs - 0.35, PLAT + 0.006, true, 0.6), pbr(tactile('dots')));
    mesh(world, worldPlane(2 * cs, 26 * cs - 0.3, (W - 2) * cs, 26 * cs - 0.2, PLAT + 0.006, true, 1), new THREE.MeshStandardMaterial({ color: 0xe8c020, roughness: 0.6 }));
    // hanging signs at junctions
    const signs = [
      ['出口', 'Exit', '→'], ['改札', 'Ticket gates', '←'], ['1番線', 'Platform 1', '↓'], ['のりかえ', 'Transfer', '→'], ['出口 8', 'Exit 8', '↑'],
    ];
    for (const [c] of [[3], [21], [40]]) {
      for (const j of [4, 13]) {
        const [a, b, arrow] = rng.pick(signs);
        kit.add(hangingSign(kit, a, b, arrow), (c + 1.5) * cs, j * cs + cs / 2, rng.pick([0, Math.PI / 2]), { y: H });
      }
    }
    for (const c of wells) kit.add(hangingSign(kit, '1番線', 'Platform 1', '↓'), (c + 1) * cs, 14.6 * cs, 0, { y: H });
    // ticket gates across the western corridor
    for (let n = 0; n < 5; n++) kit.add(P.ticketGate.build(kit, rng), 3 * cs + 0.35 + n * 1.3, 8.5 * cs, 0, { collide: [0.3, 1.4] });
    // pillars in the hall and along the platform
    for (let i = 26; i <= 35; i += 3) for (const j of [7, 10]) kit.add(pillar.build(kit, rng, { mood: world.unease(i, j) }), (i + 0.5) * cs, (j + 0.5) * cs, 0, { collide: [0.8, 0.8] });
    for (let i = 4; i < W - 4; i += 5) {
      const u = world.unease(i, 22);
      const p = pillar.build(kit, rng, { mood: u });
      p.scale.y = (4.6 / H);
      kit.add(p, (i + 0.5) * cs, 22.6 * cs, 0, { y: PLAT, collide: [0.8, 0.8] });
    }
    decorate(world, kit, {
      density: { wall: 0.18, high: 0.16, floor: 0.02, clutter: 0.06, ceil: 0.02 },
      keepClear: (i, j) => j >= 26 || g.ramp[j * W + i] > 0 || (i >= 3 && i <= 5 && j >= 8 && j <= 9),
      wall: [
        { p: P.vendingMachine, w: 3 }, { p: P.bench, w: 2 }, { p: P.trashBins, w: 1.5, o: { station: true } }, { p: P.ticketMachine, w: 1 },
        { p: P.modelProp('utility_box_01'), w: 1 }, { p: P.modelProp('metal_trash_can', { scale: 0.85 }), w: 1 },
        { p: P.lockers, w: 1, o: { color: 0xd4d4cc } }, { p: P.hydrantBox, w: 0.8 },
      ],
      high: [
        { p: P.stationMap, w: 1 }, { p: P.pillarAd, w: 2 }, { p: P.modelProp('security_camera_01', { place: 'high', y: 2.35, collide: false }), w: 1.2 },
        { p: P.modelProp('korean_public_payphone_01', { place: 'high', y: 0.9, collide: false }), w: 1.2 }, { p: P.poster, w: 1 }, { p: P.wallClock, w: 0.6 },
      ],
      floor: [{ p: P.modelProp('WetFloorSign_01', { jitter: 3 }), w: 1 }],
      clutter: [
        { p: P.umbrella, w: 1 }, { p: P.lostShoe, w: 1, min: 0.3 }, { p: P.puddle, w: 1.5, min: 0.35 }, { p: P.paperScatter, w: 1 }, { p: P.bottles, w: 1 },
        { p: P.modelProp('trashbag', { jitter: 3 }), w: 1, min: 0.25 }, { p: P.modelProp('vintage_suitcase', { jitter: 3, scale: 0.8 }), w: 0.8, min: 0.4 },
      ],
      ceil: [{ p: P.hangingWires, w: 1, min: 0.6 }],
    });
    kit.finish();

    world.root.add(new THREE.HemisphereLight(0xe8f0ea, 0x3a3a38, 0.35));
    ceilingFixtures(world, {
      type: 'rect', every: 2, offset: 1, size: [2.0, 0.22], color: 0xeefff4, panelColor: [2.0, 2.1, 2.0], intensity: 16,
      flicker: 0.05, dead: 0.04, filter: (c, i, j) => !g.ramp[j * W + i] && j < 26,
      housing: new THREE.MeshStandardMaterial({ color: 0xcfd2d0, roughness: 0.4, metalness: 0.3 }),
    });

    Object.assign(world.env, {
      background: 0x1a1c1c,
      fog: new THREE.FogExp2(0x2a2e2c, 0.035 + world.depth * 0.004),
      exposure: 1.1,
      postfx: { bloom: 0.35, bloomThreshold: 0.85, grain: 0.06, vignette: 0.38, chroma: 0.0016, scan: 0.03, tint: [0.97, 1.02, 1.0] },
      ao: 1,
      envIntensity: 0.85,
      ambience: 'station',
      reverb: [2.6, 2.6],
    });
    world.surfaceFn = (x, z) => (world.floorAt(x, z) < TRACK + 0.5 ? 'gravel' : 'stone');

    // jumping down onto the tracks: a train comes, and you are somewhere else
    let onTrack = 0;
    world.onUpdate = (dt, ctx) => {
      if (ctx.attract) return;
      if (ctx.player.pos.y < TRACK + 0.3) {
        onTrack += dt;
        if (onTrack > 0.1 && onTrack - dt <= 0.1) {
          ctx.game.audio.trainRumble();
          ctx.game.toast('A light is coming down the tunnel', null, 'danger');
        }
        ctx.game.flash = Math.min(0.6, onTrack * 0.15);
        if (onTrack > 3.5) ctx.game.drift(null, 'fall');
      } else onTrack = 0;
    };

    // resident: the station attendant by the gates
    const model = attendantModel();
    model.position.set(5.2 * cs, 0, 10.5 * cs);
    const attendant = world.add(new NPC(world, {
      name: 'the station attendant',
      pos: model.position.clone(),
      model,
      voice: 0.95,
      radius: 0.35,
      conversations: [
        ['Good evening. I’m afraid the last train has already left.', 'Or it hasn’t arrived yet. The timetable stopped making sense a while ago.', 'Please stay behind the yellow line. People who go onto the tracks don’t come back up the stairs.'],
        ['The exits are signposted. Exit 8 is a popular one.', 'Nobody has ever reached it, but it’s popular.'],
        ['Thank you for riding with us.'],
      ],
    }));
    // a proper bow when you come up to the gates, and another when you leave
    let bow = 0;
    let wasNear = false;
    const eye = new THREE.Vector3();
    attendant.idle = (dt, ctx) => {
      const rig = model.userData.rig;
      const near = ctx.player.pos.distanceTo(model.position) < 3;
      if (near !== wasNear && !ctx.attract) bow = 0.001;
      wasNear = near;
      idlePose(rig, attendant.t, { sway: 0.3 });
      rig.rot('armL', 0.05, 0, 0.02);
      rig.rot('armR', 0.05, 0, -0.02);
      rig.rot('foreL', -0.25, 0.4, 0);
      rig.rot('foreR', -0.25, -0.4, 0);
      if (bow) {
        bow += dt * 0.7;
        const b = Math.sin(Math.min(1, bow) * Math.PI);
        rig.blend({ spine: [0.3, 0, 0], chest: [0.35, 0, 0], neck: [0.15, 0, 0], head: [0.1, 0, 0] }, b);
        if (bow >= 1) bow = 0;
      } else lookAt(model, eye.copy(ctx.camera.position), { max: 0.8 });
    };

    if (!world.attract) {
      world.add(new Watcher(world, { look: { body: 0x16171a, suit: true, height: 2.2 }, speed: 1.4 }));
      if (world.depth >= 1) world.add(new Follower(world));
      if (world.depth >= 1) world.add(new Peeker(world, { look: { body: 0x16171a, suit: true } }));
      if (rng.chance(0.3)) world.add(new StrayCat(world));
    }
  },

  // what leaks through when this level bleeds into another (see game/bleed.js)
  bleed: {
    ambience: 'station',
    looks: ['attendant'],
    surfaces: () => ({
      wall: { mat: photo('long_white_tiles', { uvScale: 1.4, roughness: 0.35, color: new THREE.Color(1.08, 1.08, 1.06) }), uv: 2.4 },
      floor: { mat: pbr(terrazzo(), { normalScale: 0.4 }), uv: 3 },
      ceil: { mat: pbr(paint('s-station-ceil', [196, 198, 196], { rough: 0.6 })), uv: 2 },
    }),
    props: {
      wall: [{ p: P.vendingMachine, w: 2 }, { p: P.bench, w: 2 }, { p: P.ticketMachine, w: 1 }],
      high: [{ p: P.stationMap, w: 1 }, { p: P.cctv, w: 1 }],
      clutter: [{ p: P.umbrella, w: 1 }, { p: P.lostShoe, w: 1 }],
    },
    stray: (world, pos) => strayNPC(world, pos, {
      name: 'the station attendant',
      model: LOOKS.attendant(),
      voice: 0.95,
      lines: [
        ['Excuse me. Is this the platform for...', 'No. No, it isn’t.'],
        ['The timetable says the train comes through here.', 'The timetable is often wrong. I wrote it.'],
      ],
    }),
  },

  makeDoor(world, dest) {
    return doorModel({
      width: 0.95,
      height: 2.1,
      doorColor: 0x8c9290,
      frameColor: 0x5a5e5c,
      lightColor: dest.tint || 0xeefff4,
      knob: 0xcfcfcf,
      extras(group) {
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22), new THREE.MeshBasicMaterial({ map: signTexture('関係者以外立入禁止', 'STAFF ONLY', { bg: '#ffffff', fg: '#c01818', w: 512, h: 128 }) }));
        plate.position.set(0, 2.36, 0.08);
        group.add(plate);
      },
    });
  },
};
