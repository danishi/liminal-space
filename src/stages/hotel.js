import * as THREE from 'three';
import { Grid, FLOOR, WALL, wallMounts, DIRS } from '../core/grid.js';
import { hotelCarpet, hotelWallpaper, wood, plainNoise, hotelDoor, labelTexture } from '../core/textures.js';
import { buildShell, glow } from './common.js';
import { LightPool } from '../core/lights.js';
import { Smiler } from '../entities/creatures.js';
import { NPC } from '../entities/npc.js';

const H = 2.6;

function carveMaze(g, rng) {
  // recursive backtracker on odd coordinates
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
  // braid: open most dead ends so there are loops to escape through
  for (let j = 1; j < g.h - 1; j += 2) {
    for (let i = 1; i < g.w - 1; i += 2) {
      if (g.countSolidNeighbors(i, j) < 3 || !rng.chance(0.65)) continue;
      const opts = DIRS.filter(([dx, dy]) => {
        const wi = i + dx;
        const wj = j + dy;
        return g.get(wi, wj) === WALL && wi > 0 && wj > 0 && wi < g.w - 1 && wj < g.h - 1;
      });
      if (opts.length) {
        const [dx, dy] = rng.pick(opts);
        g.set(i + dx, j + dy, FLOOR);
      }
    }
  }
}

function bellboyModel() {
  const g = new THREE.Group();
  const ghost = (color) => new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.55, emissive: 0x5f7cff, emissiveIntensity: 0.35, roughness: 0.6, depthWrite: false });
  const red = ghost(0x8a2432);
  const dark = ghost(0x25283a);
  const skin = ghost(0xb9c4e8);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.75, 12), red);
  body.position.y = 1.1;
  g.add(body);
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.75, 12), dark);
  legs.position.y = 0.38;
  g.add(legs);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 12), skin);
  head.position.y = 1.65;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 14), red);
  cap.position.set(0.02, 1.8, 0);
  cap.rotation.z = 0.15;
  g.add(cap);
  for (const x of [-0.26, 0.26]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.5, 4, 8), red);
    arm.position.set(x, 1.1, 0.05);
    g.add(arm);
  }
  const buttons = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.5, 0.01), new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.8 }));
  buttons.position.set(0, 1.12, 0.22);
  g.add(buttons);
  const halo = glow(0x8fa6ff, 2.4, 0.25);
  halo.position.y = 1.1;
  g.add(halo);
  return g;
}

function sconce() {
  const g = new THREE.Group();
  const brass = new THREE.MeshStandardMaterial({ color: 0x8a6a2e, metalness: 0.8, roughness: 0.35 });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.03), brass);
  g.add(plate);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6), brass);
  arm.rotation.x = Math.PI / 2;
  arm.position.set(0, 0, 0.08);
  g.add(arm);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.16, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xf2d9a6, emissive: 0xffb45a, emissiveIntensity: 1.4, side: THREE.DoubleSide, roughness: 0.9 }));
  shade.position.set(0, 0.08, 0.16);
  g.add(shade);
  g.userData.shade = shade;
  return g;
}

function elevatorModel() {
  const group = new THREE.Group();
  const brass = new THREE.MeshStandardMaterial({ color: 0x9b7a3a, metalness: 0.85, roughness: 0.3 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.9, roughness: 0.35 });
  const W = 1.3;
  const HH = 2.2;
  const frame = [
    [0.12, HH + 0.12, -W / 2 - 0.06, (HH + 0.12) / 2],
    [0.12, HH + 0.12, W / 2 + 0.06, (HH + 0.12) / 2],
  ];
  for (const [w, h, x, y] of frame) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), brass);
    m.position.set(x, y, 0.05);
    group.add(m);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(W + 0.24, 0.12, 0.1), brass);
  top.position.set(0, HH + 0.06, 0.05);
  group.add(top);
  const insideMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.06, 0.05, 0.04) });
  const inside = new THREE.Mesh(new THREE.PlaneGeometry(W, HH), insideMat);
  inside.position.set(0, HH / 2, 0.01);
  group.add(inside);
  const doors = [];
  for (const s of [-1, 1]) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(W / 2, HH, 0.04), steel);
    d.position.set((s * W) / 4, HH / 2, 0.04);
    group.add(d);
    doors.push({ mesh: d, s });
  }
  // floor indicator
  const indMat = new THREE.MeshBasicMaterial({ map: labelTexture('▼ B', { w: 128, h: 48, bg: '#1a0e05', fg: '#ffb347', font: '30px "DotGothic16", monospace' }) });
  indMat.color.setScalar(0.3);
  const ind = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.15), indMat);
  ind.position.set(0, HH + 0.3, 0.06);
  group.add(ind);
  const btnMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.2, 0.08) });
  const btn = new THREE.Mesh(new THREE.CircleGeometry(0.04, 16), btnMat);
  btn.position.set(W / 2 + 0.3, 1.15, 0.03);
  group.add(btn);
  const light = glow(0xffe2b0, 3, 0);
  light.position.set(0, 1.2, 0.5);
  group.add(light);
  let open = 0;
  return {
    group,
    update(dt, time, unlocked) {
      if (!unlocked) return;
      indMat.color.setScalar(1.6);
      btnMat.color.setRGB(2.2, 1.5, 0.6);
      open = Math.min(1, open + dt * 0.45);
      for (const d of doors) d.mesh.position.x = (d.s * W) / 4 + d.s * open * (W / 2 - 0.02);
      insideMat.color.setRGB(0.06 + open * 1.7, 0.05 + open * 1.45, 0.04 + open * 1.1);
      light.material.opacity = open * 0.6;
    },
  };
}

export default {
  id: 'hotel',
  code: 'LEVEL 11',
  name: '深夜のホテル',
  en: 'The Endless Hotel',
  tags: ['ダーク', '不気味'],
  danger: 3,
  art: { c1: '#3b1216', c2: '#07080a', c3: '#b98a3e' },
  desc: '赤い絨毯の廊下が、どこまでも曲がり続ける。明かりの消えた部屋の奥で、何かが笑っている。',
  goal: '記憶の欠片を 3 つ集め、動いているエレベーターを探す。',
  tip: '暗闇では正気が削れる。F で懐中電灯。笑う顔には光を当て続けろ。',
  fragmentColor: 0xffc98a,
  memories: ['修学旅行の夜、消灯後の旅館の廊下', '真夜中の自動販売機の、白くて冷たい光', '誰かが廊下の向こうで、ずっとノックしていた音'],
  clearLine: 'エレベーターが静かに下りていく。表示はずっと「B」のままだった。',

  build(world) {
    const rng = world.rng;
    const W = 31;
    const cs = 2.3;
    const g = (world.grid = new Grid(W, W, cs, WALL));
    carveMaze(g, rng);
    // a few small lobbies
    for (let r = 0; r < 4; r++) {
      const i = rng.int(2, W - 6) | 1;
      const j = rng.int(2, W - 6) | 1;
      g.fillRect(i, j, Math.min(W - 2, i + 2), Math.min(W - 2, j + 2), FLOOR);
    }
    const si = 1;
    const sj = 1;
    g.sealUnreachable(si, sj);
    const sp = g.center(si, sj);
    world.spawn = { x: sp.x, z: sp.z, yaw: g.walkable(2, 1) ? -Math.PI / 2 : Math.PI };

    const wallMat = new THREE.MeshStandardMaterial({ map: hotelWallpaper(), roughness: 0.85 });
    const woodMat = new THREE.MeshStandardMaterial({ map: wood('hotel-wood', [70, 38, 24]), roughness: 0.55 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0x5a3421, roughness: 0.45 });
    buildShell(world, {
      height: H,
      wall: { mat: wallMat, u: 2.2, v: 2.2 },
      floor: { mat: new THREE.MeshStandardMaterial({ map: hotelCarpet(), roughness: 1 }), uv: 2.2 },
      ceil: { mat: new THREE.MeshStandardMaterial({ map: plainNoise('hotel-ceil', [150, 136, 112], 0.1), roughness: 1 }), uv: 3 },
      trims: [
        { mat: woodMat, y0: 0, y1: 0.95, inset: 0.02, u: 1, v: 1, top: true },
        { mat: railMat, y0: 0.93, y1: 1.02, inset: 0.035, top: true },
        { mat: railMat, y0: H - 0.12, y1: H, inset: 0.03 },
      ],
    });
    world.root.add(new THREE.HemisphereLight(0x3a2f36, 0x120808, 0.35));

    // room doors along the corridors
    const mounts = rng.shuffle(wallMounts(g));
    const used = (world.usedMounts = new Set());
    const doorCells = new Set();
    let number = 101;
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x2b1a10, roughness: 0.6 });
    for (const m of mounts) {
      if (doorCells.size >= 44) break;
      const key = `${m.i},${m.j}`;
      if (doorCells.has(key) || [...doorCells].some((k) => { const [a, b] = k.split(',').map(Number); return Math.abs(a - m.i) + Math.abs(b - m.j) < 2; })) continue;
      if (!rng.chance(0.5)) continue;
      doorCells.add(key);
      used.add(`${m.i},${m.j},${m.nx},${m.nz}`);
      const door = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 2.1), new THREE.MeshStandardMaterial({ map: hotelDoor(number), roughness: 0.6 }));
      number += rng.int(1, 3);
      if (number % 100 > 40) number = (Math.floor(number / 100) + 1) * 100 + 1;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.2, 0.03), frameMat);
      const grp = new THREE.Group();
      frame.position.set(0, 1.1, 0.03);
      door.position.set(0, 1.05, 0.05);
      grp.add(frame, door);
      grp.position.set(m.x, 0, m.z);
      grp.rotation.y = Math.atan2(m.nx, m.nz);
      world.root.add(grp);
    }

    // wall sconces, managed by a light pool
    const pool = new LightPool(world.root, world.lightCount, { color: 0xffb060, intensity: 3.2, distance: 7, decay: 1.7 });
    world.lightPool = pool;
    const sconceCells = new Set();
    const shades = [];
    for (const m of rng.shuffle(wallMounts(g))) {
      const key = `${m.i},${m.j}`;
      if (sconceCells.has(key) || used.has(`${m.i},${m.j},${m.nx},${m.nz}`)) continue;
      if ([...sconceCells].some((k) => { const [a, b] = k.split(',').map(Number); return Math.abs(a - m.i) + Math.abs(b - m.j) < 3; })) continue;
      sconceCells.add(key);
      used.add(`${m.i},${m.j},${m.nx},${m.nz}`);
      const s = sconce();
      s.position.set(m.x + m.nx * 0.02, 1.85, m.z + m.nz * 0.02);
      s.rotation.y = Math.atan2(m.nx, m.nz);
      world.root.add(s);
      const dead = rng.chance(0.4);
      const fx = pool.add({
        pos: new THREE.Vector3(m.x + m.nx * 0.35, 2.1, m.z + m.nz * 0.35),
        flicker: !dead && rng.chance(0.25) ? rng.float(0.05, 0.3) : 0,
        dead,
      });
      shades.push({ mat: s.userData.shade.material, fx });
      if (dead) s.userData.shade.material.emissiveIntensity = 0.02;
    }

    Object.assign(world.env, {
      background: 0x020202,
      fog: new THREE.FogExp2(0x030203, 0.085),
      exposure: 1.15,
      postfx: { bloom: 0.5, bloomThreshold: 0.7, bloomRadius: 0.5, grain: 0.1, vignette: 0.55, chroma: 0.0025, scan: 0.045, tint: [1.05, 0.95, 0.9] },
      ambience: 'hotel',
      reverb: [1.4, 3.5],
      flashlight: true,
      flashlightOn: true,
      flashlightIntensity: 42,
      flashlightDistance: 20,
      batteryDrain: 0.8,
      darkness: 1,
      sanityRegen: 0.4,
    });
    world.surfaceFn = () => 'carpet';
    world.onUpdate = () => {
      for (const s of shades) if (!s.fx.dead) s.mat.emissiveIntensity = 0.1 + s.fx.level * 1.3;
    };

    // resident: the night bellboy, waiting near the start
    const d = g.distances(si, sj);
    const near = g.openCells().filter(([i, j]) => {
      const k = d[j * W + i];
      return k >= 3 && k <= 6;
    });
    if (near.length) {
      const [i, j] = rng.pick(near);
      const c = g.center(i, j);
      const model = bellboyModel();
      model.position.set(c.x, 0, c.z);
      const npc = new NPC(world, {
        name: 'ベルボーイ',
        pos: model.position.clone(),
        model,
        voice: 0.9,
        radius: 0.35,
        conversations: [
          [
            '……いらっしゃいませ。ご予約のお客様でしょうか。',
            '当館は現在、深夜営業のみとなっております。お足元が暗いので、懐中電灯をお使いください。',
            '記憶の欠片は、廊下のどこかに。そろいましたら、エレベーターが動きだします。',
          ],
          [
            'ひとつ、ご忠告を。',
            '暗がりで笑っている方がいらっしゃいます。あの方は、見られている間は動けません。',
            '光を当て続ければ、恥ずかしがってお帰りになります。電池の残りにはお気をつけて。',
          ],
          ['当館のご利用、まことにありがとうございます。……チェックアウトは、いつでも結構ですよ。'],
        ],
      });
      npc.idle = (dt) => {
        model.position.y = 0.05 + Math.sin(npc.t * 1.4) * 0.04;
      };
      world.add(npc);
    }

    if (!world.attract) {
      let max = 0;
      for (let k = 0; k < d.length; k++) max = Math.max(max, d[k]);
      const far = [];
      for (let k = 0; k < d.length; k++) if (d[k] > max * 0.6) far.push([k % W, (k / W) | 0]);
      world.add(new Smiler(world, rng.pick(far), { grace: 35 }));
    }
  },

  pickExitMount(world, mounts) {
    const free = mounts.filter((m) => !world.usedMounts.has(`${m.i},${m.j},${m.nx},${m.nz}`));
    return free[Math.floor(world.rng.next() * Math.max(1, Math.floor(free.length * 0.05)))] || mounts[0];
  },

  makeExit(world) {
    const model = elevatorModel();
    model.onUnlock = () => world.game.audio.ding();
    return model;
  },
};
