import { useEffect, useMemo, useRef, useState } from 'react';
import { store, useApp } from '../store';
import type { Note } from '../engine/types';
import { SCALES, euclid, Rng, KEY_NAMES } from '../engine/theory';
import { mutate } from '../engine/composer';
import { Btn } from '../ui';
import { cn } from '../utils/cn';

const GUT = 38, RH = 12, VEL_H = 54;
const SINGLE = ['kick', 'hat', 'ohat', 'ride', 'shaker', 'clap', 'snare', 'clang', 'crackle', 'riser', 'impact', 'downlift', 'crash'];
type Tool = 'draw' | 'accent' | 'slide' | 'erase';

export function PianoRoll() {
  const app = useApp(); const sel = app.selection; const p = app.project;
  const found = useMemo(() => {
    if (sel.kind !== 'clip') return null;
    const t = p.tracks.find((x) => x.id === sel.track); const c = t?.clips.find((x) => x.id === sel.id);
    return t && c ? { t, c } : null;
  }, [sel, p.tracks]);
  const [zoom, setZoom] = useState(1); const [tool, setTool] = useState<Tool>('draw'); const [snap, setSnap] = useState(1);
  const [draft, setDraft] = useState<Note[] | null>(null);
  const [eu, setEu] = useState({ k: 5, n: 16, rot: 0, pitch: 60 });
  const cv = useRef<HTMLCanvasElement>(null);
  const lastD = useRef(1);

  const notes = draft ?? found?.c.notes ?? [];
  const single = found ? SINGLE.includes(found.t.synth) : false;
  const range = useMemo(() => {
    if (!found || single) return { lo: 0, hi: 0 };
    let lo = 127, hi = 0; for (const n of found.c.notes) { lo = Math.min(lo, n.p); hi = Math.max(hi, n.p); }
    if (hi < lo) { lo = 48; hi = 72; }
    lo -= 4; hi += 4; while (hi - lo < 23) { lo--; hi++; }
    return { lo: Math.max(0, lo), hi: Math.min(127, hi) };
  }, [found, single]);
  const rows = single ? 1 : range.hi - range.lo + 1; const loop = found?.c.loop ?? 16; const SW = 22 * zoom;
  const W = GUT + Math.max(loop * SW, 360); const noteH = single ? 30 : rows * RH; const H = noteH + VEL_H + 4;
  const scale = new Set(SCALES[p.params.scale].map((x) => (x + p.params.key) % 12));

  useEffect(() => {
    const c = cv.current; if (!c || !found) return; const dpr = window.devicePixelRatio || 1;
    c.width = W * dpr; c.height = H * dpr; c.style.width = W + 'px'; c.style.height = H + 'px';
    const g = c.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    g.fillStyle = '#0e1216'; g.fillRect(0, 0, W, H);
    for (let r = 0; r < rows; r++) {
      const pitch = range.hi - r; const y = r * RH;
      if (!single) { const pc = pitch % 12; g.fillStyle = [1, 3, 6, 8, 10].includes(pc) ? '#0b0e12' : '#11161b'; g.fillRect(GUT, y, W - GUT, RH); if (scale.has(pc)) { g.fillStyle = 'rgba(6,182,212,0.06)'; g.fillRect(GUT, y, W - GUT, RH); }
        g.fillStyle = [1, 3, 6, 8, 10].includes(pc) ? '#1a2027' : '#cfd6de'; g.fillRect(0, y, GUT - 2, RH - 1); if (pc === 0) { g.fillStyle = '#111'; g.font = '8px monospace'; g.fillText(`C${Math.floor(pitch / 12) - 1}`, 3, y + 9); } }
    }
    if (single) { g.fillStyle = '#11161b'; g.fillRect(GUT, 0, W - GUT, noteH); g.fillStyle = '#7b8794'; g.font = '9px Inter, sans-serif'; g.fillText('HIT', 6, 18); }
    const total = Math.ceil((W - GUT) / SW);
    for (let s = 0; s <= total; s++) {
      const x = GUT + s * SW; g.strokeStyle = s % 16 === 0 ? '#3a4656' : s % 4 === 0 ? '#27303b' : '#181e25'; g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); g.stroke();
    }
    if (loop * SW + GUT < W) { g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(GUT + loop * SW, 0, W, H); }
    g.fillStyle = '#12161b'; g.fillRect(GUT, noteH, W, 4);
    notes.forEach((n) => {
      const x = GUT + n.t * SW; const y = single ? 4 : (range.hi - n.p) * RH; const h = single ? noteH - 8 : RH - 1; const w = Math.max(4, n.d * SW - 1);
      g.globalAlpha = 0.35 + n.v * 0.65; g.fillStyle = found.t.color; g.beginPath(); g.roundRect(x, y, w, h, 2); g.fill(); g.globalAlpha = 1;
      if (n.acc) { g.fillStyle = '#f59e0b'; g.fillRect(x, y, w, 2.5); g.fillRect(x, y + h - 2.5, w, 2.5); }
      if (n.slide) { g.fillStyle = '#06b6d4'; g.beginPath(); g.moveTo(x, y + h); g.lineTo(x - 7, y + h); g.lineTo(x, y + 1); g.fill(); }
      g.fillStyle = found.t.color; g.fillRect(x, noteH + 4 + VEL_H * (1 - n.v), Math.max(2, 3), VEL_H * n.v);
      g.fillStyle = '#fff'; g.fillRect(x - 1, noteH + 4 + VEL_H * (1 - n.v) - 1, 5, 3);
    });
    g.fillStyle = '#7b8794'; g.font = '8px monospace'; g.fillText('VEL', 6, noteH + 16);
  }, [found, notes, W, H, rows, range, SW, single, loop, noteH, scale]);

  if (!found) return <div className="flex h-full items-center justify-center p-6 text-center text-[12px] text-slate-500">Select a clip on the timeline to edit its notes. Double-click an empty lane to create a clip.</div>;
  const { t, c } = found;

  const commit = (ns: Note[], label: string, key?: string) => { setDraft(null); store.dispatch({ type: 'SET_NOTES', clip: c.id, notes: [...ns].sort((a, b) => a.t - b.t) }, label, 'user', key); };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = cv.current!.getBoundingClientRect(); const x = e.clientX - r.left - GUT; const y = e.clientY - r.top; if (x < 0) return;
    const step = x / SW; const ns = notes.map((n) => ({ ...n }));
    if (y > noteH + 4) { // velocity lane
      let best = -1, bd = 1e9; ns.forEach((n, i) => { const d = Math.abs(n.t * SW + 2 - x); if (d < bd) { bd = d; best = i; } });
      if (best < 0 || bd > 12) return;
      const set = (cy: number) => { ns[best].v = Math.min(1, Math.max(0.05, 1 - (cy - r.top - noteH - 4) / VEL_H)); setDraft(ns.map((n) => ({ ...n }))); };
      set(e.clientY); const mv = (ev: PointerEvent) => set(ev.clientY);
      const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); commit(ns, 'Edit velocity', `vel:${c.id}`); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); return;
    }
    const pitch = single ? 60 : range.hi - Math.floor(y / RH);
    const hit = ns.findIndex((n) => step >= n.t - 0.05 && step <= n.t + Math.max(n.d, 0.5) && (single || n.p === pitch));
    if (hit >= 0) {
      if (tool === 'erase' || e.altKey || e.button === 2) { ns.splice(hit, 1); commit(ns, 'Delete note'); return; }
      if (tool === 'accent') { ns[hit].acc = !ns[hit].acc; if (ns[hit].acc) ns[hit].v = 1; commit(ns, 'Toggle accent'); return; }
      if (tool === 'slide') { ns[hit].slide = !ns[hit].slide; commit(ns, 'Toggle slide'); return; }
      const n = ns[hit]; const edge = step >= n.t + n.d - Math.min(0.5, n.d / 2); const o = { t: n.t, d: n.d, p: n.p }; const sx = e.clientX, sy = e.clientY;
      const mv = (ev: PointerEvent) => {
        const ds = Math.round((ev.clientX - sx) / SW / snap) * snap; const dp = single ? 0 : -Math.round((ev.clientY - sy) / RH);
        if (edge) n.d = Math.max(snap, o.d + ds); else { n.t = Math.min(loop - snap, Math.max(0, o.t + ds)); n.p = Math.min(127, Math.max(0, o.p + dp)); }
        setDraft(ns.map((q) => ({ ...q })));
      };
      const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); commit(ns, edge ? 'Resize note' : 'Move note', `note:${c.id}`); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); return;
    }
    if (tool !== 'draw') return;
    const ts = Math.min(loop - snap, Math.max(0, Math.floor(step / snap) * snap));
    ns.push({ t: ts, d: lastD.current, p: single ? (t.synth === 'kick' ? 36 : t.synth === 'crash' ? 0 : 60) : pitch, v: 0.8 });
    commit(ns, 'Add note');
  };

  const applyEu = () => {
    const pat = euclid(eu.k, eu.n, eu.rot); const ns: Note[] = [];
    pat.forEach((h, i) => { if (h) ns.push({ t: i, d: 0.8, p: eu.pitch, v: 0.8 }); });
    store.dispatch({ type: 'BATCH', cmds: [{ type: 'SET_CLIP', id: c.id, patch: { loop: eu.n, off: 0 } }, { type: 'SET_NOTES', clip: c.id, notes: ns }] }, `Euclidean E(${eu.k},${eu.n})`);
  };
  const num = (v: number, set: (n: number) => void, min: number, max: number, w = 'w-12') => (
    <input type="number" value={v} min={min} max={max} onChange={(e) => set(Math.min(max, Math.max(min, +e.target.value || 0)))} className={cn('h-6 rounded border border-line bg-elev px-1 text-center font-mono text-[11px]', w)} />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line px-2 py-1">
        <span className="mr-1 flex items-center gap-1 text-[11px] font-semibold"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: t.color }} />{t.name} <span className="font-normal text-slate-500">· {c.label}</span></span>
        {(['draw', 'accent', 'slide', 'erase'] as Tool[]).map((k) => <Btn key={k} small active={tool === k} onClick={() => setTool(k)} title={`${k} tool`}>{k === 'accent' ? 'Accent' : k === 'slide' ? 'Slide' : k === 'draw' ? 'Draw' : 'Erase'}</Btn>)}
        <select aria-label="Snap" value={snap} onChange={(e) => setSnap(+e.target.value)} className="h-6 text-[10px]"><option value={1}>1/16</option><option value={0.5}>1/32</option><option value={0.25}>1/64</option><option value={2}>1/8</option><option value={4}>1/4</option></select>
        <select aria-label="Note length" onChange={(e) => (lastD.current = +e.target.value)} defaultValue="1" className="h-6 text-[10px]"><option value="0.5">len ½</option><option value="1">len 1</option><option value="2">len 2</option><option value="4">len 4</option><option value="8">len 8</option></select>
        <label className="flex items-center gap-1 text-[10px] text-slate-400">Zoom<input aria-label="Piano roll zoom" type="range" className="!w-16" min={0.5} max={3} step={0.1} value={zoom} onChange={(e) => setZoom(+e.target.value)} /></label>
        <span className="ml-1 flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[10px] text-slate-400" title="Independent loop length in 16th-steps (polymetric)">Loop {num(c.loop, (n) => store.dispatch({ type: 'SET_CLIP', id: c.id, patch: { loop: n } }, 'Clip loop length', 'user', `loop:${c.id}`), 1, 128)} steps</span>
        <span className="flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[10px] text-slate-400">Euclid k{num(eu.k, (k) => setEu({ ...eu, k }), 1, 32, 'w-10')} n{num(eu.n, (n) => setEu({ ...eu, n }), 2, 64, 'w-10')} rot{num(eu.rot, (rot) => setEu({ ...eu, rot }), 0, 63, 'w-10')} {!single && <>♪{num(eu.pitch, (pitch) => setEu({ ...eu, pitch }), 0, 127, 'w-11')}</>}<Btn small tone="amber" onClick={applyEu}>Apply</Btn></span>
        <Btn small onClick={() => commit(notes.map((n) => ({ ...n, t: Math.round(n.t), micro: 0 })), 'Quantize')}>Quantize</Btn>
        <Btn small onClick={() => { const r = new Rng(Date.now()); commit(notes.map((n) => ({ ...n, micro: +(r.range(-0.1, 0.1)).toFixed(3), v: Math.min(1, Math.max(0.1, n.v + r.range(-0.12, 0.08))) })), 'Humanize'); }}>Humanize</Btn>
        <Btn small onClick={() => commit(mutate(notes, c.loop, new Rng(Date.now()).pick(['oct', 'rot', 'acc', 'rest'] as const), new Rng(Date.now() + 1)), 'Mutate clip')}>Mutate</Btn>
        <Btn small tone="ghost" onClick={() => commit([], 'Clear notes')}>Clear</Btn>
        <span className="ml-auto font-mono text-[10px] text-slate-500">{notes.length} notes · {KEY_NAMES[p.params.key]} {p.params.scale}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-[#0e1216]"><canvas ref={cv} onPointerDown={onDown} onContextMenu={(e) => e.preventDefault()} className="block" style={{ touchAction: 'none' }} /></div>
      <div className="shrink-0 border-t border-line px-2 py-0.5 text-[10px] text-slate-500">Accent = amber caps (boosts filter env + level) · Slide = cyan wedge (glide <b>into</b> note, constant-time portamento) · velocity stalks below</div>
    </div>
  );
}
