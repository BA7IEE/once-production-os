/** Use the actual grouped navigation, including its collapsed tool/settings sections. */
export async function navigateUI(page,label){
 const tools=['资料交接','批量导入','AI 整理','导出记录','资料来源与使用范围'];
 const settings=['成员与权限','分类设置','机构与品牌','操作日志','合并记录','删除任务与影响核对'];
 const button=page.getByRole('navigation',{name:'主导航'}).getByTitle(label,{exact:true});
 await button.waitFor({state:'attached'});
 const group=button.locator('..');
 if(!await group.evaluate(el=>el.open))await group.locator('summary').click();
 await button.click();
 await page.waitForFunction(label=>[...document.querySelectorAll('nav[aria-label="主导航"] button')].some(b=>b.title===label&&b.getAttribute('aria-current')==='page'),label);
}
export async function addModelOccupation(page){
 await page.getByRole('button',{name:'新增职业',exact:true}).click();
 await page.getByLabel('职业 *',{exact:true}).selectOption('model');
 const select=page.getByLabel('资料来源',{exact:true});await select.locator('option').nth(1).waitFor({state:'attached'});await select.selectOption({index:1});
 await page.getByRole('button',{name:'保存职业',exact:true}).click();
 await page.getByRole('button',{name:'新增职业',exact:true}).waitFor();
}
