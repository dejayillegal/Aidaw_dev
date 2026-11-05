import { useEffect, useRef } from 'react';
import { engine, store, useApp } from '../store';
import { LAYERS, ROLE_COLORS, ROLE_NAMES } from '../engine/styles';
import type { ProdMode, ScGroup } from '../engine/types';
import { regenerateSectionNow, setLayerLevel, splitSelectedAtPlayhead } from '../actions';
import { Btn, Section, Slider, Badge } from '../ui';
import { SidechainPanel } from './Sidechain';
import { actRegenSection } from '../engine/assist';
import { totalBars } from '../engine/types';

function MasterDevice() {
  const app = useApp(); const p = app.project; const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0; const data = new Uint8Array(512);
    const f = () => {
      const c = cv.current; if (c) {
        const g = c.getContext('2d')!; g.fillStyle = '#0e1216'; g.fillRect(0, 0, c.width, c.height);
        const a = engine.graph?.analyser;
        if (a) { a.getByteFrequencyData(data); const n = 96; for (let i = 0; i < n; i++) { const idx = Math.floor(Math.pow(i / n, 2.2) * 400) + 1; const v = data[idx] / 255; g.fillStyle = i < 30 ? '#f59e0b' : '#06b6d4'; g.fillRect((i / n) * c.width, c.height * (1 - v), c.width / n - 1, c.height * v); } }
        else { g.fillStyle = '#475569'; g.font = '10px Inter'; g.fillText('Press play to see the live FFT spectrum', 10, 40); }
      }
      raf = requestAnimationFrame(f);
    };
    f(); return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="space-y-2.5 p-3">
      <div className="text-[12px] font-semibold text-amber">Master chain</div>
      <canvas ref={cv} width={300} height={80} className="h-20 w-full rounded border border-line" />
      <div className="text-[10px] text-slate-500">DJ high-pass → saturation (per production mode) → brickwall-style limiter (DynamicsCompressor, −4 dB, 20:1) → master. Spectrum is a log-warped FFT view.</div>
      <div><div className="mb-1 text-[10px] uppercase tracking-wider text-slate-400">Production mode</div>
        <div className="flex gap-1">{(['clean', 'hybrid', 'industrial'] as ProdMode[]).map((m) => <Btn key={m} small className="flex-1 capitalize" active={p.params.mode === m} onClick={() => store.dispatch({ type: 'SET_PARAMS', patch: { mode: m } }, `Mode · ${m}`)}>{m}</Btn>)}</div>
        <div className="mt-1 text-[10px] text-slate-500">Re-voices master saturation and kick/clang drive. Sidechain thresholds are set per bus.</div></div>
      <div className="text-[10px] text-slate-400">Metering shows peak dBFS. A true LUFS/true-peak meter is not implemented — disclosed rather than simulated.</div>
    </div>
  );
}

export function Inspect() {
  const app = useApp(); const p = app.project; const sel = app.selection;

  if (sel.kind === 'device') return sel.id === 'master' ? <MasterDevice /> : <SidechainPanel group={sel.id as ScGroup} />;

  if (sel.kind === 'section') {
    const s = p.sections.find((x) => x.id === sel.id); if (!s) return null; const i = p.sections.indexOf(s);
    const next = p.sections[i + 1]; const prev = p.sections[i - 1];
    const B = s.start; const incoming = p.tracks.filter((t) => t.group === 'Transition').flatMap((t) => t.clips.filter((c) => c.start >= B - 9 && c.start <= B + 0.01).map((c) => `${c.label} @${c.start + 1}`));
    const dE = prev ? s.energy - prev.energy : 0;
    const layers = p.tracks.filter((t) => t.group !== 'Transition' && LAYERS[t.layer]);
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Section" right={<Badge color={ROLE_COLORS[s.role]}>{ROLE_NAMES[s.role]}</Badge>}>
          <div className="mb-2 flex items-center justify-between text-[12px]"><b>{s.name}</b><span className="font-mono text-slate-400">bars {s.start + 1}–{s.start + s.bars} ({s.bars})</span></div>
          <Slider label="Target energy" value={s.energy} min={0.05} max={1} disabled={s.lock} onChange={(v) => store.dispatch({ type: 'SET_SECTION', id: s.id, patch: { energy: v } }, `Energy · ${s.name}`, 'user', `energy:${s.id}`)} />
          <div className="mt-2 flex flex-wrap gap-1">
            <Btn small active={s.lock} onClick={() => store.dispatch({ type: 'SET_SECTION', id: s.id, patch: { lock: !s.lock } }, 'Lock section')}>🔒 Lock</Btn>
            <Btn small disabled={s.lock} onClick={() => regenerateSectionNow(s.id)}>↻ Regenerate</Btn>
            <Btn small tone="cyan" onClick={() => store.addProposal(actRegenSection(p, s.id, 'darker'))}>AI: darker</Btn>
            <Btn small tone="cyan" onClick={() => store.addProposal(actRegenSection(p, s.id, 'harder'))}>AI: harder</Btn>
            <Btn small onClick={() => store.dispatch({ type: 'SET_LOOP', loop: { on: true, a: s.start, b: s.start + s.bars } }, 'Loop section')}>Loop</Btn>
          </div>
        </Section>
        <Section title="Transition rules">
          <div className="space-y-1 text-[11px] text-slate-300">
            <div>Incoming ΔE: <b className={dE > 0.25 ? 'text-amber' : dE < -0.2 ? 'text-violet-400' : ''}>{dE >= 0 ? '+' : ''}{dE.toFixed(2)}</b> <span className="text-slate-500">{dE > 0.25 ? '→ riser · fill · void · impact · HP sweep' : dE < -0.2 ? '→ delay throw · downlifter · pad swell' : prev ? '→ light phrase hit' : '(first section)'}</span></div>
            <div className="text-slate-400">Atoms placed before this section:</div>
            <div className="flex flex-wrap gap-1">{incoming.length ? incoming.map((x, k) => <span key={k} className="rounded bg-pink-500/15 px-1.5 py-0.5 text-[10px] text-pink-300">{x}</span>) : <span className="text-[10px] text-slate-500">none</span>}</div>
            {next && <div className="text-[10px] text-slate-500">Outgoing ΔE: {(next.energy - s.energy >= 0 ? '+' : '') + (next.energy - s.energy).toFixed(2)} → {next.name}</div>}
          </div>
        </Section>
        <Section title="Active layer mask">
          <div className="space-y-0.5">
            {layers.map((t) => {
              const lv = s.levels[t.layer] ?? 0; const key = `${s.id}:${t.layer}`; const ov = p.overrides[key];
              return (
                <div key={t.id} className="flex items-center gap-1.5 text-[10px]">
                  <span className="w-24 truncate" style={{ color: t.color }}>{t.name}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#0e1216]"><div className="h-full rounded-full" style={{ width: `${lv * 100}%`, background: t.color }} /></div>
                  <span className="w-7 text-right font-mono text-slate-400">{Math.round(lv * 100)}</span>
                  {([['off', 0], ['½', 0.45], ['full', 1], ['auto', null]] as const).map(([lab, v]) => (
                    <button key={lab} disabled={s.lock} onClick={() => setLayerLevel(s.id, t.layer, v)} className={`h-4 rounded px-1 text-[8px] ${(v === null ? ov === undefined : ov === v) ? 'bg-amber text-black' : 'bg-[#232b35] text-slate-400 hover:text-white'}`}>{lab}</button>
                  ))}
                </div>
              );
            })}
          </div>
        </Section>
      </div>
    );
  }

  if (sel.kind === 'track') {
    const t = p.tracks.find((x) => x.id === sel.id); if (!t) return null; const def = LAYERS[t.layer];
    const up = (patch: Partial<typeof t>, k: string) => store.dispatch({ type: 'SET_TRACK', id: t.id, patch }, `Track · ${t.name}`, 'user', `${k}:${t.id}`);
    const lane = (param: string) => p.auto.some((a) => a.track === t.id && a.param === param);
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Track" right={<Badge color={t.color}>{t.group}</Badge>}>
          <input value={t.name} onChange={(e) => up({ name: e.target.value }, 'name')} aria-label="Track name" className="mb-2 h-8 w-full rounded-md border border-line bg-elev px-2 text-[12px] font-semibold" />
          <div className="mb-2 flex flex-wrap gap-1">
            <Btn small active={t.mute} onClick={() => up({ mute: !t.mute }, 'mute')}>Mute</Btn><Btn small active={t.solo} onClick={() => up({ solo: !t.solo }, 'solo')}>Solo</Btn><Btn small active={t.lock} onClick={() => up({ lock: !t.lock }, 'lock')}>🔒 Lock (protect from AI)</Btn>
          </div>
          <div className="text-[10px] text-slate-400">Synth: <b className="text-slate-200">{t.synth}</b> · Register: <b className="text-slate-200">{def?.reg ?? 'user'}</b></div>
        </Section>
        <Section title="Device chain">
          <div className="flex flex-wrap items-center gap-1 text-[10px]">
            {[t.synth.toUpperCase(), ['acid', 'midbass', 'stab', 'arp', 'lead', 'pad', 'dubchord', 'drone', 'noise'].includes(t.synth) ? 'LP FILTER' : null, ['kick', 'midbass', 'acid', 'clang', 'sub', 'rumble', 'impact'].includes(t.synth) ? 'SATURATOR' : null, t.sc ? `SC·${t.sc}` : null, 'FADER', 'PAN'].filter(Boolean).map((d, i, a) => (
              <span key={i} className="flex items-center gap-1"><span className="rounded border border-line bg-elev px-1.5 py-0.5 font-mono text-slate-200">{d}</span>{i < a.length - 1 && <span className="text-slate-600">›</span>}</span>
            ))}
          </div>
        </Section>
        <Section title="Channel strip">
          <div className="space-y-1.5">
            <Slider label="Volume" value={t.vol} min={0} max={1.4} onChange={(v) => up({ vol: v }, 'vol')} fmt={(v) => (v > 0.001 ? `${(20 * Math.log10(v)).toFixed(1)} dB` : '-∞')} />
            <Slider label="Pan" value={t.pan} min={-1} max={1} step={0.02} onChange={(v) => up({ pan: v }, 'pan')} />
            <Slider cy label="Reverb send" value={t.rev} min={0} max={1} disabled={lane('rev')} hint={lane('rev') ? 'Automated — edit in the Automation tab' : undefined} onChange={(v) => up({ rev: v }, 'rev')} />
            <Slider cy label="Delay send" value={t.del} min={0} max={1} onChange={(v) => up({ del: v }, 'del')} />
            <Slider label={`Filter offset${lane('cutoff') ? ' (automated)' : ''}`} value={t.cutoff} min={0} max={1} disabled={lane('cutoff')} onChange={(v) => up({ cutoff: v }, 'cut')} />
            <Slider label={`Resonance${lane('res') ? ' (automated)' : ''}`} value={t.res} min={0} max={1} disabled={lane('res')} onChange={(v) => up({ res: v }, 'res')} />
          </div>
        </Section>
        <Section title="Routing · sidechain">
          <label className="block text-[10px] uppercase tracking-wider text-slate-400">Ducked by Kick via
            <select value={t.sc ?? ''} onChange={(e) => up({ sc: (e.target.value || null) as ScGroup | null }, 'sc')} className="mt-0.5 w-full text-[11px] normal-case">
              <option value="">— none (direct to master)</option><option value="bass">Bass bus compressor</option><option value="harm">Harmony bus compressor</option><option value="fx">FX bus compressor</option>
            </select></label>
          {t.sc && <Btn small className="mt-2" tone="cyan" onClick={() => store.select({ kind: 'device', id: t.sc as ScGroup })}>Open sidechain device ›</Btn>}
          <div className="mt-2 flex gap-1"><Btn small tone="red" onClick={() => { store.dispatch({ type: 'PATCH', patch: { tracks: p.tracks.filter((x) => x.id !== t.id), auto: p.auto.filter((a) => a.track !== t.id) } }, `Remove ${t.name}`); store.select({ kind: 'none' }); }}>Remove track</Btn></div>
        </Section>
      </div>
    );
  }

  if (sel.kind === 'clip') {
    const t = p.tracks.find((x) => x.id === sel.track); const c = t?.clips.find((x) => x.id === sel.id); if (!t || !c) return null;
    const up = (patch: Partial<typeof c>, k: string) => store.dispatch({ type: 'SET_CLIP', id: c.id, patch }, `Clip · ${c.label}`, 'user', `${k}:${c.id}`);
    const tb = totalBars(p);
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Clip" right={<Badge color={t.color}>{t.name}</Badge>}>
          <input value={c.label} onChange={(e) => up({ label: e.target.value }, 'label')} aria-label="Clip name" className="mb-2 h-8 w-full rounded-md border border-line bg-elev px-2 text-[12px]" />
          <div className="grid grid-cols-2 gap-1.5 text-[10px] text-slate-400">
            <div>Start<div className="font-mono text-[12px] text-slate-100">bar {c.start + 1}</div></div><div>Length<div className="font-mono text-[12px] text-slate-100">{c.len} bars</div></div>
            <div>Loop<div className="font-mono text-[12px] text-slate-100">{c.loop} steps {c.loop % 16 ? <span className="text-cyan">polymetric</span> : ''}</div></div><div>Phase offset<div className="font-mono text-[12px] text-slate-100">{c.off.toFixed(1)}</div></div>
          </div>
        </Section>
        <Section title="Properties">
          <div className="space-y-1.5">
            <Slider label="Clip gain" value={c.gain} min={0} max={1.5} onChange={(v) => up({ gain: v }, 'gain')} />
            <Slider label="Transpose" value={c.transpose} min={-24} max={24} step={1} onChange={(v) => up({ transpose: v }, 'tr')} fmt={(v) => `${v > 0 ? '+' : ''}${v} st`} />
            <Slider label="Start (bars)" value={c.start} min={0} max={tb} step={1} onChange={(v) => up({ start: v }, 'start')} fmt={(v) => `${v + 1}`} />
            <Slider label="Length (bars)" value={c.len} min={0.25} max={Math.max(8, tb)} step={0.25} onChange={(v) => up({ len: v }, 'len')} fmt={(v) => `${v}`} />
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            <Btn small active={c.mute} onClick={() => up({ mute: !c.mute }, 'mute')}>Mute clip</Btn>
            <Btn small onClick={splitSelectedAtPlayhead} title="Ctrl/Cmd+E">Split @ playhead</Btn>
            <Btn small onClick={() => store.dispatch({ type: 'DUP_CLIP', id: c.id }, 'Duplicate clip')} title="Ctrl/Cmd+D">Duplicate</Btn>
            <Btn small tone="red" onClick={() => { store.dispatch({ type: 'DEL_CLIP', id: c.id }, 'Delete clip'); store.select({ kind: 'track', id: t.id }); }} title="Delete">Delete</Btn>
          </div>
          <div className="mt-2 text-[10px] text-slate-500">{c.notes.length} notes · open the Piano Roll tab to edit notes, accents and slides.</div>
        </Section>
      </div>
    );
  }

  const s = p.sections.length;
  return (
    <div className="space-y-2 p-3 text-[11px] text-slate-400">
      <div className="text-[12px] font-semibold text-slate-200">Inspect</div>
      <p>Nothing selected. Inspect follows your selection — no tab switching:</p>
      <ul className="list-inside list-disc space-y-1 text-slate-500"><li>Click a <b className="text-slate-300">section flag</b> for energy, layer mask and transition rules</li><li>Click a <b className="text-slate-300">track header</b> for channel strip, device chain and routing</li><li>Click a <b className="text-slate-300">clip</b> for gain, transpose, loop and phase</li><li>Click <b className="text-slate-300">Master</b> or open a sidechain device from a track</li></ul>
      <div className="rounded border border-line bg-panel p-2 font-mono text-[10px]">{p.name}<br />{s} sections · {totalBars(p)} bars · {p.tracks.length} tracks · {p.auto.length} automation lanes</div>
      <div className="flex gap-1">{(['bass', 'harm', 'fx'] as ScGroup[]).map((g) => <Btn key={g} small tone="cyan" onClick={() => store.select({ kind: 'device', id: g })}>SC {g}</Btn>)}<Btn small onClick={() => store.select({ kind: 'device', id: 'master' })}>Master</Btn></div>
    </div>
  );
}
