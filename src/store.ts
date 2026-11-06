import { useSyncExternalStore } from 'react';
import type { Project, Selection } from './engine/types';
import { applyCommand, type Command, type HistoryEntry, type Source } from './engine/commands';
import { defaultParams, newProject } from './engine/composer';
import { assertProject } from './engine/validation';
import {DurableProjectRepository,type DurableEdit,type DurableLoad} from './engine/durablePersistence';
import {encodeSnapshot} from './engine/persistence';
import { ProjectRepository } from './engine/persistence';
import { Engine } from './engine/audio';
import type { Proposal } from './engine/assist';

export interface LogMsg { id: number; role: 'user' | 'ai'; text: string }
export interface AppState {
  project: Project; entries: HistoryEntry[]; cursor: number;
  selection: Selection; proposals: Proposal[]; previewId: string | null; audition: boolean;
  databaseRecovery?:DurableLoad;
  error: string | null; saveStatus: string;
  playing: boolean; cursorBar: number; log: LogMsg[]; restored: boolean; version: number;
}

const MAX_HISTORY = 120;

export class Store {
  private s: AppState; private subs = new Set<() => void>(); private seq = 1; private saveTimer?: ReturnType<typeof setTimeout>;
  private repository: ProjectRepository;
  private durable?:DurableProjectRepository;
  private durableToken=0;
  private durableQueue:Promise<void>=Promise.resolve();
  private pendingWrites=0;
  private durableBlocked=false;
  private hydrating=false;
  readonly ready:Promise<void>;
  engine = new Engine();

  constructor(initial?:Project, storage?:Pick<Storage,'getItem'|'setItem'>, durable?:DurableProjectRepository|null) {
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
    if(durable)this.durable=durable;
    else if(durable!==null){try{if(globalThis.indexedDB)this.durable=new DurableProjectRepository(globalThis.indexedDB);}catch{/* Local snapshots remain available when database access is denied. */}}
    this.hydrating=!!this.durable;
    if(this.hydrating)this.s.saveStatus='Opening database…';
    this.ready=this.durable?this.initializeDurable(!!initial||!!loaded.project):Promise.resolve();
  }

  private async initializeDurable(hasCandidate:boolean){
    try{
      const recovered=await this.durable!.load();
      if(recovered){
        this.durableToken=recovered.token;
        const local=this.s.project;
        const differs=encodeSnapshot(local)!==encodeSnapshot(recovered.project);
        // Revision counters from separate windows do not prove ancestry.
        if(hasCandidate&&differs){
          this.durableBlocked=true;this.set({databaseRecovery:recovered,saveStatus:'Recovery decision needed',error:'Local edits differ from the database save. Back up your current project, then choose which version to keep in the Project menu.'});
        }else{
          // Edits are blocked during hydration; installing recovered bytes cannot discard a command.
          this.s={...this.s,project:recovered.project,restored:true,saveStatus:'Restored from database',selection:{kind:'none'},version:this.s.version+1,error:recovered.warning??this.s.error};
          this.subs.forEach(f=>f());
        }
      }else{
        this.durableToken=await this.durable!.save(this.s.project,{kind:'checkpoint',label:'Initial project',source:'user'},0);
        this.set({saveStatus:'Saved'});
      }
    }catch(error){this.durableBlocked=true;this.set({saveStatus:'Database save unavailable'});this.reportError(error);}
    finally{this.hydrating=false;}
  }
  private writable(){if(this.hydrating){this.reportError('Opening the saved database project; retry your edit when recovery completes.');return false;}return true;}
  private persistEdit(edit:DurableEdit,before:Project){
    if(!this.durable)return;
    const project=this.s.project;
    if(this.durableBlocked)return;
    this.pendingWrites++;this.set({saveStatus:'Saving…'});
    this.durableQueue=this.durableQueue.then(async()=>{
      if(this.durableBlocked)return;
      this.durableToken=await this.durable!.save(project,{...edit,before},this.durableToken);
    }).catch(error=>{this.durableBlocked=true;this.set({saveStatus:'Database save failed'});this.reportError(error);}).finally(()=>{
      this.pendingWrites--;if(!this.pendingWrites&&!this.durableBlocked)this.set({saveStatus:'Saved'});
    });
  }
  async whenSaved(){await this.ready;let pending:Promise<void>;do{pending=this.durableQueue;await pending;}while(pending!==this.durableQueue);return !this.durableBlocked;}
  async getDurableRecovery(){await this.whenSaved();return this.durable?.load();}
  async restoreDurable(recovered:DurableLoad){
    await this.whenSaved();this.durableToken=recovered.token;this.durableBlocked=false;
    this.set({databaseRecovery:undefined,error:recovered.warning??null});this.replaceProject(recovered.project);
  }
  async keepCurrentRecovery(){
    await this.whenSaved();const recovery=this.s.databaseRecovery;if(!recovery)return;
    this.durableToken=recovery.token;this.durableBlocked=false;this.set({databaseRecovery:undefined,error:null});
    this.persistEdit({kind:'restore',label:'Keep local recovery edits',source:'user'},this.s.project);
  }
  dispose(){clearTimeout(this.saveTimer);this.engine.stop();this.subs.clear();void this.ready.then(()=>this.durableQueue).finally(()=>this.durable?.close());}

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
    try{this.repository.save(this.s.project);this.set({saveStatus:this.durableBlocked?'Database save unavailable':this.hydrating?'Opening database…':this.pendingWrites?'Saving…':'Saved'});return true;}
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
    if(!this.writable())return false;
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
    this.persistEdit({kind:'command',label,source,command:structuredClone(cmd)},before);
    return true;
  }

  undo() {
    if(!this.writable()||this.s.cursor<=0)return;const before=this.s.project,e=this.s.entries[this.s.cursor-1];
    this.set({project:e.before,cursor:this.s.cursor-1});this.persistEdit({kind:'undo',label:`Undo ${e.label}`,source:'user'},before);
  }
  redo() {
    if(!this.writable()||this.s.cursor>=this.s.entries.length)return;const before=this.s.project,e=this.s.entries[this.s.cursor];
    this.set({project:e.after,cursor:this.s.cursor+1});this.persistEdit({kind:'redo',label:`Redo ${e.label}`,source:'user'},before);
  }
  jump(i:number){
    if(!this.writable()||!Number.isInteger(i)||i<0||i>this.s.entries.length||i===this.s.cursor)return;
    const before=this.s.project,project=i===0?this.s.entries[0].before:this.s.entries[i-1].after;
    this.set({project,cursor:i});this.persistEdit({kind:'checkpoint',label:'History jump',source:'user'},before);
  }
  replaceProject(project:Project){
    if(!this.writable())return;assertProject(project);const before=this.s.project;this.stop();
    this.set({project,entries:[],cursor:0,selection:{kind:'none'},proposals:[],previewId:null,audition:false,cursorBar:0});
    this.persistEdit({kind:'restore',label:'Open project',source:'user'},before);
  }

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
    // Do not defer gesture-triggered AudioContext.resume() behind database I/O.
    if(!this.writable())return;
    this.set({ playing: true });
    try { await this.engine.play(this.s.cursorBar); } catch (e) { this.reportError(e); this.set({ playing: false }); }
  }
  stop() { this.engine.stop(); this.set({ playing: false }); }
  toggle() { if (this.s.playing) this.stop(); else void this.play(); }
}

export const store = new Store();
export const useApp = () => useSyncExternalStore(store.subscribe, store.get);
export const engine = store.engine;
