// Small seeded RNG (mulberry32) so a stage layout can be reproduced from a seed.
export class RNG {
  constructor(seed = Date.now()) {
    this.seed = seed >>> 0;
    this.state = this.seed;
  }

  next() {
    let t = (this.state = (this.state + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  float(a = 0, b = 1) {
    return a + (b - a) * this.next();
  }

  int(a, b) {
    return Math.floor(this.float(a, b + 1));
  }

  chance(p) {
    return this.next() < p;
  }

  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** Weighted shuffle: items with a larger weight(item) tend to come first. */
  weightedShuffle(arr, weight) {
    const keyed = arr.map((v) => ({ v, k: Math.pow(this.next(), 1 / Math.max(1e-6, weight(v))) }));
    keyed.sort((a, b) => b.k - a.k);
    keyed.forEach((e, i) => (arr[i] = e.v));
    return arr;
  }
}
