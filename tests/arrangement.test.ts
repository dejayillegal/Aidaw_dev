import {it,expect} from 'vitest';
import {generate,defaultParams,newProject,mergeGenerated,regenSection} from '../src/engine/composer';
import {totalBars} from '../src/engine/types';
import {STYLES} from '../src/engine/styles';
it('honors requested exact lengths across all styles and seeds',()=>{
 for(const style of Object.keys(STYLES))for(const bars of [96,100,137,176,256])for(const seed of [7,42,1337,808,999]){
  const p=newProject({...defaultParams(style,seed),bars});expect(totalBars(p),`${style} ${bars} ${seed}`).toBe(bars);
 }
});
it('preserves user-added layers sharing a generated family on full regeneration',()=>{
 const p=newProject(defaultParams());const extra=structuredClone(p.tracks.find(t=>t.layer==='PERC1')!);extra.id='manual-perc';extra.clips.forEach((c,i)=>c.id=`manual-${i}`);p.tracks.push(extra);
 expect(mergeGenerated(p,generate(p.params),true).tracks.find(t=>t.id===extra.id)).toEqual(extra);
});
it('does not regenerate any locked section',()=>{
 const p=newProject(defaultParams());p.sections[1].lock=true;expect(()=>regenSection(p,p.sections[1].id)).toThrow(/lock/i);
});
it('allocates style layers dynamically and reproduces the same score from its seed',()=>{
 const inventories=new Set(Array.from({length:12},(_,seed)=>generate(defaultParams('hardgroove',seed+1)).tracks.map(t=>t.layer).join('|')));
 expect(inventories.size).toBeGreaterThan(1);
 const params=defaultParams('acid',44);expect(generate(params)).toEqual(generate(params));
});
it('targeted regeneration preserves material on both sides of a crossing clip',()=>{
 const p=newProject(defaultParams());const sec=p.sections[1];const t=p.tracks[0];
 t.clips=[{...t.clips[0],id:'cross',start:sec.start-1,len:sec.bars+2}];
 const r=regenSection(p,sec.id);const clips=r.tracks[0].clips;
 expect(clips.some(c=>c.start===sec.start-1&&c.len===1)).toBe(true);
 expect(clips.some(c=>c.start===sec.start+sec.bars&&c.len===1)).toBe(true);
});
it('can regenerate unlocked material while retaining a locked section exactly',async()=>{
 const {applyCommand}=await import('../src/engine/commands');const p=newProject(defaultParams());p.sections[2].lock=true;
 const generated=generate(p.params,{sections:p.sections,secSeed:{[p.sections[1].id]:4}});
 const patch=mergeGenerated(p,generated,true);
 expect(()=>applyCommand(p,{type:'PATCH',patch})).not.toThrow();
 expect(patch.sections[2]).toEqual(p.sections[2]);
});
