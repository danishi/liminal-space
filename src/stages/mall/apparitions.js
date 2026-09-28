import * as THREE from 'three';
import { FLOOR } from '../../core/grid.js';
import { Watcher, Follower, Peeker, Mannequin, StrayCat } from '../../entities/creatures.js';
import { PI, ATRIUM, Z, WATCHER_LOOK, PA, PA_DEEP } from './constants.js';
import { DisplayMannequin, SkylightShadow } from './entities.js';

/** Mannequins and the things further out, then the per-frame dust drift and PA. */
export function apparitions(world, lvl) {
  const { rng, depth, g, K, zoneOf, claimed, displayMannequins, skylights, dustN, dGeo, dust } = lvl;
  // ---- apparitions --------------------------------------------------------------------------------
  // display mannequins pose in the windows, even at the title screen
  displayMannequins.forEach((m, n) => {
    const u = world.uneaseAt(m.pos.x, m.pos.z);
    world.add(new DisplayMannequin(world, { pos: m.pos, yaw: m.yaw, variant: n % 3, mode: u > 0.8 ? 'mixed' : 'funny', pose: rng.pick(['stand', 'runway', 'wave', 'peace', 'thinker', 'shrug']) }));
  });
  if (!world.attract) {
    // free-standing ones out on the concourse
    const nFree = 2 + Math.min(3, depth);
    const cells = world.pickFarCells(nFree, {
      minFrac: 0.2, spacing: 6,
      filter: (i, j) => zoneOf(i, j) === Z.PUB && g.get(i, j) === FLOOR && !g.ramp[K(i, j)] && !claimed.has(`${i},${j}`) && g.countSolidNeighbors(i, j) === 0,
    });
    cells.forEach(([i, j], k) => {
      const c = g.center(i, j);
      world.add(new Mannequin(world, { pos: new THREE.Vector3(c.x, g.heightOf(i, j), c.z), yaw: rng.float(0, PI * 2), variant: k, mode: depth <= 1 ? 'funny' : 'mixed' }));
    });
    world.add(new Watcher(world, { look: WATCHER_LOOK }));
    if (depth >= 1) world.add(new Peeker(world, { look: WATCHER_LOOK }));
    if (depth >= 2) world.add(new Follower(world));
    if (rng.chance(0.4)) world.add(new StrayCat(world));
    // someone lying on a skylight, far from the entrance
    if (depth >= 1 || rng.chance(0.35)) {
      const far = skylights.filter((s) => s.u > 0.35);
      if (far.length) {
        const s = rng.pick(far);
        world.add(new SkylightShadow(world, s.cx + rng.float(-1, 1), ATRIUM - 0.035, s.cz + rng.float(-2, 2)));
      }
    }
  }

  // ---- PA, dust ------------------------------------------------------------------------------------
  let pa = rng.float(22, 38);
  let paIdx = rng.int(0, PA.length - 1);
  let paPending = -1;
  const lines = depth >= 2 ? [...PA, ...PA_DEEP] : PA;
  world.onUpdate = (dt, ctx) => {
    const cam = ctx.camera.position;
    const arr = dGeo.attributes.position.array;
    for (let n = 0; n < dustN; n++) {
      arr[n * 3 + 1] += Math.sin(ctx.t * 0.3 + n) * dt * 0.04;
      arr[n * 3] += dt * 0.025;
    }
    dGeo.attributes.position.needsUpdate = true;
    dust.position.set(Math.round(cam.x / 20) * 20, 0, Math.round(cam.z / 20) * 20);
    if (ctx.attract) return;
    pa -= dt;
    if (pa <= 0) {
      pa = rng.float(40, 90);
      ctx.game.audio.ding();
      paPending = 1.4;
    }
    if (paPending > 0) {
      paPending -= dt;
      if (paPending <= 0) {
        ctx.game.toast(`“${lines[paIdx % lines.length]}”`, 'Public address');
        paIdx++;
      }
    }
  };
}
