import {it,expect} from 'vitest';
import {Engine,playbackRange} from '../src/engine/audio';
import {newProject,defaultParams} from '../src/engine/composer';
import {totalBars} from '../src/engine/types';
it('normalizes seek positions into a bounded active loop',()=>{
 const p=newProject(defaultParams());p.loop={on:true,a:16,b:32};
 expect(playbackRange(p,0).start).toBe(16);expect(playbackRange(p,32).start).toBe(16);expect(playbackRange(p,24).start).toBe(24);
});
it('clamps loop bounds to the score and ignores loops wholly beyond it',()=>{
 const p=newProject(defaultParams()),end=totalBars(p);p.loop={on:true,a:0,b:end+32};expect(playbackRange(p,0).loopEnd).toBe(end);
 p.loop={on:true,a:end+8,b:end+16};expect(playbackRange(p,end+9)).toMatchObject({start:end,loopEnd:Infinity});
});
it('rejects nonfinite seek before initializing an audio device',async()=>{
 const engine=new Engine();await expect(engine.play(NaN)).rejects.toThrow(/position/);expect(engine.ctx).toBeUndefined();expect(engine.playing).toBe(false);
});
