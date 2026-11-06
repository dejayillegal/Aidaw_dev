import {it,expect} from 'vitest';
import vm from 'node:vm';
import {SC_WORKLET_SRC} from '../src/engine/worklet';
function run(antiphase:boolean,mix=1){
 let Processor:any;vm.runInNewContext(SC_WORKLET_SRC,{AudioWorkletProcessor:class{port={postMessage(){},onmessage:null};},sampleRate:48000,registerProcessor:(_name:string,c:unknown)=>Processor=c});
 const processor=new Processor();const p={thr:[-26],ratio:[6],atk:[1],rel:[170],hpf:[60],mix:[mix],knee:[6]};let energy=0;
 for(let block=0;block<100;block++){
  const l=new Float32Array(128),r=new Float32Array(128);for(let i=0;i<128;i++){l[i]=Math.sin(2*Math.PI*200*(block*128+i)/48000);r[i]=antiphase?-l[i]:l[i];}
  const target=new Float32Array(128).fill(0.5),out=[new Float32Array(128),new Float32Array(128)];processor.process([[target,target],[l,r]],[out],p);
  if(block>50)energy+=out[0].reduce((a:number,b:number)=>a+b*b,0);
 }
 return energy;
}
it('links stereo key energy without antiphase cancellation',()=>{expect(run(true)).toBeCloseTo(run(false),5);expect(run(true)).toBeLessThan(run(true,0)*0.2);});
