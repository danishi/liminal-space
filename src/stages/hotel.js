import * as THREE from 'three';
import { Grid, FLOOR, WALL, HOLE, DIRS, wallMounts } from '../core/grid.js';
import { carpetHotel, wallpaperDamask, paint, pbr } from '../core/surfaces.js';
import { hotelDoor, labelTexture } from '../core/textures.js';
import { buildShell, carveMaze, glow, decorate } from './common.js';
import { LightPool } from '../core/lights.js';
import { PropKit } from '../props/kit.js';
import { photo, model } from '../core/assets.js';
import * as P from '../props/library.js';
import { Watcher, Grin, Peeker, Mannequin, StrayCat } from '../entities/creatures.js';
import { LOOKS } from '../entities/looks.js';
import { setFigureOpacity, idlePose, lookAt } from '../entities/figures.js';
import { NPC } from '../entities/npc.js';

const H = 2.7;

const M = {
  nightstand: {
    place: 'wall', fp: [0.57, 0.42],
    build(k, rng) {
      const g = new THREE.Group();
      k.model(g, 'ClassicNightstand_01');
      k.model(g, 'antique_ceramic_vase_01', rng.float(-0.1, 0.1), 0.7, 0, rng.float(0, 6), 0.8);
      return g;
    },
  },
};

function bellboyModel() {
  const fig = LOOKS.bellboy();
  setFigureOpacity(fig, 0.85);
  const g = new THREE.Group();
  g.add(fig);
  const halo = glow(0x8fa6ff, 2.4, 0.2);
  halo.position.y = 1.1;
  g.add(halo);
  g.userData = fig.userData;
  g.userData.fig = fig;
  return g;
}

function sconce(kit) {
  const g = new THREE.Group();
  const brass = kit.std(0x8a6a2e, 0.35, 0.8);
  kit.box(g, 0.12, 0.22, 0.03, brass, 0, 0, 0.015);
  kit.cyl(g, 0.012, 0.012, 0.16, brass, 0, 0, 0.08, Math.PI / 2);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.16, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xf2d9a6, emissive: 0xffb45a, emissiveIntensity: 1.4, side: THREE.DoubleSide, roughness: 0.9 }));
  shade.position.set(0, 0.08, 0.16);
  shade.userData.keep = true;
  g.add(shade);
  g.userData.shade = shade;
  return g;
}

function elevatorFrame(kit, open = true) {
  const g = new THREE.Group();
  const brass = kit.std(0x9b7a3a, 0.3, 0.85);
  const steel = kit.std(0x9aa0a6, 0.35, 0.9);
  const W = 1.3;
  const HH = 2.2;
  kit.box(g, 0.12, HH + 0.12, 0.1, brass, -W / 2 - 0.06, (HH + 0.12) / 2, 0.05);
  kit.box(g, 0.12, HH + 0.12, 0.1, brass, W / 2 + 0.06, (HH + 0.12) / 2, 0.05);
  kit.box(g, W + 0.24, 0.12, 0.1, brass, 0, HH + 0.06, 0.05);
  for (const s of [-1, 1]) kit.box(g, W / 2, HH, 0.04, steel, s * (W / 4 + (open ? W / 2 - 0.05 : 0)), HH / 2, 0.02);
  kit.plane(g, 0.4, 0.15, kit.tex('elevInd', labelTexture('— —', { w: 128, h: 48, bg: '#1a0e05', fg: '#ff6a30', font: '30px "DotGothic16", monospace' })), 0, HH + 0.3, 0.06);
  return g;
}

export default {
  id: 'hotel',
  code: 'LEVEL 11',
  name: 'The Night Hotel',
  sub: 'Red carpet, no guests',
  tint: 0xffc080,
  assets: {
    textures: ['dark_paneled_wood', 'decrepit_wallpaper', 'dirty_carpet', 'ceiling_interior'],
    models: ['ArmChair_01', 'Sofa_01', 'CoffeeCart_01', 'Chandelier_02', 'ClassicNightstand_01', 'fancy_picture_frame_01', 'ornate_mirror_01', 'vintage_grandfather_clock_01', 'antique_ceramic_vase_01', 'vintage_suitcase'],
    looks: ['bellboy', ['watcher', { hat: true, body: 0x0a0808 }], 'grin', ['mannequin', 2]],
  },

  build(world) {
    const rng = world.rng;
    const W = 29;
    const cs = 2.6;
    const g = (world.grid = new Grid(W, W, cs, WALL));
    carveMaze(g, rng, 0.55);
    const lobbies = [];
    for (let r = 0; r < 4; r++) {
      const i = rng.int(3, W - 7) | 1;
      const j = rng.int(3, W - 7) | 1;
      g.fillRect(i, j, Math.min(W - 2, i + 3), Math.min(W - 2, j + 3), FLOOR);
      lobbies.push({ i, j });
    }
    // one sunken lobby with steps down
    const sunk = lobbies[0];
    g.heightRect(sunk.i + 1, sunk.j + 1, sunk.i + 2, sunk.j + 2, -0.9);
    g.setRamp(sunk.i + 1, sunk.j, 3, -0.9, 0.9);
    g.setRamp(sunk.i + 2, sunk.j + 3, 2, -0.9, 0.9);
    const si = 1;
    const sj = 1;
    const sp = g.center(si, sj);
    world.spawn = { x: sp.x, z: sp.z, yaw: g.walkable(2, 1) ? -Math.PI / 2 : Math.PI };
    world.finalizeLayout();
    // open elevator shafts at a few dead ends
    const deadEnds = g.openCells().filter(([i, j]) => g.countSolidNeighbors(i, j) === 3 && world.distFromSpawn[j * W + i] > 6);
    rng.shuffle(deadEnds);
    const shafts = deadEnds.slice(0, 1 + Math.min(4, world.depth));
    for (const [i, j] of shafts) g.set(i, j, HOLE);

    // damask colours are ours; paper texture, wood panelling and carpet pile are scanned
    // damask at a real roll's pattern repeat (~25 cm) over the scanned paper's relief
    const damask = wallpaperDamask().map.clone();
    damask.repeat.set(2, 2);
    const wallMat = photo('decrepit_wallpaper', { uvScale: 2.2, map: damask, normalScale: 0.8 });
    const woodMat = photo('dark_paneled_wood', { uvScale: 1.4, roughness: 0.8 });
    const railMat = pbr(paint('s-hotel-rail', [92, 54, 34], { rough: 0.35 }));
    const carpet = photo('dirty_carpet', { uvScale: 2.2, map: carpetHotel().map, normalScale: 1.1 });
    buildShell(world, {
      height: H,
      wall: { mat: wallMat, u: 2.2, v: 2.2 },
      floor: { mat: carpet, uv: 2.2 },
      ceilMat: { mat: photo('ceiling_interior', { uvScale: 3, color: 0xcdbb9c }), uv: 3 },
      stairs: carpet,
      riserMat: woodMat,
      trims: [
        { mat: woodMat, y0: 0, y1: 0.95, inset: 0.02, u: 1.4, v: 1.4 },
        { mat: railMat, y0: 0.93, y1: 1.02, inset: 0.035 },
        { mat: railMat, y0: H - 0.12, y1: H, inset: 0.03 },
      ],
    });
    world.root.add(new THREE.HemisphereLight(0x6a5048, 0x1a1010, 0.65));

    const kit = new PropKit(world);
    // chandeliers over the lobbies, each a real light
    for (const l of lobbies.slice(1)) {
      const cx = (l.i + 2) * cs;
      const cz = (l.j + 2) * cs;
      const ch = new THREE.Group();
      const m = model('Chandelier_02');
      m.position.y = -0.85;
      ch.add(m);
      ch.position.set(cx, g.heightOf(l.i + 1, l.j + 1) + H, cz);
      world.root.add(ch);
      world.bakeSources.push({ pos: new THREE.Vector3(cx, ch.position.y - 0.6, cz), color: new THREE.Color(1, 0.78, 0.5), intensity: 9 });
      const bulb = glow(0xffd9a0, 1.6, 0.5);
      bulb.position.set(cx, ch.position.y - 0.62, cz);
      world.root.add(bulb);
    }
    // elevator frames in front of the shafts
    const used = (world.usedMounts = new Set());
    for (const [i, j] of shafts) {
      const dir = DIRS.find(([dx, dy]) => g.standable(i + dx, j + dy));
      if (!dir) continue;
      const [dx, dy] = dir;
      const c = g.center(i, j);
      const x = c.x + dx * cs * 0.5;
      const z = c.z + dy * cs * 0.5;
      const f = elevatorFrame(kit);
      kit.add(f, x, z, Math.atan2(dx, dy), { y: g.heightOf(i + dx, j + dy) });
    }

    // room doors along the corridors
    const doorCells = [];
    let number = 101;
    const frameMat = kit.std(0x2b1a10, 0.5);
    for (const m of rng.shuffle(wallMounts(g))) {
      if (doorCells.length >= 50) break;
      if (doorCells.some(([a, b]) => Math.abs(a - m.i) + Math.abs(b - m.j) < 2) || !rng.chance(0.55)) continue;
      doorCells.push([m.i, m.j]);
      used.add(`${m.i},${m.j},${m.nx},${m.nz}`);
      const u = world.unease(m.i, m.j);
      const ajar = rng.chance(Math.max(0, u - 0.4) * 0.6);
      const grp = new THREE.Group();
      kit.box(grp, 1.1, 2.2, 0.03, frameMat, 0, 1.1, 0.03);
      if (ajar) kit.plane(grp, 0.95, 2.1, kit.std(0x000000, 1), 0, 1.05, 0.047);
      const door = kit.plane(grp, 0.95, 2.1, new THREE.MeshStandardMaterial({ map: hotelDoor(number), roughness: 0.45 }), ajar ? -0.3 : 0, 1.05, ajar ? 0.4 : 0.05, 0, ajar ? -1.0 : 0, 0);
      void door;
      number += rng.int(1, 3);
      if (number % 100 > 40) number = (Math.floor(number / 100) + 1) * 100 + 1;
      kit.add(grp, m.x, m.z, Math.atan2(m.nx, m.nz), { y: m.y });
    }

    // wall sconces, managed by a light pool
    const pool = new LightPool(world.root, world.lightCount, { color: 0xffb566, intensity: 7, distance: 9, decay: 1.5 });
    world.lightPool = pool;
    const shades = [];
    const sconceCells = [];
    for (const m of rng.shuffle(wallMounts(g))) {
      if (used.has(`${m.i},${m.j},${m.nx},${m.nz}`)) continue;
      if (sconceCells.some(([a, b]) => Math.abs(a - m.i) + Math.abs(b - m.j) < 2)) continue;
      sconceCells.push([m.i, m.j]);
      used.add(`${m.i},${m.j},${m.nx},${m.nz}`);
      const s = sconce(kit);
      kit.add(s, m.x + m.nx * 0.02, m.z + m.nz * 0.02, Math.atan2(m.nx, m.nz), { y: m.y + 1.85 });
      const u = world.unease(m.i, m.j);
      const dead = rng.chance(0.12 + u * 0.3);
      const fx = pool.add({ pos: new THREE.Vector3(m.x + m.nx * 0.35, m.y + 2.1, m.z + m.nz * 0.35), flicker: !dead && rng.chance(0.15 + u * 0.3) ? rng.float(0.05, 0.3) : 0, dead });
      shades.push({ mat: s.userData.shade.material, fx });
      if (dead) s.userData.shade.material.emissiveIntensity = 0.02;
    }

    decorate(world, kit, {
      density: { wall: 0.12, high: 0.16, floor: 0.05, clutter: 0.07, ceil: 0 },
      keepClear: (i, j) => g.ramp[j * W + i] > 0,
      wall: [
        { p: P.vaseTable, w: 2 }, { p: M.nightstand, w: 2 }, { p: P.modelProp('ArmChair_01'), w: 2 }, { p: P.modelProp('Sofa_01'), w: 1.2 },
        { p: P.iceMachine, w: 0.8 }, { p: P.modelProp('vintage_grandfather_clock_01'), w: 1 },
        { p: P.extinguisher, w: 1 }, { p: P.armchair, w: 1, min: 0.8, o: { eerie: true } }, { p: P.vaseTable, w: 1.5, min: 0.7, o: { eerie: true } },
      ],
      high: [
        { p: P.modelProp('fancy_picture_frame_01', { place: 'high', y: 1.5, collide: false, scale: 1.3 }), w: 2 }, { p: P.painting, w: 1.5 },
        { p: P.painting, w: 2, min: 0.55, o: { eerie: true } }, { p: P.modelProp('ornate_mirror_01', { place: 'high', y: 1.2, collide: false, scale: 1.3 }), w: 1 },
        { p: P.wallClock, w: 0.6 },
      ],
      floor: [{ p: P.modelProp('CoffeeCart_01', { scale: 0.7 }), w: 1.2 }, { p: P.roomServiceCart, w: 1.5 }, { p: P.luggageCart, w: 1 }, { p: P.roomServiceCart, w: 1, min: 0.7, o: { eerie: true } }],
      clutter: [{ p: P.modelProp('vintage_suitcase', { jitter: 3, scale: 0.8 }), w: 1.5 }, { p: P.suitcase, w: 1 }, { p: P.paperScatter, w: 1, min: 0.5 }, { p: P.lostShoe, w: 1, min: 0.6 }],
    });
    kit.finish();

    Object.assign(world.env, {
      background: 0x080606,
      fog: new THREE.FogExp2(0x0a0808, 0.05 + world.depth * 0.004),
      exposure: 1.35,
      postfx: { bloom: 0.45, bloomThreshold: 0.72, bloomRadius: 0.5, grain: 0.08, vignette: 0.45, chroma: 0.0022, scan: 0.04, tint: [1.05, 0.96, 0.9] },
      ao: 1,
      // keep some ambient so walls beside you never go fully black outside the torch cone
      bake: { hemi: 0.9 },
      envIntensity: 0.35,
      ambience: 'hotel',
      reverb: [1.4, 3.5],
      flashlight: true,
      flashlightOn: true,
      flashlightIntensity: 60,
      flashlightDistance: 24,
    });
    world.surfaceFn = () => 'carpet';
    world.onUpdate = () => {
      for (const s of shades) if (!s.fx.dead) s.mat.emissiveIntensity = 0.1 + s.fx.level * 1.3;
    };

    // resident: the night bellboy, waiting near the start
    const d = world.distFromSpawn;
    const near = g.openCells().filter(([i, j]) => d[j * W + i] >= 3 && d[j * W + i] <= 6 && !g.ramp[j * W + i]);
    if (near.length) {
      const [i, j] = rng.pick(near);
      const c = g.center(i, j);
      const model = bellboyModel();
      model.position.set(c.x, g.heightOf(i, j), c.z);
      const baseY = model.position.y;
      const npc = new NPC(world, {
        name: 'the bellboy',
        pos: model.position.clone(),
        model,
        voice: 0.9,
        radius: 0.35,
        conversations: [
          ['...Welcome. Do you have a reservation?', 'We only operate at night now. The halls are dim, so please use your light. F, I believe.', 'Some elevators have no car behind their doors. Do mind the gap.'],
          ['There is a guest who smiles in the dark.', 'Shine your light on them and they will excuse themselves. They are quite shy.'],
          ['Thank you for staying with us. ...Checkout is whenever you like.'],
        ],
      });
      // floats a little off the carpet, flickers, and bows when you first come near
      let bow = 0;
      let bowed = false;
      const eye = new THREE.Vector3();
      npc.idle = (dt, ctx) => {
        model.position.y = baseY + 0.12 + Math.sin(npc.t * 1.4) * 0.05;
        const rig = model.userData.rig;
        const near = ctx.player.pos.distanceTo(model.position) < 3.2;
        if (near && !bowed && !ctx.attract) {
          bowed = true;
          bow = 0.001;
        }
        if (bow) bow = bow + dt * 0.6;
        if (bow > 2) bow = 0;
        idlePose(rig, npc.t);
        rig.rot('armL', 0, 0, 0.08);
        rig.rot('armR', -0.25, 0, -0.1);
        rig.rot('foreR', -1.3, 0, 0.2);
        if (bow) rig.blend({ spine: [0.4, 0, 0], chest: [0.35, 0, 0], neck: [0.2, 0, 0] }, Math.sin(Math.min(1, bow / 2) * Math.PI));
        else lookAt(model, eye.copy(ctx.camera.position), { max: 0.9 });
        const flick = Math.random() < 0.02 ? 0.35 : 0.8 + Math.sin(npc.t * 7) * 0.05;
        setFigureOpacity(model.userData.fig, flick);
      };
      world.add(npc);
    }

    if (!world.attract) {
      world.add(new Grin(world));
      world.add(new Watcher(world, { look: { hat: true, body: 0x0a0808 } }));
      world.add(new Peeker(world, { look: { hat: true, body: 0x0a0808 } }));
      if (world.depth >= 2) world.add(new Watcher(world, { look: { hat: true, body: 0x0a0808 }, ceiling: true }));
      if (rng.chance(0.4)) world.add(new StrayCat(world));
      // a guest in evening wear waiting for the lift, in a pose
      const spots = world.pickFarCells(1 + Math.min(2, world.depth), { minFrac: 0.4, spacing: 6, filter: (i, j) => g.standable(i, j) && !g.ramp[j * W + i] && g.countSolidNeighbors(i, j) <= 1 });
      spots.forEach(([i, j], k) => {
        const c = g.center(i, j);
        world.add(new Mannequin(world, { pos: new THREE.Vector3(c.x, g.heightOf(i, j), c.z), yaw: rng.float(0, 6.28), variant: 2 - (k % 2), mode: 'creepy' }));
      });
    }
  },

  // what leaks through when this level bleeds into another (see game/bleed.js)
  bleed: {
    ambience: 'hotel',
    looks: ['bellboy'],
    surfaces: () => {
      const damask = wallpaperDamask().map.clone();
      damask.repeat.set(2, 2);
      return {
        wall: { mat: photo('decrepit_wallpaper', { uvScale: 2.2, map: damask, normalScale: 0.8 }), uv: 2.2 },
        floor: { mat: photo('dirty_carpet', { uvScale: 2.2, map: carpetHotel().map, normalScale: 1.1 }), uv: 2.2 },
        ceil: { mat: photo('ceiling_interior', { uvScale: 3, color: 0xcdbb9c }), uv: 3 },
      };
    },
    props: {
      wall: [{ p: P.armchair, w: 1 }, { p: P.vaseTable, w: 1 }, { p: P.grandfatherClock, w: 0.5 }],
      high: [{ p: P.painting, w: 1 }],
      floor: [{ p: P.roomServiceCart, w: 1 }, { p: P.luggageCart, w: 1 }],
      clutter: [{ p: P.suitcase, w: 1 }],
    },
    stray: (world, pos) => {
      const model = bellboyModel();
      model.position.copy(pos);
      const baseY = pos.y;
      const npc = new NPC(world, { name: 'the bellboy', pos, model, voice: 0.9, radius: 0.35, conversations: [
        ['Your room is... hm.', 'This is not a room.'],
        ['Housekeeping will be up shortly.', 'Housekeeping is also lost.'],
      ] });
      npc.idle = () => (model.position.y = baseY + 0.12 + Math.sin(npc.t * 1.4) * 0.05);
      return npc;
    },
  },

  makeDoor(world, dest) {
    const group = new THREE.Group();
    const kit = new PropKit(world);
    const f = elevatorFrame(kit, false);
    group.add(f);
    const doors = f.children.filter((c) => c.geometry?.parameters?.depth === 0.04);
    const inside = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(dest.tint || 0xffe2b0) }));
    inside.position.set(0, 1.1, 0.005);
    group.add(inside);
    const light = glow(dest.tint || 0xffe2b0, 3, 0);
    light.position.set(0, 1.2, 0.5);
    group.add(light);
    const base = doors.map((d) => d.position.x);
    return {
      group,
      update(dt, t, open) {
        doors.forEach((d, k) => (d.position.x = base[k] + Math.sign(base[k]) * open * 0.62));
        inside.material.color.set(dest.tint || 0xffe2b0).multiplyScalar(0.1 + open * 2.2);
        light.material.opacity = open * 0.6;
      },
    };
  },
};
