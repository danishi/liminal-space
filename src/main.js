import { UI } from './ui/ui.js';
import { Game } from './game/game.js';
import { STAGES } from './stages/index.js';
import { loadSettings, saveSettings } from './core/settings.js';

const canvas = document.getElementById('view');
const ui = new UI();
ui.stagesRef = STAGES;
const settings = loadSettings();
const game = new Game(canvas, ui, settings);
window.__game = game; // handy for debugging from the console

ui.bindSettings(settings, (s) => {
  saveSettings(s);
  game.applySettings(s);
});

function wakeAudio() {
  if (!game.audio.ready) {
    game.audio.init();
    game.applySettings(game.settings);
    game.startAmbience();
  } else game.audio.init();
}
addEventListener('pointerdown', wakeAudio, { capture: true });
addEventListener('keydown', wakeAudio, { capture: true });

function openSelect() {
  game.state = 'select';
  ui.showSelect(game.progress, game.stageIndex);
  game.previewStage(game.stageIndex);
}

document.querySelectorAll('[data-nav]').forEach((b) =>
  b.addEventListener('click', () => {
    game.audio.uiClick();
    const nav = b.dataset.nav;
    if (nav === 'back') goBack();
    else if (nav === 'select') openSelect();
    else ui.show(nav, { push: true });
  }));

function goBack() {
  if (ui.current === 'select') {
    game.state = 'title';
    ui.show('title');
    return;
  }
  ui.back();
}

const acts = {
  resume: () => game.resume(),
  restart: () => game.restart(),
  quit: () => game.quitToSelect(),
  next: () => game.nextStage(),
};
document.querySelectorAll('[data-act]').forEach((b) =>
  b.addEventListener('click', () => {
    game.audio.uiClick();
    acts[b.dataset.act]?.();
  }));

// hover ticks on anything clickable
document.addEventListener('mouseover', (e) => {
  const t = e.target.closest?.('.btn, .stage-card');
  if (t && t !== document.__lastHover) game.audio.uiHover();
  document.__lastHover = t;
});

ui.on('pick', (i) => {
  game.audio.uiClick();
  game.enterStage(i);
});
ui.on('preview', (i) => game.previewStage(i));

document.getElementById('screen-card').addEventListener('click', () => {
  if (game.state === 'card') game.beginPlay();
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
  const cur = ui.current;
  if (cur === 'select') {
    if (e.code === 'ArrowRight' || e.code === 'ArrowDown') ui.moveCard(1), e.preventDefault();
    if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') ui.moveCard(-1), e.preventDefault();
    if (e.code === 'Escape') goBack();
  } else if (cur === 'settings' || cur === 'help') {
    if (e.code === 'Escape') {
      ui.back();
      game.input.presses.delete('pause');
    }
  } else if (cur === 'card' && (e.code === 'Enter' || e.code === 'Space')) {
    e.preventDefault();
    game.beginPlay();
  }
});

// Boot once fonts are in (or after a short timeout).
Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1500))]).then(() => {
  game.showTitle();
  ui.bootDone();
});
