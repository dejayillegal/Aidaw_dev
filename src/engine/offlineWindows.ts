/** Offline rendering has no close()/abort() API. On failure release the graph and
 * resume a suspended context so native rendering can finish draining silently. */
export async function renderOfflineWindows(
 ctx:OfflineAudioContext,totalSteps:number,stepSeconds:number,
 schedule:(a:number,b:number)=>void,cancelled:()=>boolean,
 progress:(fraction:number)=>void,dispose:()=>void,
 nativeStarted:(rendering:Promise<AudioBuffer>)=>void,
):Promise<AudioBuffer>{
 const windowSteps=64,nWindows=Math.ceil(totalSteps/windowSteps);
 let aborted=false;
 const check=()=>{if(aborted||cancelled())throw new Error('CANCELLED');};
 const window=(index:number)=>{check();const a=index*windowSteps;if(a<totalSteps)schedule(a,Math.min(totalSteps,a+windowSteps));};
 // One future suspension at a time keeps pending callbacks bounded.
 const pause=(index:number)=>{
  const pending=ctx.suspend(Math.ceil(index*windowSteps*stepSeconds*ctx.sampleRate/128)*128/ctx.sampleRate);
  // A failed resume may leave a later pause registered after the pump exits.
  void pending.then(()=>{if(aborted)void ctx.resume().catch(()=>{});},()=>{});return pending;
 };
 let started=false;
 try{
  window(0);window(1);check();
  const first=nWindows>1?pause(1):undefined;
  const pump=async()=>{
   let pending=first;
   for(let index=1;index<nWindows;index++){
    await pending;check();window(index+1);progress(index/nWindows);check();
    pending=index+1<nWindows?pause(index+1):undefined;
    await ctx.resume();
   }
  };
  // Attach rejection handlers before native rendering can resolve a suspension.
  const pumping=pump();started=true;
  const rendering=Promise.resolve().then(()=>ctx.startRendering());nativeStarted(rendering);
  const [buffer]=await Promise.all([rendering,pumping]);check();progress(1);check();return buffer;
 }catch(error){
  aborted=true;dispose();
  if(started&&ctx.state==='suspended'){
   // A resume failure is secondary; preserve the original scheduling/cancel error.
   void ctx.resume().catch(()=>{});
  }
  throw error;
 }
}
