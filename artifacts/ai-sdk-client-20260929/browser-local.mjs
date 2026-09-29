import {chromium} from 'playwright';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fixture,SYNTHETIC_PASSWORD} from '../../tests/support/fixtures.ts';
import {verifyAiBrowser} from '../../tests/acceptance/ai-business.mjs';
const f=await fixture(),temp=mkdtempSync(join(tmpdir(),'once-ai-browser-'));
const env={};
for(const [key,value] of [['CONTACT_KEY_FILE',f.app.config.contactKey.toString('hex')],['CSRF_KEY_FILE',f.app.config.csrfKey.toString('hex')],['RECOVERY_EPOCH_FILE',f.app.config.recoveryEpoch]]){env[key]=join(temp,key);writeFileSync(env[key],value,{mode:0o600});}
const prisma={person:{findUniqueOrThrow:async({where})=>f.store.transaction(tx=>tx.get('people',where.id))},fieldEvidence:{findMany:async({where})=>f.store.transaction(tx=>tx.find('evidence',where))}};
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{await verifyAiBrowser({prisma,browser,env,password:SYNTHETIC_PASSWORD,storeOverride:f.store});}finally{await browser.close();rmSync(temp,{recursive:true,force:true});}
