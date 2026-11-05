import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { engine, store, useApp } from '../store';
import { totalBars, type Clip, type Project, type Track } from '../engine/types';
import { ROLE_COLORS } from '../engine/styles';
import { acceptProposal, newClipAt, rejectProposal, seek } from '../actions';
import { Btn } from '../ui';
import { cn } from '../utils/cn';

export const HEAD_W = 156;
const ROW = 24, FLAG_H = 20, CURVE_Y = 22, CURVE_H = 44, RULER_Y = 70, HDR_H = 90;

interface ClipDrag { clip: string; track: string; mode: 'move' | 'resize'; x0: number; start: number; len: number; cur: { start: number; len: number }; moved: boolean }

function drawNotes(g: CanvasRenderingContext2D, c: Clip, x0: number, y0: number, h: number, ppb: number) {
  const ns = c.notes; if (!ns.length) return;
  let lo = 127, hi = 0; for (const n of ns) { if (n.p < lo) lo = n.p; if (n.p > hi) hi = n.p; }
  const span = Math.max(1, hi - lo); const sw = ppb / 16; const ce = c.len * 16;
  const reps = Math.ceil((ce + c.off) / c.loop);
  for (let r = 0; r <= reps; r++) for (const n of ns) {
    const rel = r * c.loop + n.t - c.off; if (rel < 0 || rel >= ce) continue;
    const y = hi === lo ? y0 + h / 2 - 1 : y0 + h - 3 - ((n.p - lo) / span) * (h - 5);
    g.fillRect(x0 + rel * sw, y, Math.max(1, Math.min(n.d, c.loop) * sw), 2);
  }
}

export function Timeline({ onOpenClip }: { onOpenClip?: () => void }) {
  const app = useApp();
  const view: Project = store.viewProject();
  const prev = store.preview();
  const [ppb, setPpb] = useState(14);
  const [showAuto, setShowAuto] = useState(true);
  const [follow, setFollow] = useState(true);
  const [drag, setDrag] = useState<ClipDrag | null>(null);
  const [eDrag, setEDrag] = useState<{ id: string; e: number } | null>(null);
  const hdrRef = useRef<HTMLCanvasElement>(null); const bodyRef = useRef<HTMLCanvasElement>(null);
  const scRef = useRef<HTMLDivElement>(null); const phRef = useRef<HTMLDivElement>(null);
  const bars = Math.max(32, totalBars(view) + 4); const W = bars * ppb; const rows = view.tracks.length + 1; const H = rows * ROW;
  const sel = app.selection;
  const locked = !!prev;

  const trackOf = useMemo(() => new Map(view.tracks.map((t, i) => [t.id, i])), [view.tracks]);

  // ───── header (macro sections, energy curve, ruler)
  useEffect(() => {
    const cv = hdrRef.current; if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 16000 / W); cv.width = W * dpr; cv.height = HDR_H * dpr; cv.style.width = W + 'px'; cv.style.height = HDR_H + 'px';
    const g = cv.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, HDR_H);
    g.fillStyle = '#0f1318'; g.fillRect(0, 0, W, HDR_H);
    // curve area
    const Y = (e: number) => CURVE_Y + CURVE_H - e * (CURVE_H - 4) - 2;
    g.strokeStyle = '#1b222a'; g.lineWidth = 1;
    for (const lv of [0.25, 0.5, 0.75]) { g.beginPath(); g.moveTo(0, Y(lv) + 0.5); g.lineTo(W, Y(lv) + 0.5); g.stroke(); }
    const secs = view.sections; g.beginPath();
    secs.forEach((s, i) => {
      const e = eDrag?.id === s.id ? eDrag.e : s.energy; const x0 = s.start * ppb, x1 = (s.start + s.bars) * ppb;
      if (i === 0) g.moveTo(x0, CURVE_Y + CURVE_H); g.lineTo(x0, Y(e)); g.lineTo(x1, Y(e));
    });
    if (secs.length) { const l = secs[secs.length - 1]; g.lineTo((l.start + l.bars) * ppb, CURVE_Y + CURVE_H); }
    g.closePath(); const grad = g.createLinearGradient(0, CURVE_Y, 0, CURVE_Y + CURVE_H); grad.addColorStop(0, 'rgba(245,158,11,0.40)'); grad.addColorStop(1, 'rgba(245,158,11,0.03)');
    g.fillStyle = grad; g.fill();
    g.beginPath(); secs.forEach((s, i) => { const e = eDrag?.id === s.id ? eDrag.e : s.energy; const x0 = s.start * ppb, x1 = (s.start + s.bars) * ppb; if (i === 0) g.moveTo(x0, Y(e)); else g.lineTo(x0, Y(e)); g.lineTo(x1, Y(e)); });
    g.strokeStyle = '#f59e0b'; g.lineWidth = 1.6; g.stroke();
    // flags
    g.font = '600 10px Inter, system-ui, sans-serif'; g.textBaseline = 'middle';
    for (const s of secs) {
      const x = s.start * ppb, w = s.bars * ppb; const col = ROLE_COLORS[s.role]; const isSel = sel.kind === 'section' && sel.id === s.id;
      g.fillStyle = col + (isSel ? 'ee' : '99'); g.fillRect(x + 1, 2, w - 2, FLAG_H - 3);
      if (isSel) { g.strokeStyle = '#fff'; g.lineWidth = 1.2; g.strokeRect(x + 1.5, 2.5, w - 3, FLAG_H - 4); }
      g.fillStyle = '#fff'; g.save(); g.beginPath(); g.rect(x + 3, 0, w - 6, FLAG_H); g.clip();
      g.fillText(`${s.lock ? '🔒 ' : ''}${s.name}  ${s.bars}b`, x + 6, FLAG_H / 2 + 0.5); g.restore();
      g.fillStyle = '#e5e7eb'; g.font = '9px ui-monospace, monospace'; g.fillText(s.energy.toFixed(2), x + 6, CURVE_Y + 8); g.font = '600 10px Inter, system-ui, sans-serif';
    }
    // ruler
    const step = ppb < 10 ? 8 : ppb < 20 ? 4 : ppb < 40 ? 2 : 1;
    g.fillStyle = '#151a20'; g.fillRect(0, RULER_Y, W, HDR_H - RULER_Y);
    g.font = '9px ui-monospace, monospace'; g.fillStyle = '#7b8794'; g.strokeStyle = '#2a3441';
    for (let b = 0; b <= bars; b += step) { const x = Math.round(b * ppb) + 0.5; g.beginPath(); g.moveTo(x, RULER_Y + 8); g.lineTo(x, HDR_H); g.stroke(); g.fillText(String(b + 1), x + 3, RULER_Y + 8); }
    if (view.loop.on) { g.fillStyle = 'rgba(6,182,212,0.35)'; g.fillRect(view.loop.a * ppb, RULER_Y, (view.loop.b - view.loop.a) * ppb, HDR_H - RULER_Y); }
    // atoms markers on ruler: transitions
    const atoms = view.tracks.filter((t) => t.group === 'Transition');
    g.fillStyle = '#ec4899'; for (const t of atoms) for (const c of t.clips) if (t.synth === 'impact' || (t.synth === 'crash' && c.label === 'Crash')) g.fillRect(c.start * ppb - 1, RULER_Y + 1, 2, 7);
  }, [view, ppb, sel, eDrag, bars, W]);

  // ───── body (tracks + clips + automation + ghost diff)
  useEffect(() => {
    const cv = bodyRef.current; if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 16000 / W); cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const g = cv.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    for (let i = 0; i < rows; i++) { g.fillStyle = i % 2 ? '#0e1216' : '#10151a'; g.fillRect(0, i * ROW, W, ROW); }
    for (const s of view.sections) {
      const isSel = sel.kind === 'section' && sel.id === s.id;
      g.fillStyle = ROLE_COLORS[s.role] + (isSel ? '26' : '0d'); g.fillRect(s.start * ppb, 0, s.bars * ppb, H);
    }
    for (let b = 0; b <= bars; b++) {
      const strong = b % 16 === 0, mid = b % 4 === 0; if (!strong && !mid && ppb < 10) continue;
      g.strokeStyle = strong ? '#2f3a48' : mid ? '#1e2630' : '#171d24'; g.lineWidth = 1; const x = Math.round(b * ppb) + 0.5; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
    }
    for (const s of view.sections) { g.strokeStyle = ROLE_COLORS[s.role]; g.globalAlpha = 0.6; g.beginPath(); g.moveTo(Math.round(s.start * ppb) + 0.5, 0); g.lineTo(Math.round(s.start * ppb) + 0.5, H); g.stroke(); g.globalAlpha = 1; }
    g.font = '9px Inter, system-ui, sans-serif'; g.textBaseline = 'middle';
    view.tracks.forEach((t, i) => {
      const y = i * ROW;
      for (const c0 of t.clips) {
        const c = drag && drag.clip === c0.id ? { ...c0, start: drag.cur.start, len: drag.cur.len } : c0;
        const x = c.start * ppb, w = Math.max(2, c.len * ppb); const isSel = sel.kind === 'clip' && sel.id === c.id; const df = prev?.diff[c.id];
        g.globalAlpha = c.mute ? 0.25 : 1;
        g.fillStyle = t.color + (df ? '66' : '55'); g.beginPath(); g.roundRect(x + 0.5, y + 2, w - 1, ROW - 4, 3); g.fill();
        g.strokeStyle = t.color; g.lineWidth = 1; g.stroke();
        if (ppb >= 7) { g.fillStyle = '#ffffffcc'; drawNotes(g, c, x, y + 4, ROW - 8, ppb); }
        if (w > 46 && ppb >= 10) { g.fillStyle = '#fff'; g.save(); g.beginPath(); g.rect(x + 2, y, w - 4, ROW); g.clip(); g.shadowColor = '#000'; g.shadowBlur = 3; g.fillText(c.label, x + 4, y + 7); g.restore(); }
        if (df) { g.setLineDash([4, 3]); g.lineWidth = 1.6; g.strokeStyle = df === 'added' ? '#06b6d4' : '#f59e0b'; g.strokeRect(x + 0.5, y + 1.5, w - 1, ROW - 3); g.setLineDash([]); g.fillStyle = df === 'added' ? '#06b6d440' : '#f59e0b30'; g.fillRect(x, y + 2, w, ROW - 4); }
        if (isSel) { g.lineWidth = 1.8; g.strokeStyle = '#fff'; g.strokeRect(x + 0.5, y + 1.5, w - 1, ROW - 3); }
        g.globalAlpha = 1;
      }
      if (showAuto) for (const lane of view.auto) {
        if (lane.track !== t.id || lane.param === 'vol' || !lane.pts.length) continue;
        g.beginPath(); g.strokeStyle = lane.param === 'cutoff' ? '#06b6d4' : lane.param === 'res' ? '#f472b6' : '#a3e635'; g.globalAlpha = 0.85; g.lineWidth = 1.2;
        lane.pts.forEach((p, k) => { const px = p.bar * ppb, py = y + ROW - 3 - p.v * (ROW - 6); if (k === 0) g.moveTo(px, py); else g.lineTo(px, py); });
        g.stroke(); g.globalAlpha = 1;
      }
    });
    if (prev) for (const r of prev.removed) {
      const i = trackOf.get(r.track); if (i === undefined) continue;
      g.setLineDash([3, 3]); g.strokeStyle = '#ef4444'; g.lineWidth = 1.4; g.strokeRect(r.start * ppb + 0.5, i * ROW + 2.5, r.len * ppb - 1, ROW - 5);
      g.beginPath(); g.moveTo(r.start * ppb, i * ROW + 2); g.lineTo(r.start * ppb + r.len * ppb, i * ROW + ROW - 2); g.stroke(); g.setLineDash([]);
    }
    // master row
    const my = view.tracks.length * ROW; g.fillStyle = '#7b8794'; g.fillText('MASTER · DJ high-pass sweep', 6, my + ROW / 2);
    const hp = view.auto.find((a) => a.track === 'master' && a.param === 'hp');
    if (hp) { g.beginPath(); g.strokeStyle = '#06b6d4'; g.lineWidth = 1.3; hp.pts.forEach((p, k) => { const px = p.bar * ppb, py = my + ROW - 3 - p.v * (ROW - 6); if (k === 0) g.moveTo(px, py); else g.lineTo(px, py); }); g.stroke(); }
    if (view.loop.on) { g.strokeStyle = '#06b6d4'; g.lineWidth = 1; g.strokeRect(view.loop.a * ppb + 0.5, 0.5, (view.loop.b - view.loop.a) * ppb, H - 1); }
  }, [view, ppb, sel, showAuto, drag, prev, bars, rows, W, H, trackOf]);

  // ───── playhead overlay (rAF, no React re-render)
  useEffect(() => {
    let raf = 0;
    const f = () => {
      const st = engine.playing ? engine.getStep() : -1; const bar = st >= 0 ? st / 16 : store.get().cursorBar; const x = HEAD_W + bar * ppb;
      if (phRef.current) phRef.current.style.transform = `translateX(${x}px)`;
      const sc = scRef.current;
      if (sc && follow && st >= 0 && (x > sc.scrollLeft + sc.clientWidth - 60 || x < sc.scrollLeft + HEAD_W)) sc.scrollLeft = Math.max(0, x - HEAD_W - 80);
      raf = requestAnimationFrame(f);
    };
    f(); return () => cancelAnimationFrame(raf);
  }, [ppb, follow]);

  const snap = ppb >= 40 ? 0.25 : 1;
  const posOf = (e: { clientX: number; clientY: number }, cv: HTMLCanvasElement) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  const onBodyDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = bodyRef.current!; const { x, y } = posOf(e, cv); const row = Math.floor(y / ROW); const t = view.tracks[row];
    if (!t) { if (row === view.tracks.length) store.select({ kind: 'device', id: 'master' }); return; }
    const bar = x / ppb;
    const hit = [...t.clips].reverse().find((c) => bar >= c.start && bar <= c.start + c.len);
    if (!hit) { store.select({ kind: 'track', id: t.id }); return; }
    store.select({ kind: 'clip', id: hit.id, track: t.id });
    onOpenClip?.();
    if (locked || e.pointerType === 'touch') return;
    const edge = x >= (hit.start + hit.len) * ppb - 6;
    const d: ClipDrag = { clip: hit.id, track: t.id, mode: edge ? 'resize' : 'move', x0: e.clientX, start: hit.start, len: hit.len, cur: { start: hit.start, len: hit.len }, moved: false };
    setDrag(d);
    const mv = (ev: PointerEvent) => {
      const db = Math.round((ev.clientX - d.x0) / ppb / snap) * snap;
      d.cur = d.mode === 'move' ? { start: Math.max(0, d.start + db), len: d.len } : { start: d.start, len: Math.max(snap, d.len + db) };
      d.moved = d.cur.start !== d.start || d.cur.len !== d.len; setDrag({ ...d });
    };
    const up = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); setDrag(null);
      if (d.moved) store.dispatch({ type: 'SET_CLIP', id: d.clip, patch: d.cur }, d.mode === 'move' ? 'Move clip' : 'Resize clip');
    };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  }, [view.tracks, ppb, snap, locked, onOpenClip]);

  const onBodyDbl = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (locked) return; const { x, y } = posOf(e, bodyRef.current!); const t = view.tracks[Math.floor(y / ROW)]; if (!t) return;
    if (t.clips.some((c) => x / ppb >= c.start && x / ppb <= c.start + c.len)) return;
    newClipAt(t.id, x / ppb);
  };

  const onHdrDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = posOf(e, hdrRef.current!); const bar = x / ppb; const sec = view.sections.find((s) => bar >= s.start && bar < s.start + s.bars);
    if (y < FLAG_H) { if (sec) store.select({ kind: 'section', id: sec.id }); return; }
    if (y < RULER_Y) {
      if (!sec) return; store.select({ kind: 'section', id: sec.id }); if (sec.lock || locked) return;
      const ed = { id: sec.id, e: sec.energy }; const upd = (cy: number) => { const r = hdrRef.current!.getBoundingClientRect(); const yy = cy - r.top; ed.e = Math.min(1, Math.max(0.05, 1 - (yy - CURVE_Y - 2) / (CURVE_H - 4))); setEDrag({ ...ed }); };
      upd(e.clientY);
      const mv = (ev: PointerEvent) => upd(ev.clientY);
      const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); setEDrag(null); store.dispatch({ type: 'SET_SECTION', id: ed.id, patch: { energy: +ed.e.toFixed(2) } }, `Energy · ${sec.name}`, 'user', `energy:${ed.id}`); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
      return;
    }
    seek(bar);
  };

  const selSec = sel.kind === 'section' ? view.sections.find((s) => s.id === sel.id) : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-panel px-2 py-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Editor · Arrangement</span>
        <div className="ml-2 flex w-36 items-center gap-1" title="Zoom"><span className="text-[10px] text-slate-500">Zoom</span><input aria-label="Timeline zoom" type="range" min={5} max={56} value={ppb} onChange={(e) => setPpb(+e.target.value)} /></div>
        <Btn small active={showAuto} onClick={() => setShowAuto(!showAuto)} title="Show automation overlays">Automation</Btn>
        <Btn small active={follow} onClick={() => setFollow(!follow)} title="Follow playhead">Follow</Btn>
        <Btn small active={view.loop.on} disabled={!selSec && !view.loop.on} title="Loop the selected section" onClick={() => { if (view.loop.on) store.dispatch({ type: 'SET_LOOP', loop: { ...view.loop, on: false } }, 'Loop off'); else if (selSec) store.dispatch({ type: 'SET_LOOP', loop: { on: true, a: selSec.start, b: selSec.start + selSec.bars } }, 'Loop section'); }}>Loop section</Btn>
        <span className="hidden text-[10px] text-slate-500 lg:inline">Click flag = select · drag curve = energy · click ruler = seek · dbl-click lane = new clip · drag clip = move / edge = resize</span>
        {prev && (
          <div className="ml-auto flex items-center gap-1.5 rounded-md border border-cyan/60 bg-cyan/10 px-2 py-0.5">
            <span className="pulse h-1.5 w-1.5 rounded-full bg-cyan" /><span className="max-w-[260px] truncate text-[11px] text-cyan">Ghost diff · {prev.title}</span>
            <span className="font-mono text-[10px] text-slate-300">+{prev.stats.added} −{prev.stats.removed} ~{prev.stats.changed}</span>
            <Btn small tone="cyan" onClick={() => acceptProposal(prev.id)}>Accept</Btn><Btn small onClick={() => rejectProposal(prev.id)}>Revert</Btn>
          </div>
        )}
      </div>
      <div ref={scRef} className="relative min-h-0 flex-1 overflow-auto">
        <div className="relative" style={{ width: HEAD_W + W, height: HDR_H + H }}>
          <div className="sticky top-0 z-20 flex" style={{ height: HDR_H }}>
            <div className="sticky left-0 z-30 flex shrink-0 flex-col justify-end border-b border-r border-line bg-panel p-2 text-[10px] text-slate-400" style={{ width: HEAD_W }}>
              <span className="font-semibold uppercase tracking-wider text-slate-300">Macro · Energy</span><span>sections · plateau curve</span>
            </div>
            <canvas ref={hdrRef} onPointerDown={onHdrDown} className="block cursor-pointer border-b border-line" style={{ touchAction: 'pan-x' }} />
          </div>
          <div className="flex" style={{ height: H }}>
            <div className="sticky left-0 z-10 shrink-0 border-r border-line bg-panel" style={{ width: HEAD_W }}>
              {view.tracks.map((t: Track) => {
                const isSel = (sel.kind === 'track' && sel.id === t.id) || (sel.kind === 'clip' && sel.track === t.id);
                return (
                  <div key={t.id} onClick={() => store.select({ kind: 'track', id: t.id })} style={{ height: ROW }}
                    className={cn('flex cursor-pointer items-center gap-1 border-b border-[#171d24] pr-1 text-[10px]', isSel ? 'bg-[#1d252e]' : 'hover:bg-[#161c23]')}>
                    <span className="h-full w-1.5 shrink-0" style={{ background: t.color }} />
                    <span className={cn('min-w-0 flex-1 truncate', t.mute && 'text-slate-600 line-through')} title={`${t.name} · ${LAYER_REG(t)}`}>{t.name}</span>
                    {(['mute', 'solo', 'lock'] as const).map((k) => (
                      <button key={k} aria-label={`${k} ${t.name}`} title={k}
                        onClick={(e) => { e.stopPropagation(); store.dispatch({ type: 'SET_TRACK', id: t.id, patch: { [k]: !t[k] } }, `${k} ${t.name}`); }}
                        className={cn('h-4 w-4 rounded-sm text-[8px] font-bold leading-none', t[k] ? (k === 'mute' ? 'bg-red-500 text-white' : k === 'solo' ? 'bg-amber text-black' : 'bg-cyan text-black') : 'bg-[#232b35] text-slate-500 hover:text-slate-200')}>
                        {k === 'mute' ? 'M' : k === 'solo' ? 'S' : 'L'}
                      </button>
                    ))}
                  </div>
                );
              })}
              <div style={{ height: ROW }} className="flex items-center px-2 text-[10px] font-semibold text-slate-400">Master</div>
            </div>
            <canvas ref={bodyRef} onPointerDown={onBodyDown} onDoubleClick={onBodyDbl} onContextMenu={(e) => e.preventDefault()} className="block" style={{ cursor: locked ? 'default' : 'pointer' }} />
          </div>
          <div ref={phRef} className="pointer-events-none absolute left-0 top-0 z-40 h-full w-px bg-amber shadow-[0_0_6px_#f59e0b]" />
        </div>
      </div>
    </div>
  );
}

import { LAYERS } from '../engine/styles';
function LAYER_REG(t: Track) { return LAYERS[t.layer]?.reg ?? 'user track'; }
