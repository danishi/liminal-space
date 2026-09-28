import * as THREE from 'three';
import { FLOOR } from '../../core/grid.js';
import { decorate } from '../common.js';
import { keep } from '../../props/kit.js';
import { modelSize } from '../../core/assets.js';
import * as P from '../../props/library.js';
import { signTexture } from '../../props/canvas.js';
import { PI, CS, W, HH, ATRIUM, PIT, FOOD, Z } from './constants.js';
import { STYLES, signTex, menuTex, directoryTex } from './textures.js';
import { G, cart, planter, stall, keyKiosk, securityDesk, directoryStand, fountain } from './props.js';

/** Islands, directories, the desk, fountain, food court, restrooms, strays and scattered props; ends by merging the kit's meshes. */
export function concourse(world, lvl) {
  const { rng, depth, g, zones, K, dist, escSet, holes, zoneOf, kit, claimed, claim, toWorld, shared, signFor, steel, tileMat } = lvl;
  // ---- the concourse -------------------------------------------------------------------
  const pitSet = (i, j) => (i >= 22 && i <= 26 && j >= 15 && j <= 21) || (i >= 42 && i <= 50 && j >= 19 && j <= 25);
  // islands down the middle: planters with benches, a key kiosk, the directory, the ride
  const islands = [];
  for (let i = 8; i <= 50; i += 4) {
    if (i >= 20 && i <= 28) continue;
    islands.push(i);
  }
  let kiddie = null;
  const keysSign = new THREE.MeshStandardMaterial({ map: signTex('Mr. Keys', STYLES[4], new Set()), emissive: 0xffffff, roughness: 0.4 });
  keysSign.emissiveMap = keysSign.map;
  keysSign.emissiveIntensity = 0.9;
  const directories = [];
  islands.forEach((i, n) => {
    const x = (i + 0.5) * CS;
    const z = 15.5 * CS;
    const u = world.uneaseAt(x, z);
    for (let a = i - 1; a <= i + 1; a++) for (let b = 14; b <= 17; b++) claimed.add(`${a},${b}`);
    if (n === 0) {
      directories.push({ x, z, yaw: -PI / 2 });
      kit.add(planter(kit, rng, { w: 1.6, d: 1.6 }), x + 2.2, z, 0, { collide: [1.7, 1.7] });
    } else if (n === 2) {
      kit.add(keyKiosk(kit, rng, keysSign), x, z, 0, { collide: [2.3, 1.2] });
    } else if (n === 4) {
      kiddie = { x, z: z + 0.6, yaw: 0.4 };
      kit.add(planter(kit, rng, { w: 1.4, d: 1.4, dead: u > 0.7 }), x - 2.4, z, 0, { collide: [1.5, 1.5] });
    } else if (n === islands.length - 2) {
      directories.push({ x, z, yaw: -PI / 2 });
    } else {
      // long planter with benches back to back
      const dead = u > 0.75 && rng.chance(0.6);
      kit.add(planter(kit, rng, { w: 3.2, d: 1.4, dead }), x, z, 0, { collide: [3.3, 1.5] });
      for (const s of [-1, 1]) {
        if (u > 0.6 && rng.chance(0.3)) continue;
        const b = G();
        kit.model(b, 'modular_street_seating', 0, 0, 0, 0, 1);
        const sz = modelSize('modular_street_seating');
        kit.add(b, x, z + s * (0.75 + sz.z / 2 + 0.05), s > 0 ? 0 : PI, { collide: [sz.x, sz.z] });
      }
      const tc = G();
      kit.model(tc, 'metal_trash_can', 0, 0, 0, 0, 0.85);
      kit.add(tc, x + 2.75, z, PI / 2, { collide: [1.6, 0.5] });
    }
  });
  // directory stars: one where you are, more where you aren't
  for (const d of directories) {
    const [i, j] = g.cellOf(d.x, d.z);
    const u = world.unease(i, j);
    const stars = [[i, j]];
    const extra = u > 0.9 ? 6 : u > 0.5 ? 2 : 0;
    for (let n = 0; n < extra; n++) {
      const c = rng.pick(g.openCells());
      stars.push(rng.chance(0.3) ? [rng.int(1, W - 2), rng.int(1, HH - 2)] : c);
    }
    d.u = u;
    const tex = directoryTex(g, zones, stars, u > 0.9);
    const m = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.3 });
    kit.add(directoryStand(kit, m), d.x, d.z, d.yaw, { collide: [0.5, 1.5] });
  }

  // security desk inside the entrance, and its guard
  const deskX = 6.4 * CS;
  const deskZ = 17.6 * CS;
  kit.add(securityDesk(kit), deskX, deskZ, PI, { collide: [2.7, 0.85] });
  for (let a = 5; a <= 8; a++) for (let b = 16; b <= 18; b++) claimed.add(`${a},${b}`);
  const chairX = deskX - 1.95;
  const chairZ = deskZ + 0.15;
  kit.add(P.officeChair.build(kit, rng), chairX, chairZ, PI, {});

  // fountain in the sunken court
  const fx = 24.5 * CS;
  const fz = 18.5 * CS;
  kit.add(fountain(kit, rng, tileMat), fx, fz, 0, { y: PIT });
  world.addCircle(new THREE.Vector3(fx, 0, fz), 2.7);
  for (const [x, z] of [[21.5, 19.5], [27.5, 19.5]]) {
    const b = G();
    kit.model(b, 'modular_street_seating', 0, 0, 0, 0, 1);
    const sz = modelSize('modular_street_seating');
    kit.add(b, x * CS, z * CS + 0.3, x < 24 ? PI / 2 : -PI / 2, { collide: [sz.x, sz.z] });
  }
  for (let a = 21; a <= 27; a++) for (let b = 15; b <= 23; b++) claimed.add(`${a},${b}`);
  // low tables by the fountain for the tired
  for (const x of [21.6, 27.4]) {
    const t = G();
    kit.model(t, 'coffee_table_round_01', 0, 0, 0, 0, 0.8);
    kit.add(t, x * CS, 22.6 * CS, rng.float(0, 6), { collide: { r: 0.5 } });
  }

  // food court: stalls along the walls, tables in the pit
  const stallDefs = rng.shuffle([
    ['Pretzel Palace', [['Salted pretzel', '$1.25'], ['Cinnamon pretzel', '$1.50'], ['Lemonade', '$0.99'], ['Nothing', '$0.00']]],
    ['Wok This Way', [['Orange chicken', '$3.49'], ['Free sample', 'always'], ['Egg roll', '$0.89'], ['Fortune', 'pending']]],
    ['Hot Dog Hut', [['Hot dog', '$1.99'], ['Corn dog', '$2.25'], ['Hot dog (cold)', '$1.99'], ['Refills', 'forever']]],
    ['Slice Station', [['Cheese slice', '$1.75'], ['Pepperoni', '$2.00'], ['Slice of life', 'sold out'], ['Soda', '$0.89']]],
    ['Cinnamon Cloud', [['Classic roll', '$2.49'], ['Minibons', '$1.99'], ['Coffee', '$0.99'], ['Hope', 'n/a']]],
  ]);
  const stallSpots = [[43.5 * CS, 26 * CS, PI], [46 * CS - 0.2, 26 * CS, PI], [52 * CS, 20.5 * CS, -PI / 2], [52 * CS, 23.2 * CS, -PI / 2]];
  stallSpots.forEach(([x, z, yaw], n) => {
    const [name, menu] = stallDefs[n];
    const u = world.uneaseAt(x, z);
    const st = rng.pick(STYLES);
    const dead = new Set();
    if (u > 0.5) for (let k = 0; k < Math.floor((u - 0.3) * 4); k++) dead.add(rng.int(0, name.length - 1));
    const [wx, wz] = toWorld(x, z, yaw, 0, 1.0);
    kit.add(stall(kit, rng, name, st, dead, menuTex(name, menu), shared.glass), wx, wz, yaw, {});
    const [cx, cz] = toWorld(x, z, yaw, 0, 1.2);
    world.addFootprint(cx, cz, 3.8, 0.9, yaw);
    const [ci, cj] = g.cellOf(wx, wz);
    for (let a = ci - 1; a <= ci + 1; a++) for (let b = cj - 1; b <= cj + 1; b++) claimed.add(`${a},${b}`);
    for (let a = ci - 1; a <= ci + 1; a++) {
      if (yaw === PI) claim(a, 25, 0, -1);
      else claim(51, cj + a - ci, -1, 0);
    }
  });
  {
    // hanging FOOD COURT sign
    const fc = signFor('FOOD COURT', 46.5 * CS, 20 * CS);
    const hs = G();
    kit.box(hs, 6.2, 1.1, 0.14, kit.std(0x1b1917, 0.4), 0, 0, 0);
    for (const s of [-1, 1]) keep(kit.plane(hs, 6.0, 1.0, fc.mat, 0, 0, s * 0.071, 0, s < 0 ? PI : 0, 0));
    for (const x of [-2.6, 2.6]) kit.cyl(hs, 0.01, 0.01, 2.3, steel, x, 1.7, 0, 0, 0, 0, 6);
    kit.add(hs, 46.5 * CS, 19.4 * CS, 0, { y: 4.95 });
  }
  for (let n = 0; n < 6; n++) {
    const x = (43.8 + (n % 3) * 2.6) * CS;
    const z = (21.5 + Math.floor(n / 3) * 1.6) * CS;
    const u = world.uneaseAt(x, z);
    const tg = G();
    // laminate pedestal table with scanned stools
    kit.cyl(tg, 0.45, 0.45, 0.04, kit.std(0xf0ece2, 0.35), 0, 0.74, 0, 0, 0, 0, 24);
    kit.cyl(tg, 0.46, 0.46, 0.02, kit.std(0x8a6a3a, 0.4, 0.6), 0, 0.72, 0, 0, 0, 0, 24);
    kit.cyl(tg, 0.04, 0.04, 0.72, steel, 0, 0.36, 0, 0, 0, 0, 10);
    kit.cyl(tg, 0.28, 0.3, 0.03, steel, 0, 0.015, 0, 0, 0, 0, 20);
    const chairs = u > 0.8 ? rng.int(0, 1) : 2;
    for (let c = 0; c < chairs; c++) {
      const a = (c / Math.max(1, chairs)) * PI * 2 + rng.float(-0.3, 0.3);
      const r = u > 0.9 && rng.chance(0.5) ? rng.float(1.2, 2.2) : 0.95;
      kit.model(tg, 'bar_chair_round_01', Math.cos(a) * r, 0, Math.sin(a) * r, -a + PI / 2, 0.62);
    }
    kit.add(tg, x, z, rng.float(0, 6), { y: FOOD, collide: { r: 0.45 } });
  }
  for (let a = 42; a <= 50; a++) for (let b = 20; b <= 24; b++) claimed.add(`${a},${b}`);
  // staff door out of the food court
  kit.add(P.fakeDoor.build(kit, rng), 48.5 * CS, 26 * CS - 0.02, PI, {});
  kit.add((() => {
    const p = G();
    kit.plane(p, 0.8, 0.2, kit.tex('emponly', signTexture('EMPLOYEES ONLY', '', { bg: '#b01c1c', fg: '#ffffff', w: 512, h: 128 })), 0, 0, 0);
    return p;
  })(), 48.5 * CS, 26 * CS - 0.1, PI, { y: 2.35 });

  // restrooms corridor: sign over the way in, doors on both sides
  {
    const rs = G();
    kit.box(rs, 2.3, 0.45, 0.08, kit.std(0x1d4f8a, 0.4), 0, 0, 0);
    kit.plane(rs, 2.2, 0.4, kit.tex('restsign', signTexture('RESTROOMS', 'Telephones · Water fountain', { bg: '#1d4f8a', fg: '#ffffff', w: 512, h: 96 })), 0, 0, 0.041);
    kit.add(rs, 24.5 * CS, 24 * CS - 0.06, PI, { y: 3.4 });
    for (const [x, yaw, label] of [[24 * CS + 0.02, PI / 2, 'MEN'], [25 * CS - 0.02, -PI / 2, 'WOMEN']]) {
      const d = P.fakeDoor.build(kit, rng);
      kit.plane(d, 0.34, 0.18, kit.tex(`rest${label}`, signTexture(label, '', { bg: '#1d4f8a', fg: '#fff', w: 256, h: 128 })), 0, 1.6, 0.07);
      kit.add(d, x, 25.5 * CS, yaw, {});
      claim(24, 25, yaw > 0 ? 1 : -1, 0);
    }
  }

  // wet-floor signs guarding the missing floor
  for (const [i, j] of holes) {
    let best = null;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!g.standable(i + dx, j + dy)) continue;
      if (!best || dist[K(i + dx, j + dy)] < dist[K(best[0], best[1])]) best = [i + dx, j + dy];
    }
    if (!best) continue;
    const c = g.center(i, j);
    const bx = (c.x + (best[0] + 0.5) * CS) / 2;
    const bz = (c.z + (best[1] + 0.5) * CS) / 2;
    const sg = G();
    kit.model(sg, 'WetFloorSign_01', 0, 0, 0, rng.float(-0.4, 0.4), 1);
    kit.add(sg, bx, bz, Math.atan2(best[0] - i, best[1] - j), { y: g.heightOf(...best), collide: { r: 0.2 } });
    claimed.add(`${best[0]},${best[1]}`);
  }
  // a lost balloon or two against the skylights
  for (let n = 0; n < 1 + (depth > 1 ? 2 : 0); n++) {
    const x = rng.float(8, 50) * CS;
    const u = world.uneaseAt(x, 15 * CS);
    const b = P.balloon.build(kit, rng, { grey: u > 1 });
    kit.add(b, x, rng.float(13.5, 17.5) * CS, 0, { y: ATRIUM - 2.3 });
  }
  // shopping carts left where they stopped
  for (let n = 0; n < 3 + depth; n++) {
    const cell = world.pickFarCells(1, { minFrac: 0.1, spacing: 1, filter: (i, j) => zoneOf(i, j) === Z.PUB && g.get(i, j) === FLOOR && !g.ramp[K(i, j)] && !claimed.has(`${i},${j}`) && g.heightOf(i, j) === 0 })[0];
    if (!cell) break;
    const c = g.center(...cell);
    const u = world.unease(...cell);
    claimed.add(`${cell[0]},${cell[1]}`);
    kit.add(cart.build(kit, rng, { tipped: u > 0.7 && rng.chance(0.5) }), c.x + rng.float(-0.6, 0.6), c.z + rng.float(-0.6, 0.6), rng.float(0, PI * 2), { collide: [0.6, 1.0] });
  }

  // ---- scattered props, by zone ---------------------------------------------------------
  const keepFor = (zone) => (i, j) => zoneOf(i, j) !== zone || claimed.has(`${i},${j}`) || escSet.has(K(i, j)) || g.ramp[K(i, j)] > 0 || pitSet(i, j);
  const M = {
    trash: P.modelProp('metal_trash_can', { scale: 0.85 }),
    plant: P.modelProp('potted_plant_02', { scale: 1.2 }),
    cam: P.modelProp('security_camera_01', { place: 'high', y: 2.5, collide: false }),
    sign: P.modelProp('WetFloorSign_01', { jitter: 3 }),
    box: P.modelProp('cardboard_box_01', { jitter: 0.3, scaleJitter: 0.2 }),
    truck: P.modelProp('hand_truck', { jitter: 0.3 }),
    bag: P.modelProp('trashbag', { jitter: 3 }),
    suitcase: P.modelProp('vintage_suitcase', { jitter: 3, scale: 0.8 }),
  };
  decorate(world, kit, {
    density: { wall: 0.1, high: 0.08, floor: 0.025, clutter: 0.035, ceil: 0 },
    keepClear: keepFor(Z.PUB),
    wall: [
      { p: M.trash, w: 2 }, { p: M.plant, w: 2 }, { p: P.vendingMachine, w: 0.8 }, { p: P.gumball, w: 0.8 }, { p: cart, w: 0.8 },
      { p: P.bench, w: 1 }, { p: P.fakeDoor, w: 1, min: 0.75 }, { p: P.tvStatic, w: 0.6, min: 0.9 },
    ],
    high: [{ p: M.cam, w: 1.5 }, { p: P.poster, w: 1.2 }, { p: P.wallClock, w: 0.5 }, { p: P.handprints, w: 1, min: 0.85 }],
    floor: [{ p: M.sign, w: 1 }, { p: cart, w: 1 }, { p: P.gumball, w: 0.5 }],
    clutter: [
      { p: P.paperScatter, w: 1.5, min: 0.3 }, { p: P.bottles, w: 1, min: 0.4 }, { p: P.puddle, w: 1, min: 0.45 }, { p: P.lostShoe, w: 1, min: 0.5 },
      { p: P.teddy, w: 0.6, min: 0.75 }, { p: M.suitcase, w: 0.5, min: 0.6 },
    ],
  });
  decorate(world, kit, {
    density: { wall: 0.05, high: 0.12, floor: 0, clutter: 0.05, ceil: 0.03 },
    keepClear: keepFor(Z.SHOP),
    wall: [{ p: M.box, w: 2 }, { p: P.cardboardBoxes, w: 1 }],
    high: [{ p: P.poster, w: 2 }, { p: P.wallClock, w: 0.6 }, { p: P.handprints, w: 1, min: 0.8 }],
    clutter: [{ p: P.paperScatter, w: 1, min: 0.3 }, { p: P.lostShoe, w: 0.6, min: 0.6 }, { p: M.box, w: 1, min: 0.5 }],
    ceil: [{ p: P.missingTile, w: 2, min: 0.3 }, { p: P.hangingWires, w: 1, min: 0.7 }],
  });
  decorate(world, kit, {
    density: { wall: 0.2, high: 0.12, floor: 0.04, clutter: 0.08, ceil: 0.06 },
    keepClear: keepFor(Z.SERV),
    wall: [
      { p: M.box, w: 3 }, { p: P.cardboardBoxes, w: 2 }, { p: M.truck, w: 1 }, { p: M.trash, w: 1 }, { p: P.lockers, w: 0.8, o: { color: 0x8a9488 } },
      { p: M.bag, w: 1 }, { p: P.mattress, w: 0.5, min: 0.5 }, { p: P.fakeDoor, w: 1.2, min: 0.5 },
    ],
    high: [{ p: P.wallVent, w: 2 }, { p: P.outlet, w: 1 }, { p: M.cam, w: 0.8 }, { p: P.handprints, w: 1.2, min: 0.7 }],
    floor: [{ p: M.sign, w: 1 }, { p: cart, w: 0.6, o: { tipped: true } }],
    clutter: [{ p: P.mopBucket, w: 1 }, { p: P.paperScatter, w: 1 }, { p: P.puddle, w: 1.5 }, { p: M.bag, w: 1 }, { p: M.box, w: 1 }],
    ceil: [{ p: P.missingTile, w: 2 }, { p: P.hangingWires, w: 1, min: 0.4 }],
  });
  decorate(world, kit, {
    density: { wall: 0.16, high: 0.14, floor: 0.04, clutter: 0.05, ceil: 0.05 },
    keepClear: keepFor(Z.OFFICE),
    wall: [
      { p: P.fakeDoor, w: 2.5 }, { p: P.filingCabinet, w: 1.5 }, { p: P.waterCooler, w: 1 }, { p: M.plant, w: 1 }, { p: P.cardboardBoxes, w: 1 },
      { p: P.tvStatic, w: 0.6, min: 0.8 }, { p: P.chairPile, w: 0.5, min: 0.9 },
    ],
    high: [{ p: P.bulletinBoard, w: 1 }, { p: P.wallClock, w: 1 }, { p: P.painting, w: 1 }, { p: P.painting, w: 1, min: 0.7, o: { eerie: true } }, { p: P.handprints, w: 1, min: 0.8 }],
    floor: [{ p: P.officeChair, w: 2 }, { p: M.sign, w: 0.5 }],
    clutter: [{ p: P.paperScatter, w: 2 }, { p: P.crtMonitor, w: 0.5, min: 0.5 }],
    ceil: [{ p: P.missingTile, w: 2, min: 0.4 }, { p: P.hangingWires, w: 1, min: 0.7 }],
  });
  decorate(world, kit, {
    density: { wall: 0.3, high: 0.2, floor: 0, clutter: 0.06, ceil: 0 },
    keepClear: keepFor(Z.REST),
    wall: [{ p: P.waterFountain, w: 1 }, { p: M.trash, w: 1 }],
    high: [{ p: P.poster, w: 1 }, { p: P.wallClock, w: 0.5 }],
    clutter: [{ p: P.puddle, w: 1 }, { p: P.paperScatter, w: 1 }],
  });
  kit.finish();
  Object.assign(lvl, { kiddie, directories, chairX, chairZ, fx, fz });
}
