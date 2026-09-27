import * as THREE from 'three';
import { Grid, FLOOR, WALL, VOID, buildWallFaces, buildCellQuads, worldPlane } from '../core/grid.js';
import { pastelChecker, softGrain, cloudSprite, glowSprite } from '../core/textures.js';
import { mesh, doorModel, glow } from './common.js';
import { NPC } from '../entities/npc.js';

const WALL_H = 3.4;
const COLORS = [0xf6b8cf, 0xcdb8f0, 0xb6e8d2, 0xfbe6a2, 0xb8dcf6];

const MOCHI_TALK = [
  [['こんにちは！ きみ、あたらしい子？', '欠片はね、きらきら光ってるの。空までのびる光の柱をさがしてごらん。']],
  [['ここはずっと午後三時。', 'おやつの時間が、ずっとおわらないんだよ。いいでしょ？'], ['……いいでしょ？']],
  [['扉はね、欠片をぜんぶ集めると開くんだって。', 'だれが決めたのかは、だれも知らないの。']],
  [['きみ、どこから来たの？', '……そっか。みんな、はじめはそう言うんだ。']],
  [['わたしたち、前はきみと同じ形だった気がするの。', 'でも、まるいほうが楽だよ。ころころできるし。']],
  [['雲の上に、階段がつづいてるでしょ。', 'のぼってもどこにも行けないよ。でも、のぼりたくなるよね。']],
  [['地図を見てごらん。M のボタンか、「地図」を押すの。', '歩いたところだけ、ちゃんと描かれていくんだよ。']],
];

function mochiModel(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 24, 16),
    new THREE.MeshStandardMaterial({ color, roughness: 0.45, emissive: color, emissiveIntensity: 0.12 }),
  );
  body.scale.set(1, 0.78, 1);
  body.position.y = 0.35;
  body.castShadow = true;
  g.add(body);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x2b2130 });
  for (const x of [-0.14, 0.14]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), eyeMat);
    e.scale.set(1, 1.4, 0.5);
    e.position.set(x, 0.08, 0.43);
    body.add(e);
    const blush = new THREE.Mesh(new THREE.CircleGeometry(0.06, 14), new THREE.MeshBasicMaterial({ color: 0xff8fb0, transparent: true, opacity: 0.7 }));
    blush.position.set(x * 1.45, -0.02, 0.425);
    blush.rotation.y = x * 1.4;
    body.add(blush);
  }
  const shine = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
  shine.position.set(-0.18, 0.25, 0.28);
  body.add(shine);
  g.userData.body = body;
  return g;
}

function skyDome() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x9ec3ff) },
      mid: { value: new THREE.Color(0xf8cde2) },
      low: { value: new THREE.Color(0xfde8d6) },
      sunDir: { value: new THREE.Vector3(0.4, 0.35, -0.85).normalize() },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 top, mid, low, sunDir; varying vec3 vDir;
      void main(){
        float h = vDir.y;
        vec3 c = mix(mid, top, smoothstep(0.05, 0.7, h));
        c = mix(low, c, smoothstep(-0.2, 0.08, h));
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
  id: 'pastel',
  code: 'LEVEL 3.14',
  name: 'パステルの夢',
  en: 'Pastel Dreamscape',
  tags: ['明るい', 'ファンシー'],
  danger: 0,
  art: { c1: '#f7c6dc', c2: '#b8c6f5', c3: '#fff6d8' },
  desc: 'わたあめ色の空、行き先のない階段、ひとりでに浮かぶかたち。まるい住人たちが暮らしている。',
  goal: '記憶の欠片を 3 つ集め、虹色の扉を探す。',
  tip: 'まるい住人たちは話しかけるとヒントをくれる。危険はない……はず。',
  fragmentColor: 0xffd6f4,
  memories: ['幼稚園の帰りに見た、ピンク色の夕焼け', '誕生日に割れてしまった、ハート型の風船', '夢の中で何度も訪れた、名前のない遊園地'],
  clearLine: '甘い匂いのする風が吹いた。目を開けると、まだ少しだけ空がピンク色だった。',

  build(world) {
    const rng = world.rng;
    const W = 40;
    const cs = 2.5;
    const g = (world.grid = new Grid(W, W, cs, FLOOR));
    g.border(VOID);
    const colorOf = new Int8Array(W * W).fill(-1);
    for (let s = 0; s < 46; s++) {
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
    g.sealUnreachable(si, sj);
    const sp = g.center(si, sj);
    world.spawn = { x: sp.x, z: sp.z, yaw: rng.float(0, Math.PI * 2) };

    // walls, one mesh per colour
    COLORS.forEach((color, n) => {
      const m = new THREE.MeshStandardMaterial({ color, map: softGrain(), roughness: 0.6 });
      const solid = (c, i, j) => c === WALL && colorOf[j * W + i] === n;
      const open = (c) => c !== WALL;
      mesh(world, buildWallFaces(g, { y0: 0, y1: WALL_H, uScale: 3, vScale: 3, solid, open }), m, { cast: true, receive: true });
      mesh(world, buildCellQuads(g, solid, WALL_H, true, 3), m, { cast: true });
    });
    // sealed-off pockets become walls with no colour; paint them with the first colour
    const grey = new THREE.MeshStandardMaterial({ color: COLORS[0], map: softGrain(), roughness: 0.6 });
    const orphan = (c, i, j) => c === WALL && colorOf[j * W + i] === -1;
    mesh(world, buildWallFaces(g, { y0: 0, y1: WALL_H, uScale: 3, vScale: 3, solid: orphan, open: (c) => c !== WALL }), grey, { cast: true, receive: true });
    mesh(world, buildCellQuads(g, orphan, WALL_H, true, 3), grey);

    const floorMat = new THREE.MeshStandardMaterial({ map: pastelChecker(), roughness: 0.35, metalness: 0.05 });
    mesh(world, worldPlane(-60, -60, W * cs + 60, W * cs + 60, 0, true, 4), floorMat, { receive: true });
    world.root.add(skyDome());

    // lights
    const hemi = new THREE.HemisphereLight(0xfff2fa, 0xe9b9d0, 1.0);
    world.root.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0e0, 1.8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 90;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.03;
    world.root.add(sun, sun.target);

    // props with colliders
    const rand = () => {
      for (let k = 0; k < 50; k++) {
        const i = rng.int(3, W - 4);
        const j = rng.int(3, W - 4);
        if (Math.abs(i - si) < 4 && Math.abs(j - sj) < 4) continue;
        if (g.walkable(i, j) && g.walkable(i + 1, j) && g.walkable(i, j + 1) && g.walkable(i - 1, j) && g.walkable(i, j - 1)) return g.center(i, j);
      }
      return null;
    };
    const pmat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 });
    // arches
    for (let a = 0; a < 7; a++) {
      const p = rand();
      if (!p) continue;
      const col = pmat(rng.pick(COLORS));
      const yaw = rng.chance(0.5) ? 0 : Math.PI / 2;
      const arch = new THREE.Group();
      const span = 1.6;
      for (const s of [-1, 1]) {
        const pil = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.6, 0.5), col);
        pil.position.set(s * span, 1.3, 0);
        pil.castShadow = true;
        arch.add(pil);
      }
      const top = new THREE.Mesh(new THREE.TorusGeometry(span, 0.25, 12, 32, Math.PI), col);
      top.position.y = 2.6;
      top.castShadow = true;
      arch.add(top);
      arch.position.set(p.x, 0, p.z);
      arch.rotation.y = yaw;
      world.root.add(arch);
      for (const s of [-1, 1]) {
        const ox = yaw === 0 ? s * span : 0;
        const oz = yaw === 0 ? 0 : -s * span;
        world.addBox(p.x + ox - 0.25, p.z + oz - 0.25, p.x + ox + 0.25, p.z + oz + 0.25);
      }
    }
    // stairs to nowhere
    for (let a = 0; a < 5; a++) {
      const p = rand();
      if (!p) continue;
      const col = pmat(rng.pick(COLORS));
      const st = new THREE.Group();
      const steps = rng.int(5, 9);
      for (let k = 0; k < steps; k++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.3, 0.4), col);
        b.position.set(0, 0.15 + k * 0.3, -k * 0.4);
        b.castShadow = true;
        b.receiveShadow = true;
        st.add(b);
      }
      const yaw = rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
      st.position.set(p.x, 0, p.z);
      st.rotation.y = yaw;
      world.root.add(st);
      const len = steps * 0.4;
      const cx = p.x - Math.sin(yaw) * (len / 2 - 0.2);
      const cz = p.z - Math.cos(yaw) * (len / 2 - 0.2);
      world.addFootprint(cx, cz, 1.4, len, yaw);
    }
    // freestanding doors
    for (let a = 0; a < 5; a++) {
      const p = rand();
      if (!p) continue;
      const d = doorModel({ doorColor: rng.pick(COLORS), frameColor: 0xffffff, lightColor: 0xffffff, knob: 0xffd86b });
      d.group.position.set(p.x, 0, p.z);
      const yaw = rng.pick([0, Math.PI / 2]);
      d.group.rotation.y = yaw;
      d.group.children.forEach((c) => (c.castShadow = true));
      world.root.add(d.group);
      world.addFootprint(p.x, p.z + 0.06, 1.2, 0.2, yaw);
    }
    // big resting spheres
    for (let a = 0; a < 6; a++) {
      const p = rand();
      if (!p) continue;
      const r = rng.float(0.6, 1.1);
      const s = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), new THREE.MeshStandardMaterial({ color: rng.pick(COLORS), roughness: 0.15, metalness: 0.1 }));
      s.position.set(p.x, r, p.z);
      s.castShadow = true;
      world.root.add(s);
      world.addBox(p.x - r * 0.8, p.z - r * 0.8, p.x + r * 0.8, p.z + r * 0.8);
    }

    // floating shapes (no collision)
    const floaters = [];
    const geos = [
      new THREE.TorusKnotGeometry(0.8, 0.25, 96, 12),
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.TorusGeometry(1, 0.3, 16, 40),
      new THREE.OctahedronGeometry(1, 0),
      new THREE.SphereGeometry(0.9, 24, 16),
    ];
    for (let a = 0; a < 26; a++) {
      const col = rng.pick(COLORS);
      const m = new THREE.Mesh(rng.pick(geos), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.25, roughness: 0.3, flatShading: rng.chance(0.4) }));
      m.position.set(rng.float(0, W * cs), rng.float(6, 16), rng.float(0, W * cs));
      m.scale.setScalar(rng.float(0.6, 2.2));
      m.userData = { y: m.position.y, sp: rng.float(0.1, 0.4), ph: rng.float(0, 6) };
      world.root.add(m);
      floaters.push(m);
    }
    // clouds
    const cloudMat = new THREE.SpriteMaterial({ map: cloudSprite(), color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, fog: false });
    const cloudMatNear = new THREE.SpriteMaterial({ map: cloudSprite(), color: 0xfff4fa, transparent: true, opacity: 0.95, depthWrite: false });
    const clouds = [];
    for (let a = 0; a < 40; a++) {
      const c = new THREE.Sprite(cloudMat);
      const ang = rng.float(0, Math.PI * 2);
      const r = rng.float(70, 150);
      c.position.set(W * cs / 2 + Math.cos(ang) * r, rng.float(12, 45), W * cs / 2 + Math.sin(ang) * r);
      const s = rng.float(25, 55);
      c.scale.set(s, s / 2, 1);
      world.root.add(c);
      clouds.push(c);
    }
    // cloud banks that hide the edge of the world
    for (let a = 0; a < 48; a++) {
      const c = new THREE.Sprite(cloudMatNear);
      const t = a / 48;
      const side = Math.floor(t * 4);
      const u = (t * 4) % 1;
      const L = W * cs;
      const pos = [[u * L, -3], [L + 3, u * L], [L - u * L, L + 3], [-3, L - u * L]][side];
      c.position.set(pos[0], rng.float(1.2, 2.5), pos[1]);
      const s = rng.float(9, 15);
      c.scale.set(s, s / 2, 1);
      world.root.add(c);
    }
    // bubbles drifting up around the player
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

    Object.assign(world.env, {
      background: 0xf8d9e6,
      fog: new THREE.Fog(0xf6d5e3, 26, 95),
      exposure: 0.95,
      toneMapping: THREE.NeutralToneMapping,
      postfx: { bloom: 0.32, bloomThreshold: 0.9, bloomRadius: 0.7, grain: 0.03, vignette: 0.2, chroma: 0.001, scan: 0.012, tint: [1.02, 0.99, 1.02] },
      ambience: 'dream',
      reverb: [2.4, 3],
      sanityRegen: 4,
      shadows: true,
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

    // residents
    const d = g.distances(si, sj);
    const spots = g.openCells().filter(([i, j]) => d[j * W + i] > 3 && g.countSolidNeighbors(i, j) === 0);
    rng.shuffle(spots);
    const talks = rng.shuffle([...MOCHI_TALK]);
    // the first resident sits close to the start so players meet one quickly
    spots.sort((a, b) => (d[a[1] * W + a[0]] < 8 ? -1 : 0) - (d[b[1] * W + b[0]] < 8 ? -1 : 0));
    for (let n = 0; n < 7 && n < spots.length; n++) {
      const [i, j] = spots[n];
      const c = g.center(i, j);
      const color = COLORS[n % COLORS.length];
      const model = mochiModel(color);
      model.position.set(c.x, 0, c.z);
      const home = model.position.clone();
      const npc = new NPC(world, {
        name: 'モチ',
        pos: model.position.clone(),
        model,
        voice: 1.8 + n * 0.08,
        radius: 0.45,
        conversations: talks[n % talks.length],
        onTalk: (game) => game.audio.boop(null, 1 + n * 0.05),
      });
      npc.aimHeight = 0.4;
      const body = model.userData.body;
      let target = null;
      let hop = 0;
      let wait = rng.float(0, 3);
      npc.idle = (dt, ctx) => {
        if (npc.talking) {
          hop = 0;
        } else if (wait > 0) {
          wait -= dt;
        } else {
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
            model.position.x += (dx / dist) * dt * 1.1;
            model.position.z += (dz / dist) * dt * 1.1;
            const before = model.position.clone();
            world.collide(model.position, 0.45);
            if (before.distanceTo(model.position) > 0.01) target = null;
            const far = ctx.attract || ctx.player.pos.distanceTo(model.position) > 6;
            if (far) npc.targetYaw = Math.atan2(dx, dz);
            if (ctx.attract) model.rotation.y = npc.targetYaw;
          }
        }
        const h = Math.abs(Math.sin(hop));
        model.position.y = h * 0.35;
        body.scale.set(1 + (1 - h) * 0.08, 0.78 - (1 - h) * 0.06 + h * 0.06, 1 + (1 - h) * 0.08);
      };
      world.add(npc);
    }
  },

  makeExit() {
    return doorModel({
      width: 1.3,
      height: 2.6,
      doorColor: 0xffffff,
      frameColor: 0xf6b8cf,
      lightColor: 0xfff0ff,
      knob: 0xffd86b,
      extras(group) {
        const rainbow = new THREE.Group();
        const cols = [0xff9aa2, 0xffdac1, 0xfff5ba, 0xb5ead7, 0xc7ceea];
        cols.forEach((c, k) => {
          const r = new THREE.Mesh(new THREE.TorusGeometry(1.25 - k * 0.1, 0.05, 8, 40, Math.PI), new THREE.MeshBasicMaterial({ color: c }));
          rainbow.add(r);
        });
        rainbow.position.set(0, 2.6, 0.08);
        group.add(rainbow);
        const sparkle = glow(0xffffff, 2.5, 0.0);
        sparkle.position.set(0, 3.2, 0.3);
        group.add(sparkle);
        return (open, time) => {
          rainbow.children.forEach((r, k) => r.material.color.setHSL((time * 0.1 + k * 0.12) % 1, 0.7, 0.8).multiplyScalar(open > 0 ? 1.8 : 1));
          sparkle.material.opacity = open * (0.5 + Math.sin(time * 3) * 0.2);
        };
      },
    });
  },
};
