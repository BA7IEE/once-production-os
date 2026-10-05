/** Owned fresh PG and Chromium. The model adapter is controlled; no provider call. */
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {PrismaClient} from '@prisma/client';
import {chromium} from 'playwright';
import {run} from '../../scripts/resource-lifecycle.mjs';
import {registeredTemp} from '../../scripts/registered-temp.mjs';
import {registeredBrowser} from '../../scripts/registered-browser.mjs';
import {verifyAiBrowser} from './ai-business.mjs';
assert.equal(process.env.ALLOW_BROWSER_TESTS,'yes');assert.ok(process.env.ONCE_RESOURCE_RUN_DIR);
const raw=process.env.DATABASE_URL_TEST;assert.ok(raw);assert.match(new URL(raw).pathname,/^\/once_test_[a-z0-9_]+$/);
const prisma=new PrismaClient({datasources:{db:{url:raw}},log:[]}),temp=registeredTemp(),password='Synthetic-'+randomBytes(20).toString('base64url')+'!';
const file=(name,text)=>{const path=join(temp.path,name);writeFileSync(path,text,{mode:0o600});return path;};
const env={...process.env,DATABASE_URL:raw,APP_ENV:'test',ACCESS_MODE:'INTERNAL',COOKIE_SECURE:'false',APP_ORIGIN:'http://127.0.0.1',CONTACT_KEY_FILE:file('contact',randomBytes(32).toString('hex')),CSRF_KEY_FILE:file('csrf',randomBytes(32).toString('hex')),RECOVERY_EPOCH_FILE:file('epoch',randomBytes(24).toString('hex')),BOOTSTRAP_LOGIN:'owner',BOOTSTRAP_NAME:'合成AI验收管理员',BOOTSTRAP_PASSWORD_FILE:file('password',password)};
let browserOwner;
try {
 assert.equal((await prisma.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname='public'")).length,0);
 await run('pnpm',['db:deploy'],{env,capture:true});await run(process.execPath,['dist/apps/api/src/bootstrap.js'],{env,capture:true});
 browserOwner=await registeredBrowser(chromium,{headless:true,env:{...process.env,TMPDIR:temp.path}});
 await verifyAiBrowser({prisma,browser:browserOwner.browser,env,password});
 mkdirSync('artifacts/flow-review',{recursive:true});writeFileSync('artifacts/flow-review/ai-browser.json',JSON.stringify({head:process.env.ONCE_ACCEPTANCE_SHA,status:'BROWSER_TESTED',database:'PostgreSQL16',provider:'CONTROLLED_TEST_ADAPTER',providerVerified:'NOT_RUN'})+'\n');
} finally {try{await browserOwner?.close();}finally{try{await prisma.$disconnect();}finally{temp.cleanup();}}}
