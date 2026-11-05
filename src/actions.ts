import type { AutoLane, AutoParam, Project, Selection, Track } from './types';
import { totalBars } from './types';
import { applyCommand, type Command } from './commands';
import { addTransition, carve, generate, mergeGenerated, mkClip, mutate, regenSection, defaultSc } from './composer';
import { Rng, clamp, euclid, hash, uid } from './theory';
import { LAYERS, STYLES } from './styles';
import { diagnose, type FixId } from './diagnostics';

export type DiffKind = 'added' | 'changed';
export interface Proposal {
  id: string; title: string; rationale: string; cmd: Command; preview: Project;
  baseRevision: number;
  diff: Record<string, DiffKind>; removed: { track: string; start: number; len: number }[];
  stats: { added: number; removed: number; changed: number; lanes: number; mixer: number };
}
export type AssistResult = { proposal: Proposal } | { message: string };

const clone = <T,>(x: T): T => structuredClone(x);

function clipSig(c: { start: number; len: number; loop: number; off: number; mute: boolean; gain: number; transpose: number; notes: { t: number; p: number; v: number; d: number; acc?: boolean }[] }) {
  return `${c.start}|${c.len}|${c.loop}|${c.off}|${c.mute}|${c.gain}|${c.transpose}|` + c.notes.map((n) => `${n.t}:${n.p}:${n.v}:${n.d}:${n.acc ? 1 : 0}`).join(',');
}

export function buildProposal(base: Project, title: string, rationale: string, patch: Extract<Command, { type: 'PATCH' }>['patch']): Proposal {
  const cmd: Command = { type: 'PATCH', patch };
  const preview = applyCommand(base, cmd);
  const diff: Record<string, DiffKind> = {}; const removed: Proposal['removed'] = [];
  let added = 0, rem = 0, changed = 0;
  const baseClips = new Map<string, { sig: string; track: string; start: number; len: number }>();
  for (const t of base.tracks) for (const c of t.clips) baseClips.set(c.id, { sig: clipSig(c), track: t.id, start: c.start, len: c.len });
  const seen = new Set<string>();
  for (const t of preview.tracks) for (const c of t.clips) {
    seen.add(c.id); const b = baseClips.get(c.id);
    if (!b) { diff[c.id] = 'added'; added++; } else if (b.sig !== clipSig(c)) { diff[c.id] = 'changed'; changed++; }
  }
  baseClips.forEach((v, id) => { if (!seen.has(id)) { rem++; if (preview.tracks.some((t) => t.id === v.track)) removed.push({ track: v.track, start: v.start, len: v.len }); } });
  const lanes = JSON.stringify(preview.auto) === JSON.stringify(base.auto) ? 0 : preview.auto.filter((l) => JSON.stringify(base.auto.find((b) => b.id === l.id)) !== JSON.stringify(l)).length;
  let mixer = 0;
  for (const t of preview.tracks) {
    const o = base.tracks.find((x) => x.id === t.id);
    if (!o || JSON.stringify({ ...o, clips: [] }) !== JSON.stringify({ ...t, clips: [] })) mixer++;
  }
  if (JSON.stringify(base.sc) !== JSON.stringify(preview.sc) || base.scOn !== preview.scOn) mixer++;
  return {
    id: uid('prop'),
    title,
    rationale,
    cmd,
    preview: { ...preview, revision: (base.revision ?? 1) + 1 },
    baseRevision: base.revision ?? 1,
    diff,
    removed,
    stats: { added, removed: rem, changed, lanes, mixer },
  };
}

export function buildProposalLegacy(base: Project, title: string, rationale: string, patch: Extract<Command, { type: 'PATCH' }>['patch']): Proposal {
  return buildProposal(base, title, rationale, patch);
}
