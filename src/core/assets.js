import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { SessionCache, textureBytes } from './cache.js';
import { shrinkImage, textureDetail } from './textures.js';

// Photo-scanned CC0 assets from Poly Haven (fetched and optimized by
// scripts/fetch-assets.mjs into public/assets). Stages declare what they need
// in `assets`, the game preloads it before building, and builders then use
// the synchronous getters below. Loaded assets live in a session cache; below
// full texture detail their textures are scaled down as they load.

const BASE = `${import.meta.env.BASE_URL}assets/`;

let manifest = null;
let aniso = 8;
// 'tex:id' → { map, normalMap, arm, size }, 'model:id' → Group, 'hdri:id' → DataTexture
const cache = new SessionCache();
const pending = new Map();

const texLoader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const hdrLoader = new HDRLoader();

export function setAssetAnisotropy(n) {
  aniso = Math.min(16, n || 1);
}

async function loadManifest() {
  if (!manifest) manifest = await (await fetch(`${BASE}manifest.json`)).json();
  return manifest;
}

function once(key, fn) {
  if (cache.has(key)) {
    cache.touch(key);
    return Promise.resolve();
  }
  if (!pending.has(key)) pending.set(key, fn().finally(() => pending.delete(key)));
  return pending.get(key);
}

function loadTex(url, srgb) {
  return new Promise((resolve, reject) => {
    texLoader.load(url, (t) => {
      const d = textureDetail();
      if (d < 1) t.image = shrinkImage(t.image, d);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = aniso;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      resolve(t);
    }, undefined, reject);
  });
}

function loadTextureSet(id) {
  const key = `tex:${id}`;
  return once(key, async () => {
    const m = await loadManifest();
    const [map, normalMap, arm] = await Promise.all([
      loadTex(`${BASE}tex/${id}/diff.webp`, true),
      loadTex(`${BASE}tex/${id}/nor.webp`, false),
      loadTex(`${BASE}tex/${id}/arm.webp`, false),
    ]);
    const set = { map, normalMap, arm, size: m.textures[id]?.size || [2, 2] };
    const bytes = textureBytes(map) + textureBytes(normalMap) + textureBytes(arm);
    cache.set(key, set, bytes, (s) => [s.map, s.normalMap, s.arm].forEach((t) => t.dispose()));
  });
}

function modelTextures(root) {
  const out = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const mt of Array.isArray(o.material) ? o.material : [o.material]) {
      for (const k in mt) if (mt[k]?.isTexture) out.add(mt[k]);
    }
  });
  return out;
}

/** Colour maps whose alpha is used: a 2D canvas would premultiply them, darkening cut-out edges. */
function alphaImages(root) {
  const out = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const mt of Array.isArray(o.material) ? o.material : [o.material]) {
      if ((mt.transparent || mt.alphaTest > 0) && mt.map) out.add(mt.map.image);
    }
  });
  return out;
}

/** Frees a cached model: its geometry, materials and their textures. */
function freeModel(wrap) {
  wrap.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.dispose();
    for (const mt of Array.isArray(o.material) ? o.material : [o.material]) mt.dispose();
  });
  for (const t of modelTextures(wrap)) t.dispose();
}

/** Loads a model, recentres it on its footprint and rests it on y = 0. */
function loadModel(id) {
  const key = `model:${id}`;
  return once(key, async () => {
    const gltf = await gltfLoader.loadAsync(`${BASE}models/${id}.glb`);
    const root = gltf.scene;
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const c = box.getCenter(new THREE.Vector3());
    const wrap = new THREE.Group();
    root.position.set(-c.x, -box.min.y, -c.z);
    wrap.add(root);
    let bytes = 0;
    root.traverse((o) => {
      if (o.isMesh) {
        o.geometry.userData.shared = true;
        for (const a of Object.values(o.geometry.attributes)) bytes += a.array.byteLength;
        if (o.geometry.index) bytes += o.geometry.index.array.byteLength;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const mt of mats) mt.userData.shared = true;
      }
    });
    // below full detail, swap each decoded image for a smaller copy before it is uploaded
    // (textures may share an image, or even a source)
    const textures = modelTextures(root);
    const d = textureDetail();
    const small = new Map();
    const keep = alphaImages(root);
    if (d < 1) for (const t of textures) if (t.image && !keep.has(t.image) && !small.has(t.image)) small.set(t.image, shrinkImage(t.image, d));
    const images = new Set();
    for (const t of textures) {
      if (small.has(t.image)) t.image = small.get(t.image);
      t.anisotropy = aniso;
      if (!images.has(t.image)) bytes += textureBytes(t);
      images.add(t.image);
    }
    for (const img of small.keys()) img.close?.();
    wrap.userData.size = box.getSize(new THREE.Vector3());
    cache.set(key, wrap, bytes, freeModel);
  });
}

/** Averages 2×2 texels of a half-float RGBA equirect: a quarter of the memory. */
function halveHDR(t) {
  const { data, width: w, height: h } = t.image;
  const W = w >> 1;
  const H = h >> 1;
  const out = new Uint16Array(W * H * 4);
  const f = THREE.DataUtils.fromHalfFloat;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const a = (y * 2 * w + x * 2) * 4;
      const b = a + w * 4;
      for (let c = 0; c < 4; c++) {
        const v = f(data[a + c]) + f(data[a + 4 + c]) + f(data[b + c]) + f(data[b + 4 + c]);
        out[(y * W + x) * 4 + c] = THREE.DataUtils.toHalfFloat(v * 0.25);
      }
    }
  }
  t.image = { data: out, width: W, height: H };
}

function loadHDRI(id) {
  const key = `hdri:${id}`;
  return once(key, async () => {
    const t = await hdrLoader.loadAsync(`${BASE}hdri/${id}.hdr`);
    if (textureDetail() < 1 && t.type === THREE.HalfFloatType) halveHDR(t);
    t.mapping = THREE.EquirectangularReflectionMapping;
    cache.set(key, t, textureBytes(t), (tex) => tex.dispose());
  });
}

const specKeys = (spec = {}) => [
  ...(spec.textures || []).map((id) => `tex:${id}`),
  ...(spec.models || []).map((id) => `model:${id}`),
  ...(spec.hdris || []).map((id) => `hdri:${id}`),
];

/** Loads everything a stage lists in `assets` ({ textures, models, hdris }). */
export async function preload(spec = {}) {
  await Promise.all([
    ...(spec.textures || []).map(loadTextureSet),
    ...(spec.models || []).map(loadModel),
    ...(spec.hdris || []).map(loadHDRI),
  ]);
}

/** Marks what a stage lists as wanted by the level about to load, so trimming the caches keeps it. */
export function retainAssets(spec) {
  for (const key of specKeys(spec)) cache.touch(key);
}

const fetched = new Set();

/**
 * Downloads a stage's files into the HTTP cache without decoding anything, so
 * a later preload() only has to parse them. Cheap enough to run while playing.
 */
export function prefetch(spec = {}) {
  const loaded = (key) => cache.has(key) || pending.has(key);
  const urls = [];
  for (const id of spec.textures || []) if (!loaded(`tex:${id}`)) urls.push(...['diff', 'nor', 'arm'].map((m) => `${BASE}tex/${id}/${m}.webp`));
  for (const id of spec.models || []) if (!loaded(`model:${id}`)) urls.push(`${BASE}models/${id}.glb`);
  for (const id of spec.hdris || []) if (!loaded(`hdri:${id}`)) urls.push(`${BASE}hdri/${id}.hdr`);
  for (const url of urls) {
    if (fetched.has(url)) continue;
    fetched.add(url);
    fetch(url, { priority: 'low' })
      .then((r) => r.blob())
      .catch(() => fetched.delete(url));
  }
}

/** A repeated clone of one map from a texture set ('map' | 'normalMap' | 'arm'). */
export function texMap(id, which, uvScale = 1) {
  const s = cache.get(`tex:${id}`);
  if (!s) throw new Error(`texture set not preloaded: ${id}`);
  const [su, sv] = Array.isArray(uvScale) ? uvScale : [uvScale, uvScale];
  const c = s[which].clone();
  c.repeat.set(su / s.size[0], sv / s.size[1]);
  return c;
}

export function hasModel(id) {
  return cache.has(`model:${id}`);
}

/** The cached model itself, not a clone: a key for caches of things made from it. */
export function loadedModel(id) {
  const m = cache.get(`model:${id}`);
  if (!m) throw new Error(`model not preloaded: ${id}`);
  return m;
}

/** A clone of a preloaded model (geometry and materials are shared). */
export function model(id) {
  return loadedModel(id).clone(true);
}

export function modelSize(id) {
  return cache.get(`model:${id}`)?.userData.size || new THREE.Vector3(1, 1, 1);
}

export function hdri(id) {
  return cache.get(`hdri:${id}`);
}

/**
 * Material from a photo texture set. UVs in this project are in world units
 * divided by the builder's scale, so pass the same `uvScale` the geometry used;
 * the texture is repeated to match its real-world size.
 * opts: { uvScale, color, map: override colour map, normalScale, roughness, useMap }
 */
export function photo(id, opts = {}) {
  const s = cache.get(`tex:${id}`);
  if (!s) throw new Error(`texture set not preloaded: ${id}`);
  const { uvScale = 1, color = 0xffffff, normalScale = 1, map = null, roughness = 1, metalness = 0, ...rest } = opts;
  const [su, sv] = Array.isArray(uvScale) ? uvScale : [uvScale, uvScale];
  const rep = (t) => {
    const c = t.clone();
    c.repeat.set(su / s.size[0], sv / s.size[1]);
    return c;
  };
  return new THREE.MeshStandardMaterial({
    map: map || rep(s.map),
    normalMap: rep(s.normalMap),
    normalScale: new THREE.Vector2(normalScale, normalScale),
    roughnessMap: rep(s.arm),
    aoMap: rep(s.arm),
    aoMapIntensity: 0.8,
    color,
    roughness,
    metalness,
    ...rest,
  });
}
