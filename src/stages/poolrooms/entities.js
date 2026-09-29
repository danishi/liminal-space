import * as THREE from 'three';
import { NPC } from '../../entities/npc.js';
import { duckModel } from './props.js';

const _fwd = new THREE.Vector3();

/** A little duck bobbing on the water that squeaks and hops when poked. */
export function littleDuck(world, pos, yaw, { spin = 0.1 } = {}) {
  const model = duckModel(0.62);
  model.position.copy(pos);
  model.rotation.y = yaw;
  const baseY = pos.y;
  const little = new NPC(world, { name: 'a duck', pos: model.position.clone(), model, radius: 0, face: false, marker: false, prompt: 'Poke the duck', conversations: [[]] });
  little.interactRange = 2.2;
  little.aimHeight = 0.1;
  little.interact = (game) => {
    game.audio.squeak();
    little.hop = 1;
  };
  little.hop = 0;
  little.idle = (dt) => {
    little.hop = Math.max(0, little.hop - dt * 2.5);
    model.position.y = baseY + Math.sin(little.t * 1.7) * 0.02 + Math.sin(little.hop * Math.PI) * 0.25;
    model.rotation.y += dt * spin;
  };
  return little;
}

/**
 * The Giant Duck, six metres of rubber afloat in the lap pool. It turns to keep
 * you in view; deeper in, it only turns while you aren't looking at it.
 */
export function giantDuck(world, pos, yaw) {
  const model = duckModel(13);
  model.position.copy(pos);
  model.rotation.y = yaw;
  const base = pos.y;
  const duck = new NPC(world, {
    name: 'the Giant Duck',
    pos: model.position.clone(),
    model,
    voice: 0.55,
    radius: 2.6,
    face: false,
    conversations: [
      ['BOB... BOB...', 'Oh. A swimmer. We have not had one of those in a long time.', 'Welcome to the big pool. Twenty-five metres, five lanes, one duck.', 'Mind the deep ends. Sink into one and you come up somewhere else entirely.'],
      ['I was a bath duck once. Then I floated in here, and the water kept being more water.', 'Nothing scary lives here. ...Probably.'],
      ['The little ones follow me everywhere. I have never told them how big I am.', 'Stay too long, though, and you stop wanting to leave. Maybe that is the scariest part.'],
      ['BOB.'],
    ],
    onTalk: (game) => game.audio.squeak(null, 0.32),
  });
  duck.interactRange = 7.5;
  duck.aimHeight = 2.4;
  const watch = 10 + world.depth * 5;
  const sly = world.depth >= 2;
  let heading = yaw;
  duck.idle = (dt, ctx) => {
    const o = duck.object;
    o.position.y = base + Math.sin(duck.t * 0.6) * 0.06;
    if (!ctx.attract) {
      const dx = ctx.player.pos.x - o.position.x;
      const dz = ctx.player.pos.z - o.position.z;
      const d = Math.hypot(dx, dz);
      if (d < watch || duck.talking) {
        let diff = Math.atan2(dx, dz) - heading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        let rate = duck.talking ? 1.2 : 0.22;
        if (sly && !duck.talking) {
          ctx.player.forward(_fwd);
          const seen = -(_fwd.x * dx + _fwd.z * dz) / (Math.hypot(_fwd.x, _fwd.z) * d + 1e-6) > 0.55;
          rate = seen ? 0 : 0.9;
        }
        heading += Math.sign(diff) * Math.min(Math.abs(diff), rate * dt);
      }
    }
    o.rotation.set(Math.sin(duck.t * 0.43) * 0.025, heading, Math.sin(duck.t * 0.31) * 0.035);
  };
  return duck;
}
