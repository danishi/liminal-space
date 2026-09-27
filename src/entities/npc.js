import * as THREE from 'three';
import { updateProbe, idlePose, lookAt } from './figures.js';

/**
 * A resident you can talk to. `conversations` is a list of line arrays; each
 * talk plays the next conversation, and the last one repeats.
 */
export class NPC {
  constructor(world, { name, pos, model, conversations, voice = 1, radius = 0.45, face = true, prompt = null, onTalk = null, marker = true }) {
    this.world = world;
    this.name = name;
    this.object = model;
    this.object.position.copy(pos);
    this.pos = pos.clone();
    this.conversations = conversations;
    this.talkIndex = 0;
    this.voice = voice;
    this.face = face;
    this.promptText = prompt || `Talk to ${name}`;
    this.onTalk = onTalk;
    this.interactRange = 2.6;
    this.aimHeight = 1.0;
    this.t = Math.random() * 10;
    this.targetYaw = model.rotation.y;
    this.talking = false;
    if (radius > 0) world.addCircle(this.object, radius);
    if (marker) world.npcMarkers.push(this.object.position);
  }

  get prompt() {
    return this.promptText;
  }

  interact(game) {
    const lines = this.conversations[Math.min(this.talkIndex, this.conversations.length - 1)];
    this.talkIndex++;
    this.talking = true;
    this.onTalk?.(game, this);
    game.openDialog(this.name, lines, this.voice, () => (this.talking = false));
  }

  update(dt, ctx) {
    this.t += dt;
    this.pos.copy(this.object.position);
    // sculpted residents pick up the level's baked light where they stand
    if (this.object.userData.mat) {
      this.probeT = (this.probeT || 0) - dt;
      if (this.probeT <= 0) {
        this.probeT = 0.4;
        updateProbe(this.object, this.world, this.object.position);
      }
    }
    if (!this.face || ctx.attract) return this.idle?.(dt, ctx);
    const p = ctx.player.pos;
    const dx = p.x - this.object.position.x;
    const dz = p.z - this.object.position.z;
    if (dx * dx + dz * dz < 36) this.targetYaw = Math.atan2(dx, dz);
    let diff = this.targetYaw - this.object.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.object.rotation.y += diff * Math.min(1, dt * 3);
    this.idle?.(dt, ctx);
  }
}

/**
 * A resident who wandered in from another level through a crossed signal.
 * Humanoids stand about looking round, confused; anything else just idles.
 */
export function strayNPC(world, pos, { name, model, lines, voice = 1, radius = 0.35, onTalk = null, prompt = null, aimHeight = 1.2 }) {
  model.position.copy(pos);
  const npc = new NPC(world, { name, pos, model, voice, radius, face: false, conversations: lines, onTalk, prompt });
  npc.aimHeight = aimHeight;
  const rig = model.userData.rig;
  const eye = new THREE.Vector3();
  if (rig && rig.bones.hips) {
    npc.idle = (dt, ctx) => {
      idlePose(rig, npc.t);
      if (npc.talking || ctx.player.pos.distanceTo(model.position) < 3) lookAt(model, eye.copy(ctx.camera.position), { max: 1 });
      else rig.rot('head', 0.05, Math.sin(npc.t * 0.45) * 0.9, Math.sin(npc.t * 0.3) * 0.1);
    };
  }
  return npc;
}

NPC.prototype.dispose = function () {
  this.panner?.disconnect?.();
};

/** Shared toon-ish material helper for residents. */
export function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...extra });
}
