import {navigateWorkspace,openAdvancedPerson,openFilters,selectPaged} from './support/workspace-navigation.mjs';
import assert from 'node:assert/strict';
import {buffer as readStreamBytes} from 'node:stream/consumers';
export async function verifyLocaleBrowser({owner,prisma,cmd,writeUI,source,json,until}){
 const roots=[];
 const basisTitle='浏览器内部文本依据',sourceId=(await cmd(owner,'POST','/sources',source(basisTitle),201)).resourceId;
 for(const kind of ['PERSON','WORK','PROJECT']){
  const name='浏览器语言'+kind,path=kind==='PERSON'?'/people':kind==='WORK'?'/works':'/projects';
  const id=(await cmd(owner,'POST',path,{...(kind==='PERSON'?{displayName:name,roles:['photographer']}:{title:name}),sourceId},201)).resourceId;
  roots.push({kind,id});
  await navigateWorkspace(owner,kind==='PERSON'?'人才库':kind==='WORK'?'作品库':'项目');
  if(kind==='PERSON'){const filters=await openFilters(owner,{reset:true});await filters.getByRole('button',{name:'应用筛选',exact:true}).click();await owner.getByRole('button',{name:'全部人物',exact:true}).click();}const query=owner.getByLabel(kind==='PERSON'?'搜索姓名或别名':kind==='WORK'?'搜索作品':'搜索项目',{exact:true});await query.fill(name);await owner.getByRole('button',{name:'搜索',exact:true}).click();
  await owner.locator('.person-card').filter({has:owner.getByRole('heading',{name,exact:true})}).click();if(kind==='PERSON'){await openAdvancedPerson(owner);}
  await owner.getByRole('button',{name:'内部中英文文本',exact:true}).click();await owner.getByRole('button',{name:'新增语言文本',exact:true}).click();
  let dialog=owner.getByRole('dialog',{name:'新增内部文本',exact:true});await dialog.getByLabel('内部文本',{exact:true}).fill('Synthetic '+kind+' English.');
  await dialog.getByText('正在查询来源…',{exact:true}).waitFor({state:'hidden'});
  const pick=dialog.getByRole('button',{name:'选择依据：'+basisTitle,exact:true});
  for(let page=0;!await pick.count();page++){assert.ok(page<60);const response=owner.waitForResponse(r=>r.request().method()==='GET'&&r.url().includes('/api/v1/sources?'));await dialog.getByRole('button',{name:'下一页',exact:true}).click();assert.equal((await response).status(),200);await dialog.getByText('正在查询来源…',{exact:true}).waitFor({state:'hidden'});}
  await pick.click();await dialog.getByRole('checkbox',{name:'我已按当前档案和所选依据复核本文',exact:true}).check();
  const created=await writeUI(owner,'POST','/locale-texts',()=>dialog.getByRole('button',{name:'保存内部文本',exact:true}).click(),201);
  dialog=owner.getByRole('dialog',{name:'内部中英文文本',exact:true});await dialog.getByText('Synthetic '+kind+' English.',{exact:true}).waitFor();
  assert.equal((await prisma.localeText.findUniqueOrThrow({where:{id:created.resourceId}})).reviewedBy!==null,true);
  if(kind==='PERSON'){
   await dialog.getByRole('button',{name:'编辑并复核英文',exact:true}).click();dialog=owner.getByRole('dialog',{name:'编辑并复核内部文本',exact:true});await dialog.getByLabel('内部文本',{exact:true}).fill('Synthetic text after uncertain response.');
   const path='/locale-texts/'+created.resourceId,pattern='**/api/v1'+path,requests=[];
   const observe=r=>{if(r.method()==='PATCH'&&r.url().endsWith('/api/v1'+path))requests.push({body:r.postData(),key:r.headers()['idempotency-key']});};owner.on('request',observe);
   await owner.route(pattern,async route=>{if(route.request().method()!=='PATCH')return route.continue();assert.equal((await route.fetch()).status(),200);await route.abort('failed');});
   await dialog.getByRole('button',{name:'保存内部文本',exact:true}).click();await dialog.getByRole('alert').waitFor();assert.equal(await dialog.getByLabel('内部文本',{exact:true}).isDisabled(),true);assert.equal(await dialog.getByRole('button',{name:'返回文本列表',exact:true}).isDisabled(),true);
   await owner.unroute(pattern);const replay=await writeUI(owner,'PATCH',path,()=>dialog.getByRole('button',{name:'原样重试保存',exact:true}).click());assert.equal(replay.replayed,true);assert.equal(requests.length,2);assert.deepEqual(requests[0],requests[1]);owner.off('request',observe);
   dialog=owner.getByRole('dialog',{name:'内部中英文文本',exact:true});await dialog.getByText('Synthetic text after uncertain response.',{exact:true}).waitFor();assert.equal((await json(owner,path)).needsReview,true);
  }
  await dialog.getByRole('button',{name:'返回资料',exact:true}).click();if(kind==='PERSON')await owner.getByRole('dialog').getByLabel('关闭',{exact:true}).click();else await owner.getByRole('region',{name,exact:true}).getByRole('button',{name:'返回资料',exact:true}).click();
 }
 const duplicateName='浏览器语言合并重复档案',duplicateId=(await cmd(owner,'POST','/people',{displayName:duplicateName,roles:['photographer'],sourceId},201)).resourceId;
 await cmd(owner,'POST','/locale-texts',{subjectKind:'PERSON',subjectId:duplicateId,locale:'en',text:'Chosen browser merged English.',expectedSubjectRevision:1,sourceRefs:[{id:sourceId,expectedRevision:1}],confirmCurrentBasis:true},201);
 await navigateWorkspace(owner,'人才合并');
 const pickers=owner.locator('.merge-picker');
 await pickers.nth(0).getByLabel('主档案（保留）',{exact:true}).fill('浏览器语言PERSON');await pickers.nth(0).getByRole('button',{name:/浏览器语言PERSON/}).click();
 await pickers.nth(1).getByLabel('重复档案（归档并建立旧 ID 映射）',{exact:true}).fill(duplicateName);await pickers.nth(1).getByRole('button',{name:new RegExp(duplicateName)}).click();
 const mergePreview=await writeUI(owner,'POST','/people/merge-preview',()=>owner.getByRole('button',{name:'预览合并影响',exact:true}).click());
 for(const field of mergePreview.fieldConflicts)await owner.getByLabel('字段决定 '+field.field,{exact:true}).selectOption('CANONICAL');
 await owner.getByLabel('合并依据 *',{exact:true}).fill('人工核对同一合成人物并选择英文正文');
 assert.equal(await owner.getByRole('button',{name:'执行受控合并',exact:true}).isEnabled(),false);
 await owner.locator('label').filter({hasText:'采用重复档案文本'}).getByRole('radio').check();
 owner.once('dialog',dialog=>void dialog.accept());await writeUI(owner,'POST','/people/merge',()=>owner.getByRole('button',{name:'执行受控合并',exact:true}).click());
 await owner.getByText('合并已完成',{exact:true}).waitFor();
 await navigateWorkspace(owner,'人才库');const filters=await openFilters(owner,{reset:true});await filters.getByRole('button',{name:'应用筛选',exact:true}).click();await owner.getByRole('button',{name:'全部人物',exact:true}).click();await owner.getByLabel('搜索姓名或别名',{exact:true}).fill('浏览器语言PERSON');await owner.getByRole('button',{name:'搜索',exact:true}).click();await owner.locator('.person-card').filter({has:owner.getByRole('heading',{name:'浏览器语言PERSON',exact:true})}).click();await openAdvancedPerson(owner);
 await owner.getByRole('button',{name:'内部中英文文本',exact:true}).click();const mergedDialog=owner.getByRole('dialog',{name:'内部中英文文本',exact:true});
 await mergedDialog.getByText('Chosen browser merged English.',{exact:true}).first().waitFor();await mergedDialog.getByText('合并保留原文（2）',{exact:true}).click();await mergedDialog.getByText('Synthetic text after uncertain response.',{exact:true}).waitFor();
 assert.equal(await mergedDialog.getByText('待复核',{exact:true}).count(),1);
 await mergedDialog.getByRole('button',{name:'返回资料',exact:true}).click();await owner.getByRole('dialog').getByLabel('关闭',{exact:true}).click();
 console.log('PASS locale merge browser: explicit language choice, original text history, draft review state');
 await navigateWorkspace(owner,'内部导出',{fresh:true});
 const names={PERSON:'人物内部中英文文本、依据与原复核记录',WORK:'作品内部中英文文本、依据与原复核记录',PROJECT:'项目内部中英文文本、依据与原复核记录'},sourceLabels=['来源标题','来源类型','提供方说明','内部依据类型','依据说明','有效起点','有效截止','来源状态'],permits=[];
 const approvals=roots.map(({kind,id})=>[kind,id,[...(kind==='PERSON'?['姓名 / 展示名','角色','档案状态']:kind==='WORK'?['作品标题','制作归属','作品状态']:['项目标题','项目状态']),names[kind]]]);approvals.push(['SOURCE',sourceId,[...sourceLabels,...Object.values(names)]]);
 for(const [kind,id,labels] of approvals){
  await owner.getByRole('button',{name:'＋ 批准导出用途',exact:true}).click();const form=owner.getByRole('dialog',{name:'批准内部导出用途',exact:true});
  await form.getByLabel('对象类型',{exact:true}).selectOption(kind);await selectPaged(owner,form,'批准对象',id);for(const label of labels)await form.getByLabel(label,{exact:true}).check();
  const expiry=new Date(Date.now()+86400000),pad=n=>String(n).padStart(2,'0');await form.getByLabel('许可截止时间',{exact:true}).fill(expiry.getFullYear()+'-'+pad(expiry.getMonth()+1)+'-'+pad(expiry.getDate())+'T'+pad(expiry.getHours())+':'+pad(expiry.getMinutes()));
  await form.getByLabel('审批依据',{exact:true}).fill('合成明确批准内部中英文文本及其来源依据迁移');permits.push((await writeUI(owner,'POST','/use-permissions',()=>form.getByRole('button',{name:'批准用途',exact:true}).click(),201)).resourceId);
 }
 for(const id of permits)await owner.getByLabel('选择导出许可 '+id,{exact:true}).check();
 const exportId=(await writeUI(owner,'POST','/exports',()=>owner.getByRole('button',{name:'生成内部 JSON',exact:true}).click(),202)).resourceId;
 await until(async()=>await prisma.exportJob.count({where:{id:exportId,state:'READY'}})===1);await owner.getByRole('button',{name:'下载 JSON',exact:true}).waitFor();const downloading=owner.waitForEvent('download');await owner.getByRole('button',{name:'下载 JSON',exact:true}).click();const file=await downloading,payload=JSON.parse((await readStreamBytes(await file.createReadStream())).toString('utf8'));
 assert.equal(payload.schemaVersion,'once-export-v3-locale');assert.equal(payload.manifest.locales.texts.length,3);for(const text of payload.manifest.locales.texts){const row=await prisma.localeText.findUniqueOrThrow({where:{id:text.id}});assert.equal(text.text,row.text);assert.equal(text.originalReview?.membershipId??null,row.reviewedBy??row.originalReviewMembershipId);assert.equal(text.dependencies.length,2);assert.deepEqual(text.mergeHistory,row.mergeHistory??[]);}
 await cmd(owner,'POST','/use-permissions/'+permits.at(-1)+'/revoke',{expectedRevision:1});const denied=await writeUI(owner,'POST','/exports/'+exportId+'/download',()=>owner.getByRole('button',{name:'下载 JSON',exact:true}).click(),409);assert.equal(denied.error.code,'EXPORT_STALE');
 console.log('PASS internal locale v3 browser: explicit three owner grants and source grant -> real JSON download preserves typed dependencies and original review; source-only grant revocation blocks old download');
 console.log('PASS internal locale browser: person/work/project real editor, explicit source and review, persisted text, uncertain committed response freezes form and replays identical key/body');
}
