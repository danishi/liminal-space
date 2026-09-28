import * as THREE from 'three';
import { doorModel } from '../common.js';
import { photo } from '../../core/assets.js';
import * as P from '../../props/library.js';
import { signTexture } from '../../props/canvas.js';
import { exitSign } from '../../core/textures.js';
import { Watcher, Follower, Peeker, StrayCat } from '../../entities/creatures.js';
import { LOOKS } from '../../entities/looks.js';
import { strayNPC } from '../../entities/npc.js';
import { CS, W, HH } from './constants.js';
import { Creeper } from './creeper.js';
import { trolley, tyreStack, hoseBox, missingPoster } from './props.js';
import { layout } from './layout.js';
import { structure } from './structure.js';
import { parking } from './parking.js';
import { entrance } from './entrance.js';
import { rooms } from './rooms.js';
import { lighting } from './lighting.js';
import { residents } from './residents.js';

// Parking Level P6: an underground multi-storey car park at 3 a.m. Split
// decks joined by long ramps, a pillar every three bays, sodium lamps, and
// cars that lock themselves as you walk past.
//
// build() runs its phases in order; each one reads what it needs from `lvl`
// and adds what later phases use.

export default {
  assets: {
    textures: ['garage_floor', 'concrete_wall_004', 'painted_metal_shutter'],
    models: ['covered_car', 'concrete_road_barrier', 'old_tyre', 'hand_truck', 'metal_jerrycan', 'power_box_01', 'metal_trash_can', 'WetFloorSign_01', 'security_camera_01', 'utility_box_01', 'trashbag', 'cardboard_box_01', 'metal_office_desk', 'plastic_monobloc_chair_01', 'korean_fire_extinguisher_01'],
    looks: ['valet', ['watcher', { body: 0x16171a, suit: true }], 'cat', 'car:sedan', 'car:kei', 'car:van'],
  },

  build(world) {
    const lvl = layout(world); // decks, ramps, stairwell, bays, open shafts
    structure(world, lvl); // shell, pillars, beams, services, floor paint
    parking(world, lvl); // cars, empty bays, chained-off shafts
    entrance(world, lvl); // barrier gate, booth, ticket machine, shutter
    rooms(world, lvl); // service rooms, mirrors, signs
    lighting(world, lvl); // lamps and tubes, set dressing; merges the kit
    residents(world, lvl); // the attendant, a cat
    const { rng, g, K, laneOf, crossOf, room, puddles, tubes, updateGate, disposeGate } = lvl;

    // ---- apparitions -------------------------------------------------------------
    if (!world.attract) {
      world.add(new Watcher(world, { look: { body: 0x16171a, suit: true }, speed: 1.3 }));
      world.add(new Follower(world));
      if (world.depth >= 1) world.add(new Peeker(world, { look: { body: 0x16171a, suit: true } }));
      if (rng.chance(0.3)) world.add(new StrayCat(world));
      // the driverless car, on lane cells only
      const drive = new Uint8Array(W * HH);
      for (let j = 0; j < HH; j++) {
        for (let i = 0; i < 43; i++) {
          if (!g.standable(i, j) || room(i, j) || (i >= 41 && j >= 17)) continue;
          if (laneOf(j) !== undefined || crossOf(i) !== undefined) drive[K(i, j)] = 1;
        }
      }
      const wp = (i, j) => {
        const c = crossOf(i);
        const l = laneOf(j);
        const x = c !== undefined ? (c + 1) * CS : (i + 0.5) * CS;
        const z = l !== undefined ? (l + 1) * CS : (j + 0.5) * CS;
        return { x, z };
      };
      world.add(new Creeper(world, drive, wp));
    }

    Object.assign(world.env, {
      background: 0x070504,
      fog: new THREE.FogExp2(0x1c1208, 0.042 + world.depth * 0.004),
      exposure: 1.15,
      postfx: { bloom: 0.5, bloomThreshold: 0.72, bloomRadius: 0.55, grain: 0.09, vignette: 0.48, chroma: 0.002, scan: 0.03, tint: [1.05, 0.98, 0.9] },
      ao: 1,
      envIntensity: 0.4,
      ambience: 'garage',
      reverb: [2.8, 2.5],
      bake: { hemi: 0.8, dynamic: 0.5, bounce: 0.3, radius: 10 },
      flashlight: true,
      flashlightOn: true,
      flashlightIntensity: 24,
      flashlightDistance: 24,
    });
    world.surfaceFn = (x, z) => {
      for (const [px, pz, r] of puddles) if (Math.abs(px - x) < r && Math.abs(pz - z) < r) return 'water';
      return 'stone';
    };

    world.onUpdate = (dt, ctx) => {
      for (const t of tubes) t.mat.color.setRGB(1.8, 2.0, 2.1).multiplyScalar(t.fx.dead ? 0.03 : 0.1 + t.fx.level * 0.9);
      updateGate(dt, ctx);
    };
    world.onDispose.push(disposeGate);
  },

  // what leaks through when this level bleeds into another (see game/bleed.js)
  bleed: {
    ambience: 'garage',
    looks: ['valet'],
    surfaces: () => ({
      wall: { mat: photo('concrete_wall_004', { uvScale: 2, color: 0xb4ada2 }), uv: 2 },
      floor: { mat: photo('garage_floor', { uvScale: 2, color: 0xa29c92, roughness: 0.9 }), uv: 2 },
      ceil: { mat: photo('concrete_wall_004', { uvScale: 2, color: 0x8c877e, normalScale: 0.7 }), uv: 2 },
    }),
    props: {
      wall: [{ p: tyreStack, w: 1 }, { p: hoseBox, w: 0.5 }],
      high: [{ p: missingPoster, w: 1 }],
      floor: [{ p: P.trafficCone, w: 2 }],
      clutter: [{ p: trolley, w: 1 }, { p: P.trafficCone, w: 2 }, { p: P.puddle, w: 1 }],
    },
    stray: (world, pos) => strayNPC(world, pos, {
      name: 'the attendant',
      model: LOOKS.valet(),
      voice: 1,
      lines: [
        ['Has anyone seen where I parked this level?'],
        ['It was right here. Big grey thing. Pillars. Smelled of petrol.', '...This isn’t it, is it.'],
      ],
    }),
  },

  makeDoor(world, dest) {
    return doorModel({
      width: 0.95,
      height: 2.1,
      doorColor: 0x5e6468,
      frameColor: 0x2e3032,
      lightColor: dest.tint || 0xffe0b0,
      knob: 0xb8b8b0,
      extras(group) {
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.16), new THREE.MeshBasicMaterial({ map: signTexture('STAIRS', '', { bg: '#e8e6de', fg: '#1a1a1a', w: 256, h: 80 }) }));
        plate.position.set(0.85, 1.55, 0.015);
        const exit = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.19), new THREE.MeshBasicMaterial({ map: exitSign(), color: new THREE.Color(1.6, 1.6, 1.6) }));
        exit.position.set(0, 2.4, 0.06);
        group.add(plate, exit);
      },
    });
  },
};
