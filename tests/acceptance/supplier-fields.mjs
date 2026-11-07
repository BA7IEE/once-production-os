import assert from 'node:assert/strict';
import {join} from 'node:path';
export async function browserCatalogFields({admin,evidence}){
 await admin.goto(new URL('/workspace/catalog',admin.url()).href);await admin.getByRole('heading',{name:'职业字段与模板',exact:true}).waitFor();
 await admin.getByRole('button',{name:'＋ 增加字段',exact:true}).click();await admin.getByLabel('字段名称',{exact:true}).fill('拍摄系统（验收）');await admin.getByLabel('固定编码',{exact:true}).fill('custom.camera_system');await admin.getByRole('button',{name:'应用编码',exact:true}).click();
 await admin.getByLabel('类型',{exact:true}).selectOption('CODE_SET');await admin.getByLabel('所属对象',{exact:true}).selectOption('ROLE');await admin.getByRole('checkbox',{name:'摄影师',exact:true}).check();
 await admin.getByLabel('名称',{exact:true}).fill('合成摄影系统');await admin.getByLabel('选项编码',{exact:true}).fill('synthetic_camera');
 await admin.getByRole('button',{name:'保存版本草稿',exact:true}).click();await admin.getByRole('button',{name:'发布第 2 版',exact:true}).waitFor();await admin.getByLabel('字段版本发布说明',{exact:true}).fill('匿名验收新增摄影多选字段');await admin.getByRole('button',{name:'发布第 2 版',exact:true}).click();await admin.getByText(/已发布第 2 版。/).waitFor();
 await admin.locator('.supplier-catalog').screenshot({path:join(evidence,'field-catalog-published.png')});
}
export async function browserFillProfessional({page,sid,prisma,evidence}){
 const summary=page.locator('.supplier-professional > details > summary').filter({hasText:'摄影师'});await summary.click();const photo=summary.locator('..');
 const specialties=photo.locator('fieldset.supplier-professional-field').filter({hasText:'特殊摄影能力'});
 await specialties.getByLabel('填写状态',{exact:true}).selectOption('KNOWN');await specialties.getByRole('checkbox',{name:'斯坦尼康',exact:true}).check();await specialties.getByRole('checkbox',{name:'Trinity',exact:true}).check();
 const custom=photo.locator('fieldset.supplier-professional-field').filter({hasText:'拍摄系统（验收）'});await custom.getByLabel('填写状态',{exact:true}).selectOption('KNOWN');await custom.getByRole('checkbox',{name:'合成摄影系统',exact:true}).check();
 await page.locator('.supplier-professional-field > details > summary').filter({hasText:'专业资格声明'}).click();await page.getByRole('button',{name:'＋ 添加专业资格',exact:true}).click();await page.getByLabel('资格名称 1',{exact:true}).fill('合成摄影培训资格');await page.getByLabel('颁发机构 1',{exact:true}).fill('匿名培训机构');
 const response=page.waitForResponse(r=>r.request().method()==='PATCH'&&r.url().endsWith('/profile-drafts/'+sid));await page.getByRole('button',{name:'保存修改',exact:true}).click();assert.equal((await response).status(),200);await page.getByText('草稿已保存，可继续上传材料或确认入库。',{exact:true}).waitFor();
 const draft=await prisma.talentSubmission.findUniqueOrThrow({where:{id:sid}});assert.equal(draft.schemaVersion,'once-supplier-profile-v1');
 await page.locator('.supplier-professional').screenshot({path:join(evidence,'supplier-professional-fields.png')});
}
export async function browserVerifyProfessional({admin,page,prisma,person,evidence}){
 assert.equal(await prisma.personCredential.count({where:{personId:person.id,status:'UNVERIFIED',credentialName:'合成摄影培训资格'}}),1);
 assert.equal(await prisma.supplierFact.count({where:{personId:person.id,fieldCode:'custom.camera_system',status:'ACTIVE',recordKey:'single'}}),1);
 assert.ok(!JSON.stringify(await page.evaluate(()=>({session:{...sessionStorage},local:{...localStorage}}))).includes('custom.camera_system'));
 await admin.goto(new URL('/talents',admin.url()).href);await admin.getByRole('button',{name:'筛选条件',exact:true}).click();const dialog=admin.getByRole('dialog',{name:'筛选人才',exact:true});
 await dialog.getByLabel('专业条件对应职业',{exact:true}).selectOption('photographer');await dialog.getByRole('button',{name:'＋ 添加专业字段条件',exact:true}).click();await dialog.getByLabel('专业字段 1',{exact:true}).selectOption('camera.specialties');await dialog.getByLabel('选项匹配',{exact:true}).selectOption('ALL');await dialog.getByRole('checkbox',{name:'斯坦尼康',exact:true}).check();await dialog.getByRole('checkbox',{name:'Trinity',exact:true}).check();
 await dialog.getByRole('button',{name:'＋ 添加专业字段条件',exact:true}).click();await dialog.getByLabel('专业字段 2',{exact:true}).selectOption('custom.camera_system');await dialog.getByRole('checkbox',{name:'合成摄影系统',exact:true}).check();
 const response=admin.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/directory/talents/search'));await dialog.getByRole('button',{name:'应用筛选',exact:true}).click();const data=await(await response).json();assert.equal(data.total,1);assert.equal(data.items[0].id,person.id);assert.equal(data.items[0].matchingRoleIds.length,1);const role=await prisma.personRole.findUniqueOrThrow({where:{id:data.items[0].matchingRoleIds[0]}});assert.equal(role.roleCode,'photographer');
 await admin.getByRole('heading',{name:person.displayName,exact:true}).waitFor();await admin.screenshot({path:join(evidence,'internal-professional-search.png'),fullPage:true});
}
