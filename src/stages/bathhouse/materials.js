import * as THREE from 'three';
import { paint, pbr, woodPanel } from '../../core/surfaces.js';
import { caustics } from '../../core/textures.js';
import { photo } from '../../core/assets.js';
import { glazeTexture } from './textures.js';

/** The surfaces of the shell: tiles, wood, plaster, the street and the terrace. */
export function materials(world, lvl) {
  // ---- materials
  const u = Math.min(1, world.depth * 0.12);
  // the scanned mosaic gives grout and relief; the glaze colour is ours
  const mosaic = (key, rgb, uv, opts = {}) => {
    const map = glazeTexture(key, rgb).clone();
    map.repeat.set(uv / 2, uv / 2);
    return photo('square_tiled_wall', { uvScale: uv, map, roughness: 0.3, ...opts });
  };
  const tileFloor = mosaic('floor', [178, 198, 204], 0.55, { roughness: 0.45 });
  const basin = mosaic('basin', [120, 190, 205], 0.6, { emissive: 0xfff0d0, emissiveMap: caustics(), emissiveIntensity: 0.12 });
  const causticMap = basin.emissiveMap;
  const rimMat = photo('terrazzo_tiles', { uvScale: 1.5, roughness: 0.35, color: new THREE.Color(1.0, 1.0, 0.98) });
  const tileWall = mosaic('wall', [226, 236, 236], 0.8, { roughness: 0.22 });
  const tileBand = mosaic('band', [60, 110, 160], 0.8, { roughness: 0.22 });
  const upperBath = pbr(paint('s-bath-upper', [188, 212, 214], { rough: 0.55 }));
  const bathCeil = pbr(paint('s-bath-ceil', [214, 224, 222], { rough: 0.6 }));
  const woodFloor = photo('old_wooden_floor_02', { uvScale: 2, roughness: 0.55, color: new THREE.Color(1.0, 0.92, 0.84) });
  const genkanFloor = photo('terrazzo_tiles', { uvScale: 2, roughness: 0.45, color: new THREE.Color(0.82, 0.8, 0.76) });
  const plaster = photo('beige_wall_001', { uvScale: 2, color: new THREE.Color(1.05, 1.0, 0.92) });
  const wainscot = pbr(woodPanel('s-bath-wainscot', [132, 92, 58], 0.4), { normalScale: 0.6 });
  const woodCeil = photo('brown_planks_03', { uvScale: 1, roughness: 0.6, color: new THREE.Color(1.4, 1.25, 1.05) });
  const riserWood = photo('dark_paneled_wood', { uvScale: 1, roughness: 0.5, color: new THREE.Color(0.75, 0.6, 0.5) });
  const street = photo('concrete_floor_02', { uvScale: 2, roughness: 0.55, color: new THREE.Color(0.62, 0.62, 0.64) });
  const paving = photo('blue_floor_tiles_01', { uvScale: 1.6, roughness: 0.4, color: new THREE.Color(0.55, 0.58, 0.64) });
  const facade = photo('beige_wall_001', { uvScale: 2, color: new THREE.Color(0.78, 0.74, 0.68) });
  const facadeLow = pbr(woodPanel('s-bath-facade', [70, 46, 30], 0.5), { normalScale: 0.6 });
  const backWall = photo('concrete_wall_004', { uvScale: 2, color: new THREE.Color(0.72, 0.72, 0.72) });
  const fence = photo('bamboo_wall', { uvScale: 2, color: 0xb8a888 });
  const terrFloor = photo('stone_pathway_02', { uvScale: 2.2, color: 0xb8b4ac });
  const nightGlass = new THREE.MeshStandardMaterial({ color: 0x1a2a40, roughness: 0.1, metalness: 0.4, emissive: 0x0a1428, emissiveIntensity: 1 });

  Object.assign(lvl, { u, tileFloor, basin, causticMap, rimMat, tileWall, tileBand, upperBath, bathCeil, woodFloor, genkanFloor, plaster, wainscot, woodCeil, riserWood, street, paving, facade, facadeLow, backWall, fence, terrFloor, nightGlass });
}
