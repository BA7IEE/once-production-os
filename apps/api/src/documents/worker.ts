import {mkdir,mkdtemp,readFile,writeFile,rm,readdir,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import sharp from 'sharp';
import {Readable} from 'node:stream';
import {MediaWorker} from '../media/worker.ts';
import {touch,audit} from '../../../../packages/core/src/helpers.ts';
import type {TalentSubmissionItem} from '../../../../packages/core/src/talent-maintenance-model.ts';
import type {ParsedDocument} from './parser.ts';
import type {Application} from '../../../../packages/core/src/api.ts';
import {SupplierDocuments} from '../../../../packages/core/src/supplier-documents.ts';
import {dispatchAi} from '../../../../packages/core/src/ai-dispatch.ts';
import {connectionRow,connectionKey} from '../../../../packages/core/src/ai-connection.ts';
import {digest} from '../../../../packages/core/src/json.ts';
import {AppError,invariant} from '../../../../packages/core/src/errors.ts';
import {LocalMediaProvider} from '../media/local-provider.ts';
import {ModelClient,type DocumentModelInput,type DocumentModelResult} from '../ai/model-client.ts';
import {parseDocumentFile,inspectDocumentFile} from './parser.ts';
type Model={callDocument(input:DocumentModelInput,context:{signal:AbortSignal;deadlineAt:string}):Promise<DocumentModelResult>};

/** Local extraction can be retried by the person. Model sending always goes through
 * the durable one-send ledger; process loss never automatically repeats a paid call. */
export class SupplierDocumentWorker{
 readonly core:Application;readonly provider:LocalMediaProvider;readonly documents:SupplierDocuments;
 readonly modelFactory:((workspaceId:string)=>Promise<Model|null>)|undefined;
 constructor(core:Application,provider:LocalMediaProvider,modelFactory?:((workspaceId:string)=>Promise<Model|null>)){
  this.core=core;this.provider=provider;this.documents=new SupplierDocuments(core.clock,core.config);this.modelFactory=modelFactory;
 }
 async model(workspaceId:string){
  if(this.modelFactory)return this.modelFactory(workspaceId);
  return this.core.store.transaction(async tx=>{const row=await connectionRow(tx,workspaceId);return row?new ModelClient(row.settings,connectionKey(row,this.core.config)):null;});
 }
 async cleanup(root:string){
  for(const name of (await readdir(root)).slice(0,100)){
   const match=/^([a-f0-9-]{36})-([a-f0-9-]{36})$/.exec(name);if(!match)continue;
   const path=join(root,name),stat=await lstat(path);if(!stat.isDirectory()||stat.isSymbolicLink())continue;
   const active=await this.core.store.transaction(async tx=>{const row=await tx.get('talentSubmissionItems',match[1]!);return row?.kind==='DOCUMENT_PARSE'&&['PROCESSING','IMAGE_PROCESSING'].includes(row.state)&&row.values.leaseToken===match[2]&&String(row.values.leaseUntil)>this.core.clock.now().toISOString();});
   if(!active)await rm(path,{recursive:true,force:true});
  }
 }
 async cycle(signal:AbortSignal){
  if(signal.aborted)return false;
  const root=join(this.provider.root,'document-tasks');await mkdir(root,{recursive:true,mode:0o700});
  const stat=await lstat(root);invariant(stat.isDirectory()&&!stat.isSymbolicLink()&&(stat.mode&0o077)===0,'DOCUMENT_PATH_INVALID','材料临时目录不可用',503);
  const claim=await this.core.store.transaction(tx=>this.documents.claim(tx));await this.cleanup(root);
  if(!claim)return false;
  const folder=join(root,claim.id+'-'+String(claim.values.leaseToken));
  let parsed:Awaited<ReturnType<typeof parseDocumentFile>>|undefined;
  try{
   await mkdir(folder,{mode:0o700});
   const {asset}=await this.core.store.transaction(tx=>this.documents.current(tx,claim));
   const input=join(folder,'input.bin');await writeFile(input,await this.provider.readOriginal(asset),{flag:'wx',mode:0o600});
   if(claim.values.documentMode==='ALL'){
    const totalPages=await inspectDocumentFile({path:input,sha256:asset.sha256,bytes:asset.bytes,workRoot:folder,signal});
    await this.core.store.transaction(tx=>this.documents.plan(tx,claim,totalPages));return true;
   }
   parsed=await parseDocumentFile({path:input,sha256:asset.sha256,bytes:asset.bytes,workRoot:folder,signal,pages:claim.values.pages as number[]});
   if(claim.state==='IMAGE_PROCESSING'){await this.importImages(claim,parsed,signal);return true;}
   const extracted=await this.core.store.transaction(tx=>this.documents.extracted(tx,claim,parsed!.manifest));
   if(extracted.state==='REJECTED')return true;
   if(claim.values.useAi){
    const model=await this.model(claim.workspaceId);invariant(model,'AI_DISABLED','请先在 ONCE 后台配置模型连接',409);
    const pages=await Promise.all(parsed.manifest.pages.map(async p=>({page:p.page,bytes:await readFile(join(parsed!.directory,p.image.file))})));
    const meta={requestId:randomUUID(),ip:'document-worker'},reserved=await this.core.store.transaction(tx=>this.documents.reserve(tx,claim,meta));
    const result=await dispatchAi(this.core.store,this.core.clock,reserved.config,claim.workspaceId,reserved.run.id,meta,{
     providerIdentityHash:reserved.config.providerIdentityHash,
     send:async(_input,context)=>{const response=await model.callDocument({...reserved.input,pages},context);return {output:response.output,evidenceDigest:digest({usage:response.usage,responseId:response.providerResponseId}),metadata:{...response.usage,providerResponseId:response.providerResponseId,outputStatus:response.outputStatus}};},
    },{
     authorize:async tx=>{const {job}=await this.documents.current(tx,claim),p=this.documents.decode(job);return {manifest:p.manifest,dictionary:p.dictionary};},
     proposal:async(tx,_run,output)=>this.documents.proposal(tx,claim,output),
    },120000,signal);
    // A valid proposal may exist while billing awaits reconciliation. The result
    // and accounting states are separate; unknown billing is never labelled free.
    await this.core.store.transaction(async tx=>{const row=await tx.get('talentSubmissionItems',claim.id);if(row?.state==='PROCESSING')await this.documents.fail(tx,claim,result.state==='UNKNOWN'?'AI_OUTCOME_UNKNOWN':'AI_OUTPUT_INVALID');});
   }
  }catch(e){await this.core.store.transaction(tx=>this.documents.fail(tx,claim,e instanceof AppError?e.code:'DOCUMENT_EXTRACTION_FAILED'));}
  finally{await parsed?.dispose();await rm(folder,{recursive:true,force:true});}
  return true;
 }
 async importImages(claim:TalentSubmissionItem,parsed:ParsedDocument,signal:AbortSignal){
  const payload=this.documents.decode(claim);invariant(payload.manifest&&digest(parsed.manifest)===digest(payload.manifest),'DOCUMENT_EXTRACTION_CHANGED','材料提取结果已变化，请重新解析并核对',409);
  for(const key of claim.values.imageKeys as string[]){
   signal.throwIfAborted();
   const native=parsed.manifest.pages.flatMap(p=>p.images).find(i=>i.key===key),candidate=payload.proposal?.images.find(i=>i.key===key),image=native??candidate;
   invariant(image,'DOCUMENT_IMAGE_INVALID','提取图片已不可用',409);
   let bytes:Buffer;
   if(native)bytes=await readFile(join(parsed.directory,native.image.file));
   else{
    const page=parsed.manifest.pages.find(p=>p.page===image.page)!;
    const left=Math.floor(image.bbox[0]!*page.image.width),top=Math.floor(image.bbox[1]!*page.image.height);
    const right=Math.min(page.image.width,Math.ceil(image.bbox[2]!*page.image.width)),bottom=Math.min(page.image.height,Math.ceil(image.bbox[3]!*page.image.height));
    bytes=await sharp(await readFile(join(parsed.directory,page.image.file)),{limitInputPixels:60000000}).extract({left,top,width:right-left,height:bottom-top}).png().toBuffer();
   }
   invariant(bytes.length<=30000000,'DOCUMENT_IMAGE_TOO_LARGE','提取图片超过上传限额，请选择较小区域',422);
   const sha256=createHash('sha256').update(bytes).digest('hex');
   const {upload,actor}=await this.core.store.transaction(async tx=>{
    const {job,actor,s}=await this.documents.current(tx,claim),imports=(job.values.imageImports??{}) as Record<string,string>;
    invariant(!imports[key],'DOCUMENT_IMAGE_ALREADY_IMPORTED','图片已建立上传记录，请核对现有文件',409);
    const upload=await this.core.media.createTalent(tx,actor,{context:{kind:'TALENT_SUBMISSION',submissionId:s.id},expectedSubmissionRevision:s.revision,fileName:`材料第${image.page}页-${key}.png`,mime:'image/png',expectedBytes:bytes.length,sha256});
    await tx.replace('talentSubmissionItems',{...touch(job,this.core.clock),values:{...job.values,imageImports:{...imports,[key]:upload.id}}});
    await audit(tx,actor,actor.workspaceId,'supplier.document.imageCreated','upload',upload.id,['created'],{requestId:job.id,ip:'document-worker'},this.core.clock);
    return {upload,actor};
   });
   const receiving=await this.core.store.transaction(tx=>this.core.media.beginReceive(tx,actor,upload.id,bytes.length));
   try{
    const received=await this.provider.receive(receiving,Readable.from(bytes),signal);
    await this.core.store.transaction(async tx=>{await this.documents.current(tx,claim);const uploaded=await this.core.media.finishReceive(tx,actor,upload.id,receiving.receiveToken!,received.bytes,received.sha256);await this.core.media.complete(tx,actor,upload.id,{expectedRevision:uploaded.revision});});
   }catch(e){await this.core.media.failReceive(upload.id,receiving.receiveToken!);throw e;}
   const mediaClaim=await this.core.media.claim(upload.id);invariant(mediaClaim,'DOCUMENT_IMAGE_PENDING','图片处理已由后台接手，请核对上传状态',409);
   await new MediaWorker(this.core,this.provider).process(mediaClaim,signal);
   await this.core.store.transaction(async tx=>{await this.documents.current(tx,claim);const asset=await tx.get('assets',upload.id);invariant(asset?.state==='READY','DOCUMENT_IMAGE_FAILED','提取图片处理未完成，请核对上传状态',409);
    const item=(await tx.find('talentSubmissionItems',{submissionId:claim.submissionId,kind:'MEDIA',targetId:asset.id}))[0]!;
    await tx.replace('talentSubmissionItems',{...touch(item,this.core.clock),baseline:{originDocument:{assetId:claim.targetId,sha256:parsed.manifest.input.sha256,page:image.page,bbox:image.bbox,imageKey:key}}});
   });
  }
  await this.core.store.transaction(async tx=>{const {job}=await this.documents.current(tx,claim);await tx.replace('talentSubmissionItems',{...touch(job,this.core.clock),state:String(job.values.resumeState),values:{...job.values,imageKeys:[]}});});
 }
}
