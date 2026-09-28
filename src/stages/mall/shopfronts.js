import * as THREE from 'three';
import { PropKit, keep } from '../../props/kit.js';
import { photo } from '../../core/assets.js';
import { signTexture } from '../../props/canvas.js';
import { PI, CS, UP, ESC, MALL } from './constants.js';
import { STYLES, signTex, paperTex, bannerTex } from './textures.js';
import { G, storefront } from './props.js';

/** The prop kit and its shared materials, every shopfront, the anchor store and the entrance. */
export function shopfronts(world, lvl) {
  const { rng, depth, slotX, shops } = lvl;
  const kit = new PropKit(world);
  const used = (world.usedMounts = new Set());
  const claimed = new Set();
  const claim = (i, j, nx, nz) => {
    used.add(`${i},${j},${nx},${nz}`);
    claimed.add(`${i},${j}`);
  };
  // local → world for a group at (x0, z0) turned by yaw
  const toWorld = (x0, z0, yaw, lx, lz) => [x0 + lx * Math.cos(yaw) + lz * Math.sin(yaw), z0 - lx * Math.sin(yaw) + lz * Math.cos(yaw)];

  const shared = {
    pilaster: kit.std(0xe9e1d0, 0.4),
    base: kit.std(0x5a4a3e, 0.35),
    frame: kit.std(0x3a342e, 0.35, 0.7),
    glass: kit.mat('glass', () => new THREE.MeshPhysicalMaterial({ color: 0xd8e6e2, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide })),
    darkGlass: kit.std(0x0c0c0e, 0.15, 0.2),
    shutter: photo('painted_metal_shutter', { uvScale: 1, color: new THREE.Color(1.05, 1.05, 1.02), metalness: 0.4, roughness: 0.8 }),
  };

  // ---- shopfronts ------------------------------------------------------------
  const shopNames = {
    clothes: rng.shuffle(['Petite Paris', 'Denim Depot', 'THREADS', 'Mode Boutique', 'Formal Affair', 'Casual Friday']),
    video: ['SUNSET VIDEO'], candles: ['Candle Emporium'], beds: ['Waterbed World'], lost: ['LOST & FOUND'],
    shelves: rng.shuffle(['The Sock Drawer', 'Linen Land', 'Hat Trick', 'Crystal Cave', 'Card Castle']),
    empty: [''],
  };
  const closedNames = rng.shuffle(['Music Barn', 'Toy Galaxy', 'Photo Hut', 'Pager Planet', 'Tan & Tone', 'Mall Optical', 'Aunt Edna’s Fudge', 'GameZone 64',
    'Beeper Barn', 'Cookie Jar', 'Perfume Palace', 'Fun Factory', 'Luggage Lodge', 'Tux Town', 'Sole Mates', 'Calendar Kiosk', 'Frame Games', 'Vitamin Village']);
  let closedIdx = 0;
  const nameCount = {};
  const pickName = (kind) => {
    const list = shopNames[kind];
    const n = nameCount[kind] || 0;
    nameCount[kind] = n + 1;
    return list[n % list.length];
  };
  // kinds for open shops: the far one is lost & found, the first is clothes
  const openShops = shops.filter((s) => s.open);
  const pool = rng.shuffle(['video', 'candles', 'beds', 'clothes', 'shelves', 'clothes', 'empty', 'shelves', 'clothes', 'empty']);
  let farS = null;
  for (const s of openShops) if (s.side === 'S' && s.i0 > 20 && (!farS || s.i0 > farS.i0)) farS = s;
  let pi = 0;
  for (const s of openShops) {
    if (s.side === 'S' && s.i0 === slotX(1)) s.kind = 'clothes';
    else if (s === farS) s.kind = 'lost';
    else s.kind = pool[pi++ % pool.length];
  }
  const signFor = (name, x, z) => {
    const u = world.uneaseAt(x, z);
    const st = rng.pick(STYLES);
    const dead = new Set();
    const nDead = u > 0.35 ? Math.floor((u - 0.25) * 4 * rng.float(0.5, 1.2)) : rng.chance(0.2) ? 1 : 0;
    for (let n = 0; n < nDead; n++) dead.add(rng.int(0, name.length - 1));
    const off = u > 1.0 && rng.chance(0.35);
    const tex = signTex(name, st, dead);
    const m = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: off ? 0.04 : st.glow ? 1.1 : 0.32, roughness: 0.4 });
    return { mat: m, style: st, dead };
  };
  const ghostSign = (name) => ({ ghost: true, mat: new THREE.MeshStandardMaterial({ map: signTex(name, STYLES[0], new Set(), true), transparent: true, depthWrite: false, roughness: 0.9 }) });
  const saleDecal = (u) => kit.tex(`sale${u > 0.8}`, signTexture(u > 0.8 ? 'EVERYTHING HAS GONE' : 'SALE 70% OFF', u > 0.8 ? '' : 'Everything must go', { bg: '#d8231f', fg: '#ffffff', w: 512, h: 128 }), { transparent: true });

  const displayMannequins = [];
  const fronts = [];
  for (const s of shops) {
    const w = 3 * CS;
    const xc = (s.i0 + 1.5) * CS;
    const south = s.side === 'S';
    const zf = south ? 19 * CS : 10 * CS;
    const y = south ? 0 : UP;
    const yaw = south ? PI : 0;
    const u = world.uneaseAt(xc, zf);
    s.name = s.open ? pickName(s.kind) : south && s.i0 === slotX(0) ? 'Mall Office' : closedNames[closedIdx++ % closedNames.length];
    const o = { w, u, mats: shared };
    if (s.open) {
      o.kind = 'glass';
      if (s.kind === 'clothes' || s.kind === 'shelves') o.decal = saleDecal(u);
    } else {
      o.kind = rng.chance(0.62) ? 'shutter' : rng.chance(0.5) ? 'papered' : 'dark';
      if (o.kind === 'shutter' && u > 0.55 && rng.chance(0.5)) {
        o.gap = rng.float(0.25, 0.5);
        o.feet = u > 0.8 && rng.chance(0.6) ? rng.float(-2, 2) : 0;
      }
      if (o.kind === 'papered') o.paper = kit.tex(`paper${s.i0}${s.side}`, paperTex(s.i0, rng.pick(['FOR LEASE', 'COMING SOON', 'SPACE AVAILABLE']), rng.pick(['Call 555-0199', 'Great location!', 'Opening Spring 1998'])));
      if (o.kind === 'dark') o.banner = kit.tex(`banner${u > 0.8}`, u > 0.8 ? bannerTex('STORE CLOSED', 'Thank you for 0 years') : bannerTex('STORE CLOSING', 'Everything must go'));
    }
    if (s.name) o.sign = !s.open && rng.chance(0.25) && s.name !== 'Mall Office' ? ghostSign(s.name) : signFor(s.name, xc, zf);
    kit.add(storefront(kit, rng, o), xc, zf, yaw, { y });
    for (const [lx, lz, bw, bd] of o.boxes) {
      const [x, z] = toWorld(xc, zf, yaw, lx, lz);
      world.addFootprint(x, z, bw, bd, 0);
    }
    const jo = south ? 18 : 10;
    for (let i = s.i0; i <= s.i0 + 2; i++) claim(i, jo, 0, south ? -1 : 1);
    fronts.push({ ...s, xc, zf, y, yaw, u });
  }
  // closed shops under the mezzanine, facing the lower concourse
  for (let k = 0; k < 12; k++) {
    const i0 = slotX(k);
    if (ESC.some((e) => e + 1 >= i0 && e <= i0 + 2)) continue;
    const xc = (i0 + 1.5) * CS;
    const zf = 12 * CS;
    const u = world.uneaseAt(xc, zf + 1);
    const name = closedNames[closedIdx++ % closedNames.length];
    const o = { w: 3 * CS, u, low: true, mats: shared, kind: rng.chance(0.6) ? 'shutter' : rng.chance(0.5) ? 'papered' : 'dark' };
    if (o.kind === 'shutter' && u > 0.55 && rng.chance(0.4)) {
      o.gap = rng.float(0.25, 0.45);
      o.feet = u > 0.8 && rng.chance(0.6) ? rng.float(-2, 2) : 0;
    }
    if (o.kind === 'papered') o.paper = kit.tex(`paperL${k}`, paperTex(k * 7, rng.pick(['FOR LEASE', 'COMING SOON']), rng.pick(['Call 555-0199', 'Opening Spring 1998'])));
    if (o.kind === 'dark') o.banner = kit.tex(`banner${u > 0.8}`, u > 0.8 ? bannerTex('STORE CLOSED', 'Thank you for 0 years') : bannerTex('STORE CLOSING', 'Everything must go'));
    o.sign = signFor(name, xc, zf);
    kit.add(storefront(kit, rng, o), xc, zf, 0, { y: 0 });
    for (const [lx, lz, bw, bd] of o.boxes) world.addFootprint(xc + lx, zf + lz, bw, bd, 0);
  }
  // the anchor store at the far end, gated for good
  {
    const w = 7 * CS;
    const u = world.uneaseAt(51.5 * CS, 15.5 * CS);
    const o = { w, u, mats: shared, kind: 'shutter', sign: null };
    kit.add(storefront(kit, rng, o), 52 * CS, 15.5 * CS, -PI / 2, { y: 0 });
    const big = signFor('HALVERSON’S', 51 * CS, 15 * CS);
    const sg = G();
    kit.box(sg, 9.2, 1.6, 0.16, kit.std(0x1b1917, 0.4), 0, 0, 0);
    keep(kit.plane(sg, 9.0, 1.45, big.mat, 0, 0, 0.081));
    kit.add(sg, 52 * CS - 0.1, 15.5 * CS, -PI / 2, { y: 5.0 });
    for (let j = 12; j <= 18; j++) claim(51, j, -1, 0);
  }
  // entrance: glass doors onto a white afternoon
  {
    const grey = Math.min(0.7, depth * 0.12);
    const day = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.3, 2.1).lerp(new THREE.Color(1.3, 1.3, 1.32), grey) });
    const eg = G();
    eg.add(new THREE.Mesh(new THREE.PlaneGeometry(3 * CS, 3.4), day)).position.set(0, 1.7, 0.01);
    for (let n = 0; n <= 6; n++) kit.box(eg, 0.08, 3.4, 0.12, shared.frame, -3.75 + n * 1.25, 1.7, 0.06);
    kit.box(eg, 3 * CS, 0.12, 0.14, shared.frame, 0, 2.3, 0.06);
    kit.box(eg, 3 * CS, 0.1, 0.14, shared.frame, 0, 3.45, 0.06);
    kit.box(eg, 3 * CS, 0.012, 0.012, shared.glass, 0, 1.7, 0.08);
    for (let n = 0; n < 6; n++) kit.box(eg, 0.5, 0.04, 0.05, kit.std(0xc8ccd0, 0.2, 0.9), -3.12 + n * 1.25, 1.05, 0.14);
    const hours = new THREE.MeshStandardMaterial({ map: signTexture('MALL HOURS', 'Mon–Sat 10–9 · Sun 12–6 · Always 9', { bg: '#ffffff', fg: '#1c2230', w: 512, h: 128 }), transparent: true, opacity: 0.9 });
    kit.plane(eg, 0.9, 0.22, hours, 1.9, 1.6, 0.1);
    kit.add(eg, 1 * CS, 15.5 * CS, PI / 2, { y: 0 });
    for (let j = 14; j <= 16; j++) claim(1, j, 1, 0);
    world.bakeSources.push({ pos: new THREE.Vector3(1 * CS + 0.6, 2.0, 15.5 * CS), color: new THREE.Color(1, 0.97, 0.9), intensity: 16, dir: new THREE.Vector3(1, -0.3, 0).normalize() });
    // welcome sign over the way in
    const wm = new THREE.MeshStandardMaterial({ map: signTex(MALL, STYLES[1], new Set()), emissive: 0xffffff, roughness: 0.4 });
    wm.emissiveMap = wm.map;
    wm.emissiveIntensity = 0.35;
    const ws = G();
    kit.box(ws, 6.6, 1.0, 0.12, kit.std(0x2a2826, 0.4), 0, 0, 0);
    keep(kit.plane(ws, 6.4, 0.9, wm, 0, 0, 0.061));
    kit.add(ws, 4 * CS + 0.07, 15.5 * CS, PI / 2, { y: 5.4 });
  }
  Object.assign(lvl, { kit, claimed, claim, toWorld, shared, signFor, displayMannequins, fronts });
}
