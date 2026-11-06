import {it,expect,afterEach,vi} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {Store} from '../src/store';
import {DurableProjectRepository} from '../src/engine/durablePersistence';
import {newProject,defaultParams} from '../src/engine/composer';
const repositories:DurableProjectRepository[]=[];const stores:Store[]=[];
afterEach(()=>{stores.forEach(s=>s.dispose());stores.length=0;repositories.forEach(r=>r.close());repositories.length=0;});
const repository=(f:IDBFactory)=>{const r=new DurableProjectRepository(f);repositories.push(r);return r;};
const local=()=>{const data=new Map<string,string>();return {getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};};
it('serializes rapid edits and undo/redo into durable commits and restores the latest score',async()=>{
 const f=new IDBFactory(),p=newProject(defaultParams()),r=repository(f),s=new Store(p,local(),r);stores.push(s);await s.ready;
 s.dispatch({type:'SET_NAME',name:'First'},'First');s.dispatch({type:'SET_NAME',name:'Second'},'Second');s.undo();s.redo();
 expect(await s.whenSaved()).toBe(true);expect((await r.load())?.project.name).toBe('Second');
 const reopened=new Store(undefined,local(),repository(f));stores.push(reopened);await reopened.ready;expect(reopened.get().project.name).toBe('Second');
});
it('never overwrites a newer local fallback automatically during hydration',async()=>{
 const {ProjectRepository}=await import('../src/engine/persistence');const f=new IDBFactory(),p=newProject(defaultParams()),r=repository(f);await r.save(p,{kind:'checkpoint',label:'Old',source:'user'},0);
 const storage=local();new ProjectRepository(storage).save({...p,name:'Uncommitted local edits',revision:2});
 const s=new Store(undefined,storage,r);stores.push(s);await s.ready;
 expect(s.get().project.name).toBe('Uncommitted local edits');expect(s.get().databaseRecovery).toBeTruthy();expect((await r.load())?.project.name).toBe(p.name);
 await s.keepCurrentRecovery();expect(await s.whenSaved()).toBe(true);expect((await r.load())?.project.name).toBe('Uncommitted local edits');
});
it('shows a database conflict while preserving unsaved in-memory edits',async()=>{
 const f=new IDBFactory(),p=newProject(defaultParams()),a=new Store(p,local(),repository(f));stores.push(a);await a.ready;
 const b=new Store(undefined,local(),repository(f));stores.push(b);await b.ready;
 a.dispatch({type:'SET_NAME',name:'A'},'A');await a.whenSaved();b.dispatch({type:'SET_NAME',name:'B'},'B');
 expect(await b.whenSaved()).toBe(false);expect(b.get().error).toMatch(/another window/i);expect(b.get().project.name).toBe('B');
 const recovery=await b.getDurableRecovery();await b.restoreDurable(recovery!);expect(await b.whenSaved()).toBe(true);expect(b.get().project.name).toBe('A');
});
it('blocks edits during hydration and starts audio in the original gesture after hydration',async()=>{
 const f=new IDBFactory(),r=repository(f),p=newProject(defaultParams());let finish!:(v:undefined)=>void;
 vi.spyOn(r,'load').mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const s=new Store(p,local(),r);stores.push(s);const play=vi.spyOn(s.engine,'play').mockResolvedValue();
 expect(s.dispatch({type:'SET_NAME',name:'Lost edit'},'Rename')).toBe(false);await s.play();expect(play).not.toHaveBeenCalled();
 finish(undefined);await s.ready;expect(s.get().project.name).toBe(p.name);
 const playing=s.play();expect(play).toHaveBeenCalledOnce();await playing;
});
it('requires a recovery decision for divergent lower-revision local work too',async()=>{
 const {ProjectRepository}=await import('../src/engine/persistence');const f=new IDBFactory(),p=newProject(defaultParams()),r=repository(f);
 await r.save({...p,name:'Other window',revision:9},{kind:'checkpoint',label:'Saved',source:'user'},0);
 const storage=local();new ProjectRepository(storage).save({...p,name:'Offline edits',revision:2});
 const s=new Store(undefined,storage,r);stores.push(s);await s.ready;
 expect(s.get().project.name).toBe('Offline edits');expect(s.get().databaseRecovery?.project.name).toBe('Other window');
});
