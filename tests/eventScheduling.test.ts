import {it,expect,vi} from 'vitest';
vi.mock('../src/engine/voices',async(importOriginal)=>({...await importOriginal<object>(),playVoice:vi.fn()}));
import {playVoice} from '../src/engine/voices';
import {Scheduler} from '../src/engine/audio';
import {newProject,defaultParams} from '../src/engine/composer';
it('clamps negative first-note microtiming to the musical start in live and offline scheduling',()=>{
 const p=newProject(defaultParams());const t=p.tracks[0];p.tracks=[t];t.clips=[{...t.clips[0],start:0,len:1,off:0,notes:[{t:0,p:36,d:1,v:1,micro:-0.1}]}];p.auto=[];
 const strip={input:{},ctl:{}};const graph={seed:123,strips:new Map([[t.id,strip]]),env:{},useWorklet:true};const scheduler=new Scheduler(graph as any);
 scheduler.scheduleWindow(p,0,4,s=>s*0.1);expect(vi.mocked(playVoice).mock.calls.at(-1)?.[3]).toBe(0);
 scheduler.scheduleWindow(p,0,4,s=>0.2+s*0.1);expect(vi.mocked(playVoice).mock.calls.at(-1)?.[3]).toBe(0.2);
});
it('a zero-gain clip produces no voice or sidechain trigger',()=>{
 const p=newProject(defaultParams());const t=p.tracks[0];p.tracks=[t];t.clips=[{...t.clips[0],start:0,len:1,off:0,gain:0,notes:[{t:0,p:36,d:1,v:1}]}];
 vi.mocked(playVoice).mockClear();const graph={seed:123,strips:new Map([[t.id,{input:{},ctl:{}}]]),env:{},useWorklet:true};
 new Scheduler(graph as any).scheduleWindow(p,0,4,s=>s*0.1);expect(playVoice).not.toHaveBeenCalled();
});
it('schedules a kick as detector material when only its bass destination is soloed',()=>{
 const p=newProject(defaultParams()),kick=p.tracks.find(t=>t.synth==='kick')!,bass=p.tracks.find(t=>t.sc==='bass')!;bass.solo=true;
 const strip=()=>({input:{},ctl:{}});const graph={seed:p.params.seed,strips:new Map([[kick.id,strip()],[bass.id,strip()]]),env:{},useWorklet:true};
 vi.mocked(playVoice).mockClear();new Scheduler(graph as any).scheduleWindow(p,0,4,s=>s*0.1);expect(vi.mocked(playVoice).mock.calls.some(call=>call[0]==='kick')).toBe(true);
});
