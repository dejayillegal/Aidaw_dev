// Test host for orchestration and topology, not a native audio implementation.
class Param {
 value=0;setTargetAtTime(v:number){this.value=v;}setValueAtTime(v:number){this.value=v;}
 cancelScheduledValues(){}linearRampToValueAtTime(){}exponentialRampToValueAtTime(){}
}
export class TestNode {
 gain=new Param();pan=new Param();frequency=new Param();Q=new Param();offset=new Param();threshold=new Param();knee=new Param();ratio=new Param();attack=new Param();release=new Param();delayTime=new Param();
 parameters=new Map(['thr','ratio','atk','rel','hpf','knee','mix'].map(k=>[k,new Param()]));
 port={postMessage(){},close(){},onmessage:null};
 connect(node:unknown){return node;}disconnect(){}start(){}stop(){}
}
export class TestOfflineContext {
 static instances:TestOfflineContext[]=[];static rejectSuspend=false;static rejectResume=false;static rejectNextResume=false;static worklet=true;static completionGate?:Promise<void>;
 currentTime=0;destination=new TestNode();state='suspended';audioWorklet={addModule:async()=>{if(!TestOfflineContext.worklet)throw new Error('Worklet missing');}};
 private pauses:{time:number;resolve:()=>void}[]=[];private continueRender?:()=>void;
 constructor(public numberOfChannels:number,public length:number,public sampleRate:number){TestOfflineContext.instances.push(this);}
 createGain=()=>new TestNode();createBiquadFilter=this.createGain;createWaveShaper=this.createGain;createDynamicsCompressor=this.createGain;createAnalyser=this.createGain;createConvolver=this.createGain;createDelay=this.createGain;createStereoPanner=this.createGain;createConstantSource=this.createGain;
 createBuffer(channels:number,length:number,sampleRate=this.sampleRate){
  const data=Array.from({length:channels},()=>new Float32Array(length));return {numberOfChannels:channels,length,sampleRate,getChannelData:(c:number)=>data[c]};
 }
 suspend(time:number):Promise<void>{
  if(TestOfflineContext.rejectSuspend)return Promise.reject(new Error('Suspend failed'));
  return new Promise(resolve=>{this.pauses.push({time,resolve});});
 }
 async resume(){if(TestOfflineContext.rejectResume||TestOfflineContext.rejectNextResume){TestOfflineContext.rejectNextResume=false;throw new Error('Resume failed');}this.state='running';this.continueRender?.();}
 async startRendering(){
  this.state='running';await new Promise(resolve=>setTimeout(resolve,0));
  while(this.pauses.length){const pause=this.pauses.shift()!;this.currentTime=pause.time;this.state='suspended';const resumed=new Promise<void>(resolve=>{this.continueRender=resolve;});pause.resolve();await resumed;}
  await TestOfflineContext.completionGate;this.currentTime=this.length/this.sampleRate;this.state='closed';
  const buffer=this.createBuffer(this.numberOfChannels,this.length);buffer.getChannelData(0).fill(0.1);buffer.getChannelData(1).fill(-0.1);return buffer as AudioBuffer;
 }
}
