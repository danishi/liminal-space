import * as THREE from 'three';
import { LOOKS } from '../../entities/looks.js';
import { idlePose, lookAt, beastPose, tailSway, updateProbe, POSES } from '../../entities/figures.js';
import { NPC } from '../../entities/npc.js';
import { PI } from './constants.js';

/** The attendant in the booth, and sometimes a cat on a car roof. */
export function residents(world, lvl) {
  const { rng, K, d, cars, bx, bz } = lvl;

  // ---- the attendant ------------------------------------------------------------
  const model = LOOKS.valet();
  model.position.set(bx, 0.15, bz + 0.1);
  model.rotation.y = PI;
  const attendant = world.add(new NPC(world, {
    name: 'the attendant',
    pos: model.position.clone(),
    model,
    voice: 0.85,
    radius: 0,
    conversations: [
      ['Evening. Ticket?', '...You don’t have a ticket.', 'That’s all right. Nobody has a ticket.'],
      ['Your car is on P6.', 'Everyone’s car is on P6.', 'If it isn’t on P6, it’s on P7. P7 is P6, a bit further down.'],
      ['The barrier goes up for anyone. It doesn’t go anywhere, but it goes up.', 'I think that’s important.'],
      ['If a car flashes its lights at you, just wave. They like that.', 'If one follows you, don’t look away from it. It’s shy.'],
      ['Drive safely. Or walk. Walking is also fine.'],
    ],
  }));
  let wave = 0;
  let waved = false;
  let bow = 0;
  let wasNear = false;
  const eye = new THREE.Vector3();
  attendant.idle = (dt, ctx) => {
    const rig = model.userData.rig;
    const dist = ctx.player.pos.distanceTo(model.position);
    if (!waved && dist < 8 && !ctx.attract) {
      waved = true;
      wave = 0.001;
    }
    const near = dist < 3.5;
    if (wasNear && !near && !ctx.attract) bow = 0.001;
    wasNear = near;
    idlePose(rig, attendant.t, { sway: 0.4 });
    rig.rot('armL', 0.1, 0, 0.05);
    rig.rot('foreL', -0.4, 0.3, 0);
    if (wave) {
      wave += dt * 0.45;
      const s = Math.sin(Math.min(1, wave) * PI);
      rig.blend(POSES.wave, s);
      rig.rot('foreR', 0, 0, -0.5 + Math.sin(attendant.t * 9) * 0.35 * s);
      if (wave >= 1) wave = 0;
    } else if (bow) {
      bow += dt * 0.7;
      rig.blend({ spine: [0.3, 0, 0], chest: [0.3, 0, 0], neck: [0.15, 0, 0], head: [0.1, 0, 0] }, Math.sin(Math.min(1, bow) * PI));
      if (bow >= 1) bow = 0;
    }
    if (!bow) lookAt(model, eye.copy(ctx.camera.position), { max: 0.9 });
  };

  // a cat, loafing on a car roof, as cats do
  const roofCars = cars.filter((c) => c.rig && !c.honker && d[K(c.bay.i, c.bay.row.j)] > 5 && d[K(c.bay.i, c.bay.row.j)] < 20);
  if (roofCars.length && rng.chance(0.75)) {
    const c = rng.pick(roofCars);
    const cat = LOOKS.cat();
    const ch = c.size[2];
    c.group.updateMatrixWorld(true);
    const pos = new THREE.Vector3(0, ch - 0.02, -0.2).applyMatrix4(c.group.matrixWorld);
    cat.position.copy(pos);
    cat.rotation.y = c.yaw + rng.float(-0.8, 0.8);
    beastPose(cat, 'loaf');
    world.root.add(cat);
    let petted = 0;
    let catT = 0;
    let probeT = 0;
    const lines = [['(It purrs. The car’s alarm does not go off. It has an understanding with the car.)'], ['Mrrp.'], ['(It is warm. The roof under it is warm. The engine is cold.)'], ['(It blinks slowly. You are, apparently, allowed to stay.)']];
    world.interactables.push({
      pos, aimHeight: 0.2, interactRange: 2.4, prompt: 'Pet the cat',
      interact: (game) => {
        game.audio.purr(null, 2.5);
        game.openDialog('the cat', lines[petted++ % lines.length], 1.6);
      },
    });
    world.animated.push((dt, ctx) => {
      catT += dt;
      probeT -= dt;
      if (probeT <= 0) {
        probeT = 0.5;
        updateProbe(cat, world, pos);
      }
      const rig = cat.userData.rig;
      beastPose(cat, 'loaf');
      tailSway(rig, catT, 0.12, 1);
      const yaw = Math.atan2(ctx.player.pos.x - pos.x, ctx.player.pos.z - pos.z) - cat.rotation.y;
      rig.rot('head', 0.1, Math.max(-1.1, Math.min(1.1, Math.atan2(Math.sin(yaw), Math.cos(yaw)))), 0);
    });
  }
}
