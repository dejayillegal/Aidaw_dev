import {it,expect} from 'vitest';
import {newProject,defaultParams} from '../src/engine/composer';
import {encodeSnapshot,decodeSnapshot,ProjectRepository} from '../src/engine/persistence';
class MemoryStorage { data=new Map<string,string>();getItem(k:string){return this.data.get(k)??null;}setItem(k:string,v:string){this.data.set(k,v);} }
it('round-trips and detects changed payload bytes',()=>{
 const p=newProject(defaultParams());const raw=encodeSnapshot(p);expect(decodeSnapshot(raw)).toEqual(p);
 const e=JSON.parse(raw);e.payload=e.payload.replace(p.name,'Tampered');expect(()=>decodeSnapshot(JSON.stringify(e))).toThrow(/checksum/i);
});
it('migrates legacy v1 without changing notes or source bytes',()=>{
 const p=newProject(defaultParams());const legacy={...p} as Record<string,unknown>;delete legacy.id;delete legacy.revision;
 const raw=JSON.stringify(legacy);const db=new MemoryStorage();db.setItem('aidaw.project.v1',raw);
 const loaded=new ProjectRepository(db).load();expect(loaded.project?.tracks).toEqual(p.tracks);
 expect(db.getItem('aidaw.project.v1')).toBe(raw);expect(decodeSnapshot(raw).id).toBe(decodeSnapshot(raw).id);
});
it('recovers the previous valid save when current data is corrupted',()=>{
 const db=new MemoryStorage();const repo=new ProjectRepository(db);const p=newProject(defaultParams());repo.save(p);repo.save({...p,name:'next'});
 db.setItem('aidaw.snapshot.current','broken');const restored=repo.load();expect(restored.project?.name).toBe(p.name);expect(restored.warning).toBeTruthy();
 repo.save(p);expect([...db.data.values()]).toContain('broken');
});
