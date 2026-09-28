import * as THREE from 'three';
import { photo } from '../../core/assets.js';
import * as P from '../../props/library.js';
import { PI } from './constants.js';
import { G, counter, plinth, clothesRack, wallShelf, vhsShelf, waterbed, candleTable } from './props.js';

/** Fixtures inside the open shops, by kind. */
export function interiors(world, lvl) {
  const { rng, kit, toWorld, displayMannequins, fronts } = lvl;
  // ---- shop interiors --------------------------------------------------------------
  const tileMat = photo('blue_floor_tiles_01', { uvScale: 1, color: 0xd0dcd8 });
  // the scanned shelf is long along its z axis; turn it so it lines a wall
  const shelfModel = {
    fp: [1.1, 0.4],
    build(k) {
      const grp = G();
      k.model(grp, 'wooden_display_shelves_01', 0, 0, 0, -PI / 2, 1);
      return grp;
    },
  };
  for (const f of fronts) {
    if (!f.open) continue;
    const place = (grp, lx, lz, lyaw, collide) => {
      const [x, z] = toWorld(f.xc, f.zf, f.yaw, lx, lz);
      kit.add(grp, x, z, f.yaw + lyaw, { y: f.y, collide });
      return [x, z];
    };
    const mood = f.u;
    const o = { mood, eerie: mood > 0.8 };
    place(counter(kit, rng, rng.pick([0xd8cfc0, 0x2a4a6a, 0x8a2a2a])), -2.2, -8.6, 0, [2.1, 0.75]);
    const sideShelf = f.kind === 'video' ? vhsShelf : f.kind === 'clothes' ? wallShelf : shelfModel;
    for (const lz of [-3.6, -6.6]) {
      for (const s of [-1, 1]) {
        const fp = sideShelf.fp || [1.8, 0.45];
        place(sideShelf.build(kit, rng, o), s * (3.75 - fp[1] / 2 - 0.02), lz, -s * PI / 2, fp);
      }
    }
    place((f.kind === 'video' ? vhsShelf : wallShelf).build(kit, rng, o), 1.6, -10 + 0.25, 0, [2.0, 0.45]);
    if (f.kind === 'clothes') {
      place(clothesRack.build(kit, rng, o), -1.1, -4.8, 0, [1.1, 1.1]);
      place(clothesRack.build(kit, rng, o), 1.2, -6.4, 0, [1.1, 1.1]);
      for (const s of [-1, 1]) {
        place(plinth(kit), s * 2.2, -1.2, 0, [1.5, 1.2]);
        const [x, z] = toWorld(f.xc, f.zf, f.yaw, s * 2.2, -1.2);
        displayMannequins.push({ pos: new THREE.Vector3(x, f.y + 0.14, z), yaw: f.yaw + rng.float(-0.4, 0.4) });
      }
    } else if (f.kind === 'video') {
      place(vhsShelf.build(kit, rng, o), 0, -5.4, 0, [1.8, 0.4]);
      place(vhsShelf.build(kit, rng, o), 0, -5.8, PI, [1.8, 0.4]);
      for (const s of [-1, 1]) place(P.tvStatic.build(kit, rng, o), s * 2.2, -1.2, PI + s * 0.3, [0.6, 0.5]);
    } else if (f.kind === 'beds') {
      place(waterbed.build(kit, rng, o), -1.4, -5.0, 0.2, [1.9, 2.3]);
      place(waterbed.build(kit, rng, o), 1.5, -3.2, -0.3, [1.9, 2.3]);
    } else if (f.kind === 'candles') {
      place(candleTable.build(kit, rng, o), -1.0, -4.6, 0, [1.2, 1.2]);
      place(candleTable.build(kit, rng, o), 1.2, -6.8, 0, [1.2, 1.2]);
      place(candleTable.build(kit, rng, o), 2.0, -1.4, 0, [1.2, 1.2]);
    } else if (f.kind === 'lost') {
      for (let n = 0; n < 9; n++) {
        const item = rng.pick([P.umbrella, P.lostShoe, P.teddy, P.modelProp('vintage_suitcase', { jitter: 3, scale: 0.8 }), P.modelProp('cardboard_box_01', { jitter: 3 })]);
        place(item.build(kit, rng, o), rng.float(-2.5, 2.5), rng.float(-7.5, -1.5), rng.float(0, PI * 2), null);
      }
    } else if (f.kind === 'shelves') {
      place(candleTable.build(kit, rng, o), 0, -5.2, 0, [1.2, 1.2]);
    } else {
      for (let n = 0; n < 5; n++) place(P.modelProp('cardboard_box_01', { jitter: 3, scaleJitter: 0.3 }).build(kit, rng), rng.float(-2.5, 2.5), rng.float(-8, -2), 0, null);
      place(P.stepLadder.build(kit, rng), 1.5, -4, 0.4, [0.5, 0.5]);
    }
  }
  Object.assign(lvl, { tileMat });
}
