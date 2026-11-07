import {answerKey,type ProfessionalAnswer} from './supplier-field-contract.ts';
import {validateAnswerValue} from './supplier-field-validation.ts';
import {encryptDraftPayload,decryptDraftPayload} from './private-draft-payload.ts';
import {randomUUID} from 'node:crypto';
import type {Clock,Config,RequestMeta} from './model.ts';
import type {TalentActor} from './talent-auth-model.ts';
import type {TalentSubmissionItem} from './talent-maintenance-model.ts';
import type {Tx} from './store.ts';
import {SupplierProfiles} from './supplier-profiles.ts';
import {base,touch,cas,workspaceRow} from './helpers.ts';
import {invariant,missing,AppError} from './errors.ts';
import {encryptContact,decryptContact} from './crypto.ts';
import {digest,parseStrictJson} from './json.ts';
import {v,uuid,revision} from './validation.ts';
import {approvedAi} from './ai-operations.ts';
import {AiLedger} from './ai-ledger.ts';
import {talentUploadContext} from './media-ownership.ts';
import {validateDocumentManifest,validateDocumentProposal,type DocumentManifest,type DocumentProposal,type DocumentDictionary} from './document-schema.ts';
import {validateSupplierProfile,type SupplierProfile} from './supplier-profile-schema.ts';
import {saveWorkDrafts,workPlanSchema} from './talent-work-cases.ts';
import {documentWorkKey,documentWorkContains,documentWorkOrigins,type DocumentWorkOrigin} from './supplier-work-origin.ts';
import {DOCUMENT_BATCH_LIMITS as LIMITS,documentActive,type DocumentBatchSummary} from './supplier-document-contract.ts';

export const SupplierDocumentSchemas={
 start:v.object({expectedRevision:revision,assetId:uuid,mode:v.optional(v.enum(['SELECTED','ALL'])),pages:v.optional(v.array(v.number(1,1000000),4,1)),useAi:v.boolean(),aiAccepted:v.boolean()}),
 apply:v.object({expectedRevision:revision,jobId:uuid,expectedJobRevision:revision,selectedKeys:v.array(v.string(100,1),60,1),professionalActions:v.optional(v.array(v.object({key:v.string(100,1),action:v.enum(['ADD','REPLACE'])}),60))}),
 cancel:v.object({expectedRevision:revision,jobId:uuid}),
 images:v.object({expectedRevision:revision,jobId:uuid,expectedJobRevision:revision,imageKeys:v.array(v.string(100,1),10,1)}),
 work:v.object({expectedRevision:revision,jobId:uuid,expectedJobRevision:revision,workKey:v.string(100,1)}),
 workGroup:v.object({expectedRevision:revision,targetClientItemKey:v.nullable(v.string(64,1,/^[A-Za-z0-9_-]+$/)),candidates:v.array(v.object({jobId:uuid,expectedJobRevision:revision,workKey:v.string(100,1)}),60,1)}),
 batch:v.object({expectedRevision:revision,batchId:uuid,expectedBatchRevision:revision,action:v.enum(['CANCEL','RESUME']),aiRetryAccepted:v.boolean()}),
};
type Payload={dictionary:DocumentDictionary;baseFields:Record<string,string>;baseProfessional?:Record<string,string>;manifest?:DocumentManifest;proposal?:DocumentProposal|null;selectedKeys?:string[]};
const measureKeys=new Set(['heightCm','bustCm','waistCm','hipsCm']);
export const prefillableDocumentField=(field:string)=>['displayName','aliases','intro','roleCodes','locationCodes','languageCodes','skillCodes','contacts'].includes(field)||measureKeys.has(field);
function fieldValue(profile:SupplierProfile,field:string){if(field==='measurementDetails')return profile.measurements;return measureKeys.has(field)?profile.measurements[field as keyof typeof profile.measurements]:profile[field as keyof SupplierProfile];}

/** Durable document work stays inside the existing owned server draft. Its content
 * is encrypted and follows submission withdrawal, deletion and retention cleanup. */
export class SupplierDocuments{
 readonly clock:Clock;readonly config:Config;readonly profiles:SupplierProfiles;
 constructor(clock:Clock,config:Config){this.clock=clock;this.config=config;this.profiles=new SupplierProfiles(clock,config);}
 context(item:TalentSubmissionItem){return `supplier-document:${item.workspaceId}:${item.submissionId}:${item.id}`;}
 encode(item:TalentSubmissionItem,payload:Payload){return encryptDraftPayload(JSON.stringify(payload),this.config.contactKey,this.context(item));}
 decode(item:TalentSubmissionItem):Payload{invariant(typeof item.values.ciphertext==='string','DOCUMENT_UNAVAILABLE','解析内容已不可用',409);return parseStrictJson(decryptDraftPayload(item.values.ciphertext,this.config.contactKey,this.context(item))) as Payload;}
 async authorize(tx:Tx,actor:TalentActor,submissionId:string,assetId:string){
  const s=await this.profiles.access(tx,actor,submissionId,true);
  invariant(s.state==='DRAFT','SUPPLIER_DRAFT_CLOSED','请在未确认的草稿中解析材料',409);
  const asset=await workspaceRow(tx,'assets',assetId,actor.workspaceId),upload=asset?await tx.get('uploads',asset.uploadId):null;
  invariant(asset?.state==='READY'&&asset.usageState==='STAGED'&&upload?.state==='READY'&&upload.submissionId===s.id&&upload.talentAccountId===actor.talentAccountId&&asset.mime!=='video/mp4','DOCUMENT_ASSET_UNAVAILABLE','请选择本草稿中已处理完成的 PDF 或图片',409);
  await talentUploadContext(tx,actor,upload,this.clock,this.config);
  return {s,asset,upload};
 }
 async job(tx:Tx,actor:TalentActor,submissionId:string,id:string){
  await this.profiles.access(tx,actor,submissionId);
  const job=await workspaceRow(tx,'talentSubmissionItems',id,actor.workspaceId);
  if(!job||job.submissionId!==submissionId||job.kind!=='DOCUMENT_PARSE'||job.values.erased)missing();return job;
 }
 async list(tx:Tx,actor:TalentActor,submissionId:string){
  await this.profiles.access(tx,actor,submissionId);
  const jobs=await tx.find('talentSubmissionItems',{workspaceId:actor.workspaceId,submissionId,kind:'DOCUMENT_PARSE'});
  const visible=jobs.filter(j=>!j.values.erased),batches=visible.filter(j=>j.values.documentMode==='ALL').map(root=>this.batchSummary(root,visible));
  const workItems=await tx.find('talentSubmissionItems',{workspaceId:actor.workspaceId,submissionId,kind:'WORK'}),workDrafts=[];
  for(const item of workItems.filter(i=>!i.values.erased)){const plan=workPlanSchema.parse(item.values),role=plan.personRoleId?await tx.get('personRoles',plan.personRoleId):null;workDrafts.push({clientItemKey:plan.clientItemKey,title:plan.title,roleCode:role?.roleCode??plan.declaredRoleCode,imageCount:plan.items.length,canAppend:plan.mode==='CREATE_EXTERNAL_WORK'&&!plan.targetWorkId});}
  return {batches,workDrafts,items:visible.filter(j=>j.values.documentMode!=='ALL').map(j=>{const p=this.decode(j);return {id:j.id,revision:j.revision,state:j.state,assetId:j.values.assetId,pages:j.values.pages,useAi:j.values.useAi,errorCode:j.values.errorCode??null,batchId:j.values.batchId??null,supersededBy:j.values.supersededBy??null,
   addedWorks:Object.fromEntries((p.proposal?.works??[]).flatMap(w=>{const item=workItems.find(i=>documentWorkContains(i,j.id,w.key));return item?[[w.key,item.clientItemKey]]:[];})),
   result:p.manifest?{totalPages:p.manifest.totalPages,status:p.manifest.status,pages:p.manifest.pages.map(x=>({page:x.page,text:x.text,needsVisualText:x.needsVisualText,imageCount:x.images.length,warnings:x.warnings})),failedPages:p.manifest.failedPages}:null,
   nativeCatalog:p.dictionary.native??null,professionalCatalog:p.dictionary.professional??null,proposal:p.proposal??null,selectedKeys:p.selectedKeys??[],imageCandidates:[...(p.manifest?.pages.flatMap(page=>page.images.map(i=>({key:i.key,page:i.page,kind:'EMBEDDED'})))??[]),...(p.proposal?.images.map(i=>({key:i.key,page:i.page,kind:'AI_REGION'}))??[])],importedImages:j.values.imageImports??{}};})};
 }
 async start(tx:Tx,actor:TalentActor,submissionId:string,input:unknown){
  const d=SupplierDocumentSchemas.start.parse(input),{s,asset}=await this.authorize(tx,actor,submissionId,d.assetId);cas(s,d.expectedRevision);
  const whole=d.mode==='ALL';
  invariant(whole?d.pages===undefined:!!d.pages?.length,'DOCUMENT_PAGES_INVALID','整份解析无需指定页面，选择页面模式必须填写页码',422);
  const pages=d.pages??[];
  invariant(new Set(pages).size===pages.length,'DOCUMENT_PAGES_INVALID','页码不能重复',422);
  pages.sort((a,b)=>a-b);
  invariant(!d.useAi||d.aiAccepted,'AI_CONSENT_REQUIRED','请明确同意将选定材料发给 ONCE 配置的 AI 服务解析',422);
  const ai=d.useAi?await approvedAi(tx,actor.workspaceId,this.config):null;
  const jobs=await tx.find('talentSubmissionItems',{workspaceId:actor.workspaceId,submissionId,kind:'DOCUMENT_PARSE'});
  const active=new Set(jobs.filter(j=>documentActive(j.state)&&!j.values.supersededBy).map(j=>j.values.batchId??j.id));
  invariant(jobs.length<LIMITS.jobsPerDraft&&active.size<2&&(!whole||jobs.filter(j=>j.values.documentMode==='ALL').length<LIMITS.documentsPerDraft),'DOCUMENT_TASK_LIMIT','请先完成或取消正在处理的材料；每份草稿最多整份解析 5 个文件',409);
  invariant(!whole||!jobs.some(j=>j.values.documentMode==='ALL'&&j.values.assetId===asset.id&&documentActive(j.state)),'DOCUMENT_BATCH_EXISTS','此材料已有整份解析任务，请继续现有任务',409);
  const schema=await this.profiles.schema(tx,actor),detail=await this.profiles.read(tx,actor,submissionId),profile=detail.profile;
  const professional=structuredClone(detail.fieldCatalog);professional.definition.fields=professional.definition.fields.filter(f=>f.ai==='SUGGEST').slice(0,80);
  const aiCodes=new Set(professional.definition.fields.map(f=>f.code));professional.definition.templates=professional.definition.templates.map(t=>({...t,fieldCodes:t.fieldCodes.filter(code=>aiCodes.has(code))}));
  const payload:Payload={baseProfessional:Object.fromEntries((profile.professional?.answers??[]).map(a=>[answerKey(a),digest(a)])),dictionary:{subjectPolicy:'SUPPLIER_SUBJECT_V2',professional,native:{capabilities:schema.skills,languages:schema.languages},roles:schema.roles.map(r=>r.code),locations:schema.locations.map(r=>r.code),languages:schema.languages.map(r=>r.code),skills:schema.skills.map(r=>r.code)},
   baseFields:Object.fromEntries([...Object.keys(profile).filter(k=>k!=='measurements'),...measureKeys,'capabilityDetails','credentials','translation','measurementDetails'].map(k=>[k,digest(fieldValue(profile,k)??null)]))};
  const item:TalentSubmissionItem={...base(actor.workspaceId,this.clock),submissionId,kind:'DOCUMENT_PARSE',clientItemKey:'document-'+randomUUID(),targetId:asset.id,
   values:{assetId:asset.id,sha256:asset.sha256,pages,documentMode:whole?'ALL':'SELECTED',useAi:d.useAi,aiConfigDigest:ai?digest(ai):null,actorEpoch:actor.sessionEpoch,consentId:s.consentId,consentRevision:(await tx.get('talentConsents',s.consentId))!.revision,attempts:0},baseline:{},dependencyGroup:'document',dependsOn:[],state:'PENDING',appliedId:null};
  item.values.ciphertext=this.encode(item,payload);await tx.insert('talentSubmissionItems',item);
  const next=touch(s,this.clock);await tx.replace('talentSubmissions',next);return next;
 }
 batchSummary(root:TalentSubmissionItem,jobs:TalentSubmissionItem[]):DocumentBatchSummary{
  const chunks=jobs.filter(j=>j.values.batchId===root.id&&!j.values.supersededBy),completed=new Set<number>(),failed=new Set<number>(),review=new Set<number>();
  for(const job of chunks){const p=this.decode(job);
   if(p.manifest)for(const page of p.manifest.pages){completed.add(page.page);if(page.warnings.length||page.needsVisualText&&!p.proposal)review.add(page.page);}
   if(job.state==='REJECTED')for(const page of job.values.pages as number[])failed.add(page);
   for(const page of p.manifest?.failedPages??[])failed.add(page.page);
  }
  const failedJobs=chunks.filter(j=>j.state==='REJECTED'),total=typeof root.values.totalPages==='number'?root.values.totalPages:null;
  const sort=(s:Set<number>)=>[...s].sort((a,b)=>a-b);
  return {id:root.id,revision:root.revision,assetId:String(root.values.assetId),state:root.state,useAi:!!root.values.useAi,totalPages:total,
   completedPages:sort(completed),failedPages:sort(failed),pendingPages:total?Array.from({length:total},(_,i)=>i+1).filter(n=>!completed.has(n)&&!failed.has(n)):[],reviewPages:sort(review),
   chunks:chunks.length,completedChunks:chunks.filter(j=>['READY','APPLIED','IMAGE_PENDING','IMAGE_PROCESSING'].includes(j.state)).length,errorCode:typeof root.values.errorCode==='string'?root.values.errorCode:null,
   retryMayCharge:failedJobs.some(j=>typeof j.values.runId==='string'),retryAllowed:root.state==='BATCH_PAUSED'&&failedJobs.length>0&&failedJobs.every(j=>Number(j.values.chunkAttempt??1)<LIMITS.chunkAttempts)&&jobs.length+failedJobs.length<=LIMITS.jobsPerDraft};
 }
 async plan(tx:Tx,claim:TalentSubmissionItem,totalPages:number){
  const {job}=await this.current(tx,claim);
  invariant(job.values.documentMode==='ALL'&&job.values.totalPages===undefined&&Number.isSafeInteger(totalPages)&&totalPages>0&&totalPages<=LIMITS.pages,'DOCUMENT_PLAN_INVALID','整份解析计划无效或已建立',409);
  const jobs=await tx.find('talentSubmissionItems',{workspaceId:job.workspaceId,submissionId:job.submissionId,kind:'DOCUMENT_PARSE'}),count=Math.ceil(totalPages/LIMITS.pagesPerChunk);
  invariant(jobs.length+count<=LIMITS.jobsPerDraft,'DOCUMENT_TASK_LIMIT','本草稿的解析次数已达上限，请分开整理材料',409);
  const payload=this.decode(job);
  for(let index=0;index<count;index++){
   const pages=Array.from({length:Math.min(LIMITS.pagesPerChunk,totalPages-index*LIMITS.pagesPerChunk)},(_,i)=>index*LIMITS.pagesPerChunk+i+1);
   const child:TalentSubmissionItem={...base(job.workspaceId,this.clock),submissionId:job.submissionId,kind:'DOCUMENT_PARSE',clientItemKey:`document-${job.id}-${index}-1`,targetId:job.targetId,
    values:{assetId:job.values.assetId,sha256:job.values.sha256,pages,useAi:job.values.useAi,aiConfigDigest:job.values.aiConfigDigest,actorEpoch:job.values.actorEpoch,consentId:job.values.consentId,consentRevision:job.values.consentRevision,batchId:job.id,batchIndex:index,chunkAttempt:1,attempts:0},baseline:{},dependencyGroup:'document',dependsOn:[],state:'PENDING',appliedId:null};
   child.values.ciphertext=this.encode(child,{dictionary:payload.dictionary,baseFields:payload.baseFields,baseProfessional:payload.baseProfessional});await tx.insert('talentSubmissionItems',child);
  }
  await tx.replace('talentSubmissionItems',{...touch(job,this.clock),state:'BATCH_RUNNING',values:{...job.values,totalPages,chunkCount:count,leaseToken:null,leaseUntil:null}});
 }
 async settleBatch(tx:Tx,job:TalentSubmissionItem){
  if(typeof job.values.batchId!=='string')return;
  const root=await tx.get('talentSubmissionItems',job.values.batchId);
  if(!root||root.state!=='BATCH_RUNNING')return;
  const s=await tx.get('talentSubmissions',root.submissionId);
  if(!s||s.state!=='DRAFT'||root.values.erased){await tx.replace('talentSubmissionItems',{...touch(root,this.clock),state:'REJECTED'});return;}
  const chunks=(await tx.find('talentSubmissionItems',{workspaceId:root.workspaceId,submissionId:root.submissionId,kind:'DOCUMENT_PARSE'})).filter(j=>j.values.batchId===root.id&&!j.values.supersededBy);
  const failed=chunks.find(j=>j.state==='REJECTED');
  if(failed)await tx.replace('talentSubmissionItems',{...touch(root,this.clock),state:'BATCH_PAUSED',values:{...root.values,errorCode:failed.values.errorCode??'DOCUMENT_INTERRUPTED'}});
  else if(chunks.length===root.values.chunkCount&&chunks.every(j=>['READY','APPLIED','IMAGE_PENDING','IMAGE_PROCESSING'].includes(j.state)))await tx.replace('talentSubmissionItems',{...touch(root,this.clock),state:'READY',values:{...root.values,errorCode:null}});
 }
 async controlBatch(tx:Tx,actor:TalentActor,submissionId:string,input:unknown){
  const d=SupplierDocumentSchemas.batch.parse(input),s=await this.profiles.access(tx,actor,submissionId,true);cas(s,d.expectedRevision);
  invariant(s.state==='DRAFT','SUPPLIER_DRAFT_CLOSED','请在草稿中处理材料',409);
  const root=await this.job(tx,actor,submissionId,d.batchId);cas(root,d.expectedBatchRevision);
  invariant(root.values.documentMode==='ALL','DOCUMENT_BATCH_INVALID','请选择整份解析任务',409);
  const jobs=await tx.find('talentSubmissionItems',{workspaceId:actor.workspaceId,submissionId,kind:'DOCUMENT_PARSE'}),chunks=jobs.filter(j=>j.values.batchId===root.id&&!j.values.supersededBy);
  if(d.action==='CANCEL'){
   invariant(documentActive(root.state),'DOCUMENT_BATCH_CLOSED','整份解析已经结束',409);
   for(const child of chunks.filter(j=>documentActive(j.state)))await this.fail(tx,child,'CANCELLED');
   const latest=(await tx.get('talentSubmissionItems',root.id))!;
   await tx.replace('talentSubmissionItems',{...touch(latest,this.clock),state:'REJECTED',values:{...latest.values,errorCode:'CANCELLED',leaseToken:null,leaseUntil:null}});
  }else{
   await this.authorizeJob(tx,root);
   const summary=this.batchSummary(root,jobs);
   invariant(summary.retryAllowed,'DOCUMENT_BATCH_RETRY_UNAVAILABLE','此任务不能续做；请检查处理状态或次数上限',409);
   invariant(!summary.retryMayCharge||d.aiRetryAccepted,'DOCUMENT_AI_RETRY_CONFIRM_REQUIRED','失败批次可能已产生费用；请明确确认后重新处理，已完成批次不会重发',409);
   for(const failed of chunks.filter(j=>j.state==='REJECTED')){
    const attempt=Number(failed.values.chunkAttempt??1)+1,payload=this.decode(failed);
    const next:TalentSubmissionItem={...base(root.workspaceId,this.clock),submissionId,kind:'DOCUMENT_PARSE',clientItemKey:`document-${root.id}-${failed.values.batchIndex}-${attempt}`,targetId:root.targetId,
     values:{assetId:root.values.assetId,sha256:root.values.sha256,pages:failed.values.pages,useAi:root.values.useAi,aiConfigDigest:root.values.aiConfigDigest,actorEpoch:root.values.actorEpoch,consentId:root.values.consentId,consentRevision:root.values.consentRevision,batchId:root.id,batchIndex:failed.values.batchIndex,chunkAttempt:attempt,attempts:0,retryOf:failed.id},baseline:{},dependencyGroup:'document',dependsOn:[],state:'PENDING',appliedId:null};
    next.values.ciphertext=this.encode(next,{dictionary:payload.dictionary,baseFields:payload.baseFields,baseProfessional:payload.baseProfessional});await tx.insert('talentSubmissionItems',next);
    await tx.replace('talentSubmissionItems',{...touch(failed,this.clock),values:{...failed.values,supersededBy:next.id}});
   }
   await tx.replace('talentSubmissionItems',{...touch(root,this.clock),state:'BATCH_RUNNING',values:{...root.values,errorCode:null}});
  }
  const next=touch(s,this.clock);await tx.replace('talentSubmissions',next);return next;
 }
 async authorizeJob(tx:Tx,job:TalentSubmissionItem){
  const s=await tx.get('talentSubmissions',job.submissionId);
  invariant(s?.talentAccountId,'DOCUMENT_UNAVAILABLE','材料任务不可用',409);
  const actor:TalentActor={actorKind:'TALENT',workspaceId:s.workspaceId,talentAccountId:s.talentAccountId,sessionId:'document-worker',sessionEpoch:Number(job.values.actorEpoch)};
  const owned=await this.authorize(tx,actor,s.id,String(job.values.assetId)),consent=await tx.get('talentConsents',owned.s.consentId);
  invariant(owned.asset.sha256===job.values.sha256&&s.consentId===job.values.consentId&&consent?.revision===job.values.consentRevision,'DOCUMENT_CONTEXT_CHANGED','材料或使用同意已变化',409);
  invariant((await tx.get('talentAccounts',actor.talentAccountId))?.sessionEpoch===actor.sessionEpoch,'DOCUMENT_CONTEXT_CHANGED','发起账号已变化',409);
  if(job.values.useAi)invariant(digest(await approvedAi(tx,actor.workspaceId,this.config))===job.values.aiConfigDigest,'AI_CONFIG_CHANGED','AI 配置已变化',409);
  return {...owned,actor};
 }
 async claim(tx:Tx){
  const running=[...await tx.find('talentSubmissionItems',{kind:'DOCUMENT_PARSE',state:'PROCESSING'}),...await tx.find('talentSubmissionItems',{kind:'DOCUMENT_PARSE',state:'IMAGE_PROCESSING'})];
  for(const job of running)if(!job.values.leaseUntil||job.values.erased||String(job.values.leaseUntil)<=this.clock.now().toISOString()){
   // No AI request is automatically repeated, even if its worker disappeared.
   await this.fail(tx,job,'DOCUMENT_INTERRUPTED');
  }
  // Revocation also closes pages that have never reached a worker.
  for(const root of await tx.find('talentSubmissionItems',{kind:'DOCUMENT_PARSE',state:'BATCH_RUNNING'})){
   try{await this.authorizeJob(tx,root);}catch(e){
    if(!(e instanceof AppError))throw e;
    const s=await tx.get('talentSubmissions',root.submissionId);
    for(const child of await tx.find('talentSubmissionItems',{workspaceId:root.workspaceId,submissionId:root.submissionId,kind:'DOCUMENT_PARSE'}))if(child.values.batchId===root.id&&documentActive(child.state))await this.fail(tx,child,e.code);
    const latest=(await tx.get('talentSubmissionItems',root.id))!;
    await tx.replace('talentSubmissionItems',{...touch(latest,this.clock),state:'REJECTED',values:s?.state==='DRAFT'&&!latest.values.erased?{...latest.values,errorCode:e.code}:latest.values});
   }
  }
  const live=[...await tx.find('talentSubmissionItems',{kind:'DOCUMENT_PARSE',state:'PROCESSING'}),...await tx.find('talentSubmissionItems',{kind:'DOCUMENT_PARSE',state:'IMAGE_PROCESSING'})];
  const busyAccounts=new Set<string>(),workspaceSlots=new Map<string,number>();
  for(const row of live){const s=await tx.get('talentSubmissions',row.submissionId);if(s?.talentAccountId)busyAccounts.add(s.talentAccountId);workspaceSlots.set(row.workspaceId,(workspaceSlots.get(row.workspaceId)??0)+1);}
  const queued=[...await tx.find('talentSubmissionItems',{kind:'DOCUMENT_PARSE',state:'PENDING'}),...await tx.find('talentSubmissionItems',{kind:'DOCUMENT_PARSE',state:'IMAGE_PENDING'})].sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
  for(const job of queued){
   if(job.values.supersededBy)continue;
   const s=await tx.get('talentSubmissions',job.submissionId);
   if(s?.talentAccountId&&busyAccounts.has(s.talentAccountId)||(workspaceSlots.get(job.workspaceId)??0)>=2)continue;
   if(typeof job.values.batchId==='string'&&job.state==='PENDING'){
    const root=await tx.get('talentSubmissionItems',job.values.batchId);
    if(root?.state!=='BATCH_RUNNING')continue;
    const peers=await tx.find('talentSubmissionItems',{workspaceId:job.workspaceId,submissionId:job.submissionId,kind:'DOCUMENT_PARSE'});
    if(peers.some(p=>p.values.batchId===root.id&&!p.values.supersededBy&&Number(p.values.batchIndex)<Number(job.values.batchIndex)&&!['READY','APPLIED','IMAGE_PENDING','IMAGE_PROCESSING'].includes(p.state)))continue;
   }
   try{await this.authorizeJob(tx,job);}catch(e){if(!(e instanceof AppError))throw e;await this.fail(tx,job,e.code);continue;}
   const next:TalentSubmissionItem={...touch(job,this.clock),state:job.state==='IMAGE_PENDING'?'IMAGE_PROCESSING':'PROCESSING',values:{...job.values,leaseToken:randomUUID(),leaseUntil:new Date(this.clock.now().getTime()+240000).toISOString(),attempts:Number(job.values.attempts)+1}};
   await tx.replace('talentSubmissionItems',next);return next;
  }return null;
 }
 async current(tx:Tx,claim:TalentSubmissionItem){
  const job=await tx.get('talentSubmissionItems',claim.id);
  invariant(job&&['PROCESSING','IMAGE_PROCESSING'].includes(job.state)&&job.values.leaseToken===claim.values.leaseToken&&String(job.values.leaseUntil)>this.clock.now().toISOString(),'DOCUMENT_LEASE_LOST','材料处理已结束或中断',409);
  if(typeof job.values.batchId==='string'&&job.state==='PROCESSING')invariant((await tx.get('talentSubmissionItems',job.values.batchId))?.state==='BATCH_RUNNING'&&!job.values.supersededBy,'DOCUMENT_BATCH_STOPPED','整份解析已暂停或取消',409);
  const context=await this.authorizeJob(tx,job);return {job,...context};
 }
 async extracted(tx:Tx,claim:TalentSubmissionItem,raw:unknown){
  const {job}=await this.current(tx,claim),manifest=validateDocumentManifest(raw);
  invariant(manifest.input.sha256===job.values.sha256&&digest(manifest.requestedPages)===digest(job.values.pages),'DOCUMENT_INPUT_CHANGED','解析材料或页面发生变化',409);
  const payload={...this.decode(job),manifest};
  const next={...touch(job,this.clock),state:job.values.useAi?'PROCESSING':'READY',values:{...job.values,ciphertext:this.encode(job,payload)}};
  await tx.replace('talentSubmissionItems',next);
  if(job.values.batchId&&manifest.failedPages.length){
   // Preserve readable pages, but do not send an incomplete chunk to a model.
   await tx.replace('talentSubmissionItems',{...next,state:'PROCESSING'});
   await this.fail(tx,claim,'DOCUMENT_PAGES_PARTIAL');return (await tx.get('talentSubmissionItems',job.id))!;
  }
  if(next.state==='READY')await this.settleBatch(tx,next);return next;
 }
 async reserve(tx:Tx,claim:TalentSubmissionItem,meta:RequestMeta){
  const {job,actor}=await this.current(tx,claim),p=this.decode(job);
  invariant(p.manifest&&job.values.useAi,'DOCUMENT_AI_UNAVAILABLE','材料尚未提取完成',409);
  const input={manifest:p.manifest,dictionary:p.dictionary},config=await approvedAi(tx,actor.workspaceId,this.config);
  const run=await new AiLedger(this.clock).reserve(tx,actor.workspaceId,null,job.id,digest(input),config.perTaskLimitUnits,config,meta,{talentAccountId:actor.talentAccountId,actorEpoch:actor.sessionEpoch});
  await tx.replace('talentSubmissionItems',{...touch(job,this.clock),values:{...job.values,runId:run.id}});return {input,run,config};
 }
 async proposal(tx:Tx,claim:TalentSubmissionItem,output:unknown){
  const {job}=await this.current(tx,claim),p=this.decode(job);
  invariant(p.manifest,'DOCUMENT_UNAVAILABLE','提取记录不可用',409);
  const proposal=validateDocumentProposal(output,p.manifest,p.dictionary);
  await tx.replace('talentSubmissionItems',{...touch(job,this.clock),state:'READY',values:{...job.values,ciphertext:this.encode(job,{...p,proposal})}});
  await this.settleBatch(tx,job);
 }
 async fail(tx:Tx,claim:TalentSubmissionItem,code:string){
  const job=await tx.get('talentSubmissionItems',claim.id),s=job?await tx.get('talentSubmissions',job.submissionId):null;
  if(!job||!s||!['PENDING','PROCESSING','IMAGE_PENDING','IMAGE_PROCESSING'].includes(job.state))return;
  if(claim.values.leaseToken&&job.values.leaseToken!==claim.values.leaseToken)return;
  const runId=job.values.runId??(await tx.find('aiRuns',{workspaceId:job.workspaceId,requestKey:job.id,purpose:'SUPPLIER_DOCUMENT'}))[0]?.id;
  if(typeof runId==='string')await new AiLedger(this.clock).cancel(tx,job.workspaceId,runId,{requestId:job.id,ip:'document-worker'});
  await tx.replace('talentSubmissionItems',{...touch(job,this.clock),state:'REJECTED',values:s.state==='DRAFT'&&!job.values.erased?{...job.values,errorCode:code}:job.values});
  await this.settleBatch(tx,job);
 }
 async apply(tx:Tx,actor:TalentActor,submissionId:string,input:unknown){
  const d=SupplierDocumentSchemas.apply.parse(input),job=await this.job(tx,actor,submissionId,d.jobId);cas(job,d.expectedJobRevision);
  await this.authorizeJob(tx,job);
  invariant(job.state==='READY','DOCUMENT_PROPOSAL_CLOSED','请使用尚未采纳的解析结果',409);
  const p=this.decode(job);invariant(p.manifest&&p.proposal,'DOCUMENT_PROPOSAL_REQUIRED','此材料没有 AI 字段建议',409);
  const proposal=validateDocumentProposal(p.proposal,p.manifest,p.dictionary),profile=(await this.profiles.read(tx,actor,submissionId)).profile;
  const profileBaseline=structuredClone(profile);
  const selectedNative=(proposal.nativeFields??[]).filter(f=>d.selectedKeys.includes(f.key));
  const selected=proposal.fields.filter(f=>d.selectedKeys.includes(f.key));
  const selectedProfessional=(proposal.professionalFields??[]).filter(f=>d.selectedKeys.includes(f.key));
  invariant(selected.length+selectedProfessional.length+selectedNative.length===d.selectedKeys.length&&new Set(d.selectedKeys).size===d.selectedKeys.length&&selected.every(f=>prefillableDocumentField(f.field)),'DOCUMENT_SELECTION_INVALID','请选择有效且支持预填的字段',422);
  invariant(new Set(d.professionalActions?.map(a=>a.key)).size===(d.professionalActions?.length??0)&&(d.professionalActions??[]).every(a=>[...selected,...selectedProfessional,...selectedNative].some(f=>f.key===a.key)),'DOCUMENT_SELECTION_INVALID','字段操作与选中建议不一致',422);
  for(const f of selected){invariant(p.baseFields[f.field]===digest(fieldValue(profile,f.field))||digest(f.value)===digest(fieldValue(profile,f.field)),'DOCUMENT_FIELD_CONFLICT','该字段在解析后已被修改，请保留现值或手动核对，不会自动覆盖',409);
   const appendable=['aliases','roleCodes','locationCodes','languageCodes','skillCodes','contacts'].includes(f.field),action=d.professionalActions?.find(a=>a.key===f.key)?.action??(appendable?'ADD':'REPLACE');invariant(appendable||action!=='ADD','DOCUMENT_ACTION_INVALID','此字段须明确替换，不能追加',422);
   let value=f.value;if(appendable&&action==='ADD'){const old=fieldValue(profileBaseline,f.field) as unknown[];value=f.field==='contacts'?[...new Map([...old,...f.value as unknown[]].map(raw=>{const c=raw as {kind:string;value:string};return [c.kind+':'+c.value.trim(),c];})).values()]:[...new Set([...old,...f.value as unknown[]])];}
   if(measureKeys.has(f.field))Object.assign(profile.measurements,{[f.field]:value});else Object.assign(profile,{[f.field]:value});}
  if(selectedProfessional.length){const catalog=p.dictionary.professional;invariant(catalog,'DOCUMENT_PROFESSIONAL_UNKNOWN','解析目录不可用',409);
   invariant(!profile.professional||profile.professional.catalogVersion===catalog.version&&profile.professional.catalogDigest===catalog.digest,'DOCUMENT_CATALOG_CONFLICT','草稿已换用其他字段版本，请手工核对这些建议',409);
   const answers=profile.professional?.answers??[];
   invariant(new Set(d.professionalActions?.map(a=>a.key)).size===(d.professionalActions?.length??0)&&(d.professionalActions??[]).every(a=>[...selected,...selectedProfessional,...selectedNative].some(f=>f.key===a.key)),'DOCUMENT_SELECTION_INVALID','专业字段操作与选中建议不一致',422);
   for(const f of selectedProfessional){const key=answerKey(f),current=answers.find(a=>answerKey(a)===key),field=catalog.definition.fields.find(a=>a.code===f.fieldCode)!;
    invariant((p.baseProfessional?.[key]??digest(null))===digest(current??null)||digest(current?.value??null)===digest(f.value),'DOCUMENT_FIELD_CONFLICT','该专业字段在解析后已修改，请手工核对，不会自动覆盖',409);
    const action=d.professionalActions?.find(a=>a.key===f.key)?.action??(['CODE_SET','RECORDS'].includes(field.type)?'ADD':'REPLACE');
    invariant(action!=='ADD'||['CODE_SET','RECORDS'].includes(field.type),'DOCUMENT_ACTION_INVALID','仅多选与成组记录可以追加',422);
    let value=f.value;if(action==='ADD'&&current?.state==='KNOWN')value=field.type==='CODE_SET'?[...new Set([...(current.value as string[]),...(f.value as string[])])]:[...(current.value as unknown[]),...(f.value as unknown[])];
    value=validateAnswerValue(value,field,current?.value);const answer:ProfessionalAnswer={fieldCode:f.fieldCode,roleCode:f.roleCode,state:'KNOWN',value};
    const index=answers.findIndex(a=>answerKey(a)===key);if(index<0)answers.push(answer);else answers[index]=answer;
   }profile.professional={catalogVersion:catalog.version,catalogDigest:catalog.digest,answers};
  }
  if(selectedNative.length){invariant(new Set(d.professionalActions?.map(a=>a.key)).size===(d.professionalActions?.length??0)&&(d.professionalActions??[]).every(a=>[...selected,...selectedProfessional,...selectedNative].some(f=>f.key===a.key)),'DOCUMENT_SELECTION_INVALID','专业字段操作与选中建议不一致',422);
   for(const f of selectedNative){const current=fieldValue(profileBaseline,f.field)??null;invariant((p.baseFields[f.field]??digest(null))===digest(current)||digest(current)===digest(f.value),'DOCUMENT_FIELD_CONFLICT','专业记录已被修改，请手工核对，不会自动覆盖',409);
    const action=d.professionalActions?.find(a=>a.key===f.key)?.action??'ADD';let value=f.value;
    if(action==='ADD'&&current){if(f.field==='capabilityDetails'){const rows=current as NonNullable<SupplierProfile['capabilityDetails']>;const added=[...rows];for(const item of f.value as typeof rows){const old=added.find(c=>c.roleCode===item.roleCode&&c.capabilityCode===item.capabilityCode);invariant(!old||old.levelCode===item.levelCode,'DOCUMENT_FIELD_CONFLICT','相同能力已有不同等级，请明确替换或手工核对',409);if(!old)added.push(item);}value=added;}
     else if(f.field==='credentials')value=[...new Map([...(current as unknown[]),...(f.value as unknown[])].map(c=>[digest(c),c])).values()];
     else if(f.field==='translation'){const old=current as NonNullable<SupplierProfile['translation']>,fresh=f.value as typeof old;value={pairs:[...new Map([...old.pairs,...fresh.pairs].map(r=>[r.sourceLanguageCode+':'+r.targetLanguageCode,r])).values()],modeCodes:[...new Set([...old.modeCodes,...fresh.modeCodes])]};}
    }
    if(f.field==='measurementDetails')Object.assign(profile.measurements,value);else Object.assign(profile,{[f.field]:value});
   }
  }
  validateSupplierProfile(profile);
  const next=await this.profiles.save(tx,actor,submissionId,{expectedRevision:d.expectedRevision,profile});
  await tx.replace('talentSubmissionItems',{...touch(job,this.clock),state:'APPLIED',appliedId:submissionId,values:{...job.values,ciphertext:this.encode(job,{...p,selectedKeys:d.selectedKeys})},
   baseline:{materialSha256:p.manifest.input.sha256,selectedFields:[...selected.map(f=>({field:f.field,evidence:f.evidence.map(e=>({page:e.page,bbox:e.bbox,kind:e.kind}))})),...selectedProfessional.map(f=>({field:f.fieldCode,roleCode:f.roleCode,evidence:f.evidence.map(e=>({page:e.page,bbox:e.bbox,kind:e.kind}))})),...selectedNative.map(f=>({field:f.field,evidence:f.evidence.map(e=>({page:e.page,bbox:e.bbox,kind:e.kind}))}))]}});
  return next;
 }
 async cancel(tx:Tx,actor:TalentActor,submissionId:string,input:unknown){
  const d=SupplierDocumentSchemas.cancel.parse(input),s=await this.profiles.access(tx,actor,submissionId,true);cas(s,d.expectedRevision);
  invariant(s.state==='DRAFT','SUPPLIER_DRAFT_CLOSED','已确认资料不能撤销解析',409);
  const job=await this.job(tx,actor,submissionId,d.jobId);
  invariant(!job.values.batchId&&job.values.documentMode!=='ALL','DOCUMENT_BATCH_CONTROL_REQUIRED','请使用整份解析的停止或继续操作',409);
  invariant(job.state!=='APPLIED','DOCUMENT_PROPOSAL_CLOSED','建议已进入草稿，可直接修改草稿字段',409);
  if(typeof job.values.runId==='string')await new AiLedger(this.clock).cancel(tx,actor.workspaceId,job.values.runId,{requestId:job.id,ip:'portal'});
  await tx.replace('talentSubmissionItems',{...touch(job,this.clock),state:'REJECTED',values:{...job.values,errorCode:'CANCELLED'}});
  const next=touch(s,this.clock);await tx.replace('talentSubmissions',next);return next;
 }
 async images(tx:Tx,actor:TalentActor,submissionId:string,input:unknown){
  const d=SupplierDocumentSchemas.images.parse(input),s=await this.profiles.access(tx,actor,submissionId,true);cas(s,d.expectedRevision);
  const job=await this.job(tx,actor,submissionId,d.jobId);cas(job,d.expectedJobRevision);await this.authorizeJob(tx,job);
  invariant(['READY','APPLIED'].includes(job.state),'DOCUMENT_PROPOSAL_CLOSED','请先完成材料提取',409);
  const p=this.decode(job),available=[...(p.manifest?.pages.flatMap(page=>page.images.map(i=>i.key))??[]),...(p.proposal?.images.map(i=>i.key)??[])];
  invariant(new Set(d.imageKeys).size===d.imageKeys.length&&d.imageKeys.every(k=>available.includes(k)),'DOCUMENT_IMAGE_INVALID','请选择本次提取的有效图片',422);
  const previous=(job.values.imageImports??{}) as Record<string,string>;
  invariant(d.imageKeys.every(k=>!previous[k]),'DOCUMENT_IMAGE_ALREADY_IMPORTED','图片已加入本草稿，请使用已有素材',409);
  await tx.replace('talentSubmissionItems',{...touch(job,this.clock),state:'IMAGE_PENDING',values:{...job.values,imageKeys:d.imageKeys,resumeState:job.state}});
  const next=touch(s,this.clock);await tx.replace('talentSubmissions',next);return next;
 }
 async work(tx:Tx,actor:TalentActor,submissionId:string,input:unknown){
  const d=SupplierDocumentSchemas.work.parse(input);
  return this.workGroup(tx,actor,submissionId,{expectedRevision:d.expectedRevision,targetClientItemKey:null,candidates:[{jobId:d.jobId,expectedJobRevision:d.expectedJobRevision,workKey:d.workKey}]});
 }
 async workGroup(tx:Tx,actor:TalentActor,submissionId:string,input:unknown){
  const d=SupplierDocumentSchemas.workGroup.parse(input),s=await this.profiles.access(tx,actor,submissionId,true);cas(s,d.expectedRevision);
  invariant(s.state==='DRAFT','SUPPLIER_DRAFT_CLOSED','请在未确认的草稿中整理作品',409);
  invariant(new Set(d.candidates.map(c=>documentWorkKey(c.jobId,c.workKey))).size===d.candidates.length,'DOCUMENT_WORK_DUPLICATE','同一作品候选不能重复选择',422);
  const previous=await tx.find('talentSubmissionItems',{workspaceId:actor.workspaceId,submissionId,kind:'WORK'}),selected=[];
  for(const ref of d.candidates){
   const job=await this.job(tx,actor,submissionId,ref.jobId);cas(job,ref.expectedJobRevision);await this.authorizeJob(tx,job);
   invariant(['READY','APPLIED'].includes(job.state)&&!job.values.supersededBy,'DOCUMENT_PROPOSAL_CLOSED','请先完成材料解析，并使用当前处理结果',409);
   const candidate=this.decode(job).proposal?.works.find(w=>w.key===ref.workKey);
   invariant(candidate,'DOCUMENT_WORK_UNAVAILABLE','作品候选已不可用，请重新读取材料',409);
   invariant(candidate.roleCode,'WORK_ROLE_REQUIRED','此作品没有明确的本人职业，请在作品草稿中手动补充',422);
   invariant(!previous.some(i=>documentWorkContains(i,job.id,ref.workKey)),'DOCUMENT_WORK_ALREADY_ADDED','该作品候选已加入草稿，可在作品区域修改',409);
   selected.push({job,candidate});
  }
  const first=selected[0]!,roleCode=first.candidate.roleCode!;
  invariant(selected.every(c=>c.candidate.roleCode===roleCode),'DOCUMENT_WORK_ROLE_CONFLICT','所选候选的本人职业不同，请分开整理案例',422);
  const profile=(await this.profiles.read(tx,actor,submissionId)).profile;
  invariant(profile.roleCodes.includes(roleCode),'WORK_ROLE_REQUIRED','请先在基础资料中保存作品对应职业',422);
  const role=s.personId?(await tx.find('personRoles',{workspaceId:actor.workspaceId,personId:s.personId,roleCode,status:'ACTIVE'}))[0]:null;
  invariant(!s.personId||role,'WORK_ROLE_REQUIRED','请先确认新的职业资料入库，再添加该职业作品',422);
  const target=d.targetClientItemKey?previous.find(i=>i.clientItemKey===d.targetClientItemKey):null;
  invariant(!d.targetClientItemKey||target,'DOCUMENT_WORK_TARGET_UNAVAILABLE','目标案例草稿已变化，请重新选择',409);
  const existing=target?workPlanSchema.parse(target.values):null;
  invariant(!existing||existing.mode==='CREATE_EXTERNAL_WORK'&&!existing.targetWorkId,'DOCUMENT_WORK_TARGET_INVALID','只能补充当前新建的案例草稿',422);
  invariant(!existing||(role?existing.personRoleId===role.id:existing.declaredRoleCode===roleCode),'DOCUMENT_WORK_ROLE_CONFLICT','目标案例与候选的本人职业不同，请分开整理',422);
  const items=[...(existing?.items??[])],origins:DocumentWorkOrigin[]=target?[...documentWorkOrigins(target)]:[];
  invariant(origins.length+selected.length<=60,'DOCUMENT_WORK_ORIGIN_LIMIT','单个案例最多归入 60 个作品候选，请分开整理',422);
  for(const {job,candidate} of selected){
   const imports=(job.values.imageImports??{}) as Record<string,string>;
   for(const imageKey of candidate.imageKeys){const id=imports[imageKey];if(!id||items.some(i=>i.assetId===id))continue;const asset=await tx.get('assets',id);
    invariant(asset?.state==='READY'&&asset.usageState==='STAGED','DOCUMENT_WORK_IMAGE_UNAVAILABLE','候选图片已移除或不可用，请重新核对材料',409);
    items.push({assetId:id,referenceKind:'SUBMISSION_STAGED_ASSET'});
   }
   origins.push({assetId:job.targetId!,sha256:String(job.values.sha256),jobId:job.id,workKey:candidate.key,evidence:candidate.evidence.map(e=>({page:e.page,bbox:e.bbox,kind:e.kind}))});
  }
  invariant(items.length<=30,'WORK_ITEM_LIMIT','合并后超过单个案例 30 项素材的上限，请减少所选候选',422);
  const key=existing?.clientItemKey??documentWorkKey(first.job.id,first.candidate.key),candidate=first.candidate;
  const plan=existing?{...existing,items}:{clientItemKey:key,mode:'CREATE_EXTERNAL_WORK' as const,targetWorkId:null,expectedWorkRevision:null,personRoleId:role?.id??null,declaredRoleCode:s.personId?null:roleCode,
   title:candidate.title,description:candidate.description,caseDate:candidate.dateText||null,datePrecision:candidate.dateText?'APPROXIMATE' as const:'UNKNOWN' as const,location:'',industryCode:null,workTypeCodes:[],brandDisplayName:candidate.brandDisplayName,creditNote:'',coverAssetId:items[0]?.assetId??null,items};
  const next=await saveWorkDrafts(tx,actor,submissionId,{expectedRevision:d.expectedRevision,works:existing?previous.map(i=>i.clientItemKey===key?plan:workPlanSchema.parse(i.values)):[...previous.map(i=>workPlanSchema.parse(i.values)),plan]},this.clock,this.config);
  const item=(await tx.find('talentSubmissionItems',{workspaceId:actor.workspaceId,submissionId,clientItemKey:key}))[0]!;
  // Keep the first-origin field for existing exports; retain all new origins,
  // including separate batch IDs and page coordinates, through later form edits.
  await tx.replace('talentSubmissionItems',{...touch(item,this.clock),baseline:{...item.baseline,originDocument:item.baseline.originDocument??origins[0],originDocuments:origins}});
  return next;
 }
}
