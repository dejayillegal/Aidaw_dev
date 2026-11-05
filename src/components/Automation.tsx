import { useEffect, useMemo, useRef, useState } from 'react';
import { store, useApp } from '../store';
import { totalBars, type AutoLane, type AutoParam } from '../engine/types';
import { ROLE_COLORS } from '../engine/styles';
import { Btn } from '../ui';

const H = 170, PAD = 14;
const PARAM_LABEL: Record<AutoParam, string> = { cutoff: 'Filter cutoff', res: 'Resonance', rev: 'Reverb send', vol: 'Volume', hp: 'DJ high-pass' };

export function AutomationEditor() {
  const app = useApp(); const p = app.project; const sel = app.selection;
  const [trackId, setTrack] = useState<string>('');
  const [param, setParam] = useState<AutoParam>('cutoff');
  const [ppb, setPpb] = useState(10);
  const [draft, setDraft] = useState<AutoLane | null>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const bars = Math.max(32, totalBars(p)); const W = bars * ppb + 20;

  useEffect(() => {
    const id = sel.kind === 'track' ? sel.id : sel.kind === 'clip' ? sel.track : null;
    if (id) { setTrack(id); setParam((q) => (q === 'hp' ? 'cutoff' : q)); }
  }, [sel]);
  const tid = trackId || p.tracks.find((t) => p.auto.some((a) => a.track === t.id))?.id || p.tracks[0]?.id || 'master';
  const target = tid === 'master' ? 'master' : tid; const prm: AutoParam = target === 'master' ? 'hp' : param === 'hp' ? 'cutoff' : param;
  const stored = p.auto.find((a) => a.track === target && a.param === prm);
  const lane = draft ?? stored;
  const track = p.tracks.find((t) => t.id === target);
  const col = track?.color ?? '#06b6d4';
  const secs = useMemo(() => p.sections, [p.sections]);

  useEffect(() => {
    const c = cv.current; if (!c) return; const dpr = window.devicePixelRatio || 1;
    c.width = W * dpr; c.height = H * dpr; c.style.width = W + 'px'; c.style.height = H + 'px';
    const g = c.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#0e1216'; g.fillRect(0, 0, W, H);
    const Y = (v: number) => H - PAD - v * (H - 2 * PAD);
    for (const s of secs) { g.fillStyle = ROLE_COLORS[s.role] + '14'; g.fillRect(s.start * ppb, 0, s.bars * ppb, H); g.fillStyle = ROLE_COLORS[s.role]; g.globalAlpha = 0.9; g.font = '9px Inter, sans-serif'; g.fillText(s.name, s.start * ppb + 4, 10); g.globalAlpha = 1; }
    for (let b = 0; b <= bars; b += 4) { g.strokeStyle = b % 16 === 0 ? '#2f3a48' : '#1a2128'; g.beginPath(); g.moveTo(b * ppb + 0.5, 0); g.lineTo(b * ppb + 0.5, H); g.stroke(); }
    for (const v of [0.25, 0.5, 0.75]) { g.strokeStyle = '#1a2128'; g.beginPath(); g.moveTo(0, Y(v)); g.lineTo(W, Y(v)); g.stroke(); }
    if (!lane || !lane.pts.length) { g.fillStyle = '#64748b'; g.font = '12px Inter, sans-serif'; g.fillText('No lane yet — press “Create lane”, then click to add points.', 16, H / 2); return; }
    g.beginPath(); lane.pts.forEach((q, i) => { const x = q.bar * ppb, y = Y(q.v); if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); });
    g.lineTo(lane.pts[lane.pts.length - 1].bar * ppb, H); g.lineTo(lane.pts[0].bar * ppb, H); g.closePath(); g.fillStyle = col + '22'; g.fill();
    g.beginPath(); lane.pts.forEach((q, i) => { const x = q.bar * ppb, y = Y(q.v); if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }); g.strokeStyle = '#06b6d4'; g.lineWidth = 1.6; g.stroke();
    for (const q of lane.pts) { g.beginPath(); g.arc(q.bar * ppb, Y(q.v), 3.2, 0, 7); g.fillStyle = '#0b0d10'; g.fill(); g.strokeStyle = '#06b6d4'; g.stroke(); }
  }, [lane, W, ppb, secs, bars, col]);

  const commit = (l: AutoLane, label: string) => { setDraft(null); store.dispatch({ type: 'SET_AUTO', lane: l }, label, 'user', `auto:${l.id}`); };
  const create = () => commit({ id: `a_${target}_${prm}`, track: target, param: prm, pts: [{ bar: 0, v: 0.5 }, { bar: bars, v: 0.5 }] }, `Create ${prm} lane`);

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!lane) return; const r = cv.current!.getBoundingClientRect(); const Y = (v: number) => H - PAD - v * (H - 2 * PAD);
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const bar = (x: number) => Math.max(0, Math.round((x / ppb) * 4) / 4); const val = (y: number) => Math.min(1, Math.max(0, (H - PAD - y) / (H - 2 * PAD)));
    const pts = lane.pts.map((q) => ({ ...q }));
    let hit = pts.findIndex((q) => Math.hypot(q.bar * ppb - px, Y(q.v) - py) < 8);
    if (hit < 0) { pts.push({ bar: bar(px), v: +val(py).toFixed(3) }); pts.sort((a, b) => a.bar - b.bar); hit = pts.findIndex((q) => q.bar === bar(px)); }
    const cur: AutoLane = { ...lane, pts };
    setDraft({ ...cur, pts: pts.map((q) => ({ ...q })) });
    const mv = (ev: PointerEvent) => { pts[hit] = { bar: bar(ev.clientX - r.left), v: +val(ev.clientY - r.top).toFixed(3) }; setDraft({ ...cur, pts: pts.map((q) => ({ ...q })) }); };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); pts.sort((a, b) => a.bar - b.bar); commit({ ...cur, pts }, `Edit ${prm} automation`); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };
  const onDbl = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!stored) return; const r = cv.current!.getBoundingClientRect(); const px = e.clientX - r.left, py = e.clientY - r.top; const Y = (v: number) => H - PAD - v * (H - 2 * PAD);
    const idx = stored.pts.findIndex((q) => Math.hypot(q.bar * ppb - px, Y(q.v) - py) < 8); if (idx < 0 || stored.pts.length <= 2) return;
    commit({ ...stored, pts: stored.pts.filter((_, i) => i !== idx) }, 'Delete automation point');
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-2 py-1">
        <select aria-label="Automation target" value={tid} onChange={(e) => setTrack(e.target.value)} className="h-6 max-w-[170px] text-[11px]">
          {p.tracks.map((t) => <option key={t.id} value={t.id}>{p.auto.some((a) => a.track === t.id) ? '● ' : ''}{t.name}</option>)}<option value="master">Master</option>
        </select>
        {target !== 'master' && (['cutoff', 'res', 'rev', 'vol'] as AutoParam[]).map((k) => (
          <Btn key={k} small active={prm === k} onClick={() => setParam(k)}>{p.auto.some((a) => a.track === target && a.param === k) ? '● ' : ''}{PARAM_LABEL[k]}</Btn>
        ))}
        {target === 'master' && <span className="text-[11px] text-slate-400">{PARAM_LABEL.hp} (exponential ramps)</span>}
        {!stored && <Btn small tone="amber" onClick={create}>Create lane</Btn>}
        {stored && <Btn small tone="ghost" onClick={() => store.dispatch({ type: 'DEL_AUTO', id: stored.id }, 'Delete lane')}>Delete lane</Btn>}
        <label className="ml-auto flex items-center gap-1 text-[10px] text-slate-400">Zoom<input aria-label="Automation zoom" type="range" className="!w-20" min={4} max={30} value={ppb} onChange={(e) => setPpb(+e.target.value)} /></label>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-[#0e1216]"><canvas ref={cv} onPointerDown={onDown} onDoubleClick={onDbl} className="block" style={{ touchAction: 'none' }} /></div>
      <div className="shrink-0 border-t border-line px-2 py-0.5 text-[10px] text-slate-500">Click = add point · drag = move · double-click = delete. Lanes are scheduled onto AudioParam timelines (sample-accurate ramps). A jump of &lt;0.02 bar becomes a hard snap-back.</div>
    </div>
  );
}
