// Session caches for what levels make or load (painted textures, procedural
// surfaces, photo textures, models, HDRIs). Returning to a level, or a level
// that shares something with an earlier one, is quicker when it is still here,
// but phones kill a tab that holds every level at once, so the game trims the
// caches before each level loads (see trimCaches).

const caches = [];
// bumped once per level; entries remember the last level that used them
let level = 0;

export class SessionCache {
  constructor() {
    this.map = new Map();
    caches.push(this);
  }

  has(key) {
    return this.map.has(key);
  }

  get(key) {
    const e = this.map.get(key);
    if (!e) return undefined;
    e.used = level;
    return e.value;
  }

  /** Stores value; `bytes` is its rough memory cost, free(value) lets go of it. */
  set(key, value, bytes = 0, free = null) {
    this.map.set(key, { value, bytes, free, used: level });
    return value;
  }

  /** Records a lookup made elsewhere (a stage asking for something it will use). */
  touch(key) {
    const e = this.map.get(key);
    if (e) e.used = level;
  }

  delete(key) {
    const e = this.map.get(key);
    if (!e) return;
    this.map.delete(key);
    e.free?.(e.value);
  }
}

/** Starts a new level: from here on, lookups count as used by it. */
export function nextCacheLevel() {
  level++;
}

/**
 * Lets go of entries the new level hasn't asked for yet, least recently used
 * first, until the caches hold no more than `budget` bytes.
 */
export function trimCaches(budget) {
  let total = 0;
  const stale = [];
  for (const c of caches) {
    for (const [key, e] of c.map) {
      total += e.bytes;
      if (e.used < level) stale.push([c, key, e.used, e.bytes]);
    }
  }
  if (total <= budget) return;
  stale.sort((a, b) => a[2] - b[2]);
  for (const [c, key, , bytes] of stale) {
    if (total <= budget) break;
    c.delete(key);
    total -= bytes;
  }
}

/** Empties every cache (after the texture detail changes). */
export function clearCaches() {
  for (const c of caches) for (const key of [...c.map.keys()]) c.delete(key);
}

/** Rough memory held by the caches, in bytes. */
export function cacheBytes() {
  let total = 0;
  for (const c of caches) for (const e of c.map.values()) total += e.bytes;
  return total;
}

/** Pixel bytes of a texture's source (what the page keeps besides the GPU copy). */
export function textureBytes(t) {
  const img = t?.image;
  if (!img) return 0;
  if (img.data?.byteLength) return img.data.byteLength;
  return (img.width || 0) * (img.height || 0) * 4;
}
