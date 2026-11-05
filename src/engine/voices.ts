import type { Note, SynthKind } from './types';
import { midiHz } from './theory';

export interface TrackCtl { cutoff: AudioNode; res: AudioNode }
export interface VEnv { ctx: BaseAudioContext; noise: AudioBuffer; dirt: number; stepDur: number; onStart(): void; onEnd(): void }

const curves = new Map<number, Float32Array<ArrayBuffer>>();
function curve(k: number): Float32Array<ArrayBuffer> {
  const key = Math.round(k * 4);
  let c = curves.get(key);
  if (!c) {
    c = new Float32Array(new ArrayBuffer(1024 * 4));
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; c[i] = Math.tanh(x * (key / 4)) / Math.tanh(key / 4); }
    curves.set(key, c);
  }
  return c;
}
export const makeNoise = (ctx: BaseAudioContext) => {
  const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
};

type Src = AudioScheduledSourceNode;
function done(env: VEnv, srcs: Src[], endT: number, tail: AudioNode, cleanup: (() => void)[] = []) {
  srcs.forEach((s) => s.stop(endT));
  env.onStart();
  srcs[0].onended = () => { tail.disconnect(); cleanup.forEach((f) => f()); env.onEnd(); };
}
function bindCutoff(ctl: TrackCtl, f: BiquadFilterNode, cl: (() => void)[], res = false) {
  ctl.cutoff.connect(f.detune); cl.push(() => ctl.cutoff.disconnect(f.detune));
  if (res) { ctl.res.connect(f.Q); cl.push(() => ctl.res.disconnect(f.Q)); }
}
function adsr(p: AudioParam, t: number, a: number, peak: number, d: number, s: number, dur: number, r: number): number {
  const sus = Math.max(0.0001, s);
  p.setValueAtTime(0.0001, t);
  p.linearRampToValueAtTime(peak, t + a);
  const dEnd = Math.min(t + a + d, t + Math.max(dur, a + 0.002));
  const lvl = Math.max(0.0001, peak * Math.pow(sus, d > 0 ? Math.min(1, (dEnd - t - a) / d) : 1));
  if (d > 0 && dEnd > t + a) p.exponentialRampToValueAtTime(lvl, dEnd);
  const rs = Math.max(dEnd, t + dur);
  p.setValueAtTime(lvl, rs);
  p.exponentialRampToValueAtTime(0.0001, rs + r);
  return rs + r + 0.02;
}
function osc(ctx: BaseAudioContext, type: OscillatorType, hz: number, t: number, detune = 0) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(hz, t); o.detune.value = detune; o.start(t); return o;
}
function noiseSrc(env: VEnv, t: number, loop = false) {
  const n = env.ctx.createBufferSource(); n.buffer = env.noise; n.loop = loop; n.start(t, Math.random() * 1.5); return n;
}
function filt(ctx: BaseAudioContext, type: BiquadFilterType, f: number, q = 0.7) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
const gain = (ctx: BaseAudioContext, v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };
/** gain that is silent and explicitly anchored at time t (a ramp with no prior event would otherwise start at scheduling time) */
const gz = (ctx: BaseAudioContext, t: number) => { const g = ctx.createGain(); g.gain.value = 0; g.gain.setValueAtTime(0, t); return g; };
function shaper(ctx: BaseAudioContext, k: number) { const s = ctx.createWaveShaper(); s.curve = curve(k); s.oversample = '2x'; return s; }

export function playVoice(kind: SynthKind, env: VEnv, dest: AudioNode, t: number, durSec: number, n: Note, ctl: TrackCtl, slideFrom?: number): number | undefined {
  const ctx = env.ctx; const v = Math.max(0.05, n.v); const hz = midiHz(n.p); const cl: (() => void)[] = [];
  const out = gain(ctx); out.connect(dest);
  switch (kind) {
    case 'kick': {
      const o = osc(ctx, 'sine', 190, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.085); o.frequency.exponentialRampToValueAtTime(42, t + 0.4);
      const g = gz(ctx, t); g.gain.linearRampToValueAtTime(v, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.46);
      const ws = shaper(ctx, 1.4 + env.dirt * 6); o.connect(g); g.connect(ws); ws.connect(out);
      const c = noiseSrc(env, t); const hp = filt(ctx, 'highpass', 1800); const cg = gz(ctx, t); cg.gain.setValueAtTime(v * 0.45, t); cg.gain.exponentialRampToValueAtTime(0.0005, t + 0.014);
      c.connect(hp); hp.connect(cg); cg.connect(out);
      done(env, [o, c], t + 0.5, out); break;
    }
    case 'sub': {
      const o = osc(ctx, 'sine', hz, t); const o2 = osc(ctx, 'triangle', hz, t); const g2 = gain(ctx, 0.22); o2.connect(g2);
      const g = gz(ctx, t); const e = adsr(g.gain, t, 0.006, v * 0.85, 0.05, 0.9, durSec, 0.07);
      const ws = shaper(ctx, 1.8); o.connect(g); g2.connect(g); g.connect(ws); ws.connect(out); done(env, [o, o2], e, out); break;
    }
    case 'rumble': {
      const o = osc(ctx, 'sawtooth', hz, t); const lp = filt(ctx, 'lowpass', 110, 0.8); const g = gz(ctx, t);
      const e = adsr(g.gain, t, 0.01, v * 0.9, 0.35, 0.2, durSec, 0.25); const ws = shaper(ctx, 3);
      o.connect(lp); lp.connect(g); g.connect(ws); ws.connect(out); done(env, [o], e, out); break;
    }
    case 'midbass': {
      const f = hz * 2; const o = osc(ctx, 'sawtooth', f, t); const o2 = osc(ctx, 'square', f, t, 7); const mix = gain(ctx, 0.6); o2.connect(mix);
      const lp = filt(ctx, 'lowpass', 380, 5); lp.frequency.setValueAtTime(380 * Math.pow(2, 1.6 * v), t); lp.frequency.exponentialRampToValueAtTime(380, t + 0.14); bindCutoff(ctl, lp, cl);
      const g = gz(ctx, t); const e = adsr(g.gain, t, 0.003, v * 0.6, 0.1, 0.6, durSec, 0.03); const ws = shaper(ctx, 1.2 + env.dirt * 3);
      o.connect(lp); mix.connect(lp); lp.connect(g); g.connect(ws); ws.connect(out); done(env, [o, o2], e, out, cl); break;
    }
    case 'acid': {
      const o = osc(ctx, 'sawtooth', hz, t);
      if (slideFrom) { o.frequency.setValueAtTime(slideFrom, t); o.frequency.exponentialRampToValueAtTime(hz, t + 0.06); }
      const lp = filt(ctx, 'lowpass', 320, 3); const acc = !!n.acc;
      if (slideFrom) lp.frequency.setValueAtTime(320 * 2.2, t);
      else { lp.frequency.setValueAtTime(320 * Math.pow(2, acc ? 3.4 : 2.2), t); lp.frequency.exponentialRampToValueAtTime(320, t + (acc ? 0.12 : 0.22)); }
      bindCutoff(ctl, lp, cl, true);
      const g = gz(ctx, t); const e = adsr(g.gain, t, 0.003, v * (acc ? 0.62 : 0.44), 0.08, 0.8, durSec + (slideFrom ? 0.02 : 0), 0.025); const ws = shaper(ctx, 2.5 + env.dirt * 2);
      o.connect(lp); lp.connect(g); g.connect(ws); ws.connect(out); done(env, [o], e, out, cl); break;
    }
    case 'stab': {
      const o = osc(ctx, 'sawtooth', hz, t); const o2 = osc(ctx, 'sawtooth', hz, t, 9);
      const lp = filt(ctx, 'lowpass', 700, 2); lp.frequency.setValueAtTime(700 * Math.pow(2, 2.6), t); lp.frequency.exponentialRampToValueAtTime(700, t + 0.16); bindCutoff(ctl, lp, cl);
      const g = gz(ctx, t); const e = adsr(g.gain, t, 0.002, v * 0.2, 0.16, 0.1, Math.min(durSec, 0.25), 0.08);
      o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(out); done(env, [o, o2], e, out, cl); break;
    }
    case 'lead': {
      const o = osc(ctx, 'sawtooth', hz, t); const o2 = osc(ctx, 'square', hz, t, 6); const g2 = gain(ctx, 0.5); o2.connect(g2);
      const lfo = osc(ctx, 'sine', 5.5, t); const ld = gain(ctx, 12); lfo.connect(ld); ld.connect(o.detune); ld.connect(o2.detune);
      const lp = filt(ctx, 'lowpass', 3200, 1); bindCutoff(ctl, lp, cl);
      const g = gz(ctx, t); const e = adsr(g.gain, t, 0.01, v * 0.26, 0.2, 0.7, durSec, 0.2);
      o.connect(lp); g2.connect(lp); lp.connect(g); g.connect(out); done(env, [o, o2, lfo], e, out, cl); break;
    }
    case 'arp': {
      const o = osc(ctx, 'square', hz, t);
      const lp = filt(ctx, 'lowpass', 900, 3); lp.frequency.setValueAtTime(900 * Math.pow(2, 2.5), t); lp.frequency.exponentialRampToValueAtTime(900, t + 0.1); bindCutoff(ctl, lp, cl);
      const g = gz(ctx, t); const e = adsr(g.gain, t, 0.001, v * 0.3, 0.12, 0.05, Math.min(durSec, 0.15), 0.05);
      o.connect(lp); lp.connect(g); g.connect(out); done(env, [o], e, out, cl); break;
    }
    case 'pad': {
      const os = [-14, 0, 14].map((d) => osc(ctx, 'sawtooth', hz, t, d));
      const lp = filt(ctx, 'lowpass', 700, 0.9); bindCutoff(ctl, lp, cl);
      const g = gz(ctx, t); const e = adsr(g.gain, t, Math.min(1.4, durSec * 0.35), v * 0.11, 0.01, 1, durSec, 1.2);
      os.forEach((o) => o.connect(lp)); lp.connect(g); g.connect(out); done(env, os, e, out, cl); break;
    }
    case 'dubchord': {
      const o = osc(ctx, 'sawtooth', hz, t); const o2 = osc(ctx, 'triangle', hz, t, 5);
      const lp = filt(ctx, 'lowpass', 600, 4); lp.frequency.setValueAtTime(600 * Math.pow(2, 3), t); lp.frequency.exponentialRampToValueAtTime(600, t + 0.45); bindCutoff(ctl, lp, cl);
      const g = gz(ctx, t); const e = adsr(g.gain, t, 0.004, v * 0.2, 0.4, 0.03, durSec, 0.25);
      o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(out); done(env, [o, o2], e, out, cl); break;
    }
    case 'drone': {
      const o = osc(ctx, 'sawtooth', hz, t); const o2 = osc(ctx, 'sawtooth', hz, t, 8);
      const lp = filt(ctx, 'lowpass', 220, 1.2); bindCutoff(ctl, lp, cl);
      const g = gz(ctx, t); const e = adsr(g.gain, t, Math.min(2, durSec * 0.3), v * 0.2, 0.01, 1, durSec, 1.5);
      o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(out); done(env, [o, o2], e, out, cl); break;
    }
    case 'noise': {
      const s = noiseSrc(env, t, true); const bp = filt(ctx, 'bandpass', 1200, 0.7); const hp = filt(ctx, 'highpass', 400);
      const lfo = osc(ctx, 'sine', 0.07, t); const ld = gain(ctx, 600); lfo.connect(ld); ld.connect(bp.frequency); bindCutoff(ctl, bp, cl);
      const g = gz(ctx, t); const e = adsr(g.gain, t, Math.min(2, durSec * 0.3), v * 0.12, 0.01, 1, durSec, 1.5);
      s.connect(bp); bp.connect(hp); hp.connect(g); g.connect(out); done(env, [s, lfo], e, out, cl); break;
    }
    case 'crackle': {
      const s = noiseSrc(env, t); const hp = filt(ctx, 'highpass', 3000); const g = gain(ctx, 0.0001);
      g.gain.setValueAtTime(v * 0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.006);
      s.connect(hp); hp.connect(g); g.connect(out); done(env, [s], t + 0.02, out); break;
    }
    case 'hat': case 'ohat': {
      const open = kind === 'ohat'; const s = noiseSrc(env, t); const hp = filt(ctx, 'highpass', 7200);
      const g = gz(ctx, t); g.gain.linearRampToValueAtTime(v * 0.35, t + 0.001); g.gain.exponentialRampToValueAtTime(0.0001, t + (open ? 0.24 : 0.05));
      s.connect(hp); hp.connect(g); g.connect(out); done(env, [s], t + (open ? 0.26 : 0.07), out); break;
    }
    case 'ride': {
      const fs = [385, 562, 749, 1155]; const os = fs.map((f) => osc(ctx, 'square', f, t));
      const bp = filt(ctx, 'bandpass', 9000, 0.5); const hp = filt(ctx, 'highpass', 6000); const g = gz(ctx, t);
      g.gain.linearRampToValueAtTime(v * 0.1, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      os.forEach((o) => o.connect(bp)); bp.connect(hp); hp.connect(g); g.connect(out); done(env, os, t + 0.62, out); break;
    }
    case 'shaker': {
      const s = noiseSrc(env, t); const bp = filt(ctx, 'bandpass', 7000, 0.9); const g = gz(ctx, t);
      g.gain.linearRampToValueAtTime(v * 0.3, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      s.connect(bp); bp.connect(g); g.connect(out); done(env, [s], t + 0.09, out); break;
    }
    case 'clap': {
      const s = noiseSrc(env, t); const bp = filt(ctx, 'bandpass', 1300, 1.3); const g = gz(ctx, t); const p = g.gain; const a = v * 0.7;
      p.setValueAtTime(0, t);
      for (let i = 0; i < 3; i++) { const ti = t + i * 0.011; p.setValueAtTime(a, ti); p.exponentialRampToValueAtTime(a * 0.12, ti + 0.009); }
      p.setValueAtTime(a, t + 0.033); p.exponentialRampToValueAtTime(0.0001, t + 0.22);
      s.connect(bp); bp.connect(g); g.connect(out); done(env, [s], t + 0.24, out); break;
    }
    case 'snare': {
      const o = osc(ctx, 'triangle', 190, t); o.frequency.exponentialRampToValueAtTime(120, t + 0.09);
      const g = gz(ctx, t); g.gain.linearRampToValueAtTime(v * 0.45, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      const s = noiseSrc(env, t); const hp = filt(ctx, 'highpass', 1500); const g2 = gz(ctx, t); g2.gain.linearRampToValueAtTime(v * 0.45, t + 0.002); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g); g.connect(out); s.connect(hp); hp.connect(g2); g2.connect(out); done(env, [o, s], t + 0.2, out); break;
    }
    case 'perc': case 'conga': case 'tom': {
      const k = kind === 'tom' ? 2 : kind === 'conga' ? 1.5 : 1.7; const dec = kind === 'tom' ? 0.3 : kind === 'conga' ? 0.22 : 0.13;
      const f = kind === 'conga' ? hz * 0.9 : hz;
      const o = osc(ctx, 'sine', f * k, t); o.frequency.exponentialRampToValueAtTime(f, t + (kind === 'tom' ? 0.08 : 0.03));
      const g = gz(ctx, t); g.gain.linearRampToValueAtTime(v * 0.5, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      const s = noiseSrc(env, t); const bp = filt(ctx, 'bandpass', f * 3, 2); const sg = gz(ctx, t); sg.gain.setValueAtTime(v * 0.25, t); sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.015);
      o.connect(g); g.connect(out); s.connect(bp); bp.connect(sg); sg.connect(out); done(env, [o, s], t + dec + 0.03, out); break;
    }
    case 'clang': {
      const car = osc(ctx, 'sine', hz * 3, t); const mod = osc(ctx, 'sine', hz * 3 * 1.414, t); const md = gain(ctx, hz * 9); mod.connect(md); md.connect(car.frequency);
      const hp = filt(ctx, 'highpass', 600); const g = gz(ctx, t); g.gain.linearRampToValueAtTime(v * 0.22, t + 0.001); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      const ws = shaper(ctx, 2 + env.dirt * 4); car.connect(hp); hp.connect(ws); ws.connect(g); g.connect(out); done(env, [car, mod], t + 0.34, out); break;
    }
    case 'riser': {
      const dur = n.d * env.stepDur; const s = noiseSrc(env, t, true); const bp = filt(ctx, 'bandpass', 400, 4);
      bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(9000, t + dur);
      const g = gz(ctx, t); g.gain.setValueAtTime(0.01, t); g.gain.exponentialRampToValueAtTime(v * 0.5, t + dur * 0.98); g.gain.linearRampToValueAtTime(0, t + dur + 0.04);
      const o = osc(ctx, 'sawtooth', 150, t); o.frequency.exponentialRampToValueAtTime(2000, t + dur); const lp = filt(ctx, 'lowpass', 3000); const og = gz(ctx, t);
      og.gain.setValueAtTime(0.001, t); og.gain.exponentialRampToValueAtTime(v * 0.1, t + dur * 0.98); og.gain.linearRampToValueAtTime(0, t + dur + 0.04);
      s.connect(bp); bp.connect(g); g.connect(out); o.connect(lp); lp.connect(og); og.connect(out); done(env, [s, o], t + dur + 0.06, out); break;
    }
    case 'impact': {
      const o = osc(ctx, 'sine', 150, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.7);
      const g = gz(ctx, t); g.gain.linearRampToValueAtTime(v * 0.95, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0005, t + 1.5);
      const s = noiseSrc(env, t); const lp = filt(ctx, 'lowpass', 900); const ng = gz(ctx, t); ng.gain.setValueAtTime(v * 0.35, t); ng.gain.exponentialRampToValueAtTime(0.0005, t + 0.45);
      const ws = shaper(ctx, 2); o.connect(g); g.connect(ws); ws.connect(out); s.connect(lp); lp.connect(ng); ng.connect(out); done(env, [o, s], t + 1.55, out); break;
    }
    case 'downlift': {
      const dur = n.d * env.stepDur; const s = noiseSrc(env, t, true); const bp = filt(ctx, 'bandpass', 7000, 2.5);
      bp.frequency.setValueAtTime(7000, t); bp.frequency.exponentialRampToValueAtTime(180, t + dur);
      const g = gz(ctx, t); g.gain.linearRampToValueAtTime(v * 0.4, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      const o = osc(ctx, 'sine', 200, t); o.frequency.exponentialRampToValueAtTime(32, t + dur * 0.6); const og = gz(ctx, t);
      og.gain.linearRampToValueAtTime(v * 0.35, t + 0.02); og.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.8);
      s.connect(bp); bp.connect(g); g.connect(out); o.connect(og); og.connect(out); done(env, [s, o], t + dur + 0.05, out); break;
    }
    case 'crash': {
      const s = noiseSrc(env, t, true); const hp = filt(ctx, 'highpass', n.p === 1 ? 3500 : 4500); const g = gz(ctx, t);
      if (n.p === 1) { const dur = n.d * env.stepDur; g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(v * 0.5, t + dur * 0.98); g.gain.linearRampToValueAtTime(0, t + dur + 0.02); s.connect(hp); hp.connect(g); g.connect(out); done(env, [s], t + dur + 0.04, out); }
      else { const bp = filt(ctx, 'peaking', 9000, 1); bp.gain.value = 6; g.gain.linearRampToValueAtTime(v * 0.45, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8); s.connect(hp); hp.connect(bp); bp.connect(g); g.connect(out); done(env, [s], t + 1.85, out); }
      break;
    }
  }
  return hz;
}
