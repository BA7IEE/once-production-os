import assert from 'node:assert/strict';
import {join} from 'node:path';
import {chooseValues,navigateWorkspace} from './support/workspace-navigation.mjs';

export async function browserProfessionalHistory({admin,cmd,internal,base,evidence,loginName,password}){
 const source=await cmd('/sources',{title:'匿名专业筛选恢复依据',type:'MANUAL',providerClaim:'匿名测试材料',basisMode:'INTERNAL_USE',basisDescription:'匿名隔离验证专业查询状态，不代表真实人才确认',validUntil:new Date(Date.now()+90*86400000).toISOString()});
 const schema=await(await internal.request.get(base+'/api/v1/supplier-field-schema')).json();
 for(let index=0;index<22;index++){
  const person=await cmd('/directory/talents',{schemaVersion:'once-talent-experience-v1',displayName:'可靠性目录 '+String(index).padStart(2,'0'),kind:'TALENT',roleCodes:['photographer','director'],sourceId:source.resourceId,sourceRevision:1});
  await cmd('/people/'+person.resourceId+'/professional',{expectedPersonRevision:person.revision,sourceId:source.resourceId,sourceRevision:1,replace:[],professional:{catalogVersion:schema.version,catalogDigest:schema.digest,answers:[{fieldCode:'camera.specialties',roleCode:'photographer',state:'KNOWN',value:['steadicam','trinity']}]}});
 }
 await admin.goto(base+'/talents');await admin.getByRole('button',{name:'筛选条件',exact:true}).click();
 const dialog=admin.getByRole('dialog',{name:'筛选人才',exact:true});await dialog.getByRole('button',{name:'重置条件',exact:true}).click();
 await chooseValues(dialog,'职业',['摄影师']);await dialog.getByLabel('专业条件对应职业',{exact:true}).selectOption('photographer');
 await dialog.getByRole('button',{name:'＋ 添加专业字段条件',exact:true}).click();await dialog.getByLabel('专业字段 1',{exact:true}).selectOption('camera.specialties');await dialog.getByLabel('选项匹配',{exact:true}).selectOption('ALL');
 await dialog.getByRole('checkbox',{name:'斯坦尼康',exact:true}).check();await dialog.getByRole('checkbox',{name:'Trinity',exact:true}).check();
 await dialog.getByRole('button',{name:'应用筛选',exact:true}).click();await admin.getByLabel('搜索姓名或别名',{exact:true}).fill('可靠性目录');await admin.getByRole('button',{name:'搜索',exact:true}).click();await admin.getByText('共 22 位',{exact:true}).waitFor();
 await admin.locator('article.directory-card').first().getByRole('checkbox').check();
 await admin.getByRole('button',{name:'下一页',exact:true}).click();await admin.getByText('共 22 条 · 第 2 页',{exact:true}).waitFor();await admin.locator('article.directory-card').first().getByRole('checkbox').check();
 await admin.getByRole('button',{name:'筛选条件',exact:true}).click();await dialog.getByLabel('选项匹配',{exact:true}).selectOption('ANY');await dialog.getByRole('button',{name:'关闭',exact:true}).click();
 await admin.waitForFunction(()=>history.state?.onceDirectory?.views?.library?.professionalDraft?.fields[0]?.match==='ANY'&&history.state.onceDirectory.views.library.selected.length===2);
 const state=await admin.evaluate(()=>history.state.onceDirectory.views.library);
 const check=async()=>{
  await admin.getByText('共 22 条 · 第 2 页',{exact:true}).waitFor();await admin.getByText('已选 2 人',{exact:true}).waitFor();
  assert.equal(await admin.locator('article.directory-card').count(),2);assert.ok(await admin.locator('article.directory-card').first().getByRole('checkbox').isChecked());
  assert.deepEqual(await admin.evaluate(()=>history.state.onceDirectory.views.library),state);
  assert.equal(new URL(admin.url()).search,'');
 };
 await admin.locator('article.directory-card').first().locator('button.person-card').click();await admin.getByRole('button',{name:'← 返回目录',exact:true}).click();await check();
 await admin.goBack();await admin.getByRole('region',{name:'人才主详情',exact:true}).waitFor();await admin.goBack();await check();
 await admin.goForward();await admin.getByRole('region',{name:'人才主详情',exact:true}).waitFor();await admin.goForward();await check();
 await admin.reload({waitUntil:'networkidle'});await check();
 await admin.getByRole('button',{name:'筛选条件',exact:true}).click();assert.equal(await dialog.getByLabel('选项匹配',{exact:true}).inputValue(),'ANY');await dialog.getByRole('button',{name:'关闭',exact:true}).click();
 await admin.screenshot({path:join(evidence,'professional-history-second-page.png'),fullPage:true});
 const historicUrl=admin.url();await navigateWorkspace(admin,'账号设置');await admin.getByRole('button',{name:'退出当前会话',exact:true}).click();
 await admin.getByLabel('登录名',{exact:true}).fill(loginName);await admin.getByLabel('密码',{exact:true}).fill(password);await admin.getByRole('button',{name:'登录',exact:true}).click();await admin.getByRole('button',{name:'人才库',exact:true}).waitFor();
 let returned=false;
 for(let index=0;index<6;index++){await admin.goBack();if(admin.url()===historicUrl){returned=true;break;}}
 assert.ok(returned,'return to the actual old browser history entry after login');await admin.getByRole('heading',{name:'人才库',exact:true}).waitFor();
 await admin.waitForFunction(()=>history.state?.onceDirectory?.views?.library?.page===1);
 const cleared=await admin.evaluate(()=>history.state.onceDirectory.views.library);assert.equal(cleared.selected.length,0);assert.deepEqual(cleared.professionalQuery,{fields:[]});assert.deepEqual(cleared.professionalDraft,{fields:[]});
}
