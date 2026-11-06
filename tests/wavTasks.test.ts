import {it,expect} from 'vitest';
import {encodeWav,encodeWavAsync} from '../src/engine/wavEncoding';
import {inspectWav,inspectWavAsync} from '../src/engine/wavVerification';
const buffer=(frames=150000)=>{const l=new Float32Array(frames),r=new Float32Array(frames);for(let i=0;i<frames;i++){l[i]=Math.sin(i*0.03)*1.1;r[i]=-l[i];}return {numberOfChannels:2,length:frames,sampleRate:48000,getChannelData:(c:number)=>c===0?l:r} as AudioBuffer;};
it.each([16,24,32] as const)('asynchronous %i-bit encoding and verification retain exact PCM semantics',async bits=>{
 const source=buffer();const blob=await encodeWavAsync(source,bits,{cancelled:()=>false});
 const bytes=await blob.arrayBuffer();expect(bytes).toEqual(await encodeWav(source,bits).arrayBuffer());expect(await inspectWavAsync(bytes,{cancelled:()=>false})).toEqual(inspectWav(bytes));
});
it('yields to cancellation during encoding instead of finishing a large file',async()=>{
 let cancel=false;const task=encodeWavAsync(buffer(),24,{cancelled:()=>cancel,progress:()=>{setTimeout(()=>{cancel=true;},0);}});
 await expect(task).rejects.toThrow('CANCELLED');
});
it('yields to cancellation while verifying encoded PCM',async()=>{
 const bytes=await encodeWav(buffer(),24).arrayBuffer();let cancel=false;
 await expect(inspectWavAsync(bytes,{cancelled:()=>cancel,progress:()=>{setTimeout(()=>{cancel=true;},0);}})).rejects.toThrow('CANCELLED');
});
it('rejects a nonfinite sample beyond the first encoding chunk',async()=>{
 const b=buffer();b.getChannelData(1)[149999]=NaN;await expect(encodeWavAsync(b,32,{cancelled:()=>false})).rejects.toThrow(/finite/);
});
