import {sourceAllowsInternalAuthoring} from './talent-maintenance-policy.ts';
import {randomUUID} from 'node:crypto';
import type {Actor,Clock,Config,RequestMeta} from './model.ts';
import type {Tx} from './store.ts';
import type {ClientVersion,ClientRecipient,ClientPresentationPayload,ClientDependencyManifest,ClientPublicEntry} from './client-presentation-model.ts';
import {ClientPresentationSchemas as S} from './client-presentation-schema.ts';
import {base,cas,touch,workspaceRow,audit,page} from './helpers.ts';
import {invariant,missing,AppError} from './errors.ts';
import {requirePermission,requireScope,sourceFor,personFor,permissionsFor} from './policy.ts';
import {shortlistFor,Shortlists} from './shortlists.ts';
import {projectFor,workFor,readyAsset} from './production-policy.ts';
import {exactCreditCurrent} from './talent-work-cases.ts';
import {formalMediaSource} from './media-ownership.ts';
import {encryptDraftPayload,decryptDraftPayload} from './private-draft-payload.ts';
import {digest,parseStrictJson} from './json.ts';
import {randomSecret,hashSecret} from './crypto.ts';
import {loadTalentGraph} from './talent-v2-graph.ts';

export class ClientPresentations {
 readonly clock:Clock;readonly config:Config;
 constructor(clock:Clock,config:Config){this.clock=clock;this.config=config;}
 enabled(){invariant(this.config.clientPresentationsEnabled===true&&this.config.accessMode==='INTERNAL','CLIENT_PRESENTATION_DISABLED','此环境尚未启用客户展示，请由维护人员配置独立开关',503);}
 key(v:ClientVersion){return `client-version:${v.workspaceId}:${v.id}`;}
 payload(v:ClientVersion):ClientPresentationPayload{if(!v.contentCiphertext)missing();const p=parseStrictJson(decryptDraftPayload(v.contentCiphertext,this.config.contactKey,this.key(v))) as ClientPresentationPayload;invariant(p.schemaVersion==='once-client-presentation-v1'&&p.purpose==='CLIENT_PRESENTATION'&&digest(p)===v.manifestDigest&&digest(p.dependencies)===digest(v.dependencies),'CLIENT_CONTENT_INVALID','客户展示内容校验失败',503);return p;}
 recipientKey(r:Pick<ClientRecipient,'workspaceId'|'id'>){return `client-recipient:${r.workspaceId}:${r.id}`;}
 label(r:ClientRecipient){return r.labelCiphertext?decryptDraftPayload(r.labelCiphertext,this.config.contactKey,this.recipientKey(r)):'';}
 async access(tx:Tx,actor:Actor,id:string){this.enabled();requirePermission(actor,'data.export');requirePermission(actor,'records.read');const l=await workspaceRow(tx,'shortlists',id,actor.workspaceId);if(!l)missing();await requireScope(tx,actor,l.scopeId);return l;}
 async versionFor(tx:Tx,actor:Actor,id:string,versionId:string){await this.access(tx,actor,id);const v=await workspaceRow(tx,'clientVersions',versionId,actor.workspaceId);if(!v||v.presentationId!==id)missing();return v;}
 /** Rebuild the publisher from persisted identity on every read. Frozen content is not a frozen permission. */
 async current(tx:Tx,v:ClientVersion,allowRevoked=false){
  this.enabled();const w=await tx.get('workspaces',v.workspaceId),parent=await tx.get('clientPresentations',v.presentationId),m=await tx.get('memberships',v.publisherId),u=m?await tx.get('users',m.userId):null;
  if(!w||w.recoveryEpoch!==this.config.recoveryEpoch||v.recoveryEpoch!==this.config.recoveryEpoch||!parent||(!allowRevoked&&parent.state!=='ACTIVE')||(allowRevoked?v.state==='ERASED':v.state!=='PUBLISHED')||(!allowRevoked&&v.expiresAt<=this.clock.now().toISOString())||!m||m.status!=='ACTIVE'||!u||u.status!=='ACTIVE'||u.sessionEpoch!==v.publisherUserEpoch)missing();
  const actor:Actor={actorKind:'HUMAN',workspaceId:v.workspaceId,membershipId:m.id,userId:u.id,role:m.role,permissions:permissionsFor(m),displayName:u.displayName,userEpoch:u.sessionEpoch,sessionId:'client-publisher-policy'};
  try{
   for(const p of ['records.read','sources.read','sources.review','data.export'] as const)requirePermission(actor,p);
   const l=await shortlistFor(tx,actor,parent.id,this.clock);if(l.scopeId!==parent.scopeId)missing();
   for(const ref of v.dependencies.sources){const s=await sourceFor(tx,actor,ref.id,this.clock);if(s.revision!==ref.revision)missing();}
   for(const id of v.dependencies.projects)await projectFor(tx,actor,id,this.clock);
   const graph=await loadTalentGraph(tx,actor,this.clock,v.personIds);
   for(const ref of v.dependencies.people){const p=await personFor(tx,actor,ref.id,this.clock),role=graph.fact('personRoles',ref.personRoleId),item=await tx.get('shortlistItems',ref.itemId);
    if(p.status==='ARCHIVED'||!graph.identityReadable(p)||!role||role.personId!==p.id||role.roleCode!==ref.roleCode||!graph.usable('personRoles',role)||!item||item.shortlistId!==l.id||item.personId!==p.id||item.personRoleId!==role.id||item.workId!==ref.workId)missing();
    if(ref.workId){const work=await workFor(tx,actor,ref.workId,this.clock);if(work.status==='ARCHIVED')missing();let credited=false;for(const c of await tx.find('workCredits',{workspaceId:v.workspaceId,personId:p.id,workId:work.id}))if(c.personRoleId===role.id&&c.roleCode===role.roleCode&&c.sourceId&&await exactCreditCurrent(tx,c,this.clock)){await sourceFor(tx,actor,c.sourceId,this.clock);credited=true;}if(!credited)missing();}
   }
   for(const ref of v.dependencies.assets){requirePermission(actor,'assets.read');const a=await readyAsset(tx,actor,ref.id,this.clock),wa=await tx.get('workAssets',ref.workAssetId);if(a.sha256!==ref.sha256||a.previewHash!==ref.previewHash||a.objectToken!==ref.objectToken||!wa||wa.workId!==ref.workId||wa.assetId!==a.id)missing();}
   return {actor,parent};
  }catch(e){if(e instanceof AppError&&[400,403,404,409].includes(e.status))missing();throw e;}
 }
 async publish(tx:Tx,actor:Actor,id:string,input:unknown){const d=S.publish.parse(input),l=await this.access(tx,actor,id);requirePermission(actor,'records.write');requirePermission(actor,'sources.review');cas(l,d.expectedRevision);await shortlistFor(tx,actor,id,this.clock);
  const w=await tx.get('workspaces',actor.workspaceId);invariant(w?.recoveryEpoch===this.config.recoveryEpoch,'MAINTENANCE','恢复隔离期间不能发布',503);
  invariant(Date.parse(d.expiresAt)>this.clock.now().getTime()&&Date.parse(d.expiresAt)<=this.clock.now().getTime()+30*86400000,'CLIENT_EXPIRY','客户版本有效期须在未来30天内',422);
  invariant(new Set(d.entries.map(e=>e.shortlistItemId)).size===d.entries.length,'DUPLICATE_ENTRY','同一候选条目不能重复',422);
  const basis=await sourceFor(tx,actor,d.approvalSourceId,this.clock);cas(basis,d.approvalSourceRevision);invariant(basis.basisMode==='INTERNAL_USE'&&sourceAllowsInternalAuthoring(basis),'CLIENT_APPROVAL_BASIS','请使用已核对的依据记录本次独立客户展示许可',422);
  const list=await new Shortlists(this.clock).get(tx,actor,id),dependencies:ClientDependencyManifest={sources:[],people:[],works:[],projects:[],assets:[]},sources=new Set<string>([basis.id]),entries:ClientPublicEntry[]=[];
  if(l.projectId){const project=await projectFor(tx,actor,l.projectId,this.clock);dependencies.projects.push(project.id);sources.add(project.sourceId);}
  for(const e of d.entries){const item=list.items.find(i=>i.id===e.shortlistItemId);if(!item||item.unavailable||!item.personRoleId)missing();const person=await personFor(tx,actor,item.person.id,this.clock),role=await tx.get('personRoles',item.personRoleId);if(!role||role.status!=='ACTIVE')missing();sources.add(person.sourceId);sources.add(role.sourceId);
   invariant(e.includeWork||!e.assetIds.length,'CLIENT_MEDIA_WORK_REQUIRED','展示媒体时须包含对应精选作品',422);invariant(!e.includeWork||!!item.work,'CLIENT_WORK_REQUIRED','当前条目没有可展示的作品',422);invariant(new Set(e.assetIds).size===e.assetIds.length,'DUPLICATE_ASSET','媒体不能重复',422);
   const workId=e.includeWork?item.work!.id:null,media:ClientPublicEntry['media']=[];
   if(workId){const work=await workFor(tx,actor,workId,this.clock);sources.add(work.sourceId);dependencies.works.push(work.id);let exact=false;for(const c of await tx.find('workCredits',{workspaceId:actor.workspaceId,workId,personId:person.id}))if(c.personRoleId===role.id&&c.sourceId&&await exactCreditCurrent(tx,c,this.clock)){sources.add(c.sourceId);exact=true;}invariant(exact,'CLIENT_EXACT_CREDIT_REQUIRED','精选作品须有本次职业的当前精确署名',422);}
   dependencies.people.push({id:person.id,personRoleId:role.id,roleCode:role.roleCode,itemId:item.id,workId:item.work?.id??null});
   for(const assetId of e.assetIds){requirePermission(actor,'assets.read');const selected=item.selectedAssets.find(a=>a.asset.id===assetId);if(!selected||!workId)missing();const a=await readyAsset(tx,actor,assetId,this.clock),wa=await tx.get('workAssets',selected.workAssetId);if(!wa||wa.workId!==workId||wa.assetId!==assetId)missing();const source=await formalMediaSource(tx,a);if(!source)missing();sources.add(source);
    dependencies.assets.push({id:a.id,sha256:a.sha256,previewHash:a.previewHash,objectToken:a.objectToken,workId,workAssetId:wa.id});media.push({id:a.id,mime:a.mime});
   }
   const dictionary=(await tx.find('dictionary',{workspaceId:actor.workspaceId,namespace:'role',code:role.roleCode}))[0];if(!dictionary)missing();entries.push({id:randomUUID(),displayName:e.publicName,roleLabel:dictionary.labelZh,intro:e.intro,recommendation:e.recommendation,conditions:e.conditions,workTitle:workId?item.work!.title:null,media});
  }
  for(const id of sources){const s=await sourceFor(tx,actor,id,this.clock);dependencies.sources.push({id:s.id,revision:s.revision});}
  let parent=await tx.get('clientPresentations',l.id);if(!parent){parent={...base(actor.workspaceId,this.clock),id:l.id,scopeId:l.scopeId,maintainerId:actor.membershipId,state:'ACTIVE'};await tx.insert('clientPresentations',parent);}else{invariant(parent.scopeId===l.scopeId,'CLIENT_SCOPE_CHANGED','清单范围已变化，请先核对历史展示',409);parent={...touch(parent,this.clock),state:'ACTIVE'};await tx.replace('clientPresentations',parent);}
  const old=await tx.find('clientVersions',{workspaceId:actor.workspaceId,presentationId:id});invariant(old.length<100,'CLIENT_VERSION_LIMIT','每份清单最多100个客户版本',422);
  const payload:ClientPresentationPayload={schemaVersion:'once-client-presentation-v1',purpose:'CLIENT_PRESENTATION',title:d.title,entries,approvalNote:d.approvalNote,dependencies},v:ClientVersion={...base(actor.workspaceId,this.clock),id:d.versionId,presentationId:id,versionNumber:Math.max(0,...old.map(v=>v.versionNumber))+1,publisherId:actor.membershipId,publisherUserEpoch:actor.userEpoch,recoveryEpoch:this.config.recoveryEpoch,expiresAt:d.expiresAt,state:'PUBLISHED',approvalSourceId:basis.id,approvalSourceRevision:basis.revision,approvedAt:this.clock.now().toISOString(),contentCiphertext:null,manifestDigest:digest(payload),dependencies,entryIds:entries.map(e=>e.id),personIds:[...new Set(dependencies.people.map(p=>p.id))],sourceIds:[...sources],workIds:[...new Set(dependencies.works)],projectIds:dependencies.projects,assetIds:[...new Set(dependencies.assets.map(a=>a.id))]};
  v.contentCiphertext=encryptDraftPayload(JSON.stringify(payload),this.config.contactKey,this.key(v));invariant(Buffer.byteLength(v.contentCiphertext)<=500000,'CLIENT_CONTENT_LIMIT','请减少本版本的候选或说明',422);await tx.insert('clientVersions',v);await this.current(tx,v);const n=touch(l,this.clock);await tx.replace('shortlists',n);return n;
 }
 async list(tx:Tx,actor:Actor,id:string,query:Record<string,string>={}){const l=await this.access(tx,actor,id),all=(await tx.find('clientVersions',{workspaceId:actor.workspaceId,presentationId:id})).sort((a,b)=>b.versionNumber-a.versionNumber),paged=page(all,{...query,pageSize:query.pageSize??'5'});invariant(paged.pageSize<=10,'CLIENT_VERSION_PAGE_LIMIT','每次最多读取10个版本',400);const versions=[];
  for(const v of paged.items){let readable=false;try{await this.current(tx,v,true);readable=true;}catch(e){if(!(e instanceof AppError&&[403,404,409,503].includes(e.status)))throw e;}const recipients=(await tx.find('clientRecipients',{workspaceId:actor.workspaceId,versionId:v.id})).map(r=>({id:r.id,revision:r.revision,label:readable?this.label(r):null,state:r.state,expiresAt:r.expiresAt}));versions.push({id:v.id,versionNumber:v.versionNumber,state:v.state,expiresAt:v.expiresAt,available:readable&&v.state==='PUBLISHED'&&v.expiresAt>this.clock.now().toISOString(),readable,...(readable?{content:{title:this.payload(v).title,entries:this.payload(v).entries}}:{}),recipients});}
  return {shortlistId:l.id,revision:l.revision,versions,total:paged.total,page:paged.page,pageSize:paged.pageSize};
 }
 async feedback(tx:Tx,actor:Actor,id:string,input:unknown){const d=S.feedbackList.parse(input),v=await this.versionFor(tx,actor,id,d.versionId);await this.current(tx,v,true);const all=(await tx.find('clientFeedback',{workspaceId:actor.workspaceId,versionId:v.id,state:'ACTIVE'})).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.sequenceNumber-a.sequenceNumber),paged=page(all,{page:String(d.page??1),pageSize:String(d.pageSize??20)}),items=[];
  for(const f of paged.items){const r=await tx.get('clientRecipients',f.recipientId);items.push({id:f.id,recipientId:f.recipientId,recipientLabel:r?this.label(r):'',entryId:f.entryId,choice:f.choice,note:f.noteCiphertext?decryptDraftPayload(f.noteCiphertext,this.config.contactKey,`client-feedback:${f.workspaceId}:${f.id}`):'',createdAt:f.createdAt,sequenceNumber:f.sequenceNumber});}return {...paged,items};
 }
 async issue(tx:Tx,actor:Actor,id:string,input:unknown,meta:RequestMeta){const d=S.issue.parse(input),v=await this.versionFor(tx,actor,id,d.versionId);requirePermission(actor,'records.write');await this.current(tx,v);invariant(Date.parse(d.expiresAt)>this.clock.now().getTime()&&d.expiresAt<=v.expiresAt,'CLIENT_RECIPIENT_EXPIRY','接收人链接有效期不能超过版本有效期',422);
  const old=await tx.get('clientRecipients',d.recipientId);if(old){invariant(d.rotate&&old.workspaceId===actor.workspaceId&&old.versionId===v.id&&d.expectedRecipientRevision!==undefined,'CLIENT_RECIPIENT_EXISTS','此接收人已存在；结果未知时请先查看，再明确轮换链接',409);cas(old,d.expectedRecipientRevision!);}else{invariant(!d.rotate,'CLIENT_RECIPIENT_MISSING','接收人不存在',404);invariant((await tx.find('clientRecipients',{workspaceId:actor.workspaceId,versionId:v.id})).length<50,'CLIENT_RECIPIENT_LIMIT','每个版本最多50位接收人',422);}
  const token=randomSecret(),r:ClientRecipient={...(old?touch(old,this.clock):base(actor.workspaceId,this.clock)),id:d.recipientId,versionId:v.id,createdById:actor.membershipId,labelCiphertext:null,tokenHash:hashSecret(token),tokenVersion:(old?.tokenVersion??0)+1,recoveryEpoch:this.config.recoveryEpoch,expiresAt:d.expiresAt,state:'ACTIVE'};r.labelCiphertext=encryptDraftPayload(d.label,this.config.contactKey,this.recipientKey(r));if(old)await tx.replace('clientRecipients',r);else await tx.insert('clientRecipients',r);for(const s of await tx.find('clientGuestSessions',{workspaceId:actor.workspaceId,recipientId:r.id}))if(!s.revokedAt)await tx.replace('clientGuestSessions',{...touch(s,this.clock),revokedAt:this.clock.now().toISOString()});await audit(tx,actor,actor.workspaceId,'client.recipient.issue','clientRecipient',r.id,['versionId','tokenVersion'],meta,this.clock);
  return {resourceId:r.id,recipientId:r.id,versionId:v.id,revision:r.revision,url:this.config.origin+'/client/presentation#recipient='+r.id+'&t='+token};
 }
 async revoke(tx:Tx,actor:Actor,id:string,input:unknown){const d=S.revoke.parse(input),l=await this.access(tx,actor,id);requirePermission(actor,'records.write');cas(l,d.expectedRevision);invariant(!d.versionId||!d.recipientId,'CLIENT_REVOKE_TARGET','请一次选择版本或接收人',422);
  if(d.recipientId){const r=await workspaceRow(tx,'clientRecipients',d.recipientId,actor.workspaceId);if(!r)missing();await this.versionFor(tx,actor,id,r.versionId);await tx.replace('clientRecipients',{...touch(r,this.clock),state:'REVOKED',tokenHash:null});}
  else for(const v of await tx.find('clientVersions',{workspaceId:actor.workspaceId,presentationId:id})){if(d.versionId&&v.id!==d.versionId)continue;if(v.state==='PUBLISHED')await tx.replace('clientVersions',{...touch(v,this.clock),state:'REVOKED'});}
  if(!d.versionId&&!d.recipientId){const parent=await tx.get('clientPresentations',id);if(parent)await tx.replace('clientPresentations',{...touch(parent,this.clock),state:'REVOKED'});}
  const n=touch(l,this.clock);await tx.replace('shortlists',n);return n;
 }
}
