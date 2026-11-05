import type { AutoLane, Clip, Project, ScGroup, SynthKind, Track } from './types';
import { STEPS_PER_BAR, totalBars } from './types';
import { clamp, lerp } from './theory';
import { makeNoise, playVoice, type TrackCtl, type VEnv } from './voices';
import { SC_WORKLET_SRC } from './worklet';

const GROUPS: ScGroup[] = ['bass', 'harm', 'fx'];
export const stepDurOf = (bpm: number) => 60 / bpm / 4;
const cutCents = (v: number) => (v - 0.5) * 6000;
const hpHz = (v: number) => 20 * Math.pow(2, v * 6.5);

export interface Strip {
  id: string; input: GainNode; volA: GainNode; fader: GainNode; pan: StereoPannerNode; out: GainNode; analyser: AnalyserNode;
  revSend: GainNode; delSend: GainNode; cutoff: ConstantSourceNode; res: ConstantSourceNode; ctl: TrackCtl;
  target: AudioNode; sc: ScGroup | null; synth: SynthKind; last?: { hz: number; end: number };
}

function makeIR(ctx: BaseAudioContext, seconds = 2.8): AudioBuffer {
  const sr = ctx.sampleRate; const len = Math.floor(sr * seconds); const b = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c); let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len; const a = Math.exp(-4.2 * t); lp += (Math.random() * 2 - 1 - lp) * (0.55 - 0.4 * t);
      d[i] = lp * a * (i < sr * 0.02 ? i / (sr * 0.02) : 1);
    }
  }
  return b;
}
const satCurve = (k: number) => { const c = new Float32Array(new ArrayBuffer(2048 * 4)); for (let i = 0; i < 2048; i++) { const x = (i / 2047) * 2 - 1; c[i] = Math.tanh(x * k) / Math.tanh(k); } return c; };

export class Graph {
  ctx: BaseAudioContext; useWorklet: boolean;
  preMaster: GainNode; hp: BiquadFilterNode; sat: WaveShaperNode; limiter: DynamicsCompressorNode; master: GainNode; analyser: AnalyserNode;
  revIn: GainNode; delIn: GainNode; delay: DelayNode;
  groups = {} as Record<ScGroup, { input: AudioNode; node?: AudioWorkletNode; duck?: GainNode }>;
  strips = new Map<string, Strip>();
  hist: Record<ScGroup, { gr: number; key: number }[]> = { bass: [], harm: [], fx: [] };
  env: VEnv; voices = 0; mode = '';

  constructor(ctx: BaseAudioContext, useWorklet: boolean, shared?: { noise: AudioBuffer; ir: AudioBuffer }, record = true) {
    this.ctx = ctx; this.useWorklet = useWorklet;
    const noise = shared?.noise ?? makeNoise(ctx); const ir = shared?.ir ?? makeIR(ctx);
    this.env = { ctx, noise, dirt: 0.3, stepDur: 0.11, onStart: () => { this.voices++; }, onEnd: () => { this.voices = Math.max(0, this.voices - 1); } };
    this.preMaster = ctx.createGain();
    this.hp = ctx.createBiquadFilter(); this.hp.type = 'highpass'; this.hp.frequency.value = 20; this.hp.Q.value = 0.5;
    this.sat = ctx.createWaveShaper(); this.sat.curve = satCurve(1.4); this.sat.oversample = '2x';
    this.limiter = ctx.createDynamicsCompressor(); this.limiter.threshold.value = -4; this.limiter.knee.value = 0; this.limiter.ratio.value = 20; this.limiter.attack.value = 0.002; this.limiter.release.value = 0.12;
    this.master = ctx.createGain(); this.master.gain.value = 0.85;
    this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 1024; this.analyser.smoothingTimeConstant = 0.7;
    this.preMaster.connect(this.hp); this.hp.connect(this.sat); this.sat.connect(this.limiter); this.limiter.connect(this.master); this.master.connect(this.analyser); this.analyser.connect(ctx.destination);

    for (const g of GROUPS) {
      if (useWorklet) {
        const node = new AudioWorkletNode(ctx, 'sc-comp', { numberOfInputs: 2, numberOfOutputs: 1, outputChannelCount: [2] });
        node.connect(this.preMaster);
        if (record) node.port.onmessage = (e) => { const h = this.hist[g]; h.push(e.data); if (h.length > 400) h.shift(); };
        this.groups[g] = { input: node, node };
      } else {
        const duck = ctx.createGain(); duck.connect(this.preMaster); this.groups[g] = { input: duck, duck };
      }
    }
    // reverb + tempo-synced delay returns
    const conv = ctx.createConvolver(); conv.buffer = ir; const revOut = ctx.createGain(); revOut.gain.value = 0.55;
    this.revIn = ctx.createGain(); const pre = ctx.createDelay(0.2); pre.delayTime.value = 0.018;
    const revLp = ctx.createBiquadFilter(); revLp.type = 'lowpass'; revLp.frequency.value = 7000; const revHp = ctx.createBiquadFilter(); revHp.type = 'highpass'; revHp.frequency.value = 220;
    this.revIn.connect(pre); pre.connect(revHp); revHp.connect(conv); conv.connect(revLp); revLp.connect(revOut); revOut.connect(this.groups.fx.input);
    this.delIn = ctx.createGain(); this.delay = ctx.createDelay(2); this.delay.delayTime.value = 0.34;
    const fb = ctx.createGain(); fb.gain.value = 0.46; const fbLp = ctx.createBiquadFilter(); fbLp.type = 'lowpass'; fbLp.frequency.value = 3200;
    const delOut = ctx.createGain(); delOut.gain.value = 0.6;
    this.delIn.connect(this.delay); this.delay.connect(fbLp); fbLp.connect(fb); fb.connect(this.delay); fbLp.connect(delOut); delOut.connect(this.preMaster);
    const dToRev = ctx.createGain(); dToRev.gain.value = 0.25; delOut.connect(dToRev); dToRev.connect(this.revIn);
  }

  private createStrip(t: Track): Strip {
    const ctx = this.ctx;
    const input = ctx.createGain(); const volA = ctx.createGain(); const fader = ctx.createGain(); const pan = ctx.createStereoPanner(); const out = ctx.createGain();
    const analyser = ctx.createAnalyser(); analyser.fftSize = 256;
    const revSend = ctx.createGain(); const delSend = ctx.createGain();
    const cutoff = ctx.createConstantSource(); cutoff.offset.value = 0; cutoff.start();
    const res = ctx.createConstantSource(); res.offset.value = 0; res.start();
    input.connect(volA); volA.connect(fader); fader.connect(pan); pan.connect(out); out.connect(analyser);
    out.connect(revSend); revSend.connect(this.revIn); out.connect(delSend); delSend.connect(this.delIn);
    out.connect(this.preMaster);
    const s: Strip = { id: t.id, input, volA, fader, pan, out, analyser, revSend, delSend, cutoff, res, ctl: { cutoff, res }, target: this.preMaster, sc: null, synth: t.synth };
    if (t.synth === 'kick' && this.useWorklet) for (const g of GROUPS) out.connect(this.groups[g].node!, 0, 1);
    this.strips.set(t.id, s);
    return s;
  }

  private destroyStrip(s: Strip) {
    s.out.disconnect(); s.cutoff.stop(); s.res.stop(); s.cutoff.disconnect(); s.res.disconnect(); s.input.disconnect(); s.volA.disconnect(); s.fader.disconnect(); s.pan.disconnect();
    this.strips.delete(s.id);
  }

  sync(p: Project) {
    const now = this.ctx.currentTime; const anySolo = p.tracks.some((t) => t.solo);
    const laneOf = (id: string, param: string) => p.auto.some((a) => a.track === id && a.param === param);
    const live = new Set<string>();
    for (const t of p.tracks) {
      live.add(t.id);
      const s = this.strips.get(t.id) ?? this.createStrip(t);
      const audible = !t.mute && (!anySolo || t.solo);
      s.fader.gain.setTargetAtTime(audible ? t.vol : 0, now, 0.015);
      s.pan.pan.setTargetAtTime(t.pan, now, 0.015);
      if (!laneOf(t.id, 'rev')) s.revSend.gain.setTargetAtTime(t.rev * 0.8, now, 0.02);
      s.delSend.gain.setTargetAtTime(t.del * 0.7, now, 0.02);
      if (!laneOf(t.id, 'cutoff')) s.cutoff.offset.setTargetAtTime(cutCents(t.cutoff), now, 0.02);
      if (!laneOf(t.id, 'res')) s.res.offset.setTargetAtTime(t.res * 14, now, 0.02);
      const want = t.sc ? this.groups[t.sc].input : this.preMaster;
      if (s.target !== want) {
        try { s.out.disconnect(s.target); } catch { /* not connected */ }
        s.out.connect(want); s.target = want;
      }
      s.sc = t.sc; s.synth = t.synth;
    }
    for (const [id, s] of this.strips) if (!live.has(id)) this.destroyStrip(s);
    for (const g of GROUPS) {
      const c = p.sc[g]; const n = this.groups[g].node;
      if (n) {
        const set = (k: string, v: number) => n.parameters.get(k)!.setTargetAtTime(v, now, 0.01);
        set('thr', c.thr); set('ratio', c.ratio); set('atk', c.atk); set('rel', c.rel); set('hpf', c.hpf); set('knee', c.knee); set('mix', p.scOn ? c.mix : 0);
      }
    }
    const bpm = p.params.bpm; this.env.stepDur = stepDurOf(bpm); this.delay.delayTime.setTargetAtTime(60 / bpm * 0.75, now, 0.05);
    this.env.dirt = clamp(p.params.dirt + (p.params.mode === 'industrial' ? 0.25 : p.params.mode === 'clean' ? -0.15 : 0));
    if (this.mode !== p.params.mode) { this.mode = p.params.mode; this.sat.curve = satCurve(p.params.mode === 'industrial' ? 2.4 : p.params.mode === 'clean' ? 0.8 : 1.4); }
  }

  kill() { try { this.master.disconnect(); this.analyser.disconnect(); } catch { /* ignore */ } }
}

// ───────────── automation helpers ─────────────
export function evalLane(lane: AutoLane, bar: number): number {
  const pts = lane.pts; if (!pts.length) return 0.5;
  if (bar <= pts[0].bar) return pts[0].v;
  for (let i = 1; i < pts.length; i++) {
    if (bar < pts[i].bar) { const a = pts[i - 1], b = pts[i]; return b.bar - a.bar < 0.02 ? a.v : lerp(a.v, b.v, (bar - a.bar) / (b.bar - a.bar)); }
  }
  return pts[pts.length - 1].v;
}

export class Scheduler {
  constructor(public g: Graph) {}

  private laneTarget(lane: AutoLane): { param: AudioParam; map: (v: number) => number; exp: boolean } | null {
    if (lane.param === 'hp') return { param: this.g.hp.frequency, map: hpHz, exp: true };
    const s = this.g.strips.get(lane.track); if (!s) return null;
    switch (lane.param) {
      case 'cutoff': return { param: s.cutoff.offset, map: cutCents, exp: false };
      case 'res': return { param: s.res.offset, map: (v) => v * 14, exp: false };
      case 'rev': return { param: s.revSend.gain, map: (v) => v * 0.8, exp: false };
      case 'vol': return { param: s.volA.gain, map: (v) => v, exp: false };
    }
  }

  /** sample-accurate: lane events are placed on AudioParam timelines (no main-thread stepping) */
  scheduleAutomation(p: Project, fromBar: number, t0: number, future: boolean) {
    const sd = stepDurOf(p.params.bpm);
    for (const lane of p.auto) {
      const tg = this.laneTarget(lane); if (!tg || !lane.pts.length) continue;
      const { param, map, exp } = tg;
      param.cancelScheduledValues(t0);
      param.setValueAtTime(map(evalLane(lane, fromBar)), t0);
      if (!future) continue;
      let prev = lane.pts.filter((q) => q.bar <= fromBar).pop();
      for (const q of lane.pts) {
        if (q.bar <= fromBar) continue;
        const time = t0 + (q.bar - fromBar) * STEPS_PER_BAR * sd; const val = map(q.v);
        const gap = prev ? q.bar - prev.bar : 1;
        if (gap < 0.02) param.setValueAtTime(val, time);
        else if (exp) param.exponentialRampToValueAtTime(Math.max(0.001, val), time);
        else param.linearRampToValueAtTime(val, time);
        prev = q;
      }
    }
  }

  scheduleWindow(p: Project, a: number, b: number, mapT: (step: number) => number) {
    const sd = stepDurOf(p.params.bpm); const sw = p.params.swing; const anySolo = p.tracks.some((t) => t.solo);
    const kickTimes: number[] = [];
    for (const t of p.tracks) {
      if (t.mute || (anySolo && !t.solo)) continue;
      const s = this.g.strips.get(t.id); if (!s) continue;
      for (const c of t.clips) {
        if (c.mute || !c.notes.length) continue;
        const cs = c.start * STEPS_PER_BAR, ce = (c.start + c.len) * STEPS_PER_BAR;
        if (b <= cs || a >= ce) continue;
        this.clipNotes(t, s, c, cs, ce, a, b, sd, sw, mapT, kickTimes);
      }
    }
    if (!this.g.useWorklet && p.scOn) {
      kickTimes.sort((x, y) => x - y);
      for (const g of GROUPS) {
        const d = this.g.groups[g].duck; if (!d) continue; const cfg = p.sc[g];
        const depth = Math.min(0.92, (1 - 1 / cfg.ratio) * 1.05) * cfg.mix;
        for (const tm of kickTimes) { d.gain.setValueAtTime(1 - depth, tm); d.gain.setTargetAtTime(1, tm + 0.004, cfg.rel / 1000 / 3); }
      }
    }
  }

  private clipNotes(t: Track, s: Strip, c: Clip, cs: number, ce: number, a: number, b: number, sd: number, sw: number, mapT: (x: number) => number, kicks: number[]) {
    const lo = Math.max(a, cs) - cs + c.off, hi = Math.min(b, ce) - cs + c.off;
    const r0 = Math.floor(lo / c.loop), r1 = Math.floor(hi / c.loop);
    const swingShift = (2 * sw - 1) * sd;
    for (let r = r0; r <= r1; r++) {
      for (const n of c.notes) {
        if (n.t >= c.loop) continue;
        const abs = cs + r * c.loop + n.t - c.off;
        if (abs < a - 1e-9 || abs >= b - 1e-9 || abs < cs - 1e-9 || abs >= ce - 1e-9) continue;
        if (n.prob !== undefined && n.prob < 1 && Math.random() > n.prob) continue;
        const odd = Math.abs((abs % 2) - 1) < 0.02;
        const tm = mapT(abs) + (odd ? swingShift : 0) + (n.micro ?? 0) * sd;
        const dur = Math.max(0.02, n.d * sd * 0.98);
        const note = { ...n, p: n.p + c.transpose, v: clamp(n.v * c.gain, 0, 1.2) };
        let slideFrom: number | undefined;
        if (t.synth === 'acid') {
          if (n.slide && s.last && tm - s.last.end <= sd * 0.6 && tm >= s.last.end - 0.2) slideFrom = s.last.hz;
          s.last = { hz: 440 * Math.pow(2, (note.p - 69) / 12), end: tm + dur };
        }
        if (t.synth === 'kick') kicks.push(tm);
        playVoice(t.synth, this.g.env, s.input, tm, dur, note, s.ctl, slideFrom);
      }
    }
  }
}

// ───────────── realtime engine ─────────────
export class Engine {
  ctx?: AudioContext; graph: Graph | null = null; sched?: Scheduler; workletOk = false; workletTried = false;
  playing = false; timer?: number; getProject: () => Project = () => { throw new Error('no project'); };
  private segs: { refStep: number; refTime: number; dur: number }[] = [];
  private nextStep = 0; private lastProject?: Project; private lastAuto?: unknown;
  private shared?: { noise: AudioBuffer; ir: AudioBuffer };
  schedMs = 0; onStop?: () => void;

  get state() { return this.ctx?.state ?? 'idle'; }
  get voices() { return this.graph?.voices ?? 0; }
  get latency() { return this.ctx ? (this.ctx.baseLatency || 0) + ((this.ctx as AudioContext & { outputLatency?: number }).outputLatency || 0) : 0; }

  private async ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
    }
    if (!this.workletTried) {
      this.workletTried = true;
      try {
        const url = URL.createObjectURL(new Blob([SC_WORKLET_SRC], { type: 'application/javascript' }));
        await this.ctx.audioWorklet.addModule(url); this.workletOk = true;
      } catch (e) { console.warn('AudioWorklet unavailable — using scheduled-envelope sidechain fallback', e); this.workletOk = false; }
    }
    if (this.ctx.state !== 'running') await this.ctx.resume();
    if (!this.shared) this.shared = { noise: makeNoise(this.ctx), ir: makeIR(this.ctx) };
    if (!this.graph) { this.graph = new Graph(this.ctx, this.workletOk, this.shared); this.sched = new Scheduler(this.graph); }
  }

  /** call from a user gesture (also unlocks iOS/Android autoplay policies) */
  async play(fromBar: number) {
    if (this.playing) this.halt();
    await this.ensure();
    const ctx = this.ctx!; const p = this.getProject();
    this.graph!.sync(p); this.lastProject = p; this.lastAuto = p.auto;
    const dur = stepDurOf(p.params.bpm); const t0 = ctx.currentTime + 0.1; const step = fromBar * STEPS_PER_BAR;
    this.segs = [{ refStep: step, refTime: t0, dur }]; this.nextStep = step; this.playing = true;
    this.sched!.scheduleAutomation(p, fromBar, t0, true);
    this.timer = window.setInterval(() => this.tick(), 25); this.tick();
  }

  private halt() {
    if (this.timer) clearInterval(this.timer); this.timer = undefined; this.playing = false;
    if (this.graph) { this.graph.kill(); this.graph = null; this.sched = undefined; }
  }
  stop() { const was = this.playing; this.halt(); if (was) this.onStop?.(); }

  getStep(): number {
    if (!this.ctx || !this.segs.length) return -1;
    const t = this.ctx.currentTime - this.latency;
    let seg = this.segs[0];
    for (const s of this.segs) if (s.refTime <= t) seg = s;
    if (this.segs.length > 4) this.segs = this.segs.filter((s) => s === seg || s.refTime > t);
    return seg.refStep + Math.max(0, t - seg.refTime) / seg.dur;
  }

  private tick() {
    const ctx = this.ctx!; const g = this.graph; if (!g || !this.sched) return;
    const t0 = performance.now(); const p = this.getProject();
    if (p !== this.lastProject) {
      g.sync(p); this.lastProject = p;
      const seg0 = this.segs[this.segs.length - 1]; const dur = stepDurOf(p.params.bpm);
      if (Math.abs(seg0.dur - dur) > 1e-9) { // tempo change: new segment from here
        const tn = seg0.refTime + (this.nextStep - seg0.refStep) * seg0.dur;
        this.segs.push({ refStep: this.nextStep, refTime: Math.max(tn, ctx.currentTime), dur });
      }
      if (p.auto !== this.lastAuto) {
        this.lastAuto = p.auto; const sg = this.segs[this.segs.length - 1];
        const nowStep = sg.refStep + Math.max(0, ctx.currentTime + 0.02 - sg.refTime) / sg.dur;
        this.sched.scheduleAutomation(p, nowStep / STEPS_PER_BAR, ctx.currentTime + 0.02, true);
      }
    }
    const seg = this.segs[this.segs.length - 1]; const end = totalBars(p) * STEPS_PER_BAR;
    const horizon = ctx.currentTime + 0.3; const limit = seg.refStep + (horizon - seg.refTime) / seg.dur;
    const loopEnd = p.loop.on && p.loop.b > p.loop.a ? p.loop.b * STEPS_PER_BAR : Infinity;
    const stop = Math.min(limit, loopEnd, end);
    if (stop > this.nextStep) { this.sched.scheduleWindow(p, this.nextStep, stop, (s) => seg.refTime + (s - seg.refStep) * seg.dur); this.nextStep = stop; }
    if (loopEnd !== Infinity && this.nextStep >= loopEnd - 1e-9) {
      const tw = seg.refTime + (loopEnd - seg.refStep) * seg.dur; const ls = p.loop.a * STEPS_PER_BAR;
      this.segs.push({ refStep: ls, refTime: tw, dur: seg.dur }); this.nextStep = ls;
      this.sched.scheduleAutomation(p, p.loop.a, tw, true);
    } else if (this.nextStep >= end - 1e-9 && ctx.currentTime > seg.refTime + (end - seg.refStep) * seg.dur + 3.5) this.stop();
    this.schedMs = this.schedMs * 0.9 + (performance.now() - t0) * 0.1;
  }
}

// ───────────── offline WAV export (same scheduler + graph) ─────────────
export type ExportState = 'IDLE' | 'VALIDATING' | 'PREPARING' | 'RENDERING' | 'PROCESSING' | 'ENCODING' | 'SAVING' | 'VERIFYING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export interface ExportResult { blob: Blob; peakDb: number; rmsDb: number; frames: number; seconds: number; sc: 'worklet' | 'fallback'; expectedFrames: number }
export interface ExportOpts { sampleRate: number; bits: 16 | 24 | 32; onState: (s: ExportState, progress: number, msg?: string) => void; cancelled: () => boolean }

export function encodeWav(buf: AudioBuffer, bits: 16 | 24 | 32): Blob {
  const ch = buf.numberOfChannels, n = buf.length, bps = bits / 8; const data = new ArrayBuffer(44 + n * ch * bps); const v = new DataView(data);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * ch * bps, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, bits === 32 ? 3 : 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, buf.sampleRate, true); v.setUint32(28, buf.sampleRate * ch * bps, true); v.setUint16(32, ch * bps, true); v.setUint16(34, bits, true); w(36, 'data'); v.setUint32(40, n * ch * bps, true);
  const chans = Array.from({ length: ch }, (_, c) => buf.getChannelData(c)); let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    const x = Math.max(-1, Math.min(1, chans[c][i]));
    if (bits === 16) { v.setInt16(o, Math.round(x * 32767), true); o += 2; }
    else if (bits === 24) { const s = Math.round(x * 8388607); v.setUint8(o, s & 255); v.setUint8(o + 1, (s >> 8) & 255); v.setUint8(o + 2, (s >> 16) & 255); o += 3; }
    else { v.setFloat32(o, chans[c][i], true); o += 4; }
  }
  return new Blob([data], { type: 'audio/wav' });
}

export async function renderWav(p: Project, o: ExportOpts): Promise<ExportResult> {
  o.onState('VALIDATING', 0);
  const bars = totalBars(p);
  if (!bars || !p.tracks.some((t) => t.clips.length)) throw new Error('Project has no clips to render.');
  if (!window.OfflineAudioContext) throw new Error('OfflineAudioContext not supported in this browser.');
  o.onState('PREPARING', 0);
  const sd = stepDurOf(p.params.bpm); const songSec = bars * STEPS_PER_BAR * sd; const sr = o.sampleRate;
  const frames = Math.ceil((songSec + 4) * sr);
  const ctx = new OfflineAudioContext(2, frames, sr);
  let wk = false;
  try { const url = URL.createObjectURL(new Blob([SC_WORKLET_SRC], { type: 'application/javascript' })); await ctx.audioWorklet.addModule(url); wk = true; } catch { wk = false; }
  const graph = new Graph(ctx, wk, undefined, false); const sched = new Scheduler(graph);
  graph.sync(p);
  sched.scheduleAutomation(p, 0, 0, true);
  const WIN = 64; const nWin = Math.ceil((bars * STEPS_PER_BAR) / WIN); const total = bars * STEPS_PER_BAR; const mapT = (s: number) => s * sd;
  const win = (k: number) => { const a = k * WIN, b = Math.min(total, (k + 1) * WIN); if (a < total) sched.scheduleWindow(p, a, b, mapT); };
  win(0); win(1);
  let cancelled = false;
  o.onState('RENDERING', 0);
  for (let k = 1; k < nWin; k++) {
    const tt = Math.ceil((k * WIN * sd * sr) / 128) * 128 / sr;
    ctx.suspend(tt).then(() => {
      if (o.cancelled()) cancelled = true;
      win(k + 1); o.onState('RENDERING', k / nWin); ctx.resume();
    }).catch(() => { /* suspend past end */ });
  }
  const buf = await ctx.startRendering();
  if (cancelled || o.cancelled()) throw new Error('CANCELLED');
  o.onState('PROCESSING', 1);
  let peak = 0, sum = 0; const L = buf.getChannelData(0), R = buf.getChannelData(1);
  for (let i = 0; i < buf.length; i++) { const a = Math.abs(L[i]), b = Math.abs(R[i]); if (a > peak) peak = a; if (b > peak) peak = b; sum += L[i] * L[i] + R[i] * R[i]; }
  const rms = Math.sqrt(sum / (buf.length * 2));
  o.onState('ENCODING', 1);
  const blob = encodeWav(buf, o.bits);
  o.onState('SAVING', 1);
  o.onState('VERIFYING', 1);
  if (rms < 1e-5) throw new Error('Verification failed: rendered audio is silent.');
  return { blob, peakDb: 20 * Math.log10(peak + 1e-9), rmsDb: 20 * Math.log10(rms + 1e-9), frames: buf.length, seconds: buf.length / sr, sc: wk ? 'worklet' : 'fallback', expectedFrames: frames };
}
