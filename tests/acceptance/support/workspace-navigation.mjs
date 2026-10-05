/** Historical contract journeys use the current visible navigation and advanced JSON panel. */
export async function navigateWorkspace(page, name, {jsonImport=false}={}) {
  const button=page.locator('aside[aria-label="工作空间导航"]').getByRole('button',{name,exact:true});
  const mobile=page.getByRole('button',{name:'打开导航',exact:true});
  if(!await button.isVisible()&&await mobile.isVisible())await mobile.click();
  if(!await button.isVisible()) {
    const menu=page.locator('details.management-nav');
    if(await menu.getAttribute('open')===null)await menu.locator('summary').click();
  }
  await button.click();
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
