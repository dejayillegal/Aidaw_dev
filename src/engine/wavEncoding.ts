import {checkCancelled,wavCheckpoint,type WavTask} from './wavTasks';
function writer(buf:AudioBuffer,bits:16|24|32){
 const ch=buf.numberOfChannels,n=buf.length,bps=bits/8,size=n*ch*bps;
 if(![16,24,32].includes(bits)||!Number.isInteger(ch)||ch<1||ch>32||!Number.isSafeInteger(n)||n<1||!Number.isInteger(buf.sampleRate)||buf.sampleRate<8000||buf.sampleRate>192000||size>0xffffffff-36)throw new Error('Unsupported WAV buffer or format');
 const data=new ArrayBuffer(44+size),v=new DataView(data);
 const w=(o:number,s:string)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
 w(0,'RIFF');v.setUint32(4,36+size,true);w(8,'WAVE');w(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,bits===32?3:1,true);v.setUint16(22,ch,true);
 v.setUint32(24,buf.sampleRate,true);v.setUint32(28,buf.sampleRate*ch*bps,true);v.setUint16(32,ch*bps,true);v.setUint16(34,bits,true);w(36,'data');v.setUint32(40,size,true);
 const channels=Array.from({length:ch},(_,c)=>buf.getChannelData(c));
 if(channels.some(c=>c.length!==n))throw new Error('Invalid PCM channel length');
 const write=(a:number,b:number)=>{
  let offset=44+a*ch*bps;
  for(let frame=a;frame<b;frame++)for(let c=0;c<ch;c++){
   const sample=channels[c][frame];if(!Number.isFinite(sample))throw new Error('Nonfinite audio sample');
   const x=bits===32?sample:Math.max(-1,Math.min(1,sample));
   if(bits===16){v.setInt16(offset,Math.round(x*(x<0?32768:32767)),true);offset+=2;}
   else if(bits===24){const s=Math.round(x*(x<0?8388608:8388607));v.setUint8(offset,s&255);v.setUint8(offset+1,(s>>8)&255);v.setUint8(offset+2,(s>>16)&255);offset+=3;}
   else{v.setFloat32(offset,x,true);offset+=4;}
  }
 };
 return {write,finish:()=>new Blob([data],{type:'audio/wav'})};
}
export function encodeWav(buf:AudioBuffer,bits:16|24|32):Blob{
 const w=writer(buf,bits);w.write(0,buf.length);return w.finish();
}
export async function encodeWavAsync(buf:AudioBuffer,bits:16|24|32,task:WavTask):Promise<Blob>{
 checkCancelled(task);const w=writer(buf,bits);
 const framesPerChunk=Math.max(1,Math.floor(262144/buf.numberOfChannels));
 for(let a=0;a<buf.length;a+=framesPerChunk){const b=Math.min(buf.length,a+framesPerChunk);w.write(a,b);await wavCheckpoint(task,b/buf.length);}
 checkCancelled(task);return w.finish();
}
