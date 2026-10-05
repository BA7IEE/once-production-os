import type {Application,ApiRequest} from '../../../../packages/core/src/api.ts';
import type {RequestMeta} from '../../../../packages/core/src/model.ts';
import {invariant} from '../../../../packages/core/src/errors.ts';
import {uploadFor} from '../../../../packages/core/src/media.ts';
export type MediaReadSurface='internal'|'review'|'talent'|'agent';
/** Same streaming implementation, distinct policies. Account in path binds native img/video requests across login changes. */
export async function mediaRead(core:Application,r:ApiRequest,id:string,surface:MediaReadSurface,meta?:RequestMeta){
 if(surface==='agent')return core.ingestionAuthenticated(r,'ingestion.read.own',async(tx,actor)=>{
  const u=await uploadFor(tx,actor,id);invariant(u.submissionId===r.headers['x-once-ingestion-submission'],'NOT_FOUND','素材不可访问',404);
  return {asset:await core.media.staged(tx,actor,id,meta),workspace:actor.workspaceId,actor:'MACHINE:'+actor.servicePrincipalId};
 });
 if(surface==='talent')return core.portal.authenticated(r,async(tx,actor)=>({asset:await core.media.talentRead(tx,actor,id,meta),workspace:actor.workspaceId,actor:'TALENT:'+actor.talentAccountId}));
 return core.authenticated(r,surface==='review'?'talent.review':'assets.read',async(tx,actor)=>{
  invariant(!r.headers['x-once-membership']||r.headers['x-once-membership']===actor.membershipId,'IDENTITY_CHANGED','账号已变化',409);
  return {asset:surface==='review'?await core.media.staged(tx,actor,id,meta):await core.media.playback(tx,actor,id,meta),workspace:actor.workspaceId,actor:'INTERNAL:'+actor.membershipId};
 });
}
