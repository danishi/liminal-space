import * as THREE from 'three';
import { glow } from '../common.js';
import { keep } from '../../props/kit.js';
import { photo } from '../../core/assets.js';
import { signTexture, screenStatic } from '../../props/canvas.js';
import { glowSprite } from '../../core/textures.js';
import { CS, PI } from './constants.js';
import { armTex, boardTex } from './textures.js';
import { mBox, flatGeo, remapUV } from './geometry.js';

/** The way in: barrier gate, attendant's booth, ticket machine, availability board and shutter. */
export function entrance(world, lvl) {
  const { kit, M } = lvl;

  // ---- entrance: barrier gate, booth, ticket machine, shutter --------------------
  const bx = 44.5 * CS;
  const bz = 5.55 * CS;
  const island = new THREE.Group();
  kit.mesh(island, mBox(7.4, 0.15, 2.4, { s: 1.5 }), M.concrete, 0, 0.075, 0);
  kit.mesh(island, mBox(7.44, 0.152, 0.08, { s: 0.7 }), M.hazard, 0, 0.076, -1.2);
  kit.add(island, 44.45 * CS, 5.5 * CS, 0, { collide: [7.4, 2.4] });
  // the booth: white panels below, glass above, a lamp and a little TV inside
  const booth = new THREE.Group();
  const white = kit.std(0x9c9a92, 0.5, 0.2);
  const glass = kit.mat('glass', () => new THREE.MeshStandardMaterial({ color: 0x6a8088, roughness: 0.04, metalness: 0.4, transparent: true, opacity: 0.22, depthWrite: false }));
  const frame = kit.std(0x3a3c3e, 0.4, 0.6);
  const BW = 1.9;
  for (const [x, z, ry] of [[0, -BW / 2, 0], [0, BW / 2, 0], [-BW / 2, 0, PI / 2], [BW / 2, 0, PI / 2]]) {
    kit.box(booth, BW, 0.95, 0.06, white, x, 0.475, z, 0, ry, 0);
    const door = z > 0 && ry === 0;
    if (!door) kit.box(booth, BW - 0.1, 1.2, 0.02, glass, x, 1.55, z, 0, ry, 0);
  }
  for (const x of [-1, 1]) for (const z of [-1, 1]) kit.box(booth, 0.07, 2.3, 0.07, frame, (x * BW) / 2, 1.15, (z * BW) / 2);
  kit.box(booth, BW + 0.3, 0.14, BW + 0.3, white, 0, 2.37, 0);
  kit.box(booth, BW + 0.32, 0.05, BW + 0.32, frame, 0, 2.3, 0);
  kit.box(booth, BW - 0.1, 0.05, 0.4, kit.std(0x6a5a44, 0.6), 0, 0.95, -0.72);
  // lightbox on the roof
  const payTex = signTexture('ATTENDANT', 'Pay here · 24 h', { bg: '#1f4a78', fg: '#fff', w: 512, h: 128 });
  const payMat = kit.mat('paysign', () => new THREE.MeshStandardMaterial({ map: payTex, emissiveMap: payTex, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.4 }));
  kit.box(booth, 1.3, 0.3, 0.1, frame, 0, 1.98, -BW / 2 - 0.07);
  keep(kit.plane(booth, 1.24, 0.26, payMat, 0, 1.98, -BW / 2 - 0.121, 0, PI, 0)).userData.noBake = true;
  // window frames, a sliding pay hatch and a rubber mat
  for (const y of [0.97, 2.15]) kit.box(booth, BW + 0.02, 0.05, BW + 0.02, frame, 0, y, 0);
  kit.box(booth, 0.03, 1.2, 0.07, frame, 0, 1.55, -BW / 2);
  kit.box(booth, 0.5, 0.04, 0.3, frame, 0.3, 0.98, -BW / 2 - 0.1);
  kit.box(booth, BW - 0.06, 0.02, 0.4, kit.std(0x1a1a1a, 0.9), 0, 0.02, -BW / 2 - 0.3);
  const lampShade = kit.cyl(booth, 0.05, 0.1, 0.1, kit.glow(0xffc070, 2.2), 0.55, 1.2, -0.7);
  keep(lampShade);
  const tv = kit.plane(booth, 0.26, 0.2, new THREE.MeshBasicMaterial({ map: screenStatic(3), color: new THREE.Color(0.9, 1.1, 1.0) }), -0.55, 1.13, -0.62, -0.2, PI, 0);
  keep(tv).userData.noBake = true;
  kit.box(booth, 0.32, 0.26, 0.26, kit.std(0x2a2a2a, 0.6), -0.55, 1.1, -0.76);
  kit.add(booth, bx, bz, 0, { y: 0.15, collide: [BW + 0.1, BW + 0.1] });
  world.bakeSources.push({ pos: new THREE.Vector3(bx, 1.9, bz), color: new THREE.Color(1, 0.8, 0.55), intensity: 2.5 });
  const boothGlow = glow(0xffc070, 3.2, 0.12);
  boothGlow.position.set(bx, 1.5, bz);
  world.root.add(boothGlow);

  // barrier gate: the arm lifts for anyone, and leads nowhere in particular
  const gx = 43.2 * CS;
  const gz = 5.08 * CS;
  const gate = new THREE.Group();
  kit.mesh(gate, mBox(0.36, 1.05, 0.36, { s: 0.7 }), M.hazard, 0, 0.525, 0);
  kit.box(gate, 0.4, 0.12, 0.4, M.dark, 0, 1.1, 0);
  kit.add(gate, gx, gz, 0, { y: 0.15 });
  const armPivot = new THREE.Group();
  armPivot.position.set(gx, 1.12, gz);
  const armMat = new THREE.MeshStandardMaterial({ map: armTex(), roughness: 0.5 });
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 4.8), armMat);
  arm.position.set(0, 0, -2.45);
  armPivot.add(arm);
  const tipLamp = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  tipLamp.position.set(0, 0.07, -4.8);
  armPivot.add(tipLamp);
  world.root.add(armPivot);
  let armA = 0;
  let armUp = false;
  let gatePanner = null;

  // ticket machine on the driver's side
  const tm = new THREE.Group();
  kit.box(tm, 0.5, 1.25, 0.42, kit.std(0x2e5a8a, 0.4, 0.4), 0, 0.625, 0);
  kit.box(tm, 0.52, 0.06, 0.44, frame, 0, 1.28, 0);
  const tkt = signTexture('TICKET', 'Press the button', { bg: '#0e1a24', fg: '#9fe0ff', w: 256, h: 128 });
  kit.plane(tm, 0.36, 0.2, kit.tex('g-ticket', tkt, { emissiveMap: tkt, emissive: 0xffffff, emissiveIntensity: 0.8 }), 0, 1.02, 0.212);
  keep(kit.sphere(tm, 0.035, kit.glow(0x40ff80, 2), 0.12, 0.78, 0.21));
  kit.box(tm, 0.16, 0.02, 0.03, M.dark, -0.06, 0.72, 0.22);
  kit.add(tm, 44.2 * CS, 2.35 * CS, 0, { collide: [0.5, 0.45] });
  const TICKETS = [
    ['(Beep. A ticket slides out.)', '(ENTERED: 03:00. The clock on the machine also says 03:00.)'],
    ['(Beep. Another ticket. ENTERED: 03:00.)', '(You have now entered twice, without leaving once.)'],
    ['(Beep. A ticket. On the back, in pencil: “P6”.)'],
    ['(The machine is out of tickets. The little screen says PLEASE WAIT.)', '(You wait. It is 03:00.)'],
  ];
  let tickets = 0;
  world.interactables.push({
    pos: new THREE.Vector3(44.2 * CS, 0, 2.35 * CS + 0.2), aimHeight: 0.9, interactRange: 2.2, prompt: 'Press the button',
    interact: (game) => {
      game.audio.beep(null, 1.1, 1);
      game.openDialog('the ticket machine', TICKETS[Math.min(tickets++, TICKETS.length - 1)], 1.3);
    },
  });
  // availability board on the entrance wall
  const board = new THREE.Group();
  kit.box(board, 1.3, 0.72, 0.1, frame, 0, 0, 0.05);
  kit.plane(board, 1.2, 0.6, new THREE.MeshBasicMaterial({ map: boardTex(world.depth >= 3), color: new THREE.Color(1.3, 1.3, 1.3) }), 0, 0, 0.101);
  kit.add(board, 45.3 * CS, 2 * CS, 0, { y: 1.85 });
  // the way in is shuttered: a slit of cold street light underneath
  const shutter = new THREE.Group();
  const shutMat = photo('painted_metal_shutter', { uvScale: 1.5, color: 0x8a9096, metalness: 0.5, roughness: 0.6 });
  const sg = new THREE.PlaneGeometry(2 * CS, 2.55);
  remapUV(sg, [0, 0, (2 * CS) / 1.5, 2.55 / 1.5]);
  kit.mesh(shutter, sg, shutMat, 0, 1.3, 0.03);
  kit.box(shutter, 2 * CS + 0.3, 0.25, 0.3, frame, 0, 2.6, 0.15);
  const slit = kit.plane(shutter, 2 * CS - 0.1, 0.03, kit.glow(0x9fb8d8, 1.6), 0, 0.02, 0.05);
  keep(slit);
  kit.plane(shutter, 1.6, 0.4, kit.tex('g-closed', signTexture('CLOSED', 'Open 00:00 – 00:00', { bg: '#f0ece2', fg: '#8a1a14', w: 512, h: 128 })), 0, 1.5, 0.05);
  kit.add(shutter, 47 * CS - 0.02, 3.95 * CS, -PI / 2);
  const street = new THREE.Mesh(flatGeo(1.4, 2 * CS), new THREE.MeshBasicMaterial({ map: glowSprite(), color: new THREE.Color(0.12, 0.16, 0.22), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  street.position.set(47 * CS - 0.6, 0.01, 3.95 * CS);
  street.userData.noBake = true;
  world.root.add(street);

  // run from onUpdate: the barrier lifts for whoever comes near it
  const updateGate = (dt, ctx) => {
    const p = ctx.player.pos;
    const near = !ctx.attract && Math.hypot(p.x - gx, p.z - (gz - 2.4)) < 5;
    if (near !== armUp) {
      armUp = near;
      const audio = ctx.game.audio;
      if (audio.ready) {
        if (!gatePanner) gatePanner = audio.panner(gx, 1, gz, { ref: 3 });
        audio.beep(gatePanner, 0.7, 1);
        audio.tone({ type: 'sawtooth', f: 70, f2: 95, a: 0.05, d: 1.1, peak: 0.025, send: 0.3, dest: gatePanner });
      }
    }
    armA += ((armUp ? 1.45 : 0) - armA) * Math.min(1, dt * 1.6);
    armPivot.rotation.x = armA;
    tipLamp.material.color.setRGB(2, 0.2, 0.1).multiplyScalar(armUp ? 0.2 : 0.6 + 0.4 * Math.sin(ctx.t * 4));
  };
  const disposeGate = () => gatePanner?.disconnect();

  Object.assign(lvl, { bx, bz, frame, updateGate, disposeGate });
}
