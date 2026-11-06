import {it,expect,vi,afterEach} from 'vitest';
import {Store} from '../src/store';
import {defaultParams,newProject} from '../src/engine/composer';
import {buildProposal} from '../src/engine/assist';
afterEach(()=>vi.useRealTimers());
it('invalidates proposals on edit and never reuses a revision on undo/redo',()=>{
 vi.useFakeTimers();const s=new Store(newProject(defaultParams()));const initial=s.get().project;
 const proposal=buildProposal(initial,'Mute','test',{tracks:initial.tracks.map(t=>({...t,mute:true}))});s.addProposal(proposal);
 s.dispatch({type:'SET_NAME',name:'Edit'},'Rename');const editRevision=s.get().project.revision;
 expect(s.get().previewId).toBeNull();expect(s.get().proposals).toHaveLength(0);
 s.undo();expect(s.get().project.revision).toBeGreaterThan(editRevision);s.addProposal(proposal);expect(s.acceptProposal(proposal.id)).toBe(false);
 s.redo();expect(s.get().project.name).toBe('Edit');
});
it('rejected batches leave score/history intact and expose a useful error',()=>{
 vi.useFakeTimers();const s=new Store(newProject(defaultParams()));const initial=s.get().project;
 expect(s.dispatch({type:'SET_TRACK',id:'absent',patch:{vol:1}},'Bad')).toBe(false);
 expect(s.get().project).toBe(initial);expect(s.get().entries).toHaveLength(0);expect(s.get().error).toMatch(/Missing/);
});
it('failed writes are visible and do not mark unsaved work saved',()=>{
 vi.useFakeTimers();const s=new Store(newProject(defaultParams()),{getItem:()=>null,setItem:()=>{throw new Error('quota');}});
 s.dispatch({type:'SET_NAME',name:'Unsaved'},'Rename');vi.advanceTimersByTime(900);
 expect(s.get().saveStatus).toBe('Save failed');expect(s.get().error).toBe('quota');expect(s.get().project.name).toBe('Unsaved');
});
