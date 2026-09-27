import * as THREE from 'three';
import { Grid, FLOOR, WALL, HOLE, DIRS, buildWallFaces, buildFloors, buildRisers } from '../core/grid.js';
import { bambooGrove, flagstone, gravel, woodPanel, pbr } from '../core/surfaces.js';
import { glowSprite } from '../core/textures.js';
import { mesh, doorModel, decorate, glow } from './common.js';
import { LightPool } from '../core/lights.js';
import { PropKit } from '../props/kit.js';
import * as P from '../props/library.js';
import { Watcher, Follower } from '../entities/creatures.js';
import { NPC, mat } from '../entities/npc.js';

const WALL_H = 7;

function carveMaze(g, rng) {
  const stack = [[1, 1]];
  g.set(1, 1, FLOOR);
  while (stack.length) {
    const [i, j] = stack[stack.length - 1];
    const nb = [[2, 0], [-2, 0], [0, 2], [0, -2]]
      .map(([dx, dy]) => [i + dx, j + dy, dx, dy])
      .filter(([x, y]) => x > 0 && y > 0 && x < g.w - 1 && y < g.h - 1 && g.get(x, y) === WALL);
    if (!nb.length) {
      stack.pop();
      continue;
    }
    const [x, y, dx, dy] = rng.pick(nb);
    g.set(i + dx / 2, j + dy / 2, FLOOR);
    g.set(x, y, FLOOR);
    stack.push([x, y]);
  }
  for (let j = 1; j < g.h - 1; j += 2) {
    for (let i = 1; i < g.w - 1; i += 2) {
      if (g.countSolidNeighbors(i, j) < 3 || !rng.chance(0.5)) continue;
      const opts = DIRS.filter(([dx, dy]) => g.get(i + dx, j + dy) === WALL && i + dx > 0 && j + dy > 0 && i + dx < g.w - 1 && j + dy < g.h - 1);
      if (opts.length) {
        const [dx, dy] = rng.pick(opts);
        g.set(i + dx, j + dy, FLOOR);
      }
    }
  }
}

function kitsuneModel() {
  const g = new THREE.Group();
  const white = new THREE.MeshPhysicalMaterial({ color: 0xf4f0ea, roughness: 0.6, sheen: 1, sheenColor: 0xffffff, emissive: 0x2a2a3a, emissiveIntensity: 0.4 });
  const red = mat(0xc4261c, { roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.25, 20, 14), white);
  body.scale.set(0.8, 1, 1.4);
  body.position.set(0, 0.42, 0);
  g.add(body);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), white);
  chest.position.set(0, 0.62, 0.22);
  g.add(chest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), white);
  head.position.set(0, 0.86, 0.3);
  g.add(head);
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 12), white);
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, 0.82, 0.48);
  g.add(snout);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 8), white);
    ear.position.set(s * 0.08, 1.0, 0.28);
    g.add(ear);
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.01, 0.01), red);
    mark.position.set(s * 0.05, 0.9, 0.43);
    mark.rotation.z = s * 0.4;
    g.add(mark);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.4, 8), white);
    leg.position.set(s * 0.1, 0.2, 0.2);
    g.add(leg);
  }
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10), white);
  tail.scale.set(0.8, 0.8, 2.4);
  tail.position.set(0, 0.62, -0.42);
  tail.rotation.x = -0.8;
  g.add(tail);
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.03, 8, 20), red);
  scarf.rotation.x = Math.PI / 2 - 0.3;
  scarf.position.set(0, 0.72, 0.24);
  g.add(scarf);
  const aura = glow(0xcfd8ff, 1.8, 0.25);
  aura.position.y = 0.6;
  g.add(aura);
  return g;
}

function nightSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { moonDir: { value: new THREE.Vector3(-0.3, 0.45, -0.84).normalize() } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 moonDir; varying vec3 vDir;
      float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
      void main(){
        float h = vDir.y;
        vec3 c = mix(vec3(0.16,0.1,0.2), vec3(0.03,0.04,0.1), smoothstep(-0.05, 0.6, h));
        c += vec3(0.35,0.16,0.12) * pow(1.0 - clamp(h, 0.0, 1.0), 6.0) * 0.6;
        float s = max(dot(normalize(vDir), moonDir), 0.0);
        c += vec3(1.0,0.97,0.9) * (smoothstep(0.9993, 0.9996, s) * 1.5 + pow(s, 60.0) * 0.12);
        vec3 q = floor(vDir * 300.0);
        c += vec3(step(0.9975, hash(q))) * smoothstep(0.1, 0.5, h) * 0.8;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 16), mat);
  m.renderOrder = -1;
  return m;
}

export default {
  id: 'shrine',
  code: 'LEVEL 1000',
  name: 'Thousand Gates',
  sub: '千本鳥居 · A shrine path in Japan at night',
  tint: 0xff8a50,

  build(world) {
    const rng = world.rng;
    const W = 37;
    const cs = 2.4;
    const g = (world.grid = new Grid(W, W, cs, WALL));
    carveMaze(g, rng);
    // clearings
    const clearings = [];
    for (let n = 0; n < 7; n++) {
      const i = rng.int(2, W - 5) | 1;
      const j = rng.int(2, W - 5) | 1;
      const w = rng.pick([3, 3, 5]);
      g.fillRect(i, j, Math.min(W - 2, i + w - 1), Math.min(W - 2, j + 2), FLOOR);
      clearings.push({ i, j, w: Math.min(w, W - 1 - i), h: 3 });
    }
    // a hillside: height rises smoothly with distance from the start, in stone steps
    const si = 1;
    const sj = 1;
    const noise = (i, j) => Math.sin(i * 0.4) * 0.3 + Math.cos(j * 0.33) * 0.3;
    for (let j = 0; j < W; j++) {
      for (let i = 0; i < W; i++) {
        const d = Math.hypot(i - si, j - sj);
        g.setHeight(i, j, Math.round((d * 0.19 + noise(i, j)) / 0.15) * 0.15);
      }
    }
    for (const c of clearings) {
      const y = g.heightOf(c.i + (c.w >> 1), c.j + 1);
      g.heightRect(c.i, c.j, c.i + c.w - 1, c.j + c.h - 1, y);
    }
    const sp = g.center(si, sj);
    world.spawn = { x: sp.x, z: sp.z, yaw: g.walkable(2, 1) ? -Math.PI / 2 : Math.PI };
    world.finalizeLayout();
    // ravines: some dead ends drop away into darkness
    const inClearing = (i, j) => clearings.some((c) => i >= c.i && i < c.i + c.w && j >= c.j && j < c.j + c.h);
    const deadEnds = g.openCells().filter(([i, j]) => g.countSolidNeighbors(i, j) === 3 && !inClearing(i, j) && world.distFromSpawn[j * W + i] > 10);
    rng.shuffle(deadEnds);
    for (const [i, j] of deadEnds.slice(0, 1 + world.depth)) g.set(i, j, HOLE);

    // ---- geometry
    const bamboo = pbr(bambooGrove(), { normalScale: 0.8 });
    const stone = pbr(flagstone(), { normalScale: 1 });
    const grav = pbr(gravel(), { normalScale: 1 });
    mesh(world, buildWallFaces(g, { y0: (i, j) => g.heightOf(i, j) - 0.05, y1: (i, j) => Math.max(0, g.heightOf(i, j)) + WALL_H, uScale: 4, vScale: 4 }), bamboo);
    mesh(world, buildFloors(g, (c, i, j) => c === FLOOR && !inClearing(i, j), 2.4), stone);
    mesh(world, buildFloors(g, (c, i, j) => c === FLOOR && inClearing(i, j), 2), grav);
    mesh(world, buildRisers(g, { pred: (c) => c !== WALL, uScale: 2.4, vScale: 2.4 }), stone);
    world.root.add(nightSky());

    // ---- torii tunnels (instanced), lanterns (light pool)
    const lacquer = new THREE.MeshPhysicalMaterial({ color: 0xd8401e, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.3 });
    const black = new THREE.MeshStandardMaterial({ color: 0x151210, roughness: 0.6 });
    const gates = [];
    const kitLanterns = [];
    for (let j = 1; j < W - 1; j++) {
      for (let i = 1; i < W - 1; i++) {
        if (g.get(i, j) !== FLOOR || inClearing(i, j)) continue;
        const ox = g.standable(i - 1, j) && g.standable(i + 1, j);
        const oz = g.standable(i, j - 1) && g.standable(i, j + 1);
        const sx = g.solid(i, j - 1) && g.solid(i, j + 1);
        const sz = g.solid(i - 1, j) && g.solid(i + 1, j);
        let axis = null;
        if (ox && sx) axis = 'x';
        else if (oz && sz) axis = 'z';
        if (!axis) continue;
        const u = world.unease(i, j);
        const per = u > 0.8 ? 4 : 3;
        for (let k = 0; k < per; k++) {
          const t = (k + 0.5) / per;
          const x = axis === 'x' ? (i + t) * cs : (i + 0.5) * cs;
          const z = axis === 'z' ? (j + t) * cs : (j + 0.5) * cs;
          gates.push({ x, z, y: g.floorAt(x, z), yaw: axis === 'x' ? Math.PI / 2 : 0, s: 0.96 + rng.float(-0.03, 0.03) });
        }
      }
    }
    const parts = [
      { geo: new THREE.CylinderGeometry(0.1, 0.12, 2.6, 12), mat: lacquer, at: () => [[-0.85, 1.3, 0], [0.85, 1.3, 0]] },
      { geo: new THREE.CylinderGeometry(0.13, 0.13, 0.25, 12), mat: black, at: () => [[-0.85, 0.12, 0], [0.85, 0.12, 0]] },
      { geo: new THREE.BoxGeometry(2.3, 0.16, 0.22), mat: lacquer, at: () => [[0, 2.55, 0]] },
      { geo: new THREE.BoxGeometry(2.45, 0.08, 0.28), mat: black, at: () => [[0, 2.67, 0]] },
      { geo: new THREE.BoxGeometry(1.95, 0.12, 0.12), mat: lacquer, at: () => [[0, 2.15, 0]] },
    ];
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const v = new THREE.Vector3();
    for (const part of parts) {
      const offsets = part.at();
      const im = new THREE.InstancedMesh(part.geo, part.mat, Math.max(1, gates.length * offsets.length));
      let n = 0;
      for (const gt of gates) {
        q.setFromAxisAngle(up, gt.yaw);
        for (const [ox, oy, oz] of offsets) {
          v.set(ox, oy, oz).multiplyScalar(gt.s).applyQuaternion(q).add(new THREE.Vector3(gt.x, gt.y, gt.z));
          m4.compose(v, q, new THREE.Vector3(gt.s, gt.s, gt.s));
          im.setMatrixAt(n++, m4);
        }
      }
      im.count = n;
      world.root.add(im);
    }
    for (const gt of gates) {
      if (rng.chance(0.12 + world.unease(...g.cellOf(gt.x, gt.z)) * 0.15)) {
        const off = rng.pick([-0.6, 0.6]);
        kitLanterns.push([gt.x + off * Math.cos(gt.yaw), gt.y + 2.47, gt.z - off * Math.sin(gt.yaw)]);
      }
      for (const s of [-0.85, 0.85]) {
        const px = gt.x + s * gt.s * Math.cos(gt.yaw);
        const pz = gt.z - s * gt.s * Math.sin(gt.yaw);
        world.addBox(px - 0.12, pz - 0.12, px + 0.12, pz + 0.12);
      }
    }

    // stone lanterns along the path, with warm flickering light
    const kit = new PropKit(world);
    const pool = new LightPool(world.root, world.lightCount, { color: 0xff9a4a, intensity: 5, distance: 8, decay: 1.6 });
    world.lightPool = pool;
    const lanterns = world.pickFarCells(40, { minFrac: 0, spacing: 3, filter: (i, j) => g.get(i, j) === FLOOR && g.countSolidNeighbors(i, j) >= 1 });
    for (const [i, j] of lanterns) {
      const dir = DIRS.find(([dx, dy]) => g.solid(i + dx, j + dy));
      if (!dir) continue;
      const c = g.center(i, j);
      const x = c.x + dir[0] * cs * 0.36;
      const z = c.z + dir[1] * cs * 0.36;
      const y = g.heightOf(i, j);
      kit.add(P.stoneLantern.build(kit, rng), x, z, 0, { y, collide: [0.45, 0.45] });
      const u = world.unease(i, j);
      pool.add({ pos: new THREE.Vector3(x, y + 1.5, z), flicker: rng.float(0.05, 0.15) + u * 0.1, dead: rng.chance(0.1 + u * 0.3) });
    }
    for (const [x, y, z] of kitLanterns) kit.add(P.paperLantern.build(kit, rng), x, z, 0, { y });
    // clearings: shrine furniture
    for (const c of clearings) {
      const cx = (c.i + c.w / 2) * cs;
      const cz = (c.j + c.h / 2) * cs;
      const y = g.heightOf(c.i, c.j);
      const r = rng.int(0, 3);
      if (r === 0) kit.add(P.offeringBox.build(kit, rng), cx, cz, rng.pick([0, Math.PI / 2]), { y, collide: [0.9, 0.5] });
      else if (r === 1) kit.add(P.emaRack.build(kit, rng), cx, cz, rng.pick([0, Math.PI / 2]), { y, collide: [1.4, 0.3] });
      else if (r === 2) kit.add(P.chozuya.build(kit, rng), cx, cz, rng.pick([0, Math.PI / 2]), { y, collide: [1.1, 0.7] });
      else {
        for (const s of [-1, 1]) kit.add(P.foxStatue.build(kit, rng), cx + s * 1.3, cz, s * -0.3, { y, collide: [0.5, 0.6] });
      }
    }
    decorate(world, kit, {
      density: { wall: 0.05, high: 0.06, floor: 0.04, clutter: 0.12, ceil: 0 },
      wall: [{ p: P.jizo, w: 2, o: {} }, { p: P.foxStatue, w: 1, min: 0.3 }],
      high: [{ p: P.foxMask, w: 1, min: 0.45 }],
      clutter: [{ p: P.jizo, w: 1.5, min: 0.25 }, { p: P.spiderLilies, w: 2.5, min: 0.15 }, { p: P.jizo, w: 2, min: 0.8, o: { eerie: true } }],
    });
    kit.finish();

    // moonlight and fireflies
    world.root.add(new THREE.HemisphereLight(0x3a3a66, 0x0c0a10, 0.55));
    const moon = new THREE.DirectionalLight(0x9fb0ff, 0.45);
    moon.position.set(-30, 45, -80);
    world.root.add(moon);
    const flyN = 80;
    const fGeo = new THREE.BufferGeometry();
    const fPos = new Float32Array(flyN * 3);
    const fPh = [];
    for (let k = 0; k < flyN; k++) {
      fPos[k * 3] = rng.float(-10, 10);
      fPos[k * 3 + 1] = rng.float(0.5, 3);
      fPos[k * 3 + 2] = rng.float(-10, 10);
      fPh.push(rng.float(0, 6));
    }
    fGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3));
    const fMat = new THREE.PointsMaterial({ map: glowSprite(), size: 0.12, color: 0xd8ff8a, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
    const flies = new THREE.Points(fGeo, fMat);
    flies.frustumCulled = false;
    world.root.add(flies);

    Object.assign(world.env, {
      background: 0x0c0a14,
      fog: new THREE.FogExp2(0x16132a, 0.045 + world.depth * 0.004),
      exposure: 1.25,
      postfx: { bloom: 0.55, bloomThreshold: 0.7, bloomRadius: 0.6, grain: 0.07, vignette: 0.42, chroma: 0.0018, scan: 0.03, tint: [1.02, 0.97, 1.04] },
      ao: 0.9,
      envIntensity: 0.4,
      ambience: 'shrine',
      reverb: [2.8, 2.4],
      flashlight: true,
      flashlightOn: false,
      flashlightIntensity: 35,
    });
    world.surfaceFn = (x, z) => {
      const [i, j] = g.cellOf(x, z);
      return inClearing(i, j) ? 'gravel' : 'stone';
    };

    let t = 0;
    world.onUpdate = (dt, ctx) => {
      t += dt;
      const cam = ctx.camera.position;
      const arr = fGeo.attributes.position.array;
      for (let k = 0; k < flyN; k++) {
        arr[k * 3] += Math.sin(t * 0.5 + fPh[k]) * dt * 0.3;
        arr[k * 3 + 1] += Math.cos(t * 0.7 + fPh[k] * 2) * dt * 0.15;
        arr[k * 3 + 2] += Math.cos(t * 0.4 + fPh[k]) * dt * 0.3;
      }
      fGeo.attributes.position.needsUpdate = true;
      flies.position.set(Math.round(cam.x / 20) * 20, cam.y - 1.6, Math.round(cam.z / 20) * 20);
      fMat.opacity = 0.6 + Math.sin(t * 3) * 0.3;
    };

    // resident: a white fox in the first clearing you'd reach
    const d = world.distFromSpawn;
    const first = clearings.map((c) => ({ c, k: d[(c.j + 1) * W + c.i + 1] })).filter((o) => o.k > 0).sort((a, b) => a.k - b.k)[0];
    if (first) {
      const c = first.c;
      const model = kitsuneModel();
      model.position.set((c.i + 0.6) * cs, g.heightOf(c.i, c.j), (c.j + 0.6) * cs);
      const fox = new NPC(world, {
        name: 'the white fox',
        pos: model.position.clone(),
        model,
        voice: 1.4,
        radius: 0.35,
        conversations: [
          ['A visitor, at this hour?', 'The gates go on for as long as you keep walking. A thousand, they say. Nobody has counted past nine hundred.', 'Some of the side paths end in nothing at all. Watch your step.'],
          ['If a door hums, it leads to somewhere that is not here. That is all doors are, really.'],
          ['Go on. The lanterns will keep you company.'],
        ],
      });
      fox.aimHeight = 0.7;
      fox.idle = () => {
        model.children[model.children.length - 3].rotation.y = Math.sin(fox.t * 2) * 0.3;
      };
      world.add(fox);
    }
    if (!world.attract) {
      world.add(new Watcher(world, { look: { body: 0x0a0a0a, eyes: 0xff5a30, height: 2.3 }, speed: 1.3 }));
      if (world.depth >= 1) world.add(new Follower(world));
    }
  },

  makeDoor(world, dest) {
    const woodMat = pbr(woodPanel('s-wood-shrine', [110, 72, 40], 0.5));
    return doorModel({
      width: 1.3,
      height: 2.2,
      doorMap: woodMat.map,
      doorColor: 0x8a5a30,
      frameColor: 0x5a2a18,
      lightColor: dest.tint || 0xffb070,
      knob: 0x2a1a10,
      extras(group) {
        const rope = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 8, 24, Math.PI), new THREE.MeshStandardMaterial({ color: 0xd8c38a, roughness: 0.9 }));
        rope.rotation.z = Math.PI;
        rope.position.set(0, 2.55, 0.18);
        rope.scale.y = 0.25;
        group.add(rope);
        const paper = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide });
        for (const x of [-0.45, 0, 0.45]) {
          const s = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.35), paper);
          s.position.set(x, 2.25, 0.19);
          group.add(s);
        }
      },
    });
  },
};
