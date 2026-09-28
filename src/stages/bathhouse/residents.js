import * as THREE from 'three';
import { NPC } from '../../entities/npc.js';
import { inView } from '../../entities/creatures.js';
import { LOOKS } from '../../entities/looks.js';
import { applyPose, lookAt, beastPose, tailSway } from '../../entities/figures.js';
import { PI, BANDAI_TOP, Y_WOOD, Y_SURF, Y_TERR } from './constants.js';
import { newspaperTexture } from './textures.js';

/** The keeper at the bandai, soaking capybaras, and a cat. */
export function residents(world, lvl) {
  const { rng, g, K, modAt, mods, at, spawnMod, rcx, rcz, deep } = lvl;

  // ---- residents
  const keeperModel = LOOKS.keeper();
  applyPose(keeperModel.userData.rig, 'sit');
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.32), new THREE.MeshStandardMaterial({ map: newspaperTexture(), roughness: 0.9, side: THREE.DoubleSide }));
  paper.position.set(0, -0.06, 0.34);
  paper.rotation.x = -0.35;
  keeperModel.userData.rig.bones.chest.add(paper);
  let keeperMod = spawnMod;
  const seatAt = (m) => m.bandai.seat.clone();
  keeperModel.position.copy(seatAt(spawnMod));
  keeperModel.rotation.y = spawnMod.bandai.yaw;
  const keeper = new NPC(world, {
    name: 'the keeper',
    pos: keeperModel.position.clone(),
    model: keeperModel,
    voice: 0.8,
    radius: 0,
    face: false,
    conversations: [
      ['Evening. ¥520.', '...Or whatever you have. Nobody has paid in years.', 'Towels are ¥50. Soap is ¥30. The way out is not for sale.'],
      ['Drink milk after your bath. It’s the rule.', 'I don’t make the rules.', '...Well. I did make that one.'],
      ['The big bath is 42 degrees. The other big bath is also 42 degrees.', 'There are a lot of big baths.'],
      ['If you see someone standing in the steam, don’t stare. It’s rude.', 'They’re just drying off. For a very long time.'],
      ['Mind the deep end. Some of the baths go further down than the building does.', 'People come up somewhere else. They always look so refreshed.'],
      ['We close at midnight.', '(He glances at the clock. It is 11:58. It has been 11:58 since you arrived.)'],
      ['...', '(He turns a page of the newspaper. The date is today. It was also today yesterday.)'],
    ],
  });
  keeper.interactRange = 3.2;
  keeper.aimHeight = 0.5;
  const moved = [
    ['Welcome.', '(It is the same man. He is on the same page of the same newspaper.)'],
    ['Oh. You again.', '...Or me again. Hard to say, this late.'],
    ['(He does not look up.)', 'The next one is also the same. You can check if you like.'],
  ];
  let movedN = 0;
  const baseTalk = keeper.interact.bind(keeper);
  keeper.interact = (game) => {
    if (keeper.moved) {
      keeper.moved = false;
      game.openDialog(keeper.name, moved[movedN++ % moved.length], keeper.voice);
    } else baseTalk(game);
  };
  const eye = new THREE.Vector3();
  let read = 0;
  let bodyYaw = 0;
  keeper.idle = (dt, ctx) => {
    const rig = keeperModel.userData.rig;
    applyPose(rig, 'sit');
    const t = keeper.t;
    rig.rot('armL', -0.85, 0.15, 0.08);
    rig.rot('foreL', -1.1, 0.2, 0);
    rig.rot('armR', -0.85, -0.15, -0.08);
    rig.rot('foreR', -1.1, -0.2, 0);
    rig.rot('spine', 0.12 + Math.sin(t * 1.4) * 0.01, 0, 0);
    const p = ctx.player.pos;
    const near = Math.hypot(p.x - keeperModel.position.x, p.z - keeperModel.position.z) < 5.5;
    read += ((near ? 0 : 1) - read) * Math.min(1, dt * 1.5);
    // turns a little on his cushion toward you
    const want = near ? Math.atan2(p.x - keeperModel.position.x, p.z - keeperModel.position.z) - keeperMod.bandai.yaw : 0;
    const rel = Math.max(-0.7, Math.min(0.7, Math.atan2(Math.sin(want), Math.cos(want))));
    bodyYaw += (rel - bodyYaw) * Math.min(1, dt * 1.2);
    keeperModel.rotation.y = keeperMod.bandai.yaw + bodyYaw;
    if (read > 0.5) {
      rig.rot('neck', 0.35, Math.sin(t * 0.2) * 0.1, 0);
      rig.rot('head', 0.4, 0, 0);
    } else {
      keeperModel.updateMatrixWorld(true);
      lookAt(keeperModel, eye.copy(ctx.camera.position), { max: 1.1 });
    }
    paper.visible = true;
  };
  world.add(keeper);
  world.onDispose.push(() => paper.geometry.dispose());

  // the keeper is at whichever bandai you are nearest, if you aren't looking
  const modOfPos = (x, z) => {
    const [i, j] = g.cellOf(x, z);
    return g.inBounds(i, j) ? modAt[K(i, j)] : -1;
  };
  // called each frame: he moves to the bandai of whichever bathhouse you are in, when you aren't looking
  const moveKeeper = (pz, camera) => {
    const pm = modOfPos(pz.x, pz.z);
    if (pm >= 0 && mods[pm] !== keeperMod && modOfPos(keeperModel.position.x, keeperModel.position.z) !== pm) {
      const kp = keeperModel.position;
      const target = seatAt(mods[pm]);
      const visibleNow = inView(camera, kp.x, kp.y + 0.8, kp.z, 1.1) && g.los(pz.x, pz.z, kp.x, kp.z);
      const visibleThere = inView(camera, target.x, target.y + 0.8, target.z, 1.1) && g.los(pz.x, pz.z, target.x, target.z);
      if (!visibleNow && !visibleThere) {
        keeperMod = mods[pm];
        kp.copy(target);
        keeperModel.rotation.y = keeperMod.bandai.yaw;
        keeper.moved = true;
      }
    }
  };

  // capybaras soaking: one, and more the deeper you drift
  const capyCount = Math.min(8, 1 + world.depth + (world.depth >= 2 ? 1 : 0));
  const capyLines = [
    ['(It does not acknowledge you. This is the most relaxed anything has ever been.)'],
    ['(You lower yourself into the water next to it. 42 degrees.)', '(Your problems dissolve one at a time, starting with your name.)'],
    ['(The yuzu on its head turns slowly to face you.)'],
    ['(It exhales through its nose. The steam spells a word you don’t know yet.)'],
    ['(It opens one eye, then closes it. You have been judged, and found acceptable.)'],
  ];
  const capySpots = [];
  const modsByDist = [...mods].sort((a, b) => a.u - b.u);
  for (const m of modsByDist) {
    for (const s of [0, 1]) {
      const p = at(m, s, 2.2 + (s ? 0.4 : 0), 23.2 + (m.idx % 2) * 0.8, PI + (s ? 0.5 : -0.4));
      capySpots.push({ ...p, y: Y_SURF });
    }
  }
  capySpots.splice(2, 0, { x: rcx + 2.5, z: rcz + 0.5, yaw: -0.6, y: Y_TERR - 0.1 });
  const capys = [];
  for (let n = 0; n < capyCount && n < capySpots.length; n++) {
    const sp2 = capySpots[n];
    const [ci, cj] = g.cellOf(sp2.x, sp2.z);
    if (deep.has(K(ci, cj))) continue;
    const fig = LOOKS.capybara();
    beastPose(fig, 'loaf');
    fig.scale.setScalar(1.25);
    // heavy eyelids
    const lidMat = new THREE.MeshStandardMaterial({ color: 0x6a4a30, roughness: 0.95 });
    for (const e of fig.userData.eyes) {
      const r = e.geometry.boundingSphere?.radius || 0.018;
      const lid = new THREE.Mesh(new THREE.SphereGeometry(r * 1.18, 12, 8, 0, PI * 2, 0, PI * 0.5), lidMat);
      lid.rotation.x = 0.55;
      e.add(lid);
    }
    const base = sp2.y - 0.36;
    fig.position.set(sp2.x, base, sp2.z);
    fig.rotation.y = sp2.yaw;
    const capy = new NPC(world, { name: 'the capybara', pos: fig.position.clone(), model: fig, voice: 0.5, radius: 0.45, face: false, prompt: 'Join the capybara', conversations: [capyLines[n % capyLines.length], ...capyLines.filter((_, k) => k !== n % capyLines.length)], onTalk: (game) => game.audio.splash(null, 0.6) });
    capy.aimHeight = 0.35;
    capy.interactRange = 3;
    const ph = rng.float(0, 6);
    capy.idle = (dt) => {
      fig.position.y = base + Math.sin(capy.t * 0.7 + ph) * 0.012;
      fig.rotation.y = sp2.yaw + Math.sin(capy.t * 0.08 + ph) * 0.25;
      fig.rotation.z = Math.sin(capy.t * 0.5 + ph) * 0.02;
      const rig = fig.userData.rig;
      rig.rot('neck', -0.05 + Math.sin(capy.t * 0.3 + ph) * 0.04, 0, 0);
      rig.rot('head', 0.05, Math.sin(capy.t * 0.15 + ph) * 0.15, Math.sin(capy.t * 0.2) * 0.05);
      if (fig.userData.yuzu) fig.userData.yuzu.rotation.y += dt * 0.15;
    };
    world.add(capy);
    capys.push(capy);
  }

  // deeper in, a capybara cools off on a changing-room bench with a towel on its head
  if (world.depth >= 2) {
    const m = rng.pick(mods.filter((x) => x !== spawnMod));
    const p = at(m, 0, 4.2, 9.35, PI / 2);
    const fig = LOOKS.capybara();
    beastPose(fig, 'sit');
    fig.scale.setScalar(1.1);
    if (fig.userData.yuzu) fig.userData.yuzu.visible = false;
    const towel = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.16), new THREE.MeshStandardMaterial({ color: 0xf4f2ec, roughness: 1 }));
    towel.position.copy(fig.userData.yuzu ? fig.userData.yuzu.position : new THREE.Vector3(0, 0.18, 0));
    fig.userData.rig.bones.head.add(towel);
    fig.position.set(p.x, Y_WOOD + 0.42, p.z);
    fig.rotation.y = p.yaw;
    const bc = new NPC(world, { name: 'the capybara', pos: fig.position.clone(), model: fig, voice: 0.5, radius: 0, face: false, prompt: 'Sit with the capybara', conversations: [['(It is cooling down after its bath. It has earned this.)'], ['(It has a towel folded on its head. You feel underdressed.)'], ['(It is waiting for the milk fridge to be restocked. It has been waiting a long time. It does not mind.)']] });
    bc.aimHeight = 0.4;
    world.add(bc);
  }
  // a cat asleep on one of the bandai counters
  if (rng.chance(0.6)) {
    const m = rng.pick(mods.filter((x) => x !== spawnMod));
    const catFig = LOOKS.cat();
    beastPose(catFig, 'loaf');
    const cp = at(m, rng.int(0, 1), 8.5 - 1.32, 6.2, PI);
    catFig.position.set(cp.x, BANDAI_TOP, cp.z);
    catFig.rotation.y = cp.yaw;
    const cat = new NPC(world, { name: 'the bandai cat', pos: catFig.position.clone(), model: catFig, voice: 1.6, radius: 0, face: false, prompt: 'Pet the cat', conversations: [['(It purrs. It has been left in charge.)'], ['(It collects your ¥520 with a paw and does nothing with it.)'], ['Mrrp.']], onTalk: (game) => game.audio.purr(null, 2) });
    cat.aimHeight = 0.2;
    cat.idle = () => {
      tailSway(catFig.userData.rig, cat.t, 0.2, 0.8);
      catFig.userData.rig.rot('head', 0.3, Math.sin(cat.t * 0.2) * 0.3, 0.2);
    };
    world.add(cat);
  }

  Object.assign(lvl, { modOfPos, moveKeeper });
}
