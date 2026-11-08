import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../support/fixtures.ts';
import {migrationFixture,verifySupplierMerge,exportSupplier,verifySupplierRebuild} from '../support/supplier-migration.ts';
import {mergePreview} from '../support/talent-v2-merge.ts';
test('extension merge retains exact roles, grouped records, choices, two sources, retired history and atomic audit; v16 rekeys a complete business rebuild',async()=>{
 const f=await migrationFixture();await verifySupplierMerge(f);const payload=await exportSupplier(f),target=await fixture();await verifySupplierRebuild(f,payload,target);
});
test('overlapping exact roles with extension facts remain explicitly blocked',async()=>{
 const f=await migrationFixture(),p=(await f.store.transaction(tx=>tx.get('people',f.a.id)))!;
 f.ok(await f.owner.cmd('POST','/td2/people/'+p.id+'/roles',{schemaVersion:'once-talent-v2.1.0',expectedPersonRevision:p.revision,sourceId:f.sourceA,sourceRevision:1,values:{roleCode:'photographer'}}),201);
 const preview=await mergePreview(f.store,f.owner,f.a.id,f.b.id);assert.equal(preview.complete,false);assert.ok(preview.blockers.some((b:any)=>b.code==='SUPPLIER_FIELD_ROLE_REBIND_REVIEW_REQUIRED'));
});
test('changed origin versions hide extension conflict values and block a stale merge',async()=>{
 const f=await migrationFixture();await f.store.transaction(async tx=>{const s=(await tx.get('sources',f.sourceB))!;await tx.replace('sources',{...s,revision:s.revision+1});});
 const p=await mergePreview(f.store,f.owner,f.a.id,f.b.id);assert.equal(p.complete,false);assert.equal(p.professional.restricted,true);assert.deepEqual(p.professional.conflicts,[]);assert.equal(JSON.stringify(p).includes('合成学校乙'),false);
});
