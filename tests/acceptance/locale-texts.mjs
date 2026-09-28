import assert from 'node:assert/strict';
export async function verifyLocaleBrowser({owner,prisma,cmd,writeUI,source,json}){
 const basisTitle='浏览器内部文本依据',sourceId=(await cmd(owner,'POST','/sources',source(basisTitle),201)).resourceId;
 for(const kind of ['PERSON','WORK','PROJECT']){
  const name='浏览器语言'+kind,path=kind==='PERSON'?'/people':kind==='WORK'?'/works':'/projects';
  const id=(await cmd(owner,'POST',path,{...(kind==='PERSON'?{displayName:name,roles:['photographer']}:{title:name}),sourceId},201)).resourceId;
  await owner.getByRole('button',{name:kind==='PERSON'?/人才档案/:kind==='WORK'?/作品库/:/项目库/}).click();
  const query=owner.getByLabel(kind==='PERSON'?'搜索姓名或别名':kind==='WORK'?'搜索作品':'搜索项目',{exact:true});await query.fill(name);await owner.getByRole('button',{name:'搜索',exact:true}).click();
  await owner.locator('.person-card').filter({has:owner.getByRole('heading',{name,exact:true})}).click();
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
  await dialog.getByRole('button',{name:'返回资料',exact:true}).click();await owner.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).first().click();
 }
 console.log('PASS internal locale browser: person/work/project real editor, explicit source and review, persisted text, uncertain committed response freezes form and replays identical key/body');
}
