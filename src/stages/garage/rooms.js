import * as THREE from 'three';
import { wallMounts } from '../../core/grid.js';
import { keep } from '../../props/kit.js';
import * as P from '../../props/library.js';
import { signTexture, screenStatic } from '../../props/canvas.js';
import { exitSign } from '../../core/textures.js';
import { CS, H, P6, P7, PI, LANES } from './constants.js';
import { wallText } from './textures.js';
import { mBox } from './geometry.js';

/** Service doors, the office, machine room and stairwell, safety mirrors, hanging signs and painted level numbers. */
export function rooms(world, lvl) {
  const { rng, g, room, laneOf, crossOf, deckY, kit, M, Mdl, frame } = lvl;

  // ---- doorways, rooms --------------------------------------------------------
  const used = (world.usedMounts = new Set());
  for (const m of wallMounts(g)) {
    if ((m.j === 17 && [8, 26, 31].includes(m.i)) || (m.i >= 43 && m.j <= 5) || (m.i >= 41 && m.j === 20)) used.add(`${m.i},${m.j},${m.nx},${m.nz}`);
  }
  const doorway = (i, j, open = 0.9) => {
    // a steel door set in a wall that fills the rest of the cell
    const x = (i + 0.5) * CS;
    const z = (j + 1) * CS;
    const grp = new THREE.Group();
    const side = (CS - 1.0) / 2;
    for (const s of [-1, 1]) kit.mesh(grp, mBox(side, H, 0.2, { off: [s, 0] }), M.concrete, s * (0.5 + side / 2), H / 2, 0);
    kit.mesh(grp, mBox(1.0, H - 2.1, 0.2), M.concrete, 0, 2.1 + (H - 2.1) / 2, 0);
    for (const s of [-1, 1]) kit.box(grp, 0.06, 2.1, 0.24, frame, s * 0.53, 1.05, 0);
    kit.box(grp, 1.12, 0.06, 0.24, frame, 0, 2.13, 0);
    const leaf = kit.box(grp, 0.96, 2.06, 0.05, kit.std(0x6a7074, 0.45, 0.5), 0, 1.03, 0);
    leaf.position.set(-0.48 + Math.cos(open * 1.4) * 0.48, 1.03, Math.sin(open * 1.4) * 0.48 + 0.1);
    leaf.rotation.y = -open * 1.4;
    kit.add(grp, x, z, 0);
    world.addBox(x - CS / 2, z - 0.1, x - 0.5, z + 0.1);
    world.addBox(x + 0.5, z - 0.1, x + CS / 2, z + 0.1);
    return grp;
  };
  doorway(8, 16);
  doorway(26, 16, 0.6);
  doorway(31, 16, 1.0);
  // green running-man signs over the stairwell
  const exitMat = kit.mat('exit', () => new THREE.MeshStandardMaterial({ map: exitSign(), emissiveMap: exitSign(), emissive: 0xffffff, emissiveIntensity: 1.3, roughness: 0.3 }));
  const exitBox = (x, y, z, yaw) => {
    const e = new THREE.Group();
    kit.box(e, 0.5, 0.2, 0.08, kit.std(0xe8e8e2, 0.4), 0, 0, 0);
    keep(kit.plane(e, 0.46, 0.17, exitMat, 0, 0, 0.041));
    kit.add(e, x, z, yaw, { y });
  };
  exitBox(31.5 * CS, 2.38, 17 * CS - 0.15, PI);
  exitBox(30.5 * CS, P7 + 2.2, 24 * CS + 0.05, 0);
  const plate = (text, sub, x, y, z, yaw, bg = '#e8e6de', fg = '#1a1a1a') => {
    const e = new THREE.Group();
    kit.plane(e, 0.7, 0.2, kit.tex(`g-plate:${text}`, signTexture(text, sub, { bg, fg, w: 512, h: 144 })), 0, 0, 0);
    kit.add(e, x, z, yaw, { y });
  };
  plate('STAIRS', 'P6 · P7', 31.5 * CS - 0.95, 1.6, 17 * CS - 0.11, PI);
  plate('OFFICE', 'Staff only', 8.5 * CS - 0.95, 1.6, 17 * CS - 0.11, PI);
  plate('MACHINE ROOM', 'Keep out', 26.5 * CS - 0.95, 1.6, 17 * CS - 0.11, PI, '#e0b21c', '#141414');

  // office: a desk facing the door, CCTV that shows only empty bays
  const office = new THREE.Group();
  kit.model(office, 'metal_office_desk', 8.5 * CS, 0, 20.6 * CS, PI, 0.95);
  kit.model(office, 'plastic_monobloc_chair_01', 8.4 * CS, 0, 20.05 * CS, 0.3);
  for (let k = 0; k < 3; k++) {
    kit.box(office, 0.42, 0.34, 0.36, kit.std(0x2a2a2a, 0.5), 8.5 * CS - 0.5 + k * 0.5, 0.75 + 0.17, 20.7 * CS);
    const scr = kit.plane(office, 0.34, 0.26, new THREE.MeshBasicMaterial({ map: screenStatic(k + 5), color: new THREE.Color(0.55, 0.8, 0.6) }), 8.5 * CS - 0.5 + k * 0.5, 0.93, 20.7 * CS - 0.185, 0, PI, 0);
    keep(scr).userData.noBake = true;
  }
  kit.add(office, 0, 0, 0);
  world.addBox(8.5 * CS - 1, 20.2 * CS, 8.5 * CS + 1, 21 * CS);
  kit.add(P.filingCabinet.build(kit, rng), 6.2 * CS, 21 * CS - 0.32, PI, { collide: [0.5, 0.6] });
  kit.add(P.lockers.build(kit, rng, { color: 0x8a9088 }), 11 * CS - 0.27, 19.5 * CS, -PI / 2, { collide: [0.9, 0.5] });
  kit.add(P.wallClock.build(kit, rng, {}), 8.5 * CS, 21 * CS - 0.02, PI, { y: 2.1 });
  kit.add(Mdl.box.build(kit, rng), 6.3 * CS, 18.3 * CS, 0.3, { collide: [0.5, 0.5] });
  // machine room: switchboards humming to themselves
  for (let k = 0; k < 3; k++) {
    const sb = new THREE.Group();
    kit.box(sb, 0.9, 2.0, 0.5, kit.std(0x8a8e88, 0.45, 0.4), 0, 1.0, 0);
    for (let v = 0; v < 6; v++) kit.box(sb, 0.6, 0.02, 0.02, M.dark, 0, 0.3 + v * 0.06, 0.26);
    keep(kit.sphere(sb, 0.02, kit.glow(k === 1 ? 0xff3020 : 0x30ff60, 2.5), 0.3, 1.7, 0.26));
    kit.add(sb, (25.2 + k * 1.2) * CS + 0.4, 21 * CS - 0.3, PI, { collide: [0.9, 0.5] });
  }
  for (let k = 0; k < 3; k++) kit.add(P.modelProp('power_box_01', { place: 'high', collide: false }).build(kit, rng), 25 * CS + 0.01, 18.6 * CS + k * 0.9, PI / 2, { y: 1.3 });
  kit.add(P.modelProp('utility_box_01').build(kit, rng), 29 * CS - 0.25, 18.6 * CS, -PI / 2, { collide: [0.5, 0.5] });
  for (let k = 0; k < 2; k++) kit.add(Mdl.can.build(kit, rng), 28.6 * CS + rng.float(-0.3, 0.3), 19.9 * CS + k * 0.3, rng.float(0, 6));
  plate('DANGER', 'High voltage', 26.4 * CS, 1.3, 21 * CS - 0.57, PI, '#e0b21c', '#141414');
  // stairwell lobby and landing
  kit.add(P.modelProp('korean_fire_extinguisher_01').build(kit, rng), 32.8 * CS, 18.2 * CS, -PI / 2);
  kit.add(Mdl.bin.build(kit, rng), 32.7 * CS, 18.8 * CS, -PI / 2, { collide: [0.6, 0.6] });
  plate('P7', 'Parking level', 32.5 * CS, P7 + 1.7, 21 * CS + 0.02, 0, '#1f5a8a', '#fff');
  // P5: full, apparently
  const p5 = new THREE.Group();
  const p5t = signTexture('P5 FULL', 'Also P4, P3, P2 and P1. Please park on P6.', { bg: '#141414', fg: '#ff5a30', w: 1024, h: 384 });
  kit.plane(p5, 2.4, 0.9, kit.tex('g-p5', p5t, { emissiveMap: p5t, emissive: 0xffffff, emissiveIntensity: 0.7 }), 0, 0, 0);
  kit.add(p5, 42 * CS, 21 * CS - 0.03, PI, { y: 1.35 + 1.6 });
  for (const x of [41.5, 42.5]) kit.add(Mdl.barrier.build(kit, rng), x * CS, 20.7 * CS, PI, { y: 1.35, collide: Mdl.barrier.fp });
  for (let k = 0; k < 3; k++) kit.add(P.trafficCone.build(kit, rng), (41.2 + k * 0.6) * CS, 20.1 * CS, 0, { y: 1.35 });

  // convex safety mirrors where the lanes meet the end walls
  const mirrorMat = kit.mat('mirror', () => new THREE.MeshStandardMaterial({ color: 0x6c7276, metalness: 1, roughness: 0.06 }));
  const rimMat = kit.std(0xe06a1c, 0.5, 0.1);
  for (const L of LANES) {
    for (const [x, face] of [[1 * CS, 1], [43 * CS, -1]]) {
      if (face < 0 && L === 3) continue; // the entrance is there
      const m = new THREE.Group();
      const tilt = new THREE.Group();
      tilt.rotation.x = 0.25;
      m.add(tilt);
      kit.mesh(tilt, new THREE.SphereGeometry(0.6, 24, 8, 0, PI * 2, 0, 0.5), mirrorMat, 0, 0, -0.447, PI / 2, 0, 0);
      kit.torus(tilt, 0.288, 0.025, rimMat, 0, 0, 0.08);
      kit.box(m, 0.05, 0.05, 0.22, M.steel, 0, 0.05, -0.1);
      kit.add(m, x + face * 0.2, (L + 1) * CS + face * 1.4, face > 0 ? PI / 2 - 0.5 : -PI / 2 - 0.5, { y: deckY(2, L) + 2.05 });
    }
  }

  // ---- signs --------------------------------------------------------------
  const hang = (text, sub, x, y, z, yaw, bg = '#1f6b3a') => {
    const s = new THREE.Group();
    const tex = signTexture(text, sub, { bg, fg: '#ffffff', w: 512, h: 128 });
    const face = kit.mat(`hang:${text}:${sub}`, () => new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.45, roughness: 0.4 }));
    kit.box(s, 1.5, 0.38, 0.06, kit.std(0x2a2c2e, 0.4, 0.6), 0, -0.5, 0);
    kit.plane(s, 1.44, 0.34, face, 0, -0.5, 0.031);
    kit.plane(s, 1.44, 0.34, face, 0, -0.5, -0.031, 0, PI, 0);
    for (const sx of [-0.6, 0.6]) kit.cyl(s, 0.008, 0.008, 0.3, M.steel, sx, -0.16, 0);
    kit.add(s, x, z, yaw, { y });
  };
  for (const c of [1, 21]) {
    hang('P7', 'Ramp down ↓', (c + 1) * CS, H + P6 - 0.5, 14.8 * CS, 0);
    hang('P6', 'Ramp up ↑', (c + 1) * CS, H + P7 - 0.5, 25.5 * CS, 0);
    // clearance bar over the ramp mouth
    const bar = new THREE.Group();
    kit.mesh(bar, mBox(2 * CS - 0.2, 0.18, 0.12, { s: 0.7 }), M.hazard, 0, 0, 0);
    for (const sx of [-2.2, 2.2]) kit.cyl(bar, 0.012, 0.012, 0.36, M.steel, sx, 0.27, 0, 0, 0, 0, 5);
    kit.plane(bar, 0.9, 0.2, kit.tex('g-clear', signTexture('HEADROOM 2.1 m', '', { bg: '#e0b21c', fg: '#141414', w: 512, h: 112 })), 0, -0.2, -0.065, 0, PI, 0);
    kit.add(bar, (c + 1) * CS, 16.9 * CS, 0, { y: H - 0.63 });
  }
  hang('P5', 'Ramp up ↑', 42 * CS, H - 0.5, 14.8 * CS, 0);
  hang('STAIRS', 'P6 · P7', 31.5 * CS, H - 0.5, 15.2 * CS, 0);
  hang('EXIT →', 'Pedestrians', 38 * CS, H - 0.5, 4 * CS, PI / 2);
  hang('← EXIT', 'Pedestrians', 12 * CS, H - 0.5, 10 * CS, PI / 2);
  hang('EXIT →', 'Pedestrians', 10 * CS, P7 + H - 0.5, 25 * CS, PI / 2);
  // big painted level numbers on the walls
  const levelMounts = rng.shuffle(wallMounts(g).filter((m) => !room(m.i, m.j) && !used.has(`${m.i},${m.j},${m.nx},${m.nz}`) && (laneOf(m.j) !== undefined || crossOf(m.i) !== undefined) && m.i < 43));
  const painted = [];
  for (const m of levelMounts) {
    if (painted.length >= 18) break;
    if (painted.some((o) => Math.abs(o.i - m.i) + Math.abs(o.j - m.j) < 6)) continue;
    painted.push(m);
    used.add(`${m.i},${m.j},${m.nx},${m.nz}`);
    const u = world.unease(m.i, m.j);
    let text = m.y < -1 ? 'P7' : 'P6';
    if (u > 1.0 && rng.chance(0.3)) text = rng.pick(['P6', 'P6?', 'P∞']);
    const mat = kit.mat(`wt:${text}`, () => new THREE.MeshStandardMaterial({ map: wallText(text, '#d88428'), alphaTest: 0.35, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }));
    const e = new THREE.Group();
    kit.plane(e, 1.9, 0.95, mat, 0, 0, 0);
    kit.add(e, m.x + m.nx * 0.015, m.z + m.nz * 0.015, Math.atan2(m.nx, m.nz), { y: m.y + 1.95 });
  }
}
