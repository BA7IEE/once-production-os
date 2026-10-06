/** Historical contract journeys use the current visible navigation and advanced JSON panel. */
export async function navigateWorkspace(page, name, {jsonImport=false,fresh=false}={}) {
  // Fixtures written by the API need a fresh visible form, not its previous page.
  if(fresh&&name!=='工作台')await navigateWorkspace(page,'工作台');
  const aside=page.locator('aside[aria-label="工作空间导航"]');
  const entry=aside.getByRole(name==='账号设置'?'button':'menuitem',{name,exact:true});
  const expand=page.getByRole('button',{name:'展开导航',exact:true});
  if(!await entry.isVisible()&&await expand.isVisible())await expand.click();
  if(!await entry.isVisible())await aside.getByRole('menuitem',{name:'管理与设置',exact:true}).click();
  await entry.click();
  if(jsonImport) {
    const panel=page.locator('details').filter({has:page.locator('summary').filter({hasText:'历史任务、旧档案补齐与高级 JSON 导入'})});
    if(await panel.getAttribute('open')===null)await panel.locator('summary').click();
  }
}

export async function openAdvancedPerson(page) {
  await page.getByText('更多操作',{exact:true}).click();
  await page.getByRole('button',{name:'来源、历史与范围',exact:true}).click();
}

export async function retryOriginal(root) {
  const details=root.locator('.command-recovery details');
  if(await details.getAttribute('open')===null)await details.locator('summary').click();
  await root.getByRole('button',{name:'明确原样重试',exact:true}).click();
}

export async function chooseValues(root,title,names) {
  const menu=root.getByLabel('选择'+title,{exact:true});
  await menu.click();
  const choices=menu.locator('..');
  for(const box of await choices.getByRole('checkbox').all())await box.uncheck();
  for(const name of names){const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');await choices.getByRole('checkbox',{name:new RegExp('^'+escaped+'(?:\\s*\\d+)?$')}).check();}
  await menu.click();
}

export async function openFilters(page,{reset=false}={}) {
  await page.getByRole('button',{name:'筛选条件',exact:true}).click();
  const form=page.getByRole('dialog',{name:'筛选人才',exact:true});
  await form.waitFor();
  if(reset)await form.getByRole('button',{name:'重置条件',exact:true}).click();
  return form;
}

export async function openShortlist(page,title,{finding=false}={}) {
  await navigateWorkspace(page,'候选清单');
  const all=page.getByRole('button',{name:'← 所有清单',exact:true});
  if(await all.isVisible())await all.click();
  await page.getByLabel('查找清单',{exact:true}).fill(title);
  await page.getByRole('button',{name:'查找',exact:true}).click();
  await page.locator('button.shortlist-card').filter({has:page.getByRole('heading',{name:title,exact:true})}).click();
  await page.locator('.sl-detail').getByRole('heading',{name:title,exact:true}).waitFor();
  if(finding){await page.getByRole('button',{name:'继续找人',exact:true}).click();await page.locator('.talent-directory').waitFor();}
}

/** Walk the visible picker, including later pages; never inject a missing option. */
export async function selectPaged(page,root,label,id) {
  const picker=root.getByRole('group',{name:label+'选择器',exact:true}),select=picker.getByLabel(label,{exact:true});
  await select.waitFor();
  await page.waitForFunction(element=>!element.disabled,await select.elementHandle());
  const previous=picker.getByRole('button',{name:'上一页',exact:true});
  for(let traversed=0;await previous.isEnabled();traversed++){
    if(traversed>=100)throw new Error('Visible '+label+' picker could not return to its first page');
    const current=Number((await picker.locator('.pager small').innerText()).match(/第 (\d+) 页$/)?.[1]);
    if(!current||current<=1)throw new Error('Picker page is unavailable');
    const response=page.waitForResponse(r=>r.request().method()==='GET'&&r.url().includes('/api/v1/')&&new URL(r.url()).searchParams.get('page')===String(current-1));
    await previous.click();if((await response).status()!==200)throw new Error('Picker page failed');
    await picker.locator('.pager small').filter({hasText:new RegExp('第 '+(current-1)+' 页$')}).waitFor();
    await page.waitForFunction(element=>!element.disabled,await select.elementHandle());
  }
  for(let current=1;!await select.locator('option[value="'+id+'"]').count();current++){
    if(current>=100)throw new Error('Visible '+label+' picker exhausted its bounded pages');
    const next=picker.getByRole('button',{name:'下一页',exact:true});
    if(!await next.isEnabled())throw new Error('Expected '+label+' is unavailable in the visible picker');
    const response=page.waitForResponse(r=>r.request().method()==='GET'&&r.url().includes('/api/v1/')&&new URL(r.url()).searchParams.get('page')===String(current+1));
    await next.click();if((await response).status()!==200)throw new Error('Picker page failed');
    await picker.locator('.pager small').filter({hasText:new RegExp('第 '+(current+1)+' 页$')}).waitFor();
    await page.waitForFunction(element=>!element.disabled,await select.elementHandle());
  }
  await select.selectOption(id);
}

export async function beginMediaUpload(page,file) {
  const panel=page.getByRole('region',{name:'照片视频与附件',exact:true});
  const next=panel.getByRole('button',{name:'添加下一批文件',exact:true});
  if(await next.isVisible())await next.click();
  const composer=panel.locator('.upload-composer');
  if(!await composer.isVisible())await panel.getByRole('button',{name:'添加照片视频',exact:true}).click();
  await composer.locator('input[type=file]').setInputFiles(file);
  await composer.getByLabel('确认本批文件确实来自上述资料来源',{exact:true}).check();
  await composer.getByRole('button',{name:/^开始上传 \d+ 份文件$/}).click();
}

export async function verifyUnknownMeasurement(page) {
  await page.getByRole('button',{name:'基本资料',exact:true}).click();
  const records=page.locator('.basic-section').filter({has:page.getByRole('heading',{name:'量尺记录',exact:true})});
  await records.getByText('已确认',{exact:true}).waitFor();
  await records.getByText('未知',{exact:true}).waitFor();
}

/** Geometry-only diagnostic: no record text or screenshots leave the runner. */
export async function traceLayout(page,target,label) {
 console.log('UI_LAYOUT '+label+' '+JSON.stringify(await target.evaluate(el=>{
  const rect=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {tag:e.tagName,cls:e.className,x:r.x,y:r.y,width:r.width,height:r.height,scroll:e.scrollWidth,client:e.clientWidth,z:s.zIndex,position:s.position,transform:s.transform,pointer:s.pointerEvents,overflow:s.overflow};};
  const r=el.getBoundingClientRect();return {viewport:innerWidth,scrollX,documentWidth:document.documentElement.scrollWidth,target:rect(el),ancestors:(()=>{let a=el,p=[];for(let i=0;a&&i<8;i++,a=a.parentElement)p.push(rect(a));return p;})(),layers:[...document.querySelectorAll('.ant-modal-root,.ant-modal-wrap,.ant-modal,.once-main,.once-sidebar')].map(rect),hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.className};
 })));
}
