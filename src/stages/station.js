import * as THREE from 'three';
import { Grid, FLOOR, WALL } from '../core/grid.js';
import { subwayTiles, terrazzo, concrete, tactile, paint, pbr } from '../core/surfaces.js';
import { mesh, buildShell, ceilingFixtures, doorModel, decorate } from './common.js';
import { buildCellQuads, worldPlane } from '../core/grid.js';
import { PropKit, keep } from '../props/kit.js';
import * as P from '../props/library.js';
import { signTexture } from '../props/canvas.js';
import { Watcher, Follower } from '../entities/creatures.js';
import { NPC, mat } from '../entities/npc.js';

const H = 2.9;
const PLAT = -4; // platform level
const TRACK = -5.3; // track bed

function attendantModel() {
  const g = new THREE.Group();
  const navy = mat(0x1f2a44);
  const skin = mat(0xd9b89a);
  const white = mat(0xf2f2f2);
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.85, 12), navy);
  legs.position.y = 0.43;
  g.add(legs);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.45, 4, 10), navy);
  body.position.y = 1.15;
  g.add(body);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.08, 12), white);
  collar.position.y = 1.44;
  g.add(collar);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), skin);
  head.position.y = 1.6;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.13, 0.08, 16), navy);
  cap.position.y = 1.72;
  g.add(cap);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.015, 0.12), mat(0x111111, { roughness: 0.2 }));
  brim.position.set(0, 1.69, 0.12);
  g.add(brim);
  for (const x of [-0.24, 0.24]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.45, 4, 8), navy);
    arm.position.set(x, 1.1, 0);
    g.add(arm);
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), white);
    glove.position.set(x, 0.8, 0);
    g.add(glove);
  }
  return g;
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
    const wallMat = pbr(subwayTiles(lineColor), { normalScale: 0.6 });
    const floorMat = pbr(terrazzo(), { normalScale: 0.4 });
    const concreteMat = pbr(concrete('s-station-concrete', [110, 108, 104]));
    const ceilMat = pbr(paint('s-station-ceil', [196, 198, 196], { rough: 0.6 }));
    buildShell(world, {
      height: H,
      ceil: (i, j) => (j >= 19 ? PLAT + 4.6 : g.heightOf(i, j) + (g.ramp[j * W + i] ? g.rise[j * W + i] : 0) + H),
      wall: { mat: wallMat, u: 2.4, v: 2.4 },
      floor: { mat: floorMat, uv: 3 },
      floorPred: (c, i, j) => j < 26,
      ceilMat: { mat: ceilMat, uv: 2 },
      stairs: pbr(paint('s-station-stairs', [150, 150, 146], { rough: 0.5 })),
      riserMat: concreteMat,
    });
    // track bed: ballast and rails
    mesh(world, buildCellQuads(g, (c, i, j) => j >= 26 && j <= 28 && c === FLOOR, TRACK, true, 3), pbr(concrete('s-ballast', [70, 66, 60])));
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
        { p: P.lockers, w: 1, o: { color: 0xd4d4cc } }, { p: P.hydrantBox, w: 0.8 },
      ],
      high: [{ p: P.stationMap, w: 1 }, { p: P.pillarAd, w: 2 }, { p: P.cctv, w: 1.2 }, { p: P.poster, w: 1 }, { p: P.wallClock, w: 0.6 }],
      clutter: [{ p: P.umbrella, w: 1 }, { p: P.lostShoe, w: 1, min: 0.3 }, { p: P.puddle, w: 1.5, min: 0.35 }, { p: P.paperScatter, w: 1 }, { p: P.bottles, w: 1 }],
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
    world.add(new NPC(world, {
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

    if (!world.attract) {
      world.add(new Watcher(world, { look: { body: 0x16171a, suit: true, height: 2.2 }, speed: 1.4 }));
      if (world.depth >= 1) world.add(new Follower(world));
    }
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
