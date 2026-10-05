import {registeredTemp} from '../../scripts/registered-temp.mjs';
import {AppError} from '../../packages/core/src/errors.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,mkdir,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {PrismaClient} from '@prisma/client';
import {PrismaStore} from '../../apps/api/src/prisma-store.ts';
import {Application} from '../../packages/core/src/api.ts';
import {FakeClock,Client,SYNTHETIC_PASSWORD} from '../support/fixtures.ts';
import {collectionTransfer} from '../support/collection-transfer.ts';
import {JsonRebuild} from '../../packages/core/src/rebuild.ts';
import {prepareRebuildMedia} from '../../scripts/rebuild-media.ts';
import {LocalMediaProvider} from '../../apps/api/src/media/local-provider.ts';
import {FaultStore} from '../support/fault-store.ts';

test('real PostgreSQL collection migration preserves shared bytes, source tags and collection relationships with rollback',async()=>{
    assert.equal(process.env.ALLOW_TD2_DB_TESTS,'yes');
    const urls=[process.env.DATABASE_URL_TD2_TEST,process.env.DATABASE_URL_TALENT_REBUILD_TEST];assert.notEqual(urls[0],urls[1]);
    for(const raw of urls){assert.ok(raw);const u=new URL(raw);assert.ok(['postgres:','postgresql:'].includes(u.protocol));assert.ok(['127.0.0.1','localhost','[::1]'].includes(u.hostname));assert.match(u.pathname,/^\/once_(test_td2|rebuild)_[a-z0-9_]+$/);assert.equal(u.search,'');assert.equal(u.hash,'');}
    const stores=urls.map(url=>new PrismaStore(new PrismaClient({datasources:{db:{url}},log:[]}))),clock=new FakeClock(),dir=registeredTemp().path;
    try {
        const sides=[];
        for(const store of stores) {
            assert.equal(await store.client.workspace.count(),0);
            const app=new Application(store,{origin:'https://proof.test.invalid',secureCookies:true,contactKey:randomBytes(32),csrfKey:randomBytes(32),recoveryEpoch:randomBytes(24).toString('hex'),accessMode:'INTERNAL',environment:'test',dataEgressMode:'INTERNAL_APPROVED',dataCleanupMode:'INTERNAL_APPROVED',dataMergeMode:'INTERNAL_APPROVED'},clock);
            await app.identity.bootstrap('owner','合成证明迁移管理员',SYNTHETIC_PASSWORD);const owner=new Client(app);assert.equal((await owner.login()).status,200);sides.push({app,store,clock,owner});
        }
        const source=sides[0]!,target=sides[1]!,t=await collectionTransfer(source,join(dir,'source'));
        const input=join(dir,'input'),json=join(dir,'export.json'),key1=join(dir,'source.key'),key2=join(dir,'target.key');await mkdir(input,{mode:0o700});
        await writeFile(json,JSON.stringify(t.download.payload),{mode:0o600});await writeFile(key1,source.app.config.contactKey.toString('hex'),{mode:0o600});await writeFile(key2,target.app.config.contactKey.toString('hex'),{mode:0o600});
        const env={...process.env,DATABASE_URL_REBUILD:urls[1],ALLOW_REBUILD:'yes',REBUILD_SOURCE_CONTACT_KEY_FILE:key1,CONTACT_KEY_FILE:key2,REBUILD_MEDIA_INPUT_DIR:input,REBUILD_MEDIA_TARGET_DIR:join(dir,'target')};
        const cli=(apply:boolean)=>spawnSync('pnpm',['--silent','rebuild:json','--','--input',json,'--actor-login','owner','--expected-sha256',t.download.sha256,...(apply?['--apply']:[])],{encoding:'utf8',env,timeout:60000});
        assert.equal(cli(true).status,1);assert.equal(await target.store.client.person.count(),0);
        await writeFile(join(input,t.asset.id+'.original.bin'),t.original,{mode:0o600});await writeFile(join(input,t.asset.id+'.preview.jpg'),t.preview,{mode:0o600});
        const checked=cli(false);assert.equal(checked.status,0,checked.stderr);
        const keys={sourceContactKey:source.app.config.contactKey,targetContactKey:target.app.config.contactKey};
        const actor=await target.store.transaction(tx=>new JsonRebuild(clock,keys).actorFromTarget(tx,'owner'));
        const verified=await prepareRebuildMedia(t.download.payload,actor.workspaceId,env,true),rebuild=new JsonRebuild(clock,keys,verified);
        const fault=new FaultStore(target.store);fault.afterInsert=(table)=>{if(table==='audits')throw new AppError(503,'STORE_UNAVAILABLE','synthetic proof audit failure');};
        await assert.rejects(fault.transaction(tx=>rebuild.apply(tx,actor,t.download.payload,{requestId:randomUUID(),ip:'test'})),/synthetic proof audit/);
        assert.ok(fault.insertTrace.includes('assets'));assert.ok(fault.insertTrace.includes('personCredentials'));assert.equal(await target.store.client.mediaAsset.count(),0);assert.equal(await target.store.client.person.count(),0);
        const applied=cli(true);assert.equal(applied.status,0,applied.stderr);assert.equal(JSON.parse(applied.stdout).mediaRestored,1);
        const provider=await LocalMediaProvider.openExisting(env.REBUILD_MEDIA_TARGET_DIR),asset=(await target.store.transaction(tx=>tx.get('assets',t.asset.id)))!;
        assert.deepEqual(await provider.readOriginal(asset),t.original);assert.deepEqual(await provider.readPreview(asset),t.preview);
        const credential=(await target.store.transaction(tx=>tx.get('personCredentials',t.graph.credentialId)))!;assert.equal(credential.status,'VERIFIED');assert.equal(credential.evidenceAssetId,asset.id);
        for(const expected of t.download.payload.manifest.talent.collectionItems) {
            const actual=(await target.store.transaction(tx=>tx.get('mediaCollectionItems',expected.id)))!;
            for(const [key,value] of Object.entries(expected))assert.deepEqual((actual as unknown as Record<string,unknown>)[key],value);
        }
        assert.equal((await target.store.transaction(tx=>tx.get('mediaCollections',t.secondCollectionId)))!.status,'ARCHIVED');
        assert.equal((await target.store.transaction(tx=>tx.find('mediaCollectionTags',{tagCode:'LIFESTYLE'})))[0]!.sourceId,t.secondSource);
        assert.equal(cli(true).status,1);
        console.log('PASS collection PG: archived collection, typed role/tag/item UUIDs, cross-source tags, one shared original; source original/preview bytes verified, missing files no writes, real CLI preview/apply, DB audit rollback, private files preserved for retry, verified credential UUID and attachment retained, populated target rejects replay');
    }finally{for(const store of stores)await store.close();await rm(dir,{recursive:true,force:true});}
});
