import assert from 'node:assert/strict';
import {join} from 'node:path';
export async function upgradeLegacyCredit({admin,base,prisma,person,evidence,checks}){
 const me=await (await admin.request.get(base+'/api/v1/me')).json(),p=await prisma.person.findUniqueOrThrow({where:{id:person}}),source=await prisma.sourceRecord.findUniqueOrThrow({where:{id:p.sourceId}});
 const post=async(path,data,status=200)=>{const r=await admin.request.post(base+'/api/v1'+path,{headers:{Origin:base,'X-CSRF-Token':me.csrfToken,'Idempotency-Key':crypto.randomUUID()},data});assert.equal(r.status(),status,await r.text());return r.json();};
 const created=await post('/works',{title:'员工旧案例升级验收',sourceId:source.id,origin:'EXTERNAL'},201);await post('/works/'+created.resourceId+'/credits',{expectedRevision:1,personId:person,roleCode:'model',note:'保留员工原始署名说明'});
 const before=await prisma.workCredit.findFirstOrThrow({where:{workId:created.resourceId}});assert.equal(before.personRoleId,null);assert.equal(before.sourceId,null);
 await admin.goto(base+'/workspace/works',{waitUntil:'networkidle'});await admin.getByRole('button').filter({has:admin.getByRole('heading',{name:'员工旧案例升级验收',exact:true})}).click();await admin.getByRole('button',{name:'核对并升级旧署名',exact:true}).click();
 const dialog=admin.getByRole('dialog',{name:'核对并升级旧署名',exact:true});await dialog.getByLabel('原署名对应的明确职业').selectOption({label:'模特'});await dialog.getByRole('button',{name:source.title,exact:true}).click();await dialog.getByLabel('我已核对原署名、职业及独立内部来源').check();await dialog.screenshot({path:join(evidence,'legacy-credit-explicit-upgrade.png')});
 const response=admin.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/works/'+created.resourceId+'/credits/upgrade'));await dialog.getByRole('button',{name:'确认升级旧署名',exact:true}).click();const result=await response;assert.equal(result.status(),200,await result.text());await admin.getByRole('heading',{name:'作品署名',exact:true}).waitFor();
 const after=await prisma.workCredit.findUniqueOrThrow({where:{id:before.id}});assert.equal(after.id,before.id);assert.equal(after.note,before.note);assert.equal(after.sourceId,source.id);assert.ok(after.personRoleId);assert.equal(await prisma.workCredit.count({where:{workId:created.resourceId}}),1);assert.equal(await prisma.workAsset.count({where:{workId:created.resourceId}}),0);
 checks.push('internal-legacy-credit-explicit-UI-upgrade-preserves-id-note-no-media-or-exposure');
}
