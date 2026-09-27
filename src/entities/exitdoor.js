import * as THREE from 'three';

/**
 * The stage exit, mounted on a wall. `model` comes from the stage:
 * { group, update?(dt, t, unlocked), onUnlock?() }. Local +Z faces the room.
 */
export class ExitDoor {
  constructor(world, mount, model) {
    this.world = world;
    this.mount = mount;
    this.model = model;
    this.unlocked = false;
    this.seen = false;
    this.t = 0;
    const g = (this.object = new THREE.Group());
    g.add(model.group);
    const y = world.floorAt(mount.x + mount.nx * 0.5, mount.z + mount.nz * 0.5);
    g.position.set(mount.x + mount.nx * 0.02, y, mount.z + mount.nz * 0.02);
    g.rotation.y = Math.atan2(mount.nx, mount.nz);
    this.pos = new THREE.Vector3(mount.x + mount.nx * 0.6, y + 1.2, mount.z + mount.nz * 0.6);
    this.interactRange = 2.4;
  }

  get prompt() {
    return this.unlocked ? '出口に入る' : '扉を調べる';
  }

  interact(game) {
    if (this.unlocked) game.clearStage();
    else {
      const left = this.world.fragments.length - this.world.collected;
      game.toast('扉は固く閉ざされている', `記憶の欠片があと ${left} 個必要だ`);
      game.audio.door();
    }
  }

  unlock() {
    this.unlocked = true;
    this.model.onUnlock?.();
  }

  update(dt, ctx) {
    this.t += dt;
    this.model.update?.(dt, this.t, this.unlocked);
    if (ctx.attract) return;
    const p = ctx.player.pos;
    const d = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
    if (d < 7 && this.world.grid.los(p.x, p.z, this.pos.x, this.pos.z)) this.seen = true;
    if (this.unlocked && d < 0.75) ctx.game.clearStage();
  }
}
