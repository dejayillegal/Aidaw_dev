import { useSyncExternalStore } from 'react';
import type { Project, Selection } from './engine/types';
import { applyCommand, type Command, type HistoryEntry, type Source } from './engine/commands';
import { defaultParams, newProject } from './engine/composer';
import { Engine } from './engine/audio';
import type { Proposal } from './engine/assist';

export interface LogMsg { id: number; role: 'user' | 'ai'; text: string }
export interface AppState {
  project: Project; entries: HistoryEntry[]; cursor: number;
  selection: Selection; proposals: Proposal[]; previewId: string | null; audition: boolean;
  playing: boolean; cursorBar: number; log: LogMsg[]; restored: boolean; version: number;
}

const KEY = 'aidaw.project.v1';
const MAX_HISTORY = 120;

function normalizeProject(project: Partial<Project> | null | undefined, fallback: Project): Project {
  if (!project || !Array.isArray(project.tracks) || !Array.isArray(project.sections)) return fallback;
  return {
    ...fallback,
    ...project,
    v: 1,
    revision: typeof project.revision === 'number' ? project.revision : fallback.revision,
    tracks: project.tracks,
    sections: project.sections,
    auto: Array.isArray(project.auto) ? project.auto : fallback.auto,
    sc: project.sc ?? fallback.sc,
    scOn: project.scOn ?? fallback.scOn,
    overrides: project.overrides ?? fallback.overrides,
    secSeed: project.secSeed ?? fallback.secSeed,
    loop: project.loop ?? fallback.loop,
  };
}

function load(): { project: Project; restored: boolean } {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Project>;
      if (p && p.v === 1 && Array.isArray(p.tracks) && Array.isArray(p.sections) && p.params && p.sc) {
        return { project: normalizeProject(p, newProject(defaultParams('hypnotic', 1337))), restored: true };
      }
    }
  } catch { /* ignore corrupt autosave */ }
  return { project: newProject(defaultParams('hypnotic', 1337)), restored: false };
}

class Store {
  private s: AppState; private subs = new Set<() => void>(); private seq = 1; private saveTimer?: number;
  engine = new Engine();

  constructor() {
    const l = load();
    this.s = { project: l.project, entries: [], cursor: 0, selection: { kind: 'none' }, proposals: [], previewId: null, audition: false, playing: false, cursorBar: 0, log: [], restored: l.restored, version: 0 };
    this.engine.getProject = () => this.playProject();
    this.engine.onStop = () => this.set({ playing: false });
  }

  subscribe = (f: () => void) => { this.subs.add(f); return () => { this.subs.delete(f); }; };
  get = () => this.s;

  private set(patch: Partial<AppState>) {
    this.s = { ...this.s, ...patch, version: this.s.version + 1 };
    if (patch.project) {
      this.s.proposals = this.s.proposals.filter((p) => p.baseRevision === this.s.project.revision);
      clearTimeout(this.saveTimer);
      this.saveTimer = window.setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(this.s.project)); } catch { /* quota */ } }, 900);
    }
    this.subs.forEach((f) => f());
  }

  preview(): Proposal | undefined { return this.s.proposals.find((p) => p.id === this.s.previewId); }
  /** project drawn on the timeline (ghost diff included) */
  viewProject(): Project { return this.preview()?.preview ?? this.s.project; }
  /** project sent to the audio engine (preview only when auditioning) */
  playProject(): Project { return this.s.audition ? this.viewProject() : this.s.project; }

  dispatch(cmd: Command, label: string, source: Source = 'user', key?: string) {
    const before = this.s.project; const after = applyCommand(before, cmd);
    if (after === before) return;
    const nextProject = { ...after, revision: (before.revision ?? 1) + 1 };
    const now = Date.now(); let entries = this.s.entries.slice(0, this.s.cursor);
    const last = entries[entries.length - 1];
    if (key && last && last.key === key && now - last.time < 1500 && last.source === source) {
      entries[entries.length - 1] = { ...last, after: nextProject, time: now };
    } else {
      entries.push({ id: this.seq++, label, source, before, after: nextProject, time: now, key });
      if (entries.length > MAX_HISTORY) entries = entries.slice(entries.length - MAX_HISTORY);
    }
    this.set({ project: nextProject, entries, cursor: entries.length });
  }

  undo() { if (this.s.cursor > 0) { const e = this.s.entries[this.s.cursor - 1]; this.set({ project: { ...e.before, revision: e.before.revision ?? 1 }, cursor: this.s.cursor - 1 }); } }
  redo() { if (this.s.cursor < this.s.entries.length) { const e = this.s.entries[this.s.cursor]; this.set({ project: { ...e.after, revision: e.after.revision ?? 1 }, cursor: this.s.cursor + 1 }); } }
  jump(i: number) { // jump so that i entries are applied
    if (i === this.s.cursor) return;
    const project = i === 0 ? this.s.entries[0].before : this.s.entries[i - 1].after;
    this.set({ project: { ...project, revision: project.revision ?? 1 }, cursor: i });
  }
  replaceProject(project: Project) { this.set({ project: { ...project, revision: project.revision ?? 1 }, entries: [], cursor: 0, selection: { kind: 'none' }, proposals: [], previewId: null, audition: false, cursorBar: 0 }); }

  select(selection: Selection) { this.set({ selection }); }
  setCursor(b: number) { this.set({ cursorBar: Math.max(0, b) }); }
  setPlaying(playing: boolean) { this.set({ playing }); }
  addProposal(p: Proposal) { this.set({ proposals: [p, ...this.s.proposals].slice(0, 8), previewId: p.id, audition: false }); }
  dropProposal(id: string) { this.set({ proposals: this.s.proposals.filter((p) => p.id !== id), previewId: this.s.previewId === id ? null : this.s.previewId, audition: this.s.previewId === id ? false : this.s.audition }); }
  setPreview(id: string | null) { this.set({ previewId: id, audition: false }); }
  setAudition(on: boolean) { this.set({ audition: on }); }
  say(role: 'user' | 'ai', text: string) { this.set({ log: [...this.s.log, { id: this.seq++, role, text }].slice(-30) }); }
  dismissRestore() { this.set({ restored: false }); }

  async play() {
    this.set({ playing: true });
    try { await this.engine.play(this.s.cursorBar); } catch (e) { console.error(e); this.set({ playing: false }); }
  }
  stop() { this.engine.stop(); this.set({ playing: false }); }
  toggle() { if (this.s.playing) this.stop(); else void this.play(); }
}

export const store = new Store();
export const useApp = () => useSyncExternalStore(store.subscribe, store.get);
export const engine = store.engine;
