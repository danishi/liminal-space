import * as THREE from 'three';
import { Grid, FLOOR, WALL, DOORWAY, HOLE, buildWallFaces, buildCellQuads, wallMounts } from '../core/grid.js';
import { paint, pbr } from '../core/surfaces.js';
import { chalkboard, sunPatch, glowSprite, labelTexture, schoolWindowFrame } from '../core/textures.js';
import { mesh, buildShell, ceilingFixtures, doorModel, decorate, stairRun, windowViewMaterial } from './common.js';
import { photo, hdri } from '../core/assets.js';
import { PropKit } from '../props/kit.js';
import * as P from '../props/library.js';
import { Watcher, Peeker } from '../entities/creatures.js';
import { LOOKS } from '../entities/looks.js';
import { setFigureOpacity, idlePose, lookAt } from '../entities/figures.js';
import { NPC, strayNPC } from '../entities/npc.js';

const H = 3.0;
const LINTEL = 2.3;
const UP = 3.0; // height of the upper wing
const DUSK = 150;

function studentModel() {
  const fig = LOOKS.student();
  setFigureOpacity(fig, 0.95);
  return fig;
}

const deskSet = {
  place: 'floor', fp: [0.55, 0.71],
  build(k, rng) {
    // scanned desk and chair, both facing the blackboard (-X)
    const g = new THREE.Group();
    k.model(g, 'SchoolDesk_01', 0, 0, 0, -Math.PI / 2);
    k.model(g, 'SchoolChair_01', 0.55 + rng.float(0, 0.12), 0, rng.float(-0.05, 0.05), -Math.PI / 2 + rng.float(-0.25, 0.25));
    return g;
  },
};

export default {
  assets: {
    textures: ['linoleum_brown', 'beige_wall_001', 'painted_concrete', 'ceiling_interior'],
    models: ['SchoolDesk_01', 'SchoolChair_01', 'wall_clock', 'plastic_broom', 'metal_trash_can', 'fire_alarm'],
    hdris: ['stuttgart_suburbs'],
    looks: ['student', ['watcher', { body: 0x0b0b12, coat: true, height: 2.3 }]],
  },

  build(world) {
    const rng = world.rng;
    const W = 46;
    const HH = 30;
    const cs = 2.2;
    const g = (world.grid = new Grid(W, HH, cs, WALL));
    const corridors = [[3, 4], [14, 15], [25, 26]];
    for (const [a, b] of corridors) g.fillRect(2, a, W - 3, b, FLOOR);
    const mid = 22 + rng.int(-3, 3);
    // connectors: the outer two only join the lower floors; the middle one is a stairwell up
    for (const c of [2, W - 4]) g.fillRect(c, 3, c + 1, 15, FLOOR);
    g.fillRect(mid, 3, mid + 1, 26, FLOOR);
    // upper wing (south corridor + band B) sits one floor up
    g.heightRect(0, 16, W - 1, HH - 1, UP);
    g.heightRect(mid, 16, mid + 1, 16, 0);
    for (const col of [mid, mid + 1]) stairRun(g, col, 16, 2, 6, 0, UP / 6);
    g.heightRect(mid, 22, mid + 1, 26, UP);

    const rooms = [];
    const bands = [[6, 12, 0], [17, 23, UP]];
    for (const [j0, j1, h] of bands) {
      for (const [s0, s1] of [[5, mid - 2], [mid + 3, W - 6]]) {
        let i = s0;
        while (i <= s1) {
          let w = rng.int(6, 8);
          if (s1 - (i + w - 1) < 5) w = s1 - i + 1;
          const i1 = Math.min(s1, i + w - 1);
          g.fillRect(i, j0, i1, j1, FLOOR);
          rooms.push({ i0: i, i1, j0, j1, h });
          if (h === 0) {
            g.set(rng.int(i + 1, i1 - 1), j0 - 1, DOORWAY);
            if (rng.chance(0.6)) g.set(rng.int(i + 1, i1 - 1), j1 + 1, DOORWAY);
          } else {
            const dx = rng.int(i + 1, i1 - 1);
            g.set(dx, j1 + 1, DOORWAY);
            g.setHeight(dx, j1 + 1, UP);
          }
          i = i1 + 2;
        }
      }
    }
    const si = 3;
    const sj = 4;
    const sp = g.center(si, sj);
    world.spawn = { x: sp.x - cs / 2, z: sp.z, yaw: -Math.PI / 2 };
    world.finalizeLayout();
    // broken floorboards upstairs, more of them deeper in
    const holes = world.pickFarCells(world.depth + (rng.chance(0.5) ? 1 : 0), { minFrac: 0.4, spacing: 6, filter: (i, j) => g.heightOf(i, j) === UP && g.get(i, j) === FLOOR && !g.ramp[j * W + i] && j >= 25 });
    for (const [i, j] of holes) g.set(i, j, HOLE);

    const outer = (i, j) => j <= 2 || j >= HH - 3 || i <= 1 || i >= W - 2;
    // scanned plaster above worn green paint, like a real Japanese school corridor
    const wallMat = photo('beige_wall_001', { uvScale: [cs, H], color: 0xf4ecdc });
    const lowerMat = photo('painted_concrete', { uvScale: 2, color: new THREE.Color(1.05, 1.2, 1.05) });
    const railMat = pbr(paint('s-school-rail', [70, 92, 76], { rough: 0.4 }));
    const winMat = windowViewMaterial(hdri('stuttgart_suburbs'), schoolWindowFrame(), { exposure: 1.1, rotation: rng.float(0, Math.PI * 2) });
    const floorMat = photo('linoleum_brown', { uvScale: 2.4, roughness: 0.75 });
    buildShell(world, {
      height: H,
      ceil: (i, j) => g.heightOf(i, j) + (g.ramp[j * W + i] ? g.rise[j * W + i] : 0) + H,
      wall: { mat: wallMat, u: cs, v: H },
      floor: { mat: floorMat, uv: 2.4 },
      ceilMat: { mat: photo('ceiling_interior', { uvScale: 3, color: 0xf2eee4 }), uv: 3 },
      stairs: photo('painted_concrete', { uvScale: 2, color: 0x9a9a94 }),
      riserMat: wallMat,
      trims: [
        { mat: lowerMat, y0: 0, y1: 1.1, inset: 0.012, u: 2, v: 2 },
        { mat: railMat, y0: 1.08, y1: 1.14, inset: 0.025 },
      ],
    });
    // outer walls are windows: rebuild those faces with the window material slightly in front
    mesh(world, buildWallFaces(g, { y0: (i, j) => g.heightOf(i, j), y1: (i, j) => g.heightOf(i, j) + H, uScale: cs, vScale: H, inset: 0.01, solid: (c, i, j) => c === WALL && outer(i, j) }), winMat);
    mesh(world, buildWallFaces(g, { y0: (i, j) => g.heightOf(i, j) + LINTEL, y1: (i, j) => g.heightOf(i, j) + H, uScale: cs, vScale: H, solid: (c) => c === DOORWAY, open: (c) => c === FLOOR }), wallMat);
    mesh(world, buildCellQuads(g, (c) => c === DOORWAY, (i, j) => g.heightOf(i, j) + LINTEL, false, 2), new THREE.MeshStandardMaterial({ color: 0xcfc3a6 }));

    // sunlight through the windows onto the floor
    const patchMat = new THREE.MeshBasicMaterial({ map: sunPatch(), color: 0xffa860, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
    const warm = new THREE.Color(1, 0.68, 0.42);
    for (const m of wallMounts(g).filter((mm) => outer(mm.i - mm.nx, mm.j - mm.nz))) {
      // each window pane lights the corridor (baked; dims with the sunset)
      world.bakeSources.push({ pos: new THREE.Vector3(m.x + m.nx * 0.3, m.y + 1.7, m.z + m.nz * 0.3), color: warm, intensity: 5, dir: new THREE.Vector3(m.nx, -0.25, m.nz).normalize() });
      const p = new THREE.Mesh(new THREE.PlaneGeometry(cs * 0.95, 2.6), patchMat);
      p.rotation.x = -Math.PI / 2;
      const grp = new THREE.Group();
      grp.add(p);
      p.position.set(0, 0.012, 1.35);
      grp.position.set(m.x, m.y, m.z);
      grp.rotation.y = Math.atan2(m.nx, m.nz);
      world.root.add(grp);
    }

    // classrooms: chalkboards and rows of desks
    const kit = new PropKit(world);
    const emptyRoom = rng.int(0, rooms.length - 1);
    rooms.forEach((r, n) => {
      const x0 = r.i0 * cs;
      const x1 = (r.i1 + 1) * cs;
      const z0 = r.j0 * cs;
      const z1 = (r.j1 + 1) * cs;
      const board = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.4), new THREE.MeshStandardMaterial({ map: chalkboard(), roughness: 0.9 }));
      board.position.set(x0 + 0.03, r.h + 1.6, (z0 + z1) / 2);
      board.rotation.y = Math.PI / 2;
      world.root.add(board);
      if (n === emptyRoom) return;
      const u = world.unease(r.i0 + 1, r.j0 + 1);
      for (let z = z0 + 2.4; z < z1 - 1.6; z += 1.45) {
        for (let x = x0 + 3.2; x < x1 - 1.4; x += 1.35) {
          if (rng.chance(0.06 + u * 0.3)) continue;
          const jit = rng.float(-0.08, 0.08);
          const grp = deskSet.build(kit, rng);
          const messy = u > 0.7 && rng.chance(0.3);
          kit.add(grp, x + jit, z, messy ? rng.float(0, Math.PI * 2) : rng.float(-0.06, 0.06), { y: r.h, collide: [0.55, 0.71], rz: messy && rng.chance(0.3) ? Math.PI / 2 : 0 });
        }
      }
    });
    decorate(world, kit, {
      density: { wall: 0.16, high: 0.16, floor: 0.05, clutter: 0.08, ceil: 0.05 },
      keepClear: (i, j) => g.ramp[j * W + i] > 0,
      wall: [
        { p: P.shoeCubbies, w: 1.5 }, { p: P.trashBins, w: 1.5 }, { p: P.waterFountain, w: 1 }, { p: P.hydrantBox, w: 1 },
        { p: P.modelProp('metal_trash_can', { scale: 0.8 }), w: 1 }, { p: P.modelProp('plastic_broom', { jitter: 0.4 }), w: 1 },
        { p: P.lockers, w: 1, o: { color: 0x8a9a92 } }, { p: P.lockers, w: 1, min: 0.7, o: { color: 0x8a9a92, eerie: true } },
      ],
      high: [
        { p: P.bulletinBoard, w: 2 }, { p: P.poster, w: 1.5 }, { p: P.modelProp('wall_clock', { place: 'high', y: 2.3, collide: false }), w: 1.2 },
        { p: P.wallClock, w: 0.6 }, { p: P.wallClock, w: 1, min: 0.7, o: { eerie: true } }, { p: P.modelProp('fire_alarm', { place: 'high', y: 1.45, collide: false }), w: 0.8 },
        { p: P.handprints, w: 1, min: 0.85 },
      ],
      floor: [{ p: P.tvCart, w: 1 }, { p: P.deskBarricade, w: 2, min: 0.55 }],
      clutter: [{ p: P.mopBucket, w: 1 }, { p: P.paperScatter, w: 2 }, { p: P.lostShoe, w: 1.2, min: 0.4 }],
      ceil: [{ p: P.teruteru, w: 1, min: 0.3 }],
    });
    kit.finish();

    // lighting: warm sky light now, fluorescent tubes after dusk
    const hemi = new THREE.HemisphereLight(0xffcfa6, 0x9a7460, 0.9);
    world.root.add(hemi);
    const sun = new THREE.DirectionalLight(0xffa35c, 1.2);
    sun.position.set(-30, 12, 50);
    world.root.add(sun);
    const pool = ceilingFixtures(world, {
      type: 'rect', every: 3, offset: 1, size: [1.3, 0.22], color: 0xdff7ea, panelColor: [0.25, 0.25, 0.25],
      intensity: 0, distance: 10, flicker: 0.15, dead: 0.2,
      filter: (c, i, j) => corridors.some(([a, b]) => j >= a && j <= b) || [2, mid, W - 4].includes(i),
    });

    const dustN = 120;
    const dGeo = new THREE.BufferGeometry();
    const dPos = new Float32Array(dustN * 3);
    for (let k = 0; k < dustN; k++) {
      dPos[k * 3] = rng.float(-8, 8);
      dPos[k * 3 + 1] = rng.float(0.3, 2.8);
      dPos[k * 3 + 2] = rng.float(-8, 8);
    }
    dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
    const dustMat = new THREE.PointsMaterial({ map: glowSprite(), size: 0.06, color: 0xffd3a0, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
    const dust = new THREE.Points(dGeo, dustMat);
    dust.frustumCulled = false;
    world.root.add(dust);

    const fog = new THREE.FogExp2(0xc98a66, 0.028);
    Object.assign(world.env, {
      background: 0xc98a66,
      fog,
      exposure: 1.05,
      postfx: { bloom: 0.45, bloomThreshold: 0.8, bloomRadius: 0.6, grain: 0.055, vignette: 0.34, chroma: 0.0015, scan: 0.028, tint: [1.07, 0.98, 0.9] },
      ao: 1,
      envIntensity: 0.55,
      ambience: 'school',
      reverb: [2.2, 3],
      bake: { hemi: 0.6, bounce: 0.4 },
    });
    world.surfaceFn = () => 'wood';

    // dusk timeline: the longer you stay, the darker it gets
    const dayFog = new THREE.Color(0xc98a66);
    const nightFog = new THREE.Color(0x0f1220);
    const dayHemi = new THREE.Color(0xffcfa6);
    const nightHemi = new THREE.Color(0x46507a);
    const dayGround = new THREE.Color(0x9a7460);
    const nightGround = new THREE.Color(0x1c1a26);
    const start = Math.min(0.85, world.depth * 0.15);
    let t = world.attract ? DUSK * 0.15 : DUSK * start;
    let night = false;
    world.onUpdate = (dt, ctx) => {
      if (!ctx.attract) t += dt;
      const k = Math.min(1, t / DUSK);
      const e = k * k;
      fog.color.copy(dayFog).lerp(nightFog, e);
      fog.density = 0.028 + e * 0.03;
      ctx.game.scene.background?.copy?.(fog.color);
      hemi.color.copy(dayHemi).lerp(nightHemi, e);
      hemi.groundColor.copy(dayGround).lerp(nightGround, e);
      hemi.intensity = 0.9 - e * 0.62;
      sun.intensity = 1.2 * (1 - e);
      winMat.uniforms.uExposure.value = 1.1 * (1 - e * 0.9);
      winMat.uniforms.uFrameLight.value = 0.95 * (1 - e * 0.75);
      if (world.bakeUniforms) world.bakeUniforms.scale.value = 1 - e * 0.92;
      patchMat.opacity = 0.55 * (1 - e);
      dustMat.opacity = 0.8 * (1 - e * 0.8);
      const cam = ctx.camera.position;
      const arr = dGeo.attributes.position.array;
      for (let n = 0; n < dustN; n++) {
        arr[n * 3 + 1] += Math.sin(t * 0.3 + n) * dt * 0.05;
        arr[n * 3] += dt * 0.03;
      }
      dGeo.attributes.position.needsUpdate = true;
      dust.position.set(Math.round(cam.x / 16) * 16, cam.y - 1.6, Math.round(cam.z / 16) * 16);
      if (!night && k >= 1 && !ctx.attract) {
        night = true;
        pool.baseIntensity = 7;
        pool.baseColor.setRGB(1.5, 1.6, 1.5);
        ctx.game.audio.chime();
        ctx.game.toast('The after-school chime rings', 'Someone is making the rounds', 'danger');
        world.add(new Watcher(world, { look: { body: 0x0b0b12, coat: true, height: 2.3 }, speed: 1.6 }));
      }
    };

    // residents: shadow students who stayed behind
    const lines = [
      [
        ['...Oh, you’re still here?', 'The chime will ring soon. After that, a teacher walks the halls.', 'They never say anything. They just watch you until you leave.'],
        ['The stairs in the middle go up to the second floor. Some of the floorboards up there are gone.', 'If you fall through, you don’t land downstairs.'],
        ['I’m waiting here for someone. I forgot who, a long time ago.'],
      ],
      [
        ['Every door with light behind it goes somewhere else.', 'I opened one once. It smelled like chlorine. I came straight back.'],
        ['Look at the clocks when it gets dark. They stop agreeing with each other.'],
      ],
    ];
    const d = world.distFromSpawn;
    const roomOrder = rooms.map((r) => ({ r, k: d[(r.j0 + 1) * W + r.i0 + 1] })).filter((o) => o.k > 0).sort((a, b) => a.k - b.k);
    [roomOrder[0], roomOrder[Math.floor(roomOrder.length / 2)]].forEach((o, n) => {
      if (!o) return;
      const r = o.r;
      const model = studentModel();
      model.position.set((r.i0 + 1.5) * cs, r.h, (r.j0 + 1.2) * cs);
      model.rotation.y = -Math.PI / 2;
      const npc = new NPC(world, { name: 'a student who stayed behind', pos: model.position.clone(), model, voice: 1.25 - n * 0.2, radius: 0.3, face: false, conversations: lines[n] });
      npc.aimHeight = 1.2;
      // stands facing the blackboard; only the head turns to follow you, a beat too late
      const eye = new THREE.Vector3();
      const ahead = new THREE.Vector3(-3, 1.4, 0);
      const slow = new THREE.Vector3().copy(model.position).add(ahead);
      npc.idle = (dt, ctx) => {
        const rig = model.userData.rig;
        idlePose(rig, npc.t + n * 3, { sway: 0.4 });
        rig.rot('armL', -0.1, 0, 0.03);
        rig.rot('armR', -0.1, 0, -0.03);
        rig.rot('foreL', -0.9, 0.3, 0);
        rig.rot('foreR', -0.9, -0.3, 0);
        const near = ctx.player.pos.distanceTo(model.position) < 7;
        if (near) eye.copy(ctx.camera.position);
        else eye.copy(model.position).add(ahead);
        slow.lerp(eye, Math.min(1, dt * 0.8));
        lookAt(model, slow, { max: 1.1, over: 1.5 });
      };
      world.add(npc);
    });
    if (!world.attract && world.depth >= 1) world.add(new Peeker(world, { figure: () => LOOKS.student() }));
  },

  // what leaks through when this level bleeds into another (see game/bleed.js)
  bleed: {
    ambience: 'school',
    looks: ['student'],
    surfaces: () => ({
      wall: { mat: photo('beige_wall_001', { uvScale: 2.5, color: 0xf4ecdc }), uv: 2.5 },
      floor: { mat: photo('linoleum_brown', { uvScale: 2.4, roughness: 0.75 }), uv: 2.4 },
      ceil: { mat: photo('ceiling_interior', { uvScale: 3, color: 0xf2eee4 }), uv: 3 },
    }),
    props: {
      wall: [{ p: P.shoeCubbies, w: 1 }, { p: P.lockers, w: 1 }, { p: P.bulletinBoard, w: 1 }],
      high: [{ p: P.teruteru, w: 1 }],
      floor: [{ p: deskSet, w: 3 }],
      clutter: [{ p: P.paperScatter, w: 1 }],
    },
    stray: (world, pos) => strayNPC(world, pos, {
      name: 'a student who stayed behind',
      model: studentModel(),
      voice: 1.2,
      lines: [
        ['Is this still school? The chime hasn’t rung.'],
        ['I think I followed someone home.', 'It wasn’t my home.'],
      ],
    }),
  },

  makeDoor(world, dest) {
    return doorModel({
      width: 1.5,
      height: 2.2,
      doorColor: 0x9fb2ae,
      frameColor: 0x6b7470,
      lightColor: dest.tint || 0xffc58a,
      knob: 0xd0d0c8,
      extras(group) {
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.18), new THREE.MeshBasicMaterial({ map: labelTexture('昇降口 Exit', { w: 256, h: 64, bg: '#f2efe4', fg: '#2b2b2b', font: '30px "DotGothic16", monospace' }) }));
        plate.position.set(0, 2.45, 0.03);
        group.add(plate);
      },
    });
  },
};
