import * as THREE from 'three';
import { Grid, FLOOR, WALL, DOORWAY, buildWallFaces, buildCellQuads, worldPlane, wallMounts } from '../core/grid.js';
import { schoolWall, linoleum, schoolWindow, chalkboard, plainNoise, sunPatch, glowSprite, labelTexture } from '../core/textures.js';
import { mesh, ceilingFixtures, doorModel } from './common.js';
import { Wanderer } from '../entities/creatures.js';
import { NPC } from '../entities/npc.js';

const H = 3.0;
const LINTEL = 2.3;
const DUSK = 150; // seconds until the after-school chime

function studentModel() {
  const g = new THREE.Group();
  const shadow = new THREE.MeshStandardMaterial({ color: 0x0c0b10, roughness: 1, transparent: true, opacity: 0.92 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.35, 4, 8), shadow);
  torso.position.y = 0.95;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 12), shadow);
  head.position.y = 1.38;
  g.add(head);
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 0.3, 12), shadow);
  skirt.position.y = 0.62;
  g.add(skirt);
  for (const x of [-0.08, 0.08]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.4, 3, 6), shadow);
    leg.position.set(x, 0.3, 0.12);
    leg.rotation.x = -0.3;
    g.add(leg);
  }
  // faint eyes that catch the light
  const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.2, 1.0) });
  for (const x of [-0.045, 0.045]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.013, 6, 6), eyeMat);
    e.position.set(x, 1.4, 0.13);
    g.add(e);
  }
  return g;
}

export default {
  id: 'school',
  code: 'LEVEL 188',
  name: '黄昏の校舎',
  en: 'After-School Hallways',
  tags: ['郷愁', '夕暮れ'],
  danger: 2,
  art: { c1: '#f0a068', c2: '#3b2e4a', c3: '#ffd9a0' },
  desc: '誰もいない放課後の廊下に、西日が長く差しこむ。チャイムが鳴れば、見回りの時間だ。',
  goal: '日が沈む前に記憶の欠片を 3 つ集め、昇降口を目指す。',
  tip: '約 2 分半で下校のチャイムが鳴り、見回りが始まる。廊下は走らないこと。',
  fragmentColor: 0xffe2b8,
  memories: ['日直で最後まで残った教室の、チョークの粉', '夕方の校内放送と、遠くの吹奏楽部', '好きだった人の上履きの名前'],
  clearLine: '昇降口を出ると、校庭には誰もいなかった。空だけが、まだ少し明るかった。',

  build(world) {
    const rng = world.rng;
    const W = 46;
    const HH = 30;
    const cs = 2.2;
    const g = (world.grid = new Grid(W, HH, cs, WALL));
    const corridors = [[3, 4], [14, 15], [25, 26]];
    for (const [a, b] of corridors) g.fillRect(2, a, W - 3, b, FLOOR);
    const mid = 22 + rng.int(-3, 3);
    for (const c of [2, mid, W - 4]) g.fillRect(c, 3, c + 1, 26, FLOOR);

    const rooms = [];
    const bands = [[6, 12], [17, 23]];
    for (const [j0, j1] of bands) {
      for (const [s0, s1] of [[5, mid - 2], [mid + 3, W - 6]]) {
        let i = s0;
        while (i <= s1) {
          let w = rng.int(6, 8);
          if (s1 - (i + w - 1) < 5) w = s1 - i + 1;
          const i1 = Math.min(s1, i + w - 1);
          g.fillRect(i, j0, i1, j1, FLOOR);
          rooms.push({ i0: i, i1, j0, j1 });
          // doorway(s) to the corridors above/below
          const dx = rng.int(i + 1, i1 - 1);
          g.set(dx, j0 - 1, DOORWAY);
          if (rng.chance(0.6)) g.set(rng.int(i + 1, i1 - 1), j1 + 1, DOORWAY);
          i = i1 + 2;
        }
      }
    }
    const si = 3;
    const sj = 4;
    g.sealUnreachable(si, sj);
    const sp = g.center(si, sj);
    world.spawn = { x: sp.x - cs / 2, z: sp.z, yaw: -Math.PI / 2 };

    const outer = (i, j) => j <= 2 || j >= HH - 3 || i <= 1 || i >= W - 2;
    const wallMat = new THREE.MeshStandardMaterial({ map: schoolWall(), roughness: 0.9 });
    const winTex = schoolWindow();
    const winMat = new THREE.MeshStandardMaterial({ map: winTex, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.95, roughness: 0.4 });
    mesh(world, buildWallFaces(g, { y0: 0, y1: H, uScale: cs, vScale: H, solid: (c, i, j) => c === WALL && !outer(i, j) }), wallMat);
    mesh(world, buildWallFaces(g, { y0: 0, y1: H, uScale: cs, vScale: H, solid: (c, i, j) => c === WALL && outer(i, j) }), winMat);
    mesh(world, buildWallFaces(g, { y0: LINTEL, y1: H, uScale: cs, vScale: H, solid: (c) => c === DOORWAY, open: (c) => c === FLOOR }), wallMat);
    mesh(world, buildCellQuads(g, (c) => c === DOORWAY, LINTEL, false, 2), new THREE.MeshStandardMaterial({ color: 0xcfc3a6 }));
    const floorMat = new THREE.MeshStandardMaterial({ map: linoleum(), roughness: 0.35, metalness: 0.05 });
    mesh(world, worldPlane(0, 0, W * cs, HH * cs, 0, true, 2.4), floorMat);
    mesh(world, worldPlane(0, 0, W * cs, HH * cs, H, false, 3), new THREE.MeshStandardMaterial({ map: plainNoise('school-ceil', [222, 214, 196], 0.06), roughness: 1 }));

    // sunlight falling through the windows onto the floor
    const patchMat = new THREE.MeshBasicMaterial({ map: sunPatch(), color: 0xffa860, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
    const winMounts = wallMounts(g).filter((m) => outer(m.i - m.nx, m.j - m.nz));
    for (const m of winMounts) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(cs * 0.95, 2.6), patchMat);
      p.rotation.x = -Math.PI / 2;
      const grp = new THREE.Group();
      grp.add(p);
      p.position.set(0, 0.01, 1.35);
      grp.position.set(m.x, 0, m.z);
      grp.rotation.y = Math.atan2(m.nx, m.nz);
      world.root.add(grp);
    }

    // classrooms: desks, chairs and a chalkboard
    const deskTop = new THREE.MeshStandardMaterial({ color: 0xc89b62, roughness: 0.6 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x5d6a63, roughness: 0.5, metalness: 0.5 });
    const desks = [];
    const chairs = [];
    const emptyRoom = rng.int(0, rooms.length - 1);
    rooms.forEach((r, n) => {
      const x0 = r.i0 * cs;
      const x1 = (r.i1 + 1) * cs;
      const z0 = r.j0 * cs;
      const z1 = (r.j1 + 1) * cs;
      const board = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.4), new THREE.MeshStandardMaterial({ map: chalkboard(), roughness: 0.9 }));
      board.position.set(x0 + 0.03, 1.6, (z0 + z1) / 2);
      board.rotation.y = Math.PI / 2;
      world.root.add(board);
      if (n === emptyRoom) return;
      for (let z = z0 + 2.4; z < z1 - 1.6; z += 1.45) {
        for (let x = x0 + 3.2; x < x1 - 1.4; x += 1.35) {
          if (rng.chance(0.08)) continue;
          const jit = rng.float(-0.08, 0.08);
          desks.push([x + jit, z, rng.float(-0.06, 0.06)]);
          chairs.push([x + jit + rng.float(-0.05, 0.05), z + 0.5 + rng.float(0, 0.15), rng.float(-0.25, 0.25)]);
          world.addBox(x + jit - 0.32, z - 0.24, x + jit + 0.32, z + 0.24);
        }
      }
    });
    const deskGeo = new THREE.BoxGeometry(0.64, 0.04, 0.46);
    const seatGeo = new THREE.BoxGeometry(0.4, 0.04, 0.38);
    const backGeo = new THREE.BoxGeometry(0.4, 0.3, 0.03);
    const inst = (geo, material, list, fn) => {
      const im = new THREE.InstancedMesh(geo, material, Math.max(1, list.length));
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const e = new THREE.Euler();
      list.forEach((d, k) => {
        const [pos, rot, scl] = fn(d);
        m4.compose(pos, q.setFromEuler(e.set(0, rot, 0)), scl);
        im.setMatrixAt(k, m4);
      });
      im.count = list.length;
      world.root.add(im);
    };
    const one = new THREE.Vector3(1, 1, 1);
    inst(deskGeo, deskTop, desks, ([x, z, r]) => [new THREE.Vector3(x, 0.72, z), r, one]);
    inst(new THREE.BoxGeometry(0.04, 0.7, 0.04), metal, desks.flatMap(([x, z, r]) => [[x - 0.28, z - 0.19, r], [x + 0.28, z - 0.19, r], [x - 0.28, z + 0.19, r], [x + 0.28, z + 0.19, r]]), ([x, z, r]) => [new THREE.Vector3(x, 0.35, z), r, one]);
    inst(seatGeo, deskTop, chairs, ([x, z, r]) => [new THREE.Vector3(x, 0.42, z), r, one]);
    inst(backGeo, deskTop, chairs, ([x, z, r]) => [new THREE.Vector3(x - Math.sin(r) * 0.18, 0.62, z + Math.cos(r) * 0.18), r, one]);
    inst(new THREE.BoxGeometry(0.03, 0.42, 0.03), metal, chairs.flatMap(([x, z, r]) => [[x - 0.17, z - 0.16, r], [x + 0.17, z - 0.16, r], [x - 0.17, z + 0.16, r], [x + 0.17, z + 0.16, r]]), ([x, z, r]) => [new THREE.Vector3(x, 0.21, z), r, one]);

    // lighting: warm sky light now, fluorescent tubes after dusk
    const hemi = new THREE.HemisphereLight(0xffcfa6, 0x9a7460, 1.0);
    world.root.add(hemi);
    const sun = new THREE.DirectionalLight(0xffa35c, 1.3);
    sun.position.set(-30, 12, 50);
    world.root.add(sun);
    const pool = ceilingFixtures(world, {
      every: 3, offset: 1, y: H - 0.02, size: [1.3, 0.25], color: 0xdff7ea, panelColor: [0.25, 0.25, 0.25],
      intensity: 0, distance: 10, flicker: 0.15, dead: 0.2,
      filter: (c, i, j) => corridors.some(([a, b]) => j >= a && j <= b) || [2, mid, W - 4].includes(i),
    });

    // dust motes in the light
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

    const fog = new THREE.FogExp2(0xc98a66, 0.03);
    Object.assign(world.env, {
      background: 0xc98a66,
      fog,
      exposure: 1.05,
      postfx: { bloom: 0.5, bloomThreshold: 0.78, bloomRadius: 0.6, grain: 0.06, vignette: 0.36, chroma: 0.0016, scan: 0.03, tint: [1.07, 0.98, 0.9] },
      ambience: 'school',
      reverb: [2.2, 3],
      sanityRegen: 1,
    });
    world.surfaceFn = () => 'wood';

    // dusk timeline
    const dayFog = new THREE.Color(0xc98a66);
    const nightFog = new THREE.Color(0x0f1220);
    const dayHemi = new THREE.Color(0xffcfa6);
    const nightHemi = new THREE.Color(0x46507a);
    const dayGround = new THREE.Color(0x9a7460);
    const nightGround = new THREE.Color(0x1c1a26);
    const dayWin = new THREE.Color(1, 1, 1);
    const nightWin = new THREE.Color(0.18, 0.2, 0.42);
    let t = world.attract ? DUSK * 0.15 : 0;
    let night = false;
    world.env.extraDrain = () => (night ? 0.25 : 0);
    world.onUpdate = (dt, ctx) => {
      if (!ctx.attract) t += dt;
      const k = Math.min(1, t / DUSK);
      const e = k * k;
      fog.color.copy(dayFog).lerp(nightFog, e);
      fog.density = 0.03 + e * 0.035;
      ctx.game.scene.background?.copy?.(fog.color);
      hemi.color.copy(dayHemi).lerp(nightHemi, e);
      hemi.groundColor.copy(dayGround).lerp(nightGround, e);
      hemi.intensity = 1.0 - e * 0.72;
      sun.intensity = 1.3 * (1 - e);
      winMat.emissive.copy(dayWin).lerp(nightWin, e);
      patchMat.opacity = 0.55 * (1 - e);
      dustMat.opacity = 0.8 * (1 - e * 0.8);
      const cam = ctx.camera.position;
      const arr = dGeo.attributes.position.array;
      for (let n = 0; n < dustN; n++) {
        arr[n * 3 + 1] += Math.sin(t * 0.3 + n) * dt * 0.05;
        arr[n * 3] += dt * 0.03;
      }
      dGeo.attributes.position.needsUpdate = true;
      dust.position.set(Math.round(cam.x / 16) * 16, 0, Math.round(cam.z / 16) * 16);
      if (!night && k >= 1 && !ctx.attract) {
        night = true;
        pool.baseIntensity = 3.2;
        pool.baseColor.setRGB(1.5, 1.6, 1.5);
        ctx.game.audio.chime();
        ctx.game.toast('下校のチャイムが鳴った', '……見回りの足音が近づいてくる', 'danger');
        spawnTeacher(ctx);
      }
    };

    const d = g.distances(si, sj);
    const spawnTeacher = (ctx) => {
      const [pi, pj] = g.cellOf(ctx.player.pos.x, ctx.player.pos.z);
      const dp = g.distances(pi, pj);
      const far = [];
      for (let k = 0; k < dp.length; k++) if (dp[k] > 22) far.push([k % W, (k / W) | 0]);
      if (!far.length) for (let k = 0; k < dp.length; k++) if (dp[k] > 8) far.push([k % W, (k / W) | 0]);
      const teacher = new Wanderer(world, rng.pick(far), {
        name: '見回りの先生',
        catchTitle: '見回りの先生に見つかった',
        catchLine: '「下校時刻はとっくに過ぎていますよ」肩に置かれた手は、ひどく冷たかった。',
        look: { body: 0x0b0b12, coat: true, height: 2.3 },
        speeds: { roam: 1.4, investigate: 2.5, chase: 4.1 },
        grace: 6,
      });
      teacher.onChase = () => {
        ctx.game.audio.stinger();
        ctx.game.toast('「こら、そこの生徒！」', '廊下の角を曲がって振り切れ', 'danger');
      };
      world.add(teacher);
    };

    // residents: shadow students who stayed behind
    const lines = [
      [
        ['……あ、まだ残ってたの？', 'もうすぐ下校のチャイムが鳴るよ。鳴ったら、見回りの先生が来る。', '先生に見つかったら、ずっと居残りなんだって。'],
        ['欠片はね、夕日が差してるうちに探したほうがいいよ。', '暗くなったら走っちゃだめ。廊下は走らない、でしょ？'],
        ['わたしはここで待ってるの。誰を待ってるのかは、もう忘れちゃったけど。'],
      ],
      [
        ['昇降口はね、欠片がそろわないと開かないんだ。', 'ぼくは三つめがどうしても見つからなくて……それから、ずっとここにいる。'],
        ['地図を見るといいよ。歩いたところはちゃんと覚えてくれるから。'],
      ],
    ];
    const roomOrder = rooms
      .map((r) => ({ r, k: d[(r.j0 + 1) * W + r.i0 + 1] }))
      .filter((o) => o.k > 0)
      .sort((a, b) => a.k - b.k);
    [roomOrder[0], roomOrder[Math.floor(roomOrder.length / 2)]].forEach((o, n) => {
      if (!o) return;
      const r = o.r;
      const x = (r.i0 + 1.5) * cs;
      const z = (r.j0 + 1.2) * cs;
      const model = studentModel();
      model.position.set(x, 0, z);
      model.rotation.y = -Math.PI / 2;
      const npc = new NPC(world, { name: '居残りの生徒', pos: model.position.clone(), model, voice: 1.25 - n * 0.2, radius: 0.3, conversations: lines[n] });
      npc.aimHeight = 1.2;
      world.add(npc);
    });
  },

  makeExit() {
    return doorModel({
      width: 1.5,
      height: 2.2,
      doorColor: 0x9fb2ae,
      frameColor: 0x6b7470,
      lightColor: 0xffc58a,
      knob: 0xd0d0c8,
      extras(group) {
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.18), new THREE.MeshBasicMaterial({ map: labelTexture('昇降口', { w: 256, h: 64, bg: '#f2efe4', fg: '#2b2b2b', font: '38px "DotGothic16", monospace' }) }));
        plate.position.set(0, 2.45, 0.03);
        group.add(plate);
      },
    });
  },
};
