import {mkdir,readFile,writeFile,rm,readdir,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import sharp from 'sharp';
import type {Application} from '../../../../packages/core/src/api.ts';
import type {SupplierInboxMaterial} from '../../../../packages/core/src/supplier-inbox-model.ts';
import {SupplierInbox} from '../../../../packages/core/src/supplier-inbox.ts';
import {dispatchAi} from '../../../../packages/core/src/ai-dispatch.ts';
import {connectionRow,connectionKey} from '../../../../packages/core/src/ai-connection.ts';
import {digest} from '../../../../packages/core/src/json.ts';
import {touch,audit} from '../../../../packages/core/src/helpers.ts';
import {invariant,AppError} from '../../../../packages/core/src/errors.ts';
import type {LocalMediaProvider} from '../media/local-provider.ts';
import {MediaWorker} from '../media/worker.ts';
import {ModelClient,type DocumentModelInput,type DocumentModelResult} from '../ai/model-client.ts';
import {parseDocumentFile,inspectDocumentFile} from './parser.ts';
type Model={callDocument(input:DocumentModelInput,context:{signal:AbortSignal;deadlineAt:string}):Promise<DocumentModelResult>};

export class SupplierInboxWorker {
 readonly core:Application;readonly provider:LocalMediaProvider;readonly inbox:SupplierInbox;
 readonly modelFactory:((workspaceId:string)=>Promise<Model|null>)|undefined;
 constructor(core:Application,provider:LocalMediaProvider,modelFactory?:((workspaceId:string)=>Promise<Model|null>)){this.core=core;this.provider=provider;this.inbox=new SupplierInbox(core.clock,core.config);this.modelFactory=modelFactory;}
 async model(workspaceId:string){if(this.modelFactory)return this.modelFactory(workspaceId);return this.core.store.transaction(async tx=>{const row=await connectionRow(tx,workspaceId);return row?new ModelClient(row.settings,connectionKey(row,this.core.config)):null;});}
 async cleanup(root:string){for(const name of (await readdir(root)).slice(0,100)){const match=/^([a-f0-9-]{36})-([a-f0-9-]{36})$/.exec(name);if(!match)continue;const folder=join(root,name),stat=await lstat(folder);if(!stat.isDirectory()||stat.isSymbolicLink())continue;const active=await this.core.store.transaction(async tx=>{const m=await tx.get('supplierInboxMaterials',match[1]!);return m?.state==='PROCESSING'&&m.leaseToken===match[2]&&!!m.leaseUntil&&m.leaseUntil>this.core.clock.now().toISOString();});if(!active)await rm(folder,{recursive:true,force:true});}}
 async cycle(signal:AbortSignal){if(signal.aborted)return false;const root=join(this.provider.root,'employee-document-tasks');await mkdir(root,{recursive:true,mode:0o700});const stat=await lstat(root);invariant(stat.isDirectory()&&!stat.isSymbolicLink()&&(stat.mode&0o077)===0,'DOCUMENT_PATH_INVALID','材料任务临时目录不可用',503);
  const claim=await this.core.store.transaction(tx=>this.inbox.claim(tx));await this.cleanup(root);if(!claim)return false;const folder=join(root,claim.id+'-'+claim.leaseToken);let parsed:Awaited<ReturnType<typeof parseDocumentFile>>|undefined;
  try{await mkdir(folder,{mode:0o700});const {asset}=await this.core.store.transaction(tx=>this.inbox.current(tx,claim)),input=join(folder,'input.bin');await writeFile(input,await this.provider.readOriginal(asset),{flag:'wx',mode:0o600});
   const payload=this.inbox.decode(claim);if(payload.requestedImages.length){await this.images(claim,input,folder,signal);return true;}
   const totalPages=await inspectDocumentFile({path:input,sha256:asset.sha256,bytes:asset.bytes,workRoot:folder,signal});
   const pages=await this.core.store.transaction(tx=>this.inbox.planned(tx,claim,totalPages));
   parsed=await parseDocumentFile({path:input,sha256:asset.sha256,bytes:asset.bytes,workRoot:folder,signal,pages});
   await this.core.store.transaction(tx=>this.inbox.extracted(tx,claim,parsed!.manifest));
   if(claim.useAi){const model=await this.model(claim.workspaceId);invariant(model,'AI_DISABLED','请先配置获准的模型连接',409);const pages=await Promise.all(parsed.manifest.pages.map(async p=>({page:p.page,bytes:await readFile(join(parsed!.directory,p.image.file))})));
    const meta={requestId:randomUUID(),ip:'employee-document-worker'},reserved=await this.core.store.transaction(tx=>this.inbox.reserve(tx,claim,meta));
    const result=await dispatchAi(this.core.store,this.core.clock,reserved.config,claim.workspaceId,reserved.run.id,meta,{providerIdentityHash:reserved.config.providerIdentityHash,
     send:async(_input,context)=>{const response=await model.callDocument({...reserved.input,pages},context);return {output:response.output,evidenceDigest:digest({usage:response.usage,responseId:response.providerResponseId}),metadata:{...response.usage,providerResponseId:response.providerResponseId,outputStatus:response.outputStatus}};}},
     {authorize:async tx=>{const {material:m}=await this.inbox.current(tx,claim),p=this.inbox.decode(m);return {manifest:p.pendingManifest,dictionary:p.dictionary};},proposal:async(tx,_run,output)=>this.inbox.finishChunk(tx,claim,output)},120000,signal);
    await this.core.store.transaction(async tx=>{const m=await tx.get('supplierInboxMaterials',claim.id);if(m?.state==='PROCESSING')await this.inbox.fail(tx,claim,result.state==='UNKNOWN'?'AI_OUTCOME_UNKNOWN':'AI_OUTPUT_INVALID');});
   }
  }catch(e){await this.core.store.transaction(tx=>this.inbox.fail(tx,claim,e instanceof AppError?e.code:'DOCUMENT_EXTRACTION_FAILED'));}
  finally{await parsed?.dispose();await rm(folder,{recursive:true,force:true});}return true;
 }
 async images(claim:SupplierInboxMaterial,input:string,folder:string,signal:AbortSignal){
  const p=this.inbox.decode(claim);for(const chunk of p.chunks){const selected=p.requestedImages.filter(key=>key.startsWith(chunk.id+':'));if(!selected.length)continue;
   const {asset}=await this.core.store.transaction(tx=>this.inbox.current(tx,claim)),parsed=await parseDocumentFile({path:input,sha256:asset.sha256,bytes:asset.bytes,workRoot:folder,signal,pages:chunk.pages});
   try{invariant(digest(parsed.manifest)===digest(chunk.manifest),'DOCUMENT_EXTRACTION_CHANGED','原件提取结果已变化，请重新核对',409);
    for(const fullKey of selected){signal.throwIfAborted();const existing=await this.core.store.transaction(async tx=>{const {material:m}=await this.inbox.current(tx,claim),key=this.inbox.decode(m).imageImports[fullKey];return key?await tx.get('assets',key):null;});if(existing?.state==='READY')continue;const key=fullKey.slice(chunk.id.length+1),native=chunk.manifest.pages.flatMap(page=>page.images).find(i=>i.key===key),candidate=chunk.proposal?.images.find(i=>i.key===key),image=native??candidate;invariant(image,'DOCUMENT_IMAGE_INVALID','提取图片已不可用',409);
     let bytes:Buffer;if(native)bytes=await readFile(join(parsed.directory,native.image.file));else{const page=chunk.manifest.pages.find(page=>page.page===image.page)!,left=Math.floor(image.bbox[0]!*page.image.width),top=Math.floor(image.bbox[1]!*page.image.height),right=Math.min(page.image.width,Math.ceil(image.bbox[2]!*page.image.width)),bottom=Math.min(page.image.height,Math.ceil(image.bbox[3]!*page.image.height));bytes=await sharp(await readFile(join(parsed.directory,page.image.file)),{limitInputPixels:60000000}).extract({left,top,width:right-left,height:bottom-top}).png().toBuffer();}
     invariant(bytes.length<=30000000,'DOCUMENT_IMAGE_TOO_LARGE','提取图片超过30MB',422);
     const {upload,actor}=await this.core.store.transaction(async tx=>{const {material:m,actor,source}=await this.inbox.current(tx,claim),latest=this.inbox.decode(m);invariant(!latest.imageImports[fullKey],'INBOX_IMAGE_EXISTS','已有图片上传记录，请核对原请求',409);const upload=await this.core.media.create(tx,actor,{sourceId:source.id,expectedSourceRevision:source.revision,fileName:`材料第${image.page}页.png`,mime:'image/png',expectedBytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});await tx.replace('supplierInboxMaterials',{...touch(m,this.core.clock),assetIds:[...new Set([...m.assetIds,upload.id])],ciphertext:this.inbox.encode(m,{...latest,imageImports:{...latest.imageImports,[fullKey]:upload.id}})});await audit(tx,actor,m.workspaceId,'supplier.inbox.imageCreated','upload',upload.id,['created'],{requestId:m.id,ip:'employee-document-worker'},this.core.clock);return {upload,actor};});
     const receiving=await this.core.store.transaction(tx=>this.core.media.beginReceive(tx,actor,upload.id,bytes.length));
     try{const received=await this.provider.receive(receiving,Readable.from(bytes),signal);await this.core.store.transaction(async tx=>{await this.inbox.current(tx,claim);const ready=await this.core.media.finishReceive(tx,actor,upload.id,receiving.receiveToken!,received.bytes,received.sha256);await this.core.media.complete(tx,actor,upload.id,{expectedRevision:ready.revision});});}catch(e){await this.core.media.failReceive(upload.id,receiving.receiveToken!);throw e;}
     const mediaClaim=await this.core.media.claim(upload.id);invariant(mediaClaim,'INBOX_IMAGE_PENDING','图片正在由后台处理，请核对上传状态',409);await new MediaWorker(this.core,this.provider).process(mediaClaim,signal);
     await this.core.store.transaction(async tx=>{await this.inbox.current(tx,claim);invariant((await tx.get('assets',upload.id))?.state==='READY','INBOX_IMAGE_FAILED','提取图片尚未就绪',409);});
    }
   }finally{await parsed.dispose();}
  }
  await this.core.store.transaction(async tx=>{const {material:m}=await this.inbox.current(tx,claim),latest=this.inbox.decode(m);await tx.replace('supplierInboxMaterials',{...touch(m,this.core.clock),state:'READY',leaseToken:null,leaseUntil:null,ciphertext:this.inbox.encode(m,{...latest,requestedImages:[]})});});
 }
}
