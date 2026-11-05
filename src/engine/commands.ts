import type { AutoLane, Clip, Note, Project, ScCfg, ScGroup, Section, Track } from './types';
import { mkId } from './composer';

export type Source = 'user' | 'ai' | 'composer';

export type Command =
  | { type: 'BATCH'; cmds: Command[] }
  | { type: 'SET_PARAMS'; patch: Partial<Project['params']> }
  | { type: 'SET_NAME'; name: string }
  | { type: 'SET_TRACK'; id: string; patch: Partial<Omit<Track, 'clips' | 'id'>> }
  | { type: 'ADD_TRACK'; track: Track }
  | { type: 'SET_SECTION'; id: string; patch: Partial<Omit<Section, 'id'>> }
  | { type: 'SET_OVERRIDE'; key: string; value: number | null }
  | { type: 'SET_CLIP'; id: string; patch: Partial<Omit<Clip, 'id'>> }
  | { type: 'ADD_CLIP'; track: string; clip: Clip }
  | { type: 'DEL_CLIP'; id: string }
  | { type: 'SPLIT_CLIP'; id: string; at: number }
  | { type: 'DUP_CLIP'; id: string }
  | { type: 'SET_NOTES'; clip: string; notes: Note[] }
  | { type: 'SET_SC'; group: ScGroup; patch: Partial<ScCfg> }
  | { type: 'SET_SC_ON'; on: boolean }
  | { type: 'SET_AUTO'; lane: AutoLane }
  | { type: 'DEL_AUTO'; id: string }
  | { type: 'SET_LOOP'; loop: Project['loop'] }
  | { type: 'PATCH'; patch: Partial<Pick<Project, 'tracks' | 'auto' | 'sections' | 'sc' | 'scOn' | 'secSeed' | 'overrides' | 'formId' | 'params'>> };

const mapClips = (p: Project, f: (c: Clip, t: Track) => Clip | Clip[] | null): Project => ({
  ...p,
  tracks: p.tracks.map((t) => {
    let changed = false;
    const clips: Clip[] = [];
    for (const c of t.clips) {
      const r = f(c, t);
      if (r === c) { clips.push(c); continue; }
      changed = true;
      if (r === null) continue;
      if (Array.isArray(r)) clips.push(...r); else clips.push(r);
    }
    return changed ? { ...t, clips } : t;
  }),
});

export function applyCommand(p: Project, c: Command): Project {
  switch (c.type) {
    case 'BATCH': return c.cmds.reduce(applyCommand, p);
    case 'SET_PARAMS': return { ...p, params: { ...p.params, ...c.patch } };
    case 'SET_NAME': return { ...p, name: c.name };
    case 'SET_TRACK': return { ...p, tracks: p.tracks.map((t) => (t.id === c.id ? { ...t, ...c.patch } : t)) };
    case 'ADD_TRACK': return { ...p, tracks: [...p.tracks, c.track] };
    case 'SET_SECTION': return { ...p, sections: p.sections.map((s) => (s.id === c.id ? { ...s, ...c.patch } : s)) };
    case 'SET_OVERRIDE': {
      const o = { ...p.overrides };
      if (c.value === null) delete o[c.key]; else o[c.key] = c.value;
      return { ...p, overrides: o };
    }
    case 'SET_CLIP': return mapClips(p, (cl) => (cl.id === c.id ? { ...cl, ...c.patch } : cl));
    case 'ADD_CLIP': return { ...p, tracks: p.tracks.map((t) => (t.id === c.track ? { ...t, clips: [...t.clips, c.clip] } : t)) };
    case 'DEL_CLIP': return mapClips(p, (cl) => (cl.id === c.id ? null : cl));
    case 'SPLIT_CLIP':
      return mapClips(p, (cl) => {
        if (cl.id !== c.id || c.at <= cl.start + 1e-6 || c.at >= cl.start + cl.len - 1e-6) return cl;
        const right: Clip = { ...cl, id: mkId('c'), start: c.at, len: cl.start + cl.len - c.at, off: (((cl.off + (c.at - cl.start) * 16) % cl.loop) + cl.loop) % cl.loop };
        return [{ ...cl, len: c.at - cl.start }, right];
      });
    case 'DUP_CLIP':
      return mapClips(p, (cl) => (cl.id === c.id ? [cl, { ...cl, id: mkId('c'), start: cl.start + cl.len, label: cl.label }] : cl));
    case 'SET_NOTES': return mapClips(p, (cl) => (cl.id === c.clip ? { ...cl, notes: c.notes } : cl));
    case 'SET_SC': return { ...p, sc: { ...p.sc, [c.group]: { ...p.sc[c.group], ...c.patch } } };
    case 'SET_SC_ON': return { ...p, scOn: c.on };
    case 'SET_AUTO': {
      const exists = p.auto.some((a) => a.id === c.lane.id);
      return { ...p, auto: exists ? p.auto.map((a) => (a.id === c.lane.id ? c.lane : a)) : [...p.auto, c.lane] };
    }
    case 'DEL_AUTO': return { ...p, auto: p.auto.filter((a) => a.id !== c.id) };
    case 'SET_LOOP': return { ...p, loop: c.loop };
    case 'PATCH': return { ...p, ...c.patch };
  }
}

export interface HistoryEntry { id: number; label: string; source: Source; before: Project; after: Project; time: number; key?: string }
