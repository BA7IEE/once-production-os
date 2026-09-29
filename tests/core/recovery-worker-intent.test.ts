import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DeletionFinalizer } from '../../apps/api/src/deletion/finalizer.ts';
import type { Application } from '../../packages/core/src/api.ts';
import type { LocalMediaProvider } from '../../apps/api/src/media/local-provider.ts';
import type { SafetyIntentSink } from '../../packages/core/src/safety-intent.ts';

function fixture() {
    const calls: string[] = [];
    const core = { deletionFinalization: {
        claim: async () => ({ id: 'synthetic-claim', workspaceId: 'synthetic-workspace' }),
        mediaTasks: async () => { calls.push('tasks'); return [{ mediaId: 'synthetic-media' }]; },
        completeMediaPurge: async () => { calls.push('purge-record'); throw new Error('database unavailable after purge'); },
        finish: async () => { calls.push('finish'); },
        fail: async () => { calls.push('fail-state'); throw new Error('database still unavailable'); }
    }};
    const provider = { purge: async () => { calls.push('physical-purge'); } };
    const sink: SafetyIntentSink = {
        writeAhead: async () => { calls.push('intent'); },
        committed: async () => { calls.push('commit'); },
        aborted: async () => { calls.push('abort'); }
    };
    const finalizer = new DeletionFinalizer(core as unknown as Application,
        provider as unknown as LocalMediaProvider, sink);
    return { calls, sink, finalizer };
}

test('DEV-09E finalizer journal failure cannot mutate failure state or touch media', async () => {
    const f = fixture();
    f.sink.writeAhead = async () => { f.calls.push('intent-failed'); throw new Error('journal unavailable'); };
    await assert.rejects(f.finalizer.cycle(new AbortController().signal));
    assert.deepEqual(f.calls, ['intent-failed']);
});

test('DEV-09E physical purge followed by database failure must keep intent unresolved', async () => {
    const f = fixture();
    assert.equal(await f.finalizer.cycle(new AbortController().signal), true);
    assert.deepEqual(f.calls, ['intent', 'tasks', 'physical-purge', 'purge-record', 'fail-state']);
    assert.ok(!f.calls.includes('abort') && !f.calls.includes('commit'));
});
