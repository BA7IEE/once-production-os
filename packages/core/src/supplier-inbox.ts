import {randomUUID} from 'node:crypto';
import type {Actor,Clock,Config,RequestMeta} from './model.ts';
import type {Tx} from './store.ts';
import type {SupplierInboxBatch,SupplierInboxMaterial,InboxMaterialPayload,InboxSubjectDraft} from './supplier-inbox-model.ts';
import {SupplierInboxSchemas as S} from './supplier-inbox-schema.ts';
import {base,touch,cas,workspaceRow,page} from './helpers.ts';
import {invariant,missing,AppError} from './errors.ts';
import {digest,parseStrictJson} from './json.ts';
import {encryptDraftPayload,decryptDraftPayload} from './private-draft-payload.ts';
import {requirePermission,sourceFor,requireScope,permissionsFor,deletionBlocked,scopeVisible} from './policy.ts';
import {td2PersonFor} from './talent-v2-graph.ts';
import {assetFor} from './media.ts';
import {Talent} from './talent.ts';
import {publishedCatalog,catalogView} from './supplier-field-catalog.ts';
import {approvedAi} from './ai-operations.ts';
import {AiLedger} from './ai-ledger.ts';
import {validateDocumentManifest,validateDocumentProposal} from './document-schema.ts';
import {validateSupplierProfile} from './supplier-profile-schema.ts';
import {applyInboxSubject} from './supplier-inbox-profile.ts';

const open=new Set(['WAITING','READY','PAUSED']);
const imageKey=(chunk:string,key:string)=>chunk+':'+key;
export class SupplierInbox {
 readonly clock:Clock;readonly config:Config;
 constructor(clock:Clock,config:Config){this.clock=clock;this.config=config;}
 context(m:SupplierInboxMaterial){return `supplier-inbox:${m.workspaceId}:${m.batchId}:${m.id}`;}
 encode(m:SupplierInboxMaterial,p:InboxMaterialPayload){invariant(Buffer.byteLength(JSON.stringify(p))<=16000000,'INBOX_PAYLOAD_LIMIT','材料结果过大，请拆分文件整理',422);return encryptDraftPayload(JSON.stringify(p),this.config.contactKey,this.context(m));}
 decode(m:SupplierInboxMaterial):InboxMaterialPayload {invariant(m.ciphertext,'INBOX_ERASED','材料内容已清理',409);return parseStrictJson(decryptDraftPayload(m.ciphertext,this.config.contactKey,this.context(m))) as InboxMaterialPayload;}
 async access(tx:Tx,actor:Actor,id:string,write=false){
  invariant(actor.actorKind!=='MACHINE','EMPLOYEE_REQUIRED','员工收件需要真实内部成员',403);requirePermission(actor,write?'records.write':'records.read');requirePermission(actor,'sources.read');
  const b=await workspaceRow(tx,'supplierInboxBatches',id,actor.workspaceId);if(!b||b.state==='ERASED')missing();await requireScope(tx,actor,b.scopeId);
  const source=await sourceFor(tx,actor,b.sourceId,this.clock);invariant(source.revision===b.sourceRevision&&source.scopeId===b.scopeId,'INBOX_SOURCE_CHANGED','收件来源已变化，请核对原始依据',409);
  invariant(this.config.accessMode==='INTERNAL'&&b.recoveryEpoch===this.config.recoveryEpoch&&(await tx.get('workspaces',actor.workspaceId))?.recoveryEpoch===this.config.recoveryEpoch,'INBOX_RECOVERY_CHANGED','恢复后的旧收件任务需要重新核对',409);
  return {batch:b,source};
 }
 async usable(tx:Tx,m:SupplierInboxMaterial){for(const [kind,ids] of [['PERSON',m.personIds],['WORK',m.workIds],['ASSET',m.assetIds]] as const)for(const id of ids)if(await deletionBlocked(tx,m.workspaceId,kind,id))return false;return true;}
 async material(tx:Tx,actor:Actor,batchId:string,id:string,write=false){const context=await this.access(tx,actor,batchId,write),m=await workspaceRow(tx,'supplierInboxMaterials',id,actor.workspaceId);if(!m||m.batchId!==batchId||m.state==='ERASED'||!await this.usable(tx,m))missing();return {...context,material:m};}
 async dictionary(tx:Tx,workspaceId:string){
  const dict=await tx.find('dictionary',{workspaceId,status:'ACTIVE'}),catalog=catalogView(await publishedCatalog(tx,workspaceId));
  catalog.definition.fields=catalog.definition.fields.filter(f=>f.ai==='SUGGEST');const codes=new Set(catalog.definition.fields.map(f=>f.code));catalog.definition.templates=catalog.definition.templates.map(t=>({...t,fieldCodes:t.fieldCodes.filter(c=>codes.has(c))}));
  return {subjectPolicy:'SUPPLIER_SUBJECT_V2' as const,roles:dict.filter(d=>d.namespace==='role').map(d=>d.code),locations:dict.filter(d=>d.namespace==='city').map(d=>d.code),languages:dict.filter(d=>d.namespace==='language').map(d=>d.code),skills:(await tx.find('capabilityDefinitions',{workspaceId,status:'ACTIVE'})).map(d=>d.code),professional:catalog,
   native:{capabilities:(await tx.find('capabilityDefinitions',{workspaceId,status:'ACTIVE'})).map(c=>({code:c.code,label:c.labelZh,applicableRoleCodes:c.applicableRoleCodes,levelSchemeCode:c.levelSchemeCode})),languages:dict.filter(d=>d.namespace==='language').map(d=>({code:d.code,label:d.labelZh}))}};
 }
 async create(tx:Tx,actor:Actor,input:unknown){
  requirePermission(actor,'records.write');invariant(actor.actorKind!=='MACHINE','EMPLOYEE_REQUIRED','员工收件需要真实内部成员',403);const d=S.create.parse(input);
  invariant(Date.parse(d.receivedAt)<=this.clock.now().getTime(),'INBOX_RECEIVED_DATE','收件时间不能晚于现在',422);
  const inputSource={...d.source};if(inputSource.basisMode==='TEMP_ORGANIZE'&&!inputSource.scopeId){const scope={...base(actor.workspaceId,this.clock),name:'员工收件 · '+inputSource.title,mode:'RESTRICTED' as const};await tx.insert('scopes',scope);await tx.insert('scopeMembers',{...base(actor.workspaceId,this.clock),scopeId:scope.id,membershipId:actor.membershipId});inputSource.scopeId=scope.id;}
  const source=await new Talent(this.clock,this.config).createSource(tx,actor,inputSource),scope=(await tx.get('scopes',source.scopeId))!;
  const batch:SupplierInboxBatch={...base(actor.workspaceId,this.clock),id:source.id,sourceId:source.id,scopeId:source.scopeId,maintainerId:actor.membershipId,sourceRevision:source.revision,scopeRevision:scope.revision,receivedAt:d.receivedAt,recoveryEpoch:this.config.recoveryEpoch,state:'OPEN'};
  await tx.insert('supplierInboxBatches',batch);return batch;
 }
 async list(tx:Tx,actor:Actor,query:Record<string,string>){requirePermission(actor,'records.read');requirePermission(actor,'sources.read');const rows=[];
  for(const b of await tx.find('supplierInboxBatches',{workspaceId:actor.workspaceId}))try{const {source}=await this.access(tx,actor,b.id);rows.push({...b,title:source.title,providerClaim:source.providerClaim});}catch(e){if(!(e instanceof AppError&&[403,404,409].includes(e.status)))throw e;}
  return page(rows.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id)),query);
 }
 async read(tx:Tx,actor:Actor,id:string){const {batch,source}=await this.access(tx,actor,id);requirePermission(actor,'sensitive.read');
  const materials=[];for(const m of await tx.find('supplierInboxMaterials',{workspaceId:actor.workspaceId,batchId:id})){
   if(!await this.usable(tx,m)){materials.push({id:m.id,revision:m.revision,createdAt:m.createdAt,state:'RESTRICTED',payload:null,fileName:'资料已受限',accounting:null});continue;}
   if(m.state==='ERASED'){materials.push({...m,ciphertext:undefined,payload:null,fileName:'已清理材料',accounting:null});continue;}
   let asset=null;try{asset=m.assetId?await assetFor(tx,actor,m.assetId,this.clock):null;}catch(e){if(!(e instanceof AppError&&e.status===404))throw e;}
   const p=this.decode(m),runIds=[...new Set([m.runId,...p.chunks.map(c=>c.runId)].filter((id):id is string=>!!id))],runs=[];for(const runId of runIds){const run=await tx.get('aiRuns',runId);if(run)runs.push({runId:run.id,state:run.state,reservedUnits:run.reservedUnits,settledUnits:run.settledUnits});}
   materials.push({...m,ciphertext:undefined,payload:p,fieldCatalog:catalogView(await publishedCatalog(tx,actor.workspaceId,p.dictionary.professional?.version),true),fileName:asset?.fileName??(m.assetId?'原件当前不可用':'作品网址 / 人工记录'),assetReadable:!!asset,accounting:runs});
  }
  return {...batch,title:source.title,providerClaim:source.providerClaim,sourceStatus:source.status,materials:materials.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id))};
 }
 async bump(tx:Tx,b:SupplierInboxBatch){const next=touch(b,this.clock);await tx.replace('supplierInboxBatches',next);return next;}
 async add(tx:Tx,actor:Actor,id:string,input:unknown){const d=S.add.parse(input),{batch}=await this.access(tx,actor,id,true);cas(batch,d.expectedRevision);invariant(batch.state==='OPEN','INBOX_CLOSED','收件批次已关闭',409);
  invariant(!!d.assetId!==!!d.url,'INBOX_MATERIAL_REQUIRED','请选择一份原件或填写一个网址',422);
  const all=await tx.find('supplierInboxMaterials',{workspaceId:actor.workspaceId,batchId:id});invariant(all.length<50,'INBOX_MATERIAL_LIMIT','每批最多50份材料',422);
  if(d.assetId){requirePermission(actor,'assets.read');const asset=await assetFor(tx,actor,d.assetId,this.clock);invariant(asset.sourceId===batch.sourceId&&asset.state==='READY'&&asset.mime!=='video/mp4','INBOX_ASSET_INVALID','请使用本批来源中已就绪的 PDF 或图片',422);invariant(!all.some(m=>m.assetIds.includes(asset.id)&&m.state!=='ERASED'),'INBOX_DUPLICATE_FILE','此原件已在本批收件中，请继续现有任务',409);}
  if(d.url){let url:URL;try{url=new URL(d.url);}catch{throw new AppError(422,'INBOX_URL_INVALID','请填写完整的 HTTP 或 HTTPS 网址');}invariant(['http:','https:'].includes(url.protocol)&&!url.username&&!url.password,'INBOX_URL_INVALID','网址不能包含登录凭证',422);}
  const member=(await tx.get('memberships',actor.membershipId))!,m:SupplierInboxMaterial={...base(actor.workspaceId,this.clock),batchId:id,assetId:d.assetId,createdById:actor.membershipId,personIds:[],workIds:[],assetIds:d.assetId?[d.assetId]:[],actorId:actor.membershipId,actorRevision:member.revision,userEpoch:actor.userEpoch,recoveryEpoch:this.config.recoveryEpoch,state:'WAITING',materialKind:'UNKNOWN',useAi:false,leaseToken:null,leaseUntil:null,runId:null,errorCode:null,ciphertext:null};
  m.ciphertext=this.encode(m,{url:d.url,note:d.note,dictionary:await this.dictionary(tx,actor.workspaceId),chunks:[],subjects:[],totalPages:d.assetId?null:0,nextPages:[],attempt:0,aiConfigDigest:null,aiPermissionAccepted:false,pendingManifest:null,imageImports:{},requestedImages:[]});
  await tx.insert('supplierInboxMaterials',m);return this.bump(tx,batch);
 }
 async start(tx:Tx,actor:Actor,id:string,input:unknown){const d=S.start.parse(input),{batch,source,material:m}=await this.material(tx,actor,id,d.materialId,true);cas(batch,d.expectedRevision);cas(m,d.expectedMaterialRevision);requirePermission(actor,'sensitive.read');
  invariant(batch.state==='OPEN'&&m.state==='WAITING'&&m.assetId,'INBOX_START_UNAVAILABLE','请选择尚未处理的文件；网址只保存，不自动抓取',409);
  await this.duplicateGuard(tx,actor,m);
  const config=d.useAi?await approvedAi(tx,actor.workspaceId,this.config):null;
  if(d.useAi){requirePermission(actor,'ai.use');requirePermission(actor,'sources.review');invariant(d.aiAccepted&&source.status==='CONFIRMED'&&source.basisMode==='INTERNAL_USE','INBOX_AI_PERMISSION_REQUIRED','AI 解析需要审核人明确同意本次原文和页图外送，且来源已确认',422);}
  const p=this.decode(m),member=(await tx.get('memberships',actor.membershipId))!;
  await tx.replace('supplierInboxMaterials',{...touch(m,this.clock),actorId:actor.membershipId,actorRevision:member.revision,userEpoch:actor.userEpoch,useAi:d.useAi,state:'QUEUED',ciphertext:this.encode(m,{...p,aiConfigDigest:config?digest(config):null,aiPermissionAccepted:d.aiAccepted})});return this.bump(tx,batch);
 }
 async duplicateGuard(tx:Tx,actor:Actor,m:SupplierInboxMaterial){
  const asset=m.assetId?await tx.get('assets',m.assetId):null;if(!asset)return;
  for(const old of await tx.find('supplierInboxMaterials',{workspaceId:actor.workspaceId})){if(old.id===m.id||!old.assetId||old.state==='WAITING')continue;const original=await tx.get('assets',old.assetId);if(original?.sha256!==asset.sha256)continue;
   const b=await tx.get('supplierInboxBatches',old.batchId);if(!b||!await scopeVisible(tx,actor,b.scopeId))continue;
   try{await sourceFor(tx,actor,b.sourceId,this.clock);}catch(e){if(e instanceof AppError&&e.status===404)continue;throw e;}
   const runs=[old.runId,...(old.ciphertext?this.decode(old).chunks.map(c=>c.runId):[])].filter((id):id is string=>!!id);
   for(const runId of runs)invariant(!(await tx.find('aiAttempts',{workspaceId:actor.workspaceId,runId})).some(a=>['UNKNOWN','MAY_HAVE_EXECUTED'].includes(a.state)),'AI_OUTCOME_RECONCILE_REQUIRED','可见范围内的同一原件仍有模型请求或费用待核对，不能通过新材料任务绕过原请求',409);
   invariant(['ERASED','IGNORED'].includes(old.state),'INBOX_DUPLICATE_DOCUMENT','当前可见范围内已有相同原件的解析任务或结果，请回到原收件批次核对，避免重复处理',409);
  }
 }
 async save(tx:Tx,actor:Actor,id:string,input:unknown){const d=S.save.parse(input),{batch,material:m}=await this.material(tx,actor,id,d.materialId,true);cas(batch,d.expectedRevision);cas(m,d.expectedMaterialRevision);requirePermission(actor,'sensitive.read');
  invariant(batch.state==='OPEN'&&open.has(m.state),'INBOX_REVIEW_UNAVAILABLE','请等待当前解析结束再核对',409);const p=this.decode(m);
  invariant(new Set(d.subjects.map(s=>s.id)).size===d.subjects.length,'INBOX_SUBJECT_DUPLICATE','主体候选标识不能重复',422);
  const subjects:InboxSubjectDraft[]=d.subjects.map(raw=>{
   const old=p.subjects.find(s=>s.id===raw.id);invariant(old?.state!=='APPLIED','INBOX_SUBJECT_APPLIED','已保存的主体不能再次编辑或重复创建',409);
   const profile=validateSupplierProfile(raw.profile);invariant(raw.decision==='LINK'?!!raw.personId&&!!raw.expectedPersonRevision:raw.personId===null&&raw.expectedPersonRevision===null,'INBOX_TARGET_REQUIRED','关联已有档案时须明确目标及当前版本',422);
   invariant(new Set(raw.evidencePages).size===raw.evidencePages.length&&raw.evidencePages.every(page=>p.chunks.some(c=>c.manifest.pages.some(p=>p.page===page))),'INBOX_EVIDENCE_INVALID','归属页码必须来自已处理页面',422);
   return {...raw,profile,state:raw.decision==='IGNORE'?'IGNORED':'DRAFT',appliedPersonId:null,appliedWorkIds:[],decidedById:null};
  });
  const applied=p.subjects.filter(s=>s.state==='APPLIED');invariant(applied.every(s=>!d.subjects.some(n=>n.id===s.id)),'INBOX_SUBJECT_APPLIED','已保存的主体请保留原结果',409);
  const all=[...applied,...subjects];for(const subject of subjects)if(subject.personId)await td2PersonFor(tx,actor,subject.personId);
  const assetIds=[...new Set([...(m.assetId?[m.assetId]:[]),...Object.values(p.imageImports),...all.flatMap(s=>s.works.flatMap(w=>w.assetIds))])];invariant(assetIds.length<=500,'INBOX_ASSET_LIMIT','单份材料关联素材过多，请拆分整理',422);for(const assetId of [...new Set(all.flatMap(s=>s.works.flatMap(w=>w.assetIds)))]){const asset=await assetFor(tx,actor,assetId,this.clock);invariant(asset.sourceId===batch.sourceId,'INBOX_ASSET_SOURCE','候选素材须来自本批收件来源',422);}
  await tx.replace('supplierInboxMaterials',{...touch(m,this.clock),materialKind:d.materialKind,personIds:[...new Set(all.flatMap(s=>[s.personId,s.appliedPersonId].filter((id):id is string=>!!id)))],assetIds,ciphertext:this.encode(m,{...p,subjects:all})});return this.bump(tx,batch);
 }
 async apply(tx:Tx,actor:Actor,id:string,input:unknown){const d=S.apply.parse(input),{batch,source,material:m}=await this.material(tx,actor,id,d.materialId,true);cas(batch,d.expectedRevision);cas(m,d.expectedMaterialRevision);requirePermission(actor,'sensitive.read');
  invariant(batch.state==='OPEN'&&open.has(m.state)&&d.confirmOwnership,'INBOX_OWNERSHIP_REQUIRED','请先完成人工主体归属核对，解析中不能保存',409);
  invariant(['PERSON_PROFILE','PORTFOLIO','MULTI_PERSON'].includes(m.materialKind),'INBOX_NOT_PERSONAL','公司介绍、拍摄需求和主体不明材料不能直接写入人物资料',422);
  const p=this.decode(m);invariant(!m.assetId||p.totalPages!==null&&p.chunks.flatMap(c=>c.pages).length===p.totalPages,'INBOX_PARSE_INCOMPLETE','请先完成文件解析，再确认保存资料',409);const subject=p.subjects.find(s=>s.id===d.subjectId);invariant(subject?.state==='DRAFT'&&['CREATE','LINK'].includes(subject.decision),'INBOX_SUBJECT_UNAVAILABLE','请明确新建或关联的主体候选',409);
  invariant(!m.assetId||subject.evidencePages.length>0,'INBOX_EVIDENCE_REQUIRED','文件归属须明确至少一页已处理的依据',422);
  const result=await applyInboxSubject(tx,actor,source,subject,p,this.clock,this.config);
  const subjects=p.subjects.map(s=>s.id===subject.id?{...s,state:'APPLIED' as const,appliedPersonId:result.personId,appliedWorkIds:result.workIds,decidedById:actor.membershipId}:s);
  await tx.replace('supplierInboxMaterials',{...touch(m,this.clock),state:subjects.every(s=>['APPLIED','IGNORED'].includes(s.state))?'COMPLETE':'READY',personIds:[...new Set([...m.personIds,result.personId])],workIds:[...new Set([...m.workIds,...result.workIds])],ciphertext:this.encode(m,{...p,subjects})});return this.bump(tx,batch);
 }
 async control(tx:Tx,actor:Actor,id:string,input:unknown){const d=S.control.parse(input),{batch,material:m}=await this.material(tx,actor,id,d.materialId,true);cas(batch,d.expectedRevision);cas(m,d.expectedMaterialRevision);
  invariant(batch.state==='OPEN','INBOX_CLOSED','请先打开收件批次',409);const p=this.decode(m);
  if(d.action==='ERASE'){await this.eraseMaterial(tx,m);return this.bump(tx,batch);}
  if(d.action==='RESUME'){
   invariant(m.state==='PAUSED','INBOX_RESUME_UNAVAILABLE','此材料当前不能续做',409);
   if(m.runId){const attempts=await tx.find('aiAttempts',{workspaceId:m.workspaceId,runId:m.runId});invariant(!attempts.some(a=>['UNKNOWN','MAY_HAVE_EXECUTED'].includes(a.state)),'AI_OUTCOME_RECONCILE_REQUIRED','原模型请求结果或费用未知，请先在费用核对中处理，不能盲目重发',409);invariant(d.aiRetryAccepted,'INBOX_RETRY_CONFIRM_REQUIRED','请明确确认本次重新处理，可能产生新的费用',422);}
   const member=(await tx.get('memberships',actor.membershipId))!;await tx.replace('supplierInboxMaterials',{...touch(m,this.clock),state:!p.requestedImages.length&&(p.totalPages===0||p.totalPages!==null&&p.chunks.flatMap(c=>c.pages).length===p.totalPages)?'READY':'QUEUED',actorId:actor.membershipId,actorRevision:member.revision,userEpoch:actor.userEpoch,runId:null,errorCode:null,leaseToken:null,leaseUntil:null,ciphertext:this.encode(m,{...p,pendingManifest:null,attempt:p.attempt+1})});
  }else{if(m.runId)await new AiLedger(this.clock).cancel(tx,m.workspaceId,m.runId,{requestId:m.id,ip:'inbox'});await tx.replace('supplierInboxMaterials',{...touch(m,this.clock),state:d.action==='IGNORE'?'IGNORED':'PAUSED',leaseToken:null,leaseUntil:null,errorCode:d.action==='HOLD'?'MANUALLY_PAUSED':null});}
  return this.bump(tx,batch);
 }
 async close(tx:Tx,actor:Actor,id:string,input:unknown){const d=S.close.parse(input),{batch}=await this.access(tx,actor,id,true);cas(batch,d.expectedRevision);invariant(!(await tx.find('supplierInboxMaterials',{workspaceId:actor.workspaceId,batchId:id})).some(m=>['QUEUED','PROCESSING'].includes(m.state)),'INBOX_RUNNING','请先暂停处理中的材料',409);const next={...touch(batch,this.clock),state:d.closed?'CLOSED' as const:'OPEN' as const};await tx.replace('supplierInboxBatches',next);return next;}
 async images(tx:Tx,actor:Actor,id:string,input:unknown){const d=S.images.parse(input),{batch,material:m}=await this.material(tx,actor,id,d.materialId,true);cas(batch,d.expectedRevision);cas(m,d.expectedMaterialRevision);requirePermission(actor,'assets.upload');requirePermission(actor,'sensitive.read');invariant(batch.state==='OPEN'&&m.state==='READY','INBOX_IMAGE_UNAVAILABLE','请先完成解析，再选择需要提取的图片',409);const p=this.decode(m);
  const candidates=new Set(p.chunks.flatMap(c=>[...c.manifest.pages.flatMap(page=>page.images.map(i=>imageKey(c.id,i.key))),...c.proposal?.images.map(i=>imageKey(c.id,i.key))??[]]));
  invariant(new Set(d.imageKeys).size===d.imageKeys.length&&d.imageKeys.every(k=>candidates.has(k)&&!p.imageImports[k]),'INBOX_IMAGE_SELECTION','请选择尚未提取的有效图片',422);
  const member=(await tx.get('memberships',actor.membershipId))!;await tx.replace('supplierInboxMaterials',{...touch(m,this.clock),state:'QUEUED',actorId:actor.membershipId,actorRevision:member.revision,userEpoch:actor.userEpoch,ciphertext:this.encode(m,{...p,requestedImages:d.imageKeys})});return this.bump(tx,batch);
 }
 async employee(tx:Tx,m:SupplierInboxMaterial):Promise<Actor>{
  const member=await workspaceRow(tx,'memberships',m.actorId,m.workspaceId),user=member?await tx.get('users',member.userId):null;
  invariant(member?.status==='ACTIVE'&&member.revision===m.actorRevision&&user?.status==='ACTIVE'&&user.sessionEpoch===m.userEpoch,'INBOX_EMPLOYEE_CHANGED','发起员工的当前授权已变化',409);
  return {actorKind:'HUMAN',workspaceId:m.workspaceId,userId:user.id,membershipId:member.id,role:member.role,permissions:permissionsFor(member),displayName:user.displayName,userEpoch:user.sessionEpoch,sessionId:'inbox-worker'};
 }
 async authorizedJob(tx:Tx,m:SupplierInboxMaterial){const actor=await this.employee(tx,m),context=await this.material(tx,actor,m.batchId,m.id,true);requirePermission(actor,'sensitive.read');
  invariant(context.batch.state==='OPEN'&&m.recoveryEpoch===this.config.recoveryEpoch,'INBOX_CONTEXT_CHANGED','收件任务已关闭或进入恢复隔离',409);
  const scope=(await tx.get('scopes',context.batch.scopeId))!;invariant(scope.revision===context.batch.scopeRevision,'INBOX_CONTEXT_CHANGED','收件访问范围已变化',409);
  const asset=m.assetId?await assetFor(tx,actor,m.assetId,this.clock):null;invariant(asset?.sourceId===context.source.id&&asset.state==='READY','INBOX_ASSET_UNAVAILABLE','原材料已不可用',409);
  if(m.useAi){requirePermission(actor,'ai.use');requirePermission(actor,'sources.review');const p=this.decode(m);invariant(p.aiPermissionAccepted&&p.aiConfigDigest===digest(await approvedAi(tx,m.workspaceId,this.config))&&context.source.status==='CONFIRMED','INBOX_AI_CONTEXT_CHANGED','AI 使用依据或配置已变化',409);}
  return {...context,actor,asset};
 }
 async claim(tx:Tx){const now=this.clock.now().toISOString(),live=(await tx.find('supplierInboxMaterials',{state:'PROCESSING'})).filter(m=>!!m.leaseUntil&&m.leaseUntil>now);for(const id of await tx.inboxCandidates(now,32)){const m=(await tx.get('supplierInboxMaterials',id))!;
   if(m.state==='PROCESSING'){await this.fail(tx,m,'DOCUMENT_INTERRUPTED');continue;}
   if(live.some(j=>j.actorId===m.actorId)||live.filter(j=>j.workspaceId===m.workspaceId).length>=2)continue;
   try{await this.authorizedJob(tx,m);}catch(e){if(!(e instanceof AppError))throw e;await this.fail(tx,m,e.code);continue;}
   const next={...touch(m,this.clock),state:'PROCESSING' as const,leaseToken:randomUUID(),leaseUntil:new Date(this.clock.now().getTime()+240000).toISOString()};await tx.replace('supplierInboxMaterials',next);return next;
  }return null;}
 async current(tx:Tx,claim:SupplierInboxMaterial){const m=await tx.get('supplierInboxMaterials',claim.id);invariant(m?.state==='PROCESSING'&&m.leaseToken===claim.leaseToken&&!!m.leaseUntil&&m.leaseUntil>this.clock.now().toISOString(),'INBOX_LEASE_LOST','材料任务已暂停、结束或被其他处理接管',409);return this.authorizedJob(tx,m);}
 async planned(tx:Tx,claim:SupplierInboxMaterial,totalPages:number){const {material:m}=await this.current(tx,claim),p=this.decode(m);invariant(Number.isSafeInteger(totalPages)&&totalPages>0&&totalPages<=100,'DOCUMENT_PAGE_LIMIT','文件最多100页，请先拆分过长文件',422);const completed=new Set(p.chunks.flatMap(c=>c.pages)),pages=Array.from({length:Math.min(4,totalPages-completed.size)},(_,i)=>completed.size+i+1);await tx.replace('supplierInboxMaterials',{...touch(m,this.clock),ciphertext:this.encode(m,{...p,totalPages,nextPages:pages})});return pages;}
 async extracted(tx:Tx,claim:SupplierInboxMaterial,input:unknown){const {material:m,asset}=await this.current(tx,claim),p=this.decode(m),manifest=validateDocumentManifest(input);invariant(manifest.input.sha256===asset.sha256&&digest(manifest.requestedPages)===digest(p.nextPages),'INBOX_PAGE_CHANGED','原件或处理页面与任务计划不一致',409);invariant(!manifest.failedPages.length,'DOCUMENT_PAGES_PARTIAL','本批页面部分失败，请核对后续做',409);await tx.replace('supplierInboxMaterials',{...touch(m,this.clock),ciphertext:this.encode(m,{...p,pendingManifest:manifest})});if(!m.useAi)await this.finishChunk(tx,claim,null);}
 async reserve(tx:Tx,claim:SupplierInboxMaterial,meta:RequestMeta){const {material:m,actor}=await this.current(tx,claim),p=this.decode(m);invariant(p.pendingManifest&&m.useAi&&!m.runId,'INBOX_AI_UNAVAILABLE','此材料不能重复预留 AI 任务',409);const config=await approvedAi(tx,m.workspaceId,this.config),input={manifest:p.pendingManifest,dictionary:p.dictionary},key='inbox-'+m.id+'-'+p.chunks.length+'-'+p.attempt;
  const run=await new AiLedger(this.clock).reserve(tx,m.workspaceId,actor.membershipId,key,digest(input),config.perTaskLimitUnits,config,meta);await tx.replace('supplierInboxMaterials',{...touch(m,this.clock),runId:run.id});return {run,config,input};}
 async finishChunk(tx:Tx,claim:SupplierInboxMaterial,raw:unknown){const {material:m}=await this.current(tx,claim),p=this.decode(m);invariant(p.pendingManifest,'INBOX_RESULT_MISSING','缺少原生提取结果',409);
  const proposal=raw===null?null:validateDocumentProposal(raw,p.pendingManifest,p.dictionary),chunks=[...p.chunks,{id:randomUUID(),pages:p.nextPages,manifest:p.pendingManifest,proposal,runId:m.runId,actorId:m.actorId,sourceRevision:(await tx.get('supplierInboxBatches',m.batchId))!.sourceRevision}],complete=chunks.flatMap(c=>c.pages).length===p.totalPages;
  await tx.replace('supplierInboxMaterials',{...touch(m,this.clock),state:complete?'READY':'QUEUED',materialKind:m.materialKind==='UNKNOWN'&&proposal?.documentKind?proposal.documentKind:m.materialKind,leaseToken:null,leaseUntil:null,errorCode:null,runId:null,ciphertext:this.encode(m,{...p,chunks,pendingManifest:null,nextPages:[]})});
 }
 async fail(tx:Tx,claim:SupplierInboxMaterial,code:string){const m=await tx.get('supplierInboxMaterials',claim.id);if(!m||!['QUEUED','PROCESSING'].includes(m.state)||claim.leaseToken&&m.leaseToken!==claim.leaseToken)return;if(m.runId)await new AiLedger(this.clock).cancel(tx,m.workspaceId,m.runId,{requestId:m.id,ip:'inbox-worker'});await tx.replace('supplierInboxMaterials',{...touch(m,this.clock),state:'PAUSED',leaseToken:null,leaseUntil:null,errorCode:code});}
 async eraseMaterial(tx:Tx,m:SupplierInboxMaterial){if(m.runId)await new AiLedger(this.clock).cancel(tx,m.workspaceId,m.runId,{requestId:m.id,ip:'inbox-cleanup'});await tx.replace('supplierInboxMaterials',{...touch(m,this.clock),state:'ERASED',ciphertext:null,personIds:[],workIds:[],leaseToken:null,leaseUntil:null,errorCode:null});}
}
