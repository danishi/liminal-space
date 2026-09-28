import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { model, modelSize } from '../../core/assets.js';
import * as P from '../../props/library.js';
import { PI, Y_GENKAN, Y_WOOD, Y_BATH, Y_SURF, BANDAI_TOP, BATH_CEIL, BATH_CEIL_HI } from './constants.js';
import { SERIF, norenTexture, boardTexture, steamGlassTexture, newspaperTexture } from './textures.js';
import { muralTexture } from './mural.js';
import { mergeGroup, matAt } from './geometry.js';
import { plasticStoolParts } from './parts.js';
import { hangingPlate, lockerBank, cubbyShelf, shelfBasket, washStation, bandaiBooth, milkFridge, massageChair, bathScale, hairDryer, crtTv } from './props.js';
import { Noren } from './entities.js';

// The rooms of one bathhouse (m). s picks the side: 0 men, 1 women (mirrored).

/** Shoe lockers, the price board, the entrance doors. */
export function genkan(world, lvl, m, mu, r2) {
  const { rng, at, kit, place, clock } = lvl;

  // ---------------- genkan
  // shoe lockers along the front wall and the sides
  let tagNo = 1 + m.idx * 7;
  for (const [lx0, lx1] of [[4.05, 6.95], [10.05, 12.95]]) {
    const w = lx1 - lx0;
    const grp = lockerBank(kit, 'shoe', w, 1.75, tagNo, 0.15 + mu * 0.5);
    tagNo += 42;
    place(grp, m, 0, (lx0 + lx1) / 2, 1.22, 0, Y_GENKAN, [w, 0.44]);
  }
  for (const s of [0, 1]) {
    const grp = lockerBank(kit, 'shoe', 2.1, 1.75, tagNo, 0.2 + mu * 0.5);
    tagNo += 42;
    place(grp, m, s, 4.22, 2.55, PI / 2, Y_GENKAN, [2.1, 0.44]);
  }
  // the wall between the noren: prices, a clock, the day's bath
  const priceTex = boardTexture(`price:${mu > 0.9 ? 'late' : 'ok'}`, 512, 640, [236, 226, 204], [
    ['入浴料金', 0.13, '#1a1208', 900, SERIF], ['PRICES', 0.06, '#6a2a1a', 600],
    ['大人 520円', 0.12, '#1a1208', 700], ['Adults ¥520', 0.06, '#5a4a3a', 600],
    ['中人 200円', 0.1, '#1a1208', 700], ['小人 100円', 0.1, '#1a1208', 700],
    ['営業時間', 0.09, '#8a1a1a', 700], [mu > 0.9 ? '15:00 – ∞' : '15:00 – 24:00', 0.09, '#8a1a1a', 700],
  ], { wood: true, border: '#3a2414' });
  const pp = at(m, 0, 8.5, 3.98, PI);
  kit.add(hangingPlate(kit, priceTex, 0.8, 1.0, 0, 0, 0, 0, { glow: 0.12 }), pp.x, pp.z, pp.yaw, { y: 1.55 });
  clock(m, 0, 9.6, 3.98, PI, 2.3);
  const today = boardTexture('today', 256, 512, '#f4efe2', [['本日の', 0.12, '#1a1a1a'], ['薬湯', 0.2, '#1a6a2a', 900, SERIF], ['ゆず湯', 0.22, '#c07a10', 900, SERIF], ['YUZU', 0.08, '#6a5a3a', 600], ['BATH', 0.08, '#6a5a3a', 600]], { border: '#1a6a2a' });
  const tp = at(m, 0, 7.45, 3.98, PI);
  kit.add(hangingPlate(kit, today, 0.35, 0.7, 0, 0, 0, 0, { glow: 0.1 }), tp.x, tp.z, tp.yaw, { y: 1.5 });
  // umbrella stand, a plant, a slatted step
  const plant = new THREE.Group();
  kit.model(plant, 'potted_plant_04', 0, 0, 0, r2() * 6, 0.9);
  place(plant, m, 1, 4.45, 3.55, 0, Y_GENKAN, [0.5, 0.5]);
  place(P.umbrella.build(kit, rng), m, 1, 6.5, 1.75, 0.4, Y_GENKAN);
  // entrance: glass sliding doors, the middle two slid open
  {
    const grp = new THREE.Group();
    const frame = kit.std(0x3a2a1c, 0.5);
    const glass = kit.mat('entranceGlass', () => new THREE.MeshStandardMaterial({ color: 0xcfe0e4, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.25, depthWrite: false }));
    const frameGeo = mergeGeometries([
      new THREE.BoxGeometry(0.72, 0.1, 0.04).translate(0, 0.05, 0),
      new THREE.BoxGeometry(0.72, 0.45, 0.04).translate(0, 0.325, 0),
      new THREE.BoxGeometry(0.72, 0.1, 0.04).translate(0, 2.15, 0),
      new THREE.BoxGeometry(0.06, 2.2, 0.04).translate(-0.33, 1.1, 0),
      new THREE.BoxGeometry(0.06, 2.2, 0.04).translate(0.33, 1.1, 0),
      new THREE.BoxGeometry(0.6, 0.03, 0.03).translate(0, 1.3, 0),
    ]);
    for (const [x, z] of [[-1.1, 0.03], [-0.95, -0.03], [0.95, -0.03], [1.1, 0.03]]) {
      kit.mesh(grp, frameGeo.clone(), frame, x, 0, z);
      kit.plane(grp, 0.6, 1.5, glass, x, 1.3, z + 0.004);
      kit.plane(grp, 0.6, 1.5, glass, x, 1.3, z - 0.004, 0, PI, 0);
    }
    frameGeo.dispose();
    const p = at(m, 0, 8.5, 0.5, 0);
    kit.add(grp, p.x, p.z, p.yaw, { y: Y_GENKAN });
    for (const x of [-1.03, 1.03]) world.addFootprint(p.x + Math.cos(p.yaw) * x, p.z - Math.sin(p.yaw) * x, 0.86, 0.12, p.yaw);
  }
}

/** The bandai booth, the keeper's lamp, a TV, tea and the paper. */
export function bandai(world, lvl, m) {
  const { rng, at, kit, fixture } = lvl;

  // ---------------- bandai
  const booth = bandaiBooth(kit, rng);
  const p = at(m, 0, 8.5, 6.0, 0);
  kit.add(booth, p.x, p.z, p.yaw, { y: Y_WOOD });
  const seat = booth.userData.seat;
  m.bandai = { x: p.x, z: p.z, yaw: p.yaw + PI, seat: new THREE.Vector3(p.x + Math.sin(p.yaw) * seat.z, Y_WOOD + seat.y, p.z + Math.cos(p.yaw) * seat.z) };
  // the keeper's lamp
  fixture(p.x, 3.45, p.z, { intensity: 0.8 });
  const tv = crtTv(kit, m.idx);
  const tp2 = at(m, 0, 9.75, 5.3, -1.0);
  kit.add(tv, tp2.x, tp2.z, tp2.yaw, { y: BANDAI_TOP });
  // the empty bandai keeps a cup of tea and today's paper
  const paper = new THREE.Group();
  kit.plane(paper, 0.42, 0.3, kit.mat('paper', () => new THREE.MeshStandardMaterial({ map: newspaperTexture(), roughness: 0.9, side: THREE.DoubleSide })), 0, 0.001, 0, -PI / 2, 0, 0.1);
  const pp2 = at(m, 0, 7.2, 6.3, 0.3);
  kit.add(paper, pp2.x, pp2.z, pp2.yaw, { y: BANDAI_TOP });
}

/** Noren, lockers, baskets, the fan, milk, the massage chair, the scale, posters, lights. */
export function changingRoom(world, lvl, m, s, mu, r2) {
  const { at, kit, place, batch, poke, bakeSources, basketParts, fridges, massageChairs, scales, fixture } = lvl;

  const kind = s ? 'women' : 'men';
  // noren at the changing-room doorway
  {
    const tex = norenTexture(kind);
    const panels = [];
    const nm = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.95 });
    const p = at(m, s, 6.0, 4.05, 0);
    const holder = new THREE.Group();
    holder.position.set(p.x, Y_WOOD + 2.0, p.z);
    holder.rotation.y = p.yaw + PI;
    for (let n = 0; n < 3; n++) {
      const geo = new THREE.PlaneGeometry(0.62, 1.05, 1, 4);
      geo.translate(0, -0.525, 0);
      const uv = geo.attributes.uv;
      for (let v = 0; v < uv.count; v++) uv.setX(v, (n + uv.getX(v)) / 3);
      const pm = new THREE.Mesh(geo, nm);
      pm.position.set(-0.64 + n * 0.64, 0, 0);
      pm.userData.push = 0;
      holder.add(pm);
      panels.push(pm);
    }
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 2.0, 8), new THREE.MeshStandardMaterial({ color: 0x3a2414, roughness: 0.5 }));
    rod.rotation.z = PI / 2;
    holder.add(rod);
    world.root.add(holder);
    holder.updateMatrixWorld(true);
    for (const pm of panels) pm.userData.world = pm.getWorldPosition(new THREE.Vector3());
    const nrm = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    world.add(new Noren(world, panels, new THREE.Vector3(p.x, 0, p.z), nrm));
  }
  // changing room: lockers, baskets, bench, fan, fridge, massage chair, scale
  const taken = 0.1 + mu * 0.6;
  for (let n = 0; n < 4; n++) {
    const grp = lockerBank(kit, 'dress', 1.4, 1.85, 1 + n * 20 + s * 80, taken);
    place(grp, m, s, 1.22, 6.9 + n * 1.45, PI / 2, Y_WOOD, [1.4, 0.44]);
  }
  {
    const shelf = cubbyShelf(kit, 5, 2);
    const p = place(shelf, m, s, 6.12, 12.78, PI, Y_WOOD, [2.2, 0.44]);
    shelf.updateMatrixWorld(true);
    for (const [cx, cy, cz] of shelf.userData.cells) {
      if (r2() < 0.25) continue;
      const wp = new THREE.Vector3(cx, cy, cz).applyMatrix4(shelf.matrixWorld);
      kit.add(shelfBasket(kit), wp.x, wp.z, p.yaw + (r2() - 0.5) * 0.2, { y: wp.y });
    }
  }
  {
    const shelf = cubbyShelf(kit, 4, 2);
    const p = place(shelf, m, s, 2.0, 12.78, PI, Y_WOOD, [1.8, 0.44]);
    shelf.updateMatrixWorld(true);
    for (const [cx, cy, cz] of shelf.userData.cells) {
      if (r2() < 0.35) continue;
      const wp = new THREE.Vector3(cx, cy, cz).applyMatrix4(shelf.matrixWorld);
      kit.add(shelfBasket(kit), wp.x, wp.z, p.yaw + (r2() - 0.5) * 0.2, { y: wp.y });
    }
  }
  {
    const bench = new THREE.Group();
    kit.model(bench, 'painted_wooden_bench', 0, 0, 0, 0, 1);
    const bs = modelSize('painted_wooden_bench');
    place(bench, m, s, 4.2, 9.0, PI / 2, Y_WOOD, [bs.x, bs.z]);
    const bp = at(m, s, 4.2, 8.6, 0);
    batch.add(`basket:${m.idx}`, basketParts, matAt(bp.x, Y_WOOD + bs.y, bp.z, r2() * 6));
  }
  {
    // ceiling fan, spinning
    const fan = model('ceiling_fan');
    const fs = modelSize('ceiling_fan');
    const sc = Math.min(1.2 / Math.max(fs.x, fs.z), 0.9 / fs.y);
    fan.scale.setScalar(sc);
    const p = at(m, s, 4.2, 9.0);
    fan.position.set(p.x, 3.5 - fs.y * sc, p.z);
    world.root.add(fan);
    const speed = 2.2 + r2() * 0.8 - (mu > 0.9 ? 3.4 : 0);
    world.animated.push((dt) => (fan.rotation.y += dt * speed));
  }
  {
    const fr = milkFridge(kit);
    const p = place(fr, m, s, 2.0, 5.3, 0, Y_WOOD, [0.66, 0.55]);
    bakeSources.push({ pos: new THREE.Vector3(p.x + Math.sin(p.yaw) * 0.5, Y_WOOD + 0.9, p.z + Math.cos(p.yaw) * 0.5), color: new THREE.Color(0.85, 0.95, 1), intensity: 2.2, range: 5 });
    fridges.push(poke.add({ pos: new THREE.Vector3(p.x + Math.sin(p.yaw) * 0.3, Y_WOOD + 1.0, p.z + Math.cos(p.yaw) * 0.3), prompt: 'Take a milk', kind: 'fridge', m }));
  }
  {
    const ch = mergeGroup(massageChair(kit));
    const p = at(m, s, 7.45, 8.0, -PI / 2);
    ch.position.set(p.x, Y_WOOD, p.z);
    ch.rotation.y = p.yaw;
    world.root.add(ch);
    world.addFootprint(p.x, p.z, 0.8, 0.9, p.yaw);
    massageChairs.push(poke.add({ pos: new THREE.Vector3(p.x, Y_WOOD + 0.7, p.z), prompt: 'Sit in the massage chair', kind: 'chair', obj: ch, base: ch.position.clone(), m, shake: 0 }));
  }
  {
    const raw = bathScale(kit);
    const sc = mergeGroup(raw, new Set([raw.userData.needle]));
    sc.userData.needle = raw.userData.needle;
    const p = at(m, s, 7.6, 9.8, -PI / 2);
    sc.position.set(p.x, Y_WOOD, p.z);
    sc.rotation.y = p.yaw;
    world.root.add(sc);
    world.addFootprint(p.x, p.z, 0.45, 0.55, p.yaw);
    scales.push(poke.add({ pos: new THREE.Vector3(p.x, Y_WOOD + 0.9, p.z), prompt: 'Step on the scale', kind: 'scale', needle: sc.userData.needle, m, spin: 0 }));
  }
  place(hairDryer(kit), m, s, 7.5, 11.4, -PI / 2, Y_WOOD, [0.5, 0.55]);
  // a slatted drain mat at the bath door
  {
    const mat = new THREE.Group();
    for (let n = 0; n < 9; n++) kit.box(mat, 0.08, 0.025, 0.9, kit.std(0x9a7a52, 0.8), -0.64 + n * 0.16, 0.0125, 0);
    place(mat, m, s, 4.0, 12.5, 0, Y_WOOD);
  }
  // posters and signs
  const posters = [
    boardTexture('poster-milk', 384, 512, '#f6e7b8', [['お風呂上がりに', 0.1, '#1a3a8a'], ['牛乳', 0.3, '#c01818', 900, SERIF], ['MILK', 0.12, '#1a3a8a', 900], ['after your bath', 0.07, '#1a3a8a', 600]], { border: '#c01818' }),
    boardTexture('poster-rinse', 384, 512, '#e8f2f4', [['かけ湯を', 0.16, '#1a4a7a', 900], ['してから', 0.16, '#1a4a7a', 900], ['入りましょう', 0.12, '#1a4a7a', 700], ['Rinse before', 0.07, '#4a4a4a', 600], ['you soak', 0.07, '#4a4a4a', 600]], { border: '#1a4a7a' }),
    boardTexture('poster-towel', 384, 512, '#fbf6ea', [['タオルを', 0.14, '#1a1a1a', 900], ['湯船に', 0.14, '#1a1a1a', 900], ['入れないで', 0.14, '#c01818', 900], ['No towels', 0.08, '#4a4a4a', 600], ['in the bath', 0.08, '#4a4a4a', 600]], { border: '#1a1a1a' }),
    boardTexture('poster-stay', 384, 512, '#efe6d6', [['ごゆっくり', 0.16, '#3a1a1a', 900], ['どうぞ', 0.16, '#3a1a1a', 900], ['Take your time.', 0.08, '#4a4a4a', 600], ['All of it.', 0.08, '#8a1a1a', 600]], { border: '#3a1a1a' }),
  ];
  const pick = (n) => posters[(n + m.idx + s) % (mu > 0.7 ? 4 : 3)];
  const pa = at(m, s, 1.02, 6.8, PI / 2);
  kit.add(hangingPlate(kit, pick(0), 0.42, 0.56, 0, 0, 0), pa.x, pa.z, pa.yaw, { y: 2.45 });
  const pb = at(m, s, 7.98, 12.2, -PI / 2);
  kit.add(hangingPlate(kit, pick(1), 0.42, 0.56, 0, 0, 0), pb.x, pb.z, pb.yaw, { y: 1.6 + Y_WOOD });
  // steamy glass above the basket shelf
  {
    const gm = kit.mat('steamGlass', () => {
      const t = steamGlassTexture().clone();
      t.userData.cached = true;
      return new THREE.MeshStandardMaterial({ map: t, emissive: 0xdde8e8, emissiveMap: t, emissiveIntensity: 0.45, roughness: 0.25 });
    });
    const frame = kit.std(0x4a3222, 0.5);
    for (const [lx, w] of [[6.0, 2.0], [2.0, 1.8]]) {
      const grp = new THREE.Group();
      kit.plane(grp, w, 1.0, gm, 0, 0, 0);
      for (let n = 0; n <= 3; n++) kit.box(grp, 0.04, 1.04, 0.03, frame, -w / 2 + (n * w) / 3, 0, 0.01);
      kit.box(grp, w + 0.04, 0.04, 0.03, frame, 0, 0.5, 0.01);
      kit.box(grp, w + 0.04, 0.04, 0.03, frame, 0, -0.5, 0.01);
      const p = at(m, s, lx, 12.99, PI);
      kit.add(grp, p.x, p.z, p.yaw, { y: Y_WOOD + 1.75 });
    }
    // glass door into the bath hall, one leaf slid open
    const door = new THREE.Group();
    for (const [x, zz] of [[-0.52, 0.03], [-0.42, -0.03]]) {
      kit.plane(door, 0.9, 1.7, gm, x, 1.05, zz);
      kit.plane(door, 0.9, 1.7, gm, x, 1.05, zz, 0, PI, 0);
      for (const dx of [-0.46, 0.46]) kit.box(door, 0.05, 1.95, 0.04, frame, x + dx, 0.98, zz);
      kit.box(door, 0.95, 0.06, 0.04, frame, x, 0.03, zz);
      kit.box(door, 0.95, 0.06, 0.04, frame, x, 1.93, zz);
    }
    const p = at(m, s, 4.0, 13.5, 0);
    kit.add(door, p.x, p.z, p.yaw, { y: Y_WOOD });
    const q = at(m, s, 3.5, 13.5, 0);
    world.addFootprint(q.x, q.z, 1.0, 0.1, p.yaw);
  }
  // TV high in the corner
  {
    const tv = crtTv(kit, m.idx * 2 + s + 3);
    const p = at(m, s, 1.35, 12.4, PI * 0.75);
    kit.add(tv, p.x, p.z, p.yaw, { y: 2.55 });
    const br = new THREE.Group();
    kit.box(br, 0.4, 0.03, 0.5, kit.std(0x3a3a3a, 0.5, 0.6), 0, 0, 0);
    kit.add(br, p.x, p.z, p.yaw, { y: 2.53 });
  }
  // lights
  for (const lz of [6.4, 9.0, 11.6]) {
    const p = at(m, s, 4.0, lz);
    fixture(p.x, 3.47, p.z, { intensity: 1, rot: PI / 2 });
  }
}

/** Washing stations, stools and buckets, the baths and their signs, lights. */
export function bathHall(world, lvl, m, s, mu, r2) {
  const { rng, at, kit, place, batch, stoolWood, stoolSize, addBucket, yuzus, yuzuParts, clock, fixture } = lvl;

  // ---------------- bath hall
  const fogged = mu > 0.75;
  const stations = [];
  for (let lz = 15.5; lz <= 19.5; lz += 1) stations.push([1.0, lz, PI / 2], [8.0, lz, -PI / 2]);
  for (let lz = 16.5; lz <= 19.5; lz += 1) stations.push([4.0, lz, -PI / 2], [5.0, lz, PI / 2]);
  for (const [lx, lz, yaw] of stations) {
    const st = washStation(kit, rng, { fogged: fogged && r2() < 0.5, bottles: r2() < 0.3 ? 1 + Math.floor(r2() * 3) : 0 });
    const p = place(st, m, s, lx, lz, yaw, Y_BATH);
    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    world.addFootprint(p.x + fx * 0.13, p.z + fz * 0.13, 1.0, 0.27, p.yaw);
    // stool and bucket
    const roll = r2();
    if (roll < 0.75) {
      const d = 0.62 + r2() * 0.1;
      const sx = p.x + fx * d;
      const sz = p.z + fz * d;
      const nice = r2() < 0.12;
      if (nice) batch.add(`stoolw:${m.idx}`, stoolWood, matAt(sx, Y_BATH, sz, p.yaw + (r2() - 0.5) * 0.4));
      else batch.add(`stool:${m.idx}`, plasticStoolParts(), matAt(sx, Y_BATH, sz, p.yaw + (r2() - 0.5) * 0.3));
      const topY = nice ? stoolSize.y : 0.25;
      if (r2() < 0.55) addBucket(m, s, sx, Y_BATH + topY, sz, r2() * 6, true);
      else addBucket(m, s, p.x + fx * 0.14 + Math.cos(p.yaw) * 0.3 * (r2() < 0.5 ? 1 : -1), Y_BATH + 0.525, p.z + fz * 0.14 - Math.sin(p.yaw) * 0.3, r2() * 6);
    } else if (roll < 0.9) {
      addBucket(m, s, p.x + fx * 0.14 - Math.cos(p.yaw) * 0.28, Y_BATH + 0.525, p.z + fz * 0.14 + Math.sin(p.yaw) * 0.28, r2() * 6);
    }
  }
  // a pile of stools and buckets by the door
  {
    const p = at(m, s, 1.5, 14.5);
    for (let n = 0; n < 5; n++) batch.add(`stool:${m.idx}`, plasticStoolParts(), matAt(p.x, Y_BATH + n * 0.07, p.z, 0.05 * n));
    for (let n = 0; n < 6; n++) addBucket(m, s, p.x + 0.45, Y_BATH + n * 0.028, p.z + 0.05, n * 0.3);
  }
  // bath: spouts pouring in, signs on the tiles below the mural
  for (const [lx, label, sub] of [[2.6, 'あつ湯 42℃', 'HOT BATH 42°C'], [6.5, s ? '電気風呂' : '薬湯 ゆず湯', s ? 'ELECTRIC BATH' : 'YUZU BATH']]) {
    const p = at(m, s, lx, 25.98, PI);
    const sign = boardTexture(`bsign:${label}`, 512, 160, '#f6f2e8', [[label, 0.5, '#c01818', 900], [sub, 0.26, '#1a3a6a', 700]], { border: '#1a3a6a' });
    kit.add(hangingPlate(kit, sign, 0.8, 0.25, 0, 0, 0, 0, { frame: 0xd8dcdc }), p.x, p.z, p.yaw, { y: 1.62 });
    const spout = new THREE.Group();
    const brass = kit.std(0xc8a050, 0.3, 0.9);
    kit.cyl(spout, 0.035, 0.035, 0.35, brass, 0, 1.0, 0.17, PI / 2);
    kit.cyl(spout, 0.05, 0.04, 0.1, brass, 0, 0.98, 0.35, 0.3);
    kit.cyl(spout, 0.018, 0.028, 1.0 - (Y_SURF + 0.02), kit.mat('stream', () => new THREE.MeshStandardMaterial({ color: 0xeaf6f6, transparent: true, opacity: 0.45, roughness: 0.05, emissive: 0x9ab8b8, emissiveIntensity: 0.4, depthWrite: false })), 0, (1.0 + Y_SURF) / 2 - 0.02, 0.38, 0, 0, 0, 8);
    const q = at(m, s, lx + 0.3, 26.0, PI);
    kit.add(spout, q.x, q.z, q.yaw, { y: 0 });
  }
  if (s === 1) {
    const warn = boardTexture('ewarn', 384, 256, '#fff4c0', [['注意', 0.3, '#c01818', 900], ['心臓の弱い方は', 0.16, '#1a1a1a'], ['ご遠慮ください', 0.16, '#1a1a1a'], ['Not for weak hearts', 0.14, '#6a1a1a', 600]], { border: '#c01818' });
    const p = at(m, s, 7.98, 22.2, -PI / 2);
    kit.add(hangingPlate(kit, warn, 0.42, 0.28, 0, 0, 0), p.x, p.z, p.yaw, { y: 1.35 });
    // electrode plates on the bath wall
    for (const lz of [22.6, 24.4]) {
      const plate = new THREE.Group();
      kit.box(plate, 0.5, 0.35, 0.02, kit.std(0xb8bcbc, 0.25, 0.9), 0, 0, 0);
      for (let n = 0; n < 5; n++) kit.box(plate, 0.4, 0.015, 0.01, kit.std(0x333333, 0.5), 0, -0.12 + n * 0.06, 0.012);
      const q = at(m, s, 7.97, lz, -PI / 2);
      kit.add(plate, q.x, q.z, q.yaw, { y: 0.05 });
    }
  } else {
    // yuzu floating in the herbal bath
    for (let n = 0; n < 9; n++) {
      const q = at(m, s, 6.2 + r2() * 1.6, 21.3 + r2() * 4.4);
      yuzus.push({ ref: batch.add('yuzu', yuzuParts, matAt(q.x, Y_SURF, q.z)), x: q.x, z: q.z, ph: r2() * 6, vx: (r2() - 0.5) * 0.04, vz: (r2() - 0.5) * 0.04, m });
    }
  }
  clock(m, s, 6.2, 14.02, 0, 2.6);
  // lights: along the low ceiling on the outer side, and high over the partition
  for (const lz of [15.5, 19.5, 23.5]) {
    const p = at(m, s, 2.2, lz);
    fixture(p.x, BATH_CEIL - 0.02, p.z, { intensity: 1.5, rot: PI / 2 });
  }
}

/** Lights down the middle: high over the bath partition, and in the genkan. */
export function hallLights(world, lvl, m) {
  const { at, fixture } = lvl;

  for (const lz of [16, 21.5]) {
    const p = at(m, 0, 8.5, lz);
    fixture(p.x, BATH_CEIL_HI - 0.02, p.z, { intensity: 1.7, rot: PI / 2 });
  }
  // genkan lights
  for (const lx of [6.0, 11.0]) {
    const p = at(m, 0, lx, 2.2);
    fixture(p.x, 2.98, p.z, { intensity: 0.9 });
  }
}

export function hallMural(world, lvl, m) {
  const { at } = lvl;

  // mural across the back wall of the bath hall, over the partition
  const tex = muralTexture(m.variant);
  const mm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.14 });
  const mh = BATH_CEIL - 2.05;
  const p = at(m, 0, 8.5, 25.985, PI);
  const mural = new THREE.Mesh(new THREE.PlaneGeometry(15, mh), mm);
  mural.position.set(p.x, 1.95 + mh / 2, p.z);
  mural.rotation.y = p.yaw;
  world.root.add(mural);
  // the raised centre shows the painted sky continuing
  const top = new THREE.Mesh(new THREE.PlaneGeometry(7, BATH_CEIL_HI - BATH_CEIL + 0.01), new THREE.MeshStandardMaterial({ color: m.variant === 'figure' ? 0x221a3e : 0x1d62b8, roughness: 0.8, emissive: m.variant === 'figure' ? 0x221a3e : 0x1d62b8, emissiveIntensity: 0.15 }));
  top.position.set(p.x, (BATH_CEIL + BATH_CEIL_HI) / 2, p.z);
  top.rotation.y = p.yaw;
  world.root.add(top);
  m.mural = { x: p.x, z: p.z };
}
