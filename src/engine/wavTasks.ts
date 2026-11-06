export interface WavTask {cancelled:()=>boolean;progress?:(fraction:number)=>void}
export function checkCancelled(task:WavTask){if(task.cancelled())throw new Error('CANCELLED');}
/** A task yield lets input events, including Cancel, run between bounded PCM chunks. */
export async function wavCheckpoint(task:WavTask,progress:number){
 checkCancelled(task);task.progress?.(progress);await new Promise<void>(resolve=>setTimeout(resolve,0));checkCancelled(task);
}
