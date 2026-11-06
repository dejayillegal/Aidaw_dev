import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {IDBFactory,IDBObjectStore} from 'fake-indexeddb';
import {DurableProjectRepository} from '../src/engine/durablePersistence';
import {newProject,defaultParams} from '../src/engine/composer';
import {applyCommand} from '../src/engine/commands';
let factory:IDBFactory;let repositories:DurableProjectRepository[];
beforeEach(()=>{factory=new IDBFactory();repositories=[];});
afterEach(()=>{vi.restoreAllMocks();repositories.forEach(r=>r.close());});
const repo=()=>{const r=new DurableProjectRepository(factory);repositories.push(r);return r;};
it('atomically persists a validated snapshot and typed, checksummed command journal',async()=>{
 const r=repo(),p=newProject(defaultParams());const first=await r.save(p,{kind:'checkpoint',label:'Start',source:'user'},0);
 const command={type:'SET_NAME' as const,name:'Recorded'};const next={...applyCommand(p,command),revision:p.revision+1};
 const token=await r.save(next,{kind:'command',label:'Rename',source:'user',command,before:p},first);
 expect((await r.load())?.project).toEqual(next);expect(token).toBe(2);
 const journal=await r.readJournal();expect(journal.map(e=>e.kind)).toEqual(['checkpoint','command']);expect(journal[1].command).toEqual(command);
});
it('rejects stale windows without overwriting a newer save',async()=>{
 const a=repo(),b=repo(),p=newProject(defaultParams());await a.save(p,{kind:'checkpoint',label:'Start',source:'user'},0);
 const stale=await b.load();await a.save({...p,name:'Window A',revision:2},{kind:'checkpoint',label:'A',source:'user'},1);
 await expect(b.save({...p,name:'Window B',revision:2},{kind:'checkpoint',label:'B',source:'user'},stale!.token)).rejects.toThrow(/another window|conflict/i);
 expect((await a.load())?.project.name).toBe('Window A');expect(await a.readJournal()).toHaveLength(2);
});
it('rolls back snapshot, previous revision and journal when a write fails',async()=>{
 const r=repo(),p=newProject(defaultParams());await r.save(p,{kind:'checkpoint',label:'Start',source:'user'},0);
 const put=IDBObjectStore.prototype.put;vi.spyOn(IDBObjectStore.prototype,'put').mockImplementation(function(this:IDBObjectStore,...args:Parameters<IDBObjectStore['put']>){if(this.name==='journal')throw new DOMException('Full','QuotaExceededError');return put.apply(this,args);});
 await expect(r.save({...p,name:'Unsaved'},{kind:'checkpoint',label:'Fail',source:'user'},1)).rejects.toThrow();vi.restoreAllMocks();
 expect((await r.load())?.project).toEqual(p);expect(await r.readJournal()).toHaveLength(1);
});
it('detects journal tampering rather than returning unchecked edits',async()=>{
 const r=repo(),p=newProject(defaultParams());await r.save(p,{kind:'checkpoint',label:'Start',source:'user'},0);
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const q=factory.open('aidaw.durable.v1');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
 await new Promise<void>((resolve,reject)=>{const tx=db.transaction('journal','readwrite');const store=tx.objectStore('journal');const q=store.get(1);q.onsuccess=()=>{const payload=JSON.parse(q.result.payload);payload.label='Tampered';store.put({...q.result,payload:JSON.stringify(payload)},1);};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});db.close();
 await expect(r.readJournal()).rejects.toThrow(/checksum/i);
});
it('reconstructs the latest command from the previous snapshot after head corruption',async()=>{
 const r=repo(),p=newProject(defaultParams());await r.save(p,{kind:'checkpoint',label:'Start',source:'user'},0);
 const command={type:'SET_NAME' as const,name:'Recovered latest'};const next={...applyCommand(p,command),revision:2};await r.save(next,{kind:'command',label:'Rename',source:'user',command,before:p},1);
 const db=await new Promise<IDBDatabase>(resolve=>{const q=factory.open('aidaw.durable.v1');q.onsuccess=()=>resolve(q.result);});
 await new Promise<void>(resolve=>{const tx=db.transaction('state','readwrite'),s=tx.objectStore('state'),q=s.get('active');q.onsuccess=()=>s.put({...q.result,snapshot:'damaged'},'active');tx.oncomplete=()=>resolve();});db.close();
 const restored=await r.load();expect(restored?.project.name).toBe('Recovered latest');expect(restored?.warning).toMatch(/journal/);
});
it('recovers the first checkpoint even when no previous snapshot exists',async()=>{
 const r=repo(),p=newProject(defaultParams());await r.save(p,{kind:'checkpoint',label:'First',source:'user'},0);
 const db=await new Promise<IDBDatabase>(resolve=>{const q=factory.open('aidaw.durable.v1');q.onsuccess=()=>resolve(q.result);});
 await new Promise<void>(resolve=>{const tx=db.transaction('state','readwrite'),s=tx.objectStore('state'),q=s.get('active');q.onsuccess=()=>s.put({...q.result,snapshot:'damaged'},'active');tx.oncomplete=()=>resolve();});db.close();
 expect((await r.load())?.project.name).toBe(p.name);
});
it('bounds journal retention while retaining the current verified head',async()=>{
 const r=repo(),p=newProject(defaultParams());p.tracks=[];p.auto=[];
 for(let n=0;n<270;n++)await r.save({...p,name:`Revision ${n}`,revision:n+1},{kind:'checkpoint',label:'Edit',source:'user'},n);
 const entries=await r.readJournal();expect(entries).toHaveLength(256);expect(entries[0].token).toBe(15);expect((await r.load())?.project.name).toBe('Revision 269');
});
it('retains future-format saves and rejects downgrading writes',async()=>{
 const r=repo(),p=newProject(defaultParams());await r.save(p,{kind:'checkpoint',label:'Start',source:'user'},0);
 const db=await new Promise<IDBDatabase>(resolve=>{const q=factory.open('aidaw.durable.v1');q.onsuccess=()=>resolve(q.result);});
 await new Promise<void>(resolve=>{const tx=db.transaction('state','readwrite'),s=tx.objectStore('state'),q=s.get('active');q.onsuccess=()=>s.put({...q.result,version:2},'active');tx.oncomplete=()=>resolve();});db.close();
 await expect(r.load()).rejects.toThrow(/unsupported/i);await expect(r.save(p,{kind:'checkpoint',label:'Overwrite',source:'user'},1)).rejects.toThrow(/unsupported/i);expect(await r.readJournal()).toHaveLength(1);
});
it('does not initialize over orphaned recovery records after head loss',async()=>{
 const r=repo(),p=newProject(defaultParams());await r.save(p,{kind:'checkpoint',label:'Start',source:'user'},0);
 const db=await new Promise<IDBDatabase>(resolve=>{const q=factory.open('aidaw.durable.v1');q.onsuccess=()=>resolve(q.result);});
 await new Promise<void>(resolve=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').delete('active');tx.oncomplete=()=>resolve();});db.close();
 await expect(r.load()).rejects.toThrow(/head is missing/);await expect(r.save(p,{kind:'checkpoint',label:'Reset',source:'user'},0)).rejects.toThrow(/head is missing/);expect(await r.readJournal()).toHaveLength(1);
});
