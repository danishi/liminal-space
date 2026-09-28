import * as THREE from 'three';
import { HOLE } from '../../core/grid.js';
import { glowSprite } from '../../core/textures.js';
import { signTexture } from '../../props/canvas.js';
import { PI, CS, UP, ATRIUM, ESC } from './constants.js';
import { canvasTex, skylightTex, grooveTex } from './textures.js';
import { G, railing } from './props.js';

/** Escalators, the mezzanine edge and rails, then the skylit roof, sun patches and dust. */
export function atrium(world, lvl) {
  const { rng, depth, g, K, kit, shared } = lvl;
  // ---- escalators and the mezzanine edge --------------------------------------
  const steel = kit.std(0xa8acb0, 0.25, 0.9);
  const blackRail = kit.std(0x121212, 0.5);
  const clad = kit.std(0xe4dccc, 0.45, 0.1);
  const grooved = kit.mat('grooves', () => new THREE.MeshStandardMaterial({ map: grooveTex(), color: 0xc8cacc, roughness: 0.35, metalness: 0.85 }));
  const yellow = kit.std(0xe8c020, 0.5);
  const run = 2 * CS;
  const ang = Math.atan2(UP, run);
  const L = Math.hypot(run, UP);
  const stopSign = kit.tex('escstairs', signTexture('ESCALATOR TEMPORARILY STAIRS', 'Sorry for the convenience', { bg: '#f2c230', fg: '#1a1a1a', w: 768, h: 160 }));
  for (const i0 of ESC) {
    const eg = G();
    const n = 16;
    const d = run / n;
    const width = 2 * CS;
    for (let s = 0; s < n; s++) {
      const top = ((s + 1) * UP) / n;
      kit.box(eg, width - 0.06, top, d, grooved, 0, top / 2, s * d + d / 2);
      for (const x of [-1.55, 1.55]) kit.box(eg, 1.4, 0.006, 0.05, yellow, x, top + 0.003, s * d + 0.03);
    }
    // truss cladding on both sides
    for (const sgn of [-1, 1]) {
      const pts = [[-0.9, 0], [run, 0], [run, UP], [run + 0.9, UP], [run + 0.9, UP + 0.35], [run, UP + 0.35], [0, 0.35], [-0.9, 0.35]];
      const shape = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(sgn > 0 ? -a : a, b)));
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateY(sgn > 0 ? PI / 2 : -PI / 2);
      geo.translate(sgn * (width / 2 + 0.01), 0, 0);
      kit.mesh(eg, geo, clad);
    }
    // balustrades: skirt, glass, handrail; centre deck
    const along = (w, h, mat, x, off) => {
      kit.box(eg, w, h, 0.9, mat, x, off, -0.45);
      kit.box(eg, w, h, L, mat, x, UP / 2 + off, run / 2, -ang);
      kit.box(eg, w, h, 0.9, mat, x, UP + off, run + 0.45);
    };
    for (const x of [-2.4, -0.7, 0.7, 2.4]) {
      along(0.2, 0.35, steel, x, 0.175);
      along(0.02, 0.85, shared.glass, x, 0.78);
      along(0.1, 0.08, blackRail, x, 1.24);
    }
    along(1.2, 0.3, steel, 0, 0.15);
    for (const zz of [-0.5, run + 0.5]) kit.box(eg, width - 0.1, 0.02, 1.0, steel, 0, (zz > 0 ? UP : 0) + 0.01, zz);
    // the sign that sums it up
    const st = G();
    kit.cyl(st, 0.02, 0.02, 1.0, steel, 0, 0.5, 0, 0, 0, 0, 8);
    kit.box(st, 0.34, 0.03, 0.34, kit.std(0x222222, 0.6), 0, 0.015, 0);
    kit.plane(st, 0.9, 0.19, stopSign, 0, 1.05, -0.01, 0, PI, 0);
    st.position.set(0, 0, -1.25);
    eg.add(st);
    const xc = (i0 + 1) * CS;
    kit.add(eg, xc, 14 * CS, PI, { y: 0 });
    // collision for the balustrades (the lanes stay walkable)
    const z0 = 12 * CS - 0.9;
    const z1 = 14 * CS + 0.9;
    world.addBox(xc - 2.5, z0, xc - 2.3, z1);
    world.addBox(xc + 2.3, z0, xc + 2.5, z1);
    world.addBox(xc - 0.8, z0, xc + 0.8, z1);
    world.addBox(xc - 0.25, z1 + 0.15, xc + 0.25, z1 + 0.5);
  }
  // mezzanine edge: fascia with a cove light, glass balustrade, columns
  const brass = kit.std(0xc9a45a, 0.3, 0.9);
  const cove = kit.glow(0xffd9a0, 1.6);
  const segs = [];
  let xs = 4 * CS;
  for (const i0 of [...ESC, 52]) {
    const xe = Math.min(i0 * CS, 52 * CS);
    if (xe > xs + 0.1) segs.push([xs, xe]);
    xs = (i0 + 2) * CS;
  }
  for (const [a, b] of segs) {
    const len = b - a;
    const fg = G();
    kit.box(fg, len, 0.36, 0.16, clad, 0, -0.16, 0.08);
    kit.box(fg, len, 0.03, 0.05, cove, 0, -0.36, 0.14);
    const rail = railing(kit, len, steel);
    rail.position.set(0, 0, -0.1);
    fg.add(rail);
    const n = Math.max(1, Math.round(len / 1.25));
    for (let s = 0; s < n; s++) kit.box(fg, len / n - 0.08, 0.82, 0.012, shared.glass, -len / 2 + (s + 0.5) * (len / n), 0.5, -0.1);
    kit.add(fg, (a + b) / 2, 12 * CS, 0, { y: UP });
    world.addBox(a, 12 * CS - 0.2, b, 12 * CS + 0.02, UP - 0.4, UP + 1.5);
  }
  for (let k = 0; k < 11; k++) {
    const x = (8.5 + k * 4) * CS;
    const cg = G();
    kit.cyl(cg, 0.4, 0.4, ATRIUM, shared.pilaster, 0, ATRIUM / 2, 0, 0, 0, 0, 24);
    kit.cyl(cg, 0.5, 0.5, 0.14, shared.base, 0, 0.07, 0, 0, 0, 0, 24);
    kit.cyl(cg, 0.52, 0.42, 0.25, clad, 0, UP - 0.1, 0, 0, 0, 0, 24);
    kit.add(cg, x, 12 * CS + 0.55, 0, { collide: [0.9, 0.9] });
  }
  // brass rails round the sunken court and the food court seating
  for (const z of [16 * CS, 21 * CS]) {
    kit.add(railing(kit, 5 * CS - 0.1, brass), 24.5 * CS, z, 0, { y: 0 });
    world.addBox(22 * CS, z - 0.06, 27 * CS, z + 0.06);
  }
  for (const x of [43 * CS, 50 * CS]) {
    kit.add(railing(kit, 5 * CS - 0.1, brass), x, 22.5 * CS, PI / 2, { y: 0 });
    world.addBox(x - 0.06, 20 * CS, x + 0.06, 25 * CS);
  }

  // ---- atrium ceiling: beams and skylights --------------------------------------
  const beamMat = kit.std(0xf0ece2, 0.6);
  const skyGrey = Math.min(0.8, depth * 0.15);
  const skyTex = [0, 1, 2].map((d) => skylightTex(skyGrey, d * 0.5, d + 3));
  const skyMats = skyTex.map((t) => new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(0.92, 1, 1.12).multiplyScalar(1.15 - skyGrey * 0.3) }));
  const daylight = new THREE.Color(1, 0.96, 0.88).lerp(new THREE.Color(0.85, 0.87, 0.9), skyGrey);
  const skylights = [];
  const skylight = (x0, x1, z0, z1) => {
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const u = world.uneaseAt(cx, cz);
    const v = u > 0.9 ? 2 : u > 0.5 ? 1 : 0;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), skyMats[v]);
    m.rotation.x = PI / 2;
    m.position.set(cx, ATRIUM - 0.02, cz);
    world.root.add(m);
    const sg = G();
    kit.box(sg, x1 - x0 + 0.3, 0.16, 0.15, kit.std(0x6a6c70, 0.4, 0.6), 0, 0, (z0 - z1) / 2);
    kit.box(sg, x1 - x0 + 0.3, 0.16, 0.15, kit.std(0x6a6c70, 0.4, 0.6), 0, 0, (z1 - z0) / 2);
    kit.add(sg, cx, cz, 0, { y: ATRIUM - 0.08 });
    const bright = 1 - v * 0.2;
    for (const f of [0.25, 0.75]) {
      world.bakeSources.push({ pos: new THREE.Vector3(cx, 3.9, z0 + (z1 - z0) * f), color: daylight, intensity: 34 * bright * (1 - skyGrey * 0.5), dir: new THREE.Vector3(0, -1, 0), range: 15 });
    }
    skylights.push({ cx, cz, u });
  };
  for (let i = 4; i < 52; i += 2) {
    skylight(i * CS + 0.25, (i + 2) * CS - 0.25, 13 * CS, 18 * CS);
    kit.add((() => {
      const b = G();
      kit.box(b, 0.3, 0.45, 9 * CS, beamMat, 0, -0.225, 0);
      return b;
    })(), i * CS, 14.5 * CS, 0, { y: ATRIUM });
  }
  skylight(21.5 * CS, 27.5 * CS, 19.3 * CS, 23.5 * CS);
  skylight(41.5 * CS, 46.2 * CS, 19.5 * CS, 25.5 * CS);
  skylight(46.8 * CS, 51.5 * CS, 19.5 * CS, 25.5 * CS);
  // sunlight on the floor below the skylights (soft, a little off to one side)
  const patchTex = canvasTex(128, 256, (ctx, w, h) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.filter = 'blur(7px)';
    ctx.fillStyle = '#fff';
    for (let a = 0; a < 4; a++) for (let b = 0; b < 8; b++) ctx.fillRect(12 + a * (w - 24) / 4 + 3, 12 + b * (h - 24) / 8 + 3, (w - 24) / 4 - 8, (h - 24) / 8 - 6);
  });
  const patchMat = new THREE.MeshBasicMaterial({ map: patchTex, color: new THREE.Color(1, 0.9, 0.72).multiplyScalar(0.28 * (1 - skyGrey)), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  for (let i = 4; i < 52; i += 2) {
    const x = (i + 1) * CS + 0.6;
    const z = 15.5 * CS + 1.2;
    const [a, b] = g.cellOf(x, z);
    if (g.heightOf(a, b) !== 0 || g.ramp[K(a, b)] || g.get(a, b) === HOLE) continue;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(2 * CS - 0.6, 5 * CS - 1.5), patchMat);
    p.rotation.x = -PI / 2;
    p.position.set(x, 0.012, z);
    world.root.add(p);
  }
  // dust hanging in the light
  const dustN = 160;
  const dGeo = new THREE.BufferGeometry();
  const dPos = new Float32Array(dustN * 3);
  for (let n = 0; n < dustN; n++) {
    dPos[n * 3] = rng.float(-10, 10);
    dPos[n * 3 + 1] = rng.float(0.3, 6);
    dPos[n * 3 + 2] = rng.float(-10, 10);
  }
  dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
  const dustMat = new THREE.PointsMaterial({ map: glowSprite(), size: 0.05, color: 0xffe2b8, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending });
  const dust = new THREE.Points(dGeo, dustMat);
  dust.frustumCulled = false;
  world.root.add(dust);
  Object.assign(lvl, { steel, skylights, dustN, dGeo, dust });
}
