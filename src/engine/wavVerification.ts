/** Independently decode our canonical WAV writer output; never trust source-buffer metrics. */
export function inspectWav(bytes:ArrayBuffer){
 const v=new DataView(bytes);const tag=(a:number,n:number)=>String.fromCharCode(...new Uint8Array(bytes,a,n));
 if(bytes.byteLength<44||tag(0,4)!=='RIFF'||tag(8,4)!=='WAVE'||tag(12,4)!=='fmt '||tag(36,4)!=='data')throw new Error('Invalid WAV header');
 const format=v.getUint16(20,true),channels=v.getUint16(22,true),sampleRate=v.getUint32(24,true),bits=v.getUint16(34,true),size=v.getUint32(40,true),step=bits/8;
 if(![16,24,32].includes(bits)||channels<1||channels>32||sampleRate<8000||sampleRate>192000||format!==(bits===32?3:1)||v.getUint32(16,true)!==16||v.getUint16(32,true)!==channels*step||v.getUint32(28,true)!==sampleRate*channels*step||size% (channels*step)||size+44!==bytes.byteLength||v.getUint32(4,true)!==bytes.byteLength-8)throw new Error('Inconsistent WAV format or frame count');
 let peak=0,sum=0;
 for(let offset=44;offset<bytes.byteLength;offset+=step){
  const x=bits===32?v.getFloat32(offset,true):bits===16?v.getInt16(offset,true)/32768:((v.getUint8(offset)|(v.getUint8(offset+1)<<8)|(v.getUint8(offset+2)<<16))<<8>>8)/8388608;
  if(!Number.isFinite(x))throw new Error('Nonfinite WAV sample');peak=Math.max(peak,Math.abs(x));sum+=x*x;
 }
 const frames=size/(channels*step);return {frames,sampleRate,bits,channels,peak,rms:Math.sqrt(sum/Math.max(1,frames*channels))};
}
