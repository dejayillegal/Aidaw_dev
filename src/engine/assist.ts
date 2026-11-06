import type { AutoLane, AutoParam, Project, Selection, Track } from './types';
import { totalBars } from './types';
import { applyCommand, type Command } from './commands';
import { addTransition, carve, generate, mergeGenerated, mkClip, mutate, regenSection, defaultSc } from './composer';
import { Rng, clamp, euclid, hash, uid } from './theory';
import { LAYERS, STYLES } from './styles';
import { diagnose, type FixId } from './diagnostics';

export type DiffKind = 'added' | 'changed';
export interface Proposal {
  baseRevision: number; projectId: string;
  id: string; title: string; rationale: string; cmd: Command; preview: Project;
  diff: Record<string, DiffKind>; removed: { track: string; start: number; len: number }[];
  stats: { added: number; removed: number; changed: number; lanes: number; mixer: number };
}
export type AssistResult = { proposal: Proposal } | { message: string };

const clone = <T,>(x: T): T => structuredClone(x);

const clipSig = (c: unknown) => JSON.stringify(c);

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
  return { id: uid('prop'), baseRevision: base.revision, projectId: base.id, title, rationale, cmd, preview, diff, removed, stats: { added, removed: rem, changed, lanes, mixer } };
}

function keepLocked(base: Project, tracks: Track[]): Track[] {
  return tracks.map((t) => { const o = base.tracks.find((x) => x.id === t.id); return o && o.lock ? o : t; });
}

function putLane(auto: AutoLane[], track: string, param: AutoParam, pts: { bar: number; v: number }[], replaceRange?: [number, number]) {
  let lane = auto.find((a) => a.track === track && a.param === param);
  if (!lane) { lane = { id: `a_${track}_${param}`, track, param, pts: [] }; auto.push(lane); }
  let cur = lane.pts;
  if (replaceRange) cur = cur.filter((p) => p.bar < replaceRange[0] - 0.001 || p.bar > replaceRange[1] + 0.001);
  const all = [...cur, ...pts].sort((a, b) => a.bar - b.bar);
  const out: typeof all = [];
  for (const p of all) { const l = out[out.length - 1]; if (l && p.bar - l.bar < 0.004) l.v = p.v; else out.push({ bar: +p.bar.toFixed(3), v: +clamp(p.v).toFixed(3) }); }
  lane.pts = out;
}

const findSec = (p: Project, bar: number) => p.sections.find((s) => bar >= s.start && bar < s.start + s.bars);

// ───────────── actions ─────────────
export function actFull(p: Project): Proposal {
  const params = { ...p.params, seed: (p.params.seed * 31 + 7919) % 1000003 };
  const gen = generate(params, { overrides: {} });
  const m = mergeGenerated(p, gen, false);
  return buildProposal(p, 'Generate full evolving arrangement', `New seed ${params.seed} · ${gen.sections.length} sections / ${totalBars({ ...p, sections: gen.sections })} bars with peak-first subtractive layering, transition atoms and automation. Locked tracks are preserved.`, { ...m, params, secSeed: {}, overrides: {} });
}

export function actRegenSection(p: Project, secId: string, mood: 'same' | 'darker' | 'harder' = 'same'): Proposal {
  const sec = p.sections.find((s) => s.id === secId)!;
  let sections = p.sections; const overrides = { ...p.overrides };
  if (mood !== 'same') {
    const d = mood === 'darker' ? -0.14 : 0.12;
    sections = p.sections.map((s) => (s.id === secId ? { ...s, energy: clamp(s.energy + d) } : s));
    if (mood === 'darker') for (const l of ['PAD', 'DRONE', 'TEX', 'DUB']) if (p.tracks.some((t) => t.layer === l)) overrides[`${secId}:${l}`] = 0.9;
    if (mood === 'darker') for (const l of ['HAT_O', 'RIDE', 'CLAP']) if (p.tracks.some((t) => t.layer === l)) overrides[`${secId}:${l}`] = 0;
  }
  const p2 = { ...p, sections, overrides };
  const r = regenSection(p2, secId);
  return buildProposal(p, `${mood === 'darker' ? 'Darken' : mood === 'harder' ? 'Intensify' : 'Re-roll'} “${sec.name}”`, `Section ${sec.name} (bars ${sec.start + 1}–${sec.start + sec.bars}) regenerated with a new variation seed${mood === 'darker' ? '; energy −0.14, atmospheric layers forced up, open hats / clap removed' : mood === 'harder' ? '; energy +0.12' : ''}. Everything outside this range is untouched.`, { ...r, sections, overrides });
}

export function actTransition(p: Project, bar: number, kind: 'up' | 'down' = 'up'): Proposal {
  const tracks = clone(p.tracks); const auto = clone(p.auto);
  const style = STYLES[p.params.style]; const sec = findSec(p, Math.max(0, bar - 0.01));
  const room = sec ? Math.max(2, Math.min(8, bar - sec.start)) : 4;
  addTransition(tracks, style, bar, kind === 'up' ? 0.4 : -0.4, room, new Rng(hash(p.params.seed, 'ai', bar)), kind);
  if (kind === 'up') {
    putLane(auto, 'master', 'hp', [{ bar: bar - room, v: 0 }, { bar: bar - 0.01, v: 0.78 }, { bar: bar, v: 0 }], [bar - room, bar]);
    for (const t of tracks) if (['ACID1', 'ACID2', 'STAB', 'LEAD', 'MIDBASS'].includes(t.layer)) putLane(auto, t.id, 'cutoff', [{ bar: bar - Math.min(8, room), v: 0.45 }, { bar: bar - 0.01, v: 0.98 }, { bar, v: 0.5 }], [bar - Math.min(8, room), bar]);
  }
  return buildProposal(p, `${kind === 'up' ? 'Transition package' : 'Downlift package'} at bar ${bar + 1}`, kind === 'up' ? `${room}-bar riser, accelerating snare/perc roll, ${style.void}-bar low-end void, reverse swell, sub impact + crash on beat 1, master high-pass sweep and filter ramps.` : 'Long downlifter + noise wash on beat 1 of the reduction.', { tracks: keepLocked(p, tracks), auto });
}

export function actReduction(p: Project, bar: number, len: number): Proposal {
  const tracks = clone(p.tracks); const auto = clone(p.auto); const style = STYLES[p.params.style];
  for (const t of tracks) if (['KICK', 'SUB', 'RUMBLE', 'MIDBASS', 'CLAP', 'SNARE', 'RIDE', 'TOM', 'CLANG'].includes(t.layer)) carve(t, bar, bar + len);
  addTransition(tracks, style, bar, -0.4, 4, new Rng(hash(p.params.seed, 'red', bar)), 'down');
  addTransition(tracks, style, bar + len, 0.4, Math.min(len, 8), new Rng(hash(p.params.seed, 'redE', bar)), 'up');
  for (const t of tracks) {
    if (['ACID1', 'ARP'].includes(t.layer)) putLane(auto, t.id, 'cutoff', [{ bar, v: 0.3 }, { bar: bar + len - 0.01, v: 0.92 }], [bar, bar + len]);
    if (['PAD', 'DRONE', 'DUB'].includes(t.layer)) putLane(auto, t.id, 'cutoff', [{ bar, v: 0.3 }, { bar: bar + len - 0.01, v: 0.9 }], [bar, bar + len]);
    if (t.layer === 'PAD' || t.layer === 'DUB') putLane(auto, t.id, 'rev', [{ bar, v: t.rev }, { bar: bar + 1, v: Math.min(0.95, t.rev + 0.35) }, { bar: bar + len - 0.01, v: Math.min(0.95, t.rev + 0.35) }, { bar: bar + len, v: t.rev }], [bar, bar + len]);
  }
  return buildProposal(p, `${len}-bar tension reduction at bar ${bar + 1}`, `Kick, sub, rolling bass and backbeat drop out for ${len} bars; acid/pad cutoff and reverb automation build tension; downlifter in, riser + void + impact out.`, { tracks: keepLocked(p, tracks), auto });
}

export function actSidechain(p: Project): Proposal {
  const tracks = p.tracks.map((t) => (t.group === 'Transition' || t.synth === 'kick' ? t : { ...t, sc: LAYERS[t.layer]?.sc ?? t.sc }));
  const mode = p.params.mode;
  const sc = defaultSc();
  if (mode === 'industrial') { sc.bass.ratio = 8; sc.bass.rel = 140; sc.harm.ratio = 5; }
  if (mode === 'clean') { sc.bass.ratio = 4; sc.harm.ratio = 3; sc.bass.rel = 200; }
  return buildProposal(p, 'Auto-configure sidechain ducking', 'Kick is the key source for three dual-input compressors: Bass (sub/rumble/rolling bass), Harmony (pads/stabs/drones) and FX (reverb return + textures). Ratios follow the current production mode.', { tracks, sc, scOn: true });
}

export function actPoly(p: Project): Proposal {
  const rng = new Rng(hash(p.params.seed, 'poly', p.tracks.length));
  const n = rng.pick([12, 20, 28]); const k = clamp(Math.round(n * 0.4), 3, n - 2); const rot = rng.int(0, n - 1);
  const pat = euclid(k, n, rot); const pool = [64, 67, 71, 74, 76];
  const notes = pat.flatMap((h, i) => (h ? [{ t: i, d: 0.7, p: rng.pick(pool), v: 0.45 + rng.next() * 0.45 }] : []));
  const id = uid('t');
  const track: Track = { id, layer: `POLY_${id}`, name: `Polymetric Perc · E(${k},${n})`, color: '#2dd4bf', group: 'Groove', synth: 'perc', vol: 0.4, pan: rng.pick([-0.4, 0.4]), mute: false, solo: false, lock: false, sc: null, rev: 0.25, del: 0.3, cutoff: 0.5, res: 0.3, clips: [] };
  for (const s of p.sections) {
    if (s.energy < 0.5 || s.role === 'REDUCTION') continue;
    for (let c = 0; c < s.bars; c += 16) {
      const len = Math.min(16, s.bars - c); const start = s.start + c;
      const keep = notes.filter((_, i) => i % (c % 32 === 0 ? 1 : 2) === 0 || s.energy > 0.9);
      track.clips.push(mkClip(start, len, n, keep.map((x) => ({ ...x })), `Poly E(${k},${n})`, start * 16));
    }
  }
  const idx = p.tracks.findIndex((t) => t.group === 'Character');
  const tracks = [...p.tracks]; tracks.splice(idx < 0 ? tracks.length : idx, 0, track);
  return buildProposal(p, 'Polymetric hardgroove percussion layer', `New ${n}-step Euclidean loop E(${k},${n}) running against the 16-step grid (${n}:16 phase drift). Density halves every other phrase; present in every section above 0.5 energy except reductions.`, { tracks });
}

export function actVariation(p: Project, secId?: string): Proposal {
  const tracks = clone(p.tracks); const rng = new Rng(hash(p.params.seed, 'var', secId ?? '', p.tracks.length, Date.now() % 997));
  const target = secId ? p.sections.filter((s) => s.id === secId) : p.sections.filter((s) => s.role === 'DROP_PEAK' || s.role === 'DROP_PRIMARY' || s.role === 'VARIATION');
  for (const t of tracks) {
    if (t.lock || !['acid', 'stab', 'lead', 'arp', 'midbass'].includes(t.synth)) continue;
    for (const c of t.clips) {
      if (!target.some((s) => c.start >= s.start - 1e-6 && c.start < s.start + s.bars)) continue;
      c.notes = mutate(mutate(c.notes, c.loop, rng.pick(['oct', 'rot']), rng), c.loop, 'acc', rng);
      c.label = c.label.replace(/ ·.*$/, '') + ' · var';
    }
  }
  return buildProposal(p, 'Acid / hook variation', `Octave jumps, rhythmic rotation and extra 303 accents applied to melodic clips in ${target.map((s) => s.name).join(', ') || 'the arrangement'}. Locked tracks untouched.`, { tracks });
}

export function actSweep(p: Project, trackId?: string): Proposal {
  const t = p.tracks.find((x) => x.id === trackId && x.group !== 'Transition') ?? p.tracks.find((x) => x.layer === 'ACID1') ?? p.tracks.find((x) => ['acid', 'stab', 'pad', 'midbass'].includes(x.synth));
  if (!t) return buildProposal(p, 'No filter target', 'No filterable track available.', {});
  const auto = clone(p.auto); const total = totalBars(p); const pts: { bar: number; v: number }[] = [];
  for (let b = 0; b < total; b += 32) { pts.push({ bar: b, v: 0.25 }, { bar: Math.min(total, b + 32) - 0.01, v: 0.92 }); }
  const lane = auto.find((a) => a.track === t.id && a.param === 'cutoff');
  if (lane) lane.pts = pts; else auto.push({ id: `a_${t.id}_cutoff`, track: t.id, param: 'cutoff', pts });
  return buildProposal(p, `32-bar filter sweeps on ${t.name}`, 'Cutoff creeps from 0.25 → 0.92 over each 32-bar block and snaps back at the boundary (evaluated as a sample-accurate AudioParam ramp, no zipper noise).', { auto });
}

export function actMix(p: Project): Proposal {
  const tracks = clone(p.tracks);
  const lowCount = tracks.filter((t) => ['sub', 'rumble', 'midbass'].includes(t.synth)).length;
  const sum = tracks.filter((t) => !t.mute).reduce((a, t) => a + t.vol, 0);
  const g = sum > 8 ? 8 / sum : 1;
  for (const t of tracks) {
    if (t.lock) continue;
    t.vol = +(t.vol * g).toFixed(3);
    if (lowCount > 2 && (t.synth === 'rumble' || t.synth === 'midbass')) t.vol = +(t.vol * 0.82).toFixed(3);
    if (['pad', 'drone', 'dubchord'].includes(t.synth)) t.vol = +(t.vol * 0.88).toFixed(3);
    if (['sub', 'rumble', 'kick'].includes(t.synth)) { t.rev = 0; t.del = 0; }
  }
  return buildProposal(p, 'Fix mix: slot low end & gain-stage', `Stacked low-end layers trimmed, pads/drones −1.1 dB, reverb/delay removed from sub sources${g < 1 ? `, global gain staging ×${g.toFixed(2)}` : ''}.`, { tracks });
}

export function actTransitionsEverywhere(p: Project): Proposal {
  const tracks = clone(p.tracks); const style = STYLES[p.params.style]; const auto = clone(p.auto);
  p.sections.forEach((s, i) => {
    if (i === p.sections.length - 1) return;
    const B = s.start + s.bars; const d = p.sections[i + 1].energy - s.energy;
    const has = tracks.filter((t) => t.group === 'Transition').some((t) => t.clips.some((c) => c.start >= B - 9 && c.start <= B + 0.01));
    if (has) return;
    addTransition(tracks, style, B, d, s.bars, new Rng(hash(p.params.seed, 'fixT', i)));
    if (d > 0.25) putLane(auto, 'master', 'hp', [{ bar: B - Math.min(8, s.bars), v: 0 }, { bar: B - 0.01, v: 0.78 }, { bar: B, v: 0 }], [B - Math.min(8, s.bars), B]);
  });
  return buildProposal(p, 'Add missing transition atoms', 'Every macro boundary without risers/impacts/downlifters receives an energy-delta-driven transition package.', { tracks: keepLocked(p, tracks), auto });
}

export function actVariationFix(p: Project): Proposal {
  let cur = p; const issues = diagnose(p).issues.filter((i) => i.fix === 'variation' && i.id.startsWith('dif'));
  let patch: Extract<Command, { type: 'PATCH' }>['patch'] = {};
  const picks = issues.length ? issues.map((i) => p.sections[Number(i.id.slice(3))]) : p.sections.filter((s) => s.role === 'PLATEAU' || s.role === 'DROP_PEAK').slice(0, 2);
  for (const s of picks) {
    const sections = cur.sections.map((x) => (x.id === s.id ? { ...x, energy: clamp(x.energy + (x.energy > 0.6 ? -0.06 : 0.08)) } : x));
    const r = regenSection({ ...cur, sections }, s.id);
    patch = { ...patch, ...r, sections }; cur = applyCommand(cur, { type: 'PATCH', patch: { ...r, sections } });
  }
  return buildProposal(p, 'Break up static repetition', `Re-rolled ${picks.length} section(s) with new seeds and adjusted energy so adjacent sections differ in layers, patterns and filter curves.`, patch);
}

export function fixFor(p: Project, fix: FixId): Proposal {
  switch (fix) {
    case 'transitions': return actTransitionsEverywhere(p);
    case 'sidechain': return actSidechain(p);
    case 'mix': return actMix(p);
    case 'variation': return actVariationFix(p);
  }
}

// ───────────── natural-language interpreter (deterministic, offline) ─────────────
export const QUICK_ACTIONS = [
  'Generate a full evolving arrangement',
  'Add sidechain ducking from Kick to Sub-Bass and Pad',
  'Generate a polymetric hardgroove percussion layer',
  'Create a 16-bar tension reduction at bar 97',
  'Build a 4-bar snare roll and noise riser into the selected section',
  'Make the selected section darker and more atmospheric',
  'Generate 32-bar filter automation sweeps',
  'Mutate acid variation in the peak',
  'Fix mix issues',
];

export function interpret(text: string, p: Project, sel: Selection, playBar: number): AssistResult {
  const t = text.toLowerCase();
  const num = (re: RegExp) => { const m = t.match(re); return m ? parseInt(m[1], 10) : null; };
  const barAt = num(/bar\s*(\d+)/);
  const lenBars = num(/(\d+)[-\s]*bar/);
  const selSec = sel.kind === 'section' ? p.sections.find((s) => s.id === sel.id) : undefined;
  const secByName = (): typeof p.sections[number] | undefined => {
    if (selSec) return selSec;
    const words: [RegExp, (s: typeof p.sections[number]) => boolean][] = [
      [/breakdown|reduction/, (s) => s.role === 'REDUCTION'], [/intro/, (s) => s.role === 'INTRO'], [/outro/, (s) => s.role === 'OUTRO'],
      [/peak|main/, (s) => s.role === 'DROP_PEAK'], [/drop/, (s) => s.role === 'DROP_PRIMARY' || s.role === 'DROP_PEAK'], [/build/, (s) => s.role === 'BUILD_UP'], [/groove/, (s) => s.role === 'GROOVE_BUILD'],
    ];
    for (const [re, f] of words) if (re.test(t)) return p.sections.find(f);
    return findSec(p, playBar);
  };
  if (/sidechain|duck|pump/.test(t)) return { proposal: actSidechain(p) };
  if (/polymetric|polyrhythm|percussion layer|perc layer/.test(t)) return { proposal: actPoly(p) };
  if (/reduction|tension|strip|drop out the kick|kick out/.test(t) && (barAt !== null || /create|add|insert/.test(t))) {
    const bar = barAt !== null ? Math.max(0, barAt - 1) : Math.round(playBar);
    return { proposal: actReduction(p, bar, lenBars && lenBars !== barAt ? lenBars : 16) };
  }
  if (/riser|roll|transition|impact|void|fill/.test(t)) {
    const s = selSec ?? secByName();
    const bar = barAt !== null ? Math.max(0, barAt - 1) : s ? s.start : Math.round(playBar);
    return { proposal: actTransition(p, bar, /down/.test(t) ? 'down' : 'up') };
  }
  if (/darker|atmospheric|darken|moodier/.test(t)) { const s = secByName(); if (s) return { proposal: actRegenSection(p, s.id, 'darker') }; return { message: 'Select a section (click its flag on the timeline) or name one, e.g. “make the breakdown darker”.' }; }
  if (/harder|more energy|intens|bigger/.test(t)) { const s = secByName(); if (s) return { proposal: actRegenSection(p, s.id, 'harder') }; return { message: 'Select a section first.' }; }
  if (/regenerate|re-?roll|redo/.test(t)) { const s = secByName(); if (s) return { proposal: actRegenSection(p, s.id) }; }
  if (/acid|counter|variation|mutate|melody/.test(t)) return { proposal: actVariation(p, selSec?.id) };
  if (/automation|sweep|filter|cutoff/.test(t)) return { proposal: actSweep(p, sel.kind === 'track' ? sel.id : sel.kind === 'clip' ? sel.track : undefined) };
  if (/mud|mix|clean|headroom|gain/.test(t)) return { proposal: actMix(p) };
  if (/full|evolv|6-?minute|entire|new arrangement|generate/.test(t)) return { proposal: actFull(p) };
  return { message: 'I can: generate a full arrangement · regenerate/darken a section · insert a transition at a bar · create a tension reduction at bar N · polymetric percussion · sidechain ducking · acid variation · filter sweeps · fix mix. Try a quick action below.' };
}
