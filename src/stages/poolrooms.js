import * as THREE from 'three';
import { Grid, FLOOR, WALL, WATER, DOORWAY, HOLE, buildWallFaces, buildCellQuads, buildFloors } from '../core/grid.js';
import { waterNormalMap } from '../core/surfaces.js';
import { caustics, labelTexture } from '../core/textures.js';
import { mesh, buildShell, ceilingFixtures, doorModel, decorate } from './common.js';
import { PropKit } from '../props/kit.js';
import { photo, model } from '../core/assets.js';
import * as P from '../props/library.js';
import { NPC } from '../entities/npc.js';
import { Watcher, Peeker, StrayCat, Mannequin } from '../entities/creatures.js';

const H = 4.2;
const LINTEL = 2.9;
const POOL = -0.55;
const WATER_Y = -0.12;

function duckModel(scale = 1) {
  // the scanned rubber duck is 0.29 m tall; scale 1 ≈ a real bath duck
  const g = new THREE.Group();
  const m = model('rubber_duck_toy');
  m.scale.setScalar(scale * 1.6);
  g.add(m);
  return g;
}

export default {
  id: 'poolrooms',
  code: 'LEVEL 37',
  name: 'The Poolrooms',
  sub: 'Tiles, water, echoes',
  tint: 0xd8fbff,
  assets: {
    textures: ['long_white_tiles'],
    models: ['rubber_duck_toy', 'lifebuoy', 'potted_plant_02', 'plastic_monobloc_chair_01'],
    looks: [['watcher', { body: 0x1a2426 }], ['mannequin', 1], 'cat'],
  },

  build(world) {
    const rng = world.rng;
    const RX = 5;
    const RS = 6;
    const W = RX * (RS + 1) + 1;
    const cs = 2.0;
    const g = (world.grid = new Grid(W, W, cs, WALL));
    const rooms = [];
    for (let ry = 0; ry < RX; ry++) {
      for (let rx = 0; rx < RX; rx++) {
        const i0 = 1 + rx * (RS + 1);
        const j0 = 1 + ry * (RS + 1);
        g.fillRect(i0, j0, i0 + RS - 1, j0 + RS - 1, FLOOR);
        rooms.push({ rx, ry, i0, j0, h: 0 });
      }
    }
    const idx = (rx, ry) => ry * RX + rx;
    const spawnRoom = rooms[idx(2, 2)];
    // some rooms are raised decks
    for (const r of rooms) {
      if (r === spawnRoom || !rng.chance(0.3)) continue;
      r.h = rng.pick([1.1, 2.2]);
      g.heightRect(r.i0, r.j0, r.i0 + RS - 1, r.j0 + RS - 1, r.h);
    }
    // connect rooms: spanning tree + loops; stairs where heights differ
    const visited = new Set([0]);
    const stack = [rooms[0]];
    const links = [];
    while (stack.length) {
      const r = stack[stack.length - 1];
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]]
        .map(([dx, dy]) => [r.rx + dx, r.ry + dy])
        .filter(([x, y]) => x >= 0 && y >= 0 && x < RX && y < RX && !visited.has(idx(x, y)));
      if (!nb.length) {
        stack.pop();
        continue;
      }
      const [x, y] = rng.pick(nb);
      visited.add(idx(x, y));
      links.push([r, rooms[idx(x, y)]]);
      stack.push(rooms[idx(x, y)]);
    }
    for (const r of rooms) {
      if (r.rx < RX - 1 && rng.chance(0.35)) links.push([r, rooms[idx(r.rx + 1, r.ry)]]);
      if (r.ry < RX - 1 && rng.chance(0.35)) links.push([r, rooms[idx(r.rx, r.ry + 1)]]);
    }
    for (const [a, b] of links) {
      const wide = rng.int(2, 3);
      const off = rng.int(1, RS - wide - 1);
      const type = rng.chance(0.3) ? FLOOR : DOORWAY;
      const horiz = a.rx !== b.rx;
      const [lo, hi] = a.h <= b.h ? [a, b] : [b, a];
      for (let k = 0; k < wide; k++) {
        let wi;
        let wj;
        if (horiz) {
          wi = Math.max(a.i0, b.i0) - 1;
          wj = a.j0 + off + k;
        } else {
          wi = a.i0 + off + k;
          wj = Math.max(a.j0, b.j0) - 1;
        }
        g.set(wi, wj, type);
        g.setHeight(wi, wj, lo.h);
        if (hi.h > lo.h) {
          // a staircase inside the higher room, rising away from the doorway toward it
          const dir = horiz ? (hi.i0 > lo.i0 ? 0 : 1) : (hi.j0 > lo.j0 ? 2 : 3);
          const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][dir];
          const steps = hi.h - lo.h > 1.5 ? 2 : 1;
          for (let s = 0; s < steps; s++) g.setRamp(wi + dx * (s + (s === 0 ? 0 : 0)), wj + dy * s, dir, lo.h + ((hi.h - lo.h) / steps) * s, (hi.h - lo.h) / steps);
          if (steps === 2) g.set(wi + dx, wj + dy, FLOOR);
        }
      }
    }
    // pools: shallow basins, some with a deep drop in the middle
    const pools = [];
    for (const r of rooms) {
      if (r === spawnRoom || !rng.chance(0.62)) continue;
      const pw = rng.int(3, RS - 2);
      const ph = rng.int(3, RS - 2);
      const pi = r.i0 + rng.int(1, RS - pw - 1);
      const pj = r.j0 + rng.int(1, RS - ph - 1);
      for (let j = pj; j < pj + ph; j++) {
        for (let i = pi; i < pi + pw; i++) {
          if (g.ramp[j * W + i]) continue;
          g.set(i, j, WATER);
          g.setHeight(i, j, r.h + POOL);
        }
      }
      pools.push({ pi, pj, pw, ph, r });
    }
    const si = spawnRoom.i0 + (RS >> 1);
    const sj = spawnRoom.j0 + (RS >> 1);
    world.spawn = { x: (si) * cs, z: (sj) * cs, yaw: rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]) };
    world.finalizeLayout();
    const deepChance = 0.25 + world.depth * 0.1;
    const deep = new Set();
    for (const p of pools) {
      if (p.pw < 3 || p.ph < 3 || !rng.chance(deepChance)) continue;
      const i = p.pi + (p.pw >> 1);
      const j = p.pj + (p.ph >> 1);
      g.set(i, j, HOLE);
      deep.add(j * W + i);
    }

    // ---- materials
    // scanned glazed tiles; the basin is the same tile under blue water light
    // uvScale 1 on 2 m UVs doubles the tile size to read as 15 cm pool tiles
    const white = photo('long_white_tiles', { uvScale: 1, roughness: 0.45, color: new THREE.Color(1.3, 1.34, 1.32) });
    const blue = photo('long_white_tiles', { uvScale: 1, roughness: 0.4, color: new THREE.Color(0.7, 1.05, 1.15), emissive: 0x9ff4ff, emissiveMap: caustics(), emissiveIntensity: 0.3 });
    const causticMap = blue.emissiveMap;
    const murk = Math.min(1, world.depth * 0.18);
    const waterMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0x8fe3ee).lerp(new THREE.Color(0x2a4a3a), murk), transparent: true, opacity: 0.5 + murk * 0.35,
      roughness: 0.03, metalness: 0, transmission: 0, ior: 1.33, clearcoat: 1, clearcoatRoughness: 0.05,
      normalMap: waterNormalMap(), normalScale: new THREE.Vector2(0.3, 0.3), depthWrite: false,
    });
    const nMap = waterMat.normalMap;

    const isWet = (c, i, j) => c === WATER || (c === HOLE && deep.has(j * W + i));
    const ceilArr = new Float32Array(W * W).fill(H);
    for (const r of rooms) {
      for (let j = r.j0 - 1; j <= r.j0 + RS; j++) for (let i = r.i0 - 1; i <= r.i0 + RS; i++) ceilArr[j * W + i] = Math.max(ceilArr[j * W + i], r.h + H);
    }
    const surface = (i, j) => g.hgt[j * W + i] - POOL + WATER_Y;
    buildShell(world, {
      height: H,
      ceil: (i, j) => ceilArr[j * W + i],
      wall: { mat: white, u: 2, v: 2 },
      floor: { mat: white, uv: 2 },
      floorPred: (c) => c !== WATER,
      ceilMat: { mat: white, uv: 2 },
      stairs: white,
      riserMat: white,
      pit: new THREE.MeshBasicMaterial({ color: 0x06222a }),
    });
    mesh(world, buildFloors(g, (c) => c === WATER, 2), blue);
    // lintels over doorways
    mesh(world, buildWallFaces(g, { y0: (i, j) => g.heightOf(i, j) + LINTEL, y1: (i, j) => world.ceilAt(i, j), uScale: 2, vScale: 2, solid: (c) => c === DOORWAY, open: (c) => c === FLOOR || c === WATER }), white);
    mesh(world, buildCellQuads(g, (c) => c === DOORWAY, (i, j) => g.heightOf(i, j) + LINTEL, false, 2), white);
    const water = mesh(world, buildCellQuads(g, isWet, surface, true, 4), waterMat);
    water.renderOrder = 2;

    world.root.add(new THREE.HemisphereLight(0xf4ffff, 0xb8d8da, 0.75 - murk * 0.4));
    ceilingFixtures(world, {
      type: 'rect', every: 3, offset: 2, size: [1.6, 1.6], color: 0xf2ffff, panelColor: [2.2, 2.3, 2.3],
      intensity: 11, distance: 14, flicker: 0, dead: 0.02,
    });

    const kit = new PropKit(world);
    decorate(world, kit, {
      density: { wall: 0.12, high: 0.04, floor: 0.05, clutter: 0.08, ceil: 0 },
      waterSurface: surface,
      wall: [
        { p: P.towelStack, w: 2 }, { p: P.modelProp('potted_plant_02'), w: 2.5 }, { p: P.pottedPalm, w: 1 }, { p: P.bench, w: 1 },
        { p: P.lockers, w: 1.2, o: { color: 0x7fb8c8 } }, { p: P.modelProp('plastic_monobloc_chair_01', { jitter: 0.3 }), w: 1.5 },
        { p: P.fakeDoor, w: 0.8, min: 0.6 },
      ],
      high: [{ p: P.modelProp('lifebuoy', { place: 'high', y: 1.5, collide: false }), w: 2 }, { p: P.wallClock, w: 1 }, { p: P.handprints, w: 1, min: 0.8 }],
      floor: [{ p: P.lounger, w: 3 }, { p: P.lifeguardChair, w: 1 }, { p: P.modelProp('plastic_monobloc_chair_01', { jitter: 3 }), w: 1.5 }],
      clutter: [{ p: P.drainGrate, w: 2 }, { p: P.beachBall, w: 1.5, floats: true }, { p: P.puddle, w: 1 }],
    });
    kit.finish();

    Object.assign(world.env, {
      background: 0xd9eff0,
      fog: new THREE.FogExp2(new THREE.Color(0xcfe6e7).lerp(new THREE.Color(0x5a6a68), murk), 0.022 + murk * 0.02),
      exposure: 0.92,
      toneMapping: THREE.NeutralToneMapping,
      postfx: { bloom: 0.3, bloomThreshold: 0.92, bloomRadius: 0.55, grain: 0.035, vignette: 0.22, chroma: 0.0012, scan: 0.02, tint: [0.97, 1.02, 1.03] },
      ao: 0.8,
      envIntensity: 0.8,
      ambience: 'pool',
      reverb: [3.6, 2.2],
      bake: { fixtureScale: 0.22, bounce: 0.45, hemi: 0.45, dynamic: 0.45 },
    });
    world.speedFn = (x, z) => (world.isWater(x, z) ? 0.62 : 1);
    world.surfaceFn = (x, z) => (world.isWater(x, z) ? 'water' : 'tile');

    let t = 0;
    world.onUpdate = (dt) => {
      t += dt;
      nMap.offset.set(t * 0.02, t * 0.013);
      causticMap.offset.set(Math.sin(t * 0.2) * 0.1 + t * 0.01, t * 0.015);
    };

    // residents: a big floating duck, and little ducks that squeak
    const bigPool = pools.filter((p) => p.pw >= 3 && p.ph >= 3).sort((a, b) => Math.abs(a.r.rx - 2) + Math.abs(a.r.ry - 2) - (Math.abs(b.r.rx - 2) + Math.abs(b.r.ry - 2)))[0];
    if (bigPool) {
      const cx = (bigPool.pi + bigPool.pw / 2) * cs;
      const cz = (bigPool.pj + bigPool.ph / 2) * cs;
      const base = bigPool.r.h + WATER_Y - 0.08;
      const model = duckModel(3.2);
      model.position.set(cx + cs * 0.5, base, cz);
      const duck = new NPC(world, {
        name: 'the Big Duck',
        pos: model.position.clone(),
        model,
        voice: 1.6,
        radius: 1.0,
        conversations: [
          ['Bob... bob...', 'Welcome to the water rooms. Quiet, bright, and always the same afternoon.', 'Mind the deep ends. Sink into one and you come up somewhere else entirely.'],
          ['Nothing scary lives here. ...Probably.', 'Stay too long, though, and you stop wanting to leave. Maybe that is the scariest part.'],
          ['Bob.'],
        ],
        onTalk: (game) => game.audio.squeak(),
      });
      duck.idle = () => {
        duck.object.position.y = base + Math.sin(duck.t * 1.3) * 0.05;
        duck.object.rotation.z = Math.sin(duck.t * 0.9) * 0.05;
      };
      world.add(duck);
    }
    for (const p of pools.slice(0, 7)) {
      const model = duckModel(0.62);
      const x = (p.pi + rng.float(0.3, p.pw - 0.3)) * cs;
      const z = (p.pj + rng.float(0.3, p.ph - 0.3)) * cs;
      const baseY = p.r.h + WATER_Y - 0.06;
      model.position.set(x, baseY, z);
      model.rotation.y = rng.float(0, Math.PI * 2);
      const little = new NPC(world, { name: 'a duck', pos: model.position.clone(), model, radius: 0, face: false, marker: false, prompt: 'Poke the duck', conversations: [[]] });
      little.interactRange = 2.2;
      little.aimHeight = 0.1;
      little.interact = (game) => {
        game.audio.squeak();
        little.hop = 1;
      };
      little.hop = 0;
      little.idle = (dt) => {
        little.hop = Math.max(0, little.hop - dt * 2.5);
        model.position.y = baseY + Math.sin(little.t * 1.7) * 0.02 + Math.sin(little.hop * Math.PI) * 0.25;
        model.rotation.y += dt * 0.1;
      };
      world.add(little);
    }
    if (!world.attract && world.depth >= 2) world.add(new Watcher(world, { look: { body: 0x1a2426 } }));
    if (!world.attract) {
      if (world.depth >= 1) world.add(new Peeker(world, { look: { body: 0x1a2426 } }));
      if (rng.chance(0.3)) world.add(new StrayCat(world));
      // someone left a mannequin sunbathing; it changes position when you're not looking
      const dry = world.pickFarCells(1, { minFrac: 0.25, spacing: 4, filter: (i, j) => g.get(i, j) === FLOOR && !g.ramp[j * W + i] && g.countSolidNeighbors(i, j) === 0 })[0];
      if (dry) {
        const c = g.center(...dry);
        world.add(new Mannequin(world, { pos: new THREE.Vector3(c.x, g.heightOf(...dry), c.z), yaw: rng.float(0, 6.28), variant: 1, mode: world.depth >= 2 ? 'mixed' : 'funny', moves: world.depth >= 1, pose: 'flex' }));
      }
    }
  },

  // what leaks through when this level bleeds into another (see game/bleed.js)
  bleed: {
    ambience: 'pool',
    surfaces: () => {
      const white = photo('long_white_tiles', { uvScale: 1, roughness: 0.45, color: new THREE.Color(1.3, 1.34, 1.32) });
      return { wall: { mat: white, uv: 2 }, floor: { mat: white, uv: 2 }, ceil: { mat: white, uv: 2 } };
    },
    props: {
      wall: [{ p: P.lounger, w: 2 }, { p: P.towelStack, w: 1 }, { p: P.lifeguardChair, w: 0.5 }],
      floor: [{ p: P.lounger, w: 1 }, { p: P.pottedPalm, w: 1 }],
      clutter: [{ p: P.beachBall, w: 1 }, { p: P.puddle, w: 3 }, { p: P.drainGrate, w: 1 }],
    },
    stray: (world, pos) => {
      const model = duckModel(0.62);
      const duck = new NPC(world, { name: 'a duck', pos, model, radius: 0, face: false, marker: false, prompt: 'Poke the duck', conversations: [['(A rubber duck, a very long way from any water. It looks betrayed.)'], ['(Squeak.)']], onTalk: (game) => game.audio.squeak() });
      duck.aimHeight = 0.1;
      duck.idle = () => (model.rotation.y = Math.sin(duck.t * 0.4) * 0.6);
      return duck;
    },
  },

  makeDoor(world, dest) {
    return doorModel({
      width: 1.1,
      height: 2.3,
      doorColor: 0xf3f6f4,
      frameColor: 0xc9d6d7,
      lightColor: dest.tint || 0xfff6dc,
      knob: 0x9aa5a6,
      extras(group) {
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.14), new THREE.MeshBasicMaterial({ map: labelTexture('OUT', { w: 256, h: 72, bg: '#1f6f7c', fg: '#e9fbff', font: '44px "DotGothic16", monospace' }) }));
        plate.position.set(0, 2.55, 0.03);
        group.add(plate);
      },
    });
  },
};
