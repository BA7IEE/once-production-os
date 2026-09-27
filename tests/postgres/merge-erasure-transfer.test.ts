import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {PrismaStore} from '../../apps/api/src/prisma-store.ts';
import {Application} from '../../packages/core/src/api.ts';
import {FakeClock,Client,SYNTHETIC_PASSWORD} from '../support/fixtures.ts';
import {roundTripErasedHistory} from '../support/merge-erasure-transfer.ts';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
test('TD2 PostgreSQL redacted merge-history export and real CLI rebuild preserve erased minimal headers, original evidence and audit rollback',async()=>{
 assert.equal(process.env.ALLOW_TD2_DB_TESTS,'yes');const urls=[process.env.DATABASE_URL_TD2_TEST,process.env.DATABASE_URL_TALENT_REBUILD_TEST];assert.notEqual(urls[0],urls[1]);
 for(const raw of urls){assert.ok(raw);const u=new URL(raw);assert.ok(['postgres:','postgresql:'].includes(u.protocol));assert.ok(['127.0.0.1','localhost','[::1]'].includes(u.hostname));assert.match(u.pathname,/^\/once_(test_td2|rebuild)_[a-z0-9_]+$/);assert.equal(u.search,'');assert.equal(u.hash,'');}
 const stores=urls.map(url=>new PrismaStore(new PrismaClient({datasources:{db:{url}},log:[]}))),clock=new FakeClock(),tmp=mkdtempSync(join(tmpdir(),'once-erased-history-rebuild-'));
 try{
  const sides=[];for(const store of stores){assert.equal(await store.client.workspace.count(),0);const app=new Application(store,{origin:'https://retained.test.invalid',secureCookies:true,contactKey:randomBytes(32),csrfKey:randomBytes(32),recoveryEpoch:randomBytes(24).toString('hex'),accessMode:'INTERNAL',environment:'test',dataEgressMode:'INTERNAL_APPROVED',dataCleanupMode:'INTERNAL_APPROVED',dataMergeMode:'INTERNAL_APPROVED'},clock);await app.identity.bootstrap('owner','合成已删来源保留资料重建',SYNTHETIC_PASSWORD);const owner=new Client(app);assert.equal((await owner.login()).status,200);sides.push({app,store,clock,owner});}
  await roundTripErasedHistory(sides[0]!,sides[1]!,async(payload,sha256)=>{
   const path=join(tmp,'retained.json');writeFileSync(path,JSON.stringify(payload),{mode:0o600});
   for(const apply of [false,true]){const run=spawnSync('pnpm',['--silent','rebuild:json','--','--input',path,'--actor-login','owner','--expected-sha256',sha256,...(apply?['--apply']:[])],{encoding:'utf8',env:{...process.env,DATABASE_URL_REBUILD:urls[1],ALLOW_REBUILD:'yes'},timeout:60000});assert.equal(run.status,0,run.stderr);const result=JSON.parse(run.stdout);assert.equal(result.mergeHistory.erasures,3);assert.equal(result.counts.sources,2);}
  });
  console.log('PASS v14 PG: actual CLI preview/apply restores only erased identity header, aliases, original merge choices and explicit erasure attribution; retired profile payload absent; SQL shape and immutable records preserved; audit rollback/retry');
 }finally{for(const store of stores)await store.close();rmSync(tmp,{recursive:true,force:true});}
});
