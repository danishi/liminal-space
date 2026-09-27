import * as THREE from 'three';
import { glowSprite } from '../core/textures.js';

/** A "memory fragment": a floating crystal with a faint beam of light above it. */
export class Fragment {
  constructor(world, pos, color, memory) {
    this.world = world;
    this.pos = pos.clone();
    this.memory = memory;
    this.color = new THREE.Color(color);
    this.seen = false;
    const g = (this.object = new THREE.Group());
    g.position.copy(pos);

    this.crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.2, 0),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.2, roughness: 0.2, metalness: 0.1, flatShading: true }),
    );
    this.crystal.scale.y = 1.5;
    g.add(this.crystal);

    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    core.scale.y = 1.5;
    this.crystal.add(core);

    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(1.6);
    g.add(halo);
    this.halo = halo;

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.12, 5, 8, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide }),
    );
    beam.position.y = 2.6;
    g.add(beam);
    this.beam = beam;
    this.t = Math.random() * 10;
  }

  update(dt, ctx) {
    this.t += dt;
    this.crystal.rotation.y += dt * 1.2;
    this.object.position.y = this.pos.y + Math.sin(this.t * 1.8) * 0.08;
    this.halo.material.opacity = 0.6 + Math.sin(this.t * 3) * 0.2;
    if (ctx.attract) return;
    const p = ctx.player.pos;
    const d = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
    if (d < 6) this.seen = true;
    if (d < 1.0 && Math.abs(p.y + 1 - this.pos.y) < 1.8) ctx.game.collectFragment(this);
  }
}
