import type { Project } from './types';
import { hash } from './theory';
import { assertProject } from './validation';

const CURRENT='aidaw.snapshot.current', BACKUP='aidaw.snapshot.previous', LEGACY='aidaw.project.v1';
export type ProjectStorage=Pick<Storage,'getItem'|'setItem'>;
export function encodeSnapshot(project:Project):string {
 assertProject(project);const payload=JSON.stringify(project);
 // Corruption detection, not an authenticity/signature guarantee.
 return JSON.stringify({format:'aidaw.snapshot',version:1,checksum:hash(payload).toString(16),payload});
}
export function decodeSnapshot(raw:string):Project {
 if(raw.length>32*1024*1024)throw new Error('Project exceeds 32 MiB import limit');
 let value=JSON.parse(raw);
 if(value?.format==='aidaw.snapshot'){
  if(value.version!==1)throw new Error('Unsupported snapshot version');
  if(typeof value.payload!=='string'||hash(value.payload).toString(16)!==value.checksum)throw new Error('Snapshot checksum mismatch');
  value=JSON.parse(value.payload);
 }
 if(!value||value.v!==1)throw new Error('Unsupported project version');
 const project={...value,id:value.id??`legacy_${hash(raw).toString(16)}`,revision:value.revision??1};
 assertProject(project);return project;
}
/** Individual setItem writes are atomic. Previous and original legacy bytes are retained. */
export class ProjectRepository {
 constructor(private storage?:ProjectStorage){}
 load():{project?:Project;warning?:string}{
  if(!this.storage)return {};
  const failures:string[]=[];
  for(const key of [CURRENT,BACKUP,LEGACY]){
   try{const raw=this.storage.getItem(key);if(!raw)continue;const project=decodeSnapshot(raw);return {project,warning:failures.length?`Recovered a previous save. ${failures.join(' ')}`:undefined};}
   catch(e){failures.push(`${key}: ${e instanceof Error?e.message:String(e)}`);}
  }
  return failures.length?{warning:`Saved data could not be opened and has been retained. ${failures.join(' ')}`} : {};
 }
 save(project:Project){
  if(!this.storage)throw new Error('Persistent storage unavailable; download your project');
  const raw=encodeSnapshot(project);const previous=this.storage.getItem(CURRENT);
  if(previous){
   let valid=false;try{decodeSnapshot(previous);valid=true;}catch{/* Preserve unrecognized bytes before replacement. */}
   this.storage.setItem(valid?BACKUP:`aidaw.snapshot.quarantine.${Date.now()}`,previous);
  }
  this.storage.setItem(CURRENT,raw);
  if(this.storage.getItem(CURRENT)!==raw)throw new Error('Save readback verification failed');
 }
}
