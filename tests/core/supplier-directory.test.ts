import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../support/memory-store.ts';
import {workCaseScenario} from '../support/work-cases.ts';

test('directory summaries use the selected exact career; unrelated works never become experience and withdrawal removes dependent content',async()=>{
 const {f,store,work,credit,asset}=await workCaseScenario(new MemoryStore());
 const person=() =>store.transaction(async tx=>(await tx.get('people',f.personId))!);
 const added=await f.expect(f.owner.cmd('POST','/td2/people/'+f.personId+'/roles',{schemaVersion:'once-talent-v2.1.0',expectedPersonRevision:(await person()).revision,sourceId:f.sourceId,sourceRevision:1,values:{roleCode:'director'}}),201);
 const read=async(role?:string)=>f.expect(f.owner.raw('POST','/directory/talents/search',{q:(await person()).displayName,...(role?{role}:{}),pageSize:20}));
 let result=await read();const p=result.items.find((p:any)=>p.id===f.personId);assert.ok(p);
 const model=p.roleSummaries.find((s:any)=>s.personRoleId===credit.personRoleId),director=p.roleSummaries.find((s:any)=>s.personRoleId===added.resourceId);assert.ok(model);assert.ok(director);assert.equal(model.works[0].id,work.id);assert.equal(model.works[0].coverAssetId,asset);assert.deepEqual(director.works,[]);assert.deepEqual(director.capabilities,[]);
 result=await read('director');assert.equal(result.total,1);assert.equal(result.items[0].roleSummaries.length,1);assert.equal(result.items[0].roleSummaries[0].roleCode,'director');assert.deepEqual(result.items[0].roleSummaries[0].works,[]);
 for(const code of ['synthetic_match','synthetic_other'])await f.expect(f.owner.cmd('POST','/catalog/items',{namespace:'workType',code,labelZh:code==='synthetic_match'?'匿名目标类型':'匿名其他类型',labelEn:''}),201);
 const types=(await store.transaction(tx=>tx.find('dictionary',{namespace:'workType',status:'ACTIVE'}))).slice(0,2).map(r=>r.code);assert.equal(types.length,2);let relevant='';
 for(let i=0;i<4;i++){const r=await f.expect(f.owner.cmd('POST','/people/'+f.personId+'/work-cases',{expectedPersonRevision:(await person()).revision,personRoleId:credit.personRoleId,expectedRoleRevision:1,sourceId:f.sourceId,sourceRevision:1,title:i===3?'本次类型对应案例':'其他类型案例 '+i,description:'匿名元数据用例，原件处理另由真实浏览器验收',caseDate:'2026',datePrecision:'YEAR',location:'',brandDisplayName:'',industryCode:null,workTypeCodes:[types[i===3?0:1]!],origin:'EXTERNAL',originNote:'有明确本职业署名的合成案例',creditNote:'实际出镜',assetIds:[asset],coverAssetId:asset}),200);if(i===3)relevant=r.resourceId;}
 const matched=await f.expect(f.owner.raw('POST','/directory/talents/search',{q:(await person()).displayName,role:'model',workTypeCode:types[0]}));assert.equal(matched.total,1);assert.deepEqual(matched.items[0].roleSummaries[0].works.map((w:any)=>w.id),[relevant],'matching work must be visible even after more than three unrelated cases');
 const source=(await store.transaction(tx=>tx.get('sources',work.sourceId)))!;await store.transaction(tx=>tx.replace('sources',{...source,status:'SUSPENDED',revision:source.revision+1}));
 const after=await read();assert.ok(after.items.every((p:any)=>p.roleSummaries.every((s:any)=>!s.works.some((w:any)=>w.id===work.id))));assert.equal(JSON.stringify(after).includes('identifierCiphertext'),false);
});
