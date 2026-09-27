import {proofTransfer} from './credential-media-transfer.ts';
import {expectResponse as ok} from './talent-v2-maintenance.ts';
import type {Application} from '../../packages/core/src/api.ts';
import type {Store} from '../../packages/core/src/store.ts';
import type {FakeClock,Client} from './fixtures.ts';
import assert from 'node:assert/strict';
export async function collectionTransfer(f:{app:Application;store:Store;clock:FakeClock;owner:Client},root:string) {
    const t=await proofTransfer(f,root),schemaVersion='once-talent-v2.0.0';
    const second=await t.graph.add('mediaCollections',{collectionTypeCode:'POLAROIDS',title:'合成已归档素颜照',personRoleId:t.graph.roleId});
    for(const [collectionId,caption,featured] of [[t.graph.collectionId,'合成作品说明',true],[second,'合成素颜照说明',false]] as const) {
        const collection=(await f.store.transaction(tx=>tx.get('mediaCollections',collectionId)))!;
        ok(await f.owner.cmd('POST',`/td2/collections/${collectionId}/items`,{schemaVersion,expectedRevision:collection.revision,expectedPersonRevision:(await t.graph.current()).revision,assetId:t.asset.id,caption,featured}),200);
    }
    const archived=(await f.store.transaction(tx=>tx.get('mediaCollections',second)))!;
    ok(await f.owner.cmd('PATCH',`/td2/collections/${second}`,{schemaVersion,expectedRevision:archived.revision,expectedPersonRevision:(await t.graph.current()).revision,sourceId:t.graph.sourceId,sourceRevision:1,values:{status:'ARCHIVED'}}),200);
    ok(await f.owner.cmd('POST',`/td2/people/${t.graph.personId}/collection-tags`,{schemaVersion,expectedPersonRevision:(await t.graph.current()).revision,sourceId:t.secondSource,sourceRevision:1,values:{collectionId:t.graph.collectionId,tagCode:'LIFESTYLE'}}));
    const codes=['person.td2.mediaCollections','person.td2.mediaCollectionTags'];
    const refs=[];
    for(const id of t.input.usePermissionRefs) {
        const grant=(await f.store.transaction(tx=>tx.get('usePermissions',id)))!;
        const extra=grant.subjectKind==='PERSON'||grant.subjectKind==='SOURCE'&&grant.subjectId===t.graph.sourceId?codes:grant.subjectKind==='SOURCE'&&grant.subjectId===t.secondSource?[codes[1]!]:[];
        if(!extra.length){refs.push(id);continue;}
        refs.push(ok(await f.owner.cmd('POST','/use-permissions',{subjectKind:grant.subjectKind,subjectId:grant.subjectId,sourceId:grant.sourceId,fields:[...grant.fields,...extra],validUntil:grant.validUntil,evidenceNote:'合成：批准集合、标签及来源用于内部重建'})).resourceId as string);
    }
    const input={...t.input,fields:[...t.input.fields,...codes],usePermissionRefs:refs};
    const id=ok(await f.owner.cmd('POST','/exports',input),202).resourceId as string,claim=await f.app.exports.claim();assert.ok(claim);await f.app.exports.process(claim);
    const download=ok(await f.owner.raw('POST',`/exports/${id}/download`,{}),200);
    assert.equal(download.payload.manifest.talent.schemaVersion,'once-talent-transfer-v8');
    return {...t,input,download,jobId:id,secondCollectionId:second};
}
