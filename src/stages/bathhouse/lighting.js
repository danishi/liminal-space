import * as THREE from 'three';
import { LightPool } from '../../core/lights.js';
import { _m } from './geometry.js';

/** Turns the fixture list into the light pool (some dead, some flickering). */
export function lighting(world, lvl) {
  const { rng, g, fixtures } = lvl;

  // ---- light fixtures (one pool; visible tubes on an instanced mesh)
  world.root.add(new THREE.HemisphereLight(0xdbe8f0, 0x6a6258, 0.55));
  const pool = new LightPool(world.root, world.lightCount, { type: world.game.quality.lights <= 4 ? 'point' : 'rect', color: 0xfff4e6, intensity: 26, distance: 12, width: 1.2, height: 0.25 });
  pool.baseColor.setRGB(2.2, 2.15, 2.0);
  const tubes = fixtures.filter((f) => f.visible);
  const tubeMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 0.05, 0.14), new THREE.MeshBasicMaterial({ color: 0xffffff }), Math.max(1, tubes.length));
  const housing = new THREE.InstancedMesh(new THREE.BoxGeometry(1.32, 0.07, 0.26), new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.4, metalness: 0.3 }), Math.max(1, tubes.length));
  let ti = 0;
  const c = new THREE.Color();
  for (const f of fixtures) {
    const [i, j] = g.cellOf(f.x, f.z);
    const un = g.inBounds(i, j) ? world.unease(i, j) : 0;
    const dead = rng.chance(0.03 + un * 0.15);
    const fx = { pos: new THREE.Vector3(f.x, f.y, f.z), flicker: !dead && rng.chance(0.05 + un * 0.2) ? rng.float(0.05, 0.25) : 0, dead, intensity: 26 * f.intensity, color: f.color, rot: f.rot };
    if (f.visible) {
      _m.makeRotationY(f.rot).setPosition(f.x, f.y - 0.04, f.z);
      tubeMesh.setMatrixAt(ti, _m);
      tubeMesh.setColorAt(ti, c.setRGB(2.2, 2.15, 2.0));
      _m.makeRotationY(f.rot).setPosition(f.x, f.y - 0.01, f.z);
      housing.setMatrixAt(ti, _m);
      fx.instance = ti++;
    }
    pool.add(fx);
  }
  tubeMesh.count = ti;
  housing.count = ti;
  world.root.add(tubeMesh, housing);
  pool.mesh = tubeMesh;
  world.lightPool = pool;
}
