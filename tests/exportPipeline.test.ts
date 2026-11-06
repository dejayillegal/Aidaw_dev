import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {Graph,Scheduler,renderWav,type ExportState} from '../src/engine/audio';
import {newProject,defaultParams} from '../src/engine/composer';
import {TestNode,TestOfflineContext} from './helpers/offlineHost';
const project=()=>{const p=newProject({...defaultParams(),bars:12});p.auto=[];return p;};
beforeEach(()=>{
 TestOfflineContext.instances=[];TestOfflineContext.rejectSuspend=false;TestOfflineContext.rejectResume=false;TestOfflineContext.worklet=true;
 vi.stubGlobal('window',{OfflineAudioContext:TestOfflineContext});vi.stubGlobal('OfflineAudioContext',TestOfflineContext);vi.stubGlobal('AudioWorkletNode',TestNode);
 vi.spyOn(Scheduler.prototype,'scheduleWindow').mockImplementation(()=>{});
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
const options=(onState:(state:ExportState,progress:number)=>void=()=>{})=>({sampleRate:44100,bits:16 as const,cancelled:()=>false,onState});
it('fails export if a later scheduling window throws, and disposes the graph',async()=>{
 const schedule=vi.mocked(Scheduler.prototype.scheduleWindow);schedule.mockImplementation((_p,a)=>{if(a>=128)throw new Error('Voice scheduling failed');});
 const kill=vi.spyOn(Graph.prototype,'kill');
 await expect(renderWav(project(),options())).rejects.toThrow('Voice scheduling failed');expect(kill).toHaveBeenCalled();
});
it('reports suspend failures instead of silently exporting an incomplete score',async()=>{
 TestOfflineContext.rejectSuspend=true;await expect(renderWav(project(),options())).rejects.toThrow('Suspend failed');
});
it('cleans up when initial automation setup fails',async()=>{
 vi.spyOn(Scheduler.prototype,'scheduleAutomation').mockImplementation(()=>{throw new Error('Automation failed');});const kill=vi.spyOn(Graph.prototype,'kill');
 await expect(renderWav(project(),options())).rejects.toThrow('Automation failed');expect(kill).toHaveBeenCalled();
});
it('requires worklet export for reverb sidechain returns even without a dry sidechain target',async()=>{
 TestOfflineContext.worklet=false;const p=project();p.tracks.forEach(t=>{t.sc=null;t.rev=0.5;});
 await expect(renderWav(p,options())).rejects.toThrow(/sidechain.*unavailable/i);
});
it('cancels before encoding when requested at processing',async()=>{
 let cancelled=false;const states:ExportState[]=[];
 await expect(renderWav(project(),{...options((s)=>{states.push(s);if(s==='PROCESSING')cancelled=true;}),cancelled:()=>cancelled})).rejects.toThrow('CANCELLED');
 expect(states).not.toContain('ENCODING');
});
it('schedules every window exactly once with the score end as a note boundary',async()=>{
 await renderWav(project(),options());
 const calls=vi.mocked(Scheduler.prototype.scheduleWindow).mock.calls;
 expect(calls.map(c=>[c[1],c[2]])).toEqual([[0,64],[64,128],[128,192]]);expect(calls.every(c=>c[5]===192)).toBe(true);
});
it('reports resume failures and cleans up instead of leaving the export pending',async()=>{
 TestOfflineContext.rejectResume=true;const kill=vi.spyOn(Graph.prototype,'kill');
 await expect(renderWav(project(),options())).rejects.toThrow('Resume failed');expect(kill).toHaveBeenCalled();
});
it('returns a verified file only after reaching a completed terminal state',async()=>{
 const states:ExportState[]=[];const result=await renderWav(project(),options((s,p)=>{states.push(s);expect(p).toBeGreaterThanOrEqual(0);expect(p).toBeLessThanOrEqual(1);}));
 expect(result.frames).toBe(result.expectedFrames);expect(states.at(-1)).toBe('COMPLETED');
});
it('reaches FAILED on a scheduling error and never starts encoding',async()=>{
 const states:ExportState[]=[];vi.mocked(Scheduler.prototype.scheduleWindow).mockImplementation(()=>{throw new Error('Scheduling failure');});
 await expect(renderWav(project(),options(s=>{states.push(s);}))).rejects.toThrow('Scheduling failure');expect(states.at(-1)).toBe('FAILED');expect(states).not.toContain('ENCODING');
});
it('cancels at an actual suspended window and never schedules further material',async()=>{
 const states:ExportState[]=[];let cancelled=false;
 await expect(renderWav(project(),{...options((s,f)=>{states.push(s);if(s==='RENDERING'&&f>0)cancelled=true;}),cancelled:()=>cancelled})).rejects.toThrow('CANCELLED');
 expect(states.at(-1)).toBe('CANCELLED');expect(states).not.toContain('ENCODING');
});
it('keeps rendering the captured score when the caller edits its original object',async()=>{
 const p=project(),original=p.params.bpm;const task=renderWav(p,options());p.params.bpm=original+10;
 await task;expect(vi.mocked(Scheduler.prototype.scheduleWindow).mock.calls.every(c=>c[0].params.bpm===original)).toBe(true);
});
it('fails a processor error instead of exporting a partially silent bus',async()=>{
 const sync=Graph.prototype.sync;vi.spyOn(Graph.prototype,'sync').mockImplementation(function(p){sync.call(this,p);this.failure='Sidechain processor failed';});
 await expect(renderWav(project(),options())).rejects.toThrow('Sidechain processor failed');
});
