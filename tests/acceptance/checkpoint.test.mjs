import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureImportCheckpoint, assertImportCheckpointUnchanged } from './support/import-checkpoint.mjs';

function fixture() {
    return {
        job: { id: 'job', aggregateId: 'batch', workspaceId: 'ws', state: 'FAILED', revision: 3,
            attempts: 1, leaseToken: null, leaseUntil: null, selectedRows: [0, 1], errorCode: 'STORE_BUSY' },
        batch: { id: 'batch', workspaceId: 'ws', sourceId: 'source', revision: 3, sourceRevision: 1,
            rows: [{ state: 'IMPORTED', personId: 'first' }, { state: 'VALID', personId: null }] },
        people: [{ id: 'first', revision: 1, intro: 'synthetic-private-text' }], receipts: []
    };
}

test('identical detached snapshots pass', () => {
    const before = fixture(); assertImportCheckpointUnchanged(before, structuredClone(before), 'positive');
});

const mutations = {
    'job state': x => { x.job.state = 'QUEUED'; },
    'job revision': x => { x.job.revision++; },
    'claim attempts': x => { x.job.attempts++; },
    'lease token': x => { x.job.leaseToken = 'synthetic-lease'; },
    'lease deadline': x => { x.job.leaseUntil = '2030-01-01T00:00:00Z'; },
    'selected rows': x => { x.job.selectedRows = [1]; },
    'error code': x => { x.job.errorCode = null; },
    'batch revision': x => { x.batch.revision++; },
    'source revision': x => { x.batch.sourceRevision++; },
    'row state': x => { x.batch.rows[1].state = 'IMPORTED'; },
    'row entity reference': x => { x.batch.rows[0].personId = 'replacement'; },
    'second person inserted': x => { x.people.push({ id: 'second', revision: 1 }); },
    'first person changed': x => { x.people[0].intro = 'changed-private-text'; },
    'receipt inserted': x => { x.receipts.push({ id: 'receipt' }); }
};
for (const [name, mutate] of Object.entries(mutations)) {
    test(`negative control rejects ${name} without dumping payloads`, () => {
        const before = fixture(); const after = structuredClone(before); mutate(after);
        assert.throws(() => assertImportCheckpointUnchanged(before, after, 'negative-control'), error => {
            assert.match(error.message, /denied resume changed/);
            assert.ok(!error.message.includes('private-text'));
            assert.equal(typeof error.actual, 'boolean');
            return true;
        });
    });
}

test('capture reads only the target batch/source/job receipt and detaches the result', async () => {
    const state = fixture(); const calls = [];
    const db = {
        durableJob: { findUniqueOrThrow: async query => { calls.push(['job', query]); return state.job; } },
        importBatch: { findUniqueOrThrow: async query => { calls.push(['batch', query]); return state.batch; } },
        person: { findMany: async query => { calls.push(['people', query]); return state.people; } },
        commandReceipt: { findMany: async query => { calls.push(['receipts', query]); return state.receipts; } }
    };
    const actual = await captureImportCheckpoint(db, 'job');
    assert.deepEqual(actual, state);
    assert.deepEqual(calls, [
        ['job', { where: { id: 'job' } }], ['batch', { where: { id: 'batch' } }],
        ['people', { where: { workspaceId: 'ws', sourceId: 'source' }, orderBy: { id: 'asc' } }],
        ['receipts', { where: { workspaceId: 'ws', operation: 'job.resume', resourceId: 'job' }, orderBy: { id: 'asc' } }]
    ]);
    state.batch.rows[1].state = 'IMPORTED';
    assert.equal(actual.batch.rows[1].state, 'VALID');
});

test('capture rejects a cross-workspace fixture', async () => {
    const state = fixture(); state.batch.workspaceId = 'other';
    const db = { durableJob: { findUniqueOrThrow: async () => state.job },
        importBatch: { findUniqueOrThrow: async () => state.batch } };
    await assert.rejects(captureImportCheckpoint(db, 'job'), /workspace mismatch/);
});
