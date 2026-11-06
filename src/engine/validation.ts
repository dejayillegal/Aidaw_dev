import type { Project, Clip, AutoLane } from './types';
import { LAYERS, STYLES, FORMS, ROLE_NAMES, GROUP_ORDER } from './styles';
import { SCALES } from './theory';

const owns=(o:object,k:PropertyKey)=>Object.prototype.hasOwnProperty.call(o,k);
const fail = (message: string): never => { throw new Error(message); };
const num = (v: unknown, lo: number, hi: number, name: string) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) fail(`Invalid ${name}`);
};
const text = (v: unknown, name: string) => { if (typeof v !== 'string' || v.length > 1024) fail(`Invalid ${name}`); };
const flag = (v: unknown) => { if (typeof v !== 'boolean') fail('Invalid flag'); };
const ids = (xs: {id:string}[], name:string) => {
  const seen=new Set<string>(); for(const x of xs) { text(x.id,name); if(!x.id || seen.has(x.id)) fail(`Duplicate or missing ${name}`); seen.add(x.id); }
};
export function assertProject(value: unknown): asserts value is Project {
  if (!value || typeof value !== 'object') fail('Invalid project');
  const p=value as Project;
  if(p.v!==1) fail('Unsupported project version');
  text(p.id,'project identity'); if(!p.id) fail('Missing project identity');
  num(p.revision,1,Number.MAX_SAFE_INTEGER,'revision');text(p.name,'name');
  if(!p.params || !owns(STYLES,p.params.style) || !owns(SCALES,p.params.scale)) fail('Unsupported style or scale');
  if(p.params.form!=='auto' && !owns(FORMS,p.params.form)) fail('Unsupported form');
  num(p.params.bpm,30,300,'tempo');num(p.params.bars,1,4096,'duration');num(p.params.key,0,11,'key');num(p.params.seed,0,0xffffffff,'seed');
  num(p.params.swing,0.5,0.68,'swing');
  if(!['clean','hybrid','industrial'].includes(p.params.mode)) fail('Invalid production mode');
  for(const k of ['density','complexity','acid','poly','dirt','depth'] as const) num(p.params[k],0,1,k);
  if(!Array.isArray(p.tracks)||p.tracks.length>128||!Array.isArray(p.sections)||p.sections.length>1024||!Array.isArray(p.auto)||p.auto.length>2048) fail('Invalid project collections');
  ids(p.tracks,'track ID');ids(p.sections,'section ID');ids(p.auto,'automation ID');
  let sectionEnd=0;
  for(const s of p.sections){
    if(!owns(ROLE_NAMES,s.role)) fail('Invalid section role');
    if(s.start<sectionEnd)fail('Sections overlap or are unsorted');
    sectionEnd=s.start+s.bars;
    num(s.start,0,4096,'section start');num(s.bars,0.0625,4096,'section length');num(s.energy,0,1,'energy');flag(s.lock);text(s.name,'section name');
    if(!s.levels||typeof s.levels!=='object') fail('Invalid section levels');
    for(const n of Object.values(s.levels))num(n,0,1,'activity');
  }
  const synths=new Set(Object.values(LAYERS).map(l=>l.synth));let count=0;let noteCount=0;let events=0;
  for(const t of p.tracks){
    if(!synths.has(t.synth)||!GROUP_ORDER.includes(t.group)||!Array.isArray(t.clips))fail('Unsupported track');
    text(t.layer,'layer');text(t.name,'track name');text(t.color,'color');
    for(const k of ['mute','solo','lock'] as const)flag(t[k]);
    num(t.vol,0,2,'volume');num(t.pan,-1,1,'pan');
    for(const k of ['rev','del','cutoff','res'] as const)num(t[k],0,1,k);
    if(t.sc!==null&&!['bass','harm','fx'].includes(t.sc))fail('Invalid sidechain bus');
    count+=t.clips.length;if(count>100000)fail('Too many clips');
    for(const c of t.clips){
      num(c.start,0,4096,'clip start');num(c.len,0.0001,4096,'clip duration');num(c.loop,0.25,65536,'loop');num(c.off,0,65536,'offset');num(c.gain,0,2,'gain');num(c.transpose,-127,127,'transpose');flag(c.mute);text(c.label,'clip label');
      if(!Array.isArray(c.notes)||c.notes.length>65536)fail('Invalid notes');
      noteCount+=c.notes.length;events+=Math.ceil(c.len*16/c.loop)*c.notes.length;
      if(noteCount>250000||events>500000)fail('Project event budget exceeded');
      for(const n of c.notes){num(n.t,0,65536,'note start');num(n.d,0.0001,65536,'note duration');num(n.p,0,127,'pitch');num(n.v,0,1,'velocity');if(n.prob!==undefined)num(n.prob,0,1,'probability');if(n.micro!==undefined)num(n.micro,-16,16,'microtiming');if(n.acc!==undefined)flag(n.acc);if(n.slide!==undefined)flag(n.slide);}
    }
  }
  ids(p.tracks.flatMap(t=>t.clips),'clip ID');
  const targets=new Set(p.tracks.map(t=>t.id));const bindings=new Set<string>();
  for(const a of p.auto){
    if((a.track!=='master'&&!targets.has(a.track))||!['cutoff','res','rev','vol','hp'].includes(a.param)||(a.param==='hp')!==(a.track==='master'))fail('Invalid automation target');
    const key=`${a.track}:${a.param}`;if(bindings.has(key))fail('Duplicate automation binding');bindings.add(key);
    if(!Array.isArray(a.pts)||a.pts.length>100000)fail('Invalid automation points');let last=-1;
    for(const q of a.pts){num(q.bar,0,8192,'automation time');num(q.v,0,1,'automation value');if(q.bar<last)fail('Unsorted automation');last=q.bar;}
  }
  if(!p.sc||!p.loop||!p.overrides||!p.secSeed)fail('Missing project configuration');
  flag(p.scOn);flag(p.loop.on);num(p.loop.a,0,4096,'loop start');num(p.loop.b,0,8192,'loop end');if(p.loop.on&&p.loop.b<=p.loop.a)fail('Invalid loop range');
  for(const g of ['bass','harm','fx'] as const){const c=p.sc[g];if(!c)fail('Missing sidechain bus');num(c.thr,-80,0,'threshold');num(c.ratio,1,20,'ratio');num(c.atk,0.05,200,'attack');num(c.rel,5,2000,'release');num(c.hpf,10,1000,'key HPF');num(c.mix,0,1,'sidechain mix');num(c.knee,0,30,'knee');}
  for(const v of Object.values(p.overrides))num(v,0,1,'override');for(const v of Object.values(p.secSeed))num(v,0,Number.MAX_SAFE_INTEGER,'section seed');
}

const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const overlap=(c:Clip,a:number,b:number)=>c.start<b&&c.start+c.len>a;
const laneValue=(lane:AutoLane,bar:number)=>{
 const ps=lane.pts;if(!ps.length)return 0.5;if(bar<=ps[0].bar)return ps[0].v;
 for(let i=1;i<ps.length;i++)if(bar<ps[i].bar){const a=ps[i-1],b=ps[i];return b.bar-a.bar<0.02?a.v:a.v+(b.v-a.v)*(bar-a.bar)/(b.bar-a.bar);}
 return ps[ps.length-1].v;
};
function protectedLanes(p:Project,a:number,b:number){return p.auto.map(l=>({...l,pts:[{bar:a,v:laneValue(l,a)},...l.pts.filter(q=>q.bar>a&&q.bar<b),{bar:b,v:laneValue(l,b)}]}));}
/** Locks are enforced at the domain boundary, including generic PATCH/AI transactions. */
export function assertLocks(before:Project,after:Project){
 for(const t of before.tracks)if(t.lock){const nt=after.tracks.find(x=>x.id===t.id);if(!nt||!same({...t,lock:false},{...nt,lock:false})||!same(before.auto.filter(a=>a.track===t.id),after.auto.filter(a=>a.track===t.id)))fail(`Track locked: ${t.name}`);}
 for(const s of before.sections)if(s.lock){
  const ns=after.sections.find(x=>x.id===s.id);if(!ns||!same({...s,lock:false},{...ns,lock:false}))fail(`Section locked: ${s.name}`);
  const clips=(p:Project)=>p.tracks.map(t=>({id:t.id,clips:t.clips.filter(c=>overlap(c,s.start,s.start+s.bars))})).filter(t=>t.clips.length);
  if(!same(clips(before),clips(after))||!same(protectedLanes(before,s.start,s.start+s.bars),protectedLanes(after,s.start,s.start+s.bars)))fail(`Section locked: ${s.name}`);
 }
}
