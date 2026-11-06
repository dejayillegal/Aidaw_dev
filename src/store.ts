import { useSyncExternalStore } from 'react';
import type { Project, Selection } from './engine/types';
import { applyCommand, type Command, type HistoryEntry, type Source } from './engine/commands';
import { defaultParams, newProject } from './engine/composer';
import { assertProject } from './engine/validation';
import { ProjectRepository } from './engine/persistence';
import { Engine } from './engine/audio';
import type { Proposal } from './engine/assist';

export interface LogMsg { id: number; role: 'user' | 'ai'; text: string }
export interface AppState {
  project: Project; entries: HistoryEntry[]; cursor: number;
  selection: Selection; proposals: Proposal[]; previewId: string | null; audition: boolean;
  error: string | null; saveStatus: string;
  playing: boolean; cursorBar: number; log: LogMsg[]; restored: boolean; version: number;
}

const MAX_HISTORY = 120;

export class Store {
  private s: AppState; private subs = new Set<() => void>(); private seq = 1; private saveTimer?: ReturnType<typeof setTimeout>;
  private repository: ProjectRepository;
  engine = new Engine();

  constructor(initial?:Project, storage?:Pick<Storage,'getItem'|'setItem'>) {
    let availableStorage=storage;
    if(!availableStorage){try{availableStorage=globalThis.localStorage;}catch{/* Save attempts report unavailable storage without blocking startup. */}}
    this.repository=new ProjectRepository(availableStorage);
    const loaded=initial?{project:initial}:this.repository.load();
    const l={project:loaded.project??newProject(defaultParams('hypnotic',1337)),restored:!!loaded.project&&!initial};
    assertProject(l.project);
    this.s = { project: l.project, entries: [], cursor: 0, selection: { kind: 'none' }, proposals: [], previewId: null, audition: false, playing: false, cursorBar: 0, log: [], restored: l.restored, version: 0, error: loaded.warning??null, saveStatus: l.restored?'Restored':'Unsaved' };
    this.engine.getProject = () => this.playProject();
    this.engine.onError = e=>this.reportError(e);
    this.engine.onStop = () => this.set({ playing: false });
  }

  subscribe = (f: () => void) => { this.subs.add(f); return () => { this.subs.delete(f); }; };
  get = () => this.s;

  private set(patch: Partial<AppState>) {
    if(patch.project){
      patch={...patch,project:{...patch.project,revision:this.s.project.revision+1},proposals:[],previewId:null,audition:false,saveStatus:'Saving…'};
      clearTimeout(this.saveTimer);
      this.saveTimer=setTimeout(()=>this.flushSave(),900);
    }
    this.s={...this.s,...patch,version:this.s.version+1};
    this.subs.forEach(f=>f());
  }
  flushSave(){
    clearTimeout(this.saveTimer);
    try{this.repository.save(this.s.project);this.set({saveStatus:'Saved'});return true;}
    catch(e){this.set({saveStatus:'Save failed',error:e instanceof Error?e.message:String(e)});return false;}
  }
  clearError(){this.set({error:null});}
  reportError(e:unknown){this.set({error:e instanceof Error?e.message:String(e)});}
  acceptProposal(id:string){
    const pr=this.s.proposals.find(p=>p.id===id);
    if(!pr||pr.projectId!==this.s.project.id||pr.baseRevision!==this.s.project.revision){this.reportError('Proposal is stale; regenerate it');return false;}
    return this.dispatch(pr.cmd,`AI · ${pr.title}`,'ai');
  }

  preview(): Proposal | undefined { return this.s.proposals.find((p) => p.id === this.s.previewId); }
  /** project drawn on the timeline (ghost diff included) */
  viewProject(): Project { return this.preview()?.preview ?? this.s.project; }
  /** project sent to the audio engine (preview only when auditioning) */
  playProject(): Project { return this.s.audition ? this.viewProject() : this.s.project; }

  dispatch(cmd: Command, label: string, source: Source = 'user', key?: string) {
    const before = this.s.project; let after:Project;
    try{after=applyCommand(before,cmd);}catch(e){this.reportError(e);return false;}
    if (after === before) return;
    const now = Date.now(); let entries = this.s.entries.slice(0, this.s.cursor);
    const last = entries[entries.length - 1];
    if (key && last && last.key === key && now - last.time < 1500 && last.source === source) {
      entries[entries.length - 1] = { ...last, after, time: now };
    } else {
      entries.push({ id: this.seq++, label, source, before, after, time: now, key });
      if (entries.length > MAX_HISTORY) entries = entries.slice(entries.length - MAX_HISTORY);
    }
    this.set({ project: after, entries, cursor: entries.length });
    return true;
  }

  undo() { if (this.s.cursor > 0) { const e = this.s.entries[this.s.cursor - 1]; this.set({ project: e.before, cursor: this.s.cursor - 1 }); } }
  redo() { if (this.s.cursor < this.s.entries.length) { const e = this.s.entries[this.s.cursor]; this.set({ project: e.after, cursor: this.s.cursor + 1 }); } }
  jump(i: number) { // jump so that i entries are applied
    if (!Number.isInteger(i)||i<0||i>this.s.entries.length||i === this.s.cursor) return;
    const project = i === 0 ? this.s.entries[0].before : this.s.entries[i - 1].after;
    this.set({ project, cursor: i });
  }
  replaceProject(project: Project) { assertProject(project); this.stop(); this.set({ project, entries: [], cursor: 0, selection: { kind: 'none' }, proposals: [], previewId: null, audition: false, cursorBar: 0 }); }

  select(selection: Selection) { this.set({ selection }); }
  setCursor(b: number) { this.set({ cursorBar: Math.max(0, b) }); }
  setPlaying(playing: boolean) { this.set({ playing }); }
  propose(factory:()=>Proposal){try{this.addProposal(factory());}catch(e){this.reportError(e);}}
  addProposal(p: Proposal) { if(p.projectId!==this.s.project.id||p.baseRevision!==this.s.project.revision){this.reportError('Proposal is stale; regenerate it');return;} this.set({ proposals: [p, ...this.s.proposals].slice(0, 8), previewId: p.id, audition: false }); }
  dropProposal(id: string) { this.set({ proposals: this.s.proposals.filter((p) => p.id !== id), previewId: this.s.previewId === id ? null : this.s.previewId, audition: this.s.previewId === id ? false : this.s.audition }); }
  setPreview(id: string | null) { this.set({ previewId: id, audition: false }); }
  setAudition(on: boolean) { this.set({ audition: on }); }
  say(role: 'user' | 'ai', text: string) { this.set({ log: [...this.s.log, { id: this.seq++, role, text }].slice(-30) }); }
  dismissRestore() { this.set({ restored: false }); }

  async play() {
    this.set({ playing: true });
    try { await this.engine.play(this.s.cursorBar); } catch (e) { this.reportError(e); this.set({ playing: false }); }
  }
  stop() { this.engine.stop(); this.set({ playing: false }); }
  toggle() { if (this.s.playing) this.stop(); else void this.play(); }
}

export const store = new Store();
export const useApp = () => useSyncExternalStore(store.subscribe, store.get);
export const engine = store.engine;
