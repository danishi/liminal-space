import { formatTime, DEFAULT_SETTINGS } from '../core/settings.js';
import { staticDataURL } from '../core/textures.js';
import { MapMemory, drawMinimap, drawBigMap, mapMarkerKey } from './minimap.js';

const $ = (id) => document.getElementById(id);

const SCREENS = ['title', 'levels', 'pause', 'settings', 'help'];

export class UI {
  constructor() {
    this.screens = Object.fromEntries(SCREENS.map((s) => [s, $(`screen-${s}`)]));
    this.current = null;
    this.stack = [];
    this.fadeEl = $('fade');
    this.staticEl = $('static');
    this.staticEl.style.backgroundImage = `url(${staticDataURL()})`;
    this.hudEl = $('hud');
    this.toastsEl = $('toasts');
    this.promptEl = $('prompt');
    this.promptText = $('prompt-text');
    this.promptKey = $('prompt-key');
    this.crosshair = $('crosshair');
    this.clockEl = $('hud-clock');
    this.stageEl = $('hud-stage');
    this.signalEl = $('signal');
    this.signalBars = [...this.signalEl.querySelectorAll('i')];
    this.minimap = $('minimap');
    this.minimapWrap = $('minimap-wrap');
    this.bigmap = $('bigmap');
    this.bigmapCanvas = $('bigmap-canvas');
    this.dialogEl = $('dialog');
    this.dlgName = $('dlg-name');
    this.dlgText = $('dlg-text');
    this.dlgNext = $('dlg-next');
    this.fpsEl = $('fps');
    this.resumeEl = $('resume-hint');
    this.levelCard = $('level-card');
    this.bigMapOpen = false;
    this.showMinimap = false;
    this.mem = null;
    this.typing = null;
    this.hintTimer = null;
    this.cardTimer = null;
  }

  // ---- screens ---------------------------------------------------------------

  show(name, { push = false } = {}) {
    if (push && this.current) this.stack.push(this.current);
    else if (!push) this.stack = [];
    for (const [k, el] of Object.entries(this.screens)) el.hidden = k !== name;
    this.current = name;
    if (name) {
      const el = this.screens[name];
      const first = el.querySelector('.btn-primary') || el.querySelector('.btn');
      if (first && !matchMedia('(pointer: coarse)').matches) setTimeout(() => first.focus({ preventScroll: true }), 30);
    }
  }

  back() {
    const prev = this.stack.pop();
    this.show(prev || 'title');
  }

  /** Fade to black with tape static. `heavy` = stronger static (falling, signal loss). */
  fadeOut(heavy = false) {
    this.fadeEl.style.opacity = '1';
    this.staticEl.style.transition = 'opacity 0.3s';
    this.staticEl.style.opacity = heavy ? '0.5' : '0.18';
    return new Promise((r) => setTimeout(r, heavy ? 900 : 650));
  }

  fadeIn() {
    this.fadeEl.style.opacity = '0';
    this.staticEl.style.opacity = '0';
    return new Promise((r) => setTimeout(r, 600));
  }

  bootDone() {
    const b = $('boot');
    b.classList.add('gone');
    setTimeout(() => b.remove(), 700);
  }

  showPause(world, totalTime, passed) {
    $('pause-stage').textContent = `${world.stage.code} · ${world.stage.name}`;
    $('pause-time').textContent = formatTime(totalTime);
    $('pause-depth').textContent = String(passed);
    this.toggleBigMap(false);
    this.show('pause');
  }

  // ---- HUD -------------------------------------------------------------------

  hud(on, world = null, depth = 0) {
    this.hudEl.hidden = !on;
    $('touch').hidden = !on || !this.touchOn;
    if (!on) {
      // the map memory holds the whole level; let it go with the HUD
      this.mem = this.mapMem = null;
      this.minimapView = this.bigMapView = null;
      this.dialog(null);
      this.toggleBigMap(false);
      this.setPrompt(null);
      this.showResumeHint(false);
      return;
    }
    if (world) {
      this.mem = new MapMemory(world);
      this.stageEl.textContent = `${world.stage.code} · ${world.stage.name}${depth ? ` · drift ${depth}` : ''}`;
      $('tbtn-light').hidden = !world.env.flashlight;
      $('bigmap-title').textContent = `Map — ${world.stage.code} ${world.stage.name}`;
      this.toastsEl.innerHTML = '';
      this.minimapWrap.hidden = !this.showMinimap;
    }
  }

  /** Briefly shows another level's name in the HUD, garbled, then puts ours back. */
  glitchStage(host, other, depth) {
    const junk = '▒░▓█#%&?';
    const garble = (t) => [...t].map((ch) => (Math.random() < 0.25 ? junk[(Math.random() * junk.length) | 0] : ch)).join('');
    this.stageEl.textContent = garble(`${other.code} · ${other.name}`);
    clearTimeout(this.glitchT);
    this.glitchT = setTimeout(() => {
      this.stageEl.textContent = `${host.code} · ${host.name}${depth ? ` · drift ${depth}` : ''}`;
    }, 90 + Math.random() * 160);
  }

  levelIntro(stage, depth) {
    $('lc-code').textContent = `${stage.code}${depth ? `  ·  DRIFT ${depth}` : ''}`;
    $('lc-name').textContent = stage.name;
    $('lc-sub').textContent = stage.sub || '';
    this.levelCard.classList.add('on');
    clearTimeout(this.cardTimer);
    this.cardTimer = setTimeout(() => this.levelCard.classList.remove('on'), 5200);
  }

  updateHud(game) {
    // the clock only changes once a second; rewriting it every frame dirties the HUD's layout
    const clock = formatTime(game.totalTime);
    if (clock !== this.clockText) this.clockEl.textContent = this.clockText = clock;
    const w = game.world;
    const frac = Math.max(0, w.timeLeft / w.duration);
    const lit = Math.ceil(frac * 5);
    this.signalBars.forEach((b, k) => b.classList.toggle('off', k >= lit));
    this.signalEl.classList.toggle('low', frac < 0.12);
    $('tbtn-light')?.classList.toggle('on', game.player.flashlight);
  }

  drawMaps(world, player) {
    if (!this.mem || this.mem.world !== world) this.mem = new MapMemory(world);
    if (this.mem !== this.mapMem) {
      this.mapMem = this.mem;
      this.minimapView = this.bigMapView = null;
    }
    this.mem.timer -= 1;
    if (this.mem.timer <= 0) {
      this.mem.timer = 6;
      this.mem.reveal(player.pos.x, player.pos.z, 4);
    }
    // redraw only when something on the map moved or appeared
    const view = `${player.pos.x.toFixed(3)},${player.pos.z.toFixed(3)},${player.yaw.toFixed(4)},${this.mem.version},${mapMarkerKey(world)}`;
    if (this.showMinimap && view !== this.minimapView) {
      this.minimapView = view;
      drawMinimap(this.minimap, world, this.mem, player);
    }
    if (this.bigMapOpen && view !== this.bigMapView) {
      this.bigMapView = view;
      drawBigMap(this.bigmapCanvas, world, this.mem, player);
    }
  }

  setMinimap(on) {
    this.showMinimap = on;
    this.minimapView = null;
    this.minimapWrap.hidden = !on;
  }

  toggleBigMap(force) {
    const open = force ?? !this.bigMapOpen;
    if (open !== this.bigMapOpen) this.bigMapView = null;
    this.bigMapOpen = open;
    this.bigmap.hidden = !open;
  }

  setPrompt(text, touch = false) {
    this.crosshair.classList.toggle('active', !!text);
    $('tbtn-interact')?.classList.toggle('hot', !!text);
    if (!text) {
      this.promptEl.hidden = true;
      return;
    }
    this.promptEl.hidden = false;
    const key = touch ? 'Use' : 'E';
    if (this.promptKey.textContent !== key) this.promptKey.textContent = key;
    if (this.promptText.textContent !== text) this.promptText.textContent = text;
  }

  toast(title, sub = null, kind = '') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = title;
    if (sub) {
      const s = document.createElement('small');
      s.textContent = sub;
      el.appendChild(s);
    }
    this.toastsEl.appendChild(el);
    while (this.toastsEl.children.length > 3) this.toastsEl.firstChild.remove();
    setTimeout(() => el.classList.add('out'), 3800);
    setTimeout(() => el.remove(), 4400);
  }

  controlsHint(flashlight) {
    const el = $('controls-hint');
    const parts = [
      '<span><kbd>↑</kbd><kbd>↓</kbd> Walk</span>',
      '<span><kbd>←</kbd><kbd>→</kbd> Turn</span>',
      '<span>Mouse Look</span>',
      '<span><kbd>Shift</kbd> Run</span>',
      '<span><kbd>E</kbd> Interact</span>',
      flashlight ? '<span><kbd>F</kbd> Light</span>' : '',
      '<span><kbd>M</kbd> Map</span>',
      '<span><kbd>Esc</kbd> Pause</span>',
    ];
    el.innerHTML = parts.join('');
    el.classList.remove('gone');
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => el.classList.add('gone'), 10000);
  }

  showResumeHint(on) {
    this.resumeEl.hidden = !on;
  }

  fps(v) {
    if (!this.fpsEl.hidden) this.fpsEl.textContent = `${Math.round(v)} fps`;
  }

  setFpsVisible(on) {
    this.fpsEl.hidden = !on;
  }

  // ---- dialog -------------------------------------------------------------------

  dialog(name, text, voice = 1, audio = null) {
    clearInterval(this.typing);
    this.typing = null;
    if (!name) {
      this.dialogEl.hidden = true;
      return;
    }
    this.dialogEl.hidden = false;
    $('controls-hint').classList.add('gone');
    this.dlgName.textContent = name;
    this.dlgText.textContent = '';
    this.dlgNext.classList.remove('ready');
    this.dlgFull = text;
    let i = 0;
    const chars = [...text];
    this.typing = setInterval(() => {
      i++;
      this.dlgText.textContent = chars.slice(0, i).join('');
      if (audio && i % 2 === 0 && chars[i - 1] && !' ,.…'.includes(chars[i - 1])) audio.blip(voice);
      if (i >= chars.length) this.dialogSkip();
    }, 26);
  }

  dialogDone() {
    return this.typing === null;
  }

  dialogSkip() {
    clearInterval(this.typing);
    this.typing = null;
    this.dlgText.textContent = this.dlgFull;
    this.dlgNext.classList.add('ready');
  }

  // ---- touch -------------------------------------------------------------------

  enableTouch(input) {
    if (this.touchOn) return;
    this.touchOn = true;
    document.body.classList.add('touch');
    input.bindTouch({
      moveZone: $('touch-move'),
      lookZone: $('touch-look'),
      stickBase: $('stick-base'),
      stickKnob: $('stick-knob'),
      buttons: [...document.querySelectorAll('#touch .tbtn')],
    });
    if (!this.hudEl.hidden) $('touch').hidden = false;
    $('dlg-next').textContent = 'Tap to continue';
  }

  // ---- level select -------------------------------------------------------------

  /**
   * Fills the level list from the registry. onPick(index, depth) starts a run
   * there; onPeek(index) fires when one is hovered or focused, so it can be
   * fetched before it's picked.
   */
  bindLevels(stages, onPick, onPeek) {
    const depth = $('level-depth');
    const out = $('out-level-depth');
    const sync = () => {
      out.textContent = depth.value;
    };
    depth.addEventListener('input', sync);
    sync();
    const list = $('level-list');
    stages.forEach((stage, i) => {
      const b = document.createElement('button');
      b.className = 'btn level-btn';
      b.style.setProperty('--tint', `#${stage.tint.toString(16).padStart(6, '0')}`);
      for (const [cls, text] of [['level-code', stage.code], ['level-name', stage.name], ['level-sub', stage.sub]]) {
        const s = document.createElement('span');
        s.className = cls;
        s.textContent = text;
        b.append(s);
      }
      b.addEventListener('click', () => onPick(i, Number(depth.value)));
      b.addEventListener('pointerenter', () => onPeek(i));
      b.addEventListener('focus', () => onPeek(i));
      list.append(b);
    });
  }

  // ---- settings -----------------------------------------------------------------

  bindSettings(settings, onChange) {
    const fields = {
      sensitivity: ['set-sens', 'out-sens', (v) => v.toFixed(2)],
      fov: ['set-fov', 'out-fov', (v) => `${v}°`],
      master: ['set-master', 'out-master', (v) => `${Math.round(v * 100)}`],
      music: ['set-music', 'out-music', (v) => `${Math.round(v * 100)}`],
      sfx: ['set-sfx', 'out-sfx', (v) => `${Math.round(v * 100)}`],
    };
    const checks = { invertY: 'set-invert', headBob: 'set-bob', reduceEffects: 'set-reduce', showFps: 'set-fps', minimap: 'set-minimap' };
    const steerIds = { 0: 'set-steer-0', 0.35: 'set-steer-1', 0.65: 'set-steer-2', 1: 'set-steer-3' };
    const sync = () => {
      for (const [k, [id, out, fmt]] of Object.entries(fields)) {
        $(id).value = settings[k];
        $(out).textContent = fmt(Number(settings[k]));
      }
      for (const [k, id] of Object.entries(checks)) $(id).checked = !!settings[k];
      $(`set-q-${settings.quality}`).checked = true;
      $(steerIds[settings.steer] || 'set-steer-2').checked = true;
    };
    sync();
    for (const [k, [id, out, fmt]] of Object.entries(fields)) {
      $(id).addEventListener('input', (e) => {
        settings[k] = Number(e.target.value);
        $(out).textContent = fmt(settings[k]);
        onChange(settings);
      });
    }
    for (const [k, id] of Object.entries(checks)) {
      $(id).addEventListener('change', (e) => {
        settings[k] = e.target.checked;
        onChange(settings);
      });
    }
    document.querySelectorAll('input[name="quality"]').forEach((r) =>
      r.addEventListener('change', (e) => {
        settings.quality = e.target.value;
        onChange(settings);
      }));
    document.querySelectorAll('input[name="steer"]').forEach((r) =>
      r.addEventListener('change', (e) => {
        settings.steer = Number(e.target.value);
        onChange(settings);
      }));
    $('settings-reset').addEventListener('click', () => {
      Object.assign(settings, DEFAULT_SETTINGS);
      sync();
      onChange(settings);
    });
  }
}
