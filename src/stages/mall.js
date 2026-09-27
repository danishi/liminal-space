import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Grid, FLOOR, WALL, VOID, HOLE, PIT_DEPTH, buildWallFaces, buildFloors, buildRisers, buildStairs, buildCellQuads } from '../core/grid.js';
import { paint, pbr } from '../core/surfaces.js';
import { glowSprite } from '../core/textures.js';
import { mesh, ceilingFixtures, doorModel, decorate } from './common.js';
import { PropKit, keep } from '../props/kit.js';
import { photo, modelSize } from '../core/assets.js';
import * as P from '../props/library.js';
import { signTexture } from '../props/canvas.js';
import { Watcher, Follower, Peeker, Mannequin, StrayCat, seen } from '../entities/creatures.js';
import { LOOKS } from '../entities/looks.js';
import { applyPose, lookAt } from '../entities/figures.js';
import { NPC } from '../entities/npc.js';

// LEVEL 94: a dead 90s shopping mall. A two-storey atrium under skylights,
// shopfronts on both sides (most of them shuttered), stopped escalators, a dry
// fountain in a sunken court, a food court, and the corridors behind it all.

const PI = Math.PI;
const CS = 2.5;
const W = 56;
const HH = 34;
const UP = 3.2; // upper concourse floor
const ATRIUM = 7.8; // atrium ceiling
const SHOP_H = 3.4; // shop ceiling above its floor
const PIT = -0.9; // fountain court floor
const FOOD = -0.6; // food court seating
const DOCK = -1.2; // loading dock
const Z = { PUB: 0, SHOP: 1, SERV: 2, REST: 3 };
const ESC = [13, 37, 45]; // escalator pairs (first column)
const MALL = 'Willow Creek Galleria';

const WATCHER_LOOK = { body: 0x1a1816, coat: true };

// ---------------------------------------------------------------------------
// Canvas textures (signs, skylights, the directory map). Made per level.

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const SANS = '"IBM Plex Sans", "Helvetica Neue", Arial, sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';

// storefront sign styles: channel letters on a raceway, or a backlit lightbox
const STYLES = [
  { bg: '#1b1917', fg: '#ff5a3a', glow: '#ff3818', font: `700 {s}px ${SANS}`, dead: '#3a2a26' },
  { bg: '#f4efe4', fg: '#1d4f8a', glow: null, font: `italic 600 {s}px ${SERIF}`, dead: '#c8c2b6' },
  { bg: '#14222a', fg: '#62e6dc', glow: '#20c8c0', font: `600 {s}px ${SANS}`, dead: '#23343a' },
  { bg: '#26152c', fg: '#ff82d8', glow: '#ff40c0', font: `italic 700 {s}px ${SERIF}`, dead: '#3a2440' },
  { bg: '#191919', fg: '#ffd45a', glow: '#ffb020', font: `700 {s}px ${SANS}`, dead: '#353020' },
  { bg: '#fbf7ee', fg: '#b0262a', glow: null, font: `700 {s}px ${SANS}`, dead: '#d8cfc2' },
  { bg: '#0f1a30', fg: '#f4f0e0', glow: '#9ab8ff', font: `600 {s}px ${SERIF}`, dead: '#26304a' },
];

/** A shop sign; `dead` holds indexes of letters whose tubes have gone out. */
function signTex(name, st, dead, ghost = false) {
  return canvasTex(1024, 160, (ctx, w, h) => {
    if (ghost) ctx.clearRect(0, 0, w, h);
    else {
      ctx.fillStyle = st.bg;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, w - 6, h - 6);
    }
    let size = h * 0.6;
    const setFont = () => (ctx.font = st.font.replace('{s}', size));
    setFont();
    while (ctx.measureText(name).width > w * 0.88 && size > 24) {
      size -= 4;
      setFont();
    }
    ctx.textBaseline = 'middle';
    let x = (w - ctx.measureText(name).width) / 2;
    for (let k = 0; k < name.length; k++) {
      const ch = name[k];
      const lit = !dead.has(k);
      if (ghost) {
        // the letters were taken down; their outline stayed on the wall
        ctx.fillStyle = 'rgba(120,108,90,0.22)';
        ctx.shadowBlur = 0;
      } else {
        ctx.shadowColor = st.glow || 'transparent';
        ctx.shadowBlur = lit && st.glow ? 16 : 0;
        ctx.fillStyle = lit ? st.fg : st.dead;
      }
      ctx.fillText(ch, x, h * 0.54);
      x += ctx.measureText(ch).width;
    }
  });
}

/** Skylight glazing seen from below: pale sky through a grid of mullions. */
function skylightTex(grey, dirt, seed) {
  return canvasTex(256, 512, (ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, w, h);
    const a = new THREE.Color(0.86, 0.93, 1).lerp(new THREE.Color(0.75, 0.76, 0.78), grey);
    const b = new THREE.Color(1, 0.98, 0.93).lerp(new THREE.Color(0.82, 0.82, 0.82), grey);
    sky.addColorStop(0, `#${a.getHexString()}`);
    sky.addColorStop(1, `#${b.getHexString()}`);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    // clouds
    ctx.filter = 'blur(18px)';
    for (let k = 0; k < 6; k++) {
      const r = (n) => Math.abs(Math.sin(seed * 12.9 + k * 78.2 + n * 3.1) * 43758.5) % 1;
      ctx.fillStyle = `rgba(255,255,255,${0.35 + r(1) * 0.3})`;
      ctx.beginPath();
      ctx.ellipse(r(2) * w, r(3) * h, 40 + r(4) * 60, 20 + r(5) * 40, 0, 0, PI * 2);
      ctx.fill();
    }
    // grime and dead leaves on the glass
    ctx.filter = 'blur(3px)';
    for (let k = 0; k < dirt * 40; k++) {
      const r = (n) => Math.abs(Math.sin(seed * 7.3 + k * 19.7 + n * 5.9) * 23421.6) % 1;
      ctx.fillStyle = `rgba(${60 + r(1) * 40},${50 + r(2) * 30},${30},${0.3 + r(3) * 0.5})`;
      ctx.beginPath();
      ctx.ellipse(r(4) * w, r(5) * h, 3 + r(6) * 12, 2 + r(7) * 6, r(8) * 3, 0, PI * 2);
      ctx.fill();
    }
    ctx.filter = 'none';
    ctx.fillStyle = '#5b5e62';
    for (let k = 0; k <= 4; k++) ctx.fillRect(k * (w / 4) - 4, 0, 8, h);
    for (let k = 0; k <= 8; k++) ctx.fillRect(0, k * (h / 8) - 3, w, 6);
  });
}

/** Someone lying face down on the skylight, seen from underneath. */
function silhouetteTex() {
  return canvasTex(256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.filter = 'blur(5px)';
    ctx.fillStyle = 'rgba(20,18,16,0.92)';
    ctx.beginPath();
    ctx.ellipse(w / 2, 46, 20, 24, 0, 0, PI * 2); // head
    ctx.fill();
    ctx.fillRect(w / 2 - 30, 70, 60, 90); // body
    ctx.save();
    ctx.translate(w / 2 - 30, 78);
    ctx.rotate(0.5);
    ctx.fillRect(-12, 0, 14, 80); // arms, spread against the glass
    ctx.restore();
    ctx.save();
    ctx.translate(w / 2 + 30, 78);
    ctx.rotate(-0.5);
    ctx.fillRect(-2, 0, 14, 80);
    ctx.restore();
    // hands pressed flat
    ctx.beginPath();
    ctx.ellipse(w / 2 - 78, 150, 12, 16, 0.4, 0, PI * 2);
    ctx.ellipse(w / 2 + 78, 150, 12, 16, -0.4, 0, PI * 2);
    ctx.fill();
    ctx.fillRect(w / 2 - 28, 158, 22, 80);
    ctx.fillRect(w / 2 + 6, 158, 22, 80);
  });
}

function grooveTex() {
  const t = canvasTex(64, 16, (ctx, w, h) => {
    ctx.fillStyle = '#b4b6b8';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#3a3c3e';
    for (let x = 0; x < w; x += 8) ctx.fillRect(x, 0, 3, h);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(70, 1);
  return t;
}

/** Brown paper over a vacant shop's windows, with a leasing notice. */
function paperTex(seed, text, sub) {
  return canvasTex(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#b89c70';
    ctx.fillRect(0, 0, w, h);
    for (let k = 0; k < 7; k++) {
      ctx.fillStyle = `rgba(90,70,40,${0.08 + (k % 3) * 0.04})`;
      ctx.fillRect(k * 76 + (seed % 20), 0, 3, h);
    }
    ctx.fillStyle = '#f7f3ea';
    ctx.fillRect(w * 0.3, h * 0.22, w * 0.4, h * 0.46);
    ctx.fillStyle = '#b0262a';
    ctx.font = `700 34px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.fillText(text, w / 2, h * 0.4);
    ctx.fillStyle = '#333';
    ctx.font = `18px ${SANS}`;
    ctx.fillText(sub, w / 2, h * 0.55);
  });
}

/** Window banner: STORE CLOSING, or worse. */
function bannerTex(text, sub) {
  return canvasTex(512, 128, (ctx, w, h) => {
    ctx.fillStyle = '#d8231f';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffe94a';
    ctx.font = `800 52px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h * 0.4);
    ctx.fillStyle = '#fff';
    ctx.font = `600 22px ${SANS}`;
    ctx.fillText(sub, w / 2, h * 0.8);
  });
}

function menuTex(name, items) {
  return canvasTex(512, 200, (ctx, w, h) => {
    ctx.fillStyle = '#1c1a18';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffcf5a';
    ctx.font = `700 26px ${SANS}`;
    ctx.fillText(name.toUpperCase(), 18, 34);
    ctx.font = `20px ${SANS}`;
    items.forEach(([a, b], k) => {
      ctx.fillStyle = '#f2ece0';
      ctx.fillText(a, 18, 72 + k * 30);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#9fe0a0';
      ctx.fillText(b, w - 18, 72 + k * 30);
      ctx.textAlign = 'left';
    });
  });
}

/** The mall directory, drawn from the level itself. */
function directoryTex(g, zones, stars, fool) {
  return canvasTex(512, 420, (ctx, w, h) => {
    ctx.fillStyle = '#f6f1e6';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1d4f8a';
    ctx.fillRect(0, 0, w, 56);
    ctx.fillStyle = '#fff';
    ctx.font = `700 26px ${SANS}`;
    ctx.fillText('MALL DIRECTORY', 18, 36);
    ctx.font = `italic 16px ${SERIF}`;
    ctx.textAlign = 'right';
    ctx.fillText(MALL, w - 16, 34);
    ctx.textAlign = 'left';
    const s = 8.4;
    const ox = (w - W * s) / 2;
    const oy = 74;
    for (let j = 0; j < g.h; j++) {
      for (let i = 0; i < g.w; i++) {
        if (g.solid(i, j)) continue;
        const z = zones[j * g.w + i];
        const up = g.heightOf(i, j) > 2;
        ctx.fillStyle = z === Z.SHOP ? (up ? '#7aa6d6' : '#e8905e') : z === Z.SERV ? '#bdb7ab' : z === Z.REST ? '#8cc6bc' : up ? '#d9c79c' : '#eadcbc';
        if (g.ramp[j * g.w + i]) ctx.fillStyle = '#b8a67a';
        ctx.fillRect(ox + i * s, oy + j * s, s + 0.5, s + 0.5);
      }
    }
    const star = (x, y, r) => {
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -PI / 2 + (k * PI) / 5;
        const rr = k % 2 ? r * 0.45 : r;
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
    };
    ctx.fillStyle = '#d32020';
    stars.forEach(([i, j], k) => {
      const x = ox + (i + 0.5) * s;
      const y = oy + (j + 0.5) * s;
      star(x, y, 9);
      if (k === 0 || fool) {
        ctx.font = `700 12px ${SANS}`;
        ctx.fillText(k === 0 ? 'YOU ARE HERE' : fool && k === stars.length - 1 ? 'YOU ARE NOT HERE' : 'YOU ARE HERE', x + 11, y + 4);
      }
    });
    ctx.font = `13px ${SANS}`;
    const legend = [['#eadcbc', 'Level 1'], ['#d9c79c', 'Level 2'], ['#e8905e', 'Shops'], ['#8cc6bc', 'Restrooms'], ['#bdb7ab', 'Staff only']];
    legend.forEach(([c, t], k) => {
      ctx.fillStyle = c;
      ctx.fillRect(18 + k * 98, h - 34, 14, 14);
      ctx.fillStyle = '#333';
      ctx.fillText(t, 36 + k * 98, h - 22);
    });
  });
}

/** CCTV monitor: grey picture with a timestamp that never moves. */
function cctvTex(cam) {
  return canvasTex(128, 96, (ctx, w, h) => {
    ctx.fillStyle = '#7a8078';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#5a605a';
    ctx.fillRect(0, h * 0.55, w, h * 0.45);
    ctx.fillStyle = '#a0a69e';
    ctx.fillRect(w * 0.3, h * 0.2, w * 0.4, h * 0.3);
    for (let y = 0; y < h; y += 3) {
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(0, y, w, 1);
    }
    ctx.fillStyle = '#f0f0f0';
    ctx.font = '10px monospace';
    ctx.fillText(`CAM ${cam}`, 5, 12);
    ctx.fillText('12-31-1999 20:59', 5, h - 6);
  });
}

// ---------------------------------------------------------------------------
// Props

const G = () => new THREE.Group();

/** Plane whose UVs are in metres, so photo textures keep their real size. */
function uvPlane(w, h) {
  const geo = new THREE.PlaneGeometry(w, h);
  const uv = geo.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * w, uv.getY(k) * h);
  return geo;
}

/**
 * A storefront, local +Z facing the concourse, x across its width, origin on
 * the floor at the boundary line. kinds: glass (open shop), shutter, papered,
 * dark. Returns the group; `o.boxes` collects local collision boxes.
 */
function storefront(kit, rng, o) {
  const g = G();
  const { w, kind, low = false, u = 0, mats } = o;
  const top = low ? 2.88 : SHOP_H;
  const openH = low ? 2.3 : 2.9;
  const wo = w - 0.68;
  const boxes = (o.boxes = []);
  for (const s of [-1, 1]) {
    kit.box(g, 0.34, top, 0.24, mats.pilaster, s * (w / 2 - 0.17), top / 2, 0.08);
    kit.box(g, 0.38, 0.12, 0.28, mats.base, s * (w / 2 - 0.17), 0.06, 0.08);
    boxes.push([s * (w / 2 - 0.17), 0.08, 0.36, 0.26]);
  }
  kit.box(g, wo, top - openH, 0.16, mats.frame, 0, (openH + top) / 2, 0.05);
  if (kind === 'glass') {
    const door = 1.25;
    const pw = wo / 2 - door;
    for (const s of [-1, 1]) {
      const cx = s * (door + pw / 2);
      kit.box(g, pw, 0.32, 0.08, mats.frame, cx, 0.16, 0);
      kit.box(g, pw, openH - 0.32, 0.012, mats.glass, cx, 0.32 + (openH - 0.32) / 2, 0);
      for (const x of [s * door, s * (door + pw / 2), s * (wo / 2)]) kit.box(g, 0.06, openH, 0.1, mats.frame, x, openH / 2, 0);
      boxes.push([cx, 0, pw, 0.14]);
      // sale decals on the glass
      if (o.decal && s === 1) kit.plane(g, 1.0, 0.25, o.decal, cx, 1.5, 0.012);
    }
    // the doors were left folded open
    for (const s of [-1, 1]) {
      const leaf = G();
      kit.box(leaf, 0.05, 2.25, 0.05, mats.frame, 0, 1.125, 0);
      kit.box(leaf, 0.05, 2.25, 0.05, mats.frame, 0, 1.125, -1.0);
      kit.box(leaf, 0.012, 2.1, 1.0, mats.glass, 0, 1.12, -0.5);
      kit.box(leaf, 0.05, 0.08, 1.0, mats.frame, 0, 2.22, -0.5);
      kit.box(leaf, 0.05, 0.12, 1.0, mats.frame, 0, 0.06, -0.5);
      leaf.position.set(s * door, 0, -0.05);
      leaf.rotation.y = s * 0.25;
      g.add(leaf);
    }
  } else if (kind === 'shutter') {
    const gap = o.gap || 0;
    const sh = kit.mesh(g, uvPlane(wo, openH - gap), mats.shutter, 0, gap + (openH - gap) / 2, 0.06);
    void sh;
    kit.box(g, wo, 0.07, 0.08, mats.frame, 0, gap + 0.035, 0.07);
    kit.box(g, 0.12, 0.05, 0.04, kit.std(0x999999, 0.4, 0.8), 0.4, gap + 0.07, 0.11);
    for (const s of [-1, 1]) kit.box(g, 0.07, openH, 0.12, mats.frame, s * (wo / 2 - 0.035), openH / 2, 0.06);
    if (gap > 0) {
      kit.plane(g, wo - 0.1, gap, kit.std(0x050505, 1), 0, gap / 2, 0.03);
      // something is standing right behind it
      if (o.feet) {
        for (const x of [-0.12, 0.12]) kit.box(g, 0.1, 0.07, 0.24, kit.std(0xe6dfd4, 0.3), o.feet + x, 0.035, 0.1);
      }
    }
  } else {
    // papered-over or dark glass, straight onto the wall behind
    const glassH = openH - 0.32;
    kit.box(g, wo, 0.32, 0.08, mats.frame, 0, 0.16, 0.06);
    if (kind === 'papered') kit.plane(g, wo, glassH, o.paper, 0, 0.32 + glassH / 2, 0.02);
    else kit.plane(g, wo, glassH, mats.darkGlass, 0, 0.32 + glassH / 2, 0.02);
    kit.box(g, wo, glassH, 0.012, mats.glass, 0, 0.32 + glassH / 2, 0.07);
    for (let k = 0; k <= 3; k++) kit.box(g, 0.06, openH, 0.1, mats.frame, -wo / 2 + (k * wo) / 3, openH / 2, 0.07);
    if (o.banner) kit.plane(g, 2.4, 0.6, o.banner, 0, 1.75, 0.08);
  }
  // the sign: on the bulkhead above, or in the fascia band under the mezzanine
  if (o.sign) {
    const s = o.sign;
    if (s.ghost) kit.plane(g, 5.2, 0.8, s.mat, 0, top + 0.62, 0.012);
    else if (low) {
      kit.box(g, wo * 0.78, 0.44, 0.06, mats.frame, 0, (openH + top) / 2, 0.15);
      keep(kit.plane(g, wo * 0.76, 0.42, s.mat, 0, (openH + top) / 2, 0.181));
    } else {
      const sw = Math.min(w - 0.8, 5.4);
      kit.box(g, sw + 0.1, 0.8, 0.12, mats.frame, 0, top + 0.62, 0.06);
      keep(kit.plane(g, sw, 0.72, s.mat, 0, top + 0.62, 0.121));
    }
  }
  return g;
}

/** Wire shopping cart, sometimes on its side. */
const cart = {
  place: 'floor', fp: [0.6, 1.0],
  build(k, rng, o = {}) {
    const outer = G();
    const g = G();
    const wire = k.std(0xb8bcc0, 0.35, 0.85);
    const red = k.std(0xc0262a, 0.45);
    const bar = (w, h, d, x, y, z, rx = 0) => k.box(g, w, h, d, wire, x, y, z, rx);
    // basket
    for (const s of [-1, 1]) {
      bar(0.02, 0.02, 0.9, s * 0.27, 1.0, 0);
      bar(0.02, 0.02, 0.8, s * 0.24, 0.5, 0.02);
      for (let n = 0; n < 6; n++) bar(0.015, 0.5, 0.015, s * 0.255, 0.75, -0.42 + n * 0.17, 0.05);
    }
    for (let n = 0; n < 7; n++) bar(0.015, 0.015, 0.8, -0.24 + n * 0.08, 0.5, 0.02);
    for (let n = 0; n < 6; n++) bar(0.54, 0.015, 0.015, 0, 0.55 + n * 0.09, 0.45);
    for (let n = 0; n < 6; n++) bar(0.54, 0.015, 0.015, 0, 0.55 + n * 0.09, -0.44);
    bar(0.56, 0.03, 0.03, 0, 1.0, 0.45);
    k.box(g, 0.58, 0.05, 0.05, red, 0, 1.05, -0.56);
    for (const s of [-1, 1]) {
      bar(0.02, 0.6, 0.02, s * 0.25, 0.75, -0.5, -0.2);
      bar(0.02, 0.45, 0.02, s * 0.2, 0.25, 0.35, 0.2);
      bar(0.02, 0.45, 0.02, s * 0.2, 0.25, -0.35, -0.2);
      bar(0.02, 0.02, 0.8, s * 0.2, 0.08, 0);
      for (const z of [-0.38, 0.38]) k.cyl(g, 0.05, 0.05, 0.04, k.std(0x1a1a1a, 0.7), s * 0.2, 0.05, z, 0, 0, PI / 2, 10);
    }
    outer.add(g);
    if (o.tipped) {
      g.rotation.z = PI / 2;
      g.position.set(0.3, 0.3, 0);
    }
    return outer;
  },
};

/** Round chrome clothes rack. */
const clothesRack = {
  place: 'floor', fp: [1.2, 1.2],
  build(k, rng, o = {}) {
    const g = G();
    const chrome = k.std(0xc8ccd0, 0.2, 0.95);
    k.cyl(g, 0.04, 0.04, 0.02, chrome, 0, 0.01, 0);
    for (let a = 0; a < 4; a++) k.box(g, 0.9, 0.02, 0.04, chrome, 0, 0.02, 0, 0, (a * PI) / 4, 0);
    k.cyl(g, 0.02, 0.02, 1.3, chrome, 0, 0.66, 0);
    k.torus(g, 0.5, 0.012, chrome, 0, 1.3, 0, PI / 2);
    const cols = o.mood > 0.9 ? [0x1a1a1a, 0x222024, 0x2a2626] : [0xb03030, 0x2a3550, 0xe0c050, 0x3a7a5a, 0xe8e2d8, 0x8a4a8a, 0x5aa0c8, 0xd87a4a];
    const n = o.mood > 0.7 ? rng.int(3, 7) : rng.int(12, 18);
    for (let s = 0; s < n; s++) {
      const a = (s / n) * PI * 2 + rng.float(-0.05, 0.05);
      const len = rng.float(0.6, 0.95);
      k.box(g, 0.42, len, 0.03, k.std(rng.pick(cols), 0.9), Math.cos(a) * 0.5, 1.28 - len / 2, Math.sin(a) * 0.5, 0, -a + PI / 2, 0);
    }
    return g;
  },
};

/** Slatwall with shelves of folded things. */
const wallShelf = {
  place: 'wall', fp: [2.0, 0.45],
  build(k, rng, o = {}) {
    const g = G();
    k.box(g, 2.0, 2.2, 0.04, k.std(0xe8e2d6, 0.5), 0, 1.25, -0.2);
    for (let y = 0.4; y < 2.3; y += 0.12) k.box(g, 2.0, 0.012, 0.012, k.std(0x9a948a, 0.5), 0, y, -0.18);
    const cols = o.cols || [0xb03030, 0x2a3550, 0xe0c050, 0x3a7a5a, 0xe8e2d8, 0x8a4a8a, 0x5aa0c8];
    for (const y of [0.55, 1.05, 1.55, 2.05]) {
      k.box(g, 1.9, 0.03, 0.38, k.std(0xd8d2c6, 0.45), 0, y, 0);
      if (o.mood > 0.8 && rng.chance(0.5)) continue;
      let x = -0.85;
      while (x < 0.8) {
        const bw = rng.float(0.2, 0.34);
        const bh = rng.float(0.1, 0.3);
        k.box(g, bw, bh, rng.float(0.2, 0.32), k.std(rng.pick(cols), 0.85), x + bw / 2, y + 0.015 + bh / 2, 0);
        x += bw + rng.float(0.02, 0.12);
      }
    }
    return g;
  },
};

/** Video-rental shelf of cassette boxes. */
const vhsShelf = {
  place: 'wall', fp: [1.8, 0.4],
  build(k, rng) {
    const g = G();
    const wood = k.std(0x6a4a30, 0.6);
    k.box(g, 1.8, 2.0, 0.04, wood, 0, 1.0, -0.18);
    for (const s of [-1, 1]) k.box(g, 0.04, 2.0, 0.38, wood, s * 0.88, 1.0, 0);
    const cols = [0x1a1a1a, 0xc02020, 0x2040a0, 0xe0c030, 0x303030, 0x208040, 0xe06020, 0xf0f0f0];
    for (let r = 0; r < 5; r++) {
      const y = 0.15 + r * 0.38;
      k.box(g, 1.72, 0.025, 0.36, wood, 0, y, 0);
      let x = -0.82;
      while (x < 0.8) {
        k.box(g, 0.03, 0.2, 0.13, k.std(rng.pick(cols), 0.5), x, y + 0.11, 0.08);
        x += 0.034 + (rng.chance(0.1) ? 0.06 : 0);
      }
    }
    return g;
  },
};

/** A waterbed, still sloshing faintly. */
const waterbed = {
  place: 'floor', fp: [1.9, 2.3],
  build(k, rng) {
    const g = G();
    const wood = k.std(rng.pick([0x5a3a24, 0x8a5a34, 0x2a1a14]), 0.45);
    k.box(g, 1.9, 0.4, 2.3, wood, 0, 0.2, 0);
    k.box(g, 1.9, 1.0, 0.12, wood, 0, 0.5, -1.1);
    const water = k.mat('waterbed', () => new THREE.MeshPhysicalMaterial({ color: 0x3a7ab8, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.08 }));
    k.box(g, 1.72, 0.2, 2.1, water, 0, 0.47, 0.03);
    k.box(g, 0.7, 0.12, 0.35, k.std(0xf0ece4, 0.9), -0.4, 0.62, -0.8);
    k.box(g, 0.7, 0.12, 0.35, k.std(0xf0ece4, 0.9), 0.4, 0.62, -0.8);
    return g;
  },
};

/** Candle table: pillars of wax in every colour. */
const candleTable = {
  place: 'floor', fp: [1.2, 1.2],
  build(k, rng) {
    const g = G();
    const wood = k.std(0x7a5a3a, 0.5);
    k.cyl(g, 0.6, 0.6, 0.05, wood, 0, 0.78, 0, 0, 0, 0, 24);
    k.cyl(g, 0.06, 0.1, 0.76, wood, 0, 0.38, 0);
    const cols = [0xf0e0c0, 0xd05050, 0x8a60b0, 0x60a080, 0xe0b040, 0xf6f2ea];
    for (let n = 0; n < 16; n++) {
      const a = rng.float(0, PI * 2);
      const r = rng.float(0, 0.5);
      const h = rng.float(0.08, 0.3);
      k.cyl(g, 0.045, 0.045, h, k.std(rng.pick(cols), 0.7), Math.cos(a) * r, 0.8 + h / 2, Math.sin(a) * r, 0, 0, 0, 10);
    }
    return g;
  },
};

/** Counter with a scanned cash register on it. */
function counter(k, rng, color = 0xd8cfc0) {
  const g = G();
  k.box(g, 2.0, 0.95, 0.65, k.std(color, 0.55), 0, 0.475, 0);
  k.box(g, 2.1, 0.05, 0.75, k.std(0x2a2826, 0.35), 0, 0.975, 0);
  k.model(g, 'CashRegister_01', -0.4, 1.0, 0, PI);
  return g;
}

/** Display plinth for a shop window. */
function plinth(k) {
  const g = G();
  k.box(g, 1.5, 0.14, 1.2, k.std(0x8a1c24, 0.9), 0, 0.07, 0);
  return g;
}

/** Raised terrazzo planter with a scanned plant. */
function planter(k, rng, o = {}) {
  const g = G();
  const w = o.w || 1.8;
  const d = o.d || 1.8;
  const stone = k.mat('planter', () => new THREE.MeshStandardMaterial({ color: 0xd8cfbd, roughness: 0.4 }));
  k.box(g, w, 0.55, d, stone, 0, 0.275, 0);
  k.box(g, w + 0.08, 0.06, d + 0.08, k.std(0xc9bfab, 0.35), 0, 0.57, 0);
  k.box(g, w - 0.16, 0.02, d - 0.16, k.std(o.dead ? 0x6a5a44 : 0x3a2c20, 1), 0, 0.56, 0);
  const n = w > 2.5 ? 2 : 1;
  for (let s = 0; s < n; s++) {
    const x = n === 1 ? 0 : (s - 0.5) * (w * 0.5);
    if (o.dead && rng.chance(0.6)) continue;
    k.model(g, rng.chance(0.5) ? 'potted_plant_04' : 'potted_plant_02', x, 0.3, 0, rng.float(0, PI * 2), rng.float(1.1, 1.5));
  }
  return g;
}

/** Brass railing along x (length len), at local z = 0. */
function railing(k, len, mat) {
  const g = G();
  const n = Math.max(1, Math.round(len / 1.25));
  for (let s = 0; s <= n; s++) k.cyl(g, 0.025, 0.025, 0.95, mat, -len / 2 + (s * len) / n, 0.475, 0, 0, 0, 0, 8);
  k.box(g, len, 0.05, 0.06, mat, 0, 0.95, 0);
  k.box(g, len, 0.03, 0.03, mat, 0, 0.45, 0);
  return g;
}

/** Food court stall: counter, sneeze guard, register, menu board and sign. */
function stall(k, rng, name, style, dead, menu, glass) {
  const g = G();
  const col = rng.pick([0xc84a2a, 0xe0b040, 0x2a7a6a, 0x2a4a8a]);
  k.box(g, 3.6, 1.0, 0.7, k.std(col, 0.5), 0, 0.5, 0.2);
  k.box(g, 3.7, 0.05, 0.85, k.std(0xd8d2c4, 0.3), 0, 1.02, 0.2);
  k.box(g, 3.4, 0.012, 0.45, glass, 0, 1.35, 0.35, 0.6);
  k.model(g, 'CashRegister_01', 1.1, 1.05, 0.2, PI);
  k.box(g, 3.8, 3.2, 0.05, k.std(0xe8e2d6, 0.6), 0, 1.6, -0.9);
  const board = new THREE.MeshStandardMaterial({ map: menu, emissiveMap: menu, emissive: 0xffffff, emissiveIntensity: 0.7, roughness: 0.4 });
  keep(k.plane(g, 2.6, 1.0, board, 0, 2.25, -0.86));
  const sign = new THREE.MeshStandardMaterial({ map: signTex(name, style, dead), emissive: 0xffffff, roughness: 0.4 });
  sign.emissiveMap = sign.map;
  sign.emissiveIntensity = 0.9;
  k.box(g, 3.9, 0.7, 0.14, k.std(0x1c1a18, 0.4), 0, 3.4, -0.2);
  keep(k.plane(g, 3.8, 0.62, sign, 0, 3.4, -0.129));
  return g;
}

/** Freestanding kiosk island (keys cut while you wait). */
function keyKiosk(k, rng, signMat) {
  const g = G();
  const lam = k.std(0x2a5a8a, 0.45);
  k.box(g, 2.2, 1.0, 1.1, lam, 0, 0.5, 0);
  k.box(g, 2.3, 0.05, 1.2, k.std(0xe8e2d6, 0.3), 0, 1.02, 0);
  k.box(g, 1.2, 0.6, 0.5, k.std(0x606468, 0.4, 0.6), -0.3, 1.35, 0);
  k.box(g, 2.0, 0.9, 0.04, k.std(0xc8b890, 0.8), 0, 1.6, -0.45);
  for (let n = 0; n < 24; n++) k.box(g, 0.03, 0.07, 0.008, k.std(rng.pick([0xc8a040, 0xb8bcc0]), 0.3, 0.9), -0.85 + (n % 12) * 0.15, 1.35 + Math.floor(n / 12) * 0.3, -0.425);
  for (const [x, z] of [[-1.05, 0.5], [1.05, 0.5], [-1.05, -0.5], [1.05, -0.5]]) k.cyl(g, 0.025, 0.025, 1.4, k.std(0xc8ccd0, 0.2, 0.9), x, 1.7, z, 0, 0, 0, 8);
  k.box(g, 2.4, 0.08, 1.3, lam, 0, 2.42, 0);
  for (const s of [-1, 1]) {
    k.box(g, 2.0, 0.34, 0.06, k.std(0x1c1a18, 0.4), 0, 2.64, s * 0.4);
    keep(k.plane(g, 1.9, 0.3, signMat, 0, 2.64, s * 0.431, 0, s < 0 ? PI : 0, 0));
  }
  return g;
}

/** Security desk; monitors show the same four empty hallways. */
function securityDesk(k) {
  const g = G();
  const lam = k.std(0x5a4636, 0.5);
  k.box(g, 2.6, 1.0, 0.1, lam, 0, 0.5, 0.35);
  k.box(g, 2.7, 0.05, 0.3, k.std(0x2a2826, 0.4), 0, 1.03, 0.3);
  k.box(g, 2.6, 0.04, 0.6, k.std(0xd8d0c0, 0.5), 0, 0.76, 0);
  for (const s of [-1, 1]) k.box(g, 0.05, 0.76, 0.6, lam, s * 1.27, 0.38, 0);
  const plate = new THREE.MeshStandardMaterial({ map: signTexture('SECURITY', 'Information · Lost children', { bg: '#1c2230', fg: '#e8e2d0', w: 512, h: 128 }), roughness: 0.4 });
  k.plane(g, 1.0, 0.25, plate, 0, 0.78, 0.402);
  for (let n = 0; n < 3; n++) {
    const x = -0.9 + n * 0.62;
    k.box(g, 0.42, 0.36, 0.4, k.std(0xcfc8b6, 0.6), x, 0.96, -0.05);
    const scr = new THREE.MeshBasicMaterial({ map: cctvTex(`0${n + 1}`) });
    scr.color.setScalar(1.3);
    keep(k.plane(g, 0.32, 0.25, scr, x, 0.97, 0.151));
  }
  k.cyl(g, 0.05, 0.06, 0.04, k.std(0xc8a040, 0.3, 0.9), 1.0, 0.8, 0.15);
  return g;
}

/** Two-sided lit directory stand. */
function directoryStand(k, mat) {
  const g = G();
  const frame = k.std(0x2a2c30, 0.35, 0.6);
  k.box(g, 1.3, 2.1, 0.22, frame, 0, 1.05, 0);
  k.box(g, 1.5, 0.1, 0.5, frame, 0, 0.05, 0);
  for (const s of [-1, 1]) keep(k.plane(g, 1.16, 0.96, mat, 0, 1.35, s * 0.111, 0, s < 0 ? PI : 0, 0));
  const head = new THREE.MeshStandardMaterial({ map: signTexture('DIRECTORY', '', { bg: '#1d4f8a', fg: '#ffffff', w: 512, h: 96 }), roughness: 0.4 });
  for (const s of [-1, 1]) k.plane(g, 1.1, 0.2, head, 0, 1.98, s * 0.111, 0, s < 0 ? PI : 0, 0);
  return g;
}

/** Dry fountain in the sunken court, coins on the bottom. */
function fountain(k, rng, tileMat) {
  const g = G();
  const stone = k.std(0xe0d6c4, 0.45);
  const rim = [[2.35, 0], [2.6, 0], [2.6, 0.5], [2.7, 0.56], [2.7, 0.62], [2.3, 0.62], [2.3, 0.08]];
  k.mesh(g, new THREE.LatheGeometry(rim.map(([r, y]) => new THREE.Vector2(r, y)), 48), stone);
  k.mesh(g, new THREE.CircleGeometry(2.32, 40), tileMat, 0, 0.08, 0, -PI / 2);
  k.cyl(g, 0.35, 0.45, 1.2, stone, 0, 0.6, 0, 0, 0, 0, 24);
  const bowl = [[0, 1.15], [1.1, 1.15], [1.25, 1.35], [1.15, 1.35], [0.5, 1.2]];
  k.mesh(g, new THREE.LatheGeometry(bowl.map(([r, y]) => new THREE.Vector2(r, y)), 40), stone);
  k.cyl(g, 0.15, 0.2, 0.8, stone, 0, 1.7, 0, 0, 0, 0, 16);
  k.mesh(g, new THREE.LatheGeometry([[0, 2.05], [0.5, 2.05], [0.6, 2.18], [0.52, 2.18], [0, 2.1]].map(([r, y]) => new THREE.Vector2(r, y)), 32), stone);
  k.sphere(g, 0.12, stone, 0, 2.3, 0);
  // water stains and coins
  k.mesh(g, new THREE.RingGeometry(0.6, 2.3, 40), k.std(0x6a6450, 0.9, 0, { transparent: true, opacity: 0.35, depthWrite: false }), 0, 0.083, 0, -PI / 2);
  const gold = k.std(0xc8a04a, 0.3, 0.9);
  const copper = k.std(0xb06a3a, 0.35, 0.9);
  for (let n = 0; n < 90; n++) {
    const a = rng.float(0, PI * 2);
    const r = rng.float(0.55, 2.2);
    k.cyl(g, 0.013, 0.013, 0.004, rng.chance(0.6) ? copper : gold, Math.cos(a) * r, 0.086, Math.sin(a) * r, rng.float(-0.1, 0.1), 0, 0, 8);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Entities

/** A display-window mannequin: it never walks, but it poses while you aren't looking. */
class DisplayMannequin extends Mannequin {
  constructor(world, opts) {
    super(world, { ...opts, moves: false });
    this.baseYaw = opts.yaw;
    this.swapWait = world.rng.float(3, 7);
  }

  update(dt, ctx) {
    super.update(dt, ctx);
    if (ctx.attract || this.broken || this.unseen < this.swapWait) return;
    const p = this.pos;
    const pl = ctx.player.pos;
    const dist = Math.hypot(pl.x - p.x, pl.z - p.z);
    if (dist > 24) return;
    const u = this.world.uneaseAt(p.x, p.z);
    applyPose(this.fig.userData.rig, this.pickPose(u));
    // deeper in, they turn to face wherever you are
    let yaw = this.baseYaw;
    if (u > 0.45) {
      const want = Math.atan2(pl.x - p.x, pl.z - p.z);
      const diff = Math.atan2(Math.sin(want - yaw), Math.cos(want - yaw));
      yaw += Math.max(-1, Math.min(1, diff)) * Math.min(1, (u - 0.45) * 2);
    }
    this.object.rotation.y = yaw;
    this.moved = true;
    this.unseen = 0;
    this.swapWait = this.world.rng.float(3, 8) / (1 + u);
  }
}

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
const TWINKLE = [72, 72, 79, 79, 81, 81, 79, 0, 77, 77, 76, 76, 74, 74, 72];

/**
 * Coin-operated rocket ride. Walk past and it starts rocking and playing its
 * tune, with nobody on it.
 */
class KiddieRide {
  constructor(world, x, y, z, yaw) {
    this.world = world;
    const k = { std: (c, r = 0.5, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m }) };
    const g = (this.object = new THREE.Group());
    const add = (geo, mat, px, py, pz, rx = 0, ry = 0, rz = 0, parent = g) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.rotation.set(rx, ry, rz);
      parent.add(m);
      return m;
    };
    const blue = k.std(0x2a5ab8, 0.4);
    const red = k.std(0xd8302a, 0.3, 0.1);
    const yellow = k.std(0xf2c230, 0.4);
    const white = k.std(0xf2eee6, 0.4);
    add(new THREE.BoxGeometry(1.1, 0.22, 1.6), blue, 0, 0.11, 0);
    add(new THREE.BoxGeometry(1.12, 0.05, 1.62), yellow, 0, 0.2, 0);
    // coin box on a post at the front
    add(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 10), white, 0.42, 0.55, 0.72);
    add(new THREE.BoxGeometry(0.24, 0.3, 0.18), red, 0.42, 1.0, 0.72);
    const label = new THREE.MeshStandardMaterial({ map: signTexture('25¢', 'RIDE ME!', { bg: '#f2c230', fg: '#b01c1c', w: 256, h: 128 }), roughness: 0.5 });
    add(new THREE.PlaneGeometry(0.2, 0.12), label, 0.42, 1.02, 0.811);
    this.coinLight = add(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: 0x401010 }), 0.42, 1.2, 0.72);
    // the rocket rocks on a pivot
    const body = (this.body = new THREE.Group());
    body.position.y = 0.25;
    g.add(body);
    add(new THREE.CylinderGeometry(0.34, 0.34, 1.1, 20), red, 0, 0.55, -0.05, PI / 2, 0, 0, body);
    add(new THREE.ConeGeometry(0.34, 0.55, 20), white, 0, 0.55, 0.77, PI / 2, 0, 0, body);
    add(new THREE.CylinderGeometry(0.34, 0.24, 0.2, 20), white, 0, 0.55, -0.7, PI / 2, 0, 0, body);
    for (let n = 0; n < 3; n++) {
      const a = (n / 3) * PI * 2 + PI / 2;
      add(new THREE.BoxGeometry(0.05, 0.4, 0.35), yellow, Math.cos(a) * 0.4, 0.55 + Math.sin(a) * 0.4, -0.55, 0, 0, a - PI / 2, body);
    }
    add(new THREE.BoxGeometry(0.4, 0.12, 0.5), k.std(0x1a1a1a, 0.6), 0, 0.88, -0.1, 0, 0, 0, body);
    add(new THREE.SphereGeometry(0.12, 14, 10), new THREE.MeshPhysicalMaterial({ color: 0x9fd8ff, roughness: 0.05, clearcoat: 1 }), 0, 0.68, 0.36, 0, 0, 0, body);
    this.lights = [];
    for (let n = 0; n < 4; n++) {
      const m = add(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0x302010 }), (n % 2 ? 1 : -1) * 0.3, 0.72, -0.4 + n * 0.25, 0, 0, 0, body);
      this.lights.push(m);
    }
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    this.pos = g.position;
    world.addFootprint(x, z, 1.2, 1.7, yaw);
    this.aimHeight = 0.8;
    this.interactRange = 2.6;
    this.t = 0;
    this.run = 0;
    this.cool = 2;
    this.notes = [];
    this.panner = null;
    this.seenOnce = false;
  }

  get prompt() {
    return 'Put a quarter in';
  }

  interact(game) {
    game.toast('You don’t have a quarter.', 'It starts anyway.');
    this.start(game);
  }

  start(game) {
    const audio = game.audio;
    this.run = 8;
    this.cool = 25;
    if (!audio.ready) return;
    if (!this.panner) this.panner = audio.panner(this.pos.x, this.pos.y + 1, this.pos.z, { ref: 2, rolloff: 1.2 });
    // the further out, the more the tune sags
    const u = this.world.uneaseAt(this.pos.x, this.pos.z);
    const pitch = 1 - Math.max(0, u - 0.5) * 0.12;
    const beat = 0.28 * (1 + Math.max(0, u - 0.5) * 0.4);
    const t0 = audio.now + 0.1;
    TWINKLE.forEach((n, k) => {
      if (!n) return;
      const f = NOTE(n) * pitch * (u > 0.9 && k === TWINKLE.length - 1 ? 0.94 : 1);
      const last = k === TWINKLE.length - 1;
      audio.tone({ type: 'square', f, t: t0 + k * beat, a: 0.005, d: last && u > 0.9 ? 2.5 : beat * 0.8, peak: 0.025, send: 0.3, dest: this.panner });
      audio.tone({ type: 'sine', f: f / 2, t: t0 + k * beat, a: 0.005, d: beat * 0.7, peak: 0.02, send: 0.2, dest: this.panner });
    });
  }

  update(dt, ctx) {
    this.t += dt;
    this.cool -= dt;
    if (!ctx.attract) {
      const p = ctx.player.pos;
      const d = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
      if (d < 3.2 && this.cool <= 0) {
        this.start(ctx.game);
        if (!this.seenOnce) {
          this.seenOnce = true;
          ctx.game.toast('The kiddie ride starts on its own', 'Nobody is on it');
        }
      }
    }
    this.run = Math.max(0, this.run - dt);
    const amt = Math.min(1, this.run);
    this.body.rotation.x = Math.sin(this.t * 4.2) * 0.1 * amt;
    this.body.rotation.z = Math.sin(this.t * 2.1) * 0.06 * amt;
    this.lights.forEach((l, n) => l.material.color.setHex(amt > 0 && Math.floor(this.t * 6 + n) % 2 ? 0xffe060 : 0x302010));
    this.coinLight.material.color.setHex(amt > 0 ? 0xff3020 : 0x401010);
  }

  dispose() {
    this.panner?.disconnect();
  }
}

/**
 * Someone lying face down on a skylight. Look up at it for too long and it
 * isn't there.
 */
class SkylightShadow {
  constructor(world, x, y, z) {
    this.world = world;
    this.mat = new THREE.MeshBasicMaterial({ map: silhouetteTex(), transparent: true, depthWrite: false, fog: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), this.mat);
    m.rotation.x = PI / 2;
    m.rotation.z = world.rng.float(0, PI * 2);
    m.position.set(x, y, z);
    this.object = m;
    this.presence = 0;
    this.watched = 0;
    this.gone = false;
  }

  update(dt, ctx) {
    if (ctx.attract || this.gone) return;
    const p = this.object.position;
    const looking = seen(ctx, this.world, p.x, p.y, p.z, 0.5) && Math.hypot(ctx.player.pos.x - p.x, ctx.player.pos.z - p.z) < 14;
    this.watched = looking ? this.watched + dt : Math.max(0, this.watched - dt * 0.5);
    this.presence = looking ? 0.35 : 0;
    if (this.watched > 2.2) {
      this.mat.opacity -= dt * 3;
      if (this.mat.opacity <= 0) {
        this.gone = true;
        this.object.visible = false;
        this.presence = 0;
        ctx.game.pulseStatic(0.2);
      }
    }
  }
}

// PA announcements, cycling
const PA = [
  'Attention shoppers: the mall will close in five minutes. The mall has been closing in five minutes since 1996.',
  'Will the owner of a white sedan, licence plate YOU, please return to your body.',
  'Lost child at the information desk. The child says they are 41.',
  'Today only: everything must go. Including you.',
  'Reminder: the escalators are not broken. They are stairs now. Thank you for your patience.',
  'Mall walkers, you are on lap nine thousand. Please remember to hydrate.',
  'The fountain is not accepting wishes at this time.',
  'Will the person in aisle… there are no aisles. Never mind.',
];
const PA_DEEP = [
  'Security to the mannequins. Security to the mannequins. …Security?',
  'Please do not look behind you. Thank you for shopping at Willow Creek.',
  'The food court is now serving. Nothing. The food court is now serving nothing.',
];

// ---------------------------------------------------------------------------

export default {
  id: 'mall',
  code: 'LEVEL 94',
  name: 'The Dead Mall',
  sub: 'Muzak for no one',
  tint: 0xffe6c8,
  assets: {
    textures: ['terrazzo_tiles', 'beige_wall_001', 'painted_metal_shutter', 'old_wooden_floor_02', 'concrete_floor_02', 'painted_concrete', 'ceiling_interior', 'square_tiled_wall', 'blue_floor_tiles_01'],
    models: [
      'CashRegister_01', 'potted_plant_04', 'modular_street_seating', 'bar_chair_round_01', 'coffee_table_round_01', 'wooden_display_shelves_01',
      'metal_trash_can', 'WetFloorSign_01', 'potted_plant_02', 'security_camera_01', 'cardboard_box_01', 'hand_truck', 'trashbag',
      'korean_public_payphone_01', 'vintage_suitcase',
    ],
    looks: ['guard', ['mannequin', 0], ['mannequin', 1], ['mannequin', 2], ['watcher', WATCHER_LOOK], 'cat'],
  },

  build(world) {
    console.warn('SIZES', JSON.stringify(this.assets.models.map((m) => [m, modelSize(m).toArray().map((v) => +v.toFixed(2))])));
    const rng = world.rng;
    const depth = world.depth;
    const g = (world.grid = new Grid(W, HH, CS, WALL));
    const zones = new Uint8Array(W * HH);
    const ceilArr = new Float32Array(W * HH).fill(ATRIUM);
    const K = (i, j) => j * W + i;
    const area = (i0, j0, i1, j1, zone, ceil, y = 0) => {
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          g.set(i, j, FLOOR);
          g.setHeight(i, j, y);
          zones[K(i, j)] = zone;
          ceilArr[K(i, j)] = ceil;
        }
      }
    };

    // ---- layout ------------------------------------------------------------
    area(4, 12, 51, 18, Z.PUB, ATRIUM); // lower concourse
    area(4, 10, 51, 11, Z.PUB, ATRIUM, UP); // upper concourse
    area(1, 14, 3, 16, Z.PUB, 4.2); // entrance vestibule
    area(21, 19, 27, 23, Z.PUB, ATRIUM); // fountain court
    area(41, 19, 51, 25, Z.PUB, ATRIUM); // food court
    // sunken fountain court, steps down on two sides
    for (let j = 16; j <= 20; j++) {
      for (let i = 23; i <= 25; i++) g.setHeight(i, j, PIT);
      g.setRamp(22, j, 1, PIT, -PIT);
      g.setRamp(26, j, 0, PIT, -PIT);
    }
    // food court seating pit
    for (let j = 21; j <= 23; j++) for (let i = 43; i <= 49; i++) g.setHeight(i, j, FOOD);
    for (let i = 43; i <= 49; i++) {
      g.setRamp(i, 20, 3, FOOD, -FOOD);
      g.setRamp(i, 24, 2, FOOD, -FOOD);
    }
    // stopped escalators up to the mezzanine
    const escCells = [];
    for (const i0 of ESC) {
      for (const i of [i0, i0 + 1]) {
        g.setRamp(i, 13, 3, 0, UP / 2);
        g.setRamp(i, 12, 3, UP / 2, UP / 2);
        escCells.push(K(i, 12), K(i, 13));
      }
    }
    // shops: 3 cells wide, 4 deep, one wall cell between neighbours
    const slotX = (k) => 5 + k * 4;
    const shops = [];
    for (const k of [0, 1, 2, 3, 6, 7, 8]) shops.push({ side: 'S', i0: slotX(k), open: k === 1 || (k !== 0 && rng.chance(0.55)) });
    for (let k = 0; k < 12; k++) if (k !== 6) shops.push({ side: 'N', i0: slotX(k), open: rng.chance(0.45) });
    for (const s of shops) {
      if (!s.open) continue;
      if (s.side === 'S') area(s.i0, 19, s.i0 + 2, 22, Z.SHOP, SHOP_H);
      else area(s.i0, 6, s.i0 + 2, 9, Z.SHOP, UP + SHOP_H, UP);
    }
    // back of house
    area(24, 24, 24, 26, Z.REST, 3.0); // restrooms corridor
    area(6, 27, 48, 27, Z.SERV, 2.9); // service corridor
    area(5, 24, 8, 26, Z.SERV, 2.9); // stockroom
    area(48, 26, 48, 26, Z.SERV, 2.9); // staff door from the food court
    area(30, 29, 36, 31, Z.SERV, DOCK + 4.2, DOCK); // loading dock
    area(33, 28, 33, 28, Z.SERV, 2.9);
    g.setRamp(33, 28, 3, DOCK, -DOCK);
    // upstairs: a corridor to the management office and nowhere in particular
    area(30, 4, 30, 9, Z.SERV, UP + 2.8, UP);
    area(18, 3, 46, 3, Z.SERV, UP + 2.8, UP);
    area(34, 1, 38, 2, Z.SERV, UP + 2.8, UP);

    const sp = g.center(3, 15);
    world.spawn = { x: sp.x, z: sp.z, yaw: -PI / 2 };
    world.finalizeLayout();
    const dist = world.distFromSpawn;

    // missing floor further out, more of it the deeper you are; each behind a wet-floor sign
    const escSet = new Set(escCells);
    const holeOk = (i, j) => {
      const k = K(i, j);
      if (g.get(i, j) !== FLOOR || g.ramp[k] || escSet.has(k) || g.countSolidNeighbors(i, j) === 2) return false;
      if (i === 30 && j >= 4) return false;
      const y = g.heightOf(i, j);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!g.standable(i + di, j + dj)) continue;
          if (g.ramp[K(i + di, j + dj)] || Math.abs(g.heightOf(i + di, j + dj) - y) > 0.01) return false;
        }
      }
      return true;
    };
    const holes = world.pickFarCells(Math.min(8, 1 + depth * 2), { minFrac: 0.45, spacing: 7, filter: holeOk });
    for (const [i, j] of holes) g.set(i, j, HOLE);

    // ---- materials -----------------------------------------------------------
    const offWhite = new THREE.Color(1.3, 1.26, 1.18);
    const mats = {
      [Z.PUB]: {
        wall: { mat: photo('beige_wall_001', { uvScale: 3, color: offWhite }), u: 3, v: 3 },
        floor: { mat: photo('terrazzo_tiles', { uvScale: 2, roughness: 0.55, color: new THREE.Color(1.08, 1.04, 0.98) }), uv: 2 },
        ceil: { mat: pbr(paint('s-mall-ceil', [236, 232, 222], { rough: 0.8 })), uv: 3 },
        base: { mat: pbr(paint('s-mall-base', [96, 82, 70], { rough: 0.35 })), h: 0.12 },
      },
      [Z.SHOP]: {
        wall: { mat: pbr(paint('s-mall-shop', [228, 222, 210], { rough: 0.7 })), u: 2, v: 2 },
        floor: { mat: photo('old_wooden_floor_02', { uvScale: 2, color: 0xe0d0c0 }), uv: 2 },
        ceil: { mat: photo('ceiling_interior', { uvScale: 2.4, color: 0xe8e2d6 }), uv: 2.4 },
        base: { mat: pbr(paint('s-mall-shopbase', [60, 52, 46], { rough: 0.4 })), h: 0.1 },
      },
      [Z.SERV]: {
        wall: { mat: photo('painted_concrete', { uvScale: 2, color: new THREE.Color(1.05, 1.1, 1.0) }), u: 2, v: 2 },
        floor: { mat: photo('concrete_floor_02', { uvScale: 2, color: 0xb8b4aa }), uv: 2 },
        ceil: { mat: photo('ceiling_interior', { uvScale: 2.4, color: 0xc8c2b6 }), uv: 2.4 },
        base: { mat: pbr(paint('s-mall-servbase', [60, 88, 70], { rough: 0.5 })), h: 0.15 },
      },
      [Z.REST]: {
        wall: { mat: photo('square_tiled_wall', { uvScale: 2, roughness: 0.4, color: new THREE.Color(1.15, 1.12, 1.02) }), u: 2, v: 2 },
        floor: { mat: photo('terrazzo_tiles', { uvScale: 2, roughness: 0.55 }), uv: 2 },
        ceil: { mat: photo('ceiling_interior', { uvScale: 2.4, color: 0xe0dccc }), uv: 2.4 },
      },
    };
    mats[Z.REST].floor.mat = mats[Z.PUB].floor.mat;

    // ---- shell ---------------------------------------------------------------
    const ceilAt = (i, j) => ceilArr[K(i, j)];
    world.ceilAt = ceilAt;
    const zoneOf = (i, j) => zones[K(i, j)];
    const open = (c) => c !== WALL && c !== VOID;
    for (const [zk, s] of Object.entries(mats)) {
      const zi = +zk;
      const inZone = (c, i, j) => open(c) && zoneOf(i, j) === zi;
      mesh(world, buildWallFaces(g, { y0: (i, j) => g.heightOf(i, j) - 0.02, y1: ceilAt, uScale: s.wall.u, vScale: s.wall.v, open: inZone }), s.wall.mat);
      if (s.base) {
        mesh(world, buildWallFaces(g, {
          y0: (i, j) => g.heightOf(i, j), y1: (i, j) => g.heightOf(i, j) + s.base.h, uScale: 1, vScale: 1, inset: 0.012,
          open: (c, i, j) => inZone(c, i, j) && c !== HOLE && !g.ramp[K(i, j)],
        }), s.base.mat);
      }
      mesh(world, buildFloors(g, (c, i, j) => inZone(c, i, j) && c !== HOLE, s.floor.uv), s.floor.mat);
      mesh(world, buildCellQuads(g, inZone, ceilAt, false, s.ceil.uv), s.ceil.mat);
    }
    const wallPub = mats[Z.PUB].wall.mat;
    mesh(world, buildRisers(g, { pred: open, uScale: 3, vScale: 3 }), wallPub);
    mesh(world, buildRisers(g, { pred: open, ceil: ceilAt, uScale: 3, vScale: 3 }), wallPub);
    // stairs (the escalators get their own treads)
    const saved = g.ramp.slice();
    for (const k of escCells) g.ramp[k] = 0;
    const stairGeos = buildStairs(g);
    g.ramp.set(saved);
    if (stairGeos.length) mesh(world, mergeGeometries(stairGeos), mats[Z.PUB].floor.mat);
    if (holes.length) mesh(world, buildCellQuads(g, (c) => c === HOLE, PIT_DEPTH, true, 2), new THREE.MeshBasicMaterial({ color: 0x000000 }));

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
      const m = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: off ? 0.04 : st.glow ? 1.1 : 0.75, roughness: 0.4 });
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
      wm.emissiveIntensity = 0.7;
      const ws = G();
      kit.box(ws, 6.6, 1.0, 0.12, kit.std(0x2a2826, 0.4), 0, 0, 0);
      keep(kit.plane(ws, 6.4, 0.9, wm, 0, 0, 0.061));
      kit.add(ws, 4 * CS + 0.07, 15.5 * CS, PI / 2, { y: 5.4 });
    }

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
    const skyMats = skyTex.map((t) => new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(1, 1, 1).multiplyScalar(2.1 - skyGrey * 0.8) }));
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

    // ---- shop interiors --------------------------------------------------------------
    const tileMat = photo('blue_floor_tiles_01', { uvScale: 1, color: 0xd0dcd8 });
    const shelfModel = P.modelProp('wooden_display_shelves_01');
    for (const f of fronts) {
      if (!f.open) continue;
      const place = (grp, lx, lz, lyaw, collide) => {
        const [x, z] = toWorld(f.xc, f.zf, f.yaw, lx, lz);
        kit.add(grp, x, z, f.yaw + lyaw, { y: f.y, collide });
        return [x, z];
      };
      const mood = f.u;
      const o = { mood, eerie: mood > 0.8 };
      place(counter(kit, rng, rng.pick([0xd8cfc0, 0x2a4a6a, 0x8a2a2a])), -2.2, -8.6, 0, [2.1, 0.75]);
      const sideShelf = f.kind === 'video' ? vhsShelf : f.kind === 'clothes' ? wallShelf : shelfModel;
      for (const lz of [-3.6, -6.6]) {
        for (const s of [-1, 1]) {
          const fp = sideShelf.fp || [1.8, 0.45];
          place(sideShelf.build(kit, rng, o), s * (3.75 - fp[1] / 2 - 0.02), lz, -s * PI / 2, fp);
        }
      }
      place((f.kind === 'video' ? vhsShelf : wallShelf).build(kit, rng, o), 1.6, -10 + 0.25, 0, [2.0, 0.45]);
      if (f.kind === 'clothes') {
        place(clothesRack.build(kit, rng, o), -1.1, -4.8, 0, [1.1, 1.1]);
        place(clothesRack.build(kit, rng, o), 1.2, -6.4, 0, [1.1, 1.1]);
        for (const s of [-1, 1]) {
          place(plinth(kit), s * 2.2, -1.2, 0, [1.5, 1.2]);
          const [x, z] = toWorld(f.xc, f.zf, f.yaw, s * 2.2, -1.2);
          displayMannequins.push({ pos: new THREE.Vector3(x, f.y + 0.14, z), yaw: f.yaw + rng.float(-0.4, 0.4) });
        }
      } else if (f.kind === 'video') {
        place(vhsShelf.build(kit, rng, o), 0, -5.4, 0, [1.8, 0.4]);
        place(vhsShelf.build(kit, rng, o), 0, -5.8, PI, [1.8, 0.4]);
        for (const s of [-1, 1]) place(P.tvStatic.build(kit, rng, o), s * 2.2, -1.2, PI + s * 0.3, [0.6, 0.5]);
      } else if (f.kind === 'beds') {
        place(waterbed.build(kit, rng, o), -1.4, -5.0, 0.2, [1.9, 2.3]);
        place(waterbed.build(kit, rng, o), 1.5, -3.2, -0.3, [1.9, 2.3]);
      } else if (f.kind === 'candles') {
        place(candleTable.build(kit, rng, o), -1.0, -4.6, 0, [1.2, 1.2]);
        place(candleTable.build(kit, rng, o), 1.2, -6.8, 0, [1.2, 1.2]);
        place(candleTable.build(kit, rng, o), 2.0, -1.4, 0, [1.2, 1.2]);
      } else if (f.kind === 'lost') {
        for (let n = 0; n < 9; n++) {
          const item = rng.pick([P.umbrella, P.lostShoe, P.teddy, P.modelProp('vintage_suitcase', { jitter: 3, scale: 0.8 }), P.modelProp('cardboard_box_01', { jitter: 3 })]);
          place(item.build(kit, rng, o), rng.float(-2.5, 2.5), rng.float(-7.5, -1.5), rng.float(0, PI * 2), null);
        }
      } else if (f.kind === 'shelves') {
        place(candleTable.build(kit, rng, o), 0, -5.2, 0, [1.2, 1.2]);
      } else {
        for (let n = 0; n < 5; n++) place(P.modelProp('cardboard_box_01', { jitter: 3, scaleJitter: 0.3 }).build(kit, rng), rng.float(-2.5, 2.5), rng.float(-8, -2), 0, null);
        place(P.stepLadder.build(kit, rng), 1.5, -4, 0.4, [0.5, 0.5]);
      }
    }

    // ---- the concourse -------------------------------------------------------------------
    const pitSet = (i, j) => (i >= 22 && i <= 26 && j >= 15 && j <= 21) || (i >= 42 && i <= 50 && j >= 19 && j <= 25);
    // islands down the middle: planters with benches, a key kiosk, the directory, the ride
    const islands = [];
    for (let i = 8; i <= 50; i += 4) {
      if (i >= 20 && i <= 28) continue;
      islands.push(i);
    }
    let kiddie = null;
    const keysSign = new THREE.MeshStandardMaterial({ map: signTex('Mr. Keys', STYLES[4], new Set()), emissive: 0xffffff, roughness: 0.4 });
    keysSign.emissiveMap = keysSign.map;
    keysSign.emissiveIntensity = 0.9;
    const directories = [];
    islands.forEach((i, n) => {
      const x = (i + 0.5) * CS;
      const z = 15.5 * CS;
      const u = world.uneaseAt(x, z);
      for (let a = i - 1; a <= i + 1; a++) for (let b = 14; b <= 17; b++) claimed.add(`${a},${b}`);
      if (n === 0) {
        directories.push({ x, z, yaw: -PI / 2 });
        kit.add(planter(kit, rng, { w: 1.6, d: 1.6 }), x + 2.2, z, 0, { collide: [1.7, 1.7] });
      } else if (n === 2) {
        kit.add(keyKiosk(kit, rng, keysSign), x, z, 0, { collide: [2.3, 1.2] });
      } else if (n === 4) {
        kiddie = { x, z: z + 0.6, yaw: 0.4 };
        kit.add(planter(kit, rng, { w: 1.4, d: 1.4, dead: u > 0.7 }), x - 2.4, z, 0, { collide: [1.5, 1.5] });
      } else if (n === islands.length - 2) {
        directories.push({ x, z, yaw: -PI / 2 });
      } else {
        // long planter with benches back to back
        const dead = u > 0.75 && rng.chance(0.6);
        kit.add(planter(kit, rng, { w: 3.2, d: 1.4, dead }), x, z, 0, { collide: [3.3, 1.5] });
        for (const s of [-1, 1]) {
          if (u > 0.6 && rng.chance(0.3)) continue;
          const b = G();
          kit.model(b, 'modular_street_seating', 0, 0, 0, 0, 1);
          const sz = modelSize('modular_street_seating');
          kit.add(b, x, z + s * (0.75 + sz.z / 2 + 0.05), s > 0 ? 0 : PI, { collide: [sz.x, sz.z] });
        }
        const tc = G();
        kit.model(tc, 'metal_trash_can', 0, 0, 0, 0, 0.85);
        kit.add(tc, x + 2.3, z + rng.float(-0.4, 0.4), rng.float(0, 6), { collide: { r: 0.3 } });
      }
    });
    // directory stars: one where you are, more where you aren't
    for (const d of directories) {
      const [i, j] = g.cellOf(d.x, d.z);
      const u = world.unease(i, j);
      const stars = [[i, j]];
      const extra = u > 0.9 ? 6 : u > 0.5 ? 2 : 0;
      for (let n = 0; n < extra; n++) {
        const c = rng.pick(g.openCells());
        stars.push(rng.chance(0.3) ? [rng.int(1, W - 2), rng.int(1, HH - 2)] : c);
      }
      d.u = u;
      const tex = directoryTex(g, zones, stars, u > 0.9);
      const m = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.3 });
      kit.add(directoryStand(kit, m), d.x, d.z, d.yaw, { collide: [0.5, 1.5] });
    }

    // security desk inside the entrance, and its guard
    const deskX = 6.4 * CS;
    const deskZ = 17.6 * CS;
    kit.add(securityDesk(kit), deskX, deskZ, PI, { collide: [2.7, 0.85] });
    for (let a = 5; a <= 8; a++) for (let b = 16; b <= 18; b++) claimed.add(`${a},${b}`);
    const chairX = deskX - 1.95;
    const chairZ = deskZ + 0.15;
    kit.add(P.officeChair.build(kit, rng), chairX, chairZ, PI, {});

    // fountain in the sunken court
    const fx = 24.5 * CS;
    const fz = 18.5 * CS;
    kit.add(fountain(kit, rng, tileMat), fx, fz, 0, { y: PIT });
    world.addCircle(new THREE.Vector3(fx, 0, fz), 2.7);
    for (const [x, z] of [[21.5, 19.5], [27.5, 19.5]]) {
      const b = G();
      kit.model(b, 'modular_street_seating', 0, 0, 0, 0, 1);
      const sz = modelSize('modular_street_seating');
      kit.add(b, x * CS, z * CS + 0.3, x < 24 ? PI / 2 : -PI / 2, { collide: [sz.x, sz.z] });
    }
    for (let a = 21; a <= 27; a++) for (let b = 15; b <= 23; b++) claimed.add(`${a},${b}`);

    // food court: stalls along the walls, tables in the pit
    const stallDefs = rng.shuffle([
      ['Pretzel Palace', [['Salted pretzel', '$1.25'], ['Cinnamon pretzel', '$1.50'], ['Lemonade', '$0.99'], ['Nothing', '$0.00']]],
      ['Wok This Way', [['Orange chicken', '$3.49'], ['Free sample', 'always'], ['Egg roll', '$0.89'], ['Fortune', 'pending']]],
      ['Hot Dog Hut', [['Hot dog', '$1.99'], ['Corn dog', '$2.25'], ['Hot dog (cold)', '$1.99'], ['Refills', 'forever']]],
      ['Slice Station', [['Cheese slice', '$1.75'], ['Pepperoni', '$2.00'], ['Slice of life', 'sold out'], ['Soda', '$0.89']]],
      ['Cinnamon Cloud', [['Classic roll', '$2.49'], ['Minibons', '$1.99'], ['Coffee', '$0.99'], ['Hope', 'n/a']]],
    ]);
    const stallSpots = [[43.5 * CS, 26 * CS, PI], [46 * CS - 0.2, 26 * CS, PI], [52 * CS, 20.5 * CS, -PI / 2], [52 * CS, 23.2 * CS, -PI / 2]];
    stallSpots.forEach(([x, z, yaw], n) => {
      const [name, menu] = stallDefs[n];
      const u = world.uneaseAt(x, z);
      const st = rng.pick(STYLES);
      const dead = new Set();
      if (u > 0.5) for (let k = 0; k < Math.floor((u - 0.3) * 4); k++) dead.add(rng.int(0, name.length - 1));
      const [wx, wz] = toWorld(x, z, yaw, 0, 1.0);
      kit.add(stall(kit, rng, name, st, dead, menuTex(name, menu), shared.glass), wx, wz, yaw, {});
      const [cx, cz] = toWorld(x, z, yaw, 0, 1.2);
      world.addFootprint(cx, cz, 3.8, 0.9, yaw);
      const [ci, cj] = g.cellOf(wx, wz);
      for (let a = ci - 1; a <= ci + 1; a++) for (let b = cj - 1; b <= cj + 1; b++) claimed.add(`${a},${b}`);
      for (let a = ci - 1; a <= ci + 1; a++) {
        if (yaw === PI) claim(a, 25, 0, -1);
        else claim(51, cj + a - ci, -1, 0);
      }
    });
    {
      // hanging FOOD COURT sign
      const fc = signFor('FOOD COURT', 46.5 * CS, 20 * CS);
      const hs = G();
      kit.box(hs, 6.2, 1.1, 0.14, kit.std(0x1b1917, 0.4), 0, 0, 0);
      for (const s of [-1, 1]) keep(kit.plane(hs, 6.0, 1.0, fc.mat, 0, 0, s * 0.071, 0, s < 0 ? PI : 0, 0));
      for (const x of [-2.6, 2.6]) kit.cyl(hs, 0.01, 0.01, 2.3, steel, x, 1.7, 0, 0, 0, 0, 6);
      kit.add(hs, 46.5 * CS, 19.4 * CS, 0, { y: 4.95 });
    }
    for (let n = 0; n < 6; n++) {
      const x = (43.8 + (n % 3) * 2.6) * CS;
      const z = (21.5 + Math.floor(n / 3) * 1.6) * CS;
      const u = world.uneaseAt(x, z);
      const tg = G();
      kit.model(tg, 'coffee_table_round_01', 0, 0, 0, 0, 1);
      const chairs = u > 0.8 ? rng.int(0, 2) : rng.int(2, 4);
      for (let c = 0; c < chairs; c++) {
        const a = (c / Math.max(1, chairs)) * PI * 2 + rng.float(-0.3, 0.3);
        const r = u > 0.9 && rng.chance(0.5) ? rng.float(1.2, 2.2) : 0.95;
        kit.model(tg, 'bar_chair_round_01', Math.cos(a) * r, 0, Math.sin(a) * r, -a + PI / 2, 1);
      }
      kit.add(tg, x, z, rng.float(0, 6), { y: FOOD, collide: { r: 0.55 } });
    }
    for (let a = 42; a <= 50; a++) for (let b = 20; b <= 24; b++) claimed.add(`${a},${b}`);
    // staff door out of the food court
    kit.add(P.fakeDoor.build(kit, rng), 48.5 * CS, 26 * CS - 0.02, PI, {});
    kit.add((() => {
      const p = G();
      kit.plane(p, 0.8, 0.2, kit.tex('emponly', signTexture('EMPLOYEES ONLY', '', { bg: '#b01c1c', fg: '#ffffff', w: 512, h: 128 })), 0, 0, 0);
      return p;
    })(), 48.5 * CS, 26 * CS - 0.1, PI, { y: 2.35 });

    // restrooms corridor: sign over the way in, doors on both sides
    {
      const rs = G();
      kit.box(rs, 2.3, 0.45, 0.08, kit.std(0x1d4f8a, 0.4), 0, 0, 0);
      kit.plane(rs, 2.2, 0.4, kit.tex('restsign', signTexture('RESTROOMS', 'Telephones · Water fountain', { bg: '#1d4f8a', fg: '#ffffff', w: 512, h: 96 })), 0, 0, 0.041);
      kit.add(rs, 24.5 * CS, 24 * CS - 0.06, PI, { y: 3.4 });
      for (const [x, yaw, label] of [[24 * CS + 0.02, PI / 2, 'MEN'], [25 * CS - 0.02, -PI / 2, 'WOMEN']]) {
        const d = P.fakeDoor.build(kit, rng);
        kit.plane(d, 0.34, 0.18, kit.tex(`rest${label}`, signTexture(label, '', { bg: '#1d4f8a', fg: '#fff', w: 256, h: 128 })), 0, 1.6, 0.07);
        kit.add(d, x, 25.5 * CS, yaw, {});
        claim(24, 25, yaw > 0 ? 1 : -1, 0);
      }
    }

    // wet-floor signs guarding the missing floor
    for (const [i, j] of holes) {
      let best = null;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!g.standable(i + dx, j + dy)) continue;
        if (!best || dist[K(i + dx, j + dy)] < dist[K(best[0], best[1])]) best = [i + dx, j + dy];
      }
      if (!best) continue;
      const c = g.center(i, j);
      const bx = (c.x + (best[0] + 0.5) * CS) / 2;
      const bz = (c.z + (best[1] + 0.5) * CS) / 2;
      const sg = G();
      kit.model(sg, 'WetFloorSign_01', 0, 0, 0, rng.float(-0.4, 0.4), 1);
      kit.add(sg, bx, bz, Math.atan2(best[0] - i, best[1] - j), { y: g.heightOf(...best), collide: { r: 0.2 } });
      claimed.add(`${best[0]},${best[1]}`);
    }
    // a lost balloon or two against the skylights
    for (let n = 0; n < 1 + (depth > 1 ? 2 : 0); n++) {
      const x = rng.float(8, 50) * CS;
      const u = world.uneaseAt(x, 15 * CS);
      const b = P.balloon.build(kit, rng, { grey: u > 1 });
      kit.add(b, x, rng.float(13.5, 17.5) * CS, 0, { y: ATRIUM - 2.3 });
    }
    // shopping carts left where they stopped
    for (let n = 0; n < 3 + depth; n++) {
      const cell = world.pickFarCells(1, { minFrac: 0.1, spacing: 1, filter: (i, j) => zoneOf(i, j) === Z.PUB && g.get(i, j) === FLOOR && !g.ramp[K(i, j)] && !claimed.has(`${i},${j}`) && g.heightOf(i, j) === 0 })[0];
      if (!cell) break;
      const c = g.center(...cell);
      const u = world.unease(...cell);
      claimed.add(`${cell[0]},${cell[1]}`);
      kit.add(cart.build(kit, rng, { tipped: u > 0.7 && rng.chance(0.5) }), c.x + rng.float(-0.6, 0.6), c.z + rng.float(-0.6, 0.6), rng.float(0, PI * 2), { collide: [0.6, 1.0] });
    }

    // ---- scattered props, by zone ---------------------------------------------------------
    const keepFor = (zone) => (i, j) => zoneOf(i, j) !== zone || claimed.has(`${i},${j}`) || escSet.has(K(i, j)) || g.ramp[K(i, j)] > 0 || pitSet(i, j);
    const M = {
      trash: P.modelProp('metal_trash_can', { scale: 0.85 }),
      plant: P.modelProp('potted_plant_02', { scale: 1.2 }),
      phone: P.modelProp('korean_public_payphone_01', { place: 'high', y: 0.9, collide: false }),
      cam: P.modelProp('security_camera_01', { place: 'high', y: 2.5, collide: false }),
      sign: P.modelProp('WetFloorSign_01', { jitter: 3 }),
      box: P.modelProp('cardboard_box_01', { jitter: 0.3, scaleJitter: 0.2 }),
      truck: P.modelProp('hand_truck', { jitter: 0.3 }),
      bag: P.modelProp('trashbag', { jitter: 3 }),
      suitcase: P.modelProp('vintage_suitcase', { jitter: 3, scale: 0.8 }),
    };
    decorate(world, kit, {
      density: { wall: 0.1, high: 0.08, floor: 0.025, clutter: 0.035, ceil: 0 },
      keepClear: keepFor(Z.PUB),
      wall: [
        { p: M.trash, w: 2 }, { p: M.plant, w: 2 }, { p: P.vendingMachine, w: 0.8 }, { p: P.gumball, w: 0.8 }, { p: cart, w: 0.8 },
        { p: P.bench, w: 1 }, { p: P.fakeDoor, w: 1, min: 0.75 }, { p: P.tvStatic, w: 0.6, min: 0.9 },
      ],
      high: [{ p: M.cam, w: 1.5 }, { p: M.phone, w: 1 }, { p: P.poster, w: 1.2 }, { p: P.wallClock, w: 0.5 }, { p: P.handprints, w: 1, min: 0.85 }],
      floor: [{ p: M.sign, w: 1 }, { p: cart, w: 1 }, { p: P.gumball, w: 0.5 }],
      clutter: [
        { p: P.paperScatter, w: 1.5, min: 0.3 }, { p: P.bottles, w: 1, min: 0.4 }, { p: P.puddle, w: 1, min: 0.45 }, { p: P.lostShoe, w: 1, min: 0.5 },
        { p: P.teddy, w: 0.6, min: 0.75 }, { p: M.suitcase, w: 0.5, min: 0.6 },
      ],
    });
    decorate(world, kit, {
      density: { wall: 0.05, high: 0.12, floor: 0, clutter: 0.05, ceil: 0.03 },
      keepClear: keepFor(Z.SHOP),
      wall: [{ p: M.box, w: 2 }, { p: P.cardboardBoxes, w: 1 }],
      high: [{ p: P.poster, w: 2 }, { p: P.wallClock, w: 0.6 }, { p: P.handprints, w: 1, min: 0.8 }],
      clutter: [{ p: P.paperScatter, w: 1, min: 0.3 }, { p: P.lostShoe, w: 0.6, min: 0.6 }, { p: M.box, w: 1, min: 0.5 }],
      ceil: [{ p: P.missingTile, w: 2, min: 0.3 }, { p: P.hangingWires, w: 1, min: 0.7 }],
    });
    decorate(world, kit, {
      density: { wall: 0.2, high: 0.12, floor: 0.04, clutter: 0.08, ceil: 0.06 },
      keepClear: keepFor(Z.SERV),
      wall: [
        { p: M.box, w: 3 }, { p: P.cardboardBoxes, w: 2 }, { p: M.truck, w: 1 }, { p: M.trash, w: 1 }, { p: P.lockers, w: 0.8, o: { color: 0x8a9488 } },
        { p: M.bag, w: 1 }, { p: P.mattress, w: 0.5, min: 0.5 }, { p: P.fakeDoor, w: 1.2, min: 0.5 },
      ],
      high: [{ p: P.wallVent, w: 2 }, { p: P.outlet, w: 1 }, { p: M.cam, w: 0.8 }, { p: P.handprints, w: 1.2, min: 0.7 }],
      floor: [{ p: M.sign, w: 1 }, { p: cart, w: 0.6, o: { tipped: true } }],
      clutter: [{ p: P.mopBucket, w: 1 }, { p: P.paperScatter, w: 1 }, { p: P.puddle, w: 1.5 }, { p: M.bag, w: 1 }, { p: M.box, w: 1 }],
      ceil: [{ p: P.missingTile, w: 2 }, { p: P.hangingWires, w: 1, min: 0.4 }],
    });
    decorate(world, kit, {
      density: { wall: 0.3, high: 0.2, floor: 0, clutter: 0.06, ceil: 0 },
      keepClear: keepFor(Z.REST),
      wall: [{ p: P.waterFountain, w: 1 }, { p: M.trash, w: 1 }],
      high: [{ p: M.phone, w: 2 }, { p: P.poster, w: 0.6 }],
      clutter: [{ p: P.puddle, w: 1 }, { p: P.paperScatter, w: 1 }],
    });
    kit.finish();

    // ---- lights ------------------------------------------------------------------------------
    world.root.add(new THREE.HemisphereLight(0xfff4e2, 0x8a7a66, 0.55));
    const fixY = (i, j) => Math.min(ceilAt(i, j), Math.max(0, g.heightOf(i, j)) + 4.6) - 0.02;
    const fixture = (c, i, j) => {
      if (g.ramp[K(i, j)] || escSet.has(K(i, j))) return false;
      const z = zoneOf(i, j);
      if (z === Z.SHOP) return i % 2 === 1 && j % 2 === 1;
      if (z === Z.SERV || z === Z.REST) return (i + j) % 3 === 0;
      if (i <= 3) return i === 2 && j === 15;
      if (j === 10 || j === 11) return j === 10 && i % 4 === 3;
      if (j >= 19) return i % 3 === 1 && j % 2 === 0;
      return (j === 13 || j === 17) && i % 3 === 1;
    };
    world.ceilAt = (i, j) => fixY(i, j) + 0.02;
    const lp = ceilingFixtures(world, {
      type: 'rect', every: 1, offset: 0, size: [1.2, 0.6], color: 0xfff0dc, panelColor: [2.0, 1.95, 1.8], intensity: 9, distance: 12,
      flicker: 0.03, dead: 0.03, filter: fixture, housing: new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.5 }),
    });
    world.ceilAt = ceilAt;
    // pendant rods up to the atrium roof
    const rodMat = new THREE.MeshStandardMaterial({ color: 0x8a8c90, roughness: 0.4, metalness: 0.8 });
    const rods = [];
    for (const f of lp.fixtures) {
      const [i, j] = g.cellOf(f.pos.x, f.pos.z);
      const top = ceilAt(i, j);
      if (top - f.pos.y < 0.4) continue;
      for (const s of [-0.45, 0.45]) {
        const r = new THREE.CylinderGeometry(0.008, 0.008, top - f.pos.y, 4);
        r.translate(f.pos.x + s, (top + f.pos.y) / 2, f.pos.z);
        rods.push(r);
      }
    }
    if (rods.length) world.root.add(new THREE.Mesh(mergeGeometries(rods), rodMat));

    // ---- environment ----------------------------------------------------------------------------
    Object.assign(world.env, {
      background: 0xd8d0c4,
      fog: new THREE.FogExp2(new THREE.Color(0xe6d8c4).lerp(new THREE.Color(0x8a8680), Math.min(1, depth * 0.15)), 0.012 + depth * 0.003),
      exposure: 1.1,
      postfx: { bloom: 0.4, bloomThreshold: 0.85, bloomRadius: 0.6, grain: 0.05, vignette: 0.32, chroma: 0.0014, scan: 0.025, tint: [1.03, 1.0, 0.95] },
      ao: 1,
      envIntensity: 0.7,
      ambience: 'mall',
      reverb: [3.5, 2.2],
      flashlight: false,
      bake: { hemi: 0.6, dynamic: 0.5, bounce: 0.4, fixtureScale: 0.55, radius: 13, tess: 0.8 },
    });
    world.surfaceFn = (x, z) => {
      const [i, j] = g.cellOf(x, z);
      if (!g.inBounds(i, j)) return 'tile';
      if (escSet.has(K(i, j))) return 'stone';
      const zn = zoneOf(i, j);
      return zn === Z.SHOP ? 'wood' : zn === Z.SERV ? 'stone' : 'tile';
    };

    // ---- residents ----------------------------------------------------------------------------------
    const model = LOOKS.guard();
    model.position.set(chairX, 0, chairZ);
    model.rotation.y = PI;
    const guard = world.add(new NPC(world, {
      name: 'the security guard',
      pos: model.position.clone(),
      model,
      voice: 0.75,
      radius: 0.45,
      face: false,
      conversations: [
        ['(snrk—) Hm? I’m awake. I was resting my eyes. On purpose.', 'Mall closes at nine. It’s been nine for a while.', 'Lost and found is that way. So is everything else.'],
        ['If you see a mannequin move, no you didn’t.', 'They get restless when the music skips. Keep walking. Don’t make eye contact. They don’t have eyes, but still.'],
        ['The escalators have been stairs since ’97. Nobody complained. Nobody’s here to.', 'Food court’s still open. Nobody works there, but it’s open.'],
        ['I’d walk you out, but the exit keeps being the entrance.', 'Go on. Shop around. Something here is bound to fit.'],
        ['(He is asleep again. His radio crackles: “…copy, it’s nine o’clock…”)'],
      ],
    }));
    let snore = 3;
    let wake = 0;
    const eye = new THREE.Vector3();
    guard.idle = (dt, ctx) => {
      const rig = model.userData.rig;
      applyPose(rig, 'sit');
      const br = Math.sin(guard.t * 1.1);
      rig.rot('spine', -0.12, 0, 0);
      rig.rot('chest', -0.05 + br * 0.03, 0, 0);
      rig.rot('armL', -0.35, 0, 0.25);
      rig.rot('foreL', -1.3, 0.9, 0);
      rig.rot('armR', -0.35, 0, -0.25);
      rig.rot('foreR', -1.3, -0.9, 0);
      rig.rot('thighL', -1.35, 0, 0.18);
      rig.rot('thighR', -1.35, 0, -0.18);
      wake += ((guard.talking ? 1 : 0) - wake) * Math.min(1, dt * 2.5);
      lookAt(model, eye.copy(ctx.camera.position), { max: 1.0 });
      rig.blend({ neck: [0.45, 0.05, 0.05], head: [0.5 + br * 0.05, 0.2, 0.15] }, 1 - wake);
      snore -= dt;
      if (snore <= 0 && !guard.talking && !ctx.attract) {
        snore = 4.4;
        const d = ctx.player.pos.distanceTo(model.position);
        if (d < 12 && ctx.game.audio.ready) {
          if (!guard.panner) guard.panner = ctx.game.audio.panner(model.position.x, 1.1, model.position.z, { ref: 1.5, rolloff: 1.3 });
          ctx.game.audio.snore(guard.panner);
        }
      }
    };

    // the directories and the fountain answer when you pay attention to them
    for (const d of directories) {
      const e = new NPC(world, {
        name: 'the directory', pos: new THREE.Vector3(d.x, 0, d.z), model: new THREE.Group(), radius: 0, face: false, marker: false, prompt: 'Read the directory',
        conversations: d.u > 0.9
          ? [['(Seven stars say “YOU ARE HERE”. One of them is inside a wall.)', '(The last one says “YOU ARE NOT HERE”. It is also where you are standing.)'], ['(You count the stars again. There is one more than before.)']]
          : d.u > 0.5
            ? [['(Three stars say “YOU ARE HERE”.)', '(That seems like a lot of here.)']]
            : [['“YOU ARE HERE.”', '(The star is where you are standing. It’s nice to have that confirmed.)'], ['(Level 2 has a waterbed store. Of course it does.)']],
      });
      e.aimHeight = 1.3;
      e.interactRange = 2.2;
      world.add(e);
    }
    {
      const coin = new NPC(world, {
        name: 'the fountain', pos: new THREE.Vector3(fx, PIT, fz), model: new THREE.Group(), radius: 0, face: false, marker: false, prompt: 'Toss a coin in',
        conversations: [
          ['(You toss a coin into the dry fountain. It lands with a clink.)', '(Somewhere, a wish is filed under “pending”.)'],
          ['(Clink.)', '(A voice from the PA says: “Thank you.”)'],
          ['(Clink.)'],
        ],
        onTalk: (game) => {
          if (!game.audio.ready) return;
          const t = game.audio.now + 0.35;
          game.audio.tone({ type: 'sine', f: 2637, t, d: 0.25, peak: 0.05, send: 0.6 });
          game.audio.tone({ type: 'sine', f: 3520, t: t + 0.09, d: 0.3, peak: 0.03, send: 0.6 });
        },
      });
      coin.aimHeight = 0.6;
      coin.interactRange = 4.2;
      world.add(coin);
    }
    if (kiddie) world.add(new KiddieRide(world, kiddie.x, 0, kiddie.z, kiddie.yaw));

    // ---- apparitions --------------------------------------------------------------------------------
    // display mannequins pose in the windows, even at the title screen
    displayMannequins.forEach((m, n) => {
      const u = world.uneaseAt(m.pos.x, m.pos.z);
      world.add(new DisplayMannequin(world, { pos: m.pos, yaw: m.yaw, variant: n % 3, mode: u > 0.8 ? 'mixed' : 'funny', pose: rng.pick(['stand', 'runway', 'wave', 'peace', 'thinker', 'shrug']) }));
    });
    if (!world.attract) {
      // free-standing ones out on the concourse
      const nFree = 2 + Math.min(3, depth);
      const cells = world.pickFarCells(nFree, {
        minFrac: 0.2, spacing: 6,
        filter: (i, j) => zoneOf(i, j) === Z.PUB && g.get(i, j) === FLOOR && !g.ramp[K(i, j)] && !claimed.has(`${i},${j}`) && g.countSolidNeighbors(i, j) === 0,
      });
      cells.forEach(([i, j], k) => {
        const c = g.center(i, j);
        world.add(new Mannequin(world, { pos: new THREE.Vector3(c.x, g.heightOf(i, j), c.z), yaw: rng.float(0, PI * 2), variant: k, mode: depth <= 1 ? 'funny' : 'mixed' }));
      });
      world.add(new Watcher(world, { look: WATCHER_LOOK }));
      if (depth >= 1) world.add(new Peeker(world, { look: WATCHER_LOOK }));
      if (depth >= 2) world.add(new Follower(world));
      if (rng.chance(0.4)) world.add(new StrayCat(world));
      // someone lying on a skylight, far from the entrance
      if (depth >= 1 || rng.chance(0.35)) {
        const far = skylights.filter((s) => s.u > 0.35);
        if (far.length) {
          const s = rng.pick(far);
          world.add(new SkylightShadow(world, s.cx + rng.float(-1, 1), ATRIUM - 0.035, s.cz + rng.float(-2, 2)));
        }
      }
    }

    // ---- PA, dust ------------------------------------------------------------------------------------
    let pa = rng.float(22, 38);
    let paIdx = rng.int(0, PA.length - 1);
    let paPending = -1;
    const lines = depth >= 2 ? [...PA, ...PA_DEEP] : PA;
    world.onUpdate = (dt, ctx) => {
      const cam = ctx.camera.position;
      const arr = dGeo.attributes.position.array;
      for (let n = 0; n < dustN; n++) {
        arr[n * 3 + 1] += Math.sin(ctx.t * 0.3 + n) * dt * 0.04;
        arr[n * 3] += dt * 0.025;
      }
      dGeo.attributes.position.needsUpdate = true;
      dust.position.set(Math.round(cam.x / 20) * 20, 0, Math.round(cam.z / 20) * 20);
      if (ctx.attract) return;
      pa -= dt;
      if (pa <= 0) {
        pa = rng.float(40, 90);
        ctx.game.audio.ding();
        paPending = 1.4;
      }
      if (paPending > 0) {
        paPending -= dt;
        if (paPending <= 0) {
          ctx.game.toast(`“${lines[paIdx % lines.length]}”`, 'Public address');
          paIdx++;
        }
      }
    };
  },

  makeDoor(world, dest) {
    return doorModel({
      width: 1.0,
      height: 2.15,
      doorColor: 0x9a9c94,
      frameColor: 0x55575a,
      lightColor: dest.tint || 0xffe6c8,
      knob: 0xc8c8c8,
      extras(group) {
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.16), new THREE.MeshBasicMaterial({ map: signTexture('EMPLOYEES ONLY', '', { bg: '#b01c1c', fg: '#ffffff', w: 512, h: 128 }) }));
        plate.position.set(0, 1.62, 0.1);
        // the plate rides on the door leaf so it swings with it
        const hinge = group.children.find((c) => c.isGroup);
        if (hinge) {
          plate.position.set(0.5, 1.62, 0.03);
          hinge.add(plate);
          const bar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.05), new THREE.MeshStandardMaterial({ color: 0xb8bcc0, metalness: 0.9, roughness: 0.3 }));
          bar.position.set(0.5, 1.0, 0.06);
          hinge.add(bar);
        } else group.add(plate);
      },
    });
  },
};
