import * as THREE from 'three';
import { Grid, FLOOR, WALL, HOLE, DIRS, buildWallFaces, buildFloors, buildRisers } from '../core/grid.js';
import { woodPanel, pbr } from '../core/surfaces.js';
import { glowSprite } from '../core/textures.js';
import { mesh, doorModel, decorate, glow } from './common.js';
import { LightPool } from '../core/lights.js';
import { PropKit } from '../props/kit.js';
import { photo, texMap, hdri } from '../core/assets.js';
import * as P from '../props/library.js';
import { Watcher, Follower, Peeker } from '../entities/creatures.js';
import { NPC } from '../entities/npc.js';
import { LOOKS } from '../entities/looks.js';
import { beastPose, tailSway } from '../entities/figures.js';

const WALL_H = 2.3; // bamboo fence; the grove towers behind it

function carveMaze(g, rng) {
  const stack = [[1, 1]];
  g.set(1, 1, FLOOR);
  while (stack.length) {
    const [i, j] = stack[stack.length - 1];
    const nb = [[2, 0], [-2, 0], [0, 2], [0, -2]]
      .map(([dx, dy]) => [i + dx, j + dy, dx, dy])
      .filter(([x, y]) => x > 0 && y > 0 && x < g.w - 1 && y < g.h - 1 && g.get(x, y) === WALL);
    if (!nb.length) {
      stack.pop();
      continue;
    }
    const [x, y, dx, dy] = rng.pick(nb);
    g.set(i + dx / 2, j + dy / 2, FLOOR);
    g.set(x, y, FLOOR);
    stack.push([x, y]);
  }
  for (let j = 1; j < g.h - 1; j += 2) {
    for (let i = 1; i < g.w - 1; i += 2) {
      if (g.countSolidNeighbors(i, j) < 3 || !rng.chance(0.5)) continue;
      const opts = DIRS.filter(([dx, dy]) => g.get(i + dx, j + dy) === WALL && i + dx > 0 && j + dy > 0 && i + dx < g.w - 1 && j + dy < g.h - 1);
      if (opts.length) {
        const [dx, dy] = rng.pick(opts);
        g.set(i + dx, j + dy, FLOOR);
      }
    }
  }
}

function kitsuneModel() {
  const fig = LOOKS.kitsune();
  beastPose(fig, 'sit');
  return fig;
}

export default {
  id: 'shrine',
  code: 'LEVEL 1000',
  name: 'Thousand Gates',
  sub: '千本鳥居 · A shrine path in Japan at night',
  tint: 0xff8a50,
  assets: {
    textures: ['bamboo_wall', 'stone_pathway_02', 'clean_pebbles', 'brown_planks_03'],
    models: ['wooden_lantern_01', 'rock_moss_set_01', 'fern_02', 'wooden_bucket_01'],
    hdris: ['qwantani_night_puresky'],
    looks: ['kitsune', ['watcher', { body: 0x0a0a0a, eyes: 0xff5a30, height: 2.3 }]],
  },

  build(world) {
    const rng = world.rng;
    const W = 37;
    const cs = 2.4;
    const g = (world.grid = new Grid(W, W, cs, WALL));
    carveMaze(g, rng);
    // clearings
    const clearings = [];
    for (let n = 0; n < 7; n++) {
      const i = rng.int(2, W - 5) | 1;
      const j = rng.int(2, W - 5) | 1;
      const w = rng.pick([3, 3, 5]);
      g.fillRect(i, j, Math.min(W - 2, i + w - 1), Math.min(W - 2, j + 2), FLOOR);
      clearings.push({ i, j, w: Math.min(w, W - 1 - i), h: 3 });
    }
    // a hillside: height rises smoothly with distance from the start, in stone steps
    const si = 1;
    const sj = 1;
    const noise = (i, j) => Math.sin(i * 0.4) * 0.3 + Math.cos(j * 0.33) * 0.3;
    for (let j = 0; j < W; j++) {
      for (let i = 0; i < W; i++) {
        const d = Math.hypot(i - si, j - sj);
        g.setHeight(i, j, Math.round((d * 0.19 + noise(i, j)) / 0.15) * 0.15);
      }
    }
    for (const c of clearings) {
      const y = g.heightOf(c.i + (c.w >> 1), c.j + 1);
      g.heightRect(c.i, c.j, c.i + c.w - 1, c.j + c.h - 1, y);
    }
    const sp = g.center(si, sj);
    world.spawn = { x: sp.x, z: sp.z, yaw: g.walkable(2, 1) ? -Math.PI / 2 : Math.PI };
    world.finalizeLayout();
    // ravines: some dead ends drop away into darkness
    const inClearing = (i, j) => clearings.some((c) => i >= c.i && i < c.i + c.w && j >= c.j && j < c.j + c.h);
    const deadEnds = g.openCells().filter(([i, j]) => g.countSolidNeighbors(i, j) === 3 && !inClearing(i, j) && world.distFromSpawn[j * W + i] > 10);
    rng.shuffle(deadEnds);
    for (const [i, j] of deadEnds.slice(0, 1 + world.depth)) g.set(i, j, HOLE);

    // ---- geometry
    const bamboo = photo('bamboo_wall', { uvScale: 2, color: 0xb8a888 });
    const stone = photo('stone_pathway_02', { uvScale: 2.4, color: 0xc8c4bc });
    const grav = photo('clean_pebbles', { uvScale: 2, color: 0xd0ccc4 });
    mesh(world, buildWallFaces(g, { y0: (i, j) => g.heightOf(i, j) - 0.05, y1: (i, j) => g.heightOf(i, j) + WALL_H, uScale: 2, vScale: 2 }), bamboo);
    // fence top rail
    mesh(world, buildWallFaces(g, { y0: (i, j) => g.heightOf(i, j) + WALL_H - 0.08, y1: (i, j) => g.heightOf(i, j) + WALL_H, uScale: 1, vScale: 1, inset: 0.04 }), new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.7 }));
    mesh(world, buildFloors(g, (c, i, j) => c === FLOOR && !inClearing(i, j), 2.4), stone);
    // the grove: tall bamboo culms growing in every wall cell behind the fences
    const culms = [];
    for (let j = 0; j < W; j++) {
      for (let i = 0; i < W; i++) {
        if (g.get(i, j) !== WALL) continue;
        const n = 3 + rng.int(0, 3);
        for (let k = 0; k < n; k++) {
          culms.push({ x: (i + rng.float(0.1, 0.9)) * cs, z: (j + rng.float(0.1, 0.9)) * cs, y: g.heightOf(i, j) - 0.2, h: rng.float(7, 13), r: rng.float(0.035, 0.07), lean: rng.float(-0.06, 0.06), rot: rng.float(0, 6) });
        }
      }
    }
    const culmMat = new THREE.MeshStandardMaterial({ color: 0x55703a, roughness: 0.45 });
    const culmGeo = new THREE.CylinderGeometry(1, 1, 1, 7, 1, true);
    culmGeo.translate(0, 0.5, 0);
    const culmMesh = new THREE.InstancedMesh(culmGeo, culmMat, culms.length);
    const cm = new THREE.Matrix4();
    const cq = new THREE.Quaternion();
    culms.forEach((c, n) => {
      cq.setFromEuler(new THREE.Euler(c.lean, c.rot, c.lean * 0.7));
      cm.compose(new THREE.Vector3(c.x, c.y, c.z), cq, new THREE.Vector3(c.r, c.h, c.r));
      culmMesh.setMatrixAt(n, cm);
      culmMesh.setColorAt(n, new THREE.Color().setHSL(0.24 + rng.float(-0.03, 0.03), 0.35, 0.22 + rng.float(-0.06, 0.08)));
    });
    world.root.add(culmMesh);
    mesh(world, buildFloors(g, (c, i, j) => c === FLOOR && inClearing(i, j), 2), grav);
    mesh(world, buildRisers(g, { pred: (c) => c !== WALL, uScale: 2.4, vScale: 2.4 }), stone);
    // a real night sky

    // ---- torii tunnels (instanced), lanterns (light pool)
    // vermilion lacquer over real wood grain
    const lacquer = new THREE.MeshPhysicalMaterial({ color: 0xc8341a, roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.35, normalMap: texMap('brown_planks_03', 'normalMap', 1), normalScale: new THREE.Vector2(0.6, 0.6), roughnessMap: texMap('brown_planks_03', 'arm', 1) });
    const black = new THREE.MeshStandardMaterial({ color: 0x151210, roughness: 0.6 });
    const gates = [];
    const kitLanterns = [];
    for (let j = 1; j < W - 1; j++) {
      for (let i = 1; i < W - 1; i++) {
        if (g.get(i, j) !== FLOOR || inClearing(i, j)) continue;
        const ox = g.standable(i - 1, j) && g.standable(i + 1, j);
        const oz = g.standable(i, j - 1) && g.standable(i, j + 1);
        const sx = g.solid(i, j - 1) && g.solid(i, j + 1);
        const sz = g.solid(i - 1, j) && g.solid(i + 1, j);
        let axis = null;
        if (ox && sx) axis = 'x';
        else if (oz && sz) axis = 'z';
        if (!axis) continue;
        const u = world.unease(i, j);
        const per = u > 0.8 ? 4 : 3;
        for (let k = 0; k < per; k++) {
          const t = (k + 0.5) / per;
          const x = axis === 'x' ? (i + t) * cs : (i + 0.5) * cs;
          const z = axis === 'z' ? (j + t) * cs : (j + 0.5) * cs;
          gates.push({ x, z, y: g.floorAt(x, z), yaw: axis === 'x' ? Math.PI / 2 : 0, s: 0.96 + rng.float(-0.03, 0.03) });
        }
      }
    }
    const parts = [
      { geo: new THREE.CylinderGeometry(0.1, 0.12, 2.6, 12), mat: lacquer, at: () => [[-0.85, 1.3, 0], [0.85, 1.3, 0]] },
      { geo: new THREE.CylinderGeometry(0.13, 0.13, 0.25, 12), mat: black, at: () => [[-0.85, 0.12, 0], [0.85, 0.12, 0]] },
      { geo: new THREE.BoxGeometry(2.3, 0.16, 0.22), mat: lacquer, at: () => [[0, 2.55, 0]] },
      { geo: new THREE.BoxGeometry(2.45, 0.08, 0.28), mat: black, at: () => [[0, 2.67, 0]] },
      { geo: new THREE.BoxGeometry(1.95, 0.12, 0.12), mat: lacquer, at: () => [[0, 2.15, 0]] },
    ];
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const v = new THREE.Vector3();
    for (const part of parts) {
      const offsets = part.at();
      const im = new THREE.InstancedMesh(part.geo, part.mat, Math.max(1, gates.length * offsets.length));
      let n = 0;
      for (const gt of gates) {
        q.setFromAxisAngle(up, gt.yaw);
        for (const [ox, oy, oz] of offsets) {
          v.set(ox, oy, oz).multiplyScalar(gt.s).applyQuaternion(q).add(new THREE.Vector3(gt.x, gt.y, gt.z));
          m4.compose(v, q, new THREE.Vector3(gt.s, gt.s, gt.s));
          im.setMatrixAt(n++, m4);
        }
      }
      im.count = n;
      world.root.add(im);
    }
    for (const gt of gates) {
      if (rng.chance(0.12 + world.unease(...g.cellOf(gt.x, gt.z)) * 0.15)) {
        const off = rng.pick([-0.6, 0.6]);
        kitLanterns.push([gt.x + off * Math.cos(gt.yaw), gt.y + 2.47, gt.z - off * Math.sin(gt.yaw)]);
      }
      for (const s of [-0.85, 0.85]) {
        const px = gt.x + s * gt.s * Math.cos(gt.yaw);
        const pz = gt.z - s * gt.s * Math.sin(gt.yaw);
        world.addBox(px - 0.12, pz - 0.12, px + 0.12, pz + 0.12);
      }
    }

    // stone lanterns along the path, with warm flickering light
    const kit = new PropKit(world);
    const pool = new LightPool(world.root, world.lightCount, { color: 0xff9a4a, intensity: 5, distance: 8, decay: 1.6 });
    world.lightPool = pool;
    const lanterns = world.pickFarCells(40, { minFrac: 0, spacing: 3, filter: (i, j) => g.get(i, j) === FLOOR && g.countSolidNeighbors(i, j) >= 1 });
    for (const [i, j] of lanterns) {
      const dir = DIRS.find(([dx, dy]) => g.solid(i + dx, j + dy));
      if (!dir) continue;
      const c = g.center(i, j);
      const x = c.x + dir[0] * cs * 0.36;
      const z = c.z + dir[1] * cs * 0.36;
      const y = g.heightOf(i, j);
      kit.add(P.stoneLantern.build(kit, rng), x, z, 0, { y, collide: [0.45, 0.45] });
      const u = world.unease(i, j);
      pool.add({ pos: new THREE.Vector3(x, y + 1.5, z), flicker: rng.float(0.05, 0.15) + u * 0.1, dead: rng.chance(0.1 + u * 0.3) });
    }
    for (const [x, y, z] of kitLanterns) kit.add(P.paperLantern.build(kit, rng), x, z, 0, { y });
    // clearings: shrine furniture
    for (const c of clearings) {
      const cx = (c.i + c.w / 2) * cs;
      const cz = (c.j + c.h / 2) * cs;
      const y = g.heightOf(c.i, c.j);
      const r = rng.int(0, 3);
      if (r === 0) kit.add(P.offeringBox.build(kit, rng), cx, cz, rng.pick([0, Math.PI / 2]), { y, collide: [0.9, 0.5] });
      else if (r === 1) kit.add(P.emaRack.build(kit, rng), cx, cz, rng.pick([0, Math.PI / 2]), { y, collide: [1.4, 0.3] });
      else if (r === 2) kit.add(P.chozuya.build(kit, rng), cx, cz, rng.pick([0, Math.PI / 2]), { y, collide: [1.1, 0.7] });
      else {
        for (const s of [-1, 1]) kit.add(P.foxStatue.build(kit, rng), cx + s * 1.3, cz, s * -0.3, { y, collide: [0.5, 0.6] });
      }
    }
    for (const c of clearings) {
      if (!rng.chance(0.6)) continue;
      const y = g.heightOf(c.i, c.j);
      kit.add(P.modelProp('rock_moss_set_01', { scale: 0.22 }).build(kit, rng), (c.i + 0.4) * cs, (c.j + c.h - 0.4) * cs, rng.float(0, 6), { y, collide: [1.4, 1.2] });
      if (rng.chance(0.6)) kit.add(P.modelProp('wooden_bucket_01').build(kit, rng), (c.i + c.w - 0.5) * cs, (c.j + 0.5) * cs, rng.float(0, 6), { y, collide: [0.4, 0.4] });
    }
    decorate(world, kit, {
      density: { wall: 0.07, high: 0.06, floor: 0.04, clutter: 0.16, ceil: 0 },
      wall: [{ p: P.jizo, w: 2, o: {} }, { p: P.foxStatue, w: 1, min: 0.3 }, { p: P.modelProp('wooden_lantern_01', { jitter: 0.5 }), w: 1.5 }],
      high: [{ p: P.foxMask, w: 1, min: 0.45 }],
      clutter: [
        { p: P.modelProp('fern_02', { collide: false, scale: 0.55, jitter: 3 }), w: 3 }, { p: P.jizo, w: 1.5, min: 0.25 },
        { p: P.spiderLilies, w: 2.5, min: 0.15 }, { p: P.jizo, w: 2, min: 0.8, o: { eerie: true } },
      ],
    });
    kit.finish();

    // moonlight and fireflies
    world.root.add(new THREE.HemisphereLight(0x3a3a66, 0x0c0a10, 0.55));
    const moon = new THREE.DirectionalLight(0x9fb0ff, 0.45);
    moon.position.set(-30, 45, -80);
    world.root.add(moon);
    const flyN = 80;
    const fGeo = new THREE.BufferGeometry();
    const fPos = new Float32Array(flyN * 3);
    const fPh = [];
    for (let k = 0; k < flyN; k++) {
      fPos[k * 3] = rng.float(-10, 10);
      fPos[k * 3 + 1] = rng.float(0.5, 3);
      fPos[k * 3 + 2] = rng.float(-10, 10);
      fPh.push(rng.float(0, 6));
    }
    fGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3));
    const fMat = new THREE.PointsMaterial({ map: glowSprite(), size: 0.12, color: 0xd8ff8a, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
    const flies = new THREE.Points(fGeo, fMat);
    flies.frustumCulled = false;
    world.root.add(flies);

    Object.assign(world.env, {
      background: 0x0c0a14,
      backgroundTex: hdri('qwantani_night_puresky'),
      backgroundIntensity: 0.5,
      fog: new THREE.FogExp2(0x16132a, 0.045 + world.depth * 0.004),
      exposure: 1.25,
      postfx: { bloom: 0.55, bloomThreshold: 0.7, bloomRadius: 0.6, grain: 0.07, vignette: 0.42, chroma: 0.0018, scan: 0.03, tint: [1.02, 0.97, 1.04] },
      ao: 0.9,
      envIntensity: 0.4,
      ambience: 'shrine',
      reverb: [2.8, 2.4],
      flashlight: true,
      flashlightOn: false,
      flashlightIntensity: 35,
      bake: { tess: 0.9, hemi: 0.7, bounce: 0.2 },
    });
    world.surfaceFn = (x, z) => {
      const [i, j] = g.cellOf(x, z);
      return inClearing(i, j) ? 'gravel' : 'stone';
    };

    let t = 0;
    world.onUpdate = (dt, ctx) => {
      t += dt;
      const cam = ctx.camera.position;
      const arr = fGeo.attributes.position.array;
      for (let k = 0; k < flyN; k++) {
        arr[k * 3] += Math.sin(t * 0.5 + fPh[k]) * dt * 0.3;
        arr[k * 3 + 1] += Math.cos(t * 0.7 + fPh[k] * 2) * dt * 0.15;
        arr[k * 3 + 2] += Math.cos(t * 0.4 + fPh[k]) * dt * 0.3;
      }
      fGeo.attributes.position.needsUpdate = true;
      flies.position.set(Math.round(cam.x / 20) * 20, cam.y - 1.6, Math.round(cam.z / 20) * 20);
      fMat.opacity = 0.6 + Math.sin(t * 3) * 0.3;
    };

    // resident: a white fox in the first clearing you'd reach
    const d = world.distFromSpawn;
    const first = clearings.map((c) => ({ c, k: d[(c.j + 1) * W + c.i + 1] })).filter((o) => o.k > 0).sort((a, b) => a.k - b.k)[0];
    if (first) {
      const c = first.c;
      const model = kitsuneModel();
      model.position.set((c.i + 0.6) * cs, g.heightOf(c.i, c.j), (c.j + 0.6) * cs);
      const fox = new NPC(world, {
        name: 'the white fox',
        pos: model.position.clone(),
        model,
        voice: 1.4,
        radius: 0.35,
        conversations: [
          ['A visitor, at this hour?', 'The gates go on for as long as you keep walking. A thousand, they say. Nobody has counted past nine hundred.', 'Some of the side paths end in nothing at all. Watch your step.'],
          ['If a door hums, it leads to somewhere that is not here. That is all doors are, really.'],
          ['Go on. The lanterns will keep you company.'],
        ],
      });
      fox.aimHeight = 0.7;
      fox.face = false;
      // sits like a shrine statue; the tail and the head are the only things that move
      fox.idle = (dt, ctx) => {
        const rig = model.userData.rig;
        beastPose(model, 'sit');
        tailSway(rig, fox.t, 0.35, 1.1);
        const p = ctx.player.pos;
        const yaw = Math.atan2(p.x - model.position.x, p.z - model.position.z) - model.rotation.y;
        const rel = Math.atan2(Math.sin(yaw), Math.cos(yaw));
        const near = p.distanceTo(model.position) < 8;
        rig.rot('neck', 0.25, near ? Math.max(-0.6, Math.min(0.6, rel)) * 0.5 : 0, 0);
        rig.rot('head', 0.55, near ? Math.max(-0.9, Math.min(0.9, rel)) * 0.6 : Math.sin(fox.t * 0.3) * 0.2, near ? 0 : Math.sin(fox.t * 0.5) * 0.1);
        // turn the whole body slowly when you walk round behind it
        if (near && Math.abs(rel) > 1.2) model.rotation.y += Math.sign(rel) * dt * 0.6;
      };
      world.add(fox);
    }
    if (!world.attract) {
      world.add(new Watcher(world, { look: { body: 0x0a0a0a, eyes: 0xff5a30, height: 2.3 }, speed: 1.3 }));
      if (world.depth >= 1) world.add(new Follower(world));
      if (world.depth >= 1) world.add(new Peeker(world, { look: { body: 0x0a0a0a, eyes: 0xff5a30 } }));
    }
  },

  // what leaks through when this level bleeds into another (see game/bleed.js)
  bleed: {
    ambience: 'shrine',
    looks: ['kitsune'],
    surfaces: () => ({
      wall: { mat: photo('bamboo_wall', { uvScale: 2, color: 0xb8a888 }), uv: 2 },
      floor: { mat: photo('stone_pathway_02', { uvScale: 2.4, color: 0xc8c4bc }), uv: 2.4 },
    }),
    props: {
      wall: [{ p: P.stoneLantern, w: 2 }, { p: P.jizo, w: 1 }, { p: P.emaRack, w: 0.6 }],
      floor: [{ p: P.foxStatue, w: 1 }, { p: P.stoneLantern, w: 1 }],
      clutter: [{ p: P.spiderLilies, w: 2 }],
    },
    stray: (world, pos) => {
      const model = kitsuneModel();
      model.position.copy(pos);
      const fox = new NPC(world, { name: 'the white fox', pos, model, voice: 1.4, radius: 0.35, face: false, conversations: [
        ['Hm. The gates brought me somewhere odd.'],
        ['Don’t tell anyone you saw a fox here.', 'They’ll say the place is haunted, and then where will we be.'],
      ] });
      fox.aimHeight = 0.7;
      fox.idle = () => tailSway(model.userData.rig, fox.t, 0.4, 1.4);
      return fox;
    },
  },

  makeDoor(world, dest) {
    const woodMat = pbr(woodPanel('s-wood-shrine', [110, 72, 40], 0.5));
    return doorModel({
      width: 1.3,
      height: 2.2,
      doorMap: woodMat.map,
      doorColor: 0x8a5a30,
      frameColor: 0x5a2a18,
      lightColor: dest.tint || 0xffb070,
      knob: 0x2a1a10,
      extras(group) {
        const rope = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 8, 24, Math.PI), new THREE.MeshStandardMaterial({ color: 0xd8c38a, roughness: 0.9 }));
        rope.rotation.z = Math.PI;
        rope.position.set(0, 2.55, 0.18);
        rope.scale.y = 0.25;
        group.add(rope);
        const paper = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide });
        for (const x of [-0.45, 0, 0.45]) {
          const s = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.35), paper);
          s.position.set(x, 2.25, 0.19);
          group.add(s);
        }
      },
    });
  },
};
