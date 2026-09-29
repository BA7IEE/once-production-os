import {navigateUI,addModelOccupation} from './product-navigation.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
/** The source was actually erased by the preceding UI flow; authorize only the live independent bases. */
export async function verifyRetainedOriginExport({owner,prisma,writeUI,until,retained}) {
 const {personId,languageId,target,basis,originSourceId}=retained;
 await navigateUI(owner,'导出记录');
 const labels=['2.0 语言、熟练度及有效期','2.0 所选专业字段的来源证据与原核验记录'],sourceLabels=['来源标题','来源类型','提供方说明','内部依据类型','依据说明','有效起点','有效截止','来源状态'];
 const permits=[],expiry=new Date(Date.now()+3600000),pad=n=>String(n).padStart(2,'0'),date=`${expiry.getFullYear()}-${pad(expiry.getMonth()+1)}-${pad(expiry.getDate())}T${pad(expiry.getHours())}:${pad(expiry.getMinutes())}`;
 for(const [kind,id,fields] of [['PERSON',personId,['姓名 / 展示名','档案状态',...labels]],['SOURCE',originSourceId,sourceLabels],['SOURCE',basis.id,[...sourceLabels,...labels]]]) {
  await owner.getByRole('button',{name:'＋ 批准导出用途',exact:true}).click();const dialog=owner.getByRole('dialog',{name:'批准内部导出用途',exact:true}).or(owner.getByRole('region',{name:'批准内部导出用途',exact:true}));await dialog.waitFor();
  await dialog.getByLabel('对象类型',{exact:true}).selectOption(kind);await dialog.getByLabel('批准对象',{exact:true}).selectOption(id);
  if(kind==='SOURCE')assert.equal(await dialog.getByLabel('批准对象',{exact:true}).locator(`option[value="${target.id}"]`).count(),0);
  for(const label of fields)await dialog.getByLabel(label,{exact:true}).check();await dialog.getByLabel('许可截止时间',{exact:true}).fill(date);await dialog.getByLabel('审批依据',{exact:true}).fill('合成许可：保留语言由现行独立证据支持，旧来源只保留删除编号');
  permits.push((await writeUI(owner,'POST','/use-permissions',()=>dialog.getByRole('button',{name:'批准用途',exact:true}).click(),201)).resourceId);
 }
 for(const id of permits)await owner.getByLabel('选择导出许可 '+id,{exact:true}).check();
 const exportId=(await writeUI(owner,'POST','/exports',()=>owner.getByRole('button',{name:'生成内部 JSON',exact:true}).click(),202)).resourceId;
 await until(async()=>await prisma.exportJob.count({where:{id:exportId,state:'READY'}})===1);await owner.getByRole('button',{name:'下载 JSON',exact:true}).waitFor();
 const downloading=owner.waitForEvent('download');await owner.getByRole('button',{name:'下载 JSON',exact:true}).click();const file=await downloading,payload=JSON.parse(readFileSync(await file.path(),'utf8')),bundle=payload.manifest.talent;
 assert.equal(bundle.schemaVersion,'once-talent-transfer-v14');assert.equal(bundle.retainedOrigins.length,1);assert.equal(bundle.retainedOrigins[0].id,target.id);assert.equal(bundle.retainedOrigins[0].status,'ERASED');assert.deepEqual(Object.keys(bundle.retainedOrigins[0]).sort(),['id','protectionEpoch','revision','status']);assert.equal(payload.manifest.sources.some(s=>s.id===target.id),false);
 const language=bundle.tables.personLanguages.find(r=>r.id===languageId);assert.equal(language.sourceId,target.id);assert.equal(language.data.speakingLevelCode,'FLUENT');assert.ok(bundle.evidence.some(e=>e.ownerId===languageId&&e.sourceId===basis.id&&e.originalReview));
 assert.equal((await prisma.sourceRecord.findUniqueOrThrow({where:{id:target.id}})).status,'ERASED');
 console.log('PASS TD2 retained-origin browser: explicit person and independent source permits, real v12 JSON download, erased source excluded from approval choices, minimal deleted header and original language/evidence preserved');
}
