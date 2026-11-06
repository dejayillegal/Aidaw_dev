// Dual-input sidechain compressor (AudioWorkletProcessor), shipped inline as a Blob module.
// Input 0 = target audio (bass/pads/FX). Input 1 = key (kick). Gain reduction is computed per-sample
// from the key's HPF-filtered envelope, with soft knee, attack/release smoothing in the dB domain.
export const SC_WORKLET_SRC = `
class SidechainComp extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    const k = 'k-rate';
    return [
      { name: 'thr', defaultValue: -26, minValue: -80, maxValue: 0, automationRate: k },
      { name: 'ratio', defaultValue: 6, minValue: 1, maxValue: 20, automationRate: k },
      { name: 'atk', defaultValue: 1, minValue: 0.05, maxValue: 200, automationRate: k },
      { name: 'rel', defaultValue: 170, minValue: 5, maxValue: 2000, automationRate: k },
      { name: 'hpf', defaultValue: 60, minValue: 10, maxValue: 1000, automationRate: k },
      { name: 'mix', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: k },
      { name: 'knee', defaultValue: 6, minValue: 0, maxValue: 30, automationRate: k }
    ];
  }
  constructor(options) {
    super();
    this.metering = options?.processorOptions?.metering !== false;
    this.active = true;
    this.port.onmessage = e => { if (e.data === 'dispose') this.active = false; };
    this.hxChannels = new Float64Array(32); this.hyChannels = new Float64Array(32);
    this.env = 0; this.gr = 0; this.hx = 0; this.hy = 0; this.q = 0; this.maxGr = 0; this.maxKey = -120;
  }
  process(inputs, outputs, p) {
    if (!this.active) return false;
    const inp = inputs[0], key = inputs[1], out = outputs[0];
    const N = out[0].length, sr = sampleRate;
    const thr = p.thr[0], ratio = p.ratio[0], atk = p.atk[0], rel = p.rel[0], hpf = p.hpf[0], mix = p.mix[0], knee = Math.max(0.01, p.knee[0]);
    const atkC = Math.exp(-1 / (sr * atk * 0.001)), relC = Math.exp(-1 / (sr * rel * 0.001));
    const detRel = Math.exp(-1 / (sr * 0.012));
    const rc = 1 / (2 * Math.PI * hpf), alpha = rc / (rc + 1 / sr);
    const nk = key ? key.length : 0, ni = inp ? inp.length : 0;
    for (let i = 0; i < N; i++) {
      let lv = 0;
      for (let c = 0; c < nk && c < 32; c++) {
        const x = key[c][i];
        const y = alpha * (this.hyChannels[c] + x - this.hxChannels[c]);
        this.hxChannels[c] = x; this.hyChannels[c] = y;
        lv = Math.max(lv, Math.abs(y));
      }
      this.env = lv > this.env ? lv : this.env * detRel;
      const db = 20 * Math.log10(this.env + 1e-9);
      const over = db - thr; let red = 0;
      if (2 * over < -knee) red = 0;
      else if (2 * Math.abs(over) <= knee) red = (1 - 1 / ratio) * Math.pow(over + knee / 2, 2) / (2 * knee);
      else red = (1 - 1 / ratio) * over;
      const c = red > this.gr ? atkC : relC;
      this.gr = c * this.gr + (1 - c) * red;
      const g = Math.pow(10, -this.gr / 20);
      const gm = 1 - mix * (1 - g);
      for (let ch = 0; ch < out.length; ch++) {
        const s = ni ? inp[ch % ni][i] : 0;
        out[ch][i] = s * gm;
      }
      const effectiveGr = -20 * Math.log10(Math.max(1e-9, gm));
      if (effectiveGr > this.maxGr) this.maxGr = effectiveGr;
      if (db > this.maxKey) this.maxKey = db;
    }
    if (this.metering && ++this.q >= 6) {
      this.port.postMessage({ gr: this.maxGr, key: this.maxKey });
      this.q = 0; this.maxGr = 0; this.maxKey = -120;
    }
    return true;
  }
}
registerProcessor('sc-comp', SidechainComp);
`;
