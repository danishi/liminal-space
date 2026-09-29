// Settings and progress, stored per browser. Storage can be unavailable
// (private windows, sandboxed frames), so every access is guarded.
const SETTINGS_KEY = 'liminal-drift.settings.v2';

export const DEFAULT_SETTINGS = {
  sensitivity: 1,
  fov: 75,
  master: 0.8,
  music: 0.7,
  sfx: 0.8,
  quality: 'mid',
  invertY: false,
  headBob: true,
  reduceEffects: false,
  showFps: false,
  steer: 0.65,
  minimap: false,
};

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: keep in memory only */
  }
}

/**
 * Phones and tablets, which also get far less memory per tab: a coarse pointer,
 * or an iPad with a trackpad (Safari on iPadOS says it is a Mac, and Macs have
 * no touch points).
 */
export function mobileDevice() {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const iPad = typeof navigator !== 'undefined' && /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
  return coarse || iPad;
}

export function loadSettings() {
  const stored = read(SETTINGS_KEY) || {};
  const s = { ...DEFAULT_SETTINGS, ...stored };
  // First run: pick a sensible default for phones.
  if (!stored.quality) s.quality = mobileDevice() ? 'low' : 'mid';
  return s;
}

export function saveSettings(s) {
  write(SETTINGS_KEY, s);
}

export function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
