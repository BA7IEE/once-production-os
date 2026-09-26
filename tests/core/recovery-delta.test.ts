import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SafetyJournalWriter, readSafetyJournal } from '../../apps/api/src/recovery/safety-journal.ts';
import { analyzeSafetyDeltas } from '../../apps/api/src/recovery/delta-resolution.ts';
import type { SafetyIntent } from '../../packages/core/src/safety-intent.ts';
import type { AuditEvent } from '../../packages/core/src/model.ts';

function root() {
    const path=mkdtempSync(join(tmpdir(),'once-delta-resolution-'));chmodSync(path,0o700);return path;
}
function intent(operation: string, resourceId=randomUUID()): SafetyIntent {
    return {
        intentId:'intent:'+randomUUID(),workspaceId:'11111111-1111-4111-8111-111111111111',
        operation,requestId:randomUUID(),resourceId
    };
}
function audit(operation:string,resourceId:string,at='2026-09-26T10:00:00.000Z'): AuditEvent {
    return {
        id:randomUUID(),workspaceId:'11111111-1111-4111-8111-111111111111',
        createdAt:at,updatedAt:at,revision:1,actorId:'22222222-2222-4222-8222-222222222222',
        action:operation,resourceKind:'test',resourceId,changedFields:['status'],requestId:randomUUID()
    };
}

test('DEV-09E aborted intent resolves as NO_COMMIT and covers every post-backup journal row',async()=>{
    const dir=root(),path=join(dir,'journal.jsonl');
    try{
        const writer=await SafetyJournalWriter.open(path),anchor=writer.snapshot().sequence;
        const i=intent('member.disable');
        await writer.writeAhead(i);await writer.aborted(i);
        const report=analyzeSafetyDeltas(await readSafetyJournal(path),anchor);
        assert.equal(report.postBackupEntries,2);
        assert.equal(report.unresolved,0);
        assert.equal(report.items.length,1);
        assert.equal(report.items[0]!.state,'ABORTED');
        assert.equal(report.items[0]!.resolution,'NO_COMMIT');
        assert.deepEqual(report.items[0]!.evidenceSeqs,[1,2]);
    }finally{rmSync(dir,{recursive:true,force:true});}
});

test('DEV-09E committed prepare-contained delta plus delayed audit is fully resolved',async()=>{
    const dir=root(),path=join(dir,'journal.jsonl');
    try{
        const writer=await SafetyJournalWriter.open(path),anchor=writer.snapshot().sequence;
        const sourceId=randomUUID(),i=intent('source.suspend',sourceId);
        await writer.writeAhead(i);await writer.committed(i,sourceId);
        await writer.append([audit('source.suspend',sourceId)]);
        const report=analyzeSafetyDeltas(await readSafetyJournal(path),anchor);
        assert.equal(report.unresolved,0);
        assert.equal(report.resolved,2);
        assert.equal(report.items[0]!.resolution,'CONTAINED_BY_PREPARE');
        assert.equal(report.items[1]!.resolution,'SUPPLEMENTAL_AUDIT');
        assert.deepEqual([...new Set(report.items.flatMap(x=>x.evidenceSeqs))],[1,2,3]);
    }finally{rmSync(dir,{recursive:true,force:true});}
});

test('DEV-09E committed non-contained mutation remains blocker',async()=>{
    const dir=root(),path=join(dir,'journal.jsonl');
    try{
        const writer=await SafetyJournalWriter.open(path),anchor=writer.snapshot().sequence;
        const memberId=randomUUID(),i=intent('member.disable',memberId);
        await writer.writeAhead(i);await writer.committed(i,memberId);
        await writer.append([audit('member.disable',memberId)]);
        const report=analyzeSafetyDeltas(await readSafetyJournal(path),anchor);
        assert.equal(report.unresolved,1);
        assert.equal(report.items.find(x=>x.state==='COMMITTED')!.reasonCode,'COMMITTED_REPLAY_REQUIRED');
        assert.equal(report.items.find(x=>x.state==='AUDIT_ONLY')!.resolution,'SUPPLEMENTAL_AUDIT');
    }finally{rmSync(dir,{recursive:true,force:true});}
});

test('DEV-09E missing completion marker and missing write-ahead intent are blockers',async()=>{
    const dir=root(),path=join(dir,'journal.jsonl');
    try{
        const writer=await SafetyJournalWriter.open(path);
        const first=intent('source.suspend',randomUUID());
        const anchor=writer.snapshot().sequence;
        await writer.writeAhead(first);
        let report=analyzeSafetyDeltas(await readSafetyJournal(path),anchor);
        assert.equal(report.unresolved,1);
        assert.equal(report.items[0]!.reasonCode,'MISSING_COMPLETION_MARKER');

        const second=intent('source.suspend',randomUUID());
        await writer.committed(second,second.resourceId);
        report=analyzeSafetyDeltas(await readSafetyJournal(path),anchor);
        assert.ok(report.items.some(x=>x.reasonCode==='MISSING_INTENT'));
    }finally{rmSync(dir,{recursive:true,force:true});}
});

test('DEV-09E pre-backup intent with post-backup contained commit is resolved',async()=>{
    const dir=root(),path=join(dir,'journal.jsonl');
    try{
        const writer=await SafetyJournalWriter.open(path);
        const sourceId=randomUUID(),i=intent('source.suspend',sourceId);
        await writer.writeAhead(i);
        const anchor=writer.snapshot().sequence;
        await writer.committed(i,sourceId);
        const report=analyzeSafetyDeltas(await readSafetyJournal(path),anchor);
        assert.equal(report.postBackupEntries,1);
        assert.equal(report.unresolved,0);
        assert.equal(report.items[0]!.resolution,'CONTAINED_BY_PREPARE');
        assert.deepEqual(report.items[0]!.evidenceSeqs,[2]);
    }finally{rmSync(dir,{recursive:true,force:true});}
});

test('DEV-09E delayed audit after pre-backup commit is supplemental, not a false delta',async()=>{
    const dir=root(),path=join(dir,'journal.jsonl');
    try{
        const writer=await SafetyJournalWriter.open(path);
        const sourceId=randomUUID(),i=intent('source.suspend',sourceId);
        await writer.writeAhead(i);await writer.committed(i,sourceId);
        const anchor=writer.snapshot().sequence;
        await writer.append([audit('source.suspend',sourceId)]);
        const report=analyzeSafetyDeltas(await readSafetyJournal(path),anchor);
        assert.equal(report.postBackupEntries,1);
        assert.equal(report.unresolved,0);
        assert.equal(report.items[0]!.resolution,'SUPPLEMENTAL_AUDIT');
    }finally{rmSync(dir,{recursive:true,force:true});}
});

test('DEV-09E completion marker cannot precede its write-ahead intent',async()=>{
    const dir=root(),path=join(dir,'journal.jsonl');
    try{
        const writer=await SafetyJournalWriter.open(path),i=intent('source.suspend',randomUUID());
        const anchor=writer.snapshot().sequence;
        await writer.committed(i,i.resourceId);
        await writer.writeAhead(i);
        assert.throws(()=>analyzeSafetyDeltas(writer.state,anchor));
    }finally{rmSync(dir,{recursive:true,force:true});}
});

test('DEV-09E unmatched audit and contradictory commit+abort markers are rejected conservatively',async()=>{
    const dir=root(),path=join(dir,'journal.jsonl');
    try{
        const writer=await SafetyJournalWriter.open(path),anchor=writer.snapshot().sequence;
        await writer.append([audit('member.disable',randomUUID())]);
        let report=analyzeSafetyDeltas(await readSafetyJournal(path),anchor);
        assert.equal(report.unresolved,1);
        assert.equal(report.items[0]!.reasonCode,'UNMATCHED_COMMITTED_AUDIT');

        const i=intent('source.suspend',randomUUID());
        await writer.writeAhead(i);await writer.committed(i,i.resourceId);await writer.aborted(i);
        assert.throws(()=>analyzeSafetyDeltas(writer.state,anchor));
    }finally{rmSync(dir,{recursive:true,force:true});}
});
