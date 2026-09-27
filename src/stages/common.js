import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildWallFaces, buildFloors, buildCellQuads, buildRisers, buildStairs, wallMounts, WALL, VOID, HOLE, WATER, DIRS, PIT_DEPTH } from '../core/grid.js';
import { LightPool } from '../core/lights.js';
import { glowSprite } from '../core/textures.js';

export function mesh(world, geo, mat, { cast = false, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  world.root.add(m);
  return m;
}

/**
 * Room shell that follows the height field: walls from each open cell's
 * floor to its ceiling, floors, stairs, ledges, pits and ceilings.
 * opts: { height, ceil?: (i,j)=>y, wall:{mat,u,v}, floor:{mat,uv}, ceilMat:{mat,uv}, stairs: mat,
 *         trims: [{mat, y0, y1, inset}], pit: mat, open?: (c)=>bool }
 */
export function buildShell(world, opts) {
  const g = world.grid;
  const H = opts.height;
  const ceil = opts.ceil || ((i, j) => Math.max(g.heightOf(i, j), 0) + H + (g.ramp[j * g.w + i] ? Math.max(0, g.rise[j * g.w + i]) : 0));
  world.ceilAt = ceil;
  const floorOf = (i, j) => g.heightOf(i, j);
  const open = opts.open || ((c) => c !== WALL && c !== VOID);
  const out = {};
  out.walls = mesh(world, buildWallFaces(g, {
    y0: (i, j) => floorOf(i, j) - 0.02,
    y1: (i, j) => ceil(i, j),
    uScale: opts.wall.u, vScale: opts.wall.v, open,
  }), opts.wall.mat);
  for (const t of opts.trims || []) {
    mesh(world, buildWallFaces(g, {
      y0: (i, j) => floorOf(i, j) + t.y0,
      y1: (i, j) => floorOf(i, j) + t.y1,
      uScale: t.u || 1, vScale: t.v || 1, inset: t.inset ?? 0.015,
      open: (c, i, j) => open(c, i, j) && c !== HOLE && !g.ramp[j * g.w + i],
    }), t.mat);
  }
  if (opts.floor) {
    out.floor = mesh(world, buildFloors(g, (c, i, j) => open(c, i, j) && c !== HOLE && (!opts.floorPred || opts.floorPred(c, i, j)), opts.floor.uv), opts.floor.mat);
    const risers = buildRisers(g, { pred: (c) => c !== WALL && c !== VOID, uScale: opts.floor.uv, vScale: opts.floor.uv });
    if (risers.attributes.position.count) mesh(world, risers, opts.riserMat || opts.wall.mat);
    const stairGeos = buildStairs(g);
    if (stairGeos.length) mesh(world, mergeGeometries(stairGeos), opts.stairs || opts.floor.mat);
  }
  if (opts.ceilMat) {
    out.ceil = mesh(world, buildCellQuads(g, (c) => open(c), ceil, false, opts.ceilMat.uv), opts.ceilMat.mat);
    const drops = buildRisers(g, { pred: (c) => c !== WALL && c !== VOID, ceil, uScale: opts.ceilMat.uv, vScale: opts.ceilMat.uv });
    if (drops.attributes.position.count) mesh(world, drops, opts.wall.mat);
  }
  // pits: dark shaft bottoms
  let holes = 0;
  for (const c of g.cells) if (c === HOLE) holes++;
  if (holes) {
    const pitMat = opts.pit || new THREE.MeshBasicMaterial({ color: 0x000000 });
    mesh(world, buildCellQuads(g, (c) => c === HOLE, PIT_DEPTH, true, 2), pitMat);
  }
  return out;
}

/**
 * Ceiling light panels on a lattice, backed by a LightPool. Dead and flicker
 * rates grow with local unease.
 */
export function ceilingFixtures(world, opts) {
  const g = world.grid;
  const rng = world.rng;
  const {
    every = 2, offset = 0, size = [1.2, 0.6], color = 0xfff3c4, panelColor = [1.6, 1.55, 1.3], type = 'point',
    intensity = 5, distance = 10, decay = 1.5, flicker = 0.08, dead = 0.06, filter = () => true, count = world.lightCount,
    drop = 0.02, housing = null,
  } = opts;
  const cells = [];
  for (let j = offset; j < g.h; j += every) {
    for (let i = offset; i < g.w; i += every) {
      if (g.standable(i, j) && filter(g.get(i, j), i, j)) cells.push([i, j]);
    }
  }
  const panel = new THREE.InstancedMesh(new THREE.BoxGeometry(size[0], 0.03, size[1]), new THREE.MeshBasicMaterial({ color: 0xffffff }), Math.max(1, cells.length));
  const lowQ = world.game.quality.lights <= 4;
  const pool = new LightPool(world.root, count, { type: lowQ ? 'point' : type, color, intensity: lowQ && type === 'rect' ? intensity * 0.35 : intensity, distance, decay, width: size[0] * 0.95, height: size[1] * 0.95 });
  pool.baseColor.setRGB(...panelColor);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  const housings = [];
  cells.forEach(([i, j], n) => {
    const p = g.center(i, j);
    const y = (world.ceilAt ? world.ceilAt(i, j) : 2.7) - drop;
    const rot = opts.rotate && (i + j) % 4 === 0 ? Math.PI / 2 : 0;
    m.makeRotationY(rot).setPosition(p.x, y, p.z);
    panel.setMatrixAt(n, m);
    panel.setColorAt(n, c.setRGB(...panelColor));
    if (housing) housings.push({ x: p.x, y, z: p.z, rot });
    const u = world.unease(i, j);
    const isDead = rng.chance(dead + u * 0.18);
    pool.add({
      pos: new THREE.Vector3(p.x, y, p.z),
      flicker: !isDead && rng.chance(flicker + u * 0.2) ? rng.float(0.05, 0.25 + u * 0.2) : 0,
      dead: isDead,
      instance: n,
      rot,
    });
  });
  panel.count = cells.length;
  world.root.add(panel);
  if (housing && housings.length) {
    const hm = new THREE.InstancedMesh(new THREE.BoxGeometry(size[0] + 0.08, 0.06, size[1] + 0.08), housing, housings.length);
    housings.forEach((h, n) => {
      m.makeRotationY(h.rot).setPosition(h.x, h.y + 0.02, h.z);
      hm.setMatrixAt(n, m);
    });
    world.root.add(hm);
  }
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
 * A door on a frame. `open` (0..1) swings it toward the room and lets the
 * light from beyond spill out. Returns { group, update(dt, t, open) }.
 */
export function doorModel({ width = 1.0, height = 2.1, doorColor = 0x6b6f63, frameColor = 0x3a3a36, lightColor = 0xffffff, doorMap = null, extras = null, knob = 0xb9b39a, beyond = 1 } = {}) {
  const group = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: frameColor, roughness: 0.5, metalness: 0.2 });
  const t = 0.08;
  const left = new THREE.Mesh(new THREE.BoxGeometry(t, height + t, 0.14), frameMat);
  left.position.set(-width / 2 - t / 2, (height + t) / 2, 0.07);
  const right = left.clone();
  right.position.x = width / 2 + t / 2;
  const top = new THREE.Mesh(new THREE.BoxGeometry(width + t * 2, t, 0.14), frameMat);
  top.position.set(0, height + t / 2, 0.07);
  group.add(left, right, top);

  const lightMat = new THREE.MeshBasicMaterial({ color: lightColor });
  const beyondCol = new THREE.Color(lightColor).multiplyScalar(2.4 * beyond);
  lightMat.color.setScalar(0.02);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(width, height), lightMat);
  back.position.set(0, height / 2, 0.012);
  group.add(back);

  const hinge = new THREE.Group();
  hinge.position.set(-width / 2, 0, 0.04);
  const doorMat = new THREE.MeshStandardMaterial({ color: doorMap ? 0xffffff : doorColor, map: doorMap, roughness: 0.5, metalness: 0.1 });
  const door = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.05), doorMat);
  door.position.set(width / 2, height / 2, 0);
  hinge.add(door);
  const knobM = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), new THREE.MeshStandardMaterial({ color: knob, metalness: 0.85, roughness: 0.3 }));
  knobM.position.set(width - 0.12, height * 0.48, 0.05);
  hinge.add(knobM);
  group.add(hinge);

  // light under the door hints at the other side even when closed
  const leak = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.1, 1.2), new THREE.MeshBasicMaterial({ color: lightColor, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }));
  leak.rotation.x = -Math.PI / 2;
  leak.position.set(0, 0.012, 0.6);
  group.add(leak);
  const halo = glow(lightColor, 3.2, 0);
  halo.position.set(0, height * 0.55, 0.45);
  group.add(halo);
  const extraUpdate = extras ? extras(group) : null;
  return {
    group,
    update(dt, time, open) {
      extraUpdate?.(open, time);
      hinge.rotation.y = -open * 1.3;
      lightMat.color.copy(beyondCol).multiplyScalar(0.05 + open * 0.95);
      leak.material.opacity = 0.12 + 0.3 * open + Math.sin(time * 3) * 0.02;
      halo.material.opacity = (0.45 + Math.sin(time * 2) * 0.08) * open;
    },
  };
}

// ---------------------------------------------------------------------------
// Decoration

function pickWeighted(rng, list) {
  const total = list.reduce((s, e) => s + e.w, 0);
  let r = rng.next() * total;
  for (const e of list) {
    r -= e.w;
    if (r <= 0) return e;
  }
  return list[list.length - 1];
}

/**
 * Scatters props from a stage's prop table. Density and strangeness follow
 * unease, so things get more cluttered and wrong the further you go.
 *
 * table entries: { p: prop, w: weight, min?: unease threshold, max?: upper threshold, o?: builder opts }
 * spec: { wall, high, floor, clutter, ceil: entries[], density: {wall, high, floor, clutter, ceil}, keepClear?: (i,j)=>bool }
 */
export function decorate(world, kit, spec) {
  const g = world.grid;
  const rng = world.rng;
  const dens = { wall: 0.18, high: 0.12, floor: 0.08, clutter: 0.1, ceil: 0.05, ...(spec.density || {}) };
  const usable = (list, u) => (list || []).filter((e) => u >= (e.min ?? -1) && u <= (e.max ?? 9));
  const clear = (i, j) => (world.distFromSpawn[j * g.w + i] ?? 0) <= 1 || (spec.keepClear && spec.keepClear(i, j));
  const usedCells = new Set();
  const ceilAt = world.ceilAt || (() => 2.7);

  const mounts = rng.shuffle(wallMounts(g));
  const usedMount = new Set();
  for (const m of mounts) {
    if (clear(m.i, m.j) || g.get(m.i, m.j) === WATER) continue;
    const key = `${m.i},${m.j},${m.nx},${m.nz}`;
    if (usedMount.has(key)) continue;
    const u = world.unease(m.i, m.j);
    const yaw = Math.atan2(m.nx, m.nz);
    // floor-standing wall props
    const wl = usable(spec.wall, u);
    if (wl.length && !usedCells.has(`${m.i},${m.j}`) && rng.chance(dens.wall * (0.35 + u * 2.0))) {
      const e = pickWeighted(rng, wl);
      const grp = e.p.build(kit, rng, { eerie: u > 0.8, mood: u, ...(e.o || {}) });
      const d = e.p.fp ? e.p.fp[1] : 0.3;
      const along = rng.float(-0.25, 0.25) * g.cs;
      const tx = -m.nz;
      const tz = m.nx;
      const x = m.x + m.nx * (d / 2 + 0.03) + tx * along * (e.p.fp && e.p.fp[0] > g.cs * 0.6 ? 0 : 1);
      const z = m.z + m.nz * (d / 2 + 0.03) + tz * along * (e.p.fp && e.p.fp[0] > g.cs * 0.6 ? 0 : 1);
      kit.add(grp, x, z, yaw, { y: m.y, collide: e.p.fp });
      usedMount.add(key);
      usedCells.add(`${m.i},${m.j}`);
      continue;
    }
    // wall-mounted things above the floor
    const hl = usable(spec.high, u);
    if (hl.length && rng.chance(dens.high * (0.4 + u * 1.6))) {
      const e = pickWeighted(rng, hl);
      const grp = e.p.build(kit, rng, { eerie: u > 0.8, mood: u, ...(e.o || {}) });
      const along = rng.float(-0.3, 0.3) * g.cs;
      kit.add(grp, m.x - m.nz * along + m.nx * 0.01, m.z + m.nx * along + m.nz * 0.01, yaw, { y: m.y + (e.p.y ?? 1.5) });
      usedMount.add(key);
    }
  }

  for (let j = 1; j < g.h - 1; j++) {
    for (let i = 1; i < g.w - 1; i++) {
      if (!g.standable(i, j) || g.ramp[j * g.w + i] || clear(i, j)) continue;
      const u = world.unease(i, j);
      const c = g.center(i, j);
      const wet = g.get(i, j) === WATER;
      const y = wet && spec.waterSurface ? spec.waterSurface(i, j) : g.heightOf(i, j);
      // free-standing props need open space all around
      let roomy = true;
      for (let dj = -1; dj <= 1 && roomy; dj++) for (let di = -1; di <= 1; di++) if (!g.standable(i + di, j + dj) || Math.abs(g.heightOf(i + di, j + dj) - y) > 0.05) roomy = false;
      const fl = wet ? [] : usable(spec.floor, u);
      if (roomy && fl.length && !usedCells.has(`${i},${j}`) && rng.chance(dens.floor * (0.25 + u * 2.2))) {
        const e = pickWeighted(rng, fl);
        const grp = e.p.build(kit, rng, { eerie: u > 0.8, mood: u, ...(e.o || {}) });
        const px = c.x + rng.float(-0.2, 0.2) * g.cs;
        const pz = c.z + rng.float(-0.2, 0.2) * g.cs;
        const yaw = rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]) + (u > 0.6 && !e.p.parts ? rng.float(-0.4, 0.4) : 0);
        kit.add(grp, px, pz, yaw, { y, collide: e.p.parts ? null : e.p.fp });
        for (const [lx, lz, w, d] of e.p.parts || []) {
          const cy = Math.cos(yaw);
          const sy = Math.sin(yaw);
          world.addFootprint(px + lx * cy + lz * sy, pz - lx * sy + lz * cy, w, d, yaw);
        }
        usedCells.add(`${i},${j}`);
      }
      const cl = usable(spec.clutter, u).filter((e) => !wet || e.floats);
      if (cl.length && rng.chance(dens.clutter * (0.25 + u * 2.4))) {
        const e = pickWeighted(rng, cl);
        const grp = e.p.build(kit, rng, { eerie: u > 0.8, mood: u, ...(e.o || {}) });
        kit.add(grp, c.x + rng.float(-0.35, 0.35) * g.cs, c.z + rng.float(-0.35, 0.35) * g.cs, rng.float(0, Math.PI * 2), { y, collide: e.p.fp });
      }
      const ce = wet ? [] : usable(spec.ceil, u);
      if (ce.length && rng.chance(dens.ceil * (0.2 + u * 2.2))) {
        const e = pickWeighted(rng, ce);
        const grp = e.p.build(kit, rng, { eerie: u > 0.8, mood: u, ...(e.o || {}) });
        kit.add(grp, c.x + rng.float(-0.2, 0.2) * g.cs, c.z + rng.float(-0.2, 0.2) * g.cs, rng.float(0, Math.PI * 2), { y: ceilAt(i, j) - 0.01 });
      }
    }
  }
}

/** Carves a straight staircase of `n` ramp cells from (i,j) along dir, rising `rise` per cell. */
export function stairRun(g, i, j, dir, n, from, rise) {
  const [dx, dy] = DIRS[dir];
  for (let s = 0; s < n; s++) g.setRamp(i + dx * s, j + dy * s, dir, from + rise * s, rise);
  return { i: i + dx * n, j: j + dy * n, top: from + rise * n };
}

export { WALL, VOID, HOLE };
