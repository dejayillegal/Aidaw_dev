import { describe,it,expect } from 'vitest';
import { applyCommand, type Command } from '../src/engine/commands';
import { defaultParams,newProject } from '../src/engine/composer';
import { buildProposal } from '../src/engine/assist';

describe('command integrity',()=>{
 it('rejects a malformed transaction without mutating its input',()=>{
  const p=newProject(defaultParams()); const before=JSON.stringify(p);
  expect(()=>applyCommand(p,{type:'BATCH',cmds:[{type:'SET_NAME',name:'Changed'},{type:'SET_TRACK',id:p.tracks[0].id,patch:{vol:NaN}}]})).toThrow();
  expect(JSON.stringify(p)).toBe(before);
 });
 it('rejects missing targets and duplicate identities',()=>{
  const p=newProject(defaultParams());
  expect(()=>applyCommand(p,{type:'SET_TRACK',id:'missing',patch:{vol:1}})).toThrow();
  expect(()=>applyCommand(p,{type:'ADD_TRACK',track:p.tracks[0]})).toThrow();
 });
 it('protects locked tracks from clip and automation edits',()=>{
  const p=newProject(defaultParams()); p.tracks[0].lock=true; const c=p.tracks[0].clips[0];
  expect(()=>applyCommand(p,{type:'DEL_CLIP',id:c.id})).toThrow(/lock/i);
  expect(()=>applyCommand(p,{type:'SET_AUTO',lane:{id:'locked-auto',track:p.tracks[0].id,param:'vol',pts:[{bar:0,v:0}]}})).toThrow(/lock/i);
 });
 it('protects clips overlapping a locked section even if their start lies outside',()=>{
  const p=newProject(defaultParams()); const sec=p.sections[1]; sec.lock=true;
  const c=p.tracks[0].clips[0]; c.start=sec.start-2;c.len=4;
  expect(()=>applyCommand(p,{type:'SET_CLIP',id:c.id,patch:{gain:0.1}})).toThrow(/lock/i);
 });
 it('split and duplicate replay use identities supplied in the command',()=>{
  const p=newProject(defaultParams()); const c=p.tracks[0].clips.find(c=>c.len>1)!;
  const cmd={type:'SPLIT_CLIP',id:c.id,at:c.start+1,rightId:'split-right'} as Command;
  expect(applyCommand(p,cmd)).toEqual(applyCommand(p,cmd));
  expect(applyCommand(p,cmd).tracks[0].clips.some(c=>c.id==='split-right')).toBe(true);
 });
 it('diffs include probability, slide and microtiming',()=>{
  const p=newProject(defaultParams()); const tracks=structuredClone(p.tracks);const c=tracks[0].clips[0];
  c.notes[0].slide=true;c.notes[0].micro=0.1;c.notes[0].prob=0.3;
  expect(buildProposal(p,'Articulation','test',{tracks}).diff[c.id]).toBe('changed');
 });
});
it('rejects runtime attempts to replace canonical identity through a patch',()=>{
 const p=newProject(defaultParams());expect(()=>applyCommand(p,{type:'PATCH',patch:{id:'foreign'}} as unknown as Command)).toThrow(/patch field/i);
});
it('rejects a batch that unlocks and modifies protected content together',()=>{
 const p=newProject(defaultParams());p.tracks[0].lock=true;const c=p.tracks[0].clips[0];
 expect(()=>applyCommand(p,{type:'BATCH',cmds:[{type:'SET_TRACK',id:p.tracks[0].id,patch:{lock:false}},{type:'DEL_CLIP',id:c.id}]})).toThrow(/lock/i);
});
it('rejects imported scores with unbounded event expansion',()=>{
 const p=newProject(defaultParams());const t=p.tracks[0];t.clips=[{...t.clips[0],loop:0.25,len:4096,notes:Array.from({length:128},()=>({t:0,p:36,d:1,v:1}))}];
 expect(()=>applyCommand(p,{type:'SET_NAME',name:'malformed'})).toThrow(/budget/i);
});
