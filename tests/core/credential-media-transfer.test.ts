import {Application} from '../../packages/core/src/api.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,mkdir,symlink,chmod,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import express from 'express';
import {fixture,result} from '../support/fixtures.ts';
import {proofTransfer} from '../support/credential-media-transfer.ts';
import {prepareRebuildMedia} from '../../scripts/rebuild-media.ts';
import {JsonRebuild} from '../../packages/core/src/rebuild.ts';
import {FaultStore} from '../support/fault-store.ts';
import {LocalMediaProvider} from '../../apps/api/src/media/local-provider.ts';
import {registerMediaHttp} from '../../apps/api/src/media/http.ts';
const setup=async()=>{const dir=await mkdtemp(join(await import('node:fs/promises').then(fs=>fs.realpath(tmpdir())),'once-proof-'));const f=await fixture();return {dir,f,t:await proofTransfer(f,join(dir,'source'))};};
async function inputFiles(dir:string,t:Awaited<ReturnType<typeof proofTransfer>>) {const input=join(dir,'input');await mkdir(input,{mode:0o700});await writeFile(join(input,t.asset.id+'.original.bin'),t.original,{mode:0o600});await writeFile(join(input,t.asset.id+'.preview.jpg'),t.preview,{mode:0o600});return {REBUILD_MEDIA_INPUT_DIR:input,REBUILD_MEDIA_TARGET_DIR:join(dir,'target')};}

test('proof transfer requires original asset and source permits, refuses unrelated assets, and stales on quarantine',async()=>{
    const {dir,f,t}=await setup();try {
        for(const kind of ['ASSET','SOURCE']) {
            const grant=f.store.rows('usePermissions').find(p=>p.subjectKind===kind&&p.fields.includes('media.originals'))!;
            assert.equal((await f.owner.cmd('POST','/exports',{...t.input,usePermissionRefs:t.input.usePermissionRefs.filter(id=>id!==grant.id)})).status,422);
        }
        await assert.rejects(f.store.transaction(tx=>f.app.exports.mediaDownload(tx,t.actor,t.jobId,randomUUID())),(e:any)=>e.status===404);
        assert.ok(!JSON.stringify(t.download).includes('objectToken'));
        assert.deepEqual(await t.provider.readOriginal(t.asset),t.original);
        assert.equal((await f.owner.cmd('POST',`/assets/${t.asset.id}/quarantine`,{expectedRevision:t.asset.revision})).status,200);
        await assert.rejects(f.store.transaction(tx=>f.app.exports.mediaDownload(tx,t.actor,t.jobId,t.asset.id)));
    }finally{await rm(dir,{recursive:true,force:true});}
});

test('proof bytes rebuild verifies all files, preserves verified credential, and audit rollback leaves files reusable',async()=>{
    const {dir,f,t}=await setup();try {
        const target=await fixture(),keys={sourceContactKey:f.app.config.contactKey,targetContactKey:target.app.config.contactKey},rebuild=new JsonRebuild(target.clock,keys),actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner'));
        await assert.rejects(target.store.transaction(tx=>rebuild.apply(tx,actor,t.download.payload,{requestId:randomUUID(),ip:'test'})),(e:any)=>e.code==='REBUILD_MEDIA_NOT_VERIFIED');
        const env=await inputFiles(dir,t),verified=await prepareRebuildMedia(t.download.payload,actor.workspaceId,env,true),ready=new JsonRebuild(target.clock,keys,verified);
        const fault=new FaultStore(target.store);fault.afterInsert=(table)=>{if(table==='audits')throw Error('synthetic audit unavailable');};
        await assert.rejects(fault.transaction(tx=>ready.apply(tx,actor,t.download.payload,{requestId:randomUUID(),ip:'test'})),/synthetic audit/);
        assert.equal(target.store.rows('people').length,0);assert.equal(target.store.rows('assets').length,0);assert.equal(target.store.rows('uploads').length,0);
        assert.equal(await prepareRebuildMedia(t.download.payload,actor.workspaceId,env,true),verified);
        const summary=await target.store.transaction(tx=>ready.apply(tx,actor,t.download.payload,{requestId:randomUUID(),ip:'test'}));assert.equal(summary.mediaRestored,1);
        const provider=await LocalMediaProvider.openExisting(env.REBUILD_MEDIA_TARGET_DIR),asset=target.store.rows('assets')[0]!;
        assert.deepEqual(await provider.readOriginal(asset),t.original);assert.deepEqual(await provider.readPreview(asset),t.preview);
        const credential=target.store.rows('personCredentials').find(c=>c.id===t.graph.credentialId)!;assert.equal(credential.status,'VERIFIED');assert.equal(credential.evidenceAssetId,t.asset.id);
        await assert.rejects(prepareRebuildMedia(t.download.payload,randomUUID(),env,true));
    }finally{await rm(dir,{recursive:true,force:true});}
});

test('missing, corrupt and linked proof files refuse preparation without creating a target',async()=>{
    const {dir,t}=await setup();try {
        const env=await inputFiles(dir,t),file=join(env.REBUILD_MEDIA_INPUT_DIR,t.asset.id+'.original.bin');
        for(const mode of ['missing','corrupt','link']) {
            await rm(file);if(mode==='corrupt')await writeFile(file,Buffer.alloc(t.original.length));if(mode==='link')await symlink(join(env.REBUILD_MEDIA_INPUT_DIR,t.asset.id+'.preview.jpg'),file);
            await assert.rejects(prepareRebuildMedia(t.download.payload,randomUUID(),env,true));await assert.rejects(readFile(join(env.REBUILD_MEDIA_TARGET_DIR,'.once-rebuild-media.json')));
            await rm(file,{force:true});await writeFile(file,t.original);
        }
        await chmod(env.REBUILD_MEDIA_INPUT_DIR,0o755);await assert.rejects(prepareRebuildMedia(t.download.payload,randomUUID(),env,false));
    }finally{await rm(dir,{recursive:true,force:true});}
});

test('HTTP original download audits, rejects revoked permission and rechecks permission after file IO',async()=>{
    const {dir,f,t}=await setup(),server=express(),fault=new FaultStore(f.store),core=new Application(fault,f.app.config,f.clock);registerMediaHttp(server,core,t.provider);const listener=server.listen(0,'127.0.0.1');await new Promise<void>(resolve=>listener.once('listening',resolve));
    try {
        const addr=listener.address() as {port:number},url=`http://127.0.0.1:${addr.port}/api/v1/exports/${t.jobId}/media/${t.asset.id}/original`,headers={cookie:Object.entries(f.owner.jar).map(([k,v])=>k+'='+v).join('; ')};
        assert.equal((await fetch(url)).status,401);
        const response=await fetch(url,{headers});assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),t.original);
        assert.ok(f.store.rows('audits').some(a=>a.action==='export.download'&&a.changedFields.includes('media.originals')));
        fault.afterInsert=table=>{if(table==='audits')throw Error('synthetic download audit failure');};
        assert.equal((await fetch(url,{headers})).status,503);fault.afterInsert=null;
        const original=t.provider.readOriginal.bind(t.provider);t.provider.readOriginal=async a=>{const bytes=await original(a);const grant=f.store.rows('usePermissions').find(p=>p.subjectKind==='ASSET'&&p.subjectId===a.id)!;assert.equal((await f.owner.cmd('POST',`/use-permissions/${grant.id}/revoke`,{expectedRevision:grant.revision})).status,200);return bytes;};
        const rejected=await fetch(url,{headers});assert.equal(rejected.status,409);assert.equal(rejected.headers.get('content-type')?.includes('application/json'),true);
    }finally{await new Promise<void>(resolve=>listener.close(()=>resolve()));await rm(dir,{recursive:true,force:true});}
});
