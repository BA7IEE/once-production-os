import {collectionTransfer} from './collection-transfer.ts';
import {expectResponse as ok} from './talent-v2-maintenance.ts';
import type {Application} from '../../packages/core/src/api.ts';
import type {Store} from '../../packages/core/src/store.ts';
import type {FakeClock,Client} from './fixtures.ts';
import assert from 'node:assert/strict';
export async function adultTransfer(f:{app:Application;store:Store;clock:FakeClock;owner:Client},root:string) {
    const t=await collectionTransfer(f,root),schemaVersion='once-talent-v2.0.0';
    const adult=(await f.store.transaction(tx=>tx.find('adultEligibilities',{personId:t.graph.personId})))[0]!;
    ok(await f.owner.cmd('POST',`/td2/adult-eligibility/${adult.id}/verify`,{schemaVersion,expectedRevision:adult.revision,expectedPersonRevision:(await t.graph.current()).revision,sourceRevision:1,evidenceAssetId:t.asset.id,validUntil:'2026-09-30T00:00:00.000Z'}),200);
    const refs=[];
    for(const id of t.input.usePermissionRefs) {
        const grant=(await f.store.transaction(tx=>tx.get('usePermissions',id)))!;
        if(!(grant.subjectKind==='PERSON'||grant.subjectKind==='SOURCE'&&grant.subjectId===t.graph.sourceId)){refs.push(id);continue;}
        refs.push(ok(await f.owner.cmd('POST','/use-permissions',{subjectKind:grant.subjectKind,subjectId:grant.subjectId,sourceId:grant.sourceId,fields:[...grant.fields,'person.td2.adultEligibilities'],validUntil:grant.validUntil,evidenceNote:'合成：单独批准成年资格和原核验归属'})).resourceId as string);
    }
    const input={...t.input,fields:[...t.input.fields,'person.td2.adultEligibilities'],usePermissionRefs:refs};
    const jobId=ok(await f.owner.cmd('POST','/exports',input),202).resourceId as string,claim=await f.app.exports.claim();assert.ok(claim);await f.app.exports.process(claim);
    const download=ok(await f.owner.raw('POST',`/exports/${jobId}/download`,{}),200);assert.equal(download.payload.manifest.talent.schemaVersion,'once-talent-transfer-v15');
    return {...t,adultId:adult.id,input,jobId,download};
}
