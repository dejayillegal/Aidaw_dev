import { useEffect, useRef } from 'react';
import { engine, store, useApp } from '../store';
import type { ScGroup } from '../engine/types';
import { Slider, Badge } from '../ui';
import { Btn } from '../ui';

const NAMES: Record<ScGroup, string> = { bass: 'Bass bus · Sub / Rumble / Rolling bass', harm: 'Harmony bus · Pads / Stabs / Drones', fx: 'FX bus · Reverb return / Textures' };

function gr(inDb: number, thr: number, ratio: number, knee: number) {
  const o = inDb - thr; const k = Math.max(0.01, knee);
  if (2 * o < -k) return 0; if (2 * Math.abs(o) <= k) return (1 - 1 / ratio) * Math.pow(o + k / 2, 2) / (2 * k); return (1 - 1 / ratio) * o;
}

export function SidechainPanel({ group }: { group: ScGroup }) {
  const app = useApp(); const p = app.project; const c = p.sc[group];
  const curve = useRef<HTMLCanvasElement>(null); const wave = useRef<HTMLCanvasElement>(null); const bar = useRef<HTMLDivElement>(null); const txt = useRef<HTMLSpanElement>(null);
  const targets = p.tracks.filter((t) => t.sc === group);
  const set = (patch: Partial<typeof c>) => store.dispatch({ type: 'SET_SC', group, patch }, `Sidechain ${group}`, 'user', `sc:${group}`);

  useEffect(() => {
    const cv = curve.current; if (!cv) return; const g = cv.getContext('2d')!; const W = cv.width, H = cv.height;
    g.fillStyle = '#0e1216'; g.fillRect(0, 0, W, H); g.strokeStyle = '#1e2630';
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo((i * W) / 4, 0); g.lineTo((i * W) / 4, H); g.moveTo(0, (i * H) / 4); g.lineTo(W, (i * H) / 4); g.stroke(); }
    const X = (db: number) => ((db + 60) / 60) * W; const Y = (db: number) => H - ((db + 60) / 60) * H;
    g.strokeStyle = '#334155'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(0, H); g.lineTo(W, 0); g.stroke(); g.setLineDash([]);
    g.strokeStyle = '#06b6d4'; g.lineWidth = 2; g.beginPath();
    for (let x = 0; x <= W; x += 2) { const i = (x / W) * 60 - 60; const o = i - gr(i, c.thr, c.ratio, c.knee); if (x === 0) g.moveTo(x, Y(o)); else g.lineTo(x, Y(o)); }
    g.stroke(); g.fillStyle = '#f59e0b'; g.fillRect(X(c.thr) - 1, 0, 2, H);
  }, [c.thr, c.ratio, c.knee]);

  useEffect(() => {
    let raf = 0;
    const f = () => {
      const h = engine.graph?.hist[group] ?? []; const cv = wave.current;
      if (cv) {
        const g = cv.getContext('2d')!; const W = cv.width, H = cv.height; g.fillStyle = '#0e1216'; g.fillRect(0, 0, W, H);
        g.strokeStyle = '#1e2630'; g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
        const n = Math.min(h.length, 300); const dx = W / 300;
        for (let i = 0; i < n; i++) {
          const e = h[h.length - n + i]; const x = W - (n - i) * dx;
          const kh = Math.max(0, (e.key + 60) / 60) * (H / 2); g.fillStyle = 'rgba(6,182,212,0.55)'; g.fillRect(x, H / 2 - kh, dx + 0.5, kh);
          const gh = Math.min(1, e.gr / 24) * (H / 2); g.fillStyle = 'rgba(245,158,11,0.9)'; g.fillRect(x, H / 2, dx + 0.5, gh);
        }
        const last = h[h.length - 1]; const grv = last ? last.gr : 0;
        if (bar.current) bar.current.style.height = `${Math.min(100, (grv / 24) * 100)}%`;
        if (txt.current) txt.current.textContent = engine.playing ? `−${grv.toFixed(1)} dB` : '— dB';
      }
      raf = requestAnimationFrame(f);
    };
    f(); return () => cancelAnimationFrame(raf);
  }, [group]);

  return (
    <div className="space-y-2.5 p-3">
      <div className="flex items-center gap-2"><span className="text-[12px] font-semibold text-cyan">Sidechain Compressor</span>
        <Badge color={engine.workletOk || !engine.ctx ? '#06b6d4' : '#f59e0b'}>{engine.ctx ? (engine.workletOk ? 'AudioWorklet · true key input' : 'Fallback · scheduled envelope') : 'Worklet (on play)'}</Badge></div>
      <div className="text-[11px] text-slate-400">{NAMES[group]}</div>
      <div className="flex gap-1 text-[10px]">{(['bass', 'harm', 'fx'] as ScGroup[]).map((g) => <Btn key={g} small active={g === group} onClick={() => store.select({ kind: 'device', id: g })}>{g}</Btn>)}
        <Btn small active={p.scOn} tone={p.scOn ? 'cyan' : 'default'} onClick={() => store.dispatch({ type: 'SET_SC_ON', on: !p.scOn }, 'Sidechain on/off')}>{p.scOn ? 'ON' : 'OFF'}</Btn></div>
      <div className="grid grid-cols-[1fr_28px] gap-2">
        <div><div className="mb-0.5 text-[9px] uppercase tracking-wider text-slate-500">Kick key (cyan) · gain reduction (amber) — live</div>
          <canvas ref={wave} width={300} height={70} className="h-[70px] w-full rounded border border-line" /></div>
        <div className="flex flex-col items-center"><div className="relative h-[70px] w-3 overflow-hidden rounded-sm border border-line bg-[#0e1216]"><div ref={bar} className="absolute left-0 top-0 w-full bg-amber" style={{ height: 0 }} /></div><span ref={txt} className="mt-0.5 whitespace-nowrap font-mono text-[9px] text-amber">— dB</span></div>
      </div>
      <div className="grid grid-cols-[96px_1fr] gap-3">
        <div><div className="mb-0.5 text-[9px] uppercase tracking-wider text-slate-500">Transfer</div><canvas ref={curve} width={96} height={96} className="rounded border border-line" /></div>
        <div className="space-y-1.5">
          <Slider cy label="Threshold" value={c.thr} min={-60} max={0} step={0.5} onChange={(v) => set({ thr: v })} fmt={(v) => `${v.toFixed(1)} dB`} />
          <Slider cy label="Ratio" value={c.ratio} min={1} max={20} step={0.1} onChange={(v) => set({ ratio: v })} fmt={(v) => `${v.toFixed(1)}:1`} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        <Slider cy label="Attack" value={c.atk} min={0.1} max={100} step={0.1} onChange={(v) => set({ atk: v })} fmt={(v) => `${v.toFixed(1)} ms`} />
        <Slider cy label="Release" value={c.rel} min={10} max={1000} step={5} onChange={(v) => set({ rel: v })} fmt={(v) => `${Math.round(v)} ms`} />
        <Slider cy label="Key HPF" value={c.hpf} min={20} max={500} step={1} onChange={(v) => set({ hpf: v })} fmt={(v) => `${Math.round(v)} Hz`} />
        <Slider cy label="Knee" value={c.knee} min={0} max={24} step={0.5} onChange={(v) => set({ knee: v })} fmt={(v) => `${v.toFixed(1)} dB`} />
        <Slider cy label="Wet / Dry" value={c.mix} min={0} max={1} step={0.01} onChange={(v) => set({ mix: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
      </div>
      <div><div className="mb-1 text-[9px] uppercase tracking-wider text-slate-500">Ducked destinations (key = Kick)</div>
        <div className="flex flex-wrap gap-1">{targets.length ? targets.map((t) => <span key={t.id} className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: t.color + '33', color: t.color }}>{t.name}</span>) : <span className="text-[11px] text-slate-500">none — assign in a track's Inspect panel</span>}</div></div>
    </div>
  );
}
