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
