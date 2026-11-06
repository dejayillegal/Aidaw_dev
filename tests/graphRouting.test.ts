import {it,expect,vi,afterEach} from 'vitest';
import {Graph} from '../src/engine/audio';
import {newProject,defaultParams} from '../src/engine/composer';
class Param {value=0;setTargetAtTime(v:number){this.value=v;}setValueAtTime(v:number){this.value=v;}}
class Node {
 edges:{node:Node;output:number;input:number}[]=[];
 pan=new Param();gain=new Param();frequency=new Param();Q=new Param();offset=new Param();threshold=new Param();knee=new Param();ratio=new Param();attack=new Param();release=new Param();delayTime=new Param();
 parameters=new Map(['thr','ratio','atk','rel','hpf','knee','mix'].map(k=>[k,new Param()]));port={postMessage(){},close(){},onmessage:null};
 connect(node:Node,output=0,input=0){this.edges.push({node,output,input});return node;}
 disconnect(node?:Node,output?:number,input?:number){if(!node){this.edges=[];return;}this.edges=this.edges.filter(e=>e.node!==node||(output!==undefined&&e.output!==output)||(input!==undefined&&e.input!==input));}
 start(){}stop(){}
}
function graph(){
 vi.stubGlobal('AudioWorkletNode',Node);
 const create=()=>new Node();const ctx={sampleRate:48000,currentTime:0,destination:create(),createGain:create,createBiquadFilter:create,createWaveShaper:create,createDynamicsCompressor:create,createAnalyser:create,createConvolver:create,createDelay:create,createStereoPanner:create,createConstantSource:create,createBuffer:(channels:number,length:number)=>{const data=Array.from({length:channels},()=>new Float32Array(length));return {getChannelData:(c:number)=>data[c]};}};
 return new Graph(ctx as any,true);
}
afterEach(()=>vi.unstubAllGlobals());
it('keys are tapped before the solo gate while audible kick output remains suppressed',()=>{
 const p=newProject(defaultParams());p.tracks.find(t=>t.sc==='bass')!.solo=true;const g=graph();g.sync(p);
 const kick=g.strips.get(p.tracks.find(t=>t.synth==='kick')!.id)!;expect(kick.fader.gain.value).toBeGreaterThan(0);expect(kick.out.gain.value).toBe(0);
 const pan=kick.pan as unknown as Node;expect(pan.edges.filter(e=>e.input===1)).toHaveLength(3);g.kill();
});
it('changing a kick instrument disconnects detector taps but retains audible routing',()=>{
 const p=newProject(defaultParams()),g=graph();g.sync(p);const kick=p.tracks.find(t=>t.synth==='kick')!;kick.synth='lead';g.sync(p);
 const s=g.strips.get(kick.id)!,pan=s.pan as unknown as Node;expect(pan.edges.filter(e=>e.input===1)).toHaveLength(0);expect(pan.edges.some(e=>e.node===(s.out as unknown as Node))).toBe(true);g.kill();
});
