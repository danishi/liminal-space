import * as THREE from 'three';
import { Grid, FLOOR, WALL } from '../core/grid.js';
import { backroomsWall, backroomsCarpet, backroomsCeiling, exitSign } from '../core/textures.js';
import { buildShell, ceilingFixtures, doorModel, glow } from './common.js';
import { Wanderer } from '../entities/creatures.js';
import { NPC, mat } from '../entities/npc.js';

const H = 2.7;

function survivorModel() {
  const g = new THREE.Group();
  const suit = mat(0xc4611f);
  const dark = mat(0x2a2a28);
  // sitting against the wall: torso, head with gas mask, bent legs
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.4, 4, 8), suit);
  torso.position.set(0, 0.62, -0.05);
  torso.rotation.x = -0.15;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), suit);
  head.position.set(0, 1.05, -0.02);
  g.add(head);
  const mask = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.12, 12), dark);
  mask.rotation.x = Math.PI / 2;
  mask.position.set(0, 1.0, 0.14);
  g.add(mask);
  for (const x of [-0.07, 0.07]) {
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.045, 12), new THREE.MeshStandardMaterial({ color: 0x9fb4b0, metalness: 0.6, roughness: 0.2 }));
    lens.position.set(x, 1.08, 0.155);
    g.add(lens);
  }
  for (const x of [-0.13, 0.13]) {
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.35, 4, 8), suit);
    thigh.rotation.x = Math.PI / 2 - 0.5;
    thigh.position.set(x, 0.38, 0.2);
    g.add(thigh);
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.35, 4, 8), suit);
    shin.rotation.x = 0.35;
    shin.position.set(x, 0.24, 0.48);
    g.add(shin);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.4, 4, 8), suit);
    arm.position.set(x * 2.1, 0.6, 0.08);
    arm.rotation.x = -0.6;
    g.add(arm);
  }
  // little lantern
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.7, 0.9) }));
  lantern.position.set(0.42, 0.08, 0.35);
  g.add(lantern);
  const l = glow(0xffc36b, 1.2, 0.5);
  l.position.copy(lantern.position);
  g.add(l);
  return g;
}

export default {
  id: 'backrooms',
  code: 'LEVEL 0',
  name: '黄色い部屋',
  en: 'The Backrooms',
  tags: ['無機質', '不穏'],
  danger: 2,
  art: { c1: '#b9a24c', c2: '#4b4221', c3: '#fff3b0' },
  desc: '湿ったカーペットと蛍光灯の唸り。どこまでも同じ黄色い部屋が続く。',
  goal: '記憶の欠片を 3 つ集め、緑に灯る EXIT を探す。',
  tip: '走ると足音で「何か」に気づかれる。蛍光灯のちらつきは接近の合図。',
  fragmentColor: 0xfff0a0,
  memories: ['夏休みの、誰もいない学習塾の廊下', '引っ越し前日の、家具のない部屋', '閉店後のショッピングモールで聞いた館内放送'],

  build(world) {
    const rng = world.rng;
    const W = 44;
    const cs = 2.6;
    const g = (world.grid = new Grid(W, W, cs, FLOOR));
    g.border();
    // scattered wall segments give the "random office partition" feel
    for (let s = 0; s < 190; s++) {
      const i = rng.int(1, W - 2);
      const j = rng.int(1, W - 2);
      const horiz = rng.chance(0.5);
      const len = rng.int(2, 7);
      for (let k = 0; k < len; k++) g.set(horiz ? i + k : i, horiz ? j : j + k, WALL);
    }
    // a few pillar halls
    for (let r = 0; r < 4; r++) {
      const i0 = rng.int(2, W - 10);
      const j0 = rng.int(2, W - 10);
      const w = rng.int(5, 8);
      const h = rng.int(5, 8);
      g.fillRect(i0, j0, i0 + w, j0 + h, FLOOR);
      for (let j = j0 + 1; j < j0 + h; j += 2) for (let i = i0 + 1; i < i0 + w; i += 2) g.set(i, j, WALL);
    }
    const si = W >> 1;
    const sj = W >> 1;
    g.fillRect(si - 1, sj - 1, si + 1, sj + 1, FLOOR);
    g.sealUnreachable(si, sj);
    const sp = g.center(si, sj);
    world.spawn = { x: sp.x, z: sp.z, yaw: rng.float(0, Math.PI * 2) };

    const wallMat = new THREE.MeshStandardMaterial({ map: backroomsWall(), roughness: 0.92 });
    const floorMat = new THREE.MeshStandardMaterial({ map: backroomsCarpet(), roughness: 1 });
    const ceilMat = new THREE.MeshStandardMaterial({ map: backroomsCeiling(), roughness: 0.95 });
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x8c7a3c, roughness: 0.8 });
    buildShell(world, {
      height: H,
      wall: { mat: wallMat, u: 2.7, v: 2.7 },
      floor: { mat: floorMat, uv: 3 },
      ceil: { mat: ceilMat, uv: 1.2 },
      trims: [{ mat: baseMat, y0: 0, y1: 0.1, inset: 0.012, top: true }],
    });
    world.root.add(new THREE.HemisphereLight(0xfff0b8, 0x5d5025, 0.75));
    ceilingFixtures(world, { every: 2, offset: 1, y: H - 0.02, color: 0xfff1c0, intensity: 5.5, distance: 11, flicker: 0.1, dead: 0.07, rotate: true });

    Object.assign(world.env, {
      background: 0x5c5431,
      fog: new THREE.FogExp2(0x6b6238, 0.048),
      exposure: 1.05,
      postfx: { bloom: 0.35, bloomThreshold: 0.92, grain: 0.07, vignette: 0.42, chroma: 0.002, scan: 0.035, tint: [1.03, 1, 0.9] },
      ambience: 'hum',
      reverb: [1.1, 4],
      sanityRegen: 0.6,
    });
    world.surfaceFn = () => 'carpet';

    // resident: a survivor resting against a wall, not far from spawn
    const d = g.distances(si, sj);
    const spots = [];
    for (let j = 1; j < W - 1; j++) {
      for (let i = 1; i < W - 1; i++) {
        const k = d[j * W + i];
        if (k < 6 || k > 13) continue;
        if (g.get(i, j - 1) === WALL && g.walkable(i, j + 1)) spots.push([i, j]);
      }
    }
    if (spots.length) {
      const [i, j] = rng.pick(spots);
      const c = g.center(i, j);
      const model = survivorModel();
      model.position.set(c.x, 0, j * cs + 0.35);
      const npc = new NPC(world, {
        name: '放浪者',
        pos: model.position.clone(),
        model,
        voice: 0.8,
        face: false,
        conversations: [
          [
            '……驚いた。まだ正気の人間がいたとはね。',
            'ここはレベル 0。どこまで歩いても、同じ黄色い部屋が続いてる。',
            '出たいなら「記憶の欠片」を 3 つ探しな。天井まで伸びる光の柱が目印だ。',
            '欠片がそろえば、どこかの壁で緑の EXIT が灯る。',
          ],
          [
            'それと、走るな。',
            '足音を聞きつけて、背の高い「あれ」が来る。蛍光灯がちらついたら近くにいる合図だ。',
            '見つかったら角を曲がれ。視界から外れれば、そのうち諦める。',
          ],
          ['俺はここで少し休むよ。……もう何日目かも分からないけどな。'],
        ],
      });
      world.add(npc);
    }

    if (!world.attract) {
      const far = [];
      let max = 0;
      for (let k = 0; k < d.length; k++) max = Math.max(max, d[k]);
      for (let k = 0; k < d.length; k++) if (d[k] > max * 0.55) far.push([k % W, (k / W) | 0]);
      const w = new Wanderer(world, rng.pick(far), { grace: 25 });
      w.onChase = () => {
        world.game.audio.stinger();
        world.game.toast('何かに見つかった', '角を曲がって視界から外れろ', 'danger');
      };
      world.add(w);
    }
  },

  makeExit() {
    return doorModel({
      doorColor: 0x55614f,
      frameColor: 0x3c3a30,
      lightColor: 0xe9fff0,
      extras(group) {
        const signMat = new THREE.MeshBasicMaterial({ map: exitSign() });
        signMat.color.setScalar(0.25);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.225), signMat);
        sign.position.set(0, 2.38, 0.05);
        group.add(sign);
        const g = glow(0x7dffb0, 1.6, 0);
        g.position.set(0, 2.38, 0.2);
        group.add(g);
        return (open, time) => {
          signMat.color.setScalar(0.25 + open * 1.9 + Math.sin(time * 3) * 0.05 * open);
          g.material.opacity = open * 0.7;
        };
      },
    });
  },

};
