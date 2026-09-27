import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,realpath,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {fixture,result} from '../support/fixtures.ts';
import {collectionTransfer} from '../support/collection-transfer.ts';
import {JsonRebuild} from '../../packages/core/src/rebuild.ts';
import {prepareRebuildMedia} from '../../scripts/rebuild-media.ts';
import {FaultStore} from '../support/fault-store.ts';
const setup=async()=>{const dir=await mkdtemp(join(await realpath(tmpdir()),'once-collection-')),f=await fixture();return {dir,f,t:await collectionTransfer(f,join(dir,'source'))};};

test('collections preserve typed UUIDs, source tags, archived state, featured captions and one shared original across credentials and collections',async()=>{
 const {dir,f,t}=await setup();try{
    const b=t.download.payload.manifest.talent;assert.equal(b.assets.length,1);assert.equal(b.collectionItems.length,2);assert.equal(b.tables.mediaCollections.length,2);assert.equal(b.tables.mediaCollectionTags.length,2);
    const target=await fixture(),keys={sourceContactKey:f.app.config.contactKey,targetContactKey:target.app.config.contactKey},rebuild=new JsonRebuild(target.clock,keys),actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
    const input=join(dir,'input');await mkdir(input,{mode:0o700});await writeFile(join(input,t.asset.id+'.original.bin'),t.original);await writeFile(join(input,t.asset.id+'.preview.jpg'),t.preview);
    const verified=await prepareRebuildMedia(t.download.payload,actor.workspaceId,{REBUILD_MEDIA_INPUT_DIR:input,REBUILD_MEDIA_TARGET_DIR:join(dir,'target')},true),ready=new JsonRebuild(target.clock,keys,verified);
    const fault=new FaultStore(target.store);fault.afterInsert=table=>{if(table==='audits')throw Error('collection audit failed');};
    await assert.rejects(fault.transaction(tx=>ready.apply(tx,actor,t.download.payload,{requestId:randomUUID(),ip:'test'})),/collection audit/);assert.equal(target.store.rows('mediaCollectionItems').length,0);assert.equal(target.store.rows('assets').length,0);
    await target.store.transaction(tx=>ready.apply(tx,actor,t.download.payload,{requestId:randomUUID(),ip:'test'}));
    for(const item of b.collectionItems) {const actual=target.store.rows('mediaCollectionItems').find(i=>i.id===item.id)!;for(const [key,value] of Object.entries(item))assert.deepEqual((actual as any)[key],value);}
    assert.equal(target.store.rows('mediaCollections').find(c=>c.id===t.secondCollectionId)!.status,'ARCHIVED');assert.equal(target.store.rows('mediaCollectionTags').find(tag=>tag.tagCode==='LIFESTYLE')!.sourceId,t.secondSource);
    assert.equal(target.store.rows('assets').length,1);assert.equal(target.store.rows('adultEligibilities').length,0,'collection tags never infer adult verification');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('collection references, duplicate tags/items, ordering and unselected owners are rejected before writes',async()=>{
 const {dir,f,t}=await setup();try{
    const target=await fixture(),rebuild=new JsonRebuild(target.clock,{sourceContactKey:f.app.config.contactKey,targetContactKey:target.app.config.contactKey}),actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
    for(const mode of ['collection','person','asset','position','duplicateItem','duplicateTag','unselected','unknownField']) {
        const p=structuredClone(t.download.payload),b=p.manifest.talent,i=b.collectionItems[0];
        if(mode==='collection')i.collectionId=randomUUID();if(mode==='person')i.personId=randomUUID();if(mode==='asset')i.assetId=randomUUID();if(mode==='position')i.orderIndex=1;
        if(mode==='duplicateItem')b.collectionItems.push({...i,id:randomUUID()});if(mode==='duplicateTag')b.tables.mediaCollectionTags.push({...b.tables.mediaCollectionTags[0],id:randomUUID()});
        if(mode==='unselected')b.selectedFields=b.selectedFields.filter((c:string)=>c!=='person.td2.mediaCollections');if(mode==='unknownField')i.hiddenMetadata='rejected';
        await assert.rejects(target.store.transaction(tx=>rebuild.preview(tx,actor,p)),undefined,mode);assert.equal(target.store.rows('people').length,0);
    }
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('collection source permit, original grant, and media-read permission cannot be replaced by person approval',async()=>{
 const {dir,f,t}=await setup();try{
    const grant=f.store.rows('usePermissions').find(g=>t.input.usePermissionRefs.includes(g.id)&&g.subjectKind==='SOURCE'&&g.subjectId===t.secondSource)!;
    const limited=result(await f.owner.cmd('POST','/use-permissions',{subjectKind:'SOURCE',subjectId:grant.subjectId,sourceId:grant.sourceId,fields:grant.fields.filter(c=>c!=='person.td2.mediaCollectionTags'),validUntil:grant.validUntil,evidenceNote:'合成：仅批准语言，未批准标签'})).resourceId;
    assert.equal((await f.owner.cmd('POST','/exports',{...t.input,usePermissionRefs:t.input.usePermissionRefs.map(id=>id===grant.id?limited:id)})).status,422);
    assert.equal((await f.owner.cmd('POST','/exports',{...t.input,fields:t.input.fields.filter(c=>c!=='media.originals')})).status,409);
    await assert.rejects(f.store.transaction(tx=>f.app.exports.mediaDownload(tx,{...t.actor,permissions:t.actor.permissions.filter(p=>p!=='assets.read')},t.jobId,t.asset.id)));
    // Revoking the source permit also invalidates the file route, not just JSON.
    assert.equal((await f.owner.cmd('POST',`/use-permissions/${grant.id}/revoke`,{expectedRevision:grant.revision})).status,200);
    assert.equal((await f.owner.raw('POST',`/exports/${t.jobId}/download`,{})).status,409);
    await assert.rejects(f.store.transaction(tx=>f.app.exports.mediaDownload(tx,t.actor,t.jobId,t.asset.id)));
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('collection-only exports need no credential selection or encryption keys, and changed captions stale the file',async()=>{
 const {dir,f,t}=await setup();try{
    const input={...t.input,fields:t.input.fields.filter(c=>!['person.td2.personCredentials','person.td2.credentialIdentifiers'].includes(c))};
    const response=await f.owner.cmd('POST','/exports',input);assert.equal(response.status,202,JSON.stringify(response.body));
    const id=result(response).resourceId,claim=await f.app.exports.claim();assert.ok(claim);await f.app.exports.process(claim);
    const downloaded=result(await f.owner.raw('POST',`/exports/${id}/download`,{}));assert.equal(downloaded.payload.manifest.talent.tables.personCredentials.length,0);
    const target=await fixture(),rebuild=new JsonRebuild(target.clock),actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
    await target.store.transaction(tx=>rebuild.preview(tx,actor,downloaded.payload));
    await f.store.transaction(async tx=>{const item=(await tx.find('mediaCollectionItems',{collectionId:t.graph.collectionId}))[0]!;await tx.replace('mediaCollectionItems',{...item,caption:'合成已变更说明',revision:item.revision+1});});
    assert.equal((await f.owner.raw('POST',`/exports/${id}/download`,{})).status,409);
 }finally{await rm(dir,{recursive:true,force:true});}
});
