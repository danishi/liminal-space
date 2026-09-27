import { UI } from './ui/ui.js';
import { Game } from './game/game.js';
import { loadSettings, saveSettings } from './core/settings.js';
import * as THREE from 'three';
import * as assets from './core/assets.js';

const canvas = document.getElementById('view');
const ui = new UI();
const settings = loadSettings();
const game = new Game(canvas, ui, settings);
window.__game = game; // handy for debugging from the console
window.__assets = assets;
window.__THREE = THREE;

ui.bindSettings(settings, (s) => {
  saveSettings(s);
  game.applySettings(s);
});

function wakeAudio() {
  const first = !game.audio.ready;
  game.audio.init();
  if (first && game.audio.ready) {
    game.applySettings(game.settings);
    game.startAmbience();
  }
}
addEventListener('pointerdown', wakeAudio, { capture: true });
addEventListener('keydown', wakeAudio, { capture: true });

document.querySelectorAll('[data-nav]').forEach((b) =>
  b.addEventListener('click', () => {
    game.audio.uiClick();
    const nav = b.dataset.nav;
    if (nav === 'back') ui.back();
    else ui.show(nav, { push: true });
  }));

const acts = {
  start: () => game.start(),
  resume: () => game.resume(),
  drift: () => {
    game.input.requestLock();
    game.drift(null, 'menu');
  },
  quit: () => game.quitToTitle(),
};
document.querySelectorAll('[data-act]').forEach((b) =>
  b.addEventListener('click', () => {
    game.audio.uiClick();
    acts[b.dataset.act]?.();
  }));

// hover ticks on anything clickable
let lastHover = null;
document.addEventListener('mouseover', (e) => {
  const t = e.target.closest?.('.btn');
  if (t && t !== lastHover) game.audio.uiHover();
  lastHover = t;
});

document.getElementById('resume-hint').addEventListener('click', () => {
  ui.showResumeHint(false);
  game.input.requestLock();
});
canvas.addEventListener('click', () => {
  if (game.state === 'playing' && !game.input.locked) game.input.requestLock();
});
document.getElementById('dialog').addEventListener('click', () => {
  if (game.state === 'playing') game.advanceDialog();
});
document.getElementById('bigmap').addEventListener('click', () => ui.toggleBigMap(false));

addEventListener('keydown', (e) => {
  if ((ui.current === 'settings' || ui.current === 'help') && e.code === 'Escape') {
    ui.back();
    game.input.presses.delete('pause');
  }
});

// Boot once fonts are in (or after a short timeout).
Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1500))]).then(async () => {
  await game.showTitle();
  ui.bootDone();
});
