import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Grid, FLOOR, WALL, WATER, DOORWAY, buildWallFaces, buildCellQuads, worldPlane } from '../core/grid.js';
import { poolTileWhite, poolTileBlue, tileBump, waterNormal, caustics, labelTexture } from '../core/textures.js';
import { mesh, ceilingFixtures, doorModel } from './common.js';
import { NPC, mat } from '../entities/npc.js';

const H = 4.2;
const LINTEL = 2.9;
const POOL = -0.55;
const WATER_Y = -0.1;

function duckModel(scale = 1) {
  const g = new THREE.Group();
  const yellow = mat(0xffd23f, { roughness: 0.35 });
  const orange = mat(0xff8a1e, { roughness: 0.4 });
  const black = mat(0x151515, { roughness: 0.2 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14), yellow);
  body.scale.set(1, 0.72, 1.25);
  body.position.y = 0.25;
  g.add(body);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 12), yellow);
  tail.rotation.x = -2.2;
  tail.position.set(0, 0.5, -0.55);
  g.add(tail);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 14), yellow);
  head.position.set(0, 0.82, 0.3);
  g.add(head);
  const beak = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), orange);
  beak.scale.set(1.2, 0.45, 1.3);
  beak.position.set(0, 0.76, 0.6);
  g.add(beak);
  for (const x of [-0.13, 0.13]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), black);
    e.position.set(x, 0.9, 0.55);
    g.add(e);
  }
  g.scale.setScalar(scale);
  return g;
}

function ladder(x, z, yaw) {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xdfe5e8, metalness: 0.9, roughness: 0.2 });
  for (const sx of [-0.25, 0.25]) {
    const rail = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.025, 8, 16, Math.PI), steel);
    rail.position.set(sx, 0.35, 0.02);
    rail.rotation.y = Math.PI / 2;
    g.add(rail);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 8), steel);
    leg.position.set(sx, -0.2, 0.3);
    g.add(leg);
  }
  for (let r = 0; r < 3; r++) {
    const rung = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.08), steel);
    rung.position.set(0, -0.1 - r * 0.2, 0.32);
    g.add(rung);
  }
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  return g;
}

export default {
  id: 'poolrooms',
  code: 'LEVEL 37',
  name: 'プールルーム',
  en: 'The Poolrooms',
  tags: ['明るい', '静寂'],
  danger: 0,
  art: { c1: '#bfe9ee', c2: '#5fb4c4', c3: '#ffffff' },
  desc: '白いタイルと澄んだ水。反響する水音だけが、いつまでも続く昼下がり。',
  goal: '記憶の欠片を 3 つ集め、光のもれる扉を探す。',
  tip: 'ここに危険はない。浅いプールは歩けるが、少し足が重くなる。',
  fragmentColor: 0xaef4ff,
  memories: ['閉館間際の市民プールに差しこむ西日', 'ビーチボールが水面をすべる音', '塩素の匂いのするタオルにくるまった帰り道'],
  clearLine: '水音が遠ざかる。濡れた足跡だけが、白いタイルに残った。',

  build(world) {
    const rng = world.rng;
    const RX = 5;
    const RS = 6; // room interior size in cells
    const W = RX * (RS + 1) + 1;
    const cs = 2.0;
    const g = (world.grid = new Grid(W, W, cs, WALL));
    const rooms = [];
    for (let ry = 0; ry < RX; ry++) {
      for (let rx = 0; rx < RX; rx++) {
        const i0 = 1 + rx * (RS + 1);
        const j0 = 1 + ry * (RS + 1);
        g.fillRect(i0, j0, i0 + RS - 1, j0 + RS - 1, FLOOR);
        rooms.push({ rx, ry, i0, j0 });
      }
    }
    // connect rooms: random spanning tree + extra loops
    const idx = (rx, ry) => ry * RX + rx;
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
      const type = rng.chance(0.25) ? FLOOR : DOORWAY;
      if (a.rx !== b.rx) {
        const wi = Math.max(a.i0, b.i0) - 1;
        for (let k = 0; k < wide; k++) g.set(wi, a.j0 + off + k, type);
      } else {
        const wj = Math.max(a.j0, b.j0) - 1;
        for (let k = 0; k < wide; k++) g.set(a.i0 + off + k, wj, type);
      }
    }
    // pools
    const spawnRoom = rooms[idx(2, 2)];
    const pools = [];
    for (const r of rooms) {
      if (r === spawnRoom || !rng.chance(0.6)) continue;
      const pw = rng.int(3, RS - 2);
      const ph = rng.int(3, RS - 2);
      const pi = r.i0 + rng.int(1, RS - pw - 1);
      const pj = r.j0 + rng.int(1, RS - ph - 1);
      g.fillRect(pi, pj, pi + pw - 1, pj + ph - 1, WATER);
      pools.push({ pi, pj, pw, ph, r });
    }
    const si = spawnRoom.i0 + (RS >> 1);
    const sj = spawnRoom.j0 + (RS >> 1);
    g.sealUnreachable(si, sj);
    const sp = g.center(si, sj);
    world.spawn = { x: sp.x - cs / 2, z: sp.z - cs / 2, yaw: rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]) };

    // ---- materials
    const white = new THREE.MeshStandardMaterial({ map: poolTileWhite(), bumpMap: tileBump(), bumpScale: 0.6, roughness: 0.25, metalness: 0 });
    const blue = new THREE.MeshStandardMaterial({
      map: poolTileBlue(), roughness: 0.3,
      emissive: 0x9ff4ff, emissiveMap: caustics(), emissiveIntensity: 0.35,
    });
    const causticMap = blue.emissiveMap;
    const pmrem = new THREE.PMREMGenerator(world.game.renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    world.onDispose.push(() => envTex.dispose());
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x8fe3ee, transparent: true, opacity: 0.55, roughness: 0.04, metalness: 0.1,
      normalMap: waterNormal(), normalScale: new THREE.Vector2(0.35, 0.35), envMap: envTex, envMapIntensity: 1.4, depthWrite: false,
    });
    const nMap = waterMat.normalMap;

    const isOpen = (c) => c !== WALL;
    mesh(world, buildWallFaces(g, { y0: POOL - 0.05, y1: H, uScale: 2, vScale: 2, solid: (c) => c === WALL, open: isOpen }), white);
    // lintels over doorways
    mesh(world, buildWallFaces(g, { y0: LINTEL, y1: H, uScale: 2, vScale: 2, solid: (c) => c === DOORWAY, open: (c) => c === FLOOR || c === WATER }), white);
    mesh(world, buildCellQuads(g, (c) => c === DOORWAY, LINTEL, false, 2), white);
    // floors, pool basins and their sides
    mesh(world, buildCellQuads(g, (c) => c === FLOOR || c === DOORWAY, 0, true, 2), white);
    mesh(world, buildCellQuads(g, (c) => c === WATER, POOL, true, 2), blue);
    mesh(world, buildWallFaces(g, { y0: POOL, y1: 0, uScale: 2, vScale: 2, solid: (c) => c === FLOOR || c === DOORWAY, open: (c) => c === WATER }), blue);
    const water = mesh(world, buildCellQuads(g, (c) => c === WATER, WATER_Y, true, 4), waterMat);
    water.renderOrder = 2;
    // pool edge coping
    const coping = new THREE.MeshStandardMaterial({ color: 0xf7f7f2, roughness: 0.5 });
    mesh(world, buildWallFaces(g, { y0: -0.02, y1: 0.03, inset: 0.06, solid: (c) => c === FLOOR || c === DOORWAY, open: (c) => c === WATER }), coping);
    mesh(world, worldPlane(0, 0, W * cs, W * cs, H, false, 2), white);

    for (const p of pools) {
      if (!rng.chance(0.7)) continue;
      const c = g.center(p.pi, p.pj - 1);
      world.root.add(ladder(c.x + 0.4, p.pj * cs - 0.02, 0));
    }

    // skylight fixtures
    world.root.add(new THREE.HemisphereLight(0xf4ffff, 0xc4e4e6, 1.3));
    ceilingFixtures(world, {
      every: 3, offset: 2, y: H - 0.02, size: [1.6, 1.6], color: 0xf2ffff, panelColor: [2.2, 2.3, 2.3],
      intensity: 9, distance: 14, flicker: 0, dead: 0,
    });

    Object.assign(world.env, {
      background: 0xd9eff0,
      fog: new THREE.FogExp2(0xcfe6e7, 0.024),
      exposure: 0.9,
      toneMapping: THREE.NeutralToneMapping,
      postfx: { bloom: 0.3, bloomThreshold: 0.92, bloomRadius: 0.55, grain: 0.035, vignette: 0.22, chroma: 0.0012, scan: 0.02, tint: [0.97, 1.02, 1.03] },
      ambience: 'pool',
      reverb: [3.6, 2.2],
      sanityRegen: 3,
    });
    world.floorFn = (x, z) => (world.isWater(x, z) ? POOL : 0);
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
      const model = duckModel(1.5);
      model.position.set(cx, WATER_Y - 0.25, cz);
      const duck = new NPC(world, {
        name: 'おおきなアヒル',
        pos: model.position.clone(),
        model,
        voice: 1.6,
        radius: 1.0,
        conversations: [
          [
            'ぷか……ぷか……。',
            'ようこそ、水の部屋へ。ここは静かで、明るくて、ずっと同じ昼下がり。',
            '欠片をさがしているのかい？ 天井まで伸びる光の柱をたどるといいよ。',
            '水の中も歩けるけど、少し足が重くなるからね。',
          ],
          [
            'ここには怖いものはいないよ。……たぶんね。',
            'ただ、長くいると帰りたくなくなる。それがいちばん怖いのかもしれないね。',
          ],
          ['ぷか。'],
        ],
        onTalk: (game) => game.audio.squeak(),
      });
      duck.idle = (dt) => {
        duck.object.position.y = WATER_Y - 0.25 + Math.sin(duck.t * 1.3) * 0.05;
        duck.object.rotation.z = Math.sin(duck.t * 0.9) * 0.05;
      };
      world.add(duck);
    }
    for (const p of pools.slice(0, 6)) {
      const model = duckModel(0.28);
      const x = (p.pi + rng.float(0.5, p.pw - 0.5)) * cs;
      const z = (p.pj + rng.float(0.5, p.ph - 0.5)) * cs;
      model.position.set(x, WATER_Y - 0.03, z);
      model.rotation.y = rng.float(0, Math.PI * 2);
      const little = new NPC(world, {
        name: 'アヒル', pos: model.position.clone(), model, radius: 0, face: false, marker: false,
        prompt: 'アヒルをつつく', conversations: [[]],
      });
      little.interactRange = 2.2;
      little.aimHeight = 0.1;
      little.interact = (game) => {
        game.audio.squeak();
        little.hop = 1;
      };
      little.hop = 0;
      const baseY = model.position.y;
      little.idle = (dt) => {
        little.hop = Math.max(0, little.hop - dt * 2.5);
        model.position.y = baseY + Math.sin(little.t * 1.7) * 0.02 + Math.sin(little.hop * Math.PI) * 0.25;
        model.rotation.y += dt * 0.1;
      };
      world.add(little);
    }
  },

  makeExit() {
    return doorModel({
      width: 1.1,
      height: 2.3,
      doorColor: 0xf3f6f4,
      frameColor: 0xc9d6d7,
      lightColor: 0xfff6dc,
      knob: 0x9aa5a6,
      extras(group) {
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.14), new THREE.MeshBasicMaterial({ map: labelTexture('OUT', { w: 256, h: 72, bg: '#1f6f7c', fg: '#e9fbff', font: '44px "DotGothic16", monospace' }) }));
        plate.position.set(0, 2.55, 0.03);
        group.add(plate);
      },
    });
  },
};
