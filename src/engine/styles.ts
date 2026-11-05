import type { LayerGroup, ScGroup, ScaleId, SectionRole, SynthKind } from './types';

export interface LayerDef {
  id: string; name: string; group: LayerGroup; synth: SynthKind; color: string;
  sc: ScGroup | null; vol: number; pan: number; rev: number; del: number;
  reg: string;                 // spectral register label
  enter: number; full: number; // energy mapping (enter > full means "inverse": present at LOW energy)
  phrase: number;              // clip chunk length (bars) — independent lifecycle per layer
  melodic?: boolean;
}

const L = (d: LayerDef) => d;
export const LAYERS: Record<string, LayerDef> = {
  KICK:   L({ id: 'KICK', name: 'Kick', group: 'Foundation', synth: 'kick', color: '#ef4444', sc: null, vol: 0.95, pan: 0, rev: 0, del: 0, reg: '30–110 Hz', enter: 0, full: 0.1, phrase: 16 }),
  SUB:    L({ id: 'SUB', name: 'Sub Bass', group: 'Foundation', synth: 'sub', color: '#f97316', sc: 'bass', vol: 0.8, pan: 0, rev: 0, del: 0, reg: '30–90 Hz', enter: 0.38, full: 0.6, phrase: 16, melodic: true }),
  RUMBLE: L({ id: 'RUMBLE', name: 'Rumble', group: 'Foundation', synth: 'rumble', color: '#fb7185', sc: 'bass', vol: 0.55, pan: 0, rev: 0.25, del: 0, reg: '40–120 Hz', enter: 0.42, full: 0.7, phrase: 8 }),
  MIDBASS:L({ id: 'MIDBASS', name: 'Rolling Bass', group: 'Foundation', synth: 'midbass', color: '#fb923c', sc: 'bass', vol: 0.62, pan: 0, rev: 0, del: 0, reg: '90–600 Hz', enter: 0.45, full: 0.8, phrase: 8, melodic: true }),
  HAT_C:  L({ id: 'HAT_C', name: 'Closed Hats', group: 'Groove', synth: 'hat', color: '#38bdf8', sc: null, vol: 0.4, pan: 0.15, rev: 0.05, del: 0, reg: '6–16 kHz', enter: 0.2, full: 0.55, phrase: 8 }),
  HAT_O:  L({ id: 'HAT_O', name: 'Offbeat Open Hats', group: 'Groove', synth: 'ohat', color: '#22d3ee', sc: null, vol: 0.38, pan: -0.1, rev: 0.12, del: 0.08, reg: '5–16 kHz', enter: 0.4, full: 0.7, phrase: 16 }),
  RIDE:   L({ id: 'RIDE', name: 'Ride / Cymbal', group: 'Groove', synth: 'ride', color: '#67e8f9', sc: null, vol: 0.3, pan: 0.2, rev: 0.2, del: 0, reg: '4–16 kHz', enter: 0.85, full: 0.95, phrase: 16 }),
  SHAKER: L({ id: 'SHAKER', name: 'Shaker', group: 'Groove', synth: 'shaker', color: '#5eead4', sc: null, vol: 0.3, pan: -0.25, rev: 0.08, del: 0, reg: '4–14 kHz', enter: 0.3, full: 0.6, phrase: 8 }),
  CLAP:   L({ id: 'CLAP', name: 'Clap', group: 'Groove', synth: 'clap', color: '#60a5fa', sc: null, vol: 0.55, pan: 0, rev: 0.2, del: 0.05, reg: '1–8 kHz', enter: 0.5, full: 0.7, phrase: 16 }),
  SNARE:  L({ id: 'SNARE', name: 'Snare / Rimshot', group: 'Groove', synth: 'snare', color: '#3b82f6', sc: null, vol: 0.5, pan: 0, rev: 0.15, del: 0, reg: '200 Hz–8 kHz', enter: 0.6, full: 0.9, phrase: 8 }),
  PERC1:  L({ id: 'PERC1', name: 'Euclid Perc A · E(5,16)', group: 'Groove', synth: 'perc', color: '#2dd4bf', sc: null, vol: 0.42, pan: -0.3, rev: 0.18, del: 0.18, reg: '300 Hz–5 kHz', enter: 0.3, full: 0.7, phrase: 8 }),
  PERC2:  L({ id: 'PERC2', name: 'Polymetric Perc B', group: 'Groove', synth: 'perc', color: '#14b8a6', sc: null, vol: 0.38, pan: 0.35, rev: 0.22, del: 0.22, reg: '500 Hz–6 kHz', enter: 0.55, full: 0.85, phrase: 16 }),
  CONGA:  L({ id: 'CONGA', name: 'Conga / Tribal', group: 'Groove', synth: 'conga', color: '#34d399', sc: null, vol: 0.45, pan: -0.2, rev: 0.12, del: 0.1, reg: '200 Hz–3 kHz', enter: 0.35, full: 0.7, phrase: 8 }),
  TOM:    L({ id: 'TOM', name: 'Tom Pulse', group: 'Groove', synth: 'tom', color: '#10b981', sc: null, vol: 0.5, pan: 0.2, rev: 0.2, del: 0, reg: '80–400 Hz', enter: 0.6, full: 0.9, phrase: 16 }),
  CLANG:  L({ id: 'CLANG', name: 'Metal Clang', group: 'Groove', synth: 'clang', color: '#a3a3a3', sc: null, vol: 0.34, pan: 0.25, rev: 0.3, del: 0.2, reg: '800 Hz–10 kHz', enter: 0.6, full: 0.95, phrase: 16 }),
  ACID1:  L({ id: 'ACID1', name: '303 Acid · Roller', group: 'Character', synth: 'acid', color: '#f59e0b', sc: null, vol: 0.5, pan: -0.1, rev: 0.12, del: 0.2, reg: '100 Hz–4 kHz', enter: 0.5, full: 0.85, phrase: 16, melodic: true }),
  ACID2:  L({ id: 'ACID2', name: '303 Acid · Screamer', group: 'Character', synth: 'acid', color: '#fbbf24', sc: null, vol: 0.4, pan: 0.2, rev: 0.2, del: 0.3, reg: '300 Hz–6 kHz', enter: 0.8, full: 0.98, phrase: 16, melodic: true }),
  STAB:   L({ id: 'STAB', name: 'Synth Stab', group: 'Character', synth: 'stab', color: '#facc15', sc: 'harm', vol: 0.42, pan: 0.1, rev: 0.3, del: 0.3, reg: '200 Hz–5 kHz', enter: 0.55, full: 0.8, phrase: 16, melodic: true }),
  LEAD:   L({ id: 'LEAD', name: 'Anthem Lead', group: 'Character', synth: 'lead', color: '#fde047', sc: 'harm', vol: 0.36, pan: 0, rev: 0.35, del: 0.3, reg: '400 Hz–8 kHz', enter: 0.8, full: 0.95, phrase: 16, melodic: true }),
  ARP:    L({ id: 'ARP', name: 'Pluck Arp', group: 'Character', synth: 'arp', color: '#eab308', sc: 'harm', vol: 0.34, pan: -0.25, rev: 0.25, del: 0.35, reg: '300 Hz–6 kHz', enter: 0.6, full: 0.9, phrase: 8, melodic: true }),
  PAD:    L({ id: 'PAD', name: 'Pad', group: 'Harmony', synth: 'pad', color: '#a78bfa', sc: 'harm', vol: 0.4, pan: 0, rev: 0.4, del: 0.05, reg: '200 Hz–8 kHz', enter: 0.15, full: 0.45, phrase: 16, melodic: true }),
  DUB:    L({ id: 'DUB', name: 'Dub Chords', group: 'Harmony', synth: 'dubchord', color: '#c084fc', sc: 'harm', vol: 0.4, pan: 0.15, rev: 0.45, del: 0.65, reg: '200 Hz–5 kHz', enter: 0.2, full: 0.5, phrase: 12, melodic: true }),
  DRONE:  L({ id: 'DRONE', name: 'Fifth Drone', group: 'Harmony', synth: 'drone', color: '#8b5cf6', sc: 'harm', vol: 0.34, pan: 0, rev: 0.3, del: 0, reg: '60–600 Hz', enter: 0.75, full: 0.3, phrase: 32, melodic: true }),
  TEX:    L({ id: 'TEX', name: 'Noise Texture', group: 'Texture', synth: 'noise', color: '#94a3b8', sc: 'fx', vol: 0.22, pan: 0, rev: 0.5, del: 0, reg: '1–12 kHz', enter: 0.8, full: 0.3, phrase: 32 }),
  CRACKLE:L({ id: 'CRACKLE', name: 'Vinyl Crackle', group: 'Texture', synth: 'crackle', color: '#cbd5e1', sc: null, vol: 0.2, pan: 0, rev: 0.1, del: 0, reg: '2–16 kHz', enter: 0.9, full: 0.2, phrase: 32 }),
  RISER:  L({ id: 'RISER', name: 'Risers', group: 'Transition', synth: 'riser', color: '#06b6d4', sc: null, vol: 0.5, pan: 0, rev: 0.25, del: 0, reg: 'Full', enter: 0, full: 0, phrase: 8 }),
  IMPACT: L({ id: 'IMPACT', name: 'Impacts', group: 'Transition', synth: 'impact', color: '#ec4899', sc: null, vol: 0.7, pan: 0, rev: 0.2, del: 0, reg: '25–200 Hz', enter: 0, full: 0, phrase: 8 }),
  CRASH:  L({ id: 'CRASH', name: 'Crash / Reverse', group: 'Transition', synth: 'crash', color: '#f472b6', sc: null, vol: 0.4, pan: 0, rev: 0.35, del: 0, reg: '3–16 kHz', enter: 0, full: 0, phrase: 8 }),
  DOWNLIFT:L({ id: 'DOWNLIFT', name: 'Downlifters', group: 'Transition', synth: 'downlift', color: '#d946ef', sc: null, vol: 0.5, pan: 0, rev: 0.3, del: 0, reg: 'Full', enter: 0, full: 0, phrase: 8 }),
};

export const GROUP_ORDER: LayerGroup[] = ['Foundation', 'Groove', 'Character', 'Harmony', 'Texture', 'Transition'];
export const ATOM_LAYERS = ['RISER', 'IMPACT', 'CRASH', 'DOWNLIFT'];

export interface StyleDef {
  id: string; name: string; desc: string;
  bpm: [number, number]; scales: ScaleId[];
  layers: string[]; forms: string[];
  swing: number;
  cut16: number; cut32: number; void: number;  // phrase micro-cuts + pre-drop void (bars)
  kick: 'four' | 'ghost' | 'stark';
  poly: number[];                               // polymetric loop lengths for PERC2
  thr?: Record<string, [number, number]>;
  prog: number[];                               // chord/root degree progression (per 2 bars)
  dirt: number;
}

const ATOMS = ['RISER', 'IMPACT', 'CRASH', 'DOWNLIFT'];

export const STYLES: Record<string, StyleDef> = {
  hypnotic: {
    id: 'hypnotic', name: 'Hypnotic Techno', desc: '132–138 BPM · polymetric 3-vs-4, long filter plateaus, deep rumble.',
    bpm: [132, 138], scales: ['phrygian', 'minor', 'dorian'],
    layers: ['KICK', 'SUB', 'RUMBLE', 'HAT_C', 'HAT_O', 'SHAKER', 'CLAP', 'PERC1', 'PERC2', 'ACID1', 'STAB', 'PAD', 'DRONE', 'TEX', ...ATOMS],
    forms: ['plateau', 'peakfirst', 'tool'], swing: 0.54, cut16: 0.5, cut32: 1, void: 1, kick: 'four', poly: [12, 20, 24], prog: [0, 0, 1, 0], dirt: 0.25,
  },
  industrial: {
    id: 'industrial', name: 'Industrial Techno', desc: '136–145 BPM · distorted kick, metal clangs, stark pre-drop silence.',
    bpm: [136, 145], scales: ['locrian', 'phrygian', 'octatonic'],
    layers: ['KICK', 'SUB', 'MIDBASS', 'HAT_C', 'HAT_O', 'CLAP', 'PERC1', 'CLANG', 'TOM', 'ACID1', 'STAB', 'DRONE', 'TEX', 'CRACKLE', ...ATOMS],
    forms: ['industrial', 'peakfirst', 'plateau'], swing: 0.5, cut16: 1, cut32: 2, void: 2, kick: 'stark', poly: [20, 28], prog: [0, 1, 0, 0], dirt: 0.75,
    thr: { CLANG: [0.5, 0.9], MIDBASS: [0.4, 0.7] },
  },
  acid: {
    id: 'acid', name: 'Acid Techno', desc: '135–142 BPM · 909 drive, dual 303 (roller + screamer), accent/slide automation.',
    bpm: [135, 142], scales: ['phrygianDominant', 'minor', 'phrygian'],
    layers: ['KICK', 'SUB', 'HAT_C', 'HAT_O', 'SHAKER', 'CLAP', 'PERC1', 'ACID1', 'ACID2', 'STAB', 'ARP', 'PAD', 'TEX', ...ATOMS],
    forms: ['acid', 'dual', 'plateau'], swing: 0.55, cut16: 0.5, cut32: 1, void: 1, kick: 'four', poly: [12, 20], prog: [0, 0, 5, 0], dirt: 0.45,
    thr: { ACID1: [0.35, 0.7], ACID2: [0.7, 0.95] },
  },
  hardgroove: {
    id: 'hardgroove', name: 'Hardgroove', desc: '138–144 BPM · tribal congas, rolling offbeat bass, ghost snares, high swing.',
    bpm: [138, 144], scales: ['dorian', 'minor', 'phrygian'],
    layers: ['KICK', 'SUB', 'MIDBASS', 'HAT_C', 'HAT_O', 'SHAKER', 'SNARE', 'CLAP', 'CONGA', 'PERC1', 'TOM', 'RIDE', 'STAB', 'ACID1', 'PAD', ...ATOMS],
    forms: ['hardgroove', 'dual', 'plateau'], swing: 0.62, cut16: 0.5, cut32: 1, void: 1, kick: 'ghost', poly: [12, 24], prog: [0, 3, 0, 4], dirt: 0.4,
    thr: { SNARE: [0.35, 0.7], CONGA: [0.25, 0.6] },
  },
  dub: {
    id: 'dub', name: 'Dub Techno', desc: '122–128 BPM · min7/9 chords in tape delay, cavernous reverb, 12/16/24-bar overlaps.',
    bpm: [122, 128], scales: ['dorian', 'minor'],
    layers: ['KICK', 'SUB', 'HAT_C', 'HAT_O', 'SHAKER', 'PERC1', 'DUB', 'PAD', 'DRONE', 'ACID1', 'TEX', 'CRACKLE', 'RISER', 'IMPACT', 'DOWNLIFT'],
    forms: ['dub', 'tool'], swing: 0.56, cut16: 0.5, cut32: 1, void: 1, kick: 'four', poly: [12, 24], prog: [0, 3, 0, 6], dirt: 0.1,
    thr: { DUB: [0.1, 0.4], PAD: [0.1, 0.35], HAT_C: [0.3, 0.6], ACID1: [0.55, 0.9] },
  },
  peak: {
    id: 'peak', name: 'Peak-Time / Driving', desc: '132–136 BPM · anthem leads, snare-roll builds, heavy sidechain pump.',
    bpm: [132, 136], scales: ['minor', 'harmonicMinor', 'dorian'],
    layers: ['KICK', 'SUB', 'MIDBASS', 'HAT_C', 'HAT_O', 'RIDE', 'CLAP', 'SNARE', 'PERC1', 'STAB', 'LEAD', 'ARP', 'PAD', 'TEX', ...ATOMS],
    forms: ['dual', 'peakfirst', 'plateau'], swing: 0.52, cut16: 1, cut32: 2, void: 1, kick: 'four', poly: [12, 20], prog: [0, 5, 3, 4], dirt: 0.3,
  },
  raw: {
    id: 'raw', name: 'Raw / Minimal', desc: '130–136 BPM · micro-percussion, sparse stabs, timbre-driven tension.',
    bpm: [130, 136], scales: ['phrygian', 'dorian', 'locrian'],
    layers: ['KICK', 'SUB', 'HAT_C', 'SHAKER', 'PERC1', 'PERC2', 'CONGA', 'STAB', 'DRONE', 'TEX', 'CRACKLE', ...ATOMS],
    forms: ['tool', 'hardgroove', 'plateau'], swing: 0.57, cut16: 0.5, cut32: 1, void: 1, kick: 'ghost', poly: [12, 20, 28], prog: [0, 0, 0, 1], dirt: 0.5,
  },
  deep: {
    id: 'deep', name: 'Deep / Experimental', desc: '124–132 BPM · odd phrase lengths, clang percussion, drones and arps.',
    bpm: [124, 132], scales: ['octatonic', 'dorian', 'harmonicMinor'],
    layers: ['KICK', 'RUMBLE', 'HAT_O', 'SHAKER', 'PERC2', 'CLANG', 'DUB', 'ARP', 'DRONE', 'PAD', 'TEX', 'CRACKLE', 'RISER', 'IMPACT', 'DOWNLIFT', 'CRASH'],
    forms: ['dub', 'tool', 'acid'], swing: 0.58, cut16: 0.5, cut32: 1, void: 1, kick: 'four', poly: [20, 24, 28], prog: [0, 2, 0, 5], dirt: 0.35,
    thr: { RUMBLE: [0.1, 0.4], DUB: [0.15, 0.45] },
  },
};

export interface SectionSpec { role: SectionRole; bars: number[]; energy: number; flex?: boolean; p?: number; name?: string }
export interface FormDef { id: string; name: string; desc: string; range: string; sections: SectionSpec[] }

const S = (role: SectionRole, bars: number[], energy: number, extra: Partial<SectionSpec> = {}): SectionSpec => ({ role, bars, energy, ...extra });

export const FORMS: Record<string, FormDef> = {
  plateau: {
    id: 'plateau', name: 'A · Club Plateau & Subtractive Reduction', range: '160–224 bars', desc: 'Mix-in intro → consolidation → thematic plateau → kick-less reduction → riser void → climax → mix-out.',
    sections: [S('INTRO', [32, 16], 0.25), S('GROOVE_BUILD', [32, 16], 0.45), S('PLATEAU', [32], 0.7, { flex: true }), S('REDUCTION', [16, 32], 0.33), S('BUILD_UP', [8], 0.58), S('DROP_PEAK', [32, 48, 64], 0.95, { flex: true }), S('OUTRO', [32, 16], 0.3)],
  },
  dual: {
    id: 'dual', name: 'B · Dual-Drop Peak-Time', range: '128–192 bars', desc: 'Restrained first drop, atmospheric breakdown, multi-stage build, evolved second peak drop.',
    sections: [S('INTRO', [16], 0.25), S('GROOVE_BUILD', [16], 0.45), S('DROP_PRIMARY', [32], 0.72), S('REDUCTION', [16], 0.3), S('BUILD_UP', [16, 8], 0.62), S('DROP_PEAK', [32, 48], 1.0, { flex: true }), S('VARIATION', [16], 0.8, { p: 0.65 }), S('OUTRO', [16], 0.25)],
  },
  dub: {
    id: 'dub', name: 'C · Dub / Deep Progressive Evolution', range: '160–240 bars', desc: 'Asymmetric 12/16/24-bar overlaps, send-level and filter evolution instead of hard drops.',
    sections: [S('INTRO', [24], 0.25), S('GROOVE_BUILD', [16], 0.4), S('BASS_ENTRANCE', [12], 0.5), S('PLATEAU', [24], 0.62, { flex: true }), S('VARIATION', [12], 0.45), S('PLATEAU', [24], 0.72, { flex: true, name: 'Plateau II' }), S('REDUCTION', [16], 0.3), S('DROP_PEAK', [32], 0.82, { flex: true, name: 'Dub Peak' }), S('OUTRO', [24], 0.25)],
  },
  industrial: {
    id: 'industrial', name: 'D · Industrial Stark Contrast', range: '128–176 bars', desc: 'Short, hard-cut structure with stark void bars before every impact.',
    sections: [S('INTRO', [16], 0.3), S('GROOVE_BUILD', [16], 0.55), S('DROP_PRIMARY', [16, 32], 0.8), S('REDUCTION', [8], 0.25), S('BUILD_UP', [8], 0.6), S('DROP_PEAK', [32, 48], 1.0, { flex: true }), S('VARIATION', [16], 0.75), S('OUTRO', [16], 0.3)],
  },
  peakfirst: {
    id: 'peakfirst', name: 'E · Subtractive 32-Bar Plateau (peak-first)', range: '160–224 bars', desc: 'Generated from the densest loop downwards: Intro, Groove Build, Reduction, First Drop, Main Peak, Outro.',
    sections: [S('INTRO', [32], 0.25), S('GROOVE_BUILD', [32], 0.5), S('REDUCTION', [16], 0.3), S('DROP_PRIMARY', [32], 0.75), S('DROP_PEAK', [32, 64], 1.0, { flex: true }), S('OUTRO', [32], 0.3)],
  },
  hardgroove: {
    id: 'hardgroove', name: 'F · Rolling Hardgroove Journey', range: '144–192 bars', desc: 'Two plateaus split by a short break, then a build into the final peak.',
    sections: [S('INTRO', [16], 0.3), S('GROOVE_BUILD', [16], 0.5), S('PLATEAU', [32], 0.7), S('REDUCTION', [8], 0.4), S('PLATEAU', [32], 0.82, { flex: true, name: 'Plateau II' }), S('BUILD_UP', [8], 0.65), S('DROP_PEAK', [32], 0.95, { flex: true }), S('OUTRO', [16], 0.3)],
  },
  acid: {
    id: 'acid', name: 'G · Acid Journey', range: '160–208 bars', desc: 'Acid enters in stages, solo 303 reduction, then a screaming peak.',
    sections: [S('INTRO', [16], 0.3), S('GROOVE_BUILD', [16], 0.45), S('BASS_ENTRANCE', [16], 0.55), S('REDUCTION', [8], 0.3, { name: 'Acid Solo' }), S('DROP_PRIMARY', [32], 0.8), S('REDUCTION', [16], 0.35, { name: 'Reduction II' }), S('BUILD_UP', [16], 0.65), S('DROP_PEAK', [32], 1.0, { flex: true }), S('OUTRO', [16], 0.3)],
  },
  tool: {
    id: 'tool', name: 'H · DJ Tool Evolution', range: '96–144 bars', desc: 'Minimal, mix-friendly: gradual layering, one short break, one peak.',
    sections: [S('INTRO', [16], 0.3), S('PLATEAU', [32], 0.6, { flex: true }), S('VARIATION', [16], 0.45), S('PLATEAU', [32], 0.75, { flex: true, name: 'Plateau II' }), S('REDUCTION', [8], 0.35), S('DROP_PEAK', [16, 32], 0.92, { flex: true }), S('OUTRO', [16], 0.3)],
  },
};

export const ROLE_NAMES: Record<SectionRole, string> = {
  INTRO: 'Intro', GROOVE_BUILD: 'Groove Build', BASS_ENTRANCE: 'Bass Entrance', PLATEAU: 'Plateau', REDUCTION: 'Reduction',
  BUILD_UP: 'Build-Up', DROP_PRIMARY: 'First Drop', VARIATION: 'Variation', DROP_PEAK: 'Main Peak', OUTRO: 'Outro / Mix-Out',
};
export const ROLE_COLORS: Record<SectionRole, string> = {
  INTRO: '#64748b', GROOVE_BUILD: '#0ea5e9', BASS_ENTRANCE: '#14b8a6', PLATEAU: '#22c55e', REDUCTION: '#8b5cf6',
  BUILD_UP: '#f59e0b', DROP_PRIMARY: '#f97316', VARIATION: '#06b6d4', DROP_PEAK: '#ef4444', OUTRO: '#475569',
};

/** subtractive rules: layers killed / forced-to-level for a role (applied on top of energy mapping) */
export const ROLE_RULES: Record<SectionRole, { kill: string[]; boost: Record<string, number> }> = {
  INTRO: { kill: ['MIDBASS', 'ACID2', 'LEAD', 'CLAP', 'RIDE', 'CLANG', 'STAB', 'ARP', 'SNARE', 'SUB'], boost: { PAD: 0.3, PERC1: 0.35, SHAKER: 0.3 } },
  GROOVE_BUILD: { kill: ['ACID2', 'LEAD', 'RIDE', 'CLANG'], boost: {} },
  BASS_ENTRANCE: { kill: ['ACID2', 'LEAD', 'RIDE'], boost: { SUB: 0.7 } },
  PLATEAU: { kill: ['RIDE', 'LEAD'], boost: {} },
  REDUCTION: { kill: ['KICK', 'SUB', 'RUMBLE', 'MIDBASS', 'CLAP', 'SNARE', 'RIDE', 'CLANG', 'TOM', 'HAT_O', 'ACID2', 'LEAD'], boost: { PAD: 0.9, DRONE: 0.8, DUB: 0.8, TEX: 0.7, ACID1: 0.5, ARP: 0.5, PERC2: 0.4, HAT_C: 0.3, CRACKLE: 0.6 } },
  BUILD_UP: { kill: ['SUB', 'RUMBLE', 'RIDE', 'LEAD'], boost: { SNARE: 0.7, PERC2: 0.7, HAT_C: 0.8, PAD: 0.6 } },
  DROP_PRIMARY: { kill: ['RIDE', 'ACID2'], boost: {} },
  VARIATION: { kill: ['RIDE'], boost: {} },
  DROP_PEAK: { kill: [], boost: { RIDE: 0.9, CLANG: 0.8 } },
  OUTRO: { kill: ['ACID2', 'LEAD', 'RIDE', 'CRASH', 'CLANG', 'STAB'], boost: {} },
};
