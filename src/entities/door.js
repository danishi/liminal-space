import * as THREE from 'three';

/**
 * A door that leads to another level. It swings open as you approach,
 * spilling light and a faint sound from the other side; walking through
 * it (or pressing interact) drifts you there.
 * `model` comes from the stage: { group, update?(dt, t, open) }. Local +Z faces the room.
 */
export class DriftDoor {
  constructor(world, mount, model, dest) {
    this.world = world;
    this.mount = mount;
    this.model = model;
    this.dest = dest;
    this.seen = false;
    this.open = 0;
    this.t = 0;
    const g = (this.object = new THREE.Group());
    g.add(model.group);
    const y = mount.y ?? 0;
    g.position.set(mount.x + mount.nx * 0.02, y, mount.z + mount.nz * 0.02);
    g.rotation.y = Math.atan2(mount.nx, mount.nz);
    this.pos = new THREE.Vector3(mount.x + mount.nx * 0.55, y + 1.2, mount.z + mount.nz * 0.55);
    this.interactRange = 2.4;
    this.panner = null;
  }

  get prompt() {
    return 'Step through the door';
  }

  interact(game) {
    game.drift(this.dest, 'door');
  }

  update(dt, ctx) {
    this.t += dt;
    if (ctx.attract) {
      this.model.update?.(dt, this.t, 0);
      return;
    }
    const p = ctx.player.pos;
    const d = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
    if (d < 9 && this.world.grid.los(p.x, p.z, this.pos.x, this.pos.z)) this.seen = true;
    const want = d < 4.5 ? 1 : 0;
    this.open += (want - this.open) * Math.min(1, dt * (want ? 1.2 : 0.8));
    this.model.update?.(dt, this.t, this.open);
    // a faint hum from the other side helps you find doors by ear
    const audio = ctx.game.audio;
    if (!this.panner && audio.ready) this.panner = audio.doorHum(this.pos.x, this.pos.y, this.pos.z);
    if (d < 0.7 && Math.abs(p.y + 1.2 - this.pos.y) < 1.5) ctx.game.drift(this.dest, 'door');
  }

  dispose() {
    this.panner?.stop();
  }
}
