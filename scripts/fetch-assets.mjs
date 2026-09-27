// Downloads CC0 assets from Poly Haven (https://polyhaven.com) and optimizes
// them for the web. Outputs go to public/assets/ and are committed, so the
// game build never needs network access.
//
//   node scripts/fetch-assets.mjs            # fetch anything missing
//   node scripts/fetch-assets.mjs --force    # re-fetch everything
//
// Textures: 1k diffuse / normal (GL) / ARM (ao, roughness, metalness) → WebP.
// Models:   1k glTF → GLB with WebP textures (max 1024) and meshopt geometry.
// HDRIs:    .hdr at the listed resolution.

import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, textureCompress, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const OUT = 'public/assets';
const FORCE = process.argv.includes('--force');

export const TEXTURES = [
  'dirty_carpet', 'decrepit_wallpaper', 'long_white_tiles', 'linoleum_brown',
  'beige_wall_001', 'painted_concrete', 'concrete_floor_02', 'bamboo_wall', 'stone_pathway_02', 'clean_pebbles',
  'dark_paneled_wood', 'gravel', 'ceiling_interior', 'brown_planks_03',
];

export const MODELS = [
  // office / backrooms
  'cardboard_box_01', 'WetFloorSign_01', 'metal_office_desk', 'plastic_monobloc_chair_01', 'metal_trash_can',
  'drawer_cabinet', 'korean_fire_extinguisher_01', 'Television_01', 'ladder_sectioned_01', 'fire_alarm',
  // pool
  'rubber_duck_toy', 'lifebuoy', 'potted_plant_02',
  // school
  'SchoolDesk_01', 'SchoolChair_01', 'wall_clock', 'plastic_broom',
  // station
  'korean_public_payphone_01', 'security_camera_01', 'utility_box_01', 'trashbag', 'vintage_suitcase',
  // shrine
  'wooden_lantern_01', 'rock_moss_set_01', 'fern_02', 'wooden_bucket_01',
  // hotel
  'ArmChair_01', 'Sofa_01', 'CoffeeCart_01', 'Chandelier_02', 'ClassicNightstand_01', 'fancy_picture_frame_01',
  'ornate_mirror_01', 'vintage_grandfather_clock_01', 'antique_ceramic_vase_01',
];

export const HDRIS = { qwantani_night_puresky: '2k', stuttgart_suburbs: '1k' };

function curl(url, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  execFileSync('curl', ['-sSfL', '-m', '180', '-o', dest, url]);
}

function api(path) {
  return JSON.parse(execFileSync('curl', ['-sSfL', '-m', '60', `https://api.polyhaven.com/${path}`]).toString());
}

async function fetchTexture(id, info) {
  const dir = join(OUT, 'tex', id);
  if (!FORCE && existsSync(join(dir, 'arm.webp'))) return;
  const files = api(`files/${id}`);
  const tmp = join(tmpdir(), `ph-${id}`);
  mkdirSync(tmp, { recursive: true });
  mkdirSync(dir, { recursive: true });
  const maps = { diff: ['Diffuse', 82], nor: ['nor_gl', 90], arm: ['arm', 85] };
  for (const [name, [key, q]] of Object.entries(maps)) {
    const src = files[key]?.['1k']?.jpg?.url || files[key]?.['1k']?.png?.url;
    if (!src) throw new Error(`${id}: no ${key}`);
    const tmpFile = join(tmp, `${name}.img`);
    curl(src, tmpFile);
    await sharp(tmpFile).resize(1024, 1024, { fit: 'fill' }).webp({ quality: q }).toFile(join(dir, `${name}.webp`));
  }
  rmSync(tmp, { recursive: true, force: true });
  console.log('texture', id);
  return { size: (info.dimensions || [2000, 2000]).map((mm) => mm / 1000) };
}

async function fetchModel(id) {
  const dest = join(OUT, 'models', `${id}.glb`);
  if (!FORCE && existsSync(dest)) return;
  const files = api(`files/${id}`);
  const g = files.gltf['1k'].gltf;
  const tmp = join(tmpdir(), `ph-${id}`);
  rmSync(tmp, { recursive: true, force: true });
  curl(g.url, join(tmp, `${id}.gltf`));
  for (const [rel, f] of Object.entries(g.include)) curl(f.url, join(tmp, rel));
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.read(join(tmp, `${id}.gltf`));
  await doc.transform(
    dedup(),
    prune(),
    weld(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 82 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  mkdirSync(dirname(dest), { recursive: true });
  await io.write(dest, doc);
  rmSync(tmp, { recursive: true, force: true });
  console.log('model', id);
}

function fetchHdri(id, res) {
  const dest = join(OUT, 'hdri', `${id}.hdr`);
  if (!FORCE && existsSync(dest)) return;
  const files = api(`files/${id}`);
  curl(files.hdri[res].hdr.url, dest);
  console.log('hdri', id);
}

const manifestPath = join(OUT, 'manifest.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { textures: {}, models: [], hdris: [] };
const all = api('assets?t=textures');
for (const id of TEXTURES) {
  const r = await fetchTexture(id, all[id] || {});
  manifest.textures[id] = r || manifest.textures[id] || { size: (all[id]?.dimensions || [2000, 2000]).map((mm) => mm / 1000) };
}
for (const id of MODELS) await fetchModel(id);
for (const [id, res] of Object.entries(HDRIS)) fetchHdri(id, res);
manifest.models = MODELS;
manifest.hdris = Object.keys(HDRIS);
manifest.source = 'Poly Haven (https://polyhaven.com), CC0 1.0';
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log('done');
