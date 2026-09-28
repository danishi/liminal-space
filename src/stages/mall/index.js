import * as THREE from 'three';
import { pbr, ceilingTile } from '../../core/surfaces.js';
import { doorModel } from '../common.js';
import { photo } from '../../core/assets.js';
import * as P from '../../props/library.js';
import { signTexture } from '../../props/canvas.js';
import { LOOKS } from '../../entities/looks.js';
import { strayNPC } from '../../entities/npc.js';
import { WATCHER_LOOK } from './constants.js';
import { cart, clothesRack, wallShelf } from './props.js';
import { layout } from './layout.js';
import { shell } from './shell.js';
import { shopfronts } from './shopfronts.js';
import { atrium } from './atrium.js';
import { interiors } from './interiors.js';
import { concourse } from './concourse.js';
import { lighting } from './lighting.js';
import { residents } from './residents.js';
import { apparitions } from './apparitions.js';

// LEVEL 94: a dead 90s shopping mall. A two-storey atrium under skylights,
// shopfronts on both sides (most of them shuttered), stopped escalators, a dry
// fountain in a sunken court, a food court, and the corridors behind it all.

export default {
  assets: {
    textures: ['terrazzo_tiles', 'beige_wall_001', 'painted_metal_shutter', 'old_wooden_floor_02', 'concrete_floor_02', 'concrete_wall_004', 'linoleum_brown', 'square_tiled_wall', 'blue_floor_tiles_01'],
    models: [
      'CashRegister_01', 'potted_plant_04', 'modular_street_seating', 'bar_chair_round_01', 'coffee_table_round_01', 'wooden_display_shelves_01',
      'metal_trash_can', 'WetFloorSign_01', 'potted_plant_02', 'security_camera_01', 'cardboard_box_01', 'hand_truck', 'trashbag',
      'vintage_suitcase',
    ],
    looks: ['guard', ['mannequin', 0], ['mannequin', 1], ['mannequin', 2], ['watcher', WATCHER_LOOK], 'cat'],
  },

  // built in phases, in this order, that hand one state object along
  build(world) {
    const lvl = layout(world);
    shell(world, lvl);
    shopfronts(world, lvl);
    atrium(world, lvl);
    interiors(world, lvl);
    concourse(world, lvl);
    lighting(world, lvl);
    residents(world, lvl);
    apparitions(world, lvl);
  },

  // what leaks through when this level bleeds into another (see game/bleed.js)
  bleed: {
    ambience: 'mall',
    looks: ['guard'],
    surfaces: () => ({
      wall: { mat: photo('beige_wall_001', { uvScale: 3, color: new THREE.Color(1.12, 1.1, 1.04) }), uv: 3 },
      floor: { mat: photo('terrazzo_tiles', { uvScale: 2, roughness: 0.55, color: new THREE.Color(1.08, 1.04, 0.98) }), uv: 2 },
      ceil: { mat: pbr(ceilingTile(), { normalScale: 0.8, color: new THREE.Color(1.08, 1.08, 1.08) }), uv: 1.2 },
    }),
    props: {
      wall: [{ p: clothesRack, w: 1 }, { p: wallShelf, w: 1 }],
      floor: [{ p: cart, w: 2 }, { p: P.wetFloorSign, w: 1 }],
      clutter: [{ p: P.paperScatter, w: 1 }],
    },
    stray: (world, pos) => strayNPC(world, pos, {
      name: 'the security guard',
      model: LOOKS.guard(),
      voice: 0.85,
      lines: [
        ['Excuse me. This is not the mall.', '...I should know. I’ve looked everywhere.'],
        ['If you find the food court, save me a pretzel.'],
      ],
    }),
  },

  makeDoor(world, dest) {
    return doorModel({
      width: 1.0,
      height: 2.15,
      doorColor: 0x9a9c94,
      frameColor: 0x55575a,
      lightColor: dest.tint || 0xffe6c8,
      knob: 0xc8c8c8,
      extras(group) {
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.16), new THREE.MeshBasicMaterial({ map: signTexture('EMPLOYEES ONLY', '', { bg: '#b01c1c', fg: '#ffffff', w: 512, h: 128 }) }));
        plate.position.set(0, 1.62, 0.1);
        // the plate rides on the door leaf so it swings with it
        const hinge = group.children.find((c) => c.isGroup);
        if (hinge) {
          plate.position.set(0.5, 1.62, 0.03);
          hinge.add(plate);
          const bar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.05), new THREE.MeshStandardMaterial({ color: 0xb8bcc0, metalness: 0.9, roughness: 0.3 }));
          bar.position.set(0.5, 1.0, 0.06);
          hinge.add(bar);
        } else group.add(plate);
      },
    });
  },
};
