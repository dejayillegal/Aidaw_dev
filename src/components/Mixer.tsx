import { useEffect, useRef } from 'react';
import { engine, store, useApp } from '../store';
import type { ScGroup } from '../engine/types';
import { cn } from '../utils/cn';

const buf = new Float32Array(256);
function peakOf(a?: AnalyserNode) {
  if (!a) return 0; a.getFloatTimeDomainData(buf); let m = 0; for (let i = 0; i < buf.length; i++) { const v = Math.abs(buf[i]); if (v > m) m = v; } return m;
}
const toPct = (lin: number) => Math.max(0, Math.min(100, ((20 * Math.log10(lin + 1e-6) + 54) / 54) * 100));

export function Mixer() {
  const app = useApp(); const p = app.project; const refs = useRef<Record<string, HTMLDivElement | null>>({}); const mref = useRef<HTMLDivElement | null>(null); const mtxt = useRef<HTMLSpanElement | null>(null);
  const hold = useRef<Record<string, number>>({});
  useEffect(() => {
    let raf = 0;
    const f = () => {
      const g = engine.graph;
      for (const t of p.tracks) { const el = refs.current[t.id]; if (!el) continue; const v = g ? peakOf(g.strips.get(t.id)?.analyser) : 0; const prev = hold.current[t.id] ?? 0; const cur = Math.max(v, prev * 0.88); hold.current[t.id] = cur; el.style.height = toPct(cur) + '%'; }
      const mp = g ? peakOf(g.analyser) : 0; const mh = Math.max(mp, (hold.current.master ?? 0) * 0.9); hold.current.master = mh;
      if (mref.current) mref.current.style.height = toPct(mh) + '%'; if (mtxt.current) mtxt.current.textContent = mh > 0.0005 ? `${(20 * Math.log10(mh)).toFixed(1)}` : '-∞';
      raf = requestAnimationFrame(f);
    };
    f(); return () => cancelAnimationFrame(raf);
  }, [p.tracks]);
  const sel = app.selection;
  return (
    <div className="flex h-full min-h-0 gap-px overflow-x-auto bg-bg p-1.5">
      {p.tracks.map((t) => {
        const isSel = (sel.kind === 'track' && sel.id === t.id) || (sel.kind === 'clip' && sel.track === t.id);
        const upd = (patch: Parameters<typeof store.dispatch>[0] extends infer C ? C extends { type: 'SET_TRACK'; patch: infer P } ? P : never : never, key: string) => store.dispatch({ type: 'SET_TRACK', id: t.id, patch }, `Mixer · ${t.name}`, 'user', `${key}:${t.id}`);
        return (
          <div key={t.id} onClick={() => store.select({ kind: 'track', id: t.id })} className={cn('flex w-[62px] shrink-0 flex-col items-stretch gap-1 rounded-md border bg-panel p-1', isSel ? 'border-amber' : 'border-line')}>
            <div className="h-1 rounded-full" style={{ background: t.color }} />
            <div className="h-7 overflow-hidden text-center text-[9px] leading-tight text-slate-300" title={t.name}>{t.name}</div>
            <div className="flex min-h-0 flex-1 justify-center gap-1.5">
              <div className="relative w-2 overflow-hidden rounded-sm bg-[#0b0e12]"><div ref={(el) => { refs.current[t.id] = el; }} className="absolute bottom-0 w-full" style={{ height: 0, background: 'linear-gradient(to top,#22c55e 60%,#f59e0b 85%,#ef4444)' }} /></div>
              <input aria-label={`${t.name} volume`} className="vert" type="range" min={0} max={1.4} step={0.01} value={t.vol} onChange={(e) => upd({ vol: +e.target.value }, 'vol')} />
            </div>
            <div className="text-center font-mono text-[9px] text-slate-400">{t.vol > 0.001 ? (20 * Math.log10(t.vol)).toFixed(1) : '-∞'}</div>
            <input aria-label={`${t.name} pan`} type="range" min={-1} max={1} step={0.02} value={t.pan} onChange={(e) => upd({ pan: +e.target.value }, 'pan')} title={`pan ${t.pan.toFixed(2)}`} />
            <input aria-label={`${t.name} reverb send`} type="range" className="cy" min={0} max={1} step={0.01} value={t.rev} onChange={(e) => upd({ rev: +e.target.value }, 'rev')} title={`reverb send ${t.rev.toFixed(2)}`} />
            <select aria-label={`${t.name} sidechain`} value={t.sc ?? ''} onClick={(e) => e.stopPropagation()} onChange={(e) => upd({ sc: (e.target.value || null) as ScGroup | null }, 'sc')} className="h-5 !px-0 text-[9px]"><option value="">no sc</option><option value="bass">sc·bass</option><option value="harm">sc·harm</option><option value="fx">sc·fx</option></select>
            <div className="flex gap-0.5">
              <button aria-label={`mute ${t.name}`} onClick={(e) => { e.stopPropagation(); upd({ mute: !t.mute }, 'mute'); }} className={cn('h-5 flex-1 rounded-sm text-[9px] font-bold', t.mute ? 'bg-red-500 text-white' : 'bg-[#232b35] text-slate-400')}>M</button>
              <button aria-label={`solo ${t.name}`} onClick={(e) => { e.stopPropagation(); upd({ solo: !t.solo }, 'solo'); }} className={cn('h-5 flex-1 rounded-sm text-[9px] font-bold', t.solo ? 'bg-amber text-black' : 'bg-[#232b35] text-slate-400')}>S</button>
            </div>
          </div>
        );
      })}
      <div className="flex w-[70px] shrink-0 flex-col items-stretch gap-1 rounded-md border border-amber/50 bg-panel p-1" onClick={() => store.select({ kind: 'device', id: 'master' })}>
        <div className="h-1 rounded-full bg-amber" /><div className="h-7 text-center text-[10px] font-semibold text-amber">MASTER</div>
        <div className="flex min-h-0 flex-1 justify-center"><div className="relative w-3 overflow-hidden rounded-sm bg-[#0b0e12]"><div ref={mref} className="absolute bottom-0 w-full" style={{ height: 0, background: 'linear-gradient(to top,#22c55e 60%,#f59e0b 85%,#ef4444)' }} /></div></div>
        <div className="text-center font-mono text-[9px] text-slate-300"><span ref={mtxt}>-∞</span> dBFS</div>
        <div className="text-center text-[8px] text-slate-500">limiter on</div>
      </div>
    </div>
  );
}
