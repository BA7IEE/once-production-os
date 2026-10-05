import {registeredTemp} from '../../scripts/registered-temp.mjs';
/** Two independent fresh PostgreSQL databases: actual controlled export -> typed rebuild. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaStore } from '../../apps/api/src/prisma-store.ts';
import { Application } from '../../packages/core/src/api.ts';
import { FakeClock, Client, SYNTHETIC_PASSWORD } from '../support/fixtures.ts';
import { roundTripTransfer } from '../support/talent-transfer.ts';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('TD2 PostgreSQL controlled multi-source export and isolated typed rebuild preserve UUIDs and roll back audit failure',async()=>{
    assert.equal(process.env.ALLOW_TD2_DB_TESTS,'yes');
    const urls=[process.env.DATABASE_URL_TD2_TEST,process.env.DATABASE_URL_TALENT_REBUILD_TEST];
    assert.notEqual(urls[0],urls[1]);
    for(const raw of urls){assert.ok(raw);const u=new URL(raw);assert.ok(['postgres:','postgresql:'].includes(u.protocol));assert.ok(['127.0.0.1','localhost','[::1]'].includes(u.hostname));assert.match(u.pathname,/^\/once_(test_td2|rebuild)_[a-z0-9_]+$/);assert.equal(u.search,'');assert.equal(u.hash,'');}
    const stores=urls.map(url=>new PrismaStore(new PrismaClient({datasources:{db:{url}},log:[]})));
    const clock=new FakeClock();const tmp=registeredTemp().path;
    try {
        const sides=[];
        for(const store of stores){
            assert.equal(await store.client.workspace.count(),0);
            const app=new Application(store,{origin:'https://transfer.test.invalid',secureCookies:true,contactKey:randomBytes(32),csrfKey:randomBytes(32),recoveryEpoch:randomBytes(24).toString('hex'),accessMode:'INTERNAL',environment:'test',dataEgressMode:'INTERNAL_APPROVED',dataCleanupMode:'INTERNAL_APPROVED',dataMergeMode:'INTERNAL_APPROVED'},clock);
            await app.identity.bootstrap('owner','合成专业迁移管理员',SYNTHETIC_PASSWORD);const owner=new Client(app);assert.equal((await owner.login()).status,200);sides.push({app,store,clock,owner});
        }
        const sourceKey=join(tmp,'source.key'),targetKey=join(tmp,'target.key');
        writeFileSync(sourceKey,sides[0]!.app.config.contactKey.toString('hex'),{mode:0o600});writeFileSync(targetKey,sides[1]!.app.config.contactKey.toString('hex'),{mode:0o600});
        const keyEnv={REBUILD_SOURCE_CONTACT_KEY_FILE:sourceKey,CONTACT_KEY_FILE:targetKey};
        const transfer=await roundTripTransfer(sides[0]!,{...sides[1]!,apply:async(payload,sha256)=>{
            const input=join(tmp,'apply.json');writeFileSync(input,JSON.stringify(payload),{mode:0o600});
            const wrongKey=join(tmp,'wrong.key');writeFileSync(wrongKey,randomBytes(32).toString('hex'),{mode:0o600});
            const denied=spawnSync('pnpm',['--silent','rebuild:json','--','--input',input,'--actor-login','owner','--expected-sha256',sha256,'--apply'],{encoding:'utf8',env:{...process.env,...keyEnv,REBUILD_SOURCE_CONTACT_KEY_FILE:wrongKey,DATABASE_URL_REBUILD:urls[1],ALLOW_REBUILD:'yes'},timeout:60000});
            assert.equal(denied.status,1);assert.match(denied.stderr,/REBUILD_CREDENTIAL_DECRYPT_FAILED/);assert.equal(await stores[1]!.client.person.count(),0);
            assert.ok(!denied.stderr.includes('SYNTHETIC-PRIVATE'));
            for(const apply of [false,true]){
                const run=spawnSync('pnpm',['--silent','rebuild:json','--','--input',input,'--actor-login','owner','--expected-sha256',sha256,...(apply?['--apply']:[])],{encoding:'utf8',env:{...process.env,...keyEnv,DATABASE_URL_REBUILD:urls[1],ALLOW_REBUILD:'yes'},timeout:60000});
                assert.equal(run.status,0,run.stderr);assert.equal(JSON.parse(run.stdout).professionalRecords,19);assert.equal(JSON.parse(run.stdout).capabilityDefinitions,1);assert.equal(JSON.parse(run.stdout).organizations,1);assert.equal(JSON.parse(run.stdout).fieldEvidence,(payload as any).manifest.talent.evidence.length);
            }
        }});
        const imported=await stores[1]!.client.fieldEvidence.findFirstOrThrow({where:{originalReviewMembershipId:{not:null}}});
        const targetMembership=await stores[1]!.client.membership.findFirstOrThrow();
        await assert.rejects(stores[1]!.transaction(async tx=>{const e=(await tx.get('evidence',imported.id))!;await tx.replace('evidence',{...e,reviewerId:targetMembership.id,reviewedAt:e.originalReviewedAt!});}));
        await assert.rejects(stores[1]!.transaction(async tx=>{const e=(await tx.get('evidence',imported.id))!;await tx.replace('evidence',{...e,originalReviewMembershipId:null});}));
        assert.equal((await stores[1]!.client.fieldEvidence.findUniqueOrThrow({where:{id:imported.id}})).reviewerId,null);
        // Exact CLI parser must recognize this version and retain the populated-target guard.
        const path=join(tmp,'transfer.json');writeFileSync(path,JSON.stringify(transfer.download.payload),{mode:0o600});
        const cli=spawnSync('pnpm',['--silent','rebuild:json','--','--input',path,'--actor-login','owner','--expected-sha256',transfer.download.sha256],{encoding:'utf8',env:{...process.env,...keyEnv,DATABASE_URL_REBUILD:urls[1]},timeout:60000});
        assert.equal(cli.status,1);assert.match(cli.stderr,/REBUILD_TARGET_NOT_EMPTY/);
        console.log('PASS TD2 transfer PG: real CLI check/apply, exact source permits, typed UUID/role/measurement links, original field values, credential identifiers re-encrypted under target key and workspace, wrong key rejected without writes, unknown/cross-person references rejected, audit rollback and retry, populated target rejected, revoked source grant blocks download');
    } finally { for(const store of stores) await store.close();rmSync(tmp,{recursive:true,force:true}); }
});
