import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {PrismaClient} from '@prisma/client';

assert.equal(process.env.ALLOW_DB_TESTS,'yes');assert.ok(process.env.ONCE_RESOURCE_RUN_DIR);
const raw=process.env.DATABASE_URL_TEST;assert.ok(raw);const url=new URL(raw);
assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname));assert.match(url.pathname,/^\/once_test_[a-z0-9_]+$/);assert.ok(url.username&&url.password&&!url.search&&!url.hash);
const db=new PrismaClient({datasources:{db:{url:raw}},log:[]});
try{assert.equal((await db.$queryRawUnsafe("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).length,0);}finally{await db.$disconnect();}
for(const [cmd,args] of [['pnpm',['db:deploy']],['node',['--experimental-strip-types','--test','--test-concurrency=1','tests/verification/cos-purge-pg-20261109.test.ts']]]){
 const result=spawnSync(cmd,args,{encoding:'utf8',env:process.env,timeout:120000});
 const redact=value=>String(value??'').replaceAll(raw,'[redacted-db-url]').replaceAll(decodeURIComponent(url.password),'[redacted-db-password]');
 if(cmd==='node'||result.status!==0){process.stdout.write(redact(result.stdout));process.stderr.write(redact(result.stderr));}
 else console.log('Disposable empty database migration: PASS');
 assert.equal(result.status,0,'Owned isolated fixture command failed');
}
