import * as THREE from 'three';
import { PostFX } from '../core/postfx.js';
import { AudioEngine } from '../core/audio.js';
import { Input } from '../core/input.js';
import { setMaxAnisotropy } from '../core/textures.js';
import { loadProgress, recordClear } from '../core/settings.js';
import { Player } from './player.js';
import { World } from './world.js';
import { STAGES } from '../stages/index.js';

const QUALITY = {
  low: { pr: 0.75, bloom: false, lights: 4, shadows: false },
  mid: { pr: 1, bloom: true, lights: 6, shadows: false },
  high: { pr: 2, bloom: true, lights: 8, shadows: true },
};

/**
 * Owns the renderer, the loop and the play state machine:
 * title → select → card → playing ⇄ paused → result | gameover
 */
export class Game {
  constructor(canvas, ui, settings) {
    this.canvas = canvas;
    this.ui = ui;
    this.settings = settings;
    this.progress = loadProgress();
    this.state = 'boot';

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    setMaxAnisotropy(this.renderer.capabilities.getMaxAnisotropy());

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.05, 200);
    this.scene.add(this.camera);

    // The flashlight always exists (intensity 0 when off) so the number of
    // lights never changes mid-stage, which would force shader recompiles.
    this.flashlight = new THREE.SpotLight(0xfff1dc, 0, 22, THREE.MathUtils.degToRad(24), 0.45, 1.4);
    this.flashlight.position.set(0.18, -0.12, 0.1);
    this.flashlight.target.position.set(0, -0.18, -1);
    this.camera.add(this.flashlight, this.flashlight.target);

    this.post = new PostFX(this.renderer, this.scene, this.camera);
    this.audio = new AudioEngine();
    this.input = new Input(canvas);
    this.player = new Player(this.camera);

    this.world = null;
    this.stageIndex = 0;
    this.time = 0;
    this.stageTime = 0;
    this.fear = 0;
    this.flash = 0;
    this.staticLevel = 0;
    this.dialog = null;
    this.attractPath = null;
    this.lastFrame = performance.now();
    this.fpsAcc = { t: 0, n: 0 };
    this.lowBatteryWarned = false;

    this.input.onLockChange = (locked) => {
      if (this.state !== 'playing') return;
      if (!locked && !this.input.usingTouch && !this.input.dragLook) {
        // Esc released the pointer: treat as pause
        this.pause();
      }
      this.ui.showResumeHint(!locked && !this.input.usingTouch && !this.input.dragLook && this.state === 'playing');
    };
    this.input.onLockFail = () => {
      if (this.state === 'playing') this.ui.showResumeHint(!this.input.dragLook);
    };
    this.input.onFirstTouch = () => ui.enableTouch(this.input);

    addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });
    this.applySettings(settings);
    this.resize();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  get quality() {
    return QUALITY[this.settings.quality] || QUALITY.mid;
  }

  applySettings(s) {
    this.settings = s;
    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();
    this.audio.setVolumes({ master: s.master, music: s.music, sfx: s.sfx });
    this.post.reduce = s.reduceEffects;
    this.resize();
    if (this.world) this.configureEnv(this.world);
    this.ui.setFpsVisible(s.showFps);
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    const pr = Math.min(devicePixelRatio || 1, this.quality.pr);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h, pr);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---- stage lifecycle ------------------------------------------------------

  buildWorld(index, { attract = false, seed = (Math.random() * 1e9) | 0 } = {}) {
    if (this.world) {
      this.world.dispose();
      this.world = null;
    }
    const stage = STAGES[index];
    const world = new World(this, stage, seed, { attract, lights: this.quality.lights });
    this.scene.add(world.root);
    this.world = world;
    this.stageIndex = index;
    this.configureEnv(world);
    this.player.reset({ ...world.spawn, y: world.floorAt(world.spawn.x, world.spawn.z) });
    this.player.flashlight = world.env.flashlightOn;
    this.player.update(0, { consumeLook: () => ({ x: 0, y: 0 }), move: () => ({ x: 0, y: 0 }), down: () => false }, world, this.settings, true);
    this.attractPath = null;
    this.fear = 0;
    this.staticLevel = 0;
    // warm up shaders so the first frame of play doesn't hitch
    this.renderer.compile(this.scene, this.camera);
    return world;
  }

  configureEnv(world) {
    const env = world.env;
    this.scene.background = new THREE.Color(env.background);
    this.scene.fog = env.fog;
    this.renderer.toneMapping = env.toneMapping ?? THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = env.exposure;
    this.renderer.shadowMap.enabled = !!env.shadows && this.quality.shadows;
    this.post.configure(env.postfx, this.quality.bloom);
    this.flashlight.intensity = 0;
    this.flashlight.distance = env.flashlightDistance || 22;
  }

  showTitle() {
    this.state = 'title';
    this.input.enabled = false;
    this.buildWorld(0, { attract: true, seed: 7 });
    this.ui.show('title');
    this.ui.hud(false);
  }

  previewStage(index) {
    if (this.state !== 'select' && this.state !== 'title') return;
    if (this.world && this.world.attract && this.stageIndex === index) return;
    this.buildWorld(index, { attract: true, seed: 11 + index });
    if (this.audio.ready) this.startAmbience();
  }

  async enterStage(index) {
    this.audio.init();
    await this.ui.fadeOut();
    this.buildWorld(index);
    this.stageTime = 0;
    this.state = 'card';
    this.ui.hud(false);
    this.ui.showCard(STAGES[index]);
    this.startAmbience();
    await this.ui.fadeIn();
  }

  startAmbience() {
    if (!this.world) return;
    this.audio.setReverb(...this.world.env.reverb);
    this.audio.setAmbience(this.world.env.ambience);
  }

  beginPlay() {
    this.audio.init();
    this.audio.setDucked(false);
    this.state = 'playing';
    this.input.enabled = true;
    this.ui.show(null);
    this.ui.hud(true, this.world);
    this.ui.controlsHint(this.world.env.flashlight);
    this.input.requestLock();
    this.world.stage.onEnter?.(this.world, this);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.closeDialog();
    this.state = 'paused';
    this.input.enabled = false;
    this.input.releaseLock();
    this.audio.setDucked(true);
    this.ui.showResumeHint(false);
    this.ui.showPause(this.world, this.stageTime);
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.input.enabled = true;
    this.audio.setDucked(false);
    this.ui.show(null);
    this.input.requestLock();
    if (!this.input.locked && !this.input.usingTouch && !this.input.dragLook) this.ui.showResumeHint(true);
  }

  async restart() {
    await this.enterStage(this.stageIndex);
  }

  async quitToSelect() {
    this.input.enabled = false;
    this.input.releaseLock();
    this.closeDialog();
    this.audio.setDucked(false);
    this.audio.setFear(0);
    await this.ui.fadeOut();
    this.state = 'select';
    this.buildWorld(this.stageIndex, { attract: true, seed: 11 + this.stageIndex });
    this.startAmbience();
    this.ui.hud(false);
    this.ui.showSelect(this.progress, this.stageIndex);
    await this.ui.fadeIn();
  }

  // ---- events from the world ----------------------------------------------

  collectFragment(f) {
    const w = this.world;
    w.collect(f);
    this.audio.pickup();
    this.flash = 0.25;
    const n = w.collected;
    const total = w.fragments.length;
    this.toast(`記憶の欠片 ${n} / ${total}`, f.memory ? `「${f.memory}」` : null, 'accent');
    if (n >= total) {
      setTimeout(() => {
        if (this.state !== 'playing') return;
        this.audio.unlock();
        this.toast('どこかで扉の開く音がした', '地図に出口が記された', 'accent');
      }, 1400);
    }
    this.ui.updateObjective(w);
  }

  caught(entity) {
    if (this.state !== 'playing') return;
    this.gameOver(entity.catchTitle, entity.catchLine, entity);
  }

  gameOver(title, line, entity = null) {
    this.state = 'dying';
    this.input.enabled = false;
    this.closeDialog();
    this.audio.caught();
    this.deathTimer = 1.3;
    this.deathEntity = entity;
    this.deathText = { title, line };
  }

  finishDeath() {
    this.state = 'gameover';
    this.input.releaseLock();
    this.audio.setFear(0);
    this.audio.setDucked(true);
    this.ui.hud(false);
    this.ui.showGameOver(this.deathText.title, this.deathText.line);
  }

  clearStage() {
    if (this.state !== 'playing') return;
    this.state = 'clearing';
    this.input.enabled = false;
    this.input.releaseLock();
    this.closeDialog();
    this.audio.door();
    this.audio.setFear(0);
    const stage = this.world.stage;
    const { best, isRecord } = recordClear(this.progress, stage.id, this.stageTime);
    const memories = this.world.fragments.map((f) => f.memory).filter(Boolean);
    this.ui.fadeOut(true).then(() => {
      this.state = 'result';
      this.ui.hud(false);
      const next = this.stageIndex + 1 < STAGES.length ? STAGES[this.stageIndex + 1] : null;
      this.ui.showResult(stage, this.stageTime, best, isRecord, memories, next);
      this.ui.fadeIn();
    });
  }

  async nextStage() {
    const next = (this.stageIndex + 1) % STAGES.length;
    await this.enterStage(next);
  }

  toast(title, sub = null, kind = '') {
    this.ui.toast(title, sub, kind);
  }

  openDialog(name, lines, voice, onClose) {
    this.dialog = { name, lines, voice, onClose, index: 0 };
    this.ui.dialog(name, lines[0], voice, this.audio);
  }

  advanceDialog() {
    const d = this.dialog;
    if (!d) return;
    if (!this.ui.dialogDone()) {
      this.ui.dialogSkip();
      return;
    }
    d.index++;
    if (d.index >= d.lines.length) this.closeDialog();
    else this.ui.dialog(d.name, d.lines[d.index], d.voice, this.audio);
  }

  closeDialog() {
    if (!this.dialog) return;
    const d = this.dialog;
    this.dialog = null;
    this.ui.dialog(null);
    d.onClose?.();
  }

  // ---- per-frame ------------------------------------------------------------

  loop() {
    requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.time += dt;
    this.input.pollGamepad(dt);
    const wasPaused = this.state === 'paused';

    if (this.state === 'playing') this.updatePlay(dt);
    else if (this.state === 'dying') this.updateDying(dt);
    else if (this.world && this.world.attract) this.updateAttract(dt);
    else if (this.world) {
      // card / paused / result: keep the world ticking gently for ambience
      this.world.update(0, this.ctx(0));
    }
    if (wasPaused && this.state === 'paused' && this.input.pressed('pause') && this.ui.current === 'pause') this.resume();

    if (this.world) {
      this.audio.updateListener(this.camera);
      this.audio.update(dt);
      this.flash = Math.max(0, this.flash - dt * 1.5);
      this.post.update(this.time, this.fear, { static: this.staticLevel, desat: this.desat || 0, flash: this.flash });
      this.post.render(dt);
    }

    this.fpsAcc.t += dt;
    this.fpsAcc.n++;
    if (this.fpsAcc.t > 0.5) {
      this.ui.fps(this.fpsAcc.n / this.fpsAcc.t);
      this.fpsAcc.t = 0;
      this.fpsAcc.n = 0;
    }
    this.input.endFrame();
  }

  ctx(dt) {
    return { t: this.time, dt, player: this.player, camera: this.camera, game: this, world: this.world, attract: this.world?.attract, settings: this.settings };
  }

  updatePlay(dt) {
    const inp = this.input;
    const w = this.world;
    const p = this.player;
    this.stageTime += dt;

    if (inp.pressed('pause')) {
      if (this.ui.bigMapOpen) this.ui.toggleBigMap(false);
      else if (this.dialog) this.closeDialog();
      else return this.pause();
    }
    if (inp.pressed('map')) this.ui.toggleBigMap();

    const frozen = !!this.dialog || this.ui.bigMapOpen;
    const step = p.update(dt, inp, w, this.settings, frozen);
    if (step) this.audio.step(step, p.running ? 1.3 : 0.8);

    // flashlight
    if (w.env.flashlight) {
      if (inp.pressed('flashlight')) {
        if (p.battery <= 0.5 && !p.flashlight) this.toast('電池が切れている', '消しておけば少しずつ回復する', 'danger');
        else {
          p.flashlight = !p.flashlight;
          this.audio.uiClick();
        }
      }
      if (p.flashlight) {
        p.battery = Math.max(0, p.battery - dt * (w.env.batteryDrain ?? 0.9));
        if (p.battery <= 0) {
          p.flashlight = false;
          this.toast('懐中電灯の電池が切れた', '消しておけば少しずつ回復する', 'danger');
        }
      } else p.battery = Math.min(100, p.battery + dt * 3);
      if (p.flashlight && p.battery < 20 && !this.lowBatteryWarned) {
        this.lowBatteryWarned = true;
        this.toast('電池が残り少ない', null, 'danger');
      }
      if (p.battery > 40) this.lowBatteryWarned = false;
      let li = p.flashlight ? w.env.flashlightIntensity : 0;
      if (p.flashlight && p.battery < 20 && Math.random() < 0.08) li *= 0.2;
      this.flashlight.intensity += (li - this.flashlight.intensity) * Math.min(1, dt * 25);
    } else if (inp.pressed('flashlight')) {
      this.toast('ここでは明かりは要らないようだ');
    }

    // world
    w.update(dt, this.ctx(dt));
    if (this.state !== 'playing') return;

    // interaction
    const target = frozen ? null : this.findInteractable();
    this.ui.setPrompt(target ? target.prompt : null, inp.usingTouch);
    if (inp.pressed('interact')) {
      if (this.dialog) this.advanceDialog();
      else if (target) target.interact(this);
    }

    // threat, fear & sanity
    let threat = 0;
    for (const e of w.entities) if (e.hostile) threat = Math.max(threat, e.threat || 0);
    let drain = threat * 7;
    if (w.env.darkness > 0) {
      const lit = p.flashlight ? 0.12 : this.nearLight(p.pos) ? 0.35 : 1;
      drain += w.env.darkness * lit * 1.4;
    }
    if (w.env.extraDrain) drain += w.env.extraDrain(w, this);
    if (drain > 0.05) p.sanity = Math.max(0, p.sanity - drain * dt);
    else p.sanity = Math.min(100, p.sanity + w.env.sanityRegen * dt);
    if (p.sanity <= 0) {
      this.gameOver('正気を失った', '壁の模様が意味を持ちはじめた。そこから先の記録はない。');
      return;
    }
    const insanity = Math.max(0, 1 - p.sanity / 60);
    const targetFear = Math.max(threat, insanity * 0.8);
    this.fear += (targetFear - this.fear) * Math.min(1, dt * 2);
    this.audio.setFear(this.fear);
    this.desat = Math.max(0, 1 - p.sanity / 50) * 0.6;
    this.staticLevel = Math.max(0, this.fear - 0.75) * 0.5 + (Math.random() < insanity * 0.02 ? 0.4 : 0);

    this.ui.updateHud(this, dt);
    this.ui.drawMinimap(w, p);
  }

  nearLight(pos) {
    const lp = this.world.lightPool;
    if (!lp) return false;
    for (const l of lp.lights) {
      if (l.intensity > 0.4 * lp.baseIntensity && l.position.distanceTo(pos) < 3.5) return true;
    }
    return false;
  }

  findInteractable() {
    const p = this.player;
    const fwd = p.forward(new THREE.Vector3());
    const cam = this.camera.position;
    let best = null;
    let bestScore = -Infinity;
    for (const e of this.world.interactables) {
      if (e.enabled === false) continue;
      const tp = e.pos || e.object.position;
      const dx = tp.x - cam.x;
      const dz = tp.z - cam.z;
      const dy = tp.y + (e.aimHeight || 0) - cam.y;
      const dist = Math.hypot(dx, dz);
      if (dist > (e.interactRange || 2.4)) continue;
      const len = Math.hypot(dx, dy, dz);
      const dot = (fwd.x * dx + fwd.y * dy + fwd.z * dz) / len;
      if (dot < 0.72 && dist > 1.1) continue;
      const score = dot - dist * 0.1;
      if (score > bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  updateDying(dt) {
    this.deathTimer -= dt;
    const e = this.deathEntity;
    if (e && e.object) {
      // snap the view toward what caught us
      const p = e.object.position;
      const yaw = Math.atan2(-(p.x - this.player.pos.x), -(p.z - this.player.pos.z));
      let diff = yaw - this.player.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.player.yaw += diff * Math.min(1, dt * 10);
      this.player.pitch += (0.12 - this.player.pitch) * Math.min(1, dt * 8);
      this.camera.rotation.set(this.player.pitch, this.player.yaw, Math.sin(this.time * 40) * 0.02);
    }
    this.fear = 1;
    this.staticLevel = Math.min(1, 0.3 + (1.3 - this.deathTimer) * 0.8);
    if (this.world) this.world.update(0, this.ctx(0));
    if (this.deathTimer <= 0) this.finishDeath();
  }

  updateAttract(dt) {
    const w = this.world;
    const g = w.grid;
    const cam = this.camera;
    // drift along random BFS paths at walking pace
    if (!this.attractPath || !this.attractPath.length) {
      const [ci, cj] = g.cellOf(this.player.pos.x, this.player.pos.z);
      for (let k = 0; k < 30; k++) {
        const i = ci + w.rng.int(-10, 10);
        const j = cj + w.rng.int(-10, 10);
        if (!g.walkable(i, j)) continue;
        const path = g.path(ci, cj, i, j);
        if (path && path.length > 4) {
          this.attractPath = path;
          break;
        }
      }
    }
    const p = this.player;
    if (this.attractPath && this.attractPath.length) {
      const [i, j] = this.attractPath[0];
      const c = g.center(i, j);
      const dx = c.x - p.pos.x;
      const dz = c.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.4) this.attractPath.shift();
      else {
        const s = Math.min(d, 1.1 * dt);
        p.pos.x += (dx / d) * s;
        p.pos.z += (dz / d) * s;
        w.collide(p.pos, 0.3);
        const yaw = Math.atan2(-dx, -dz);
        let diff = yaw - p.yaw;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        p.yaw += diff * Math.min(1, dt * 0.9);
      }
    }
    p.pos.y += (w.floorAt(p.pos.x, p.pos.z) - p.pos.y) * Math.min(1, dt * 4);
    cam.position.set(p.pos.x, p.pos.y + p.eye + Math.sin(this.time * 1.3) * 0.02, p.pos.z);
    cam.rotation.set(Math.sin(this.time * 0.21) * 0.06, p.yaw, 0);
    this.fear = 0;
    this.staticLevel = 0;
    this.desat = 0;
    w.update(dt, this.ctx(dt));
  }
}
