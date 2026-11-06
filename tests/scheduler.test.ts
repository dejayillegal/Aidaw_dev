import {it,expect,vi} from 'vitest';
import {Scheduler} from '../src/engine/audio';
import {newProject,defaultParams} from '../src/engine/composer';
it('removing an automation lane cancels its queued events and restores the base',()=>{
 const cancel=vi.fn(),value=vi.fn(),ramp=vi.fn();const param={cancelScheduledValues:cancel,setValueAtTime:value,linearRampToValueAtTime:ramp};
 const p=newProject(defaultParams());const t=p.tracks[0];const lane={id:'vol-test',track:t.id,param:'vol' as const,pts:[{bar:0,v:0.1},{bar:32,v:0.8}]};p.auto=[lane];
 const graph={strips:new Map([[t.id,{volA:{gain:param}}]])};const scheduler=new Scheduler(graph as any);
 scheduler.scheduleAutomation(p,0,1,true);cancel.mockClear();value.mockClear();
 scheduler.scheduleAutomation({...p,auto:[]},4,5,true);
 expect(cancel).toHaveBeenCalledWith(5);expect(value).toHaveBeenCalledWith(1,5);
});
