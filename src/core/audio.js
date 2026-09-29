import { Vector3 } from 'three';

// Procedural audio: every sound is synthesised with the Web Audio API.
// Nothing plays until init() runs from a user gesture.

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.ambience = null;
    this.fear = 0;
    this.heartTimer = 0;
    this.volumes = { master: 0.8, music: 0.7, sfx: 0.8 };
    this.ducked = false;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.master.connect(this.comp).connect(ctx.destination);

    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.duck = ctx.createGain();
    this.musicBus.connect(this.duck).connect(this.master);
    this.sfxBus.connect(this.master);

    this.reverb = ctx.createConvolver();
    this.reverbOut = ctx.createGain();
    this.reverbOut.gain.value = 0.9;
    this.reverb.connect(this.reverbOut).connect(this.master);
    this.setReverb(1.6, 3);

    // noise source buffer
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // fear layer: detuned low drone + hiss, gain follows fear level
    this.fearGain = ctx.createGain();
    this.fearGain.gain.value = 0;
    this.fearGain.connect(this.musicBus);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    lp.connect(this.fearGain);
    for (const f of [55, 58.3, 82.4]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.18;
      o.connect(g).connect(lp);
      o.start();
    }
    const hiss = this.noise();
    const hb = ctx.createBiquadFilter();
    hb.type = 'bandpass';
    hb.frequency.value = 5200;
    hb.Q.value = 0.8;
    const hg = ctx.createGain();
    hg.gain.value = 0.25;
    hiss.connect(hb).connect(hg).connect(this.fearGain);
    hiss.start();

    this.ready = true;
    this.applyVolumes();
  }

  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  setVolumes(v) {
    this.volumes = { ...this.volumes, ...v };
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ready) return;
    const t = this.now;
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.volumes.music, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
  }

  setDucked(on) {
    if (!this.ready) return;
    this.duck.gain.setTargetAtTime(on ? 0.25 : 1, this.now, 0.3);
  }

  setReverb(seconds, decay = 3) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    this.reverb.buffer = buf;
  }

  noise() {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    s.loopStart = Math.random();
    return s;
  }

  /** Connects `node` to the sfx bus (or given panner) plus a reverb send. */
  out(node, { send = 0.2, dest = null } = {}) {
    node.connect(dest || this.sfxBus);
    if (send > 0) {
      const g = this.ctx.createGain();
      g.gain.value = send;
      node.connect(g).connect(this.reverb);
    }
  }

  env(g, t, a, d, peak) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  tone({ type = 'sine', f = 440, f2 = null, t = this.now, a = 0.005, d = 0.3, peak = 0.2, send = 0.2, dest = null, bus = null }) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d);
    const g = this.ctx.createGain();
    this.env(g, t, a, d, peak);
    o.connect(g);
    this.out(g, { send, dest: dest || bus });
    o.start(t);
    o.stop(t + a + d + 0.05);
    return o;
  }

  burst({ type = 'lowpass', freq = 800, q = 0.7, t = this.now, a = 0.003, d = 0.1, peak = 0.3, send = 0.15, dest = null, bus = null, sweep = null }) {
    const n = this.noise();
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + a + d);
    f.Q.value = q;
    const g = this.ctx.createGain();
    this.env(g, t, a, d, peak);
    n.connect(f).connect(g);
    this.out(g, { send, dest: dest || bus });
    n.start(t);
    n.stop(t + a + d + 0.05);
  }

  // ---- 3D -----------------------------------------------------------------

  updateListener(cam) {
    if (!this.ready) return;
    const l = this.ctx.listener;
    const p = cam.position;
    const fwd = cam.getWorldDirection(this._fwd || (this._fwd = new Vector3()));
    // standing still: the listener is already heading for these values
    const last = this._lastPose || (this._lastPose = new Float64Array(6).fill(NaN));
    if (last[0] === p.x && last[1] === p.y && last[2] === p.z && last[3] === fwd.x && last[4] === fwd.y && last[5] === fwd.z) return;
    last[0] = p.x;
    last[1] = p.y;
    last[2] = p.z;
    last[3] = fwd.x;
    last[4] = fwd.y;
    last[5] = fwd.z;
    const t = this.now;
    if (l.positionX) {
      l.positionX.setTargetAtTime(p.x, t, 0.02);
      l.positionY.setTargetAtTime(p.y, t, 0.02);
      l.positionZ.setTargetAtTime(p.z, t, 0.02);
      l.forwardX.setTargetAtTime(fwd.x, t, 0.02);
      l.forwardY.setTargetAtTime(fwd.y, t, 0.02);
      l.forwardZ.setTargetAtTime(fwd.z, t, 0.02);
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
    }
  }

  panner(x, y, z, { ref = 2, rolloff = 1.1, max = 60 } = {}) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = rolloff;
    p.maxDistance = max;
    this.setPannerPos(p, x, y, z);
    p.connect(this.sfxBus);
    const g = this.ctx.createGain();
    g.gain.value = 0.25;
    p.connect(g).connect(this.reverb);
    return p;
  }

  setPannerPos(p, x, y, z) {
    if (p.positionX) {
      p.positionX.value = x;
      p.positionY.value = y;
      p.positionZ.value = z;
    } else p.setPosition(x, y, z);
  }

  // ---- one-shots ------------------------------------------------------------

  step(surface, loud = 1) {
    if (!this.ready) return;
    const r = 0.85 + Math.random() * 0.3;
    switch (surface) {
      case 'tile':
        this.burst({ type: 'bandpass', freq: 2600 * r, q: 1.2, d: 0.05, peak: 0.16 * loud, send: 0.5 });
        this.tone({ f: 170 * r, d: 0.05, peak: 0.08 * loud, send: 0.3 });
        break;
      case 'water':
        this.burst({ type: 'bandpass', freq: 900 * r, q: 0.8, a: 0.02, d: 0.28, peak: 0.22 * loud, send: 0.5, sweep: 500 });
        this.burst({ type: 'highpass', freq: 3000, q: 0.5, a: 0.01, d: 0.12, peak: 0.05 * loud, send: 0.4 });
        break;
      case 'soft':
        this.burst({ type: 'lowpass', freq: 1100 * r, d: 0.08, peak: 0.14 * loud, send: 0.1 });
        break;
      case 'stone':
        this.burst({ type: 'bandpass', freq: 1800 * r, q: 0.9, d: 0.05, peak: 0.12 * loud, send: 0.3 });
        this.tone({ f: 120 * r, d: 0.05, peak: 0.08 * loud, send: 0.1 });
        break;
      case 'gravel':
        for (let i = 0; i < 3; i++) this.burst({ type: 'bandpass', freq: (2200 + Math.random() * 1800) * r, q: 1.5, t: this.now + i * 0.018, d: 0.05, peak: 0.07 * loud, send: 0.1 });
        break;
      case 'wood':
        this.burst({ type: 'bandpass', freq: 1300 * r, q: 1, d: 0.06, peak: 0.14 * loud, send: 0.35 });
        this.tone({ f: 95 * r, d: 0.07, peak: 0.12 * loud, send: 0.2 });
        break;
      default: // carpet
        this.burst({ type: 'lowpass', freq: 520 * r, d: 0.1, peak: 0.24 * loud, send: 0.05 });
    }
  }

  pickup() {
    if (!this.ready) return;
    const t = this.now;
    [76, 80, 83, 88, 92].forEach((n, i) =>
      this.tone({ type: 'sine', f: NOTE(n), t: t + i * 0.07, d: 1.2, peak: 0.12, send: 0.7 }));
    this.tone({ type: 'triangle', f: NOTE(64), t, a: 0.05, d: 1.6, peak: 0.06, send: 0.8 });
  }

  unlock() {
    if (!this.ready) return;
    const t = this.now;
    [52, 59, 64, 68, 71].forEach((n, i) => {
      this.tone({ type: 'sawtooth', f: NOTE(n), t: t + i * 0.12, a: 0.6, d: 2.5, peak: 0.025, send: 0.9 });
      this.tone({ type: 'sine', f: NOTE(n + 12), t: t + i * 0.12, a: 0.3, d: 2.5, peak: 0.05, send: 0.9 });
    });
  }

  door() {
    if (!this.ready) return;
    this.tone({ type: 'sawtooth', f: 90, f2: 60, a: 0.2, d: 0.9, peak: 0.05, send: 0.6 });
    this.burst({ type: 'lowpass', freq: 200, d: 0.4, peak: 0.4, send: 0.5 });
  }

  stinger() {
    if (!this.ready) return;
    const t = this.now;
    for (const f of [110, 116.5, 155.6, 233]) this.tone({ type: 'sawtooth', f, f2: f * 0.94, t, a: 0.01, d: 1.6, peak: 0.07, send: 0.6 });
    this.burst({ type: 'highpass', freq: 1800, t, d: 0.5, peak: 0.25, send: 0.5 });
  }

  caught() {
    if (!this.ready) return;
    const t = this.now;
    this.burst({ type: 'lowpass', freq: 6000, t, a: 0.005, d: 1.4, peak: 0.7, send: 0.3, sweep: 300 });
    this.tone({ type: 'sine', f: 70, f2: 30, t, d: 1.5, peak: 0.6, send: 0.2 });
    for (const f of [311, 330, 466]) this.tone({ type: 'square', f, f2: f * 0.5, t, d: 1.0, peak: 0.05, send: 0.4 });
  }

  uiHover() {
    if (!this.ready) return;
    this.tone({ type: 'sine', f: 1500, d: 0.02, peak: 0.03, send: 0 });
  }

  uiClick() {
    if (!this.ready) return;
    this.tone({ type: 'triangle', f: 880, f2: 520, d: 0.06, peak: 0.08, send: 0.1 });
  }

  blip(pitch = 1) {
    if (!this.ready) return;
    this.tone({ type: 'square', f: 420 * pitch * (0.95 + Math.random() * 0.1), d: 0.035, peak: 0.018, send: 0.05 });
  }

  /** A rubber duck's squeak; lower `pitch` for bigger ducks (they squeak longer too). */
  squeak(p, pitch = 1) {
    if (!this.ready) return;
    const t = this.now;
    const len = 1 / Math.sqrt(pitch);
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(900 * pitch, t);
    o.frequency.linearRampToValueAtTime(1500 * pitch, t + 0.08 * len);
    o.frequency.linearRampToValueAtTime(800 * pitch, t + 0.25 * len);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1400 * pitch;
    f.Q.value = 3;
    const g = this.ctx.createGain();
    this.env(g, t, 0.02, 0.25 * len, 0.25);
    o.connect(f).connect(g).connect(p || this.sfxBus);
    o.start(t);
    o.stop(t + 0.35 * len);
  }

  boop(p, pitch = 1) {
    if (!this.ready) return;
    this.tone({ type: 'sine', f: 380 * pitch, f2: 760 * pitch, a: 0.01, d: 0.18, peak: 0.25, send: 0.3, dest: p });
  }

  thump(p, loud = 1) {
    if (!this.ready) return;
    this.tone({ type: 'sine', f: 70, f2: 38, d: 0.22, peak: 0.6 * loud, send: 0.4, dest: p });
    this.burst({ type: 'lowpass', freq: 260, d: 0.15, peak: 0.5 * loud, send: 0.3, dest: p });
  }

  giggle(p) {
    if (!this.ready) return;
    const t = this.now;
    for (let i = 0; i < 6; i++) {
      const tt = t + i * 0.11 + Math.random() * 0.02;
      const f = 520 + Math.random() * 120 - i * 18;
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(f * 1.2, tt);
      o.frequency.exponentialRampToValueAtTime(f * 0.8, tt + 0.08);
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1100;
      bp.Q.value = 2;
      const g = this.ctx.createGain();
      this.env(g, tt, 0.01, 0.09, 0.35);
      o.connect(bp).connect(g).connect(p || this.sfxBus);
      o.start(tt);
      o.stop(tt + 0.14);
    }
  }

  whisper(p) {
    if (!this.ready) return;
    const t = this.now;
    for (let i = 0; i < 4; i++) {
      this.burst({ type: 'bandpass', freq: 1800 + Math.random() * 1500, q: 4, t: t + i * 0.18, a: 0.05, d: 0.15, peak: 0.35, send: 0.4, dest: p });
    }
  }

  ding() {
    if (!this.ready) return;
    const t = this.now;
    this.tone({ f: 1318.5, t, d: 2.2, peak: 0.08, send: 0.7 });
    this.tone({ f: 1046.5, t: t + 0.45, d: 2.4, peak: 0.08, send: 0.7 });
  }

  chime() {
    // Westminster quarters, as heard from school speakers.
    if (!this.ready) return;
    const t = this.now;
    const seq = [64, 60, 62, 55, 55, 62, 64, 60];
    seq.forEach((n, i) => {
      const tt = t + (i < 4 ? i : i + 0.6) * 0.62;
      this.tone({ type: 'sine', f: NOTE(n), t: tt, a: 0.01, d: 1.8, peak: 0.08, send: 0.9, bus: this.musicBus });
      this.tone({ type: 'triangle', f: NOTE(n + 12), t: tt, a: 0.01, d: 0.8, peak: 0.015, send: 0.9, bus: this.musicBus });
    });
  }

  /** Tape-warp whoosh used when drifting between levels. */
  driftSound(kind = 'door') {
    if (!this.ready) return;
    const t = this.now;
    if (kind === 'fall') {
      this.burst({ type: 'bandpass', freq: 400, q: 0.6, t, a: 0.4, d: 1.4, peak: 0.5, send: 0.6, sweep: 2400 });
      this.tone({ type: 'sine', f: 180, f2: 40, t, a: 0.3, d: 1.6, peak: 0.25, send: 0.4 });
    } else {
      this.burst({ type: 'lowpass', freq: 5000, t, a: 0.05, d: 1.2, peak: 0.35, send: 0.8, sweep: 200 });
      this.tone({ type: 'sawtooth', f: 90, f2: 30, t, a: 0.1, d: 1.0, peak: 0.05, send: 0.6 });
    }
  }

  /** Positional low hum behind a door to another level. Returns { stop }. */
  doorHum(x, y, z) {
    if (!this.ready) return null;
    const p = this.panner(x, y, z, { ref: 1.5, rolloff: 1.6, max: 30 });
    const n = this.noise();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 180 + Math.random() * 120;
    f.Q.value = 3;
    const g = this.ctx.createGain();
    g.gain.value = 0.5;
    const o = this.ctx.createOscillator();
    o.frequency.value = 55 + Math.random() * 30;
    const og = this.ctx.createGain();
    og.gain.value = 0.12;
    n.connect(f).connect(g).connect(p);
    o.connect(og).connect(p);
    n.start();
    o.start();
    return {
      stop: () => {
        try {
          n.stop();
          o.stop();
        } catch {
          /* already stopped */
        }
        p.disconnect();
      },
    };
  }

  /**
   * Continuous filtered drone into `dest` (a panner): fridges, massage chairs,
   * an idling engine. Returns { osc, gain, freq, stop }.
   */
  hum(dest, { freq = 60, type = 'sawtooth', cut = 240, gain = 0 } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cut;
    const g = ctx.createGain();
    g.gain.value = gain;
    o.connect(f).connect(g).connect(dest);
    o.start();
    return {
      osc: o,
      gain: g.gain,
      freq: o.frequency,
      stop() {
        try {
          o.stop();
        } catch {
          /* already stopped */
        }
      },
    };
  }

  phoneRing(p) {
    if (!this.ready) return;
    const t = this.now;
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < 12; i++) {
        const tt = t + r * 0.55 + i * 0.035;
        this.tone({ type: 'square', f: i % 2 ? 480 : 440, t: tt, a: 0.002, d: 0.03, peak: 0.05, send: 0.3, dest: p });
      }
    }
  }

  trainRumble() {
    if (!this.ready) return;
    const t = this.now;
    this.burst({ type: 'lowpass', freq: 120, q: 0.8, t, a: 2.5, d: 4.5, peak: 0.6, send: 0.8, bus: this.musicBus });
    for (let i = 0; i < 8; i++) this.burst({ type: 'bandpass', freq: 300, q: 2, t: t + 1.5 + i * 0.32, a: 0.01, d: 0.12, peak: 0.12, send: 0.8, bus: this.musicBus });
  }

  departureMelody() {
    if (!this.ready) return;
    const t = this.now;
    [76, 79, 84, 79, 81, 84, 88, 86].forEach((n, i) => this.tone({ type: 'triangle', f: NOTE(n), t: t + i * 0.18, d: 0.3, peak: 0.035, send: 1, bus: this.musicBus }));
  }

  temple() {
    if (!this.ready) return;
    const t = this.now;
    for (const [f, a] of [[98, 0.18], [196.5, 0.08], [264, 0.05], [417, 0.03]]) this.tone({ type: 'sine', f, t, a: 0.01, d: 7, peak: a * 0.5, send: 1.2, bus: this.musicBus });
  }

  meow(p, pitch = 1) {
    if (!this.ready) return;
    const t = this.now;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(520 * pitch, t);
    o.frequency.linearRampToValueAtTime(760 * pitch, t + 0.18);
    o.frequency.linearRampToValueAtTime(430 * pitch, t + 0.55);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 5;
    f.frequency.setValueAtTime(900, t);
    f.frequency.linearRampToValueAtTime(1800, t + 0.2);
    f.frequency.linearRampToValueAtTime(1000, t + 0.55);
    const g = this.ctx.createGain();
    this.env(g, t, 0.06, 0.5, 0.3);
    o.connect(f).connect(g).connect(p || this.sfxBus);
    const r = this.ctx.createGain();
    r.gain.value = 0.2;
    g.connect(r).connect(this.reverb);
    o.start(t);
    o.stop(t + 0.7);
  }

  purr(p, seconds = 2) {
    if (!this.ready) return;
    const t = this.now;
    const n = Math.floor(seconds * 26);
    for (let i = 0; i < n; i++) this.burst({ type: 'lowpass', freq: 160, q: 1.5, t: t + i / 26, a: 0.008, d: 0.03, peak: 0.12 * Math.sin((i / n) * Math.PI), send: 0.05, dest: p });
  }

  /** A hollow plastic clack (mannequin joints, plastic buckets). */
  clack(p, pitch = 1) {
    if (!this.ready) return;
    const t = this.now;
    this.burst({ type: 'bandpass', freq: 1800 * pitch, q: 4, t, a: 0.001, d: 0.05, peak: 0.4, send: 0.3, dest: p });
    this.tone({ type: 'triangle', f: 620 * pitch, f2: 540 * pitch, t, a: 0.001, d: 0.09, peak: 0.12, send: 0.3, dest: p });
  }

  /** "Kon": a yellow plastic bath bucket set down on tile. */
  bucket(p) {
    if (!this.ready) return;
    const t = this.now;
    this.tone({ type: 'sine', f: 330, f2: 310, t, a: 0.001, d: 0.35, peak: 0.3, send: 1.2, dest: p });
    this.tone({ type: 'triangle', f: 990, f2: 950, t, a: 0.001, d: 0.12, peak: 0.06, send: 1.2, dest: p });
    this.burst({ type: 'bandpass', freq: 2400, q: 3, t, a: 0.001, d: 0.03, peak: 0.2, send: 1, dest: p });
  }

  honk(p, pattern = [0.25]) {
    if (!this.ready) return;
    let t = this.now;
    for (const len of pattern) {
      for (const f of [410, 520]) this.tone({ type: 'square', f, t, a: 0.01, d: len, peak: 0.05, send: 0.6, dest: p });
      t += len + 0.12;
    }
  }

  /** Car alarm chirp (lock / unlock). */
  chirp(p, n = 2) {
    if (!this.ready) return;
    const t = this.now;
    for (let i = 0; i < n; i++) this.tone({ type: 'square', f: 2400, f2: 2200, t: t + i * 0.16, a: 0.003, d: 0.08, peak: 0.04, send: 0.8, dest: p });
  }

  /** The alarm proper: a rising, falling siren for a few seconds. */
  carAlarm(p, seconds = 4) {
    if (!this.ready) return;
    const t = this.now;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    for (let i = 0; i < seconds * 2; i++) {
      o.frequency.setValueAtTime(900, t + i * 0.5);
      o.frequency.linearRampToValueAtTime(1600, t + i * 0.5 + 0.45);
    }
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2500;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.05);
    g.gain.setValueAtTime(0.05, t + seconds - 0.1);
    g.gain.linearRampToValueAtTime(0, t + seconds);
    o.connect(f).connect(g).connect(p || this.sfxBus);
    const r = this.ctx.createGain();
    r.gain.value = 0.5;
    g.connect(r).connect(this.reverb);
    o.start(t);
    o.stop(t + seconds + 0.1);
  }

  beep(p, pitch = 1, n = 2) {
    if (!this.ready) return;
    const t = this.now;
    for (let i = 0; i < n; i++) this.tone({ type: 'sine', f: 1760 * pitch * (i % 2 ? 1.26 : 1), t: t + i * 0.12, a: 0.003, d: 0.08, peak: 0.06, send: 0.3, dest: p });
  }

  snore(p) {
    if (!this.ready) return;
    const t = this.now;
    this.burst({ type: 'lowpass', freq: 220, q: 4, t, a: 0.6, d: 0.9, peak: 0.25, send: 0.3, dest: p, sweep: 140 });
    this.burst({ type: 'bandpass', freq: 900, q: 2, t: t + 1.6, a: 0.4, d: 0.6, peak: 0.08, send: 0.3, dest: p });
  }

  splash(p, big = 1) {
    if (!this.ready) return;
    const t = this.now;
    this.burst({ type: 'bandpass', freq: 1200, q: 0.8, t, a: 0.005, d: 0.4 * big, peak: 0.35, send: 0.8, dest: p, sweep: 500 });
    for (let i = 0; i < 5; i++) {
      const f = 900 + Math.random() * 1800;
      this.tone({ f, f2: f * 1.6, t: t + 0.05 + Math.random() * 0.3, d: 0.05, peak: 0.04, send: 1, dest: p });
    }
  }

  /** Short digital tearing noise for glitches between levels. */
  glitch(level = 1) {
    if (!this.ready) return;
    const t = this.now;
    for (let i = 0; i < 5; i++) {
      this.tone({ type: 'square', f: 80 + Math.random() * 1400, t: t + i * 0.03, a: 0.001, d: 0.03, peak: 0.03 * level, send: 0.1 });
    }
    this.burst({ type: 'highpass', freq: 3000, t, a: 0.001, d: 0.15, peak: 0.1 * level, send: 0.2 });
  }

  /** Floor giving way at panner `p`: a crack, a heavy drop, then grit rattling away below. */
  crumble(p, size = 1) {
    if (!this.ready) return;
    const t = this.now;
    this.burst({ type: 'bandpass', freq: 1400, q: 0.9, t, a: 0.002, d: 0.09, peak: 0.3 * size, send: 0.4, dest: p });
    this.burst({ type: 'lowpass', freq: 380, q: 0.8, t: t + 0.02, a: 0.01, d: 0.7 * size, peak: 0.55 * size, send: 0.6, dest: p, sweep: 70 });
    this.tone({ f: 75, f2: 30, t: t + 0.02, d: 0.45, peak: 0.45 * size, send: 0.3, dest: p });
    for (let i = 0; i < 7; i++) {
      const tt = t + 0.08 + Math.random() * 0.9;
      this.burst({ type: 'bandpass', freq: 900 + Math.random() * 2600, q: 2.5, t: tt, a: 0.001, d: 0.025, peak: 0.1 * size * (1 - (tt - t) / 1.1), send: 0.7, dest: p });
    }
  }

  /** Concrete under strain at panner `p`: a low groan bending down, and a few ticks. */
  creak(p, loud = 1) {
    if (!this.ready) return;
    const t = this.now;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    const f0 = 55 + Math.random() * 40;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f0 * 0.7, t + 1.1);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 320;
    bp.Q.value = 5;
    const g = this.ctx.createGain();
    this.env(g, t, 0.2, 0.9, 0.22 * loud);
    o.connect(bp).connect(g);
    this.out(g, { send: 0.5, dest: p });
    o.start(t);
    o.stop(t + 1.2);
    for (let i = 0; i < 4; i++) this.burst({ type: 'highpass', freq: 2500, t: t + 0.1 + Math.random() * 0.8, a: 0.001, d: 0.02, peak: 0.08 * loud, send: 0.4, dest: p });
  }

  /** A low rolling rumble under everything while a level comes apart (0..1). */
  setRumble(level) {
    if (!this.ready) return;
    if (!this.rumbleGain) {
      const ctx = this.ctx;
      this.rumbleGain = ctx.createGain();
      this.rumbleGain.gain.value = 0;
      this.rumbleGain.connect(this.musicBus);
      const n = this.noise();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 110;
      lp.Q.value = 0.9;
      const ng = ctx.createGain();
      ng.gain.value = 1.4;
      n.connect(lp).connect(ng).connect(this.rumbleGain);
      n.start();
      // it rolls rather than hisses
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.7;
      const lg = ctx.createGain();
      lg.gain.value = 0.5;
      lfo.connect(lg).connect(ng.gain);
      lfo.start();
      const sub = ctx.createOscillator();
      sub.frequency.value = 31;
      const sg = ctx.createGain();
      sg.gain.value = 0.3;
      sub.connect(sg).connect(this.rumbleGain);
      sub.start();
    }
    const v = Math.min(1, level) * 0.5;
    if (Math.abs(v - (this._rumbleSent ?? -1)) < 1e-3) return;
    const rising = v > (this._rumbleSent ?? 0);
    this._rumbleSent = v;
    this.rumbleGain.gain.setTargetAtTime(v, this.now, rising ? 0.15 : 0.6);
  }

  // ---- fear & heartbeat ------------------------------------------------------

  setFear(level) {
    this.fear = level;
    if (!this.ready) return;
    const v = Math.min(1, level) * 0.09;
    if (Math.abs(v - (this._fearSent ?? -1)) < 1e-4) return;
    this._fearSent = v;
    this.fearGain.gain.setTargetAtTime(v, this.now, 0.4);
  }

  update(dt) {
    if (!this.ready) return;
    if (this.fear > 0.35) {
      this.heartTimer -= dt;
      if (this.heartTimer <= 0) {
        const bpm = 70 + this.fear * 70;
        this.heartTimer = 60 / bpm;
        const t = this.now;
        const v = Math.min(1, (this.fear - 0.3) * 1.5) * 0.5;
        this.tone({ f: 58, f2: 40, t, d: 0.12, peak: v, send: 0 });
        this.tone({ f: 52, f2: 36, t: t + 0.16, d: 0.14, peak: v * 0.7, send: 0 });
      }
    }
    if (this.ambience) this.ambience.update(dt);
    if (this.bleedAmb) this.bleedAmb.update(dt);
  }

  // ---- ambience ------------------------------------------------------------

  setAmbience(kind, bleed = null) {
    if (!this.ready) return;
    if (this.ambience) this.ambience.stop();
    if (this.bleedAmb) this.bleedAmb.stop();
    this.ambience = kind ? new Ambience(this, kind) : null;
    // a second level's ambience leaking in; its gain follows setBleed()
    this.bleedAmb = bleed && bleed !== kind ? new Ambience(this, bleed, 0) : null;
  }

  /** How much of the bleeding level can be heard (0..1). */
  setBleed(v) {
    if (!this.bleedAmb) return;
    if (this.bleedAmb.sent !== undefined && Math.abs(v - this.bleedAmb.sent) < 1e-3) return;
    this.bleedAmb.sent = v;
    this.bleedAmb.out.gain.setTargetAtTime(v * 0.9, this.now, 0.3);
    this.ambience?.out.gain.setTargetAtTime(1 - v * 0.6, this.now, 0.3);
  }
}

class Ambience {
  constructor(engine, kind, level = 1) {
    this.e = engine;
    this.kind = kind;
    const ctx = engine.ctx;
    this.nodes = [];
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.gain.setTargetAtTime(level, ctx.currentTime, 1.2);
    this.out.connect(engine.musicBus);
    const send = ctx.createGain();
    send.gain.value = 0.4;
    this.out.connect(send).connect(engine.reverb);
    this.timers = {};
    this.step = 0;
    const setup = {
      hum: () => this.hum(),
      pool: () => this.pool(),
      dream: () => this.dream(),
      hotel: () => this.hotel(),
      school: () => this.school(),
      station: () => this.station(),
      shrine: () => this.shrine(),
      mall: () => this.mall(),
      garage: () => this.garage(),
      bath: () => this.bath(),
    }[kind];
    if (setup) setup();
  }

  osc(type, f, gain, dest = this.out) {
    const o = this.e.ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const g = this.e.ctx.createGain();
    g.gain.value = gain;
    o.connect(g).connect(dest);
    o.start();
    this.nodes.push(o);
    return { o, g };
  }

  filtered(type, freq, q, dest = this.out) {
    const f = this.e.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    f.connect(dest);
    return f;
  }

  noiseLayer(type, freq, q, gain) {
    const n = this.e.noise();
    const g = this.e.ctx.createGain();
    g.gain.value = gain;
    n.connect(this.filtered(type, freq, q, g));
    g.connect(this.out);
    n.start();
    this.nodes.push(n);
    return g;
  }

  lfo(param, rate, depth) {
    const o = this.e.ctx.createOscillator();
    o.frequency.value = rate;
    const g = this.e.ctx.createGain();
    g.gain.value = depth;
    o.connect(g).connect(param);
    o.start();
    this.nodes.push(o);
  }

  every(name, min, max, dt, fn) {
    if (this.timers[name] === undefined) this.timers[name] = min + Math.random() * (max - min);
    this.timers[name] -= dt;
    if (this.timers[name] <= 0) {
      this.timers[name] = min + Math.random() * (max - min);
      fn();
    }
  }

  // Level 0: mains hum of fluorescent tubes
  hum() {
    const lp = this.filtered('lowpass', 320, 1);
    this.osc('sawtooth', 60, 0.05, lp);
    const bp = this.filtered('bandpass', 240, 3);
    this.osc('sawtooth', 120.3, 0.025, bp);
    this.osc('sine', 180, 0.006);
    this.noiseLayer('bandpass', 4200, 6, 0.012);
  }

  pool() {
    const g = this.noiseLayer('lowpass', 480, 0.6, 0.07);
    this.lfo(g.gain, 0.13, 0.04);
    this.pad = [57, 61, 64, 71].map((n) => this.osc('sine', NOTE(n), 0.012));
  }

  dream() {
    const g = this.noiseLayer('lowpass', 700, 0.5, 0.02);
    this.lfo(g.gain, 0.08, 0.015);
    this.pad = [48, 55, 64].map((n) => this.osc('triangle', NOTE(n), 0.01));
    const d = this.e.ctx.createDelay(1);
    d.delayTime.value = 0.375;
    const fb = this.e.ctx.createGain();
    fb.gain.value = 0.38;
    d.connect(fb).connect(d);
    d.connect(this.out);
    this.delay = d;
    this.melody = 72;
  }

  hotel() {
    const lp = this.filtered('lowpass', 150, 1);
    this.osc('sawtooth', 41.2, 0.06, lp);
    this.osc('sawtooth', 41.7, 0.06, lp);
    this.noiseLayer('lowpass', 260, 0.7, 0.03);
  }

  school() {
    this.noiseLayer('lowpass', 900, 0.5, 0.018);
    this.pad = [53, 60, 64, 69].map((n) => this.osc('sine', NOTE(n), 0.008));
  }

  station() {
    const lp = this.filtered('lowpass', 300, 1);
    this.osc('sawtooth', 50, 0.035, lp);
    this.osc('sawtooth', 100.4, 0.015, lp);
    this.noiseLayer('bandpass', 5200, 5, 0.006);
    this.noiseLayer('lowpass', 200, 0.6, 0.03);
  }

  shrine() {
    const g = this.noiseLayer('bandpass', 700, 0.4, 0.03);
    this.lfo(g.gain, 0.07, 0.02);
    this.noiseLayer('highpass', 6000, 0.5, 0.004);
    this.melody = 62;
  }

  // Dead mall: muzak from ceiling speakers, a little too slow, a little detuned
  mall() {
    this.noiseLayer('lowpass', 500, 0.5, 0.02);
    const lp = this.filtered('lowpass', 1400, 0.7);
    const wob = this.e.ctx.createDelay(0.05);
    wob.delayTime.value = 0.012;
    this.lfo(wob.delayTime, 0.35, 0.004);
    wob.connect(lp);
    this.muzak = wob;
    this.pad = [50, 57, 62, 66].map((n) => this.osc('triangle', NOTE(n) * 0.995, 0.006, lp));
    this.melody = 74;
  }

  // Parking garage: ventilation, sodium ballast buzz, the building settling
  garage() {
    const g = this.noiseLayer('lowpass', 140, 0.8, 0.06);
    this.lfo(g.gain, 0.05, 0.02);
    const bp = this.filtered('bandpass', 100, 8);
    this.osc('sawtooth', 100, 0.01, bp);
    this.noiseLayer('bandpass', 2600, 8, 0.004);
  }

  // Bathhouse: running water into the big bath, tiles, steam
  bath() {
    const g = this.noiseLayer('bandpass', 1300, 0.6, 0.035);
    this.lfo(g.gain, 0.3, 0.01);
    this.noiseLayer('lowpass', 300, 0.7, 0.03);
  }

  update(dt) {
    const e = this.e;
    const t = e.now;
    switch (this.kind) {
      case 'mall':
        this.every('note', 0.45, 0.9, dt, () => {
          const scale = [62, 64, 66, 69, 71, 74, 76, 78, 81];
          let idx = scale.indexOf(this.melody);
          if (idx < 0) idx = 5;
          idx = Math.max(0, Math.min(scale.length - 1, idx + Math.floor(Math.random() * 5) - 2));
          this.melody = scale[idx];
          if (Math.random() < 0.3) return;
          e.tone({ type: 'sine', f: NOTE(this.melody) * 0.995, d: 1.4, peak: 0.03, send: 0.6, dest: this.muzak });
          e.tone({ type: 'triangle', f: NOTE(this.melody + 12) * 0.995, d: 0.5, peak: 0.006, send: 0.6, dest: this.muzak });
        });
        this.every('chord', 5, 7, dt, () => {
          const chords = [[50, 57, 62, 66], [55, 59, 62, 67], [47, 54, 59, 62], [52, 57, 61, 64]];
          const c = chords[(this.step++) % chords.length];
          this.pad.forEach((p, i) => p.o.frequency.setTargetAtTime(NOTE(c[i]) * 0.995, t, 0.8));
        });
        this.every('pa', 35, 70, dt, () => {
          [72, 76, 79, 84].forEach((n, i) => e.tone({ type: 'sine', f: NOTE(n), t: t + i * 0.25, d: 0.9, peak: 0.02, send: 1.4, bus: this.out }));
        });
        break;
      case 'garage':
        this.every('drip', 3, 9, dt, () => e.tone({ f: 1800 + Math.random() * 900, f2: 900, d: 0.04, peak: 0.03, send: 1.5, bus: this.out }));
        this.every('car', 25, 60, dt, () => {
          // a car somewhere on another level, going round and round
          e.burst({ type: 'lowpass', freq: 180, q: 1, t, a: 2, d: 3, peak: 0.12, send: 1, bus: this.out, sweep: 90 });
          e.burst({ type: 'bandpass', freq: 700, q: 4, t: t + 2.2, a: 0.05, d: 0.4, peak: 0.03, send: 1.4, bus: this.out, sweep: 500 });
        });
        this.every('clank', 15, 40, dt, () => e.burst({ type: 'bandpass', freq: 500, q: 8, t, a: 0.001, d: 0.3, peak: 0.05, send: 1.6, bus: this.out }));
        break;
      case 'bath':
        this.every('drip', 0.8, 3, dt, () => {
          const f = 1200 + Math.random() * 1400;
          e.tone({ f, f2: f * 0.6, d: 0.05, peak: 0.05, send: 2, bus: this.out });
        });
        this.every('kon', 20, 45, dt, () => e.bucket(this.out));
        break;
      case 'hum':
        this.every('far', 14, 32, dt, () => {
          if (Math.random() < 0.5) e.burst({ type: 'lowpass', freq: 160, a: 0.01, d: 0.6, peak: 0.12, send: 1, bus: this.out });
          else e.tone({ type: 'sine', f: NOTE(40 + Math.floor(Math.random() * 8)), a: 1.5, d: 3, peak: 0.015, send: 1, bus: this.out });
        });
        this.every('flicker', 5, 12, dt, () => e.burst({ type: 'bandpass', freq: 3200, q: 10, d: 0.08, peak: 0.05, send: 0.3, bus: this.out }));
        break;
      case 'pool':
        this.every('drip', 0.6, 2.6, dt, () => {
          const f = 1400 + Math.random() * 1600;
          e.tone({ f, f2: f * 0.55, d: 0.05, peak: 0.05, send: 1.6, bus: this.out });
        });
        this.every('chord', 7, 10, dt, () => {
          const chords = [[57, 61, 64, 71], [54, 61, 64, 69], [52, 59, 64, 68], [50, 57, 62, 69]];
          const c = chords[(this.step++) % chords.length];
          this.pad.forEach((p, i) => p.o.frequency.setTargetAtTime(NOTE(c[i]), t, 1.5));
        });
        break;
      case 'dream':
        this.every('note', 0.28, 0.62, dt, () => {
          const scale = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81];
          let idx = scale.indexOf(this.melody);
          if (idx < 0) idx = 5;
          idx = Math.max(0, Math.min(scale.length - 1, idx + Math.floor(Math.random() * 5) - 2));
          this.melody = scale[idx];
          if (Math.random() < 0.18) return; // rest
          e.tone({ type: 'triangle', f: NOTE(this.melody), d: 1.1, peak: 0.05, send: 0.3, dest: this.delay });
          e.tone({ type: 'sine', f: NOTE(this.melody + 12), d: 0.6, peak: 0.02, send: 0.3, dest: this.delay });
        });
        this.every('chord', 6, 8, dt, () => {
          const chords = [[48, 55, 64], [53, 57, 64], [45, 52, 60], [50, 57, 65]];
          const c = chords[(this.step++) % chords.length];
          this.pad.forEach((p, i) => p.o.frequency.setTargetAtTime(NOTE(c[i]), t, 1));
        });
        break;
      case 'hotel':
        this.every('creak', 9, 22, dt, () => {
          e.tone({ type: 'sawtooth', f: 180 + Math.random() * 80, f2: 120, a: 0.3, d: 0.8, peak: 0.012, send: 1, bus: this.out });
        });
        this.every('knock', 25, 50, dt, () => {
          for (let i = 0; i < 3; i++) e.burst({ type: 'lowpass', freq: 420, t: t + i * 0.28, d: 0.08, peak: 0.12, send: 1.2, bus: this.out });
        });
        this.every('ding', 40, 80, dt, () => e.ding());
        break;
      case 'station':
        this.every('train', 30, 70, dt, () => e.trainRumble());
        this.every('melody', 45, 90, dt, () => e.departureMelody());
        this.every('pa', 20, 45, dt, () => {
          for (let i = 0; i < 2; i++) e.tone({ type: 'sine', f: i ? 659 : 784, t: t + i * 0.35, d: 0.6, peak: 0.03, send: 1.2, bus: this.out });
          for (let i = 0; i < 10; i++) e.burst({ type: 'bandpass', freq: 600 + Math.random() * 900, q: 5, t: t + 0.9 + i * 0.14, a: 0.02, d: 0.1, peak: 0.02, send: 1.2, bus: this.out });
        });
        break;
      case 'shrine':
        // bell crickets (suzumushi) and a koto-like pluck now and then
        this.every('cricket', 0.8, 2.2, dt, () => {
          const n = 3 + Math.floor(Math.random() * 4);
          for (let i = 0; i < n; i++) e.tone({ type: 'sine', f: 4100 + Math.random() * 200, t: t + i * 0.07, a: 0.005, d: 0.05, peak: 0.008, send: 0.5, bus: this.out });
        });
        this.every('koto', 4, 9, dt, () => {
          const scale = [62, 63, 67, 69, 70, 74, 75, 79];
          const n = scale[Math.floor(Math.random() * scale.length)];
          e.tone({ type: 'triangle', f: NOTE(n), a: 0.003, d: 1.8, peak: 0.04, send: 0.9, bus: this.out });
          e.tone({ type: 'sine', f: NOTE(n + 12), a: 0.003, d: 0.6, peak: 0.015, send: 0.9, bus: this.out });
        });
        this.every('furin', 12, 25, dt, () => e.tone({ type: 'sine', f: 2637 + Math.random() * 300, a: 0.002, d: 1.5, peak: 0.02, send: 1, bus: this.out }));
        this.every('bell', 50, 100, dt, () => e.temple());
        break;
      case 'school':
        // evening cicadas: "kana-kana-kana"
        this.every('higurashi', 5, 11, dt, () => {
          const base = t + Math.random() * 0.2;
          const n = 10 + Math.floor(Math.random() * 10);
          for (let i = 0; i < n; i++) {
            const tt = base + i * 0.09;
            const peak = 0.012 * Math.sin((i / n) * Math.PI);
            e.tone({ type: 'sine', f: 4300 + Math.sin(i) * 200, t: tt, a: 0.01, d: 0.06, peak, send: 1, bus: this.out });
          }
        });
        this.every('crow', 18, 40, dt, () => {
          for (let i = 0; i < 2; i++) e.burst({ type: 'bandpass', freq: 900, q: 6, t: t + i * 0.45, a: 0.03, d: 0.3, peak: 0.02, send: 1.5, bus: this.out });
        });
        break;
    }
  }

  stop() {
    const t = this.e.now;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(0, t, 0.4);
    const nodes = this.nodes;
    setTimeout(() => {
      for (const n of nodes) {
        try {
          n.stop();
        } catch {
          /* already stopped */
        }
      }
      this.out.disconnect();
    }, 2500);
  }
}
