import type { ScaleId } from './types';

export class Rng {
  private s: number;
  constructor(seed: number) { this.s = (seed >>> 0) || 1; }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) { return a + (b - a) * this.next(); }
  int(a: number, b: number) { return Math.floor(this.range(a, b + 1)); }
  chance(p: number) { return this.next() < p; }
  pick<T>(arr: T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
}

export function hash(...parts: (string | number)[]): number {
  let h = 2166136261;
  for (const ch of parts.join('|')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export const SCALES: Record<ScaleId, number[]> = {
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  minor: [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  phrygianDominant: [0, 1, 4, 5, 7, 8, 10],
  octatonic: [0, 1, 3, 4, 6, 7, 9, 10],
};
export const SCALE_NAMES: Record<ScaleId, string> = {
  phrygian: 'Phrygian', dorian: 'Dorian', locrian: 'Locrian', minor: 'Natural Minor',
  harmonicMinor: 'Harmonic Minor', phrygianDominant: 'Phrygian Dominant', octatonic: 'Octatonic',
};
export const KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** pitch of scale degree (may be negative / > length) relative to root midi note */
export function degree(root: number, scale: ScaleId, deg: number): number {
  const sc = SCALES[scale];
  const n = sc.length;
  const oct = Math.floor(deg / n);
  const idx = ((deg % n) + n) % n;
  return root + oct * 12 + sc[idx];
}

export function euclid(k: number, n: number, rot = 0): boolean[] {
  const out: boolean[] = [];
  for (let i = 0; i < n; i++) out.push(((i * k) % n) < k);
  // normalise so that step 0 is a hit then rotate
  const r = ((rot % n) + n) % n;
  return out.map((_, i) => out[(i - r + n) % n]);
}

export const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const uid = (() => {
  let n = 0;
  return (p = 'id') => {
    const id = `${p}_${n.toString(36)}`;
    n += 1;
    return id;
  };
})();
