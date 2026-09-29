import assert from 'node:assert/strict';
export async function verifyIdentityRetentionChoices({owner,prisma,cmd,writeUI,source,json}){
 const schemaVersion='once-talent-v2.0.0',makeSource=async title=>{const id=(await cmd(owner,'POST','/sources',source(title),201)).resourceId;let row=await prisma.sourceRecord.findUniqueOrThrow({where:{id}});if(row.status!=='CONFIRMED'){await cmd(owner,'POST',`/sources/${id}/review`,{expectedRevision:row.revision,basisDescription:'合成身份独立字段核验',validUntil:row.validUntil.toISOString()});row=await prisma.sourceRecord.findUniqueOrThrow({where:{id}});}return row;};
 const origin=await makeSource('合成身份原始来源待删除'),basis=await makeSource('合成身份独立保留依据');
 const personId=(await cmd(owner,'POST','/td2/people',{schemaVersion,originSourceId:origin.id,sourceRevision:origin.revision,displayName:'有据保留的普通联系人',intro:'合成原始来源编号保留'},201)).resourceId;
 const person=()=>prisma.person.findUniqueOrThrow({where:{id:personId}});
 for(const fieldPath of ['displayName','aliases','intro'])await cmd(owner,'POST','/td2/evidence',{schemaVersion,ownerKind:'person',ownerId:personId,fieldPath,expectedRevision:(await person()).revision,sourceId:basis.id,sourceRevision:basis.revision});
 const evidence=await prisma.fieldEvidence.findMany({where:{personId,sourceId:basis.id},orderBy:{id:'asc'}}),before=await person();
 await owner.getByRole('button',{name:/概览/}).click();await owner.getByRole('button',{name:/删除影响评估/}).click();await owner.getByLabel('删除目标类型',{exact:true}).selectOption('SOURCE');await owner.getByLabel('删除目标',{exact:true}).selectOption(origin.id);
 const preview=await writeUI(owner,'POST','/deletion-requests/preview',()=>owner.getByRole('button',{name:'预览影响',exact:true}).click());assert.equal(preview.complete,true,JSON.stringify(preview.unresolved));
 await owner.getByLabel('申请原因',{exact:true}).fill('合成删除最初来源，按现有完整字段依据保留普通联系人');const requestId=(await writeUI(owner,'POST','/deletion-requests',()=>owner.getByRole('button',{name:'创建 DRAFT 申请',exact:true}).click(),201)).resourceId;
 const panel=owner.locator('.deletion-request-detail');await panel.getByText(requestId,{exact:true}).waitFor();owner.once('dialog',d=>void d.accept());await writeUI(owner,'POST',`/deletion-requests/${requestId}/block`,()=>panel.getByRole('button',{name:'阻断正常使用',exact:true}).click());
 for(const [kind,keep] of [['SOURCE_ORIGIN_PERSON',true],['SOURCE_TALENT_FACT_GROUP',false]]){
  const row=panel.locator('tr').filter({has:owner.getByText(kind,{exact:true})});await row.getByRole('button',{name:'做决定',exact:true}).click();const form=owner.getByRole('dialog',{name:'记录保留决定',exact:true});
  if(keep){await form.getByText(/最初来源编号不改变/).waitFor();await form.getByLabel('本项决定',{exact:true}).selectOption('RETAIN_WITH_BASIS');await form.getByLabel('独立保留依据',{exact:true}).selectOption(basis.id);}
  await form.getByLabel('决定说明',{exact:true}).fill('合成逐项核对字段证据，保留原来源编号和原核验归属');await writeUI(owner,'POST',`/deletion-requests/${requestId}/decisions`,()=>form.getByRole('button',{name:'保存决定',exact:true}).click());
 }
 owner.once('dialog',d=>void d.accept());await writeUI(owner,'POST',`/deletion-requests/${requestId}/plan/freeze`,()=>panel.getByRole('button',{name:'冻结清理计划',exact:true}).click());owner.once('dialog',d=>void d.accept());await writeUI(owner,'POST',`/deletion-requests/${requestId}/cleaning/start`,()=>panel.getByRole('button',{name:'开始不可逆依赖清理',exact:true}).click());await panel.getByText('有据保留后完成',{exact:true}).waitFor();
 const after=await person();assert.equal(after.sourceId,origin.id);assert.equal(after.displayName,before.displayName);assert.equal(after.intro,before.intro);assert.equal((await prisma.sourceRecord.findUniqueOrThrow({where:{id:origin.id}})).status,'ERASED');assert.deepEqual(await prisma.fieldEvidence.findMany({where:{personId,sourceId:basis.id},orderBy:{id:'asc'}}),evidence);
 const detail=await json(owner,`/td2/people/${personId}`);assert.equal(detail.originAvailable,false);assert.equal(detail.originSourceId,origin.id);assert.equal(detail.isTalent,false);assert.equal(detail.displayName,before.displayName);
 console.log('PASS TD2 identity retention browser: real separate identity/group decisions, frozen original source erased, ordinary identity and original field evidence retained without inventing talent');
 return {personId,origin,basis};
}
