import type {Project} from './types';
import type {Command,Source} from './commands';
import {applyCommand} from './commands';
import {encodeSnapshot,decodeSnapshot} from './persistence';

export interface DurableEdit {
 kind:'command'|'checkpoint'|'undo'|'redo'|'restore';
 label:string;
 source:Source;
 command?:Command;
 before?:Project;
}
interface Head {version:1;token:number;snapshot:string;checksum:string}
export interface DurableLoad {project:Project;token:number;warning?:string}
interface JournalPayload {
 version:1;token:number;projectId:string;revision:number;kind:DurableEdit['kind'];label:string;source:Source;
 beforeChecksum?:string;afterChecksum:string;command?:Command;snapshot?:string;
}
interface JournalRecord {payload:string;checksum:string;bytes:number}
export class SaveConflictError extends Error {
 constructor(){super('Another window saved a newer project. Download a backup of your edits, then reload the saved project.');this.name='SaveConflictError';}
}
const MAX_JOURNAL_RECORDS=256,MAX_JOURNAL_BYTES=8*1024*1024;
async function checksum(text:string){
 if(!globalThis.crypto?.subtle)throw new Error('SHA-256 is unavailable; database persistence requires a secure context.');
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
 return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}
function assertHead(value:Head){
 if(!value||value.version!==1)throw new Error('Unsupported durable save version; original data retained');
 if(!Number.isSafeInteger(value.token)||value.token<1||typeof value.snapshot!=='string'||typeof value.checksum!=='string')throw new Error('Invalid durable save record');
}
async function decodeHead(value:Head){
 assertHead(value);if(await checksum(value.snapshot)!==value.checksum)throw new Error('Durable snapshot checksum mismatch');
 return decodeSnapshot(value.snapshot);
}
async function decodeJournal(record:JournalRecord):Promise<JournalPayload>{
 if(!record||typeof record.payload!=='string'||record.payload.length>32*1024*1024||await checksum(record.payload)!==record.checksum)throw new Error('Journal checksum mismatch');
 const entry=JSON.parse(record.payload) as JournalPayload;
 if(entry.version!==1||!Number.isSafeInteger(entry.token)||entry.token<1||!['command','checkpoint','undo','redo','restore'].includes(entry.kind))throw new Error('Unsupported journal entry');
 return entry;
}

/** No asynchronous work is performed inside a live read/write IDB transaction. */
export class DurableProjectRepository {
 private connection?:Promise<IDBDatabase>;
 constructor(private factory:IDBFactory,private name='aidaw.durable.v1'){}
 private open(){
  if(!this.connection){
   this.connection=new Promise<IDBDatabase>((resolve,reject)=>{
    const request=this.factory.open(this.name,1);
    request.onupgradeneeded=()=>{const db=request.result;for(const name of ['state','journal','quarantine'])if(!db.objectStoreNames.contains(name))db.createObjectStore(name,name==='quarantine'?{autoIncrement:true}:undefined);};
    request.onerror=()=>reject(request.error??new Error('Database open failed'));
    request.onblocked=()=>reject(new Error('Database upgrade blocked by another window'));
    request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();this.connection=undefined;};resolve(db);};
   }).catch(error=>{this.connection=undefined;throw error;});
  }
  return this.connection;
 }
 close(){void this.connection?.then(db=>db.close(),()=>{});this.connection=undefined;}
 private async records(){
  const db=await this.open();return new Promise<{active?:Head;previous?:Head;last?:JournalRecord}>((resolve,reject)=>{
   const tx=db.transaction(['state','journal'],'readonly');const state=tx.objectStore('state');const active=state.get('active'),previous=state.get('previous');const last=tx.objectStore('journal').openCursor(null,'prev');let lastValue:JournalRecord|undefined;
   last.onsuccess=()=>{lastValue=last.result?.value;};
   tx.oncomplete=()=>resolve({active:active.result,previous:previous.result,last:lastValue});tx.onabort=()=>reject(tx.error??new Error('Database read aborted'));tx.onerror=()=>reject(tx.error??new Error('Database read failed'));
  });
 }
 async load():Promise<DurableLoad|undefined>{
  const {active,previous,last}=await this.records();
  if(!active){if(previous||last)throw new Error('Database head is missing; recovery records retained without overwriting.');return undefined;}
  // Future formats must never be implicitly downgraded or overwritten.
  assertHead(active);
  try{return {project:await decodeHead(active),token:active.token};}
  catch(error){
   let base:Project|undefined;
   if(previous){try{base=await decodeHead(previous);}catch{/* A verified checkpoint can still recover without a usable base. */}}
   if(last){
    try{
     const entry=await decodeJournal(last);
     if(entry.token===active.token&&entry.afterChecksum===active.checksum){
      let candidate:Project|undefined;
      if(entry.snapshot)candidate=decodeSnapshot(entry.snapshot);
      else if(base&&entry.command&&entry.beforeChecksum===previous?.checksum)candidate={...applyCommand(base,entry.command),revision:entry.revision};
      if(candidate&&await checksum(encodeSnapshot(candidate))===entry.afterChecksum)return {project:candidate,token:active.token,warning:'Recovered the latest save from the verified journal; damaged snapshot bytes are retained.'};
     }
    }catch{/* An invalid journal cannot replace the verified previous snapshot. */}
   }
   if(base)return {project:base,token:active.token,warning:'Recovered the previous valid database save; damaged snapshot bytes are retained.'};
   throw error;
  }
 }
 async save(project:Project,edit:DurableEdit,expectedToken:number):Promise<number>{
  if(!Number.isSafeInteger(expectedToken)||expectedToken<0||expectedToken>=Number.MAX_SAFE_INTEGER)throw new Error('Invalid save token');
  const snapshot=encodeSnapshot(project),digest=await checksum(snapshot);const records=await this.records();const old=records.active;
  if(!old&&(records.previous||records.last))throw new Error('Database head is missing; recovery records retained without overwriting.');
  if(old)assertHead(old);
  if((old?.token??0)!==expectedToken)throw new SaveConflictError();
  const beforeSnapshot=edit.before?encodeSnapshot(edit.before):undefined;
  let validOld=false;
  if(old){try{await decodeHead(old);validOld=true;}catch{/* Archive damaged bytes atomically instead of rotating them into the good backup. */}}
  if(edit.command){
   if(!edit.before)throw new Error('Journal command requires a base project');
   if(validOld&&beforeSnapshot!==old!.snapshot)throw new SaveConflictError();
   const replayed={...applyCommand(edit.before,edit.command),revision:project.revision};
   if(encodeSnapshot(replayed)!==snapshot)throw new Error('Journal command does not reproduce the committed project');
  }
  const token=expectedToken+1;
  const entry:JournalPayload={version:1,token,projectId:project.id,revision:project.revision,kind:edit.kind,label:edit.label,source:edit.source,afterChecksum:digest,
   ...(beforeSnapshot?{beforeChecksum:await checksum(beforeSnapshot)}:{}),
   ...(edit.command?{command:structuredClone(edit.command)}:{snapshot})};
  const payload=JSON.stringify(entry);const record:JournalRecord={payload,checksum:await checksum(payload),bytes:new TextEncoder().encode(payload).byteLength};
  if(record.bytes>32*1024*1024)throw new Error('Journal record exceeds 32 MiB limit');
  const head:Head={version:1,token,snapshot,checksum:digest};const db=await this.open();
  return new Promise<number>((resolve,reject)=>{
   const tx=db.transaction(['state','journal','quarantine'],'readwrite');const state=tx.objectStore('state');const request=state.get('active');let failure:unknown;
   request.onsuccess=()=>{
    try{
     const current=request.result as Head|undefined;
     if((current?.token??0)!==expectedToken||current?.checksum!==old?.checksum||current?.snapshot!==old?.snapshot)throw new SaveConflictError();
     if(old){
      if(validOld)state.put(old,'previous');else tx.objectStore('quarantine').add(old);
     }
     state.put(head,'active');const journal=tx.objectStore('journal');journal.put(record,token);
     // Retain the newest complete entry even when it alone exceeds the soft byte budget.
     let bytes=0,count=0;const cursor=journal.openCursor(null,'prev');
     cursor.onsuccess=()=>{const c=cursor.result;if(!c)return;count++;bytes+=(c.value as JournalRecord).bytes;if(count>MAX_JOURNAL_RECORDS||(count>1&&bytes>MAX_JOURNAL_BYTES))c.delete();c.continue();};
    }catch(error){failure=error;tx.abort();}
   };
   tx.oncomplete=()=>resolve(token);tx.onabort=()=>reject(failure??tx.error??new Error('Database transaction aborted'));tx.onerror=()=>{failure??=tx.error;};
  });
 }
 async readJournal(){
  const db=await this.open();const rows=await new Promise<JournalRecord[]>((resolve,reject)=>{
   const tx=db.transaction('journal','readonly'),request=tx.objectStore('journal').getAll();tx.oncomplete=()=>resolve(request.result);tx.onabort=()=>reject(tx.error??new Error('Journal read aborted'));
  });
  const entries:JournalPayload[]=[];for(const row of rows)entries.push(await decodeJournal(row));return entries;
 }
}
