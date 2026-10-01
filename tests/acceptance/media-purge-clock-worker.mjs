/** Test-only process: no HTTP clock override is installed in the application. */
import assert from 'node:assert/strict';
import {PrismaStore} from '../../dist/apps/api/src/prisma-store.js';
import {Application} from '../../dist/packages/core/src/api.js';
import {loadConfig} from '../../dist/apps/api/src/config.js';
import {configuredMediaProvider} from '../../dist/apps/api/src/media/cos-provider.js';
import {MediaPurgeWorker} from '../../dist/apps/api/src/media/purge-worker.js';
import {SafetyJournalWriter} from '../../dist/apps/api/src/recovery/safety-journal.js';
assert.equal(process.env.ALLOW_BROWSER_TESTS,'yes');assert.match(new URL(process.env.DATABASE_URL).pathname,/^\/once_test_/);const time=Date.parse(process.argv[2]);assert.ok(Number.isFinite(time));
const store=new PrismaStore();try{const config=loadConfig(),clock={now:()=>new Date(time)},app=new Application(store,config,clock),provider=await configuredMediaProvider();assert.ok(provider);const journal=await SafetyJournalWriter.open(process.env.SAFETY_JOURNAL_FILE);const worker=new MediaPurgeWorker(app,provider,journal);assert.equal(await worker.cycle(new AbortController().signal,true),true);console.log('Controlled-clock real purge worker finished');}finally{await store.close();}
