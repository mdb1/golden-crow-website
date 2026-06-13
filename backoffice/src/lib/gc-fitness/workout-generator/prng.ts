// workout-generator/prng.ts
//
// Tiny deterministic PRNG + helpers. The engine must be reproducible: the same
// (input, seed) pair always yields the same workout so the test suite can
// assert exact output and the trainer's "Regenerate" button is the ONLY source
// of variation (it bumps the seed). We therefore never call Math.random()
// inside the engine.

/** mulberry32 — small, fast, well-distributed 32-bit PRNG. Returns a function
 *  that yields floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable string hash (FNV-1a, 32-bit). Used to derive a seed from the input
 *  so identical inputs reproduce identical workouts even without an explicit
 *  seed. */
export function hashString(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic Fisher–Yates shuffle driven by a PRNG. Returns a NEW array;
 *  the input is not mutated. */
export function seededShuffle<T>(items: readonly T[], rand: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}
