import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeFile,chmod} from 'node:fs/promises';
import {Readable} from 'node:stream';
import sharp from 'sharp';
import {controlledTransfer} from './talent-transfer.ts';
import {expectResponse as ok} from './talent-v2-maintenance.ts';
import type {Application} from '../../packages/core/src/api.ts';
import type {Store} from '../../packages/core/src/store.ts';
import type {FakeClock,Client} from './fixtures.ts';
import {LocalMediaProvider} from '../../apps/api/src/media/local-provider.ts';
export async function proofTransfer(f:{app:Application;store:Store;clock:FakeClock;owner:Client},root:string) {
    const t=await controlledTransfer(f.app,f.store,f.clock,f.owner,true,true,true,true,true);
    f.app.config.mediaEnabled=true;
    const original=await sharp({create:{width:8,height:6,channels:3,background:'#758192'}}).png().toBuffer(),hash=createHash('sha256').update(original).digest('hex');
    const id=ok(await f.owner.cmd('POST','/uploads',{sourceId:t.graph.sourceId,expectedSourceRevision:1,personId:t.graph.personId,fileName:'synthetic-proof.png',mime:'image/png',expectedBytes:original.length,sha256:hash})).resourceId as string;
    const actor=await f.store.transaction(tx=>f.app.identity.authenticate(tx,f.owner.jar.once_session!));
    const u=await f.store.transaction(tx=>f.app.media.beginReceive(tx,actor,id,original.length));
    const provider=await LocalMediaProvider.create(root),received=await provider.receive(u,Readable.from(original),new AbortController().signal);
    await f.store.transaction(tx=>f.app.media.finishReceive(tx,actor,id,u.receiveToken!,received.bytes,received.sha256));
    const uploaded=(await f.store.transaction(tx=>tx.get('uploads',id)))!;
    ok(await f.owner.cmd('POST',`/uploads/${id}/complete`,{expectedRevision:uploaded.revision}),202);
    const claim=await f.app.media.claim();assert.ok(claim);
    const sealed=await provider.seal(claim,new AbortController().signal),preview=await sharp(original).jpeg({quality:82}).toBuffer();
    await writeFile(sealed.preview,preview,{mode:0o400});await chmod(sealed.preview,0o400);
    await f.app.media.finish(claim,{mime:'image/png',sha256:hash,bytes:original.length,width:8,height:6,previewBytes:preview.length,previewHash:createHash('sha256').update(preview).digest('hex')});
    const asset=(await f.store.transaction(tx=>tx.get('assets',id)))!;
    const credentialId=await t.graph.add('personCredentials',{credentialTypeCode:'OTHER',issuerName:'合成证明签发机构',evidenceAssetId:id});
    ok(await f.owner.cmd('POST',`/td2/credentials/${credentialId}/verify`,{schemaVersion:'once-talent-v2.0.0',expectedRevision:1,expectedPersonRevision:(await t.graph.current()).revision,sourceRevision:1}),200);
    const refs=[...t.input.usePermissionRefs];
    const grants=await f.store.transaction(tx=>tx.find('usePermissions'));
    const primary=grants.find(g=>g.subjectKind==='SOURCE'&&g.subjectId===t.graph.sourceId)!;
    for(const [kind,subject,fields] of [['SOURCE',t.graph.sourceId,[...primary.fields,'media.originals']],['ASSET',id,['media.originals']]] as const) {
        const permit=ok(await f.owner.cmd('POST','/use-permissions',{subjectKind:kind,subjectId:subject,sourceId:t.graph.sourceId,fields,validUntil:'2026-10-01T00:00:00.000Z',evidenceNote:'合成：明确批准证明原件迁移'})).resourceId as string;
        if(kind==='SOURCE')refs[refs.indexOf(primary.id)]=permit;else refs.push(permit);
    }
    const input={...t.input,fields:[...t.input.fields,'media.originals'],usePermissionRefs:refs};
    const job=ok(await f.owner.cmd('POST','/exports',input),202).resourceId as string;
    const exportClaim=await f.app.exports.claim();assert.ok(exportClaim);await f.app.exports.process(exportClaim);
    const download=ok(await f.owner.raw('POST',`/exports/${job}/download`,{}),200);
    assert.equal(download.payload.manifest.talent.schemaVersion,'once-talent-transfer-v7');
    return {...t,graph:{...t.graph,credentialId},input,jobId:job,download,asset,provider,actor,original,preview};
}
