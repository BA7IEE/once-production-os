import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
export async function verifyIdentityOriginExport({owner,prisma,writeUI,until,retained}){
 const {personId,origin,basis}=retained,fields=['姓名 / 展示名','别名','简介','身份字段的来源证据与原核验记录'],sourceFields=['来源标题','来源类型','提供方说明','内部依据类型','依据说明','有效起点','有效截止','来源状态'];
 await owner.getByRole('button',{name:/内部导出/}).click();
 const permits=[],expiry=new Date(Date.now()+3600000),pad=n=>String(n).padStart(2,'0'),date=`${expiry.getFullYear()}-${pad(expiry.getMonth()+1)}-${pad(expiry.getDate())}T${pad(expiry.getHours())}:${pad(expiry.getMinutes())}`;
 for(const [kind,id,labels] of [['PERSON',personId,[...fields,'档案状态']],['SOURCE',basis.id,[...sourceFields,...fields]]]){
  await owner.getByRole('button',{name:'＋ 批准导出用途',exact:true}).click();const form=owner.getByRole('dialog',{name:'批准内部导出用途',exact:true});await form.waitFor();await form.getByLabel('对象类型',{exact:true}).selectOption(kind);await form.getByLabel('批准对象',{exact:true}).selectOption(id);
  if(kind==='PERSON'){await form.getByText(/最初来源已删除。请选择当前独立身份依据/).waitFor();await form.getByLabel('身份保留依据',{exact:true}).selectOption(basis.id);}else assert.equal(await form.getByLabel('批准对象',{exact:true}).locator(`option[value="${origin.id}"]`).count(),0);
  for(const label of labels)await form.getByLabel(label,{exact:true}).check();await form.getByLabel('许可截止时间',{exact:true}).fill(date);await form.getByLabel('审批依据',{exact:true}).fill('合成许可原始来源最小编号与当前独立身份依据，保留真实核验归属');permits.push((await writeUI(owner,'POST','/use-permissions',()=>form.getByRole('button',{name:'批准用途',exact:true}).click(),201)).resourceId);
 }
 const permission=await prisma.usePermission.findUniqueOrThrow({where:{id:permits[0]}});assert.equal(permission.sourceId,origin.id);assert.equal(permission.retentionBasisSourceId,basis.id);
 for(const id of permits)await owner.getByLabel('选择导出许可 '+id,{exact:true}).check();const jobId=(await writeUI(owner,'POST','/exports',()=>owner.getByRole('button',{name:'生成内部 JSON',exact:true}).click(),202)).resourceId;
 await until(async()=>await prisma.exportJob.count({where:{id:jobId,state:'READY'}})===1);await owner.getByRole('button',{name:'下载 JSON',exact:true}).waitFor();const downloading=owner.waitForEvent('download');await owner.getByRole('button',{name:'下载 JSON',exact:true}).click();const file=await downloading,payload=JSON.parse(readFileSync(await file.path(),'utf8')),bundle=payload.manifest.talent;
 assert.equal(bundle.schemaVersion,'once-talent-transfer-v15');assert.equal(bundle.retainedOrigins[0].id,origin.id);assert.equal(bundle.retainedOrigins[0].status,'ERASED');assert.deepEqual(Object.keys(bundle.retainedOrigins[0]).sort(),['id','protectionEpoch','revision','status']);assert.equal(payload.manifest.people[0].sourceId,origin.id);assert.equal(payload.manifest.sources.length,1);assert.equal(payload.manifest.sources[0].id,basis.id);assert.equal(bundle.identityEvidence.length,3);assert.ok(bundle.identityEvidence.every(e=>e.sourceId===basis.id&&e.originalReview));assert.equal(bundle.tables.talentProfiles.length,0);
 console.log('PASS retained identity v13 browser: explicit independent identity-basis approval, separate field/source grants, actual download preserves erased origin and all identity evidence without creating talent');
}
