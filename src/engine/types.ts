// Canonical project model — framework-free (no React / DOM dependencies).

export type SynthKind =
  | 'kick' | 'sub' | 'rumble' | 'midbass' | 'hat' | 'ohat' | 'ride' | 'shaker' | 'clap' | 'snare'
  | 'perc' | 'conga' | 'tom' | 'clang' | 'acid' | 'stab' | 'lead' | 'arp' | 'pad' | 'dubchord'
  | 'drone' | 'noise' | 'crackle' | 'riser' | 'impact' | 'downlift' | 'crash';

export type ScGroup = 'bass' | 'harm' | 'fx';
export type LayerGroup = 'Foundation' | 'Groove' | 'Character' | 'Harmony' | 'Texture' | 'Transition';

export type SectionRole =
  | 'INTRO' | 'GROOVE_BUILD' | 'BASS_ENTRANCE' | 'PLATEAU' | 'REDUCTION'
  | 'BUILD_UP' | 'DROP_PRIMARY' | 'VARIATION' | 'DROP_PEAK' | 'OUTRO';

export type ScaleId = 'phrygian' | 'dorian' | 'locrian' | 'minor' | 'harmonicMinor' | 'phrygianDominant' | 'octatonic';
export type ProdMode = 'clean' | 'hybrid' | 'industrial';

export interface Note {
  t: number;        // start in 16th-steps inside the clip loop (float allowed for rolls)
  d: number;        // duration in steps
  p: number;        // MIDI pitch
  v: number;        // velocity 0..1
  acc?: boolean;    // 303 accent
  slide?: boolean;  // glide INTO this note from the previous one
  micro?: number;   // micro-timing in steps (+/-)
  prob?: number;    // probability 0..1
}

export interface Clip {
  id: string;
  start: number;    // bars
  len: number;      // bars
  loop: number;     // independent loop length in steps (polymetric)
  off: number;      // loop phase offset in steps
  notes: Note[];
  gain: number;
  mute: boolean;
  label: string;
  transpose: number;
}

export interface Track {
  id: string;
  layer: string;
  name: string;
  color: string;
  group: LayerGroup;
  synth: SynthKind;
  vol: number;      // linear gain
  pan: number;      // -1..1
  mute: boolean;
  solo: boolean;
  lock: boolean;
  sc: ScGroup | null;
  rev: number;      // reverb send 0..1
  del: number;      // delay send 0..1
  cutoff: number;   // static filter offset 0..1 (0.5 = neutral)
  res: number;      // static resonance 0..1
  clips: Clip[];
}

export interface Section {
  id: string;
  role: SectionRole;
  name: string;
  start: number;    // bars
  bars: number;
  energy: number;   // 0..1
  lock: boolean;
  levels: Record<string, number>; // computed layer activity 0..1 (read-only view; derived at generation)
}

export type AutoParam = 'cutoff' | 'res' | 'rev' | 'vol' | 'hp';
export interface AutoPoint { bar: number; v: number }
export interface AutoLane { id: string; track: string; param: AutoParam; pts: AutoPoint[] }

export interface ScCfg { thr: number; ratio: number; atk: number; rel: number; hpf: number; mix: number; knee: number }

export interface ComposeParams {
  style: string;
  form: string;       // 'auto' or form id
  bpm: number;
  key: number;        // 0..11
  scale: ScaleId;
  bars: number;       // target length
  seed: number;
  density: number;    // 0..1
  complexity: number; // 0..1
  swing: number;      // 0.5..0.68
  acid: number;
  poly: number;
  dirt: number;
  depth: number;
  mode: ProdMode;
}

export interface Project {
  v: 1;
  id: string;
  revision: number;
  name: string;
  params: ComposeParams;
  formId: string;
  sections: Section[];
  tracks: Track[];
  auto: AutoLane[];
  sc: Record<ScGroup, ScCfg>;
  scOn: boolean;
  overrides: Record<string, number>; // `${sectionId}:${layerId}` -> forced level
  secSeed: Record<string, number>;   // per-section variation seeds
  loop: { on: boolean; a: number; b: number };
}

export type Selection =
  | { kind: 'none' }
  | { kind: 'section'; id: string }
  | { kind: 'track'; id: string }
  | { kind: 'clip'; id: string; track: string }
  | { kind: 'device'; id: ScGroup | 'master' };

export const STEPS_PER_BAR = 16;
export const totalBars = (p: Project) => p.sections.reduce((m, s) => Math.max(m, s.start + s.bars), 0);
