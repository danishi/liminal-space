import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// Photo-scanned CC0 assets from Poly Haven (fetched and optimized by
// scripts/fetch-assets.mjs into public/assets). Stages declare what they need
// in `assets`, the game preloads it before building, and builders then use
// the synchronous getters below.

const BASE = `${import.meta.env.BASE_URL}assets/`;

let manifest = null;
let aniso = 8;
const texSets = new Map();
const models = new Map();
const hdris = new Map();
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
  if (!pending.has(key)) pending.set(key, fn());
  return pending.get(key);
}

function loadTex(url, srgb) {
  return new Promise((resolve, reject) => {
    texLoader.load(url, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = aniso;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.userData.cached = true;
      // decode off the main thread now rather than at the first upload
      Promise.resolve(t.image?.decode?.()).catch(() => {}).then(() => resolve(t));
    }, undefined, reject);
  });
}

function loadTextureSet(id) {
  return once(`tex:${id}`, async () => {
    const m = await loadManifest();
    const [map, normalMap, arm] = await Promise.all([
      loadTex(`${BASE}tex/${id}/diff.webp`, true),
      loadTex(`${BASE}tex/${id}/nor.webp`, false),
      loadTex(`${BASE}tex/${id}/arm.webp`, false),
    ]);
    texSets.set(id, { map, normalMap, arm, size: m.textures[id]?.size || [2, 2] });
  });
}

/** Loads a model, recentres it on its footprint and rests it on y = 0. */
function loadModel(id) {
  return once(`model:${id}`, async () => {
    const gltf = await gltfLoader.loadAsync(`${BASE}models/${id}.glb`);
    const root = gltf.scene;
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const c = box.getCenter(new THREE.Vector3());
    const wrap = new THREE.Group();
    root.position.set(-c.x, -box.min.y, -c.z);
    wrap.add(root);
    root.traverse((o) => {
      if (o.isMesh) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const mt of mats) {
          for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) {
            if (mt[k]) {
              mt[k].anisotropy = aniso;
              mt[k].userData.cached = true;
            }
          }
          mt.userData.shared = true;
        }
      }
    });
    wrap.userData.size = box.getSize(new THREE.Vector3());
    models.set(id, wrap);
  });
}

function loadHDRI(id) {
  return once(`hdri:${id}`, async () => {
    const t = await hdrLoader.loadAsync(`${BASE}hdri/${id}.hdr`);
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.userData.cached = true;
    hdris.set(id, t);
  });
}

/** Loads everything a stage lists in `assets` ({ textures, models, hdris }). */
export async function preload(spec = {}) {
  await Promise.all([
    ...(spec.textures || []).map(loadTextureSet),
    ...(spec.models || []).map(loadModel),
    ...(spec.hdris || []).map(loadHDRI),
  ]);
}

const fetched = new Set();

/**
 * Downloads a stage's files into the HTTP cache without decoding anything, so
 * a later preload() only has to parse them. Cheap enough to run while playing.
 */
export function prefetch(spec = {}) {
  const urls = [];
  for (const id of spec.textures || []) if (!pending.has(`tex:${id}`)) urls.push(...['diff', 'nor', 'arm'].map((m) => `${BASE}tex/${id}/${m}.webp`));
  for (const id of spec.models || []) if (!pending.has(`model:${id}`)) urls.push(`${BASE}models/${id}.glb`);
  for (const id of spec.hdris || []) if (!pending.has(`hdri:${id}`)) urls.push(`${BASE}hdri/${id}.hdr`);
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
  const s = texSets.get(id);
  if (!s) throw new Error(`texture set not preloaded: ${id}`);
  const [su, sv] = Array.isArray(uvScale) ? uvScale : [uvScale, uvScale];
  const c = s[which].clone();
  c.repeat.set(su / s.size[0], sv / s.size[1]);
  c.userData.cached = true;
  return c;
}

export function hasModel(id) {
  return models.has(id);
}

/** A clone of a preloaded model (geometry and materials are shared). */
export function model(id) {
  const m = models.get(id);
  if (!m) throw new Error(`model not preloaded: ${id}`);
  return m.clone(true);
}

export function modelSize(id) {
  return models.get(id)?.userData.size || new THREE.Vector3(1, 1, 1);
}

export function hdri(id) {
  return hdris.get(id);
}

/**
 * Material from a photo texture set. UVs in this project are in world units
 * divided by the builder's scale, so pass the same `uvScale` the geometry used;
 * the texture is repeated to match its real-world size.
 * opts: { uvScale, color, map: override colour map, normalScale, roughness, useMap }
 */
export function photo(id, opts = {}) {
  const s = texSets.get(id);
  if (!s) throw new Error(`texture set not preloaded: ${id}`);
  const { uvScale = 1, color = 0xffffff, normalScale = 1, map = null, roughness = 1, metalness = 0, ...rest } = opts;
  const [su, sv] = Array.isArray(uvScale) ? uvScale : [uvScale, uvScale];
  const rep = (t) => {
    const c = t.clone();
    c.repeat.set(su / s.size[0], sv / s.size[1]);
    c.userData.cached = true;
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
