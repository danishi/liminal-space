import * as THREE from 'three';
import * as P from '../../props/library.js';
import { PI, GAP, ALLEY, ROW_A, ALLEY0, ROW_B, H, Y_ALLEY, Y_TERR } from './constants.js';
import { SERIF, boardTexture } from './textures.js';
import { hangingPlate, utilityPole, postBox, woodPile } from './props.js';

/** The alley, the passages between the bathhouses and the roof terrace. */
export function outdoors(world, lvl) {
  const { rng, mods, at, kit, fixture, bakeSources, gapCols, T0, T1, rcx, rcz } = lvl;

  // ---- the alley: poles, wires, vending machines, a post box
  const poles = [];
  for (const x of [4.5, 13.5, 24.5, 33.5, 44.5, 53.5]) {
    const z = ALLEY0 + (poles.length % 2 ? ALLEY - 0.35 : 0.35);
    const yaw = poles.length % 2 ? PI : 0;
    kit.add(utilityPole(kit), x, z, yaw, { y: Y_ALLEY, collide: [0.34, 0.34] });
    const lz = z + (yaw ? -1.02 : 1.02);
    fixture(x, 4.6, lz, { intensity: 1.1, color: 0xffd0a0, visible: false });
    poles.push(new THREE.Vector3(x, Y_ALLEY, z));
  }
  {
    const wireMat = new THREE.LineBasicMaterial({ color: 0x0a0a0a });
    for (let n = 0; n < poles.length - 1; n++) {
      for (const [dy, dx] of [[6.8, -0.6], [6.8, 0.6], [7.6, -0.5], [7.6, 0.5]]) {
        const a = poles[n].clone().add(new THREE.Vector3(dx, dy + Y_ALLEY, 0));
        const b = poles[n + 1].clone().add(new THREE.Vector3(dx, dy + Y_ALLEY, 0));
        const pts = [];
        for (let t = 0; t <= 12; t++) {
          const p = a.clone().lerp(b, t / 12);
          p.y -= Math.sin((t / 12) * PI) * 0.45;
          pts.push(p);
        }
        world.root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
      }
    }
  }
  for (const m of mods) {
    const vx = m.row ? 3.2 : 13.8;
    const p = at(m, 0, vx, -0.4, PI);
    kit.add(P.vendingMachine.build(kit, rng), p.x, p.z, p.yaw, { y: Y_ALLEY, collide: [0.95, 0.75] });
    bakeSources.push({ pos: new THREE.Vector3(p.x + Math.sin(p.yaw) * 0.8, 1.2, p.z + Math.cos(p.yaw) * 0.8), color: new THREE.Color(0.9, 0.95, 1), intensity: 3, range: 6 });
    if (m.idx === 4) {
      const q = at(m, 0, 12.2, -0.6, PI);
      kit.add(postBox(kit), q.x, q.z, 0, { y: Y_ALLEY, collide: [0.46, 0.46] });
    }
    const t = at(m, 0, m.row ? 14.8 : 2.2, -0.35, PI);
    const can = new THREE.Group();
    kit.model(can, 'metal_trash_can', 0, 0, 0, rng.float(0, 6), 0.8);
    kit.add(can, t.x, t.z, 0, { y: Y_ALLEY, collide: [0.5, 0.5] });
  }
  // passages: pipes, a boiler, firewood, gas meters
  for (const c0 of gapCols) {
    for (const [j0, j1] of [[ROW_A + 7, ALLEY0 - 1], [ROW_B + 1, H - 3]]) {
      for (const [x, face] of [[c0 + 0.06, 1], [c0 + GAP - 0.06, -1]]) {
        const pipes = new THREE.Group();
        for (const [y, r, col] of [[2.55, 0.06, 0x7a6a5a], [2.8, 0.035, 0x8a8a88], [0.35, 0.05, 0x5a5048]]) kit.cyl(pipes, r, r, j1 - j0, kit.std(col, 0.5, 0.6), x + face * r * 1.5, y, (j0 + j1) / 2, PI / 2);
        kit.add(pipes, 0, 0, 0);
      }
    }
    for (const [j, face] of [[ROW_A + 12, 1], [ROW_B + 8, -1], [ROW_A + 22, -1]]) {
      const x = face > 0 ? c0 + 0.45 : c0 + GAP - 0.45;
      kit.add(woodPile(kit, rng, 1.6), x, j + 0.5, PI / 2, { y: 0, collide: [1.6, 0.6] });
    }
    for (const j of [ROW_A + 18, ROW_B + 14]) {
      const u2 = new THREE.Group();
      kit.model(u2, 'utility_box_01', 0, 0, 0, 0, 0.8);
      kit.add(u2, c0 + GAP - 0.2, j, -PI / 2, { y: 1.1 });
      const tb = new THREE.Group();
      kit.model(tb, 'trashbag', 0, 0, 0, rng.float(0, 6), 0.9);
      kit.add(tb, c0 + 0.5, j + 4, 0, { y: 0 });
    }
    // boiler tank
    const boiler = new THREE.Group();
    kit.cyl(boiler, 0.55, 0.55, 2.2, kit.std(0x5a6a6a, 0.5, 0.6), 0, 1.1, 0, 0, 0, 0, 16);
    kit.cyl(boiler, 0.1, 0.1, 3.5, kit.std(0x3a3a3a, 0.6, 0.6), 0, 3.4, 0);
    kit.cyl(boiler, 0.12, 0.12, 0.05, kit.std(0xe8e8e0, 0.3), 0.3, 1.5, 0.46, PI / 2);
    kit.add(boiler, c0 + 1.5, ROW_B + GAP + 20.5, 0, { y: 0, collide: [1.1, 1.1] });
    bakeSources.push({ pos: new THREE.Vector3(c0 + 1.5, 0.4, ROW_B + 23.2), color: new THREE.Color(1, 0.5, 0.2), intensity: 1.5, range: 4 });
  }

  // ---- roof terrace: fence, lanterns, rocks around the open-air bath
  {
    const lanterns = [[T0 + 1.5, 2.0], [T1 - 0.5, 2.0], [T0 + 1.5, 8.2], [T1 - 0.5, 8.2], [rcx - 9, 5], [rcx + 9, 5], [rcx - 4, 1.5], [rcx + 4, 1.5], [rcx - 5, 8.4], [rcx + 5.5, 8.4]];
    for (const [x, z] of lanterns) {
      kit.add(P.stoneLantern.build(kit, rng), x, z, 0, { y: Y_TERR, collide: [0.5, 0.5] });
      bakeSources.push({ pos: new THREE.Vector3(x, Y_TERR + 1.3, z), color: new THREE.Color(1, 0.65, 0.3), intensity: 3.2, range: 7 });
    }
    for (let a = 0; a < PI * 2; a += PI / 6) {
      const x = rcx + Math.cos(a) * 8.2;
      const z = rcz + Math.sin(a) * 3.5;
      if (Math.sin(a) > 0.3 && Math.abs(Math.cos(a)) < 0.6) continue; // the way in
      const rk = new THREE.Group();
      kit.model(rk, 'rock_moss_set_01', 0, 0, 0, rng.float(0, 6), rng.float(0.2, 0.28));
      kit.add(rk, x, z, 0, { y: Y_TERR - 0.15 });
    }
    const sign = boardTexture('roten', 512, 160, [70, 44, 24], [['露天風呂', 0.55, '#f4e8c8', 900, SERIF], ['OPEN-AIR BATH', 0.25, '#e8d0a0', 700]], { wood: true });
    kit.add(hangingPlate(kit, sign, 1.2, 0.38, 0, 0, 0, 0, { glow: 0.3 }), rcx, 1.03, 0, { y: Y_TERR + 1.7 });
    const bucket = new THREE.Group();
    kit.model(bucket, 'wooden_bucket_02', 0, 0, 0, 0, 0.8);
    kit.add(bucket, rcx + 4, 8.3, 0, { y: Y_TERR, collide: [0.4, 0.4] });
  }
}
