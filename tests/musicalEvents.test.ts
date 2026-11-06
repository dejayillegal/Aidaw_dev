import {it,expect} from 'vitest';
import {expandTrackEvents,needsSidechainKey} from '../src/engine/musicalEvents';
import {newProject,defaultParams} from '../src/engine/composer';
it('chases a held MIDI note at seek with only its remaining duration',()=>{
 const p=newProject(defaultParams()),t=p.tracks[0];t.synth='pad';t.clips=[{...t.clips[0],start:0,len:8,loop:128,off:0,notes:[{t:0,d:64,p:60,v:0.8}]}];
 const events=expandTrackEvents(t,p.params,16,20,true);expect(events).toHaveLength(1);expect(events[0].startStep).toBe(16);expect(events[0].durationSteps).toBeCloseTo(64*0.98-16);expect(events[0].chased).toBe(true);
 expect(expandTrackEvents(t,p.params,16,20,false)).toHaveLength(0);
});
it('assigns microtimed notes to exactly one window based on actual onset',()=>{
 const p=newProject(defaultParams()),t=p.tracks[0];p.params.swing=0.5;t.clips=[{...t.clips[0],start:0,len:4,loop:64,off:0,notes:[{t:4,d:1,p:36,v:1,micro:-0.1}]}];
 const left=expandTrackEvents(t,p.params,0,4),right=expandTrackEvents(t,p.params,4,8);expect(left).toHaveLength(1);expect(right).toHaveLength(0);expect(left[0].startStep).toBeCloseTo(3.9);
});
it('does not chase percussive hits and never emits zero-probability notes',()=>{
 const p=newProject(defaultParams()),t=p.tracks[0];t.clips=[{...t.clips[0],start:0,len:8,loop:128,off:0,notes:[{t:0,d:64,p:36,v:1}]}];
 expect(expandTrackEvents(t,p.params,16,20,true)).toHaveLength(0);t.clips[0].notes[0].prob=0;expect(expandTrackEvents(t,p.params,0,4)).toHaveLength(0);
});
it('retains the kick key when a sidechain destination is soloed',()=>{
 const p=newProject(defaultParams());const bass=p.tracks.find(t=>t.sc==='bass')!;bass.solo=true;expect(needsSidechainKey(p)).toBe(true);
 p.scOn=false;expect(needsSidechainKey(p)).toBe(false);
});
