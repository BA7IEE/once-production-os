import {AppError} from '../../packages/core/src/errors.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {PrismaClient} from '@prisma/client';
import {PrismaStore} from '../../apps/api/src/prisma-store.ts';
import {Application} from '../../packages/core/src/api.ts';
import {FakeClock,Client,SYNTHETIC_PASSWORD} from '../support/fixtures.ts';
import {identityTransfer} from '../support/identity-transfer.ts';
import {JsonRebuild} from '../../packages/core/src/rebuild.ts';
import {collectTalentTransfer} from '../../packages/core/src/talent-transfer.ts';
import {FaultStore} from '../support/fault-store.ts';
test('real PostgreSQL identity-only CLI rebuild retains multi-source evidence without manufacturing a talent profile or reviewer account',async()=>{
 assert.equal(process.env.ALLOW_TD2_DB_TESTS,'yes');
 const urls=[process.env.DATABASE_URL_TD2_TEST,process.env.DATABASE_URL_TALENT_REBUILD_TEST];assert.notEqual(urls[0],urls[1]);
 for(const raw of urls){assert.ok(raw);const u=new URL(raw);assert.ok(['postgres:','postgresql:'].includes(u.protocol));assert.ok(['127.0.0.1','localhost','[::1]'].includes(u.hostname));assert.match(u.pathname,/^\/once_(test_td2|rebuild)_[a-z0-9_]+$/);assert.equal(u.search,'');assert.equal(u.hash,'');}
 const stores=urls.map(url=>new PrismaStore(new PrismaClient({datasources:{db:{url}},log:[]}))),clock=new FakeClock(),dir=await mkdtemp(join(tmpdir(),'once-identity-pg-'));
 try {
  const sides=[];for(const store of stores){assert.equal(await store.client.workspace.count(),0);const app=new Application(store,{origin:'https://identity.test.invalid',secureCookies:true,contactKey:randomBytes(32),csrfKey:randomBytes(32),recoveryEpoch:randomBytes(24).toString('hex'),accessMode:'INTERNAL',environment:'test',dataEgressMode:'INTERNAL_APPROVED'},clock);await app.identity.bootstrap('owner','合成身份迁移管理员',SYNTHETIC_PASSWORD);const owner=new Client(app);assert.equal((await owner.login()).status,200);sides.push({app,store,clock,owner});}
  const source=sides[0]!,target=sides[1]!,t=await identityTransfer(source),file=join(dir,'export.json');await writeFile(file,JSON.stringify(t.download.payload),{mode:0o600});
  const env={...process.env,DATABASE_URL_REBUILD:urls[1],ALLOW_REBUILD:'yes'};
  const cli=(apply:boolean)=>spawnSync('pnpm',['--silent','rebuild:json','--','--input',file,'--actor-login','owner','--expected-sha256',t.download.sha256,...(apply?['--apply']:[])],{encoding:'utf8',env,timeout:60000});
  const checked=cli(false);assert.equal(checked.status,0,checked.stderr);assert.equal(JSON.parse(checked.stdout).fieldEvidence,3);
  const rebuild=new JsonRebuild(clock),actor=await target.store.transaction(tx=>rebuild.actorFromTarget(tx,'owner')),fault=new FaultStore(target.store);
  fault.afterInsert=table=>{if(table==='audits')throw new AppError(503,'STORE_UNAVAILABLE','synthetic identity audit failure');};
  await assert.rejects(fault.transaction(tx=>rebuild.apply(tx,actor,t.download.payload,{requestId:randomUUID(),ip:'test'})),/synthetic identity audit/);assert.ok(fault.insertTrace.includes('evidence'));assert.equal(await target.store.client.person.count(),0);assert.equal(await target.store.client.fieldEvidence.count(),0);
  const applied=cli(true);assert.equal(applied.status,0,applied.stderr);assert.equal(await target.store.client.talentProfile.count(),0);assert.equal(await target.store.client.membership.count(),1);
  const b=t.download.payload.manifest.talent,again=await target.store.transaction(tx=>collectTalentTransfer(tx,actor,clock,[t.personId],[],false,false,false,b.identityFields));assert.deepEqual(again.identityEvidence,b.identityEvidence);
  assert.equal(cli(true).status,1);console.log('PASS identity PG: real CLI CHECK/APPLY; original person/evidence/source IDs, historical reviewer and digests retained; no extra talent or membership; audit failure rolls back and retry succeeds; nonempty target rejects replay');
 }finally{for(const store of stores)await store.close();await rm(dir,{recursive:true,force:true});}
});
