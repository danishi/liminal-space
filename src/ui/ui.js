import { formatTime, DEFAULT_SETTINGS } from '../core/settings.js';
import { staticDataURL } from '../core/textures.js';
import { MapMemory, drawMinimap, drawBigMap } from './minimap.js';

const $ = (id) => document.getElementById(id);

const SCREENS = ['title', 'select', 'card', 'pause', 'settings', 'help', 'result', 'gameover'];

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
    this.objEl = $('hud-objective');
    this.minimap = $('minimap');
    this.bigmap = $('bigmap');
    this.bigmapCanvas = $('bigmap-canvas');
    this.dialogEl = $('dialog');
    this.dlgName = $('dlg-name');
    this.dlgText = $('dlg-text');
    this.dlgNext = $('dlg-next');
    this.fpsEl = $('fps');
    this.resumeEl = $('resume-hint');
    this.meters = {
      stamina: $('meter-stamina'),
      sanity: $('meter-sanity'),
      battery: $('meter-battery'),
    };
    this.bigMapOpen = false;
    this.mem = null;
    this.typing = null;
    this.handlers = {};
    this.hintTimer = null;
  }

  on(name, fn) {
    this.handlers[name] = fn;
  }

  emit(name, ...args) {
    this.handlers[name]?.(...args);
  }

  // ---- screens ---------------------------------------------------------------

  show(name, { push = false } = {}) {
    if (push && this.current) this.stack.push(this.current);
    else if (!push) this.stack = [];
    for (const [k, el] of Object.entries(this.screens)) el.hidden = k !== name;
    this.current = name;
    if (name) {
      const el = this.screens[name];
      const first = el.querySelector('.stage-card.active') || el.querySelector('.btn-primary') || el.querySelector('.btn');
      // keyboard users land on the primary action
      if (first && !matchMedia('(pointer: coarse)').matches) setTimeout(() => first.focus({ preventScroll: true }), 30);
    }
  }

  back() {
    const prev = this.stack.pop();
    this.show(prev || 'title');
    if (prev) this.emit('back', prev);
  }

  fadeOut(white = false) {
    this.fadeEl.classList.toggle('white', white);
    this.fadeEl.style.opacity = '1';
    this.staticEl.style.transition = 'opacity 0.4s';
    this.staticEl.style.opacity = white ? '0' : '0.12';
    return new Promise((r) => setTimeout(r, 650));
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

  renderStages(stages, progress, activeIndex = 0) {
    const list = $('stage-list');
    list.innerHTML = '';
    stages.forEach((s, i) => {
      const cleared = progress.cleared[s.id];
      const b = document.createElement('button');
      b.className = 'stage-card' + (i === activeIndex ? ' active' : '');
      b.setAttribute('role', 'listitem');
      b.id = `stage-${s.id}`;
      b.style.setProperty('--c1', s.art.c1);
      b.style.setProperty('--c2', s.art.c2);
      b.style.setProperty('--c3', s.art.c3);
      const pips = [0, 1, 2].map((k) => `<i class="${k < s.danger ? 'on' : ''}"></i>`).join('');
      b.innerHTML = `
        <div class="stage-art"><span class="stage-code">${s.code}</span>
          <span class="stage-badge ${cleared ? 'cleared' : ''}">${cleared ? '踏破' : '未踏'}</span></div>
        <div class="stage-body">
          <h3 class="stage-name">${s.name}</h3>
          <span class="stage-en">${s.en}</span>
          <p class="stage-desc">${s.desc}</p>
          <div class="stage-meta">
            <span class="tags">${s.tags.map((t) => `<span class="tag">${t}</span>`).join('')}</span>
            <span>${cleared ? `最速 ${formatTime(cleared.best)}` : ''}</span>
            <span class="danger-pips" title="危険度 ${s.danger}/3" aria-label="危険度 ${s.danger}/3">${pips}</span>
          </div>
        </div>`;
      b.addEventListener('mouseenter', () => this.activateCard(i, true));
      b.addEventListener('focus', () => this.activateCard(i, false));
      b.addEventListener('click', () => this.emit('pick', i));
      list.appendChild(b);
    });
    this.cardIndex = activeIndex;
  }

  activateCard(i, hover) {
    const cards = [...document.querySelectorAll('.stage-card')];
    cards.forEach((c, k) => c.classList.toggle('active', k === i));
    if (this.cardIndex !== i) this.emit('hoverSound');
    this.cardIndex = i;
    clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => this.emit('preview', i), hover ? 220 : 120);
  }

  moveCard(delta) {
    const cards = [...document.querySelectorAll('.stage-card')];
    if (!cards.length) return;
    const i = (this.cardIndex + delta + cards.length) % cards.length;
    cards[i].focus();
  }

  showSelect(progress, index) {
    this.renderStages(this.stagesRef, progress, index);
    this.show('select');
  }

  showCard(stage) {
    $('card-level').textContent = stage.code;
    $('card-title').textContent = stage.name;
    $('card-sub').textContent = stage.en;
    $('card-goal').textContent = stage.goal;
    $('card-tip').textContent = stage.tip;
    $('card-go').textContent = matchMedia('(pointer: coarse)').matches ? 'タップして入る' : 'クリックして入る';
    this.show('card');
  }

  showPause(world, time) {
    $('pause-stage').textContent = `${world.stage.code} ${world.stage.name}`;
    $('pause-time').textContent = formatTime(time);
    $('pause-frags').textContent = `${world.collected} / ${world.fragments.length}`;
    this.toggleBigMap(false);
    this.show('pause');
  }

  showResult(stage, time, best, isRecord, memories, next) {
    $('result-title').textContent = `${stage.name}を抜け出した`;
    $('result-line').textContent = stage.clearLine || '扉の向こうには、また別の知らない場所があった。';
    $('result-time').textContent = formatTime(time);
    $('result-best').textContent = formatTime(best) + (isRecord ? ' 更新' : '');
    $('result-memories').innerHTML = memories.map((m) => `<li>${m}</li>`).join('');
    $('result-next').textContent = next ? `次の階層へ（${next.name}）` : '最初の階層へ';
    this.show('result');
  }

  showGameOver(title, line) {
    $('over-title').textContent = title;
    $('over-line').textContent = line;
    this.show('gameover');
  }

  // ---- HUD -------------------------------------------------------------------

  hud(on, world = null) {
    this.hudEl.hidden = !on;
    $('touch').hidden = !on || !this.touchOn;
    if (!on) {
      this.dialog(null);
      this.toggleBigMap(false);
      this.setPrompt(null);
      this.showResumeHint(false);
      return;
    }
    if (world) {
      this.mem = new MapMemory(world);
      this.stageEl.textContent = `${world.stage.code} ／ ${world.stage.name}`;
      this.meters.battery.hidden = !world.env.flashlight;
      $('tbtn-light').hidden = !world.env.flashlight;
      $('bigmap-title').textContent = `${world.stage.code} ${world.stage.name} の地図`;
      this.toastsEl.innerHTML = '';
      this.updateObjective(world);
    }
  }

  updateObjective(world) {
    const n = world.collected;
    const total = world.fragments.length;
    const pips = world.fragments.map((_, k) => `<i class="${k < n ? 'on' : ''}"></i>`).join('');
    const open = n >= total;
    this.objEl.classList.toggle('exit-open', open);
    this.objEl.innerHTML = open
      ? `<span class="frag-pips">${pips}</span><span>出口が開いた — 地図の緑を目指せ</span>`
      : `<span class="frag-pips">${pips}</span><span>記憶の欠片 ${n} / ${total}</span>`;
  }

  updateHud(game, dt) {
    const p = game.player;
    this.clockEl.textContent = formatTime(game.stageTime);
    this.meter('stamina', p.stamina / 100, p.exhausted, p.stamina >= 99.5);
    this.meter('sanity', p.sanity / 100, p.sanity < 30, false);
    if (game.world.env.flashlight) this.meter('battery', p.battery / 100, p.battery < 20, !p.flashlight && p.battery >= 99.5);
    const lightBtn = $('tbtn-light');
    if (lightBtn) lightBtn.classList.toggle('on', p.flashlight);
    void dt;
  }

  meter(name, v, low, idle) {
    const m = this.meters[name];
    m.querySelector('.meter-fill').style.transform = `scaleX(${Math.max(0, Math.min(1, v))})`;
    m.classList.toggle('low', low);
    m.classList.toggle('idle', idle);
  }

  drawMinimap(world, player) {
    if (!this.mem || this.mem.world !== world) this.mem = new MapMemory(world);
    this.mem.timer -= 1;
    if (this.mem.timer <= 0) {
      this.mem.timer = 6;
      this.mem.reveal(player.pos.x, player.pos.z, 4);
    }
    drawMinimap(this.minimap, world, this.mem, player);
    if (this.bigMapOpen) drawBigMap(this.bigmapCanvas, world, this.mem, player);
  }

  toggleBigMap(force) {
    const open = force ?? !this.bigMapOpen;
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
    this.promptKey.textContent = touch ? '調べる' : 'E';
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
      '<span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移動</span>',
      '<span><kbd>Shift</kbd> 走る</span>',
      '<span><kbd>E</kbd> 調べる</span>',
      flashlight ? '<span><kbd>F</kbd> ライト</span>' : '',
      '<span><kbd>M</kbd> 地図</span>',
      '<span><kbd>Esc</kbd> 一時停止</span>',
    ];
    el.innerHTML = parts.join('');
    el.classList.remove('gone');
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => el.classList.add('gone'), 9000);
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
    document.getElementById('controls-hint').classList.add('gone');
    this.dlgName.textContent = name;
    this.dlgText.textContent = '';
    this.dlgNext.classList.remove('ready');
    this.dlgFull = text;
    let i = 0;
    const chars = [...text];
    this.typing = setInterval(() => {
      i++;
      this.dlgText.textContent = chars.slice(0, i).join('');
      if (audio && i % 2 === 0 && chars[i - 1] && !'、。…　 '.includes(chars[i - 1])) audio.blip(voice);
      if (i >= chars.length) this.dialogSkip();
    }, 32);
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
    $('dlg-next').textContent = 'タップで次へ';
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
    const checks = { invertY: 'set-invert', headBob: 'set-bob', reduceEffects: 'set-reduce', showFps: 'set-fps' };
    const sync = () => {
      for (const [k, [id, out, fmt]] of Object.entries(fields)) {
        $(id).value = settings[k];
        $(out).textContent = fmt(Number(settings[k]));
      }
      for (const [k, id] of Object.entries(checks)) $(id).checked = !!settings[k];
      $(`set-q-${settings.quality}`).checked = true;
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
    $('settings-reset').addEventListener('click', () => {
      Object.assign(settings, DEFAULT_SETTINGS);
      sync();
      onChange(settings);
    });
  }
}
