import type { Clip, Project, Section, Track } from './types';
import { totalBars } from './types';

export type FixId = 'transitions' | 'sidechain' | 'mix' | 'variation';
export interface Issue { id: string; sev: 'crit' | 'warn' | 'info'; text: string; fix?: FixId }
export interface Report { differentiation: number; independence: number; coverage: number; headroom: number; issues: Issue[] }

const sig = (c: Clip) => c.notes.map((n) => `${n.t.toFixed(2)}:${n.p}`).join(',');
const overlaps = (c: Clip, s: Section) => c.start < s.start + s.bars - 1e-6 && c.start + c.len > s.start + 1e-6 && !c.mute && c.notes.length > 0;

export function activeLayers(p: Project, s: Section): Set<string> {
  const out = new Set<string>();
  for (const t of p.tracks) if (!t.mute && t.clips.some((c) => overlaps(c, s))) out.add(t.layer);
  return out;
}

export function diagnose(p: Project): Report {
  const issues: Issue[] = [];
  const secs = p.sections;
  // section differentiation
  const sets = secs.map((s) => activeLayers(p, s));
  const diffs: number[] = [];
  for (let i = 1; i < secs.length; i++) {
    const a = sets[i - 1], b = sets[i]; const uni = new Set([...a, ...b]);
    let inter = 0; a.forEach((x) => b.has(x) && inter++);
    const jac = uni.size ? inter / uni.size : 1;
    const d = Math.min(1, (1 - jac) * 1.2 + Math.abs(secs[i].energy - secs[i - 1].energy) * 1.2);
    diffs.push(d);
    if (d < 0.2) issues.push({ id: `dif${i}`, sev: 'warn', text: `“${secs[i - 1].name}” → “${secs[i].name}” are nearly identical (static repetition).`, fix: 'variation' });
  }
  const differentiation = diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 1;

  // layer independence: staggered entrances + distinct loop lengths
  const inst = p.tracks.filter((t) => t.group !== 'Transition' && t.clips.length);
  const entries = new Set(inst.map((t) => Math.min(...t.clips.map((c) => c.start))));
  const loops = new Set(inst.flatMap((t) => t.clips.map((c) => c.loop)));
  const independence = inst.length ? Math.min(1, 0.6 * (entries.size / Math.min(inst.length, 8)) + 0.4 * (loops.size / Math.min(inst.length, 6))) : 0;
  if (inst.length > 3 && entries.size <= 2) issues.push({ id: 'indep', sev: 'warn', text: 'Layers enter on the same bar — lifecycles are not staggered.', fix: 'variation' });

  // transition coverage
  const atomTracks = p.tracks.filter((t) => t.group === 'Transition');
  let covered = 0; const missing: number[] = [];
  for (let i = 0; i < secs.length - 1; i++) {
    const B = secs[i].start + secs[i].bars;
    const ok = atomTracks.some((t) => t.clips.some((c) => c.start >= B - 9 && c.start <= B + 0.01 && !c.mute));
    if (ok) covered++; else missing.push(B + 1);
  }
  const coverage = secs.length > 1 ? covered / (secs.length - 1) : 1;
  if (missing.length) issues.push({ id: 'trans', sev: 'warn', text: `No transition atoms at bar ${missing.join(', ')}.`, fix: 'transitions' });

  // low-end
  const low = p.tracks.filter((t) => ['sub', 'rumble', 'midbass'].includes(t.synth) && t.clips.length);
  const kick = p.tracks.find((t) => t.synth === 'kick' && t.clips.length);
  if (kick && low.length && (!p.scOn || low.some((t) => !t.sc))) issues.push({ id: 'sc', sev: 'crit', text: 'Low-end masking: bass layers are not sidechained to the kick.', fix: 'sidechain' });
  if (low.length > 2) issues.push({ id: 'mud', sev: 'info', text: `${low.length} layers share the 30–110 Hz register — consider slotting.`, fix: 'mix' });

  // headroom (heuristic gain-staging estimate, not a measured LUFS value)
  const sumVol = p.tracks.filter((t) => !t.mute).reduce((a, t) => a + t.vol, 0);
  const headroom = Math.max(0, Math.min(1, 1 - Math.max(0, sumVol - 7) / 6));
  if (sumVol > 9.5) issues.push({ id: 'head', sev: 'warn', text: 'Summed channel gain is high; master limiter will work hard.', fix: 'mix' });

  // static melodic loops
  for (const t of p.tracks) {
    if (!['acid', 'stab', 'lead', 'arp', 'midbass'].includes(t.synth) || t.clips.length < 4) continue;
    const s = t.clips.map(sig); let same = 0;
    for (let i = 1; i < s.length; i++) if (s[i] === s[i - 1]) same++;
    if (same / (s.length - 1) > 0.8) issues.push({ id: `st${t.id}`, sev: 'warn', text: `${t.name}: clips repeat identically (static loop).`, fix: 'variation' });
  }
  if (totalBars(p) < 64) issues.push({ id: 'short', sev: 'info', text: 'Arrangement shorter than 64 bars.' });
  return { differentiation, independence, coverage, headroom, issues };
}

export const trackActive = (t: Track) => t.clips.some((c) => !c.mute);
