import { store, engine } from './store';
import { interpret, buildProposal, type Proposal } from './engine/assist';
import { regenSection, generate, mergeGenerated, mkClip } from './engine/composer';
import type { Command } from './engine/commands';
import type { ComposeParams } from './engine/types';
import { totalBars } from './engine/types';

export function acceptProposal(id: string) {
  const pr = store.get().proposals.find((p) => p.id === id);
  if (!pr) return;

  const current = store.get().project;
  const currentRevision = current.revision ?? 1;
  if (pr.baseRevision !== currentRevision) {
    store.dropProposal(id);
    store.say('ai', `Proposal “${pr.title}” is stale; regenerate it before accepting.`);
    return;
  }

  store.dispatch(pr.cmd, `AI · ${pr.title}`, 'ai');
  store.dropProposal(id);
  store.say('ai', `Applied “${pr.title}”. It is in the undo history, tagged AI.`);
}

export function rejectProposal(id: string) { store.dropProposal(id); }
export function offerProposal(pr: Proposal) { store.addProposal(pr); }

export function runAssist(text: string) {
  const s = store.get(); if (!text.trim()) return;
  store.say('user', text);
  const r = interpret(text, s.project, s.selection, engine.playing ? Math.max(0, engine.getStep() / 16) : s.cursorBar);
  if ('message' in r) { store.say('ai', r.message); return; }
  const st = r.proposal.stats;
  if (!st.added && !st.removed && !st.changed && !st.lanes && !st.mixer) { store.say('ai', `${r.proposal.title}: nothing to change — the project already satisfies this.`); return; }
  store.addProposal(r.proposal);
  store.say('ai', `${r.proposal.title}: ghost preview on the timeline (+${st.added} / −${st.removed} / ~${st.changed} clips, ${st.lanes} automation lanes, ${st.mixer} mixer/routing changes). Audition and accept are enabled while the proposal still matches the project revision.`);
}

export function seek(bar: number) {
  const b = Math.max(0, Math.round(bar * 4) / 4);
  store.setCursor(b);
  if (store.get().playing) void engine.play(b);
}

/** Compose → generate through the command bus (undoable, attributed to the composer) */
export function composeGenerate(mode: 'new' | 'keep' | 'rig', patch?: Partial<ComposeParams>) {
  const s = store.get(); const params = { ...s.project.params, ...patch };
  if (mode === 'rig') {
    const gen = generate(params, { rig: true });
    store.dispatch({ type: 'PATCH', patch: { tracks: gen.tracks, auto: [], sections: gen.sections, params, formId: gen.formId, secSeed: {}, overrides: {} } }, 'Genre starter rig', 'composer');
    return;
  }
  if (mode === 'new') {
    const gen = generate(params, { overrides: {} });
    const m = mergeGenerated(s.project, gen, false);
    store.dispatch({ type: 'PATCH', patch: { ...m, params, secSeed: {}, overrides: {} } }, `Compose · ${params.style} · seed ${params.seed}`, 'composer');
  } else {
    const gen = generate(params, { sections: s.project.sections, secSeed: s.project.secSeed, overrides: s.project.overrides });
    const m = mergeGenerated({ ...s.project, params }, gen, true);
    store.dispatch({ type: 'PATCH', patch: { ...m, params } }, 'Compose · regenerate (keep structure)', 'composer');
  }
  store.stop();
}

export function setLayerLevel(secId: string, layer: string, level: number | null) {
  const s = store.get(); const key = `${secId}:${layer}`;
  const cmds: Command[] = [{ type: 'SET_OVERRIDE', key, value: level }];
  const base = { ...s.project, overrides: { ...s.project.overrides } };
  if (level === null) delete base.overrides[key]; else base.overrides[key] = level;
  const r = regenSection(base, secId, layer);
  cmds.push({ type: 'PATCH', patch: { tracks: r.tracks, auto: r.auto, secSeed: s.project.secSeed } });
  store.dispatch({ type: 'BATCH', cmds }, `Layer matrix · ${layer} @ ${s.project.sections.find((x) => x.id === secId)?.name}`, 'composer');
}

export function regenerateSectionNow(secId: string) {
  const s = store.get(); const r = regenSection(s.project, secId);
  store.dispatch({ type: 'PATCH', patch: r }, 'Regenerate section', 'composer');
}

export function newClipAt(trackId: string, bar: number) {
  const s = store.get();
  const c = mkClip(Math.max(0, Math.floor(bar)), Math.min(4, Math.max(1, totalBars(s.project) - Math.floor(bar))), 16, [], 'New clip');
  store.dispatch({ type: 'ADD_CLIP', track: trackId, clip: c }, 'Create clip');
  store.select({ kind: 'clip', id: c.id, track: trackId });
}

export function splitSelectedAtPlayhead() {
  const s = store.get(); if (s.selection.kind !== 'clip') return;
  const bar = engine.playing ? engine.getStep() / 16 : s.cursorBar;
  store.dispatch({ type: 'SPLIT_CLIP', id: s.selection.id, at: Math.round(bar * 4) / 4 }, 'Split clip');
}

export { buildProposal };
