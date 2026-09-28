import * as THREE from 'three';
import { Grid, FLOOR, WALL, VOID, HOLE, buildWallFaces, buildCellQuads, buildFloors, buildRisers, buildStairs } from '../core/grid.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { checkerPastel, pbr } from '../core/surfaces.js';
import { cloudSprite, glowSprite } from '../core/textures.js';
import { mesh, doorModel, glow, decorate, stairRun } from './common.js';
import { PropKit } from '../props/kit.js';
import { photo } from '../core/assets.js';
import * as P from '../props/library.js';
import { NPC } from '../entities/npc.js';
import { sculptGeometry, sculptMaterial, recolor } from '../core/sculpt.js';
import { Watcher, Mannequin, StrayCat } from '../entities/creatures.js';

const WALL_H = 3.4;
const COLORS = [0xf6b8cf, 0xcdb8f0, 0xb6e8d2, 0xfbe6a2, 0xb8dcf6];
const GREYS = [0xc9c3c7, 0xb8b4bc, 0xc4c9c6, 0xd0ccc0, 0xbcc4cc];

const MOCHI_TALK = [
  [['Hi! Are you new here?', 'If you see a door with light behind it, you can go somewhere else. But why would you want to?']],
  [['It is always three in the afternoon here.', 'Snack time never, ever ends. Isn’t that nice?'], ['...Isn’t it?']],
  [['Don’t lean over the holes. The sky is down there too.', 'If you fall, you land somewhere else. Everyone does, eventually.']],
  [['Where did you come from?', '...I see. Everyone says that at first.']],
  [['I think we used to be the same shape as you.', 'Round is easier, though. You can just roll.']],
  [['See the stairs that go up into the clouds?', 'Some of them lead somewhere now. They didn’t used to.']],
  [['The further you go from where you woke up, the greyer it gets.', 'We don’t go out that far.']],
];

/** A sculpted mochi: soft, powdery, glossy little eyes and a blush that's part of the skin. */
function mochiGeometry(color) {
  const base = sculptGeometry('mochi', (sc) => {
    sc.sphere([0, 0, 0], 0.45, { mat: 'body', noise: [0.002, 22] });
    for (const x of [-1, 1]) {
      sc.ellipsoid([x * 0.14, 0.08, 0.418], [0.042, 0.06, 0.03], { mat: 'eye', k: 0.012 });
      sc.sphere([x * 0.125, 0.108, 0.447], 0.013, { mat: 'shine', k: 0.004 });
      // just under the surface: colours the cheeks without changing the shape
      sc.ellipsoid([x * 0.21, -0.03, 0.37], [0.07, 0.045, 0.026], { mat: 'cheek', k: 0, rot: [0, x * 0.45, 0] });
    }
    sc.cut(() => sc.ellipsoid([0, -0.015, 0.45], [0.028, 0.012, 0.02], { mat: 'mouth', k: 0.008 }));
    return sc;
  }, {
    h: 0.009,
    paints: {
      body: { color: 0xffffff, rough: 0.6, vary: 0.03, freq: 30 },
      eye: { color: 0x1e1622, rough: 0.08 },
      shine: { color: 0xffffff, rough: 0.1, emit: 1.2 },
      cheek: { color: 0xff7aa0, rough: 0.6 },
      mouth: { color: 0x8a3a4a, rough: 0.5 },
    },
  });
  return recolor(base, 'body', color);
}

function mochiModel(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(mochiGeometry(color), sculptMaterial({ detail: 'plastic', detailScale: 10, detailStrength: 0.12, physical: { sheen: 1, sheenColor: 0xffffff, sheenRoughness: 0.6 } }));
  body.scale.set(1, 0.78, 1);
  body.position.y = 0.35;
  body.castShadow = true;
  body.userData.noBake = true;
  g.add(body);
  g.userData.body = body;
  g.userData.mat = body.material;
  return g;
}

function skyDome(grey) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x9ec3ff).lerp(new THREE.Color(0x8a8f99), grey) },
      mid: { value: new THREE.Color(0xf8cde2).lerp(new THREE.Color(0xb9b3b8), grey) },
      low: { value: new THREE.Color(0xfde8d6).lerp(new THREE.Color(0xa9a4a0), grey) },
      sunDir: { value: new THREE.Vector3(0.4, 0.35, -0.85).normalize() },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 top, mid, low, sunDir; varying vec3 vDir;
      void main(){
        float h = vDir.y;
        vec3 c = mix(mid, top, smoothstep(0.05, 0.7, h));
        c = mix(low, c, smoothstep(-0.6, 0.08, h));
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        c += vec3(1.0, 0.93, 0.85) * (pow(s, 400.0) * 1.6 + pow(s, 12.0) * 0.25);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 16), mat);
  m.renderOrder = -1;
  return m;
}

export default {
  assets: { textures: ['beige_wall_001'], models: ['rubber_duck_toy'], looks: [['mannequin', 0], ['mannequin', 1], ['mannequin', 2], 'cat'] },

  build(world) {
    const rng = world.rng;
    const W = 40;
    const cs = 2.5;
    const g = (world.grid = new Grid(W, W, cs, FLOOR));
    g.border(VOID);
    const colorOf = new Int8Array(W * W).fill(-1);
    for (let s = 0; s < 40; s++) {
      const i = rng.int(3, W - 8);
      const j = rng.int(3, W - 8);
      const horiz = rng.chance(0.5);
      const len = rng.int(2, 5);
      const col = rng.int(0, COLORS.length - 1);
      for (let k = 0; k < len; k++) {
        const ii = horiz ? i + k : i;
        const jj = horiz ? j : j + k;
        g.set(ii, jj, WALL);
        colorOf[jj * W + ii] = col;
      }
    }
    const si = W >> 1;
    const sj = W >> 1;
    g.fillRect(si - 2, sj - 2, si + 2, sj + 2, FLOOR);
    // plateaus reached by broad stairs
    for (let n = 0; n < 4; n++) {
      const w = rng.int(4, 7);
      const h = rng.int(4, 7);
      const i0 = rng.int(3, W - w - 4);
      const j0 = rng.int(3, W - h - 4);
      if (Math.abs(i0 + w / 2 - si) < w / 2 + 3 && Math.abs(j0 + h / 2 - sj) < h / 2 + 3) continue;
      const up = rng.pick([1.4, 2.8]);
      for (let j = j0; j < j0 + h; j++) for (let i = i0; i < i0 + w; i++) if (g.get(i, j) === FLOOR) g.setHeight(i, j, up);
      const steps = up > 2 ? 2 : 1;
      const col = j0 + (h >> 1);
      for (let s = 0; s < steps; s++) {
        g.set(i0 - steps + s, col, FLOOR);
        g.set(i0 - steps + s, col + 1, FLOOR);
      }
      stairRun(g, i0 - steps, col, 0, steps, 0, up / steps);
      stairRun(g, i0 - steps, col + 1, 0, steps, 0, up / steps);
    }
    world.spawn = { x: si * cs, z: sj * cs, yaw: rng.float(0, Math.PI * 2) };
    world.finalizeLayout();
    // holes open onto the sky below; more of them further out and deeper in
    const holeCells = world.pickFarCells(3 + world.depth * 2, { minFrac: 0.3, spacing: 4, filter: (i, j) => g.get(i, j) === FLOOR && !g.ramp[j * W + i] && g.countSolidNeighbors(i, j) === 0 });
    for (const [i, j] of holeCells) {
      g.set(i, j, HOLE);
      if (rng.chance(0.5) && g.get(i + 1, j) === FLOOR && !g.ramp[j * W + i + 1]) g.set(i + 1, j, HOLE);
    }

    const grey = Math.min(1, Math.max(0, world.depth * 0.15));
    const palette = COLORS.map((c, k) => new THREE.Color(c).lerp(new THREE.Color(GREYS[k]), grey).getHex());
    // real plaster, painted in pastel
    const wallMats = palette.map((color) => photo('beige_wall_001', { uvScale: 3, color: new THREE.Color(color).multiplyScalar(1.45), normalScale: 0.6 }));
    const floorMat = pbr(checkerPastel(), { color: new THREE.Color(1, 1, 1).lerp(new THREE.Color(0.8, 0.8, 0.8), grey) });
    const baseOf = (i, j) => g.heightOf(i, j);
    // walls: coloured partitions, base follows the floor next to them
    palette.forEach((_, n) => {
      const solid = (c, i, j) => c === WALL && (colorOf[j * W + i] === n || (n === 0 && colorOf[j * W + i] === -1));
      mesh(world, buildWallFaces(g, { y0: (i, j) => baseOf(i, j) - 0.02, y1: (i, j) => Math.max(0, baseOf(i, j)) + WALL_H, uScale: 3, vScale: 3, solid, open: (c) => c !== WALL && c !== VOID }), wallMats[n], { cast: true });
      mesh(world, buildCellQuads(g, solid, WALL_H + 1e-3, true, 3), wallMats[n]);
    });
    mesh(world, buildFloors(g, (c) => c !== WALL && c !== VOID && c !== HOLE, 4), floorMat);
    mesh(world, buildRisers(g, { pred: (c) => c !== WALL && c !== VOID, uScale: 3, vScale: 3 }), wallMats[0]);
    const stairGeos = buildStairs(g);
    if (stairGeos.length) mesh(world, mergeGeometries(stairGeos), wallMats[3], { cast: true });
    world.root.add(skyDome(grey));

    const hemi = new THREE.HemisphereLight(0xfff2fa, 0xe9b9d0, 1.0 - grey * 0.3);
    world.root.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0e0, 1.8 - grey * 0.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 90;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.03;
    world.root.add(sun, sun.target);

    // floating shapes, clouds, bubbles
    const floaters = [];
    const geos = [new THREE.TorusKnotGeometry(0.8, 0.25, 96, 12), new THREE.IcosahedronGeometry(1, 0), new THREE.TorusGeometry(1, 0.3, 16, 40), new THREE.OctahedronGeometry(1, 0), new THREE.SphereGeometry(0.9, 24, 16)];
    for (let a = 0; a < 26; a++) {
      const col = rng.pick(palette);
      const m = new THREE.Mesh(rng.pick(geos), new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1, emissive: col, emissiveIntensity: 0.12, flatShading: rng.chance(0.4) }));
      m.position.set(rng.float(0, W * cs), rng.float(6, 16), rng.float(0, W * cs));
      m.scale.setScalar(rng.float(0.6, 2.2));
      m.userData = { y: m.position.y, sp: rng.float(0.1, 0.4), ph: rng.float(0, 6) };
      world.root.add(m);
      floaters.push(m);
    }
    const cloudMat = new THREE.SpriteMaterial({ map: cloudSprite(), color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, fog: false });
    const clouds = [];
    for (let a = 0; a < 40; a++) {
      const c = new THREE.Sprite(cloudMat);
      const ang = rng.float(0, Math.PI * 2);
      const r = rng.float(70, 150);
      c.position.set((W * cs) / 2 + Math.cos(ang) * r, rng.float(-40, 45), (W * cs) / 2 + Math.sin(ang) * r);
      const s = rng.float(25, 55);
      c.scale.set(s, s / 2, 1);
      world.root.add(c);
      clouds.push(c);
    }
    const bubbleCount = 70;
    const bGeo = new THREE.BufferGeometry();
    const bPos = new Float32Array(bubbleCount * 3);
    for (let k = 0; k < bubbleCount; k++) {
      bPos[k * 3] = rng.float(-15, 15);
      bPos[k * 3 + 1] = rng.float(0, 8);
      bPos[k * 3 + 2] = rng.float(-15, 15);
    }
    bGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
    const bubbles = new THREE.Points(bGeo, new THREE.PointsMaterial({ map: glowSprite(), size: 0.35, color: 0xfff0fb, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    bubbles.frustumCulled = false;
    world.root.add(bubbles);

    // props: toys, and the old dream furniture
    const kit = new PropKit(world, { shadows: true });
    const archProp = {
      place: 'floor', fp: [3.7, 0.6], parts: [[-1.6, 0, 0.5, 0.5], [1.6, 0, 0.5, 0.5]],
      build(k, r, o) {
        const g2 = new THREE.Group();
        const col = k.std(r.pick(o.eerie ? GREYS : palette), 0.5);
        for (const s of [-1, 1]) k.box(g2, 0.5, 2.6, 0.5, col, s * 1.6, 1.3, 0);
        k.torus(g2, 1.6, 0.25, col, 0, 2.6, 0, 0, 0, 0, Math.PI);
        return g2;
      },
    };
    const stairsNowhere = {
      place: 'floor', fp: [1.4, 1.4],
      build(k, r) {
        const g2 = new THREE.Group();
        const col = k.std(r.pick(palette), 0.45);
        const n = r.int(5, 9);
        for (let s = 0; s < n; s++) k.box(g2, 1.4, 0.3, 0.4, col, 0, 0.15 + s * 0.3, 0.5 - s * 0.4 * (1.4 / (n * 0.4)));
        return g2;
      },
    };
    const freeDoor = {
      place: 'floor', fp: [1.2, 0.3],
      build(k, r) {
        const g2 = P.fakeDoor.build(k, r);
        return g2;
      },
    };
    decorate(world, kit, {
      density: { wall: 0.1, high: 0, floor: 0.1, clutter: 0.12, ceil: 0 },
      wall: [{ p: P.toyBlock, w: 2 }, { p: P.gumball, w: 1 }],
      floor: [
        { p: archProp, w: 2 }, { p: stairsNowhere, w: 1.5 }, { p: freeDoor, w: 1 }, { p: P.carouselHorse, w: 1 }, { p: P.giantCandy, w: 1.2 },
        { p: P.toyBlock, w: 1.5 }, { p: P.gumball, w: 0.8 },
      ],
      clutter: [
        { p: P.balloon, w: 3, max: 0.9 }, { p: P.teddy, w: 2 }, { p: P.modelProp('rubber_duck_toy', { collide: false, jitter: 3, scale: 1.4 }), w: 1.5 }, { p: P.balloon, w: 2, min: 0.9, o: { grey: true } }, { p: P.teddy, w: 2, min: 0.8, o: { grey: true, eerie: true } },
        { p: P.toyBlock, w: 1, min: 0.7, o: { grey: true } },
      ],
    });
    kit.finish();

    Object.assign(world.env, {
      background: 0xf8d9e6,
      fog: new THREE.Fog(new THREE.Color(0xf6d5e3).lerp(new THREE.Color(0xbdb8bb), grey), 26 - grey * 8, 95 - grey * 30),
      exposure: 0.95,
      toneMapping: THREE.NeutralToneMapping,
      postfx: { bloom: 0.32, bloomThreshold: 0.9, bloomRadius: 0.7, grain: 0.03, vignette: 0.2, chroma: 0.001, scan: 0.012, tint: [1.02, 0.99, 1.02] },
      ao: 0.7,
      envIntensity: 0.6,
      ambience: 'dream',
      reverb: [2.4, 3],
      shadows: true,
      bake: { hemi: 1, dynamic: 1, bounce: 0, ao: 0.8 },
    });
    world.surfaceFn = () => 'soft';

    let t = 0;
    world.onUpdate = (dt, ctx) => {
      t += dt;
      const cam = ctx.camera.position;
      sun.position.set(cam.x + 18, 40, cam.z - 30);
      sun.target.position.set(cam.x, 0, cam.z);
      for (const f of floaters) {
        f.rotation.x += dt * f.userData.sp * 0.6;
        f.rotation.y += dt * f.userData.sp;
        f.position.y = f.userData.y + Math.sin(t * 0.5 + f.userData.ph) * 0.6;
      }
      for (const c of clouds) c.position.x += dt * 0.6;
      const arr = bGeo.attributes.position.array;
      for (let k = 0; k < bubbleCount; k++) {
        arr[k * 3 + 1] += dt * (0.3 + (k % 5) * 0.08);
        arr[k * 3] += Math.sin(t + k) * dt * 0.1;
        if (arr[k * 3 + 1] > 9) arr[k * 3 + 1] = 0;
      }
      bGeo.attributes.position.needsUpdate = true;
      bubbles.position.set(Math.round(cam.x / 30) * 30, 0, Math.round(cam.z / 30) * 30);
    };
    // balloons bob
    world.root.traverse((o) => {
      if (o.userData.bob !== undefined) {
        const y0 = o.position.y;
        const ph = o.userData.bob;
        world.animated.push(() => (o.position.y = y0 + Math.sin(t * 0.8 + ph) * 0.08));
      }
    });

    // residents
    const d = world.distFromSpawn;
    const spots = g.openCells().filter(([i, j]) => d[j * W + i] > 3 && d[j * W + i] < world.maxDist * 0.6 && g.countSolidNeighbors(i, j) === 0 && !g.ramp[j * W + i]);
    rng.shuffle(spots);
    spots.sort((a, b) => (d[a[1] * W + a[0]] < 8 ? -1 : 0) - (d[b[1] * W + b[0]] < 8 ? -1 : 0));
    const talks = rng.shuffle([...MOCHI_TALK]);
    for (let n = 0; n < 7 && n < spots.length; n++) {
      const [i, j] = spots[n];
      const c = g.center(i, j);
      const model = mochiModel(palette[n % palette.length]);
      model.position.set(c.x, g.heightOf(i, j), c.z);
      const home = model.position.clone();
      const npc = new NPC(world, { name: 'Mochi', pos: model.position.clone(), model, voice: 1.8 + n * 0.08, radius: 0.45, conversations: talks[n % talks.length], onTalk: (game) => game.audio.boop(null, 1 + n * 0.05) });
      npc.aimHeight = 0.4;
      const body = model.userData.body;
      let target = null;
      let hop = 0;
      let wait = rng.float(0, 3);
      npc.idle = (dt, ctx) => {
        if (npc.talking) hop = 0;
        else if (wait > 0) wait -= dt;
        else {
          if (!target) {
            const ang = Math.random() * Math.PI * 2;
            const r = Math.random() * 5;
            target = new THREE.Vector3(home.x + Math.cos(ang) * r, 0, home.z + Math.sin(ang) * r);
          }
          const dx = target.x - model.position.x;
          const dz = target.z - model.position.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 0.2) {
            target = null;
            wait = 1 + Math.random() * 3;
          } else {
            hop += dt * 5;
            const nx = model.position.x + (dx / dist) * dt * 1.1;
            const nz = model.position.z + (dz / dist) * dt * 1.1;
            // mochi never roll into holes or off ledges
            if (Math.abs(world.floorAt(nx, nz) - home.y) < 0.05) {
              model.position.x = nx;
              model.position.z = nz;
            } else target = null;
            const before = model.position.clone();
            world.collide(model.position, 0.45);
            if (before.distanceTo(model.position) > 0.01) target = null;
            if (ctx.attract || ctx.player.pos.distanceTo(model.position) > 6) npc.targetYaw = Math.atan2(dx, dz);
            if (ctx.attract) model.rotation.y = npc.targetYaw;
          }
        }
        const h = Math.abs(Math.sin(hop));
        model.position.y = home.y + h * 0.35;
        body.scale.set(1 + (1 - h) * 0.08, 0.78 - (1 - h) * 0.06 + h * 0.06, 1 + (1 - h) * 0.08);
      };
      world.add(npc);
    }
    if (!world.attract && world.depth >= 2) world.add(new Watcher(world, { look: { body: 0xe8c8d8, eyes: 0x000000, height: 2.2 } }));
    if (!world.attract) {
      // mannequins that only ever strike silly poses here, until they don't
      const cells = world.pickFarCells(2 + Math.min(2, world.depth), { minFrac: 0.3, spacing: 6, filter: (i, j) => g.standable(i, j) && !g.ramp[j * W + i] && g.countSolidNeighbors(i, j) === 0 });
      cells.forEach(([i, j], k) => {
        const c = g.center(i, j);
        world.add(new Mannequin(world, { pos: new THREE.Vector3(c.x, g.heightOf(i, j), c.z), yaw: rng.float(0, 6.28), variant: k % 3, mode: world.depth >= 3 ? 'mixed' : 'funny' }));
      });
      if (rng.chance(0.6)) world.add(new StrayCat(world));
    }
  },

  // what leaks through when this level bleeds into another (see game/bleed.js)
  bleed: {
    ambience: 'dream',
    surfaces: () => ({
      wall: { mat: photo('beige_wall_001', { uvScale: 3, color: new THREE.Color(0xf6b8cf).multiplyScalar(1.45), normalScale: 0.6 }), uv: 3 },
      floor: { mat: pbr(checkerPastel()), uv: 4 },
    }),
    props: {
      floor: [{ p: P.giantCandy, w: 1 }, { p: P.carouselHorse, w: 0.6 }, { p: P.gumball, w: 1 }],
      clutter: [{ p: P.toyBlock, w: 2 }, { p: P.balloon, w: 2 }, { p: P.teddy, w: 1 }],
    },
    stray: (world, pos) => {
      const model = mochiModel(0xffc4d8);
      model.position.copy(pos);
      const npc = new NPC(world, { name: 'Mochi', pos, model, voice: 1.9, radius: 0.45, conversations: [
        ['Um. Hi. Where did all the colours go?'],
        ['It’s so grey here. Is this what you people live in?', 'I’m going to roll back now. Which way is back?'],
      ], onTalk: (game) => game.audio.boop(null, 1.1) });
      npc.aimHeight = 0.4;
      const body = model.userData.body;
      npc.idle = () => {
        // a nervous little wobble
        body.scale.set(1 + Math.sin(npc.t * 9) * 0.02, 0.78 + Math.sin(npc.t * 9 + 1) * 0.02, 1);
      };
      return npc;
    },
  },

  makeDoor(world, dest) {
    return doorModel({
      width: 1.3,
      height: 2.6,
      doorColor: 0xffffff,
      frameColor: 0xf6b8cf,
      lightColor: dest.tint || 0xfff0ff,
      knob: 0xffd86b,
      extras(group) {
        const rainbow = new THREE.Group();
        const cols = [0xff9aa2, 0xffdac1, 0xfff5ba, 0xb5ead7, 0xc7ceea];
        cols.forEach((c, k) => rainbow.add(new THREE.Mesh(new THREE.TorusGeometry(1.25 - k * 0.1, 0.05, 8, 40, Math.PI), new THREE.MeshBasicMaterial({ color: c }))));
        rainbow.position.set(0, 2.6, 0.08);
        group.add(rainbow);
        const sparkle = glow(0xffffff, 2.5, 0);
        sparkle.position.set(0, 3.2, 0.3);
        group.add(sparkle);
        return (open, time) => {
          rainbow.children.forEach((r, k) => r.material.color.setHSL((time * 0.1 + k * 0.12) % 1, 0.7, 0.8));
          sparkle.material.opacity = 0.2 + open * (0.4 + Math.sin(time * 3) * 0.2);
        };
      },
    });
  },
};
