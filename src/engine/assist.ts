import type { AutoLane, AutoParam, Clip, ComposeParams, Note, Project, ScCfg, ScGroup, Section, SectionRole, Track } from './types';
import { Rng, clamp, degree, euclid, hash } from './theory';
import { ATOM_LAYERS, FORMS, GROUP_ORDER, LAYERS, ROLE_NAMES, ROLE_RULES, STYLES, type LayerDef, type StyleDef } from './styles';

type PN = Note & { pri: number };
interface Ctx { rng: Rng; style: StyleDef; P: ComposeParams; R: number }

export function defaultSc(): Record<ScGroup, ScCfg> {
  return {
    bass: { thr: -26, ratio: 6, atk: 1, rel: 170, hpf: 60, mix: 1, knee: 6 },
    harm: { thr: -28, ratio: 4, atk: 2, rel: 230, hpf: 60, mix: 1, knee: 8 },
    fx: { thr: -26, ratio: 3, atk: 3, rel: 280, hpf: 60, mix: 0.9, knee: 10 },
  };
}

export function defaultParams(style = 'hypnotic', seed = 1337): ComposeParams {
  const s = STYLES[style];
  return {
    style, form: 'auto', bpm: Math.round((s.bpm[0] + s.bpm[1]) / 2), key: 9, scale: s.scales[0],
    bars: 176, seed, density: 0.6, complexity: 0.5, swing: s.swing, acid: 0.5, poly: 0.5,
    dirt: s.dirt, depth: 0.5, mode: 'hybrid',
  };
}

// ───────────────────────── clip helpers ─────────────────────────
export const mkId = (() => { let n = 0; return (p: string) => `${p}_${(n++).toString(36)}_${Date.now().toString(36)}`; })();

export function mkClip(start: number, len: number, loop: number, notes: Note[], label: string, off = 0): Clip {
  return { id: mkId('c'), start, len, loop, off: ((off % loop) + loop) % loop, notes, gain: 1, mute: false, label, transpose: 0 };
}

/** remove the span [a,b) from a track's clips, splitting where needed (keeps loop phase) */
export function carve(track: Track, a: number, b: number) {
  const out: Clip[] = [];
  for (const c of track.clips) {
    const e = c.start + c.len;
    if (e <= a + 1e-6 || c.start >= b - 1e-6) { out.push(c); continue; }
    if (c.start < a - 1e-6) out.push({ ...c, len: a - c.start });
    if (e > b + 1e-6) {
      out.push({ ...c, id: c.start < a ? mkId('c') : c.id, start: b, len: e - b, off: (((c.off + (b - c.start) * 16) % c.loop) + c.loop) % c.loop });
    }
  }
  track.clips = out.filter((c) => c.len > 1e-6);
}

export const thin = (notes: PN[], level: number): Note[] => {
  let keep = notes.filter((n) => n.pri <= level + 1e-9);
  if (!keep.length && level > 0.05 && notes.length) keep = [notes.reduce((a, b) => (a.pri <= b.pri ? a : b))];
  return keep.map(({ pri, ...n }) => ({ ...n }));
};

export function mutate(notes: Note[], loop: number, kind: 'oct' | 'rot' | 'frag' | 'rest' | 'acc', rng: Rng): Note[] {
  const ns = notes.map((n) => ({ ...n }));
  switch (kind) {
    case 'oct': ns.forEach((n) => { if (rng.chance(0.25)) n.p += rng.chance(0.7) ? 12 : -12; }); return ns;
    case 'acc': ns.forEach((n) => { if (rng.chance(0.3)) { n.acc = true; n.v = 1; } }); return ns;
    case 'rot': { const r = rng.pick([2, 4, 3]); ns.forEach((n) => { n.t = (n.t + r) % loop; }); return ns.sort((a, b) => a.t - b.t); }
    case 'frag': return ns.filter((n) => n.t < loop / 2);
    case 'rest': return ns.length > 3 ? ns.filter(() => !rng.chance(0.2)) : ns;
  }
}

// ... rest of file unchanged (omitted for brevity in this patch) — the update is only for mkId and project revision defaults below.

export function newProject(P: ComposeParams, o: GenOpts = {}, name?: string): Project {
  const g = generate(P, o);
  return {
    v: 1, revision: 1, name: name ?? `${STYLES[P.style].name} · ${P.seed}`, params: P, formId: g.formId, sections: g.sections, tracks: g.tracks, auto: g.auto,
    sc: defaultSc(), scOn: true, overrides: o.overrides ?? {}, secSeed: o.secSeed ?? {}, loop: { on: false, a: 0, b: 0 },
  };
}
