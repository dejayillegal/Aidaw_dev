import { store, useApp } from '../store';
import { FORMS, LAYERS, ROLE_COLORS, STYLES } from '../engine/styles';
import { KEY_NAMES, SCALE_NAMES } from '../engine/theory';
import type { ComposeParams, ProdMode, ScaleId } from '../engine/types';
import { composeGenerate, regenerateSectionNow, setLayerLevel } from '../actions';
import { Btn, Section, Slider } from '../ui';
import { cn } from '../utils/cn';

export function Compose() {
  const app = useApp(); const p = app.project; const P = p.params; const style = STYLES[P.style];
  const set = (patch: Partial<ComposeParams>, key?: string) => store.dispatch({ type: 'SET_PARAMS', patch }, 'Compose parameters', 'user', key ?? `params:${Object.keys(patch).join()}`);
  const selId = app.selection.kind === 'section' ? app.selection.id : null;
  const layers = p.tracks.filter((t) => t.group !== 'Transition' && LAYERS[t.layer]);
  const lockedTracks = p.tracks.filter((t) => t.lock).length;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <Section title="Stylistic blueprint">
        <div className="grid grid-cols-2 gap-1.5">
          {Object.values(STYLES).map((s) => (
            <button key={s.id} onClick={() => set({ style: s.id, bpm: Math.round((s.bpm[0] + s.bpm[1]) / 2), scale: s.scales[0], swing: s.swing, dirt: s.dirt, form: 'auto' }, 'style')}
              className={cn('rounded-md border px-2 py-1.5 text-left text-[11px] leading-tight transition-colors', P.style === s.id ? 'border-amber bg-amber/10 text-amber' : 'border-line bg-elev text-slate-300 hover:border-slate-500')}>
              {s.name}<div className="mt-0.5 text-[9px] text-slate-500">{s.layers.length} layers · {s.bpm[0]}–{s.bpm[1]}</div>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[10px] leading-snug text-slate-400">{style.desc}</p>
        <label className="mt-2 block text-[10px] uppercase tracking-wider text-slate-400">Song-form archetype
          <select value={P.form} onChange={(e) => set({ form: e.target.value }, 'form')} className="mt-0.5 w-full text-[11px] normal-case tracking-normal">
            <option value="auto">Auto — pick by style + seed</option>
            {Object.values(FORMS).map((f) => <option key={f.id} value={f.id}>{f.name} ({f.range})</option>)}
          </select>
        </label>
        {P.form !== 'auto' && <p className="mt-1 text-[10px] text-slate-500">{FORMS[P.form]?.desc}</p>}
      </Section>

      <Section title="Musical intent">
        <div className="grid grid-cols-3 gap-1.5">
          <label className="text-[10px] uppercase text-slate-400">Key<select value={P.key} onChange={(e) => set({ key: +e.target.value }, 'key')} className="mt-0.5 w-full text-[11px]">{KEY_NAMES.map((k, i) => <option key={k} value={i}>{k}</option>)}</select></label>
          <label className="col-span-2 text-[10px] uppercase text-slate-400">Scale / mode<select value={P.scale} onChange={(e) => set({ scale: e.target.value as ScaleId }, 'scale')} className="mt-0.5 w-full text-[11px]">{Object.entries(SCALE_NAMES).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
        </div>
        <div className="mt-2 space-y-1.5">
          <Slider label="Tempo" value={P.bpm} min={110} max={150} step={1} onChange={(v) => set({ bpm: v }, 'bpm')} fmt={(v) => `${v} BPM`} />
          <Slider label="Target length" value={P.bars} min={96} max={256} step={8} onChange={(v) => set({ bars: v }, 'bars')} fmt={(v) => `${v} bars · ${(v * 4 * 60 / P.bpm / 60).toFixed(1)} min`} />
          <Slider label="Arrangement density" value={P.density} min={0} max={1} onChange={(v) => set({ density: v }, 'density')} />
          <Slider label="Rhythmic complexity" value={P.complexity} min={0} max={1} onChange={(v) => set({ complexity: v }, 'cx')} />
          <Slider label="Swing / shuffle" value={P.swing} min={0.5} max={0.68} step={0.005} onChange={(v) => set({ swing: v }, 'swing')} fmt={(v) => `${(v * 100).toFixed(1)}%`} />
          <Slider label="Acid intensity" value={P.acid} min={0} max={1} onChange={(v) => set({ acid: v }, 'acid')} />
          <Slider label="Percussion polyrhythm" value={P.poly} min={0} max={1} onChange={(v) => set({ poly: v }, 'poly')} />
          <Slider label="Industrial / saturation dirt" value={P.dirt} min={0} max={1} onChange={(v) => set({ dirt: v }, 'dirt')} />
          <Slider label="Atmosphere / dub depth" value={P.depth} min={0} max={1} onChange={(v) => set({ depth: v }, 'depth')} />
        </div>
        <div className="mt-2 flex gap-1" role="group" aria-label="Production mode">
          {(['clean', 'hybrid', 'industrial'] as ProdMode[]).map((m) => <Btn key={m} small className="flex-1 capitalize" active={P.mode === m} onClick={() => set({ mode: m }, 'mode')}>{m}</Btn>)}
        </div>
        <div className="mt-2 flex items-end gap-1.5">
          <label className="flex-1 text-[10px] uppercase text-slate-400">Seed
            <input type="number" value={P.seed} onChange={(e) => set({ seed: Math.max(0, Math.floor(+e.target.value || 0)) }, 'seed')} className="mt-0.5 h-8 w-full rounded-md border border-line bg-elev px-2 font-mono text-[12px]" /></label>
          <Btn title="Random seed" onClick={() => set({ seed: Math.floor(Math.random() * 999999) }, 'seed')}>🎲</Btn>
        </div>
      </Section>

      <Section title="Generate">
        <div className="grid grid-cols-1 gap-1.5">
          <Btn tone="amber" className="!h-9" onClick={() => composeGenerate('new')}>Generate evolving arrangement</Btn>
          <Btn onClick={() => composeGenerate('keep')} title="Re-generate using the current section structure & energies; locked sections/tracks are preserved">Regenerate · keep structure &amp; locks</Btn>
          <Btn tone="ghost" onClick={() => composeGenerate('rig')}>Genre starter rig (routed, no clips)</Btn>
        </div>
        <p className="mt-1.5 text-[10px] leading-snug text-slate-500">Peak-first: the densest loop for each of {style.layers.length} layers is generated first, then clips are removed per section by energy rules. {lockedTracks ? `${lockedTracks} locked track(s) are protected.` : 'Lock a track (L) to protect it.'} All results are undoable.</p>
      </Section>

      <Section title="Section matrix" right={<span className="text-[9px] text-slate-500">{p.sections.length} sections · {p.formId}</span>}>
        <div className="space-y-1">
          {p.sections.map((s, i) => (
            <div key={s.id} onClick={() => store.select({ kind: 'section', id: s.id })}
              className={cn('flex cursor-pointer items-center gap-1.5 rounded border px-1.5 py-1', selId === s.id ? 'border-white/60 bg-elev' : 'border-line bg-panel hover:bg-elev')}>
              <span className="h-5 w-1.5 rounded-sm" style={{ background: ROLE_COLORS[s.role] }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between text-[11px]"><span className="truncate font-medium">{i + 1}. {s.name}</span><span className="font-mono text-[9px] text-slate-500">{s.start + 1}–{s.start + s.bars} · {s.bars}b</span></div>
                <input aria-label={`${s.name} energy`} type="range" min={0.05} max={1} step={0.01} value={s.energy} disabled={s.lock} onClick={(e) => e.stopPropagation()}
                  onChange={(e) => store.dispatch({ type: 'SET_SECTION', id: s.id, patch: { energy: +e.target.value } }, `Energy · ${s.name}`, 'user', `energy:${s.id}`)} />
              </div>
              <span className="w-7 text-right font-mono text-[10px] text-amber">{s.energy.toFixed(2)}</span>
              <button aria-label={`Lock ${s.name}`} title="Lock section (protected during regeneration)" onClick={(e) => { e.stopPropagation(); store.dispatch({ type: 'SET_SECTION', id: s.id, patch: { lock: !s.lock } }, `${s.lock ? 'Unlock' : 'Lock'} ${s.name}`); }} className={cn('h-6 w-6 rounded text-[11px]', s.lock ? 'bg-cyan text-black' : 'bg-[#232b35] text-slate-400')}>🔒</button>
              <button aria-label={`Regenerate ${s.name}`} title="Re-roll this section only" disabled={s.lock} onClick={(e) => { e.stopPropagation(); regenerateSectionNow(s.id); }} className="h-6 w-6 rounded bg-[#232b35] text-[11px] text-slate-300 hover:text-amber disabled:opacity-30">↻</button>
            </div>
          ))}
        </div>
        <p className="mt-1.5 text-[10px] text-slate-500">Energy edits take effect on “Regenerate · keep structure” or ↻ per section.</p>
      </Section>

      <Section title="Layer activity matrix" right={<span className="text-[9px] text-slate-500">click cell: auto → off → sparse → full</span>}>
        <div className="overflow-x-auto">
          <table className="border-separate text-[9px]" style={{ borderSpacing: 1 }}>
            <thead><tr><th className="sticky left-0 z-10 bg-panel" />{p.sections.map((s, i) => <th key={s.id} title={s.name} className="px-0 font-normal" style={{ color: ROLE_COLORS[s.role] }}><div className={cn('w-[18px] text-center', selId === s.id && 'font-bold text-white')}>{i + 1}</div></th>)}</tr></thead>
            <tbody>
              {layers.map((t) => (
                <tr key={t.id}>
                  <td className="sticky left-0 z-10 max-w-[104px] truncate bg-panel pr-1.5 text-[10px] text-slate-300" title={`${t.name} · ${LAYERS[t.layer].reg}`}><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full" style={{ background: t.color }} />{t.name}</td>
                  {p.sections.map((s) => {
                    const key = `${s.id}:${t.layer}`; const ov = p.overrides[key]; const lv = s.levels[t.layer] ?? 0;
                    const next = ov === undefined ? 0 : ov === 0 ? 0.4 : ov < 1 ? 1 : null;
                    return (
                      <td key={s.id} className="p-0">
                        <button aria-label={`${t.name} in ${s.name}: ${Math.round(lv * 100)}%`} title={`${t.name} · ${s.name}: ${Math.round(lv * 100)}%${ov !== undefined ? ' (manual)' : ''}`} disabled={s.lock || t.lock}
                          onClick={() => setLayerLevel(s.id, t.layer, next)}
                          className={cn('relative block h-[14px] w-[18px] rounded-[2px] border', ov !== undefined ? 'border-white/70' : 'border-transparent', (s.lock || t.lock) && 'opacity-40')}
                          style={{ background: lv < 0.02 ? '#161b21' : t.color, opacity: lv < 0.02 ? 1 : 0.25 + lv * 0.75 }} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
