import * as THREE from 'three';
import { buildWallFaces, worldPlane, WALL, VOID } from '../core/grid.js';
import { LightPool } from '../core/lights.js';
import { glowSprite } from '../core/textures.js';

export function mesh(world, geo, mat, { cast = false, receive = false } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  world.root.add(m);
  return m;
}

/**
 * Standard room shell: walls, optional trims, floor and ceiling.
 * opts: { height, wall: {mat, u, v}, floor: {mat, uv}, ceil: {mat, uv}, trims: [{mat, y0, y1, inset}] }
 */
export function buildShell(world, opts) {
  const g = world.grid;
  const { height } = opts;
  const out = {};
  out.walls = mesh(world, buildWallFaces(g, { y0: 0, y1: height, uScale: opts.wall.u, vScale: opts.wall.v }), opts.wall.mat, { receive: true });
  for (const t of opts.trims || []) {
    mesh(world, buildWallFaces(g, { y0: t.y0, y1: t.y1, uScale: t.u || 1, vScale: t.v || 1, inset: t.inset ?? 0.015 }), t.mat);
    if (t.top) {
      // thin top cap so trims read as solid from above
      mesh(world, buildWallFaces(g, { y0: t.y1 - 0.001, y1: t.y1, inset: t.inset ?? 0.015 }), t.mat);
    }
  }
  const W = g.w * g.cs;
  const H = g.h * g.cs;
  if (opts.floor) out.floor = mesh(world, worldPlane(0, 0, W, H, 0, true, opts.floor.uv), opts.floor.mat, { receive: true });
  if (opts.ceil) out.ceil = mesh(world, worldPlane(0, 0, W, H, height, false, opts.ceil.uv), opts.ceil.mat);
  return out;
}

/**
 * Ceiling light panels on a lattice, backed by a LightPool.
 * opts: { every, offset, y, size:[w,d], color, panelColor, intensity, distance, flicker, dead, filter }
 */
export function ceilingFixtures(world, opts) {
  const g = world.grid;
  const rng = world.rng;
  const {
    every = 2, offset = 0, y = 2.68, size = [1.2, 0.6], color = 0xfff3c4, panelColor = [1.6, 1.55, 1.3],
    intensity = 5, distance = 10, decay = 1.5, flicker = 0.08, dead = 0.06, filter = () => true, count = world.lightCount,
  } = opts;
  const cells = [];
  for (let j = offset; j < g.h; j += every) {
    for (let i = offset; i < g.w; i += every) {
      if (g.walkable(i, j) && filter(g.get(i, j), i, j)) cells.push([i, j]);
    }
  }
  const panel = new THREE.InstancedMesh(
    new THREE.BoxGeometry(size[0], 0.04, size[1]),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    Math.max(1, cells.length),
  );
  const pool = new LightPool(world.root, count, { color, intensity, distance, decay });
  pool.baseColor.setRGB(...panelColor);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  cells.forEach(([i, j], n) => {
    const p = g.center(i, j);
    const rot = opts.rotate && (i + j) % 4 === 0 ? Math.PI / 2 : 0;
    m.makeRotationY(rot).setPosition(p.x, y, p.z);
    panel.setMatrixAt(n, m);
    panel.setColorAt(n, c.setRGB(...panelColor));
    const isDead = rng.chance(dead);
    pool.add({
      pos: new THREE.Vector3(p.x, y, p.z),
      flicker: !isDead && rng.chance(flicker) ? rng.float(0.05, 0.25) : 0,
      dead: isDead,
      instance: n,
    });
  });
  panel.count = cells.length;
  world.root.add(panel);
  pool.mesh = panel;
  world.lightPool = pool;
  return pool;
}

/** Soft additive glow sprite. */
export function glow(color, size, opacity = 0.6) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(size);
  return s;
}

/**
 * A door on a frame with light spilling out when opened.
 * Returns an exit model { group, onUnlock, update }.
 */
export function doorModel({ width = 1.0, height = 2.1, doorColor = 0x6b6f63, frameColor = 0x3a3a36, lightColor = 0xffffff, doorMap = null, extras = null, knob = 0xb9b39a } = {}) {
  const group = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: frameColor, roughness: 0.6, metalness: 0.2 });
  const t = 0.08;
  const left = new THREE.Mesh(new THREE.BoxGeometry(t, height + t, 0.12), frameMat);
  left.position.set(-width / 2 - t / 2, (height + t) / 2, 0.06);
  const right = left.clone();
  right.position.x = width / 2 + t / 2;
  const top = new THREE.Mesh(new THREE.BoxGeometry(width + t * 2, t, 0.12), frameMat);
  top.position.set(0, height + t / 2, 0.06);
  group.add(left, right, top);

  const lightMat = new THREE.MeshBasicMaterial({ color: lightColor });
  lightMat.color.multiplyScalar(0.05);
  const beyond = new THREE.Mesh(new THREE.PlaneGeometry(width, height), lightMat);
  beyond.position.set(0, height / 2, 0.012);
  group.add(beyond);

  const hinge = new THREE.Group();
  hinge.position.set(-width / 2, 0, 0.04);
  const doorMat = new THREE.MeshStandardMaterial({ color: doorMap ? 0xffffff : doorColor, map: doorMap, roughness: 0.55, metalness: 0.15 });
  const door = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.05), doorMat);
  door.position.set(width / 2, height / 2, 0);
  hinge.add(door);
  const knobM = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), new THREE.MeshStandardMaterial({ color: knob, metalness: 0.8, roughness: 0.3 }));
  knobM.position.set(width - 0.12, height * 0.48, 0.05);
  hinge.add(knobM);
  group.add(hinge);

  // light leaking under the door once unlocked
  const leak = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.1, 0.9), new THREE.MeshBasicMaterial({ color: lightColor, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  leak.rotation.x = -Math.PI / 2;
  leak.position.set(0, 0.01, 0.5);
  group.add(leak);
  const halo = glow(lightColor, 3.2, 0);
  halo.position.set(0, height * 0.55, 0.4);
  group.add(halo);

  const extraUpdate = extras ? extras(group) : null;
  let open = 0;
  const full = new THREE.Color(lightColor).multiplyScalar(2.2);
  return {
    group,
    update(dt, time, isUnlocked) {
      extraUpdate?.(open, time);
      if (!isUnlocked) return;
      open = Math.min(1, open + dt * 0.6);
      hinge.rotation.y = -open * 1.25;
      lightMat.color.copy(full).multiplyScalar(0.3 + open * 0.7);
      leak.material.opacity = 0.35 * open;
      halo.material.opacity = (0.5 + Math.sin(time * 2) * 0.1) * open;
    },
  };
}

export { WALL, VOID };
