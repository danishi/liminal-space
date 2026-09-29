import * as THREE from 'three';
import { keep } from '../../props/kit.js';
import { PI, MW } from './constants.js';
import { SERIF, norenTexture, boardTexture, kawaraTexture } from './textures.js';
import { hangingPlate } from './props.js';
import { Noren } from './entities.js';

/** Eaves, lattice, lanterns, the name board, the ゆ noren and the chimney of one bathhouse (m). */
export function frontage(world, lvl, m) {
  const { at, kit, bakeSources, fixture } = lvl;

  // ---------------- the facade on the alley
  const f = at(m, 0, 8.5, -0.02, PI);
  const grp = new THREE.Group();
  // tiled eaves over the entrance and along the top of the front
  const kawara = kit.mat('kawara', () => {
    const t = kawaraTexture().clone();
    t.repeat.set(6, 1);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.45, metalness: 0.2 });
  });
  const eaveWood = kit.std(0x2a1c12, 0.6);
  kit.box(grp, 5.4, 0.1, 1.4, kawara, 0, 3.0, 0.66, 0.3);
  kit.box(grp, 5.4, 0.12, 0.1, eaveWood, 0, 2.8, 1.32);
  for (const x of [-2.5, 2.5]) kit.box(grp, 0.1, 0.1, 1.3, eaveWood, x, 2.9, 0.65, 0.3);
  kit.box(grp, MW, 0.12, 1.0, kawara, 0, 4.75, 0.42, 0.35);
  kit.box(grp, MW, 0.14, 0.08, eaveWood, 0, 4.6, 0.9);
  // wooden lattice either side of the door
  for (const sx of [-1, 1]) {
    for (let n = 0; n < 16; n++) kit.box(grp, 0.035, 1.7, 0.05, eaveWood, sx * (2.2 + n * 0.1), 1.75, 0.05);
    kit.box(grp, 1.65, 0.06, 0.07, eaveWood, sx * 2.95, 2.62, 0.05);
    kit.box(grp, 1.65, 0.06, 0.07, eaveWood, sx * 2.95, 0.9, 0.05);
  }
  // red paper lanterns
  const lanTex = boardTexture('chochin', 256, 256, '#e03a1a', [['ゆ', 0.7, '#1a0a06', 900, SERIF]]);
  const lanMat = kit.mat('chochin', () => new THREE.MeshStandardMaterial({ map: lanTex, emissive: 0xffffff, emissiveMap: lanTex, emissiveIntensity: 1.1, roughness: 0.8 }));
  for (const sx of [-1, 1]) {
    kit.sphere(grp, 0.2, lanMat, sx * 1.85, 2.3, 1.05, 1, 1.35, 1, 16);
    kit.cyl(grp, 0.12, 0.12, 0.05, kit.std(0x111111, 0.5), sx * 1.85, 2.58, 1.05);
    kit.cyl(grp, 0.12, 0.12, 0.05, kit.std(0x111111, 0.5), sx * 1.85, 2.02, 1.05);
    kit.cyl(grp, 0.01, 0.01, 0.25, kit.std(0x111111, 0.5), sx * 1.85, 2.72, 1.05);
  }
  // name board
  const nameTex = boardTexture(`name:${m.name}`, 1024, 256, [70, 44, 24], [[m.name, 0.72, '#f4e8c8', 900, SERIF]], { wood: true, border: '#c8a060' });
  kit.add(hangingPlate(kit, nameTex, 2.6, 0.65, 0, 0, 0, 0, { glow: 0.35, frame: 0x2a1a0e }), 0, 0, 0);
  const nb = kit.placed.pop();
  nb.position.set(0, 4.0, 0.03);
  grp.add(nb);
  // glowing ゆ light box
  const yuTex = boardTexture('yu-box', 256, 256, '#fbf6ea', [['ゆ', 0.8, '#c01818', 900]]);
  const box = new THREE.Group();
  kit.box(box, 0.5, 0.5, 0.16, kit.std(0x333333, 0.5, 0.5), 0, 0, 0);
  const face = kit.mat('yuFace', () => new THREE.MeshStandardMaterial({ map: yuTex, emissive: 0xffffff, emissiveMap: yuTex, emissiveIntensity: 1.3 }));
  kit.plane(box, 0.46, 0.46, face, 0, 0, 0.081);
  kit.plane(box, 0.46, 0.46, face, 0, 0, -0.081, 0, PI, 0);
  box.position.set(-3.2, 3.55, 0.45);
  box.rotation.y = PI / 2;
  kit.box(grp, 0.04, 0.04, 0.5, kit.std(0x333333, 0.5, 0.6), -3.2, 3.83, 0.22);
  grp.add(box);
  kit.add(grp, f.x, f.z, f.yaw, { y: 0 });
  const n = new THREE.Vector3(Math.sin(f.yaw), 0, Math.cos(f.yaw));
  bakeSources.push({ pos: new THREE.Vector3(f.x + n.x * 0.9, 2.6, f.z + n.z * 0.9), color: new THREE.Color(1, 0.8, 0.55), intensity: 5, range: 9 });
  fixture(f.x + n.x * 0.7, 2.85, f.z + n.z * 0.7, { intensity: 0.6, color: 0xffc890, visible: false });
  // noren ゆ outside the doors
  const tex = norenTexture('yu', m.name);
  const nm = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.95 });
  const holder = new THREE.Group();
  holder.position.set(f.x + n.x * 0.35, 2.28, f.z + n.z * 0.35);
  holder.rotation.y = f.yaw;
  const panels = [];
  for (let k2 = 0; k2 < 3; k2++) {
    const geo = new THREE.PlaneGeometry(0.92, 1.0, 1, 4);
    geo.translate(0, -0.5, 0);
    const uv = geo.attributes.uv;
    for (let v = 0; v < uv.count; v++) uv.setX(v, (k2 + uv.getX(v)) / 3);
    const pm = new THREE.Mesh(geo, nm);
    pm.position.set(-0.95 + k2 * 0.95, 0, 0);
    pm.userData.push = 0;
    holder.add(pm);
    panels.push(pm);
  }
  world.root.add(holder);
  holder.updateMatrixWorld(true);
  for (const pm of panels) pm.userData.world = pm.getWorldPosition(new THREE.Vector3());
  world.add(new Noren(world, panels, holder.position.clone(), n));
  // chimney behind the bath hall, with the name down its side
  const c = at(m, 0, 14.5, 26.5);
  const chim = new THREE.Group();
  const conc = kit.std(0x8a8680, 0.9);
  kit.cyl(chim, 0.32, 0.48, 22, conc, 0, 11, 0, 0, 0, 0, 16);
  kit.cyl(chim, 0.36, 0.36, 0.4, kit.std(0x2a2826, 0.8), 0, 21.9, 0, 0, 0, 0, 16);
  const vt = boardTexture(`chim:${m.name}`, 128, 512, '#f2eee4', m.name.split('').map((ch) => [ch, 0.24, '#1a1a1a', 900, SERIF]));
  const vm = kit.mat(`chimSign:${m.name}`, () => new THREE.MeshStandardMaterial({ map: vt, roughness: 0.8 }));
  for (const a of [0, PI / 2, PI, -PI / 2]) {
    kit.plane(chim, 0.46, 2.4, vm, Math.sin(a) * 0.4, 15, Math.cos(a) * 0.4, 0, a, 0);
  }
  const warn = keep(kit.sphere(chim, 0.12, kit.glow(0xff2a1a, 3), 0, 22.2, 0));
  warn.userData.blink = true;
  kit.add(chim, c.x, c.z, 0, { y: 0 });
}

export function sideLamps(world, lvl, m) {
  const { at, kit, fixture } = lvl;

  // lamps over the side doors
  for (const d of m.doors || []) {
    const p = at(m, 0, d.li === 0 ? -0.1 : 17.1, d.lj + 0.5, d.li === 0 ? -PI / 2 : PI / 2);
    fixture(p.x, 2.45, p.z, { intensity: 0.45, color: 0xffb870, visible: false });
    const bulb = new THREE.Group();
    kit.sphere(bulb, 0.06, kit.glow(0xffd090, 4), 0, 0, 0);
    kit.box(bulb, 0.08, 0.08, 0.2, kit.std(0x2a2a2a, 0.5), 0, 0.06, -0.08);
    kit.add(bulb, p.x, p.z, p.yaw, { y: 2.45 });
  }
}
