import type {Track,ComposeParams,Note,Project} from './types';
import {STEPS_PER_BAR} from './types';
import {clamp,hash} from './theory';
const SUSTAINED=new Set(['sub','rumble','midbass','acid','stab','lead','arp','pad','dubchord','drone','noise']);
export interface MusicalEvent {trackId:string;clipId:string;cycle:number;note:Note;startStep:number;durationSteps:number;chased:boolean;sourceStep:number}
export const audibleTrack=(p:Project,t:Track)=>!t.mute&&(!p.tracks.some(t=>t.solo)||t.solo);
export function needsSidechainKey(p:Project){return p.scOn&&p.tracks.some(t=>audibleTrack(p,t)&&(!!t.sc||t.rev>0));}

/** Pure event expansion shared by live/offline scheduling. Seek chase rearticulates held MIDI, not oscillator phase. */
export function expandTrackEvents(track:Track,params:ComposeParams,a:number,b:number,chase=false):MusicalEvent[]{
 if(!Number.isFinite(a)||!Number.isFinite(b)||a<0||b<a)throw new Error('Invalid scheduling window');
 if(a===b)return [];
 const events:MusicalEvent[]=[];const sustained=SUSTAINED.has(track.synth);
 for(const clip of track.clips){
  const cs=clip.start*STEPS_PER_BAR,ce=(clip.start+clip.len)*STEPS_PER_BAR;
  if(clip.mute||clip.gain<=0||b<=cs||a>=ce)continue;
  for(const note of clip.notes){
   if(note.t>=clip.loop||note.v<=0||(note.prob!==undefined&&note.prob<=0))continue;
   const duration=note.d*0.98;
   const lookback=sustained&&(chase||(cs>=a&&cs<b))?Math.min(duration,ce-cs):0;
   const shiftAllowance=Math.abs(note.micro??0)+Math.abs(2*params.swing-1);
   const first=Math.floor((Math.max(cs,a)-lookback-shiftAllowance-cs+clip.off-note.t)/clip.loop)-1;
   const last=Math.ceil((Math.min(b,ce)+shiftAllowance-cs+clip.off-note.t)/clip.loop);
   for(let cycle=first;cycle<=last;cycle++){
    const nominal=cs+cycle*clip.loop+note.t-clip.off;
    if(nominal>=ce||(!sustained&&nominal<cs))continue;
    if(note.prob!==undefined&&note.prob<1&&hash(params.seed,track.id,clip.id,cycle,note.t,note.p)/4294967296>=note.prob)continue;
    const odd=Math.abs((nominal%2)-1)<0.02;
    let source=nominal+(odd?2*params.swing-1:0)+(note.micro??0);
    if(nominal>=cs)source=Math.max(cs,source);
    const onset=Math.max(cs,source),end=Math.min(ce,source+duration);
    if(end<=onset||onset>=ce)continue;
    let start=onset,chased=source<cs;
    if(onset<a-1e-9){if(!chase||!sustained||end<=a)continue;start=a;chased=true;}
    if(start<a-1e-9||start>=b-1e-9)continue;
    events.push({trackId:track.id,clipId:clip.id,cycle,note:{...note,p:note.p+clip.transpose,v:clamp(note.v*clip.gain,0,1.2)},startStep:start,durationSteps:end-start,chased,sourceStep:source});
    if(events.length>8192)throw new Error('Scheduling window exceeds the 8192-event safety budget');
   }
  }
 }
 return events.sort((x,y)=>x.startStep-y.startStep||x.note.p-y.note.p);
}
