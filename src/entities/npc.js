import * as THREE from 'three';

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

/** Shared toon-ish material helper for residents. */
export function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...extra });
}
