import {useEffect,useRef,useState} from 'react';
import type {Project} from '../engine/types';
import {decodeSnapshot,encodeSnapshot} from '../engine/persistence';
import {store,useApp} from '../store';
import {seek,toggleLoop} from '../actions';
import {Btn} from '../ui';

/** Explicit file ownership complements autosave; import never overwrites on file selection. */
export function ProjectFiles({compact}:{compact:boolean}){
 const app=useApp();const input=useRef<HTMLInputElement>(null);const urls=useRef(new Set<string>());
 const [pending,setPending]=useState<Project|null>(null);
 useEffect(()=>()=>{for(const url of urls.current)URL.revokeObjectURL(url);},[]);
 const save=()=>{
  try{
   const blob=new Blob([encodeSnapshot(store.get().project)],{type:'application/json'}),url=URL.createObjectURL(blob);urls.current.add(url);
   const anchor=document.createElement('a');anchor.href=url;anchor.download=`${store.get().project.name.replace(/[^\w.-]+/g,'_')}.aidaw.json`;anchor.click();
   setTimeout(()=>{URL.revokeObjectURL(url);urls.current.delete(url);},1000);
  }catch(error){store.reportError(error);}
 };
 return <>
  <details className="relative shrink-0">
   <summary className="flex min-h-12 cursor-pointer items-center rounded border border-line px-2 text-[11px]" aria-label="Project files and editing commands">Project ▾</summary>
   <div className="absolute left-0 top-full z-[90] flex w-64 flex-col gap-2 rounded border border-line bg-panel p-3 shadow-2xl">
    <span role="status" className="text-[10px] text-slate-400">{app.saveStatus} · project v1</span>
    <Btn onClick={save}>Download project backup</Btn>
    <Btn onClick={()=>input.current?.click()}>Open project…</Btn>
    <Btn onClick={()=>store.flushSave()}>Save autosave now</Btn>
    {compact&&<>
     <Btn disabled={app.cursor===0} onClick={()=>store.undo()}>Undo</Btn>
     <Btn disabled={app.cursor===app.entries.length} onClick={()=>store.redo()}>Redo</Btn>
     <Btn onClick={()=>seek(0)}>Return to start</Btn><Btn active={app.project.loop.on} onClick={toggleLoop}>Loop selected section</Btn>
    </>}
   </div>
  </details>
  <input ref={input} type="file" accept=".json,.aidaw.json,application/json" className="hidden" aria-label="Open AIDAW project" onChange={async event=>{
   const file=event.target.files?.[0];event.target.value='';if(!file)return;
   try{if(file.size>32*1024*1024)throw new Error('Project exceeds 32 MiB import limit');setPending(decodeSnapshot(await file.text()));}catch(error){store.reportError(error);}
  }}/>
  {pending&&<div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4">
   <div role="dialog" aria-modal="true" aria-label="Open project confirmation" className="w-full max-w-md rounded border border-line bg-panel p-4">
    <h2 className="mb-2 font-semibold">Open {pending.name}?</h2><p className="mb-3 text-slate-400">This replaces the active workspace and its undo history. Download a backup of your current work before opening.</p>
    <div className="flex flex-wrap gap-2"><Btn onClick={save}>Back up current project</Btn><Btn onClick={()=>setPending(null)}>Cancel</Btn><Btn tone="amber" onClick={()=>{store.replaceProject(pending);setPending(null);}}>Open project</Btn></div>
   </div>
  </div>}
 </>;
}
