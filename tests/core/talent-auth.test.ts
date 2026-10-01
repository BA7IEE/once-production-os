import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {MemoryStore} from '../support/memory-store.ts';
import {authFixture,verifyTalentAuth,loginTalent} from '../support/talent-auth.ts';
test('PR02a authentication, isolation, stable principal, uncertainty and recovery',async()=>{const f=await authFixture(new MemoryStore());const checks=await verifyTalentAuth(f);assert.equal(checks.length,17);});
test('PR02a Talent command rolls back on audit failure',async()=>{const store=new MemoryStore(),f=await authFixture(store),a=await loginTalent(f,'rollback@example.com');const before=store.rows('talentAccounts'),key=randomUUID();store.failNextAudit=true;const headers={'idempotency-key':key,'x-once-talent-account':a.accountId};assert.equal((await a.client.raw('POST','/portal/auth/revoke-other-sessions',{},headers)).status,500);assert.deepEqual(store.rows('talentAccounts'),before);assert.equal(store.rows('receipts').filter(r=>r.commandKey===key).length,0);assert.equal((await a.client.raw('POST','/portal/auth/revoke-other-sessions',{},headers)).status,200);});
