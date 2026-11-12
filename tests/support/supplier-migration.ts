import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Application} from '../../packages/core/src/api.ts';
import type {Store} from '../../packages/core/src/store.ts';
import {newSystem,Client,SYNTHETIC_PASSWORD,sourceInput} from './fixtures.ts';
import {MemoryStore} from './memory-store.ts';
import {mergePreview,mergeInput} from './talent-v2-merge.ts';
import {FaultStore} from './fault-store.ts';
import {AppError} from '../../packages/core/src/errors.ts';
import {SOURCE_FIELDS} from './talent-transfer.ts';
import {SupplierProfessional} from '../../packages/core/src/supplier-professional.ts';
import {JsonRebuild} from '../../packages/core/src/rebuild.ts';
import {inspectTalentIntegrity} from '../../packages/core/src/talent-v2-integrity.ts';
import {digest} from '../../packages/core/src/json.ts';

const schemaVersion='once-talent-v2.1.0';
export async function migrationFixture(store:Store=new MemoryStore()){
 const initial=newSystem(),app=new Application(store,initial.app.config,initial.clock),clock=initial.clock,owner=new Client(app);
 const ids=await app.identity.bootstrap('owner','匿名迁移管理员',SYNTHETIC_PASSWORD);await owner.login();
 const ok=(r:any,status=200)=>{assert.equal(r.status,status,JSON.stringify(r.body));return r.body as any;};
 const source=async(title:string)=>ok(await owner.cmd('POST','/sources',{...sourceInput(),title}),201).resourceId as string;
 const sourceA=await source('合成来源甲'),sourceB=await source('合成来源乙');
 const person=async(name:string,sourceId:string,roleCode:string)=>{const id=ok(await owner.cmd('POST','/td2/people',{schemaVersion,originSourceId:sourceId,sourceRevision:1,displayName:name,createTalent:true}),201).resourceId as string;
  const row=(await store.transaction(tx=>tx.get('people',id)))!;const role=ok(await owner.cmd('POST','/td2/people/'+id+'/roles',{schemaVersion,expectedPersonRevision:row.revision,sourceId,sourceRevision:1,values:{roleCode}}),201).resourceId as string;return {id,role};};
 const a=await person('合成主档人物',sourceA,'director'),b=await person('合成重复人物',sourceB,'photographer');
 const write=async(id:string,sourceId:string,answers:unknown[],replace:Array<{id:string;revision:number}>=[])=>{const detail=ok(await owner.raw('GET','/people/'+id+'/professional'));return ok(await owner.cmd('POST','/people/'+id+'/professional',{expectedPersonRevision:detail.revision,sourceId,sourceRevision:1,professional:{catalogVersion:detail.catalog.version,catalogDigest:detail.catalog.digest,answers},replace}));};
 await write(a.id,sourceA,[{fieldCode:'person.education',roleCode:null,state:'KNOWN',value:[{id:randomUUID(),values:{institution:'合成学校甲',program:'导演进修'}}]},{fieldCode:'production.focus',roleCode:'director',state:'KNOWN',value:['documentary']}]);
 await write(b.id,sourceB,[{fieldCode:'person.education',roleCode:null,state:'KNOWN',value:[{id:randomUUID(),values:{institution:'合成学校乙',program:'摄影课程',from:'2012-09-01'}}]},{fieldCode:'camera.specialties',roleCode:'photographer',state:'KNOWN',value:['steadicam','moco']},{fieldCode:'role.started_year',roleCode:'photographer',state:'KNOWN',value:2015}]);
 const old=ok(await owner.raw('GET','/people/'+b.id+'/professional')).entries.find((e:any)=>e.field.code==='role.started_year');await write(b.id,sourceB,[{fieldCode:'role.started_year',roleCode:'photographer',state:'KNOWN',value:2017}],[{id:old.id,revision:old.revision}]);
 const work=ok(await owner.cmd('POST','/works',{title:'合成摄影案例',sourceId:sourceB,origin:'EXTERNAL',originNote:'匿名外部作品，未推断 ONCE 项目'}),201).resourceId as string;
 ok(await owner.cmd('POST','/works/'+work+'/credits',{expectedRevision:1,personId:b.id,roleCode:'photographer',note:'合成署名出处'}));const credit=(await store.transaction(tx=>tx.find('workCredits',{workId:work})))[0]!;
 ok(await owner.cmd('POST','/works/'+work+'/credits/upgrade',{expectedRevision:2,creditId:credit.id,expectedCreditRevision:credit.revision,personRoleId:b.role,expectedRoleRevision:1,sourceId:sourceB,sourceRevision:1}));
 const scope=(await store.transaction(tx=>tx.get('people',a.id)))!.scopeId,list=ok(await owner.cmd('POST','/shortlists',{title:'合成候选原引用',scopeId:scope}),201).resourceId as string;
 ok(await owner.cmd('POST','/shortlists/'+list+'/items',{expectedRevision:1,personId:b.id,personRoleId:b.role,personRoleRevision:1,note:'保留本次选人说明',workAssetIds:[]}));
 return {app,store,clock,owner,ids,sourceA,sourceB,a,b,work,credit,list,ok,write};
}
export async function verifySupplierMerge(f:Awaited<ReturnType<typeof migrationFixture>>){
 const {store,owner,ok,a,b}=f,p=await mergePreview(store,owner,a.id,b.id);assert.equal(p.complete,true,JSON.stringify(p.blockers));
 assert.ok(p.professional.items.some((r:any)=>r.table==='supplierFacts'));const conflict=p.professional.conflicts.find((c:any)=>c.table==='supplierFacts');assert.ok(conflict);assert.match(JSON.stringify(conflict),/合成学校乙/);
 const professionalConflicts=p.professional.conflicts.map((c:any)=>({table:c.table,canonicalId:c.canonicalId,duplicateId:c.duplicateId,choice:c.choices.includes('RETAIN_DUPLICATE_HISTORY')?'RETAIN_DUPLICATE_HISTORY':'KEEP_DUPLICATE_ACTIVE'}));
 const body={...mergeInput(p),professionalConflicts};const before=await store.transaction(async tx=>({facts:await tx.find('supplierFacts'),choices:await tx.find('supplierFactChoices'),people:await tx.find('people')}));
 assert.equal((await owner.cmd('POST','/people/merge',{...body,professionalConflicts:professionalConflicts.filter((c:any)=>c.table!=='supplierFacts')})).status,422);
 const fault=new FaultStore(store);fault.afterInsert=(table,row)=>{if(table==='audits'&&'action'in row&&row.action==='person.merge')throw new AppError(503,'STORE_UNAVAILABLE','synthetic extension merge audit failure');};
 const client=new Client(new Application(fault,f.app.config,f.clock));client.jar={...owner.jar};client.csrf=owner.csrf;const key=randomUUID();assert.equal((await client.cmd('POST','/people/merge',body,key)).status,503);
 assert.deepEqual(await store.transaction(async tx=>({facts:await tx.find('supplierFacts'),choices:await tx.find('supplierFactChoices'),people:await tx.find('people')})),before);
 fault.afterInsert=null;ok(await client.cmd('POST','/people/merge',body,key));assert.equal(ok(await client.cmd('POST','/people/merge',body,key)).replayed,true);
 const rows=await store.transaction(tx=>tx.find('supplierFacts'));assert.equal(rows.length,before.facts.length);assert.ok(rows.every(r=>r.personId===a.id));assert.deepEqual(await store.transaction(tx=>tx.find('supplierFactChoices')),before.choices);
 for(const old of before.facts.filter(r=>r.personId===b.id)){const next=rows.find(r=>r.id===old.id)!;assert.equal(next.sourceId,old.sourceId);assert.equal(next.personRoleId,old.personRoleId);assert.equal(next.setId,old.setId);assert.equal(next.status,old.status);if(old.textCiphertext)assert.notEqual(next.textCiphertext,old.textCiphertext);assert.ok(next.mergeDecisionId);}
 assert.equal((await store.transaction(tx=>tx.get('workCredits',f.credit.id)))!.personId,a.id);assert.equal((await store.transaction(tx=>tx.find('shortlistItems',{shortlistId:f.list})))[0]!.personId,a.id);
 assert.equal((await store.transaction(tx=>tx.find('talentAccessGrants',{state:'ACTIVE'}))).length,0);
 const pro=ok(await owner.raw('GET','/people/'+a.id+'/professional'));assert.equal(pro.entries.filter((e:any)=>e.field.code==='person.education').length,1);assert.match(JSON.stringify(pro),/合成学校乙/);
 const report=await store.transaction(tx=>inspectTalentIntegrity(tx,f.ids.workspaceId,f.app.config.contactKey,f.clock));assert.equal(report.relationFailures,0);assert.equal(report.professionalFactFailures,0);
 return body;
}
export async function exportSupplier(f:Awaited<ReturnType<typeof migrationFixture>>){
 const {ok,owner,a,sourceA,sourceB,work}=f;
 const codes=['person.td2.talentProfiles','person.td2.personRoles','person.td2.supplierFields','person.td2.mergeHistory','person.td2.fieldEvidence'],personFields=['person.displayName','person.aliases','person.intro','person.status',...codes],workFields=['work.title','work.origin','work.originNote','work.status','work.relations'];
 const permission=async(kind:string,id:string,sourceId:string,fields:string[])=>ok(await owner.cmd('POST','/use-permissions',{subjectKind:kind,subjectId:id,sourceId,fields,validUntil:'2026-12-01T00:00:00.000Z',evidenceNote:'匿名隔离重建，逐项批准当前字段与历史'}),201).resourceId as string;
 const refs=[await permission('PERSON',a.id,sourceA,personFields),await permission('WORK',work,sourceB,workFields)];for(const id of [sourceA,sourceB])refs.push(await permission('SOURCE',id,id,[...SOURCE_FIELDS,...codes,'work.relations']));
 const input={format:'JSON',selectedIds:{people:[a.id],works:[work],projects:[]},fields:[...personFields,...workFields,...SOURCE_FIELDS],usePermissionRefs:refs};
 const old=await owner.cmd('POST','/exports',{...input,fields:input.fields.filter(c=>c!=='person.td2.supplierFields')});assert.equal(old.status,409);assert.equal((old.body as any).error.code,'SUPPLIER_FIELD_EXPORT_VERSION_REQUIRED');
 const job=ok(await owner.cmd('POST','/exports',input),202),claim=await f.app.exports.claim();assert.ok(claim);await f.app.exports.process(claim);const download=ok(await owner.raw('POST','/exports/'+job.resourceId+'/download',{}));assert.equal(download.payload.manifest.talent.schemaVersion,'once-talent-transfer-v16');assert.equal(download.sha256,digest(download.payload));return download.payload;
}
export async function verifySupplierRebuild(f:Awaited<ReturnType<typeof migrationFixture>>,payload:any,target:{store:Store;app:Application;clock:import('./fixtures.ts').FakeClock;apply?:(payload:any)=>Promise<void>}){
 const {store,app,clock}=target,keys={sourceContactKey:f.app.config.contactKey,targetContactKey:app.config.contactKey},rebuild=new JsonRebuild(clock,keys),actor=await store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
 const malformed=structuredClone(payload);malformed.manifest.talent.supplier.catalogs[0].definition.fields.find((r:any)=>r.code==='camera.specialties').options.find((o:any)=>o.code==='moco').label='含义被改写';malformed.manifest.talent.supplier.catalogs[0].digest=digest(malformed.manifest.talent.supplier.catalogs[0].definition);
 await assert.rejects(store.transaction(tx=>rebuild.preview(tx,actor,malformed)),/含义/);assert.equal((await store.transaction(tx=>tx.find('supplierFacts'))).length,0);
 const wrong=new JsonRebuild(clock,{...keys,sourceContactKey:Buffer.alloc(32)});await assert.rejects(store.transaction(tx=>wrong.preview(tx,actor,payload)),/解密/);
 await store.transaction(tx=>rebuild.preview(tx,actor,payload));if(target.apply)await target.apply(payload);else await store.transaction(tx=>rebuild.apply(tx,actor,payload,{requestId:randomUUID(),ip:'synthetic'}));
 const s=payload.manifest.talent.supplier,restored=await store.transaction(tx=>tx.find('supplierFacts'));assert.equal(restored.length,s.facts.length);
 const service=new SupplierProfessional(clock,app.config);for(const old of s.facts){const next=restored.find(r=>r.id===old.id)!;assert.equal(next.personId,old.personId);assert.equal(next.status,old.status);assert.equal(next.setId,old.setId);assert.deepEqual(next.originalConfirmation,old.originalConfirmation);if(old.textCiphertext){assert.notEqual(next.textCiphertext,old.textCiphertext);assert.equal(typeof await store.transaction(tx=>service.scalar(tx,next)),'string');}}
 assert.deepEqual((await store.transaction(tx=>tx.find('supplierFactChoices'))).map(({workspaceId,...r})=>r).sort((a,b)=>a.id.localeCompare(b.id)),s.choices.sort((a:any,b:any)=>a.id.localeCompare(b.id)));
 assert.equal((await store.transaction(tx=>tx.find('workCredits')))[0]!.personRoleId,f.b.role);assert.equal((await store.transaction(tx=>tx.find('usePermissions'))).length,0);assert.equal((await store.transaction(tx=>tx.find('talentAccessGrants'))).length,0);
 const integrity=await store.transaction(tx=>inspectTalentIntegrity(tx,actor.workspaceId,app.config.contactKey,clock));assert.equal(integrity.relationFailures,0);assert.equal(integrity.professionalFactFailures,0);
}
