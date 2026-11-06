import {it,expect} from 'vitest';
import {encodeWav} from '../src/engine/audio';
const buffer=(samples:number[])=>({numberOfChannels:1,length:samples.length,sampleRate:48000,getChannelData:()=>new Float32Array(samples)}) as AudioBuffer;
it('rejects nonfinite PCM rather than encoding a falsely verified file',()=>{expect(()=>encodeWav(buffer([0,NaN,0]),24)).toThrow(/finite/i);});
it('preserves float headroom and declares the correct WAV format',async()=>{
 const v=new DataView(await encodeWav(buffer([1.25,-1.25]),32).arrayBuffer());expect(v.getUint16(20,true)).toBe(3);expect(v.getUint32(40,true)).toBe(8);expect(v.getFloat32(44,true)).toBe(1.25);expect(v.getFloat32(48,true)).toBe(-1.25);
});
it('encodes signed PCM extrema for both integer formats',async()=>{
 const a=new DataView(await encodeWav(buffer([-1,0,1]),16).arrayBuffer());expect(a.getInt16(44,true)).toBe(-32768);expect(a.getInt16(48,true)).toBe(32767);
 const b=new Uint8Array(await encodeWav(buffer([-1]),24).arrayBuffer());expect([...b.slice(44)]).toEqual([0,0,128]);
});
it('verifies encoded bytes independently of the source buffer',async()=>{
 const {inspectWav}=await import('../src/engine/wavVerification');const blob=encodeWav(buffer([0.25,-0.5,1.25]),24);
 const result=inspectWav(await blob.arrayBuffer());expect(result.frames).toBe(3);expect(result.sampleRate).toBe(48000);expect(result.peak).toBeLessThanOrEqual(1);expect(result.rms).toBeGreaterThan(0.6);
 const bad=await blob.arrayBuffer();new DataView(bad).setUint32(40,1,true);expect(()=>inspectWav(bad)).toThrow();
});
