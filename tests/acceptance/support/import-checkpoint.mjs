import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';

/** Read-only test helper. The caller must stop its Worker before capturing a snapshot.
 * Only used against the explicitly isolated synthetic acceptance database.
 * Sessions and audit events are intentionally excluded: rejection may audit an attempt.
 */
export async function captureImportCheckpoint(db, jobId) {
    const job = await db.durableJob.findUniqueOrThrow({ where: { id: jobId } });
    const batch = await db.importBatch.findUniqueOrThrow({ where: { id: job.aggregateId } });
    assert.equal(job.workspaceId, batch.workspaceId, 'Checkpoint workspace mismatch');
    assert.equal(job.aggregateId, batch.id, 'Checkpoint batch mismatch');
    const people = await db.person.findMany({
        where: { workspaceId: job.workspaceId, sourceId: batch.sourceId }, orderBy: { id: 'asc' }
    });
    const receipts = await db.commandReceipt.findMany({
        where: { workspaceId: job.workspaceId, operation: 'job.resume', resourceId: job.id }, orderBy: { id: 'asc' }
    });
    return structuredClone({ job, batch, people, receipts });
}

export function assertImportCheckpointUnchanged(before, after, scenario) {
    // Do not include source text, row payloads or credentials in assertion error output.
    assert.ok(isDeepStrictEqual(before, after),
        `${scenario}: denied resume changed the job, batch, people or command receipts`);
}
