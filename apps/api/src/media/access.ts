import type {Application,ApiRequest} from '../../../../packages/core/src/api.ts';
import type {RequestMeta} from '../../../../packages/core/src/model.ts';
import {invariant} from '../../../../packages/core/src/errors.ts';
export type MediaReadSurface='internal'|'review'|'talent';
/** Same streaming implementation, distinct policies. Account in path binds native img/video requests across login changes. */
export async function mediaRead(core:Application,r:ApiRequest,id:string,surface:MediaReadSurface,meta?:RequestMeta){
 if(surface==='talent')return core.portal.authenticated(r,async(tx,actor)=>({asset:await core.media.talentRead(tx,actor,id,meta),workspace:actor.workspaceId,actor:'TALENT:'+actor.talentAccountId}));
 return core.authenticated(r,surface==='review'?'talent.review':'assets.read',async(tx,actor)=>{
  invariant(!r.headers['x-once-membership']||r.headers['x-once-membership']===actor.membershipId,'IDENTITY_CHANGED','账号已变化',409);
  return {asset:surface==='review'?await core.media.staged(tx,actor,id,meta):await core.media.playback(tx,actor,id,meta),workspace:actor.workspaceId,actor:'INTERNAL:'+actor.membershipId};
 });
}
