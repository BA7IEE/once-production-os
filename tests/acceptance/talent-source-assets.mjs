import {navigateWorkspace,selectPaged} from './support/workspace-navigation.mjs';
import {independentCollectionImage} from './collection-fixtures.mjs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
/** Independent-source original images and shared proof facts are synthetic API setup; deletion is real UI. */
export async function verifySourceAssetChoices({owner,prisma,cmd,writeUI,source,originSourceId,keptAssetId,binary,queue,until,mediaBytes,mediaRoot,combined=false}) {
 keptAssetId=await independentCollectionImage({owner,prisma,cmd,binary,queue,until,mediaBytes},keptAssetId);
 const schemaVersion='once-talent-v2.0.0',targetId=(await cmd(owner,'POST','/sources',source('合成两张证明原件来源'),201)).resourceId;
 let target=await prisma.sourceRecord.findUniqueOrThrow({where:{id:targetId}});if(target.status!=='CONFIRMED'){await cmd(owner,'POST',`/sources/${targetId}/review`,{expectedRevision:target.revision,basisDescription:'合成原件来源核验',validUntil:target.validUntil.toISOString()});target=await prisma.sourceRecord.findUniqueOrThrow({where:{id:targetId}});}
 const ids=[];for(let i=0;i<2;i++){const id=(await cmd(owner,'POST','/uploads',{sourceId:targetId,expectedSourceRevision:target.revision,fileName:`source-proof-${i}.png`,mime:'image/png',expectedBytes:mediaBytes.length,sha256:createHash('sha256').update(mediaBytes).digest('hex')},201)).resourceId;assert.equal((await binary(owner,id,mediaBytes)).status(),200);await queue(owner,id);await until(async()=>await prisma.mediaAsset.count({where:{id,state:'READY'}})===1);ids.push(id);}
 const origin=await prisma.sourceRecord.findUniqueOrThrow({where:{id:originSourceId}});
 const personId=(await cmd(owner,'POST','/td2/people',{schemaVersion,originSourceId,sourceRevision:origin.revision,displayName:'合成来源原件清理',createTalent:true},201)).resourceId;
 const person=()=>prisma.person.findUniqueOrThrow({where:{id:personId}});
 const add=async(slug,values)=>(await cmd(owner,'POST',`/td2/people/${personId}/${slug}`,{schemaVersion,expectedPersonRevision:(await person()).revision,sourceId:originSourceId,sourceRevision:origin.revision,values},201)).resourceId;
 const collections=[];for(let i=0;i<2;i++){const id=await add('collections',{collectionTypeCode:'PORTFOLIO',title:`合成多原件集合 ${i}`});collections.push(id);for(const assetId of [...ids,keptAssetId]){const collection=await prisma.mediaCollection.findUniqueOrThrow({where:{id}});await cmd(owner,'POST',`/td2/collections/${id}/items`,{schemaVersion,expectedRevision:collection.revision,expectedPersonRevision:(await person()).revision,assetId});}}
 const credentials=[];for(const evidenceAssetId of ids){const id=await add('credentials',{credentialTypeCode:'OTHER',issuerName:'合成共享证明机构',evidenceAssetId});credentials.push(id);await cmd(owner,'POST',`/td2/credentials/${id}/verify`,{schemaVersion,expectedRevision:1,expectedPersonRevision:(await person()).revision,sourceRevision:origin.revision});}
 let retained=null,erasedRoleId=null;
 if(combined){
  const addTarget=async(slug,values)=>(await cmd(owner,'POST',`/td2/people/${personId}/${slug}`,{schemaVersion,expectedPersonRevision:(await person()).revision,sourceId:targetId,sourceRevision:target.revision,values},201)).resourceId;
  const languageId=await addTarget('languages',{languageCode:'en',speakingLevelCode:'FLUENT'});erasedRoleId=await addTarget('roles',{roleCode:'photographer'});
  for(const fieldPath of ['languageCode','speakingLevelCode','listeningLevelCode','readingLevelCode','writingLevelCode','validFrom','validUntil','status'])await cmd(owner,'POST','/td2/evidence',{schemaVersion,ownerKind:'personLanguages',ownerId:languageId,fieldPath,expectedRevision:1,sourceId:originSourceId,sourceRevision:origin.revision});
  retained=await prisma.personLanguage.findUniqueOrThrow({where:{id:languageId}});
 }
 const evidence=await prisma.fieldEvidence.findMany({where:{personCredentialId:{in:credentials}},orderBy:{id:'asc'}});
 await navigateWorkspace(owner,'删除任务',{fresh:true});await owner.getByLabel('删除目标类型',{exact:true}).selectOption('SOURCE');await selectPaged(owner,owner,'删除目标',targetId);
 const preview=await writeUI(owner,'POST','/deletion-requests/preview',()=>owner.getByRole('button',{name:'预览影响',exact:true}).click());assert.equal(preview.complete,true,JSON.stringify(preview.unresolved));assert.ok(preview.items.some(i=>i.resourceKind===(combined?'talentSourceFactGraph':'talentSourceAssetGraph')));if(combined){assert.equal(preview.items.some(i=>i.resourceKind==='talentSourceAssetGraph'),false);await owner.getByText(/同时删除 2 份原件/).waitFor();}else await owner.getByText(/移出 4 项作品集引用、撤销 2 项资质/).waitFor();
 await owner.getByLabel('申请原因',{exact:true}).fill('合成删除来源全部原件和证明引用，保留其他来源原件与核验历史');const requestId=(await writeUI(owner,'POST','/deletion-requests',()=>owner.getByRole('button',{name:'创建 DRAFT 申请',exact:true}).click(),201)).resourceId;
 const panel=owner.locator('.deletion-request-detail');await panel.getByText(requestId,{exact:true}).waitFor();owner.once('dialog',d=>void d.accept());await writeUI(owner,'POST',`/deletion-requests/${requestId}/block`,()=>panel.getByRole('button',{name:'阻断正常使用',exact:true}).click());if(!combined){await panel.getByRole('button',{name:'做决定',exact:true}).click();const dialog=owner.getByRole('dialog',{name:'记录保留决定',exact:true});assert.equal(await dialog.getByLabel('本项决定',{exact:true}).locator('option[value="RETAIN_WITH_BASIS"]').count(),0);await dialog.getByLabel('决定说明',{exact:true}).fill('明确撤销两张原件的共享引用及证明资格，不改变其他原件或核验历史');await writeUI(owner,'POST',`/deletion-requests/${requestId}/decisions`,()=>dialog.getByRole('button',{name:'保存决定',exact:true}).click());
 }else{
  const decide=async(pattern,retain)=>{
   let releaseRefresh,refreshStarted,refreshContinued;const continued=new Promise(resolve=>{refreshContinued=resolve;});const refreshHeld=new Promise(resolve=>{refreshStarted=resolve;});const release=new Promise(resolve=>{releaseRefresh=resolve;});
   const refreshUrl=`**/api/v1/deletion-requests/${requestId}`;
   const holdRefresh=async route=>{const held=route.request().method()==='GET';if(held){refreshStarted();await release;}await route.continue();if(held)refreshContinued();};
   if(retain)await owner.route(refreshUrl,holdRefresh);
   const row=panel.locator('tr').filter({has:owner.getByText(pattern)});await row.getByRole('button',{name:'做决定',exact:true}).click();const dialog=owner.getByRole('dialog',{name:'记录保留决定',exact:true});if(retain){await dialog.getByLabel('本项决定',{exact:true}).selectOption('RETAIN_WITH_BASIS');await dialog.getByLabel('独立保留依据',{exact:true}).selectOption(originSourceId);}await dialog.getByLabel('决定说明',{exact:true}).fill(retain?'保留已有完整独立字段依据的语言':'确认专业事实及共享原件在同一事务处置');await writeUI(owner,'POST',`/deletion-requests/${requestId}/decisions`,()=>dialog.getByRole('button',{name:'保存决定',exact:true}).click());
   if(retain){await refreshHeld;await dialog.waitFor({state:'hidden'});const buttons=panel.getByRole('button',{name:'做决定',exact:true});assert.ok(await buttons.count()>0);for(const button of await buttons.all())assert.equal(await button.isDisabled(),true);releaseRefresh();await continued;await owner.unroute(refreshUrl,holdRefresh);}
  };
  await decide(/^工作语言：选择删除/,true);await decide(/^职业：选择删除/,false);await decide(/^按逐项决定处理 2 项专业资料/,false);
 }
 owner.once('dialog',d=>void d.accept());await writeUI(owner,'POST',`/deletion-requests/${requestId}/plan/freeze`,()=>panel.getByRole('button',{name:'冻结清理计划',exact:true}).click());owner.once('dialog',d=>void d.accept());await writeUI(owner,'POST',`/deletion-requests/${requestId}/cleaning/start`,()=>panel.getByRole('button',{name:'开始不可逆依赖清理',exact:true}).click());await panel.getByText(combined?'有据保留后完成':'删除流程已完成',{exact:true}).waitFor();
 assert.equal((await prisma.sourceRecord.findUniqueOrThrow({where:{id:targetId}})).status,'ERASED');for(const id of ids)assert.equal(existsSync(join(mediaRoot,'uploads',id)),false);assert.equal(existsSync(join(mediaRoot,'uploads',keptAssetId)),true);assert.deepEqual(await prisma.fieldEvidence.findMany({where:{personCredentialId:{in:credentials}},orderBy:{id:'asc'}}),evidence);
 for(const id of credentials){const row=await prisma.personCredential.findUniqueOrThrow({where:{id}});assert.equal(row.status,'REVOKED');assert.equal(row.evidenceAssetId,null);}
 for(const collectionId of collections){const rows=await prisma.mediaCollectionItem.findMany({where:{collectionId}});assert.equal(rows.length,1);assert.equal(rows[0].assetId,keptAssetId);assert.equal(rows[0].orderIndex,0);}
 if(combined){assert.deepEqual(await prisma.personLanguage.findUniqueOrThrow({where:{id:retained.id}}),retained);assert.equal(await prisma.personRole.count({where:{id:erasedRoleId}}),0);assert.equal((await prisma.deletionRequest.findUniqueOrThrow({where:{id:requestId}})).state,'RETAINED_WITH_BASIS');console.log('PASS TD2 combined source browser: retain language with current independent evidence, erase role and two shared originals, invalidate qualifications atomically');}
 console.log('PASS TD2 source asset browser: source-wide two-original cleanup clears four collection links and two qualifications once, purges both real directories, preserves independent media and original evidence');
}
