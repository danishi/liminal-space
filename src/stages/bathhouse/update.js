import * as THREE from 'three';
import { FLOOR, WATER, HOLE } from '../../core/grid.js';
import { inView } from '../../entities/creatures.js';
import { PI, Y_BATH, Y_SURF, Z_BATH } from './constants.js';
import { matAt } from './geometry.js';

const _y = new THREE.Matrix4();

/** world.onUpdate: water, steam, buckets, yuzu, the keeper, hums, chairs, scales and apparitions. */
export function perFrame(world, lvl) {
  const { rng, g, K, zoneAt, floorOf, bathKind, deep, nMap, causticMap, updateSteam, batch, buckets, yuzus, modOfPos, moveKeeper, hum, fridges, massageChairs, scales, towers, prints, walk } = lvl;

  // ---- per-frame
  let t = 0;
  let konT = rng.float(6, 14);
  let konPanner = null;
  const blinkers = [];
  world.root.traverse((o) => o.userData.blink && blinkers.push(o));
  world.onUpdate = (dt, ctx) => {
    t += dt;
    nMap.offset.set(t * 0.015, t * 0.01);
    causticMap.offset.set(Math.sin(t * 0.15) * 0.1 + t * 0.008, t * 0.012);
    for (const b of blinkers) b.visible = Math.sin(t * 2.2) > 0.2;
    // steam
    updateSteam(dt, ctx);
    if (ctx.attract) return;

    const { player, game, camera } = ctx;
    const audio = game.audio;
    const pz = player.pos;
    // buckets hop when tapped
    for (const b of buckets) {
      if (b.hop <= 0) continue;
      b.hop = Math.max(0, b.hop - dt * 3);
      const m4 = _y.copy(b.base);
      m4.elements[13] += Math.sin(b.hop * PI) * 0.08;
      batch.move(b.ref, m4);
    }
    // yuzu drift and bob
    for (const y of yuzus) {
      if (y.m.idx !== modOfPos(pz.x, pz.z)) continue;
      batch.move(y.ref, matAt(y.x + Math.sin(t * 0.13 + y.ph) * 0.25, Y_SURF - 0.01 + Math.sin(t * 1.3 + y.ph) * 0.008, y.z + Math.cos(t * 0.11 + y.ph) * 0.25, t * 0.1 + y.ph, 1, 0, _y));
    }
    // the electric bath tingles
    const [ei, ej] = g.cellOf(pz.x, pz.z);
    const inElectric = g.inBounds(ei, ej) && bathKind[K(ei, ej)] === 4 && g.get(ei, ej) === WATER;
    if (inElectric && !walk.buzz) game.toast('Bzzzt.', 'The electric bath works. So do your elbows, now, independently.');
    walk.buzz = inElectric;
    // the keeper moves to the bandai of whichever bathhouse you are in, when you aren't looking
    moveKeeper(pz, camera);
    // fridge hum and the massage chairs
    if (audio.ready && !hum.panner) {
      hum.panner = audio.panner(0, 1, 0, { ref: 1.2, rolloff: 1.6 });
      hum.fridge = audio.hum(hum.panner, { freq: 58, cut: 200, gain: 0.05 });
      hum.chair = audio.hum(hum.panner, { freq: 42, type: 'square', cut: 160, gain: 0 });
      world.onDispose.push(() => {
        hum.fridge.stop();
        hum.chair.stop();
        hum.panner.disconnect();
      });
    }
    let nearF = null;
    let dF = 1e9;
    for (const f of fridges) {
      const d = f.pos.distanceToSquared(pz);
      if (d < dF) {
        dF = d;
        nearF = f;
      }
    }
    let nearC = null;
    let dC = 1e9;
    for (const ch of massageChairs) {
      const d = ch.pos.distanceToSquared(pz);
      if (d < dC) {
        dC = d;
        nearC = ch;
      }
    }
    if (nearC && dC < 81) {
      // it runs by itself every so often
      nearC.idleT = (nearC.idleT ?? rng.float(6, 14)) - dt;
      if (nearC.idleT <= 0) {
        nearC.shake = rng.float(2.5, 4.5);
        nearC.idleT = rng.float(12, 26) / (1 + world.uneaseAt(pz.x, pz.z));
      }
    }
    for (const ch of massageChairs) {
      if (ch.shake > 0) {
        ch.shake -= dt;
        const a = Math.min(1, ch.shake);
        ch.obj.position.set(ch.base.x + Math.sin(t * 47) * 0.006 * a, ch.base.y + Math.abs(Math.sin(t * 31)) * 0.008 * a, ch.base.z + Math.cos(t * 53) * 0.006 * a);
        ch.obj.rotation.z = Math.sin(t * 23) * 0.012 * a;
      } else if (ch.obj.rotation.z !== 0) {
        ch.obj.position.copy(ch.base);
        ch.obj.rotation.z = 0;
      }
    }
    if (hum.panner) {
      const src = walk.buzz ? { pos: pz } : nearC && nearC.shake > 0 && dC < dF + 4 ? nearC : nearF;
      if (src) audio.setPannerPos(hum.panner, src.pos.x, src.pos.y + 0.5, src.pos.z);
      const shaking = walk.buzz ? 0.8 : nearC && nearC.shake > 0 ? Math.min(1, nearC.shake) : 0;
      hum.chair.gain.value += (shaking * 0.09 - hum.chair.gain.value) * Math.min(1, dt * 5);
      hum.chair.freq.value = 40 + Math.sin(t * 3) * 6;
    }
    for (const sc of scales) {
      if (sc.spin > 0) {
        sc.spin = Math.max(0, sc.spin - dt * 0.35);
        sc.needle.rotation.z = PI * 0.75 - Math.sin((1 - sc.spin) * PI) * PI * 1.9;
      }
    }
    // a distant "kon" of a bucket set down somewhere in the building
    konT -= dt;
    if (konT <= 0 && audio.ready) {
      konT = rng.float(10, 28);
      const a = rng.float(0, PI * 2);
      const d = rng.float(8, 20);
      if (!konPanner) {
        konPanner = audio.panner(0, 0, 0, { ref: 3, rolloff: 1 });
        world.onDispose.push(() => konPanner.disconnect());
      }
      audio.setPannerPos(konPanner, pz.x + Math.cos(a) * d, 1, pz.z + Math.sin(a) * d);
      audio.bucket(konPanner);
    }
    // buckets you turn away from stack themselves into a neat tower
    for (const tw of towers) {
      if (tw.n >= 11) continue;
      const d = Math.hypot(pz.x - tw.x, pz.z - tw.z);
      if (d > 13 || modOfPos(pz.x, pz.z) !== tw.m.idx) continue;
      tw.cool -= dt;
      if (tw.cool > 0) continue;
      const siteSeen = inView(camera, tw.x, 0.6, tw.z, 1.15) && g.los(pz.x, pz.z, tw.x, tw.z);
      if (siteSeen) continue;
      const src = buckets.find((b) => b.m === tw.m && b.s === tw.s && !b.tower && !(inView(camera, b.pos.x, b.pos.y, b.pos.z, 1.15) && g.los(pz.x, pz.z, b.pos.x, b.pos.z)));
      if (!src) continue;
      src.tower = true;
      src.base = matAt(tw.x, Y_BATH + 0.115 + tw.n * 0.108, tw.z, tw.n * 0.21, 1, PI);
      src.pos.set(tw.x, Y_BATH + tw.n * 0.108 + 0.06, tw.z);
      batch.move(src.ref, src.base);
      tw.n++;
      tw.cool = rng.float(1.2, 3.5);
      if (!tw.panner && audio.ready) {
        tw.panner = audio.panner(tw.x, 0.5, tw.z, { ref: 2, rolloff: 1.2 });
        world.onDispose.push(() => tw.panner.disconnect());
      }
      if (tw.panner) audio.bucket(tw.panner);
    }
    // wet footprints walking toward you across the tiles
    const un = world.uneaseAt(pz.x, pz.z);
    const [pi, pj] = g.cellOf(pz.x, pz.z);
    const onTiles = zoneAt(pi, pj) === Z_BATH;
    if (!walk.active) {
      walk.timer -= dt;
      if (walk.timer <= 0 && un > 0.6 && onTiles) {
        const a = rng.float(0, PI * 2);
        const d = rng.float(3.5, 6.5);
        const fx = pz.x + Math.cos(a) * d;
        const fz = pz.z + Math.sin(a) * d;
        const [fi, fj] = g.cellOf(fx, fz);
        if (g.inBounds(fi, fj) && zoneAt(fi, fj) === Z_BATH && g.get(fi, fj) === FLOOR && Math.abs(floorOf(fi, fj) - Y_BATH) < 0.01 && g.los(fx, fz, pz.x, pz.z)) {
          walk.active = true;
          walk.from.set(fx, 0, fz);
          walk.dir.set(pz.x - fx, 0, pz.z - fz).normalize();
          walk.n = 0;
          walk.step = 0.8;
        } else walk.timer = 1;
      }
    } else {
      walk.step -= dt;
      if (walk.step <= 0) {
        walk.step = 0.62;
        const x = walk.from.x + walk.dir.x * walk.n * 0.6 + walk.dir.z * (walk.n % 2 ? 0.1 : -0.1);
        const z = walk.from.z + walk.dir.z * walk.n * 0.6 - walk.dir.x * (walk.n % 2 ? 0.1 : -0.1);
        const [fi, fj] = g.cellOf(x, z);
        const ok = g.inBounds(fi, fj) && g.get(fi, fj) === FLOOR && Math.abs(floorOf(fi, fj) - Y_BATH) < 0.01;
        if (!ok || Math.hypot(pz.x - x, pz.z - z) < 1.1 || walk.n > 14) {
          walk.active = false;
          walk.timer = rng.float(25, 60) / Math.max(0.7, un);
        } else {
          const pr = prints[walk.n % prints.length];
          pr.mesh.position.set(x, Y_BATH + 0.004, z);
          pr.mesh.rotation.set(-PI / 2, 0, Math.atan2(walk.dir.x, walk.dir.z) + PI);
          pr.mesh.scale.x = walk.n % 2 ? -1 : 1;
          pr.mesh.visible = true;
          pr.age = 0;
          walk.n++;
          if (audio.ready) {
            if (!walk.panner) {
              walk.panner = audio.panner(x, 0.1, z, { ref: 1.5, rolloff: 1.4 });
              world.onDispose.push(() => walk.panner.disconnect());
            }
            audio.setPannerPos(walk.panner, x, 0.1, z);
            audio.thump(walk.panner, 0.12);
          }
        }
      }
    }
    for (const pr of prints) {
      if (!pr.mesh.visible) continue;
      pr.age += dt;
      pr.mesh.material.opacity = Math.max(0, Math.min(1, pr.age * 3) * 0.85 * (1 - Math.max(0, pr.age - 5) / 5));
      if (pr.age > 10) pr.mesh.visible = false;
    }
    // sinking into a deep bath
    if (g.get(pi, pj) === HOLE && deep.has(K(pi, pj)) && pz.y < Y_SURF - 0.8 && !walk.sank) {
      walk.sank = true;
      game.toast('The bath is deeper than it looks', null, 'danger');
      audio.splash(null, 1.5);
    }
  };
}
