import * as THREE from 'three';
import { LOOKS } from '../../entities/looks.js';
import { applyPose, lookAt } from '../../entities/figures.js';
import { NPC } from '../../entities/npc.js';
import { PI, PIT } from './constants.js';
import { KiddieRide } from './entities.js';

/** The sleeping guard, the directories and the fountain that answer, and the kiddie ride. */
export function residents(world, lvl) {
  const { kiddie, directories, chairX, chairZ, fx, fz } = lvl;
  // ---- residents ----------------------------------------------------------------------------------
  const model = LOOKS.guard();
  model.position.set(chairX, 0, chairZ);
  model.rotation.y = PI;
  const guard = world.add(new NPC(world, {
    name: 'the security guard',
    pos: model.position.clone(),
    model,
    voice: 0.75,
    radius: 0.45,
    face: false,
    conversations: [
      ['(snrk—) Hm? I’m awake. I was resting my eyes. On purpose.', 'Mall closes at nine. It’s been nine for a while.', 'Lost and found is that way. So is everything else.'],
      ['If you see a mannequin move, no you didn’t.', 'They get restless when the music skips. Keep walking. Don’t make eye contact. They don’t have eyes, but still.'],
      ['The escalators have been stairs since ’97. Nobody complained. Nobody’s here to.', 'Food court’s still open. Nobody works there, but it’s open.'],
      ['I’d walk you out, but the exit keeps being the entrance.', 'Go on. Shop around. Something here is bound to fit.'],
      ['(He is asleep again. His radio crackles: “…copy, it’s nine o’clock…”)'],
    ],
  }));
  let snore = 3;
  let wake = 0;
  const eye = new THREE.Vector3();
  guard.idle = (dt, ctx) => {
    const rig = model.userData.rig;
    applyPose(rig, 'sit');
    const br = Math.sin(guard.t * 1.1);
    rig.rot('spine', -0.12, 0, 0);
    rig.rot('chest', -0.05 + br * 0.03, 0, 0);
    // hands folded on the belly
    rig.rot('armL', -0.25, 0, 0.12);
    rig.rot('foreL', -1.35, -0.55, 0);
    rig.rot('armR', -0.25, 0, -0.12);
    rig.rot('foreR', -1.35, 0.55, 0);
    rig.rot('thighL', -1.35, 0, 0.18);
    rig.rot('thighR', -1.35, 0, -0.18);
    wake += ((guard.talking ? 1 : 0) - wake) * Math.min(1, dt * 2.5);
    lookAt(model, eye.copy(ctx.camera.position), { max: 1.0 });
    rig.blend({ neck: [0.45, 0.05, 0.05], head: [0.5 + br * 0.05, 0.2, 0.15] }, 1 - wake);
    snore -= dt;
    if (snore <= 0 && !guard.talking && !ctx.attract) {
      snore = 4.4;
      const d = ctx.player.pos.distanceTo(model.position);
      if (d < 12 && ctx.game.audio.ready) {
        if (!guard.panner) guard.panner = ctx.game.audio.panner(model.position.x, 1.1, model.position.z, { ref: 1.5, rolloff: 1.3 });
        ctx.game.audio.snore(guard.panner);
      }
    }
  };

  // the directories and the fountain answer when you pay attention to them
  for (const d of directories) {
    const e = new NPC(world, {
      name: 'the directory', pos: new THREE.Vector3(d.x, 0, d.z), model: new THREE.Group(), radius: 0, face: false, marker: false, prompt: 'Read the directory',
      conversations: d.u > 0.9
        ? [['(Seven stars say “YOU ARE HERE”. One of them is inside a wall.)', '(The last one says “YOU ARE NOT HERE”. It is also where you are standing.)'], ['(You count the stars again. There is one more than before.)']]
        : d.u > 0.5
          ? [['(Three stars say “YOU ARE HERE”.)', '(That seems like a lot of here.)']]
          : [['“YOU ARE HERE.”', '(The star is where you are standing. It’s nice to have that confirmed.)'], ['(Level 2 has a waterbed store. Of course it does.)']],
    });
    e.aimHeight = 1.3;
    e.interactRange = 2.2;
    world.add(e);
  }
  {
    const coin = new NPC(world, {
      name: 'the fountain', pos: new THREE.Vector3(fx, PIT, fz), model: new THREE.Group(), radius: 0, face: false, marker: false, prompt: 'Toss a coin in',
      conversations: [
        ['(You toss a coin into the dry fountain. It lands with a clink.)', '(Somewhere, a wish is filed under “pending”.)'],
        ['(Clink.)', '(A voice from the PA says: “Thank you.”)'],
        ['(Clink.)'],
      ],
      onTalk: (game) => {
        if (!game.audio.ready) return;
        const t = game.audio.now + 0.35;
        game.audio.tone({ type: 'sine', f: 2637, t, d: 0.25, peak: 0.05, send: 0.6 });
        game.audio.tone({ type: 'sine', f: 3520, t: t + 0.09, d: 0.3, peak: 0.03, send: 0.6 });
      },
    });
    coin.aimHeight = 0.6;
    coin.interactRange = 4.2;
    world.add(coin);
  }
  if (kiddie) world.add(new KiddieRide(world, kiddie.x, 0, kiddie.z, kiddie.yaw));
}
