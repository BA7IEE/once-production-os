import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { digest } from '../../packages/core/src/json.ts';
import { result, sourceInput } from './fixtures.ts';
import type { Application } from '../../packages/core/src/api.ts';
import type { Store } from '../../packages/core/src/store.ts';
import type { Client } from './fixtures.ts';
export async function aiBusinessFixture(f: {
    app: Application;
    store: Store;
    owner: Client;
}) {
    const { workspace, member } = await f.store.transaction(async (tx) => ({ workspace: (await tx.find('workspaces'))[0]!, member: (await tx.find('memberships'))[0]! }));
    f.app.config.ai = { enabled: true, providerIdentityHash: digest('synthetic approved adapter only'), configRevision: 1, recoveryEpoch: workspace.recoveryEpoch, currency: 'USD', perTaskLimitUnits: 50, dailyLimitUnits: 1000, maxAttempts: 3 };
    await f.store.transaction(tx => tx.replace('memberships', { ...member, extraPermissions: [...member.extraPermissions, 'ai.use'] }));
    const text = 'Synthetic artist. Works in Shanghai. Fashion portrait portfolio.';
    const source = result(await f.owner.cmd('POST', '/sources', { ...sourceInput(), type: 'TEXT', textPayload: text })).resourceId as string;
    const gr = await f.owner.cmd('POST', '/ai-grants', { sourceId: source, expectedRevision: 1, validUntil: '2026-11-30T00:00:00.000Z', evidenceNote: 'Synthetic approval only, no external data', confirmTextOnly: true });
    assert.equal(gr.status, 201, JSON.stringify(gr.body));
    const grant = result(gr).resourceId as string;
    const person = result(await f.owner.cmd('POST', '/td2/people', { schemaVersion: 'once-talent-v2.0.0', originSourceId: source, sourceRevision: 1, displayName: 'Original artist' })).resourceId as string;
    const input = { taskType: 'extract_profile', subjectKind: 'PERSON', subjectId: person, expectedRevision: 1, locale: null, sources: [{ sourceId: source, expectedRevision: 1, grantId: grant, start: 0, end: text.length }], queryText: '', confirmMinimizedInput: true };
    const create = async (d: unknown = input) => { const r = await f.owner.cmd('POST', '/ai-jobs', d); assert.equal(r.status, 202, JSON.stringify(r.body)); return result(r).resourceId as string; };
    const dispatch = async (id: string, changes: unknown) => f.app.ai.dispatch(f.store, id, workspace.id, { send: async () => ({ amountUnits: 10, evidenceDigest: digest('synthetic usage'), output: { changes, unknowns: ['No identity verification performed'] } }) }, { requestId: randomUUID(), ip: 'test' });
    const evidence = [{ sourceId: source, start: 0, end: 17, quote: text.slice(0, 17) }];
    return { workspaceId: workspace.id, member, source, grant, person, text, input, create, dispatch, evidence };
}
export async function verifyAiBusiness(f: {
    app: Application;
    store: Store;
    owner: Client;
}) {
    const t = await aiBusinessFixture(f), id = await t.create();
    assert.equal((await t.dispatch(id, [{ field: 'displayName', value: 'Suggested artist', evidence: t.evidence }, { field: 'intro', value: 'Suggested intro', evidence: t.evidence }])).state, 'SETTLED');
    let r = await f.owner.raw('GET', '/ai-jobs/' + id);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const proposal = result(r);
    assert.equal(proposal.proposalState, 'PENDING');
    assert.equal(proposal.oldValues.displayName, 'Original artist');
    const input = { expectedRevision: proposal.revision, selectedFields: ['displayName', 'intro'] }, key = randomUUID();
    r = await f.owner.cmd('POST', '/proposals/' + id + '/apply', input, key);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal((await f.owner.cmd('POST', '/proposals/' + id + '/apply', input, key)).status, 200);
    assert.equal((await f.owner.cmd('POST', '/proposals/' + id + '/apply', input)).status, 409);
    const person = await f.store.transaction(tx => tx.get('people', t.person));
    assert.equal(person!.displayName, 'Suggested artist');
    assert.equal(person!.intro, 'Suggested intro');
    return t;
}
