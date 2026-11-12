import type {Actor,Clock} from './model.ts';
import type {Tx} from './store.ts';
import type {DeletionItem,DeletionTargetKind} from './deletion-model.ts';
import {scopeVisible,requireScope} from './policy.ts';
import {touch} from './helpers.ts';
import {digest} from './json.ts';
import {invariant} from './errors.ts';
async function snapshot(tx:Tx,workspaceId:string,projectId:string){const p=await tx.get('projects',projectId),requirements=(await tx.find('projectRequirements',{workspaceId,projectId})).filter(r=>r.status!=='ERASED'),lists=await tx.find('shortlists',{workspaceId,projectId}),ids=new Set(lists.map(l=>l.id)),items=(await tx.find('shortlistItems',{workspaceId})).filter(i=>ids.has(i.shortlistId)&&!!i.selectionCiphertext);return {p,requirements,lists,items};}
const fingerprint=(s:Awaited<ReturnType<typeof snapshot>>)=>'PROJECT_SELECTION_'+digest({projectId:s.p?.id,sourceId:s.p?.sourceId,scopeId:s.p?.scopeId,requirements:s.requirements,lists:s.lists,items:s.items});
export async function projectSelectionImpacts(tx:Tx,actor:Actor,kind:DeletionTargetKind,id:string){const items:Array<{resourceKind:string;resourceId:string;dependencyKind:string;proposedAction:'ERASE_PAYLOAD';evidenceState:'REVIEW_REQUIRED';detailCode:string}>=[],unresolved:string[]=[];if(!['SOURCE','PROJECT'].includes(kind))return {items,unresolved};
 const projects=kind==='PROJECT'?[await tx.get('projects',id)]:(await tx.find('projects',{workspaceId:actor.workspaceId,sourceId:id}));
 for(const p of projects){if(!p||p.workspaceId!==actor.workspaceId)continue;const s=await snapshot(tx,actor.workspaceId,p.id);if(!s.requirements.length&&!s.lists.length)continue;
  let visible=await scopeVisible(tx,actor,p.scopeId);for(const l of s.lists)visible=visible&&await scopeVisible(tx,actor,l.scopeId);if(!visible){unresolved.push('HIDDEN_PROJECT_SELECTION');continue;}
  items.push({resourceKind:'projectSelection',resourceId:p.id,dependencyKind:'PROJECT_REQUIREMENTS_AND_CANDIDATE_CONDITIONS',proposedAction:'ERASE_PAYLOAD' as const,evidenceState:'REVIEW_REQUIRED' as const,detailCode:fingerprint(s)});
 }return {items,unresolved};
}
export async function checkProjectSelectionErasure(tx:Tx,actor:Actor,items:DeletionItem[]){for(const i of items.filter(i=>i.resourceKind==='projectSelection')){const s=await snapshot(tx,actor.workspaceId,i.resourceId);invariant(s.p&&s.p.workspaceId===actor.workspaceId&&i.detailCode===fingerprint(s)&&i.decision==='APPLY_PROPOSED','PROJECT_SELECTION_PLAN_CHANGED','项目岗位或候选条件已变化，请重新评估清理计划',409);await requireScope(tx,actor,s.p.scopeId);for(const l of s.lists)await requireScope(tx,actor,l.scopeId);}}
export async function eraseProjectSelection(tx:Tx,actor:Actor,i:DeletionItem,clock:Clock){await checkProjectSelectionErasure(tx,actor,[i]);const s=await snapshot(tx,actor.workspaceId,i.resourceId);
 for(const item of s.items)await tx.replace('shortlistItems',{...touch(item,clock),requirementId:null,requirementRevision:null,selectionCiphertext:null});
 for(const l of s.lists)await tx.replace('shortlists',{...touch(l,clock),projectId:null});
 for(const r of s.requirements)await tx.replace('projectRequirements',{...touch(r,clock),status:'ERASED',locationCodes:[],startsOn:null,endsOn:null,dateNote:'',taskNote:'',necessary:{},preferred:{},questions:[]});
}
export async function assertProjectSelectionClean(tx:Tx,workspaceId:string,kind:string,id:string){if(!['SOURCE','PROJECT'].includes(kind))return;const ps=kind==='PROJECT'?[await tx.get('projects',id)]:(await tx.find('projects',{workspaceId,sourceId:id}));for(const p of ps){if(!p)continue;const s=await snapshot(tx,workspaceId,p.id);invariant(!s.requirements.length&&!s.lists.length,'PROJECT_SELECTION_CLEANUP_INCOMPLETE','项目岗位与候选条件尚未完成清理，请重新评估删除依赖',409);}}
