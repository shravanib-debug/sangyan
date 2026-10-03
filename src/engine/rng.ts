import { Rng } from "./types";

// A simple deterministic random number generator (Mulberry32)
export function createRng(seed: number): Rng {
  let state = seed;
  return {
    next(): number {
      state |= 0;
      state = (state + 0x6D2B79F5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}
