import * as THREE from 'three';
import { PostFX } from '../core/postfx.js';
import { AudioEngine } from '../core/audio.js';
import { Input } from '../core/input.js';
import { setMaxAnisotropy } from '../core/textures.js';
import { setSurfaceAnisotropy } from '../core/surfaces.js';
import { preload, prefetch, setAssetAnisotropy } from '../core/assets.js';
import { prewarm } from '../entities/looks.js';
import { pickBleed } from './bleed.js';
import { Player } from './player.js';
import { World } from './world.js';
import { STAGES, loadStage } from '../stages/index.js';

const _fwd = new THREE.Vector3();

const QUALITY = {
  low: { pr: 0.75, bloom: false, lights: 4, shadows: false, ao: false, env: 128, probeFollow: false, msaa: 0 },
  mid: { pr: 1, bloom: true, lights: 6, shadows: false, ao: true, env: 256, probeFollow: false, msaa: 4 },
  high: { pr: 1.5, bloom: true, lights: 8, shadows: true, ao: true, env: 256, probeFollow: true, msaa: 4 },
};

/**
 * Owns the renderer, the loop and the drift between levels:
 * title (attract) → drifting ⇄ paused. Each level is picked at random and
 * lasts until its signal fades, you take a door, or you fall.
 */
export class Game {
  constructor(canvas, ui, settings) {
    this.canvas = canvas;
    this.ui = ui;
    this.settings = settings;
    this.state = 'boot';

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    const aniso = this.renderer.capabilities.getMaxAnisotropy();
    setMaxAnisotropy(aniso);
    setSurfaceAnisotropy(aniso);
    setAssetAnisotropy(aniso);
    this.pmrem = new THREE.PMREMGenerator(this.renderer);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.05, 220);
    this.scene.add(this.camera);

    // The flashlight always exists (intensity 0 when off) so the number of
    // lights never changes mid-level, which would force shader recompiles.
    this.flashlight = new THREE.SpotLight(0xfff1dc, 0, 26, THREE.MathUtils.degToRad(30), 0.55, 1.2);
    this.flashlight.position.set(0.18, -0.12, 0.1);
    this.flashlight.target.position.set(0, -0.18, -1);
    this.flashlight.shadow.mapSize.set(1024, 1024);
    this.flashlight.shadow.bias = -0.0004;
    this.flashlight.shadow.normalBias = 0.03;
    this.flashlight.shadow.camera.near = 0.2;
    this.flashlight.shadow.camera.far = 26;
    this.camera.add(this.flashlight, this.flashlight.target);

    this.post = new PostFX(this.renderer, this.scene, this.camera);
    this.audio = new AudioEngine();
    this.input = new Input(canvas);
    this.player = new Player(this.camera);

    this.world = null;
    this.stageIndex = 0;
    this.depth = 0;
    this.time = 0;
    this.totalTime = 0;
    this.fear = 0;
    this.flash = 0;
    this.staticLevel = 0;
    this.staticPulse = 0;
    this.dialog = null;
    this.attractPath = null;
    this.drifting = false;
    this.lastFrame = performance.now();
    this.fpsAcc = { t: 0, n: 0 };
    this.warnedSignal = false;
    this.history = [];

    this.input.onLockChange = (locked) => {
      if (this.state !== 'playing') return;
      if (!locked && !this.input.usingTouch && !this.input.dragLook) this.pause();
      this.ui.showResumeHint(false);
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
    const qualityChanged = this.settings.quality !== s.quality || !this._appliedOnce;
    this.settings = s;
    this._appliedOnce = true;
    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();
    this.audio.setVolumes({ master: s.master, music: s.music, sfx: s.sfx });
    this.post.reduce = s.reduceEffects;
    this.ui.setFpsVisible(s.showFps);
    this.ui.setMinimap(!!s.minimap);
    if (qualityChanged) this.resize();
    if (this.world) this.configureEnv(this.world);
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    const pr = Math.min(devicePixelRatio || 1, this.quality.pr);
    this.renderer.setPixelRatio(pr);
    this.post.setSamples(this.quality.msaa);
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h, pr);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---- levels ---------------------------------------------------------------

  /** Levels already visited this run come up less often, so a drift tends to cover them all. */
  stageWeights() {
    const visits = STAGES.map(() => 0);
    for (const i of this.history) visits[i]++;
    return visits.map((n) => 1 / (1 + n * 3));
  }

  randomStage(exclude = -1) {
    const options = STAGES.map((_, i) => i).filter((i) => i !== exclude);
    if (!options.length) return 0;
    const w = this.stageWeights();
    let r = Math.random() * options.reduce((sum, i) => sum + w[i], 0);
    for (const i of options) if ((r -= w[i]) < 0) return i;
    return options[options.length - 1];
  }

  buildWorld(index, { attract = false, seed = (Math.random() * 1e9) | 0, bleed = [] } = {}) {
    if (this.world) {
      this.world.dispose();
      this.world = null;
    }
    const stage = STAGES[index];
    const world = new World(this, stage, { seed, depth: attract ? 0 : this.depth, attract, lights: this.quality.lights, stages: STAGES, weights: this.stageWeights(), bleed: bleed.map((i) => STAGES[i]) });
    this.scene.add(world.root);
    this.world = world;
    this.stageIndex = index;
    this.configureEnv(world);
    const spawnY = world.floorAt(world.spawn.x, world.spawn.z);
    this.player.reset({ ...world.spawn, y: spawnY });
    this.player.flashlight = world.env.flashlightOn;
    this.player.update(0, { consumeLook: () => ({ x: 0, y: 0 }), move: () => ({ x: 0, y: 0 }), turn: () => 0, down: () => false, idleLook: () => 0 }, world, this.settings, true);
    this.captureEnvironment(world);
    this.attractPath = null;
    this.fear = 0;
    this.staticLevel = 0;
    this.warnedSignal = false;
    return world;
  }

  /**
   * Compiles the level's shaders before the first frame, including those of
   * apparitions that start hidden (or they would stall the frame they appear).
   * Programs are built for the post-processing buffer the scene really renders
   * into, and in parallel where the browser supports it.
   */
  async warmShaders() {
    const world = this.world;
    const hidden = [];
    for (const e of world.entities) {
      e.object?.traverse((o) => {
        if (!o.visible) {
          o.visible = true;
          hidden.push(o);
        }
      });
    }
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.post.composer.readBuffer);
    const done = r.compileAsync(this.scene, this.camera);
    r.setRenderTarget(prev);
    for (const o of hidden) o.visible = false;
    await done;
  }

  /** Renders the level around the spawn point into a reflection probe. */
  captureEnvironment(world) {
    // the previous probe stays bound (and alive) until the new one is captured
    const old = this.envRT;
    this.envRT = null;
    if (world.env.envIntensity <= 0) {
      this.scene.environment = null;
      old?.dispose();
      return;
    }
    world.lightPool?.snap(this.camera.position);
    const pos = this.camera.position.clone();
    const fl = this.flashlight.intensity;
    this.flashlight.intensity = 0;
    this.envRT = this.pmrem.fromScene(this.scene, 0.03, 0.1, 80, { size: this.quality.env, position: pos });
    old?.dispose();
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = world.env.envIntensity;
    this.flashlight.intensity = fl;
    this.probePos = pos;
    this.probeTime = this.time;
  }

  configureEnv(world) {
    const env = world.env;
    if (env.backgroundTex) {
      this.scene.background = env.backgroundTex;
      this.scene.backgroundIntensity = env.backgroundIntensity ?? 1;
      this.scene.backgroundRotation.set(0, env.backgroundRotation ?? 0, 0);
    } else this.scene.background = new THREE.Color(env.background);
    this.scene.fog = env.fog;
    this.renderer.toneMapping = env.toneMapping ?? THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = env.exposure;
    // the flashlight casts shadows in dark levels (medium and high quality)
    this.flashlight.castShadow = !!env.flashlight && this.quality.ao;
    this.renderer.shadowMap.enabled = (!!env.shadows && this.quality.shadows) || this.flashlight.castShadow;
    this.post.configure(env.postfx, this.quality.bloom, this.quality.ao ? env.ao : 0);
    this.flashlight.intensity = 0;
    this.flashlight.distance = env.flashlightDistance || 26;
  }

  async showTitle() {
    this.state = 'title';
    this.input.enabled = false;
    const index = this.randomStage();
    const stage = await loadStage(index);
    await preload(stage.assets);
    await prewarm(stage.assets?.looks);
    this.buildWorld(index, { attract: true, seed: (Math.random() * 1e6) | 0 });
    await this.warmShaders();
    this.ui.show('title');
    this.ui.hud(false);
    if (this.audio.ready) this.startAmbience();
  }

  startAmbience() {
    if (!this.world) return;
    this.audio.setReverb(...this.world.env.reverb);
    this.audio.setAmbience(this.world.env.ambience, this.world.bleedStages[0]?.bleed?.ambience);
  }

  /** Leaves the title and drops into a random level. */
  async start() {
    this.audio.init();
    this.depth = 0;
    this.totalTime = 0;
    this.history = [];
    this.input.enabled = true;
    this.input.requestLock();
    await this.drift(this.randomStage(this.stageIndex), 'start');
  }

  /**
   * Moves to level `dest` (or a random one). how: 'door' | 'time' | 'fall' | 'start' | 'menu'.
   * opts.bleed: level indices to bleed in (default: chosen from the levels you've passed through).
   */
  async drift(dest = null, how = 'door', opts = {}) {
    if (this.drifting) return;
    this.drifting = true;
    this.closeDialog();
    this.state = 'drifting';
    if (how !== 'start') this.audio.driftSound(how === 'fall' ? 'fall' : 'door');
    await this.ui.fadeOut(how === 'fall' || how === 'time');
    // the screen is black now: stop drawing the old level while the next one loads
    this.loading = true;
    if (how !== 'start') this.depth++;
    const index = dest ?? this.nextStage ?? this.randomStage(this.stageIndex);
    // levels you've been through may leak into this one
    const bleed = opts.bleed ?? (how === 'start' ? [] : pickBleed(this.history, index, this.depth));
    for (const i of [index, ...bleed]) {
      const stage = await loadStage(i);
      await preload(stage.assets);
      await prewarm(i === index ? stage.assets?.looks : stage.bleed?.looks);
    }
    this.buildWorld(index, { bleed });
    await this.warmShaders();
    this.loading = false;
    this.history.push(index);
    this.prefetchAhead();
    this.startAmbience();
    this.ui.show(null);
    this.ui.hud(true, this.world, this.depth);
    this.ui.levelIntro(this.world.stage, this.depth);
    if (how === 'start') this.ui.controlsHint(this.world.env.flashlight);
    this.state = 'playing';
    this.input.enabled = true;
    this.audio.setDucked(false);
    this.world.stage.onEnter?.(this.world, this);
    if (how === 'fall') this.toast('You fell a long way down', null, 'danger');
    await this.ui.fadeIn();
    this.drifting = false;
  }

  /**
   * Picks where the signal will drop you when it fades (same odds as picking
   * then) and starts downloading that level and the ones behind the doors.
   */
  prefetchAhead() {
    this.nextStage = this.randomStage(this.stageIndex);
    const ahead = new Set([this.nextStage, ...this.world.doors.map((d) => d.dest)]);
    for (const i of ahead) loadStage(i).then((s) => prefetch(s.assets)).catch(() => {});
  }

  pause() {
    if (this.state !== 'playing') return;
    this.closeDialog();
    this.state = 'paused';
    this.input.enabled = false;
    this.input.releaseLock();
    this.audio.setDucked(true);
    this.ui.showResumeHint(false);
    this.ui.showPause(this.world, this.totalTime, this.depth);
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

  async quitToTitle() {
    this.input.enabled = false;
    this.input.releaseLock();
    this.closeDialog();
    this.audio.setDucked(false);
    this.audio.setFear(0);
    await this.ui.fadeOut();
    this.loading = true;
    await this.showTitle();
    this.loading = false;
    await this.ui.fadeIn();
  }

  // ---- events ---------------------------------------------------------------

  toast(title, sub = null, kind = '') {
    this.ui.toast(title, sub, kind);
  }

  pulseStatic(v) {
    this.staticPulse = Math.max(this.staticPulse, v);
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
    this.input.pollGamepad(dt);
    this.frame(dt);
    this.fpsAcc.t += dt;
    this.fpsAcc.n++;
    if (this.fpsAcc.t > 0.5) {
      this.ui.fps(this.fpsAcc.n / this.fpsAcc.t);
      this.fpsAcc.t = 0;
      this.fpsAcc.n = 0;
    }
    this.input.endFrame();
  }

  /** One frame of simulation and rendering (also handy for driving the game headless). */
  frame(dt) {
    this.time += dt;
    // the screen is black while a level loads: nothing to update or draw
    if (this.loading) return;
    const wasPaused = this.state === 'paused';

    if (this.state === 'playing') this.updatePlay(dt);
    else if (this.world && this.world.attract) this.updateAttract(dt);
    else if (this.world) this.world.update(0, this.ctx(0));
    if (wasPaused && this.state === 'paused' && this.input.pressed('pause') && this.ui.current === 'pause') this.resume();

    if (this.world) {
      // a light that is off casts nothing: don't redraw its shadow map
      this.flashlight.shadow.autoUpdate = this.flashlight.intensity > 0;
      this.audio.updateListener(this.camera);
      this.audio.update(dt);
      this.flash = Math.max(0, this.flash - dt * 1.5);
      this.staticPulse = Math.max(0, this.staticPulse - dt * 1.2);
      this.post.update(this.time, this.fear, { static: Math.max(this.staticLevel, this.staticPulse), desat: this.desat || 0, flash: this.flash, bleed: this.state === 'playing' ? this.world.bleedLevel : 0 });
      this.post.render(dt);
    }
  }

  ctx(dt) {
    return { t: this.time, dt, player: this.player, camera: this.camera, game: this, world: this.world, attract: this.world?.attract, settings: this.settings };
  }

  updatePlay(dt) {
    const inp = this.input;
    const w = this.world;
    const p = this.player;
    this.totalTime += dt;

    if (inp.pressed('pause')) {
      if (this.ui.bigMapOpen) this.ui.toggleBigMap(false);
      else if (this.dialog) this.closeDialog();
      else return this.pause();
    }
    if (inp.pressed('map')) this.ui.toggleBigMap();

    const frozen = !!this.dialog || this.ui.bigMapOpen;
    const { step, fell } = p.update(dt, inp, w, this.settings, frozen);
    if (step) this.audio.step(step, p.running ? 1.3 : 0.8);
    if (fell) {
      this.drift(null, 'fall');
      return;
    }

    // flashlight (no battery: it's your camcorder light)
    if (w.env.flashlight) {
      if (inp.pressed('flashlight')) {
        p.flashlight = !p.flashlight;
        this.audio.uiClick();
      }
      const li = p.flashlight ? w.env.flashlightIntensity : 0;
      this.flashlight.intensity += (li - this.flashlight.intensity) * Math.min(1, dt * 25);
      if (!li && this.flashlight.intensity < 1e-3) this.flashlight.intensity = 0;
    } else if (inp.pressed('flashlight')) {
      this.toast('You won’t need a light here');
    }

    w.update(dt, this.ctx(dt));
    if (this.state !== 'playing') return;

    // interaction
    const target = frozen ? null : this.findInteractable();
    this.ui.setPrompt(target ? target.prompt : null, inp.usingTouch);
    if (inp.pressed('interact')) {
      if (this.dialog) this.advanceDialog();
      else if (target) target.interact(this);
    }

    // the signal: when it fades you drift on
    w.timeLeft -= dt;
    if (w.timeLeft < 18 && !this.warnedSignal) {
      this.warnedSignal = true;
      this.toast('The signal is fading…', 'Soon you will drift somewhere else');
    }
    if (w.timeLeft <= 0) {
      this.drift(null, 'time');
      return;
    }

    // presence of apparitions and local unease shape the camera's mood
    let presence = 0;
    for (const e of w.entities) presence = Math.max(presence, e.presence || 0);
    const unease = w.uneaseAt(p.pos.x, p.pos.z);
    const target_ = Math.max(presence, Math.min(0.45, unease * 0.3));
    this.fear += (target_ - this.fear) * Math.min(1, dt * 1.5);
    this.audio.setFear(this.fear);
    this.desat = Math.min(0.5, Math.max(0, unease - 0.6) * 0.5);
    const fade = w.timeLeft < 18 ? (1 - w.timeLeft / 18) : 0;
    const bl = w.bleedLevel;
    this.staticLevel = Math.max(0, this.fear - 0.8) * 0.4 + fade * fade * 0.55 + (Math.random() < unease * 0.004 ? 0.35 : 0) + bl * 0.04 + (Math.random() < bl * 0.015 ? 0.3 : 0);
    this.updateBleed(dt, bl);

    // on high quality the reflection probe follows you around
    if (this.quality.probeFollow && this.probePos && this.time - this.probeTime > 5 && this.camera.position.distanceTo(this.probePos) > 12) {
      this.captureEnvironment(w);
    }

    this.ui.updateHud(this);
    this.ui.drawMaps(w, p);
  }

  /** Crossed signals: the other level's sound, a garbled HUD, and a note the first time. */
  updateBleed(dt, level) {
    const w = this.world;
    if (!w.bleedZones.length) return;
    this.audio.setBleed(level);
    const z = w.bleedZone;
    if (!z) return;
    if (level > 0.5 && !z.noticed) {
      z.noticed = true;
      this.audio.glitch(1);
      this.toast('Crossed signal', `${z.stage.code} ${z.stage.name} is leaking in here`, 'danger');
    }
    if (level > 0.2 && Math.random() < dt * level * 2.5) {
      this.audio.glitch(0.4 * level);
      this.ui.glitchStage(w.stage, z.stage, this.depth);
    }
  }

  nearLight(pos, radius = 3.5) {
    const lp = this.world?.lightPool;
    if (!lp) return false;
    for (const f of lp.fixtures) {
      if (f.dead || f.level < 0.4) continue;
      const dx = f.pos.x - pos.x;
      const dz = f.pos.z - pos.z;
      if (dx * dx + dz * dz < radius * radius) return true;
    }
    return false;
  }

  findInteractable() {
    const p = this.player;
    const fwd = p.forward(_fwd);
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
      // keyboard players can't aim vertically easily, so judge by heading mostly
      const flat = (fwd.x * dx + fwd.z * dz) / (Math.hypot(fwd.x, fwd.z) * dist + 1e-6);
      const dot = Math.max((fwd.x * dx + fwd.y * dy + fwd.z * dz) / len, flat * 0.98);
      if (dot < 0.72 && dist > 1.1) continue;
      const score = dot - dist * 0.1;
      if (score > bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  updateAttract(dt) {
    const w = this.world;
    const g = w.grid;
    const cam = this.camera;
    if (!this.attractPath || !this.attractPath.length) {
      const [ci, cj] = g.cellOf(this.player.pos.x, this.player.pos.z);
      for (let k = 0; k < 30; k++) {
        const i = ci + w.rng.int(-10, 10);
        const j = cj + w.rng.int(-10, 10);
        if (!g.standable(i, j)) continue;
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
        const s = Math.min(d, 1.0 * dt);
        p.pos.x += (dx / d) * s;
        p.pos.z += (dz / d) * s;
        const yaw = Math.atan2(-dx, -dz);
        let diff = yaw - p.yaw;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        p.yaw += diff * Math.min(1, dt * 0.9);
      }
    }
    p.pos.y += (w.floorAt(p.pos.x, p.pos.z) - p.pos.y) * Math.min(1, dt * 4);
    cam.position.set(p.pos.x, p.pos.y + p.eye + Math.sin(this.time * 1.3) * 0.02, p.pos.z);
    cam.rotation.set(Math.sin(this.time * 0.21) * 0.05 - 0.03, p.yaw, 0);
    this.fear = 0;
    this.staticLevel = 0;
    this.desat = 0;
    w.update(dt, this.ctx(dt));
  }
}
