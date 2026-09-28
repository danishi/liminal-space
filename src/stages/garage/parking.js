import * as THREE from 'three';
import { modelSize } from '../../core/assets.js';
import * as P from '../../props/library.js';
import { signTexture } from '../../props/canvas.js';
import { carModel } from '../../entities/looks.js';
import { CS, PI, LANES } from './constants.js';
import { mBox } from './geometry.js';
import { PASTELS, pickPaint, ZERO, lightRig, proxyGeo, CarPark } from './cars.js';
import { trolley, tyreStack } from './props.js';

/** Parked cars and their stand-ins, whatever fills the empty bays, and the chained-off shafts. */
export function parking(world, lvl) {
  const { rng, K, sp, deckY, bays, d, shafts, kit, M } = lvl;

  // ---- which bays get cars --------------------------------------------------
  const blocked = new Set();
  const cars = [];
  const parked = [];
  for (const b of bays) {
    if (b.shaft) continue;
    // emptier the further (and deeper) you go
    if (!rng.chance(Math.max(0.1, 0.46 - b.u * 0.36))) continue;
    blocked.add(K(b.i, b.row.j));
    blocked.add(K(b.i, b.row.j + 1));
    const noseIn = rng.chance(0.6);
    const yaw = (noseIn === b.row.lane > 0 ? PI : 0) + rng.float(-0.05, 0.05);
    const x = b.x + rng.float(-0.12, 0.12);
    const z = b.z - b.row.lane * rng.float(0.1, 0.3);
    if (rng.chance(0.07)) {
      // someone's pride and joy, under a cover
      const s = modelSize('covered_car');
      const grp = new THREE.Group();
      kit.model(grp, 'covered_car', 0, 0, 0, 0, 4.4 / Math.max(s.z, 0.1));
      kit.add(grp, x, z, yaw, { y: b.y });
      world.addFootprint(x, z, s.x * (4.4 / s.z) - 0.05, 4.3, yaw);
      cars.push({ covered: true, x, z, y: b.y, bay: b });
      continue;
    }
    parked.push({ b, x, z, yaw });
  }
  let pastel = false;
  for (const { b, x, z, yaw } of parked) {
    const kind = rng.pick(['sedan', 'sedan', 'sedan', 'kei', 'kei', 'van']);
    // at least one little pastel kei car near the entrance
    const paintHex = kind === 'kei' && !pastel ? rng.pick(PASTELS) : pickPaint(rng, kind);
    if (PASTELS.includes(paintHex)) pastel = true;
    const sculpt = carModel(kind, paintHex);
    sculpt.children[0].userData.noBake = true;
    const root = new THREE.Group();
    root.add(sculpt);
    root.position.set(x, b.y, z);
    root.rotation.y = yaw;
    // only the cars around the spawn start sculpted (the rest swap in as you approach)
    sculpt.visible = Math.hypot(x - sp.x, z - sp.z) < 17;
    world.root.add(root);
    const size = sculpt.userData.size;
    world.addFootprint(x, z, size[0] - 0.05, size[1] - 0.1, yaw);
    cars.push({ group: root, sculpt, size, rig: lightRig(root, size), kind, paint: paintHex, x, z, y: b.y, yaw, bay: b, locker: rng.chance(0.4) });
  }
  const proxyPaint = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.15 });
  const proxyDark = new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.25, metalness: 0.2 });
  const pcol = new THREE.Color();
  for (const kind of ['sedan', 'kei', 'van']) {
    const list = cars.filter((c) => c.kind === kind);
    if (!list.length) continue;
    const [pg, dg] = proxyGeo(kind);
    const pm = new THREE.InstancedMesh(pg, proxyPaint, list.length);
    const dm = new THREE.InstancedMesh(dg, proxyDark, list.length);
    pm.frustumCulled = dm.frustumCulled = false;
    list.forEach((c, n) => {
      c.group.updateMatrix();
      const m = c.group.matrix.clone();
      c.proxyShown = !c.sculpt.visible;
      pm.setMatrixAt(n, c.proxyShown ? m : ZERO);
      dm.setMatrixAt(n, c.proxyShown ? m : ZERO);
      pm.setColorAt(n, pcol.set(c.paint));
      c.proxy = { pm, dm, n, m };
    });
    world.root.add(pm, dm);
  }
  // one of them has opinions about rhythm
  const honkers = cars.filter((c) => c.rig && d[K(c.bay.i, c.bay.row.j)] > 4 && d[K(c.bay.i, c.bay.row.j)] < 22);
  if (honkers.length) rng.pick(honkers).honker = true;
  for (const c of cars) {
    world.interactables.push({
      pos: new THREE.Vector3(c.x, c.y, c.z),
      aimHeight: 0.9,
      interactRange: 3.0,
      prompt: c.covered ? 'Look under the cover' : 'Look inside',
      interact: (game) => carPark.lookInside(c, game),
    });
  }
  const carPark = world.add(new CarPark(world, cars));

  // ---- empty bays: the things that end up in car parks ---------------------------
  const Mdl = {
    barrier: P.modelProp('concrete_road_barrier'),
    truck: P.modelProp('hand_truck', { jitter: 0.4 }),
    can: P.modelProp('metal_jerrycan', { jitter: 3 }),
    bin: P.modelProp('metal_trash_can', { scale: 0.9 }),
    bag: P.modelProp('trashbag', { jitter: 3 }),
    box: P.modelProp('cardboard_box_01', { jitter: 0.5, scaleJitter: 0.15 }),
    sign: P.modelProp('WetFloorSign_01', { jitter: 3 }),
    chair: P.modelProp('plastic_monobloc_chair_01'),
  };
  const EMPTY = [
    { w: 4, f: null, max: 0.7 },
    { w: 1.5, f: null },
    { w: 1.2, f: 'cones' },
    { w: 0.5, f: 'wet' },
    { w: 0.25, f: 'barrier' },
    { w: 0.6, f: 'tyres', min: 0.15 },
    { w: 0.4, f: 'truck', min: 0.2 },
    { w: 0.12, f: 'cans', min: 0.1 },
    { w: 0.5, f: 'trolley', min: 0.3 },
    { w: 0.6, f: 'rubbish', min: 0.35 },
    { w: 0.3, f: 'bin' },
    { w: 0.5, f: 'chair', min: 0.8 },
    { w: 0.4, f: 'coneCar', min: 0.9 },
    { w: 0.4, f: 'shoes', min: 0.7 },
  ];
  const puddles = [];
  // scanned props are dense meshes: cap the heaviest ones
  const caps = { barrier: 3, cans: 3, tyres: 6 };
  for (const b of bays) {
    if (b.shaft || blocked.has(K(b.i, b.row.j))) continue;
    const opts = EMPTY.filter((e) => b.u >= (e.min ?? -1) && b.u <= (e.max ?? 9) && (caps[e.f] ?? 1) > 0);
    const tot = opts.reduce((s, e) => s + e.w, 0);
    let r = rng.next() * tot;
    const e = opts.find((o) => (r -= o.w) <= 0) || opts[0];
    if (!e.f) continue;
    if (caps[e.f]) caps[e.f]--;
    blocked.add(K(b.i, b.row.j));
    blocked.add(K(b.i, b.row.j + 1));
    const inward = -b.row.lane;
    const at = (along, side = 0) => [b.x + side, b.front + inward * along];
    const yawIn = b.row.lane > 0 ? 0 : PI;
    const u = b.u;
    if (e.f === 'cones') {
      for (let n = rng.int(1, 3); n > 0; n--) {
        const [x, z] = at(rng.float(0.5, 2.5), rng.float(-0.8, 0.8));
        const c = P.trafficCone.build(kit, rng);
        if (rng.chance(0.15 + u * 0.3)) kit.add(c, x, z, rng.float(0, 6), { y: b.y + 0.12, rz: PI / 2 - 0.15 });
        else kit.add(c, x, z, 0, { y: b.y });
      }
    } else if (e.f === 'wet') {
      const [x, z] = at(rng.float(1.5, 3.5));
      kit.add(P.puddle.build(kit, rng), x, z, rng.float(0, 6), { y: b.y });
      kit.add(Mdl.sign.build(kit, rng), x + 0.6, z, rng.float(0, 6), { y: b.y, collide: [0.4, 0.4] });
      puddles.push([x, z, 0.9]);
    } else if (e.f === 'barrier') {
      const [x, z] = at(0.9);
      kit.add(Mdl.barrier.build(kit, rng), x, z, rng.float(-0.08, 0.08), { y: b.y, collide: Mdl.barrier.fp });
    } else if (e.f === 'tyres') {
      for (let n = rng.int(1, 2); n > 0; n--) {
        const [x, z] = at(rng.float(3.2, 4.4), rng.float(-0.6, 0.6));
        kit.add(tyreStack.build(kit, rng), x, z, 0, { y: b.y, collide: [0.6, 0.6] });
      }
    } else if (e.f === 'truck') {
      const [x, z] = at(4.3, rng.float(-0.5, 0.5));
      kit.add(Mdl.truck.build(kit, rng), x, z, yawIn + PI, { y: b.y, collide: [0.6, 0.6] });
    } else if (e.f === 'cans') {
      for (let n = 1; n > 0; n--) {
        const [x, z] = at(rng.float(3.5, 4.5), rng.float(-0.8, 0.8));
        kit.add(Mdl.can.build(kit, rng), x, z, rng.float(0, 6), { y: b.y });
      }
    } else if (e.f === 'trolley') {
      const [x, z] = at(rng.float(1.2, 3.5), rng.float(-0.4, 0.4));
      kit.add(trolley.build(kit, rng), x, z, rng.float(0, 6), { y: b.y, collide: [0.7, 0.7] });
    } else if (e.f === 'rubbish') {
      const [x, z] = at(4.1, rng.float(-0.6, 0.6));
      kit.add(Mdl.bag.build(kit, rng), x, z, rng.float(0, 6), { y: b.y });
      if (rng.chance(0.4)) kit.add(Mdl.box.build(kit, rng), x + rng.float(-0.8, 0.8), z + inward * -0.3, rng.float(0, 6), { y: b.y, collide: [0.5, 0.5] });
      if (rng.chance(0.5)) kit.add(P.paperScatter.build(kit, rng), x, z - inward * 1.5, rng.float(0, 6), { y: b.y });
    } else if (e.f === 'bin') {
      const [x, z] = at(4.3);
      kit.add(Mdl.bin.build(kit, rng), x, z, yawIn + PI, { y: b.y, collide: [0.6, 0.6] });
    } else if (e.f === 'chair') {
      // a chair in an empty bay, facing the wall
      const [x, z] = at(3.2);
      kit.add(Mdl.chair.build(kit, rng), x, z, yawIn, { y: b.y, collide: [0.5, 0.5] });
    } else if (e.f === 'coneCar') {
      // cones marking out exactly where a car used to be
      for (const [sx, sz] of [[-0.85, 0.3], [0.85, 0.3], [-0.85, 4.6], [0.85, 4.6], [-0.9, 2.45], [0.9, 2.45]]) {
        const [x, z] = at(sz, sx);
        kit.add(P.trafficCone.build(kit, rng), x, z, 0, { y: b.y });
      }
    } else if (e.f === 'shoes') {
      // a pair of shoes, neatly placed, where the driver's door would be
      const [x, z] = at(2.2, 1.0);
      kit.add(P.lostShoe.build(kit, rng), x - 0.1, z, yawIn, { y: b.y });
      kit.add(P.lostShoe.build(kit, rng), x + 0.1, z, yawIn, { y: b.y });
    }
  }
  // puddles under the drain pipes
  for (const L of LANES) {
    for (let n = 0; n < 3; n++) {
      const i = rng.int(3, 40);
      if (!rng.chance(0.4 + world.unease(i, L) * 0.4)) continue;
      const x = (i + 0.5) * CS;
      const z = (L + 1) * CS + 1.5 + rng.float(-0.4, 0.4);
      kit.add(P.puddle.build(kit, rng), x, z, rng.float(0, 6), { y: deckY(i, L) });
      puddles.push([x, z, 0.9]);
    }
  }

  // ---- shafts, chained off ----------------------------------------------------
  const chainMat = kit.std(0xd8c020, 0.5, 0.3);
  for (const b of shafts) {
    const x0 = b.i * CS - 0.25;
    const x1 = (b.i + 2) * CS + 0.25;
    const z0 = b.row.j * CS - 0.25;
    const z1 = (b.row.j + 2) * CS + 0.25;
    const pts = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    const grp = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const [ax, az] = pts[k];
      const [bx, bz] = pts[(k + 1) % 4];
      for (let s = 0; s <= 2; s++) {
        const px = ax + ((bx - ax) * s) / 2;
        const pz = az + ((bz - az) * s) / 2;
        kit.mesh(grp, mBox(0.1, 0.9, 0.1, { s: 0.6 }), M.hazard, px, 0.45, pz);
        kit.cyl(grp, 0.12, 0.14, 0.05, M.dark, px, 0.025, pz);
      }
      // sagging chain between posts
      for (let s = 0; s < 2; s++) {
        const sx = ax + ((bx - ax) * s) / 2;
        const sz = az + ((bz - az) * s) / 2;
        const ex = ax + ((bx - ax) * (s + 1)) / 2;
        const ez = az + ((bz - az) * (s + 1)) / 2;
        const n = 10;
        for (let q = 0; q < n; q++) {
          const t0 = q / n;
          const t1 = (q + 1) / n;
          const y0 = 0.82 - Math.sin(t0 * PI) * 0.25;
          const y1 = 0.82 - Math.sin(t1 * PI) * 0.25;
          const cx = sx + (ex - sx) * (t0 + t1) / 2;
          const cz = sz + (ez - sz) * (t0 + t1) / 2;
          const len = Math.hypot((ex - sx) / n, (ez - sz) / n, y1 - y0);
          const m = kit.cyl(grp, 0.015, 0.015, len, chainMat, cx, (y0 + y1) / 2, cz, 0, 0, 0, 5);
          m.lookAt(new THREE.Vector3(sx + (ex - sx) * t1, y1, sz + (ez - sz) * t1));
          m.rotateX(PI / 2);
        }
      }
    }
    kit.add(grp, 0, 0, 0, { y: b.y });
    // a warning sign on the nearest pillar side
    const sign = new THREE.Group();
    kit.plane(sign, 0.6, 0.3, kit.tex('g-shaftsign', signTexture('DANGER', 'Open shaft. Do not lean.', { bg: '#e0b21c', fg: '#141414', w: 512, h: 256 })), 0, 0, 0);
    kit.add(sign, (b.i + 1) * CS, b.front + b.row.lane * 0.26, b.row.lane > 0 ? 0 : PI, { y: b.y + 0.6 });
  }

  Object.assign(lvl, { blocked, cars, Mdl, puddles });
}
