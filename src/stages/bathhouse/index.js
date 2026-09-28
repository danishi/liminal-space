import * as THREE from 'three';
import { photo } from '../../core/assets.js';
import { NPC } from '../../entities/npc.js';
import { LOOKS } from '../../entities/looks.js';
import { beastPose } from '../../entities/figures.js';
import { PI } from './constants.js';
import { norenTexture, glazeTexture } from './textures.js';
import { bleedBucket } from './parts.js';
import { layout } from './layout.js';
import { materials } from './materials.js';
import { shell, water } from './shell.js';
import { furnish, bathhouses } from './furnish.js';
import { outdoors } from './outdoors.js';
import { lighting } from './lighting.js';
import { bathSteam } from './steam.js';
import { residents } from './residents.js';
import { pokeables } from './pokeables.js';
import { apparitions } from './apparitions.js';
import { perFrame } from './update.js';
import { mood } from './mood.js';

// A Showa-era public bathhouse late at night, repeated along a back street:
// shoe lockers, noren, the bandai, changing rooms, a tiled bath hall under a
// painted Mt. Fuji, and a roof terrace with an open-air bath. The further you
// wander from where you came in, the less the bathhouses agree with each other.

export default {
  id: 'bathhouse',
  code: 'LEVEL 26',
  name: 'Midnight Bathhouse',
  sub: '深夜の銭湯 · Open late. Very late.',
  tint: 0x9ad8ff,
  assets: {
    textures: ['blue_floor_tiles_01', 'square_tiled_wall', 'old_wooden_floor_02', 'terrazzo_tiles', 'beige_wall_001', 'dark_paneled_wood', 'brown_planks_03', 'concrete_floor_02', 'concrete_wall_004', 'bamboo_wall', 'stone_pathway_02'],
    models: ['wooden_stool_01', 'wicker_basket_01', 'ceiling_fan', 'painted_wooden_bench', 'wall_clock', 'potted_plant_04', 'rock_moss_set_01', 'wooden_bucket_02', 'metal_trash_can', 'utility_box_01', 'trashbag', 'rubber_duck_toy'],
    hdris: ['qwantani_night_puresky'],
    looks: ['keeper', 'capybara', ['watcher', { body: 0xc8c0b8, eyes: 0x202020, height: 2.3 }], 'cat'],
  },

  // The build runs in phases, in this order; each reads what it needs from `lvl`
  // and adds what later phases use. The order matters: it fixes the order of
  // random draws and of everything added to the scene.
  build(world) {
    const lvl = layout(world); // grid, spawn, finalizeLayout, per-bathhouse unease
    materials(world, lvl);
    shell(world, lvl); // walls, floors, risers, ceilings, outdoor walls
    water(world, lvl);
    furnish(world, lvl); // prop kit, instancing, fixture list
    bathhouses(world, lvl); // genkan, bandai, changing rooms, bath halls, mural, facade
    outdoors(world, lvl); // alley, passages, roof terrace
    lvl.kit.finish();
    lighting(world, lvl);
    lvl.batch.finish();
    bathSteam(world, lvl);
    residents(world, lvl); // the keeper, capybaras, a cat
    pokeables(world, lvl);
    apparitions(world, lvl);
    perFrame(world, lvl); // world.onUpdate
    mood(world, lvl); // surfaces, fog, post-processing
  },

  // what leaks through when this level bleeds into another (see game/bleed.js)
  bleed: {
    ambience: 'bath',
    looks: ['capybara'],
    surfaces: () => {
      const mosaic = (key, rgb, uv, opts = {}) => {
        const map = glazeTexture(key, rgb).clone();
        map.repeat.set(uv / 2, uv / 2);
        map.userData.cached = true;
        return { mat: photo('square_tiled_wall', { uvScale: uv, map, roughness: 0.3, ...opts }), uv };
      };
      return { wall: mosaic('wall', [226, 236, 236], 0.8, { roughness: 0.22 }), floor: mosaic('floor', [178, 198, 204], 0.55, { roughness: 0.45 }) };
    },
    props: {
      clutter: [{ p: bleedBucket, w: 3 }],
    },
    stray: (world, pos) => {
      const fig = LOOKS.capybara();
      beastPose(fig, 'loaf');
      fig.position.copy(pos);
      const capy = new NPC(world, { name: 'the capybara', pos, model: fig, voice: 0.5, radius: 0.45, face: false, prompt: 'Sit with the capybara', conversations: [
        ['(A capybara, damp, somewhere it should not be. It seems fine with it.)'],
        ['(It is waiting for the bath to come back. It has all the time there is.)'],
      ] });
      capy.aimHeight = 0.4;
      return capy;
    },
  },

  makeDoor(world, dest) {
    // a wooden sliding door with a ゆ noren; the light beyond is the destination's
    const group = new THREE.Group();
    const w = 0.86;
    const hgt = 2.0;
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.6 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.6 });
    for (const x of [-w / 2 - 0.04, w / 2 + 0.04]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, hgt + 0.08, 0.12), frameMat);
      post.position.set(x, (hgt + 0.08) / 2, 0.06);
      group.add(post);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(w + 0.16, 0.08, 0.14), frameMat);
    lintel.position.set(0, hgt + 0.04, 0.06);
    group.add(lintel);
    const lightMat = new THREE.MeshBasicMaterial({ color: dest.tint || 0xfff0d0 });
    const beyond = new THREE.Color(dest.tint || 0xfff0d0).multiplyScalar(2.4);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(w, hgt), lightMat);
    back.position.set(0, hgt / 2, 0.01);
    group.add(back);
    // sliding leaf: wooden lattice over paper
    const leaf = new THREE.Group();
    const paper = new THREE.MeshStandardMaterial({ color: 0xf0e8d8, roughness: 0.9, emissive: new THREE.Color(dest.tint || 0xfff0d0), emissiveIntensity: 0.15 });
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.04, hgt - 0.5), paper);
    pane.position.set(0, hgt / 2 + 0.15, 0);
    leaf.add(pane);
    const lower = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, 0.035), wood);
    lower.position.set(0, 0.25, 0);
    leaf.add(lower);
    for (let n = 0; n <= 4; n++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.025, hgt - 0.5, 0.04), wood);
      bar.position.set(-w / 2 + (n * w) / 4, hgt / 2 + 0.25, 0.005);
      leaf.add(bar);
    }
    for (let n = 0; n <= 5; n++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.025, 0.04), wood);
      bar.position.set(0, 0.5 + (n * (hgt - 0.5)) / 5, 0.005);
      leaf.add(bar);
    }
    leaf.position.set(0, 0, 0.05);
    group.add(leaf);
    // noren with ゆ, swaying
    const tex = norenTexture('yu', '');
    const nm = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.95 });
    const panels = [];
    for (let k = 0; k < 2; k++) {
      const geo = new THREE.PlaneGeometry(0.46, 0.75, 1, 3);
      geo.translate(0, -0.375, 0);
      const uv = geo.attributes.uv;
      for (let v = 0; v < uv.count; v++) uv.setX(v, 0.2 + (k + uv.getX(v)) * 0.3);
      const pm = new THREE.Mesh(geo, nm);
      pm.position.set(-0.235 + k * 0.47, hgt + 0.02, 0.16);
      group.add(pm);
      panels.push(pm);
    }
    const leak = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.1, 1.0), new THREE.MeshBasicMaterial({ color: dest.tint || 0xfff0d0, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }));
    leak.rotation.x = -PI / 2;
    leak.position.set(0, 0.012, 0.5);
    group.add(leak);
    return {
      group,
      update(dt, time, open) {
        leaf.position.x = -open * (w - 0.1);
        lightMat.color.copy(beyond).multiplyScalar(0.05 + open * 0.95);
        leak.material.opacity = 0.1 + open * 0.3 + Math.sin(time * 3) * 0.02;
        panels.forEach((p, k) => (p.rotation.x = Math.sin(time * 1.1 + k) * 0.05 + open * 0.25));
      },
    };
  },
};
