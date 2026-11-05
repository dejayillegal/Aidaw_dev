import { useEffect, useRef, useState } from 'react';
import { engine, store, useApp } from '../store';
import { KEY_NAMES, SCALE_NAMES } from '../engine/theory';
import { Btn, Badge } from '../ui';
import { seek } from '../actions';
import { cn } from '../utils/cn';
import { STYLES } from '../engine/styles';

const SRC_COLOR = { user: '#94a3b8', ai: '#06b6d4', composer: '#f59e0b' } as const;

export function TopBar({ onExport, compact }: { onExport: () => void; compact: boolean }) {
  const app = useApp(); const p = app.project; const [hist, setHist] = useState(false);
  const pos = useRef<HTMLSpanElement>(null); const stat = useRef<HTMLSpanElement>(null); const peak = useRef<HTMLDivElement>(null); const pk = useRef<HTMLSpanElement>(null);
  const buf = useRef(new Float32Array(1024)); const hold = useRef(0);

  useEffect(() => {
    let raf = 0;
    const f = () => {
      const st = engine.playing ? engine.getStep() : -1; const bar = st >= 0 ? st / 16 : store.get().cursorBar;
      if (pos.current) pos.current.textContent = `${String(Math.floor(bar) + 1).padStart(3, '0')}.${Math.floor((bar % 1) * 4) + 1}.${Math.floor(((bar * 4) % 1) * 4) + 1}`;
      const a = engine.graph?.analyser;
      let m = 0; if (a) { a.getFloatTimeDomainData(buf.current); for (let i = 0; i < 1024; i++) m = Math.max(m, Math.abs(buf.current[i])); }
      hold.current = Math.max(m, hold.current * 0.92); const db = 20 * Math.log10(hold.current + 1e-6);
      if (peak.current) peak.current.style.width = `${Math.max(0, Math.min(100, ((db + 48) / 48) * 100))}%`;
      if (pk.current) pk.current.textContent = hold.current > 0.001 ? db.toFixed(1) : '-∞';
      if (stat.current) stat.current.textContent = `${engine.state}${engine.ctx ? ` · ${engine.ctx.sampleRate / 1000}k` : ''} · ${engine.voices} v · sched ${engine.schedMs.toFixed(1)}ms · lat ${(engine.latency * 1000).toFixed(0)}ms`;
      raf = requestAnimationFrame(f);
    };
    f(); return () => cancelAnimationFrame(raf);
  }, []);

  const canUndo = app.cursor > 0, canRedo = app.cursor < app.entries.length;
  return (
    <header className="relative z-50 flex h-12 shrink-0 items-center gap-2 border-b border-line bg-panel px-2">
      <div className="flex items-center gap-1.5 pr-1"><div className="flex h-7 w-7 items-center justify-center rounded-md bg-amber font-black text-black">Ai</div>{!compact && <div className="leading-tight"><div className="text-[12px] font-bold tracking-wide">AIDAW</div><div className="max-w-[130px] truncate text-[9px] text-slate-500" title={p.name}>{p.name}</div></div>}</div>
      <div className="flex items-center gap-1">
        <Btn tone={app.playing ? 'amber' : 'default'} className="!h-9 w-10 text-[14px]" title="Play / Stop (Space)" onClick={() => store.toggle()}>{app.playing ? '■' : '▶'}</Btn>
        <Btn className="!h-9" title="Return to start" onClick={() => seek(0)}>⏮</Btn>
        <Btn className="!h-9" active={p.loop.on} title="Loop (select a section first, or toggle)" onClick={() => { const s = app.selection.kind === 'section' ? p.sections.find((x) => x.id === (app.selection as { id: string }).id) : undefined; if (p.loop.on) store.dispatch({ type: 'SET_LOOP', loop: { ...p.loop, on: false } }, 'Loop off'); else if (s) store.dispatch({ type: 'SET_LOOP', loop: { on: true, a: s.start, b: s.start + s.bars } }, 'Loop section'); else store.say('ai', 'Select a section flag first, then press Loop.'); }}>⟳</Btn>
      </div>
      <div className="rounded-md border border-line bg-[#0b0e12] px-2 py-0.5 text-center"><div className="text-[8px] uppercase tracking-widest text-slate-500">bar.beat.16th</div><span ref={pos} className="font-mono text-[15px] font-semibold text-amber">001.1.1</span></div>
      {!compact && (
        <>
          <div className="rounded-md border border-line bg-[#0b0e12] px-2 py-0.5"><div className="text-[8px] uppercase tracking-widest text-slate-500">BPM</div>
            <input aria-label="BPM" type="number" min={80} max={180} value={p.params.bpm} onChange={(e) => store.dispatch({ type: 'SET_PARAMS', patch: { bpm: Math.min(180, Math.max(80, +e.target.value || 120)) } }, 'Tempo', 'user', 'bpm')} className="w-12 bg-transparent font-mono text-[13px] font-semibold outline-none" /></div>
          <div className="hidden rounded-md border border-line bg-[#0b0e12] px-2 py-0.5 lg:block"><div className="text-[8px] uppercase tracking-widest text-slate-500">Key / Scale</div><span className="text-[11px] font-semibold">{KEY_NAMES[p.params.key]} {SCALE_NAMES[p.params.scale]}</span></div>
          <div className="hidden rounded-md border border-line bg-[#0b0e12] px-2 py-0.5 xl:block"><div className="text-[8px] uppercase tracking-widest text-slate-500">Style</div><span className="text-[11px] font-semibold">{STYLES[p.params.style].name}</span></div>
        </>
      )}
      <div className="ml-auto flex items-center gap-2">
        {!compact && (
          <div className="hidden min-w-[200px] md:block" title="Audio engine health (callback load via scheduler time; XRun counting is not exposed by Web Audio)">
            <div className="flex justify-between text-[8px] uppercase tracking-widest text-slate-500"><span>Engine</span><span>{engine.workletOk ? 'worklet sc' : engine.ctx ? 'fallback sc' : 'idle'}</span></div>
            <span ref={stat} className="block whitespace-nowrap font-mono text-[9px] text-slate-400">idle</span>
          </div>
        )}
        <div className="w-20" title="Master peak (dBFS)"><div className="flex justify-between text-[8px] uppercase tracking-widest text-slate-500"><span>Peak</span><span ref={pk} className="font-mono text-slate-300">-∞</span></div><div className="h-2 overflow-hidden rounded-full bg-[#0b0e12]"><div ref={peak} className="h-full rounded-full" style={{ width: 0, background: 'linear-gradient(to right,#22c55e 65%,#f59e0b 88%,#ef4444)' }} /></div></div>
        <Btn disabled={!canUndo} title="Undo (Ctrl+Z)" onClick={() => store.undo()}>↶</Btn>
        <Btn disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" onClick={() => store.redo()}>↷</Btn>
        <div className="relative">
          <Btn active={hist} title="Undo history" onClick={() => setHist(!hist)}>History{app.entries.length ? ` ${app.cursor}/${app.entries.length}` : ''}</Btn>
          {hist && (
            <div className="absolute right-0 top-10 z-50 max-h-80 w-72 overflow-y-auto rounded-md border border-line bg-panel p-1 shadow-2xl">
              <button onClick={() => { store.jump(0); setHist(false); }} className={cn('flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[11px] hover:bg-elev', app.cursor === 0 && 'bg-elev')} disabled={!app.entries.length}><span className="text-slate-500">○</span> Initial state</button>
              {app.entries.map((e, i) => (
                <button key={e.id} onClick={() => { store.jump(i + 1); setHist(false); }} className={cn('flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[11px] hover:bg-elev', app.cursor === i + 1 && 'bg-elev ring-1 ring-amber', i >= app.cursor && 'opacity-40')}>
                  <Badge color={SRC_COLOR[e.source]}>{e.source === 'ai' ? 'AI' : e.source === 'composer' ? 'COMP' : 'USER'}</Badge><span className="min-w-0 flex-1 truncate">{e.label}</span>
                </button>
              ))}
              {!app.entries.length && <div className="p-2 text-[11px] text-slate-500">No edits yet.</div>}
            </div>
          )}
        </div>
        <Btn tone="amber" title="Export WAV (offline render)" onClick={onExport}>Export</Btn>
      </div>
    </header>
  );
}
