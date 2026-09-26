import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { chmodSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Application } from '../../packages/core/src/api.ts';
import type { SafetyIntent, SafetyIntentSink } from '../../packages/core/src/safety-intent.ts';
import { MemoryStore } from '../support/memory-store.ts';
import { Client, FakeClock, SYNTHETIC_PASSWORD, sourceInput, result } from '../support/fixtures.ts';
import { SafetyJournalWriter, readSafetyJournal } from '../../apps/api/src/recovery/safety-journal.ts';

class IntentSink implements SafetyIntentSink {
    rows: SafetyIntent[] = [];
    fail = false;
    async writeAhead(intent: SafetyIntent) {
        if (this.fail) throw new Error('synthetic write-ahead failure');
        this.rows.push(structuredClone(intent));
    }
}
async function system(sink: SafetyIntentSink) {
    const store = new MemoryStore(), clock = new FakeClock();
    const app = new Application(store, {
        origin: 'https://intent.test.invalid', secureCookies: true,
        contactKey: randomBytes(32), csrfKey: randomBytes(32), recoveryEpoch: randomBytes(24).toString('hex'),
        accessMode: 'INTERNAL', dataEgressMode: 'INTERNAL_APPROVED', dataCleanupMode: 'INTERNAL_APPROVED',
        dataMergeMode: 'INTERNAL_APPROVED', environment: 'test'
    }, clock, sink);
    await app.identity.bootstrap('owner','Intent Admin',SYNTHETIC_PASSWORD);
    const owner = new Client(app); assert.equal((await owner.login()).status,200);
    return {store,clock,app,owner};
}

test('DEV-09D safety-critical API fails closed before DB mutation when intent fsync fails',async()=>{
    const sink=new IntentSink(),f=await system(sink);
    const before={sources:f.store.rows('sources').length,receipts:f.store.rows('receipts').length,audits:f.store.rows('audits').length};
    sink.fail=true;
    const denied=await f.owner.cmd('POST','/sources',sourceInput());
    assert.equal(denied.status,500,JSON.stringify(denied.body));
    assert.equal(result(denied).error.code,'INTERNAL_ERROR');
    assert.deepEqual({
        sources:f.store.rows('sources').length,
        receipts:f.store.rows('receipts').length,
        audits:f.store.rows('audits').length
    },before);

    sink.fail=false;
    const created=await f.owner.cmd('POST','/sources',sourceInput());
    assert.equal(created.status,201,JSON.stringify(created.body));
    assert.equal(sink.rows.length,1);
    assert.equal(sink.rows[0]!.operation,'source.create');
    assert.equal(sink.rows[0]!.workspaceId,f.store.rows('workspaces')[0]!.id);
    assert.match(sink.rows[0]!.intentId,/^intent:/);

    const sourceId=result(created).resourceId as string;
    await f.owner.raw('GET','/sources/'+sourceId);
    assert.equal(sink.rows.length,1,'read paths must not write safety intents');

    const source=f.store.rows('sources').find(x=>x.id===sourceId)!;
    const suspended=await f.owner.cmd('POST','/sources/'+sourceId+'/suspend',{
        expectedRevision:source.revision,reason:'safety write-ahead test suspension'
    });
    assert.equal(suspended.status,200,JSON.stringify(suspended.body));
    assert.equal(sink.rows.length,2);
    assert.equal(sink.rows[1]!.operation,'source.suspend');
    assert.equal(sink.rows[1]!.resourceId,sourceId);
});

test('DEV-09D two journal writers serialize concurrent write-ahead intents into one valid chain',async()=>{
    const root=mkdtempSync(join(tmpdir(),'once-intent-lock-'));chmodSync(root,0o700);
    const path=join(root,'journal.jsonl');
    try{
        const a=await SafetyJournalWriter.open(path),b=await SafetyJournalWriter.open(path);
        const workspaceId='11111111-1111-4111-8111-111111111111';
        await Promise.all([
            a.writeAhead({intentId:'intent:'+randomUUID(),workspaceId,operation:'source.suspend',requestId:randomUUID(),resourceId:randomUUID()}),
            b.writeAhead({intentId:'intent:'+randomUUID(),workspaceId,operation:'member.disable',requestId:randomUUID(),resourceId:randomUUID()})
        ]);
        const state=await readSafetyJournal(path);
        assert.equal(state.entries.length,2);
        assert.equal(state.entries[0]!.seq,1);
        assert.equal(state.entries[1]!.seq,2);
        assert.equal(state.entries[1]!.prevHash,state.entries[0]!.hash);
        assert.ok(state.entries.every(x=>x.action.startsWith('intent.')));
    }finally{rmSync(root,{recursive:true,force:true});}
});
